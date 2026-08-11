import { GameActionError, GameDefinition, PlayerId } from "@/lib/types";

// A Fibbage/Family-Feud-style party game: everyone writes a convincing fake
// answer to an obscure trivia prompt, then votes on which answer (among the
// fakes + the real one) they believe is true. Points for fooling others and
// for finding the truth.

interface Question {
  prompt: string;
  answer: string;
}

const QUESTION_BANK: Question[] = [
  { prompt: "According to Guinness World Records, what is the longest recorded duration of a hiccuping fit?", answer: "68 years" },
  { prompt: "What everyday object did NASA originally develop as a way to keep astronauts' drinks from floating away?", answer: "The Snoopy straw cap" },
  { prompt: "What was the first product ever sold with a barcode?", answer: "A pack of Wrigley's chewing gum" },
  { prompt: "In Finland, what unusual sport involves carrying your spouse over an obstacle course?", answer: "Wife-carrying" },
  { prompt: "What common fear does the word 'coulrophobia' describe?", answer: "Fear of clowns" },
  { prompt: "What was the original name of the search engine that became Google?", answer: "BackRub" },
  { prompt: "How many hearts does an octopus have?", answer: "Three" },
  { prompt: "What country invented the paper napkin?", answer: "China" },
  { prompt: "What is the only mammal capable of true flight?", answer: "The bat" },
  { prompt: "What was banned in Iceland from 1915 to 1989?", answer: "Beer" },
  { prompt: "According to a popular urban myth turned fact, how many times does the average person's heart beat in a lifetime?", answer: "About 2.5 billion" },
  { prompt: "What fruit is technically classified as a giant berry?", answer: "The banana" },
  { prompt: "What was the world's first webcam pointed at?", answer: "A coffee pot" },
  { prompt: "What percentage of the Earth's fresh water is locked in glaciers and ice caps?", answer: "About 68%" },
  { prompt: "What everyday item did Thomas Edison invent besides the light bulb, mostly forgotten today?", answer: "The talking doll" },
  { prompt: "What animal's fingerprints are so similar to a human's that they've confused crime scene investigators?", answer: "The koala" },
  { prompt: "What is a group of flamingos called?", answer: "A flamboyance" },
  { prompt: "What was the most shoplifted book in the world for decades, according to booksellers?", answer: "The Guinness Book of Records" },
];

export type BluffPhase = "answering" | "voting" | "reveal" | "finished";

interface Option {
  id: string;
  text: string;
  isTruth: boolean;
  authorId: PlayerId | null;
}

export interface BluffTriviaState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  questions: Question[];
  roundIndex: number;
  totalRounds: number;
  phase: BluffPhase;
  submissions: Record<PlayerId, string>;
  options: Option[];
  votes: Record<PlayerId, string>; // playerId -> optionId
  scores: Record<PlayerId, number>;
  lastRoundScoring: { playerId: PlayerId; delta: number; reason: string }[];
}

export interface BluffTriviaView {
  hostId: PlayerId;
  prompt: string;
  roundIndex: number;
  totalRounds: number;
  phase: BluffPhase;
  yourSubmission: string | null;
  submittedCount: number;
  totalPlayers: number;
  options: { id: string; text: string }[] | null; // shuffled, anonymous, present during voting/reveal
  revealedOptions: Option[] | null; // full truth, present during reveal/finished
  voters: Record<string, PlayerId[]> | null; // optionId -> who voted for it, present during reveal/finished
  yourVote: string | null;
  votedCount: number;
  scores: { playerId: PlayerId; score: number }[];
  lastRoundScoring: { playerId: PlayerId; delta: number; reason: string }[];
}

export type BluffTriviaAction = { type: "submit"; text: string } | { type: "vote"; optionId: string } | { type: "advance" };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function currentQuestion(state: BluffTriviaState): Question {
  return state.questions[state.roundIndex]!;
}

function buildOptions(state: BluffTriviaState): Option[] {
  const q = currentQuestion(state);
  const seen = new Set<string>([q.answer.trim().toLowerCase()]);
  const options: Option[] = [{ id: "truth", text: q.answer, isTruth: true, authorId: null }];
  let n = 0;
  for (const pid of state.playerIds) {
    const text = state.submissions[pid]?.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    n += 1;
    options.push({ id: `opt${n}`, text, isTruth: false, authorId: pid });
  }
  return shuffle(options);
}

export const bluffTrivia: GameDefinition<BluffTriviaState, BluffTriviaView, BluffTriviaAction> = {
  meta: {
    id: "bluff-trivia",
    name: "Bluff Trivia",
    tagline: "Write a convincing lie, spot the truth. A Jackbox-style party game.",
    category: "party",
    minPlayers: 3,
    maxPlayers: 12,
  },
  createInitialState(players) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const questions = shuffle(QUESTION_BANK).slice(0, Math.min(8, QUESTION_BANK.length));
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;
    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      questions,
      roundIndex: 0,
      totalRounds: questions.length,
      phase: "answering",
      submissions: {},
      options: [],
      votes: {},
      scores,
      lastRoundScoring: [],
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "submit") {
      if (state.phase !== "answering") throw new GameActionError("Not accepting answers right now.");
      const text = action.text.trim().slice(0, 140);
      if (!text) throw new GameActionError("Answer can't be empty.");
      const submissions = { ...state.submissions, [playerId]: text };
      const allIn = state.playerIds.every((pid) => submissions[pid]);
      if (allIn) {
        const next = { ...state, submissions, phase: "voting" as const };
        return { ...next, options: buildOptions(next) };
      }
      return { ...state, submissions };
    }

    if (action.type === "vote") {
      if (state.phase !== "voting") throw new GameActionError("Not voting right now.");
      const option = state.options.find((o) => o.id === action.optionId);
      if (!option) throw new GameActionError("Invalid option.");
      if (option.authorId === playerId) throw new GameActionError("You can't vote for your own answer.");
      const votes = { ...state.votes, [playerId]: action.optionId };
      const everyoneVoted = state.playerIds.every((pid) => votes[pid]);
      if (everyoneVoted) {
        return scoreRound({ ...state, votes });
      }
      return { ...state, votes };
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase === "answering") {
        const next = { ...state, phase: "voting" as const };
        return { ...next, options: buildOptions(next) };
      }
      if (state.phase === "voting") {
        return scoreRound(state);
      }
      if (state.phase === "reveal") {
        return nextRound(state);
      }
      throw new GameActionError("Nothing to advance.");
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const q = currentQuestion(state);
    const isVotingOrLater = state.phase === "voting" || state.phase === "reveal" || state.phase === "finished";
    const isRevealed = state.phase === "reveal" || state.phase === "finished";
    let voters: Record<string, PlayerId[]> | null = null;
    if (isRevealed) {
      voters = {};
      for (const option of state.options) voters[option.id] = [];
      for (const [pid, optionId] of Object.entries(state.votes)) {
        voters[optionId] ??= [];
        voters[optionId]!.push(pid);
      }
    }
    return {
      hostId: state.hostId,
      prompt: q.prompt,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      phase: state.phase,
      yourSubmission: state.submissions[playerId] ?? null,
      submittedCount: Object.keys(state.submissions).length,
      totalPlayers: state.playerIds.length,
      options: isVotingOrLater ? state.options.map((o) => ({ id: o.id, text: o.text })) : null,
      revealedOptions: isRevealed ? state.options : null,
      voters,
      yourVote: state.votes[playerId] ?? null,
      votedCount: Object.keys(state.votes).length,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0 })),
      lastRoundScoring: state.lastRoundScoring,
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const max = Math.max(...Object.values(state.scores));
    return Object.entries(state.scores)
      .filter(([, v]) => v === max)
      .map(([k]) => k);
  },
};

function scoreRound(state: BluffTriviaState): BluffTriviaState {
  const scores = { ...state.scores };
  const deltas: { playerId: PlayerId; delta: number; reason: string }[] = [];

  for (const pid of state.playerIds) {
    const votedOptionId = state.votes[pid];
    const votedOption = state.options.find((o) => o.id === votedOptionId);
    if (votedOption?.isTruth) {
      scores[pid] = (scores[pid] ?? 0) + 2;
      deltas.push({ playerId: pid, delta: 2, reason: "Found the truth" });
    }
  }
  for (const option of state.options) {
    if (option.isTruth || !option.authorId) continue;
    const foolCount = state.playerIds.filter((pid) => state.votes[pid] === option.id).length;
    if (foolCount > 0) {
      scores[option.authorId] = (scores[option.authorId] ?? 0) + foolCount;
      deltas.push({ playerId: option.authorId, delta: foolCount, reason: `Fooled ${foolCount} player${foolCount === 1 ? "" : "s"}` });
    }
  }

  return { ...state, phase: "reveal", scores, lastRoundScoring: deltas };
}

function nextRound(state: BluffTriviaState): BluffTriviaState {
  const nextIndex = state.roundIndex + 1;
  if (nextIndex >= state.totalRounds) {
    return { ...state, phase: "finished" };
  }
  return {
    ...state,
    roundIndex: nextIndex,
    phase: "answering",
    submissions: {},
    options: [],
    votes: {},
    lastRoundScoring: [],
  };
}
