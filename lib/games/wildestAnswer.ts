import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";

// A Quiplash-style prompt-and-vote party game (original name/content, not
// scraped from any commercial game): each round, players are randomly paired
// up (groups of 3 if the count is odd) and each pair gets a shared silly
// prompt to answer separately. Everyone *not* in a group votes anonymously on
// which of that group's answers is funniest; points are awarded per vote and
// a bonus for winning the group outright.

const WRITE_MS = 45_000;
const VOTE_MS = 20_000;
const DEFAULT_ROUNDS = 4;

const PROMPT_BANK: string[] = [
  "The worst possible name for a nightclub",
  "Something you should never say during a job interview",
  "The real reason dinosaurs went extinct",
  "A terrible tagline for a dating app",
  "What your pet is actually thinking about you",
  "The worst superpower to have at a wedding",
  "A bad excuse for being late to work",
  "The next Olympic sport nobody asked for",
  "A terrible name for a rock band",
  "What you don't want to hear from your dentist mid-appointment",
  "The least helpful piece of advice a fortune cookie could give",
  "A bad slogan for a coffee shop",
  "The worst thing to find in your soup",
  "What aliens would think if they landed at a Walmart",
  "A terrible theme for a birthday party",
  "The worst possible autocorrect fail",
  "Something a robot butler should never say",
  "The least relaxing spa treatment",
  "A bad name for a new energy drink",
  "The worst thing to hear your GPS say",
  "What your houseplants gossip about",
  "The least convincing superhero origin story",
  "A terrible name for a law firm",
  "The worst thing to yell during a game of hide and seek",
  "What cats would put in their resignation letter",
  "A bad new rule for an already-weird sport",
  "The worst possible fortune to get in a cookie",
  "Something you shouldn't say to a new in-law",
  "The least appetizing item on a food truck's menu",
  "A terrible name for a boat",
  "The worst thing your smart speaker could overhear and repeat",
  "What a gym membership commercial wouldn't dare admit",
  "The least believable excuse for missing a flight",
  "A bad name for a haunted house attraction",
  "The worst advice you could give a new parent",
  "What your car's check-engine light is really trying to say",
  "The least relaxing vacation destination",
  "A terrible pickup line for a library",
  "The worst thing to say in a wedding toast",
  "What ghosts complain about most",
  "A bad name for a superhero's sidekick",
  "The worst thing to find taped to your locker",
  "The least convincing alibi",
  "A terrible name for a perfume",
  "What your Wi-Fi router would say if it could talk",
  "The worst thing to hear a surgeon say mid-operation",
  "A bad theme for a company retreat",
  "The least helpful thing a genie could grant",
  "What dogs actually think happens when you leave the house",
  "The worst possible name for a soap opera",
  "A terrible name for a new soda flavor",
  "The least reassuring thing a pilot could say over the intercom",
  "What your refrigerator judges you for the most",
  "The worst thing to say at a funeral",
  "A bad new holiday and how it's celebrated",
  "The least convincing superhero name",
  "What a fortune teller would say to avoid a refund",
  "The worst thing to overhear your neighbors say",
  "A terrible slogan for a used car lot",
  "The least appealing flavor for ice cream",
  "What your horoscope really means",
  "The worst thing a babysitter could post about your kid",
  "A bad name for a new dating show",
  "The least convincing excuse for a typo in an email",
  "What your smartwatch secretly judges you for",
  "The worst thing to hear from a fortune-500 CEO",
  "A terrible name for a summer camp",
  "The least helpful thing to say during an earthquake",
];

// Tracks prompts already used, across games, for the lifetime of this server
// process — mirroring the freshness pattern used by Trivia Night, Family
// Feud, and Name That Tune.
const usedPrompts = new Set<string>();

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function pickPrompt(): string {
  let pool = PROMPT_BANK.filter((p) => !usedPrompts.has(p));
  if (pool.length === 0) {
    usedPrompts.clear();
    pool = PROMPT_BANK;
  }
  const prompt = pool[Math.floor(Math.random() * pool.length)]!;
  usedPrompts.add(prompt);
  return prompt;
}

// Splits players into pairs; if the count is odd, the leftover player joins
// the last pair to make a group of 3. Never produces a group of 1 (that
// would leave nobody able to vote on it) as long as there are >= 4 players.
function makeGroupings(order: PlayerId[]): PlayerId[][] {
  const shuffled = shuffle(order);
  const groups: PlayerId[][] = [];
  for (let i = 0; i < shuffled.length; i += 2) groups.push(shuffled.slice(i, i + 2));
  if (groups.length >= 2 && groups[groups.length - 1]!.length === 1) {
    const last = groups.pop()!;
    groups[groups.length - 1]!.push(...last);
  }
  return groups;
}

let groupSeq = 0;
function nextGroupId(): string {
  groupSeq += 1;
  return `g${groupSeq}`;
}

interface Group {
  id: string;
  prompt: string;
  playerIds: PlayerId[];
  answerOrder: PlayerId[]; // fixed shuffled order, used to build anonymous vote options
  answers: Record<PlayerId, string>;
  votes: Record<PlayerId, PlayerId>; // voterId -> the answer-author they voted for
}

function buildRoundGroups(playerIds: PlayerId[]): Group[] {
  return makeGroupings(playerIds).map((ids) => ({
    id: nextGroupId(),
    prompt: pickPrompt(),
    playerIds: ids,
    answerOrder: shuffle(ids),
    answers: {},
    votes: {},
  }));
}

function tallyGroup(group: Group): Record<PlayerId, number> {
  const voteCounts: Record<PlayerId, number> = {};
  for (const pid of group.playerIds) voteCounts[pid] = 0;
  for (const target of Object.values(group.votes)) voteCounts[target] = (voteCounts[target] ?? 0) + 1;
  const maxVotes = Math.max(0, ...Object.values(voteCounts));
  const gains: Record<PlayerId, number> = {};
  for (const pid of group.playerIds) {
    const v = voteCounts[pid] ?? 0;
    gains[pid] = v * 100 + (maxVotes > 0 && v === maxVotes ? 200 : 0);
  }
  return gains;
}

export type WildestAnswerPhase = "writing" | "voting" | "roundEnd" | "finished";

export interface WildestAnswerState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  roundIndex: number;
  totalRounds: number;
  groups: Group[];
  phase: WildestAnswerPhase;
  votingGroupIndex: number;
  writeEndsAt: number | null;
  voteEndsAt: number | null;
  scores: Record<PlayerId, number>;
  lastRoundGains: Record<PlayerId, number>;
  log: string[];
}

interface GroupView {
  id: string;
  prompt: string;
  memberIds: PlayerId[];
  isMine: boolean;
  revealed: boolean;
  isCurrentVote: boolean;
  youAnswered: boolean;
  voteOptions?: { optionId: string; text: string }[];
  yourVoteOptionId?: string | null;
  answers?: { playerId: PlayerId; text: string; votes: number }[];
}

export interface WildestAnswerView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  phase: WildestAnswerPhase;
  groups: GroupView[];
  writeEndsAt: number | null;
  voteEndsAt: number | null;
  scores: { playerId: PlayerId; score: number; roundGain: number }[];
}

export type WildestAnswerAction =
  | { type: "submitAnswer"; groupId: string; text: string }
  | { type: "vote"; groupId: string; optionId: string }
  | { type: "timeUp" }
  | { type: "advance" };

function beginVoting(state: WildestAnswerState): WildestAnswerState {
  return { ...state, phase: "voting", votingGroupIndex: 0, writeEndsAt: null, voteEndsAt: Date.now() + VOTE_MS };
}

function advanceVotingGroup(state: WildestAnswerState): WildestAnswerState {
  const group = state.groups[state.votingGroupIndex]!;
  const gains = tallyGroup(group);
  const scores = { ...state.scores };
  const lastRoundGains = { ...state.lastRoundGains };
  for (const [pid, pts] of Object.entries(gains)) {
    scores[pid] = (scores[pid] ?? 0) + pts;
    lastRoundGains[pid] = (lastRoundGains[pid] ?? 0) + pts;
  }
  const nextIndex = state.votingGroupIndex + 1;
  if (nextIndex >= state.groups.length) {
    return { ...state, scores, lastRoundGains, votingGroupIndex: nextIndex, phase: "roundEnd", voteEndsAt: null };
  }
  return { ...state, scores, lastRoundGains, votingGroupIndex: nextIndex, voteEndsAt: Date.now() + VOTE_MS };
}

export const wildestAnswer: GameDefinition<WildestAnswerState, WildestAnswerView, WildestAnswerAction> = {
  meta: {
    id: "wildest-answer",
    name: "Wildest Answer",
    tagline: "Everyone gets paired up with a silly prompt — write the funniest answer, then vote on everyone else's.",
    category: "party",
    minPlayers: 4,
    maxPlayers: 8,
    options: [{ key: "rounds", label: "Rounds", type: "number", min: 2, max: 8, default: DEFAULT_ROUNDS }],
  },
  createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const playerIds = players.map((p) => p.id);
    const totalRounds = Math.min(Math.max(Number(options.rounds) || DEFAULT_ROUNDS, 2), 8);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;
    return {
      hostId: host.id,
      playerIds,
      roundIndex: 0,
      totalRounds,
      groups: buildRoundGroups(playerIds),
      phase: "writing",
      votingGroupIndex: 0,
      writeEndsAt: Date.now() + WRITE_MS,
      voteEndsAt: null,
      scores,
      lastRoundGains: {},
      log: [`Round 1 of ${totalRounds} — get writing!`],
    };
  },
  applyAction(state, playerId, action) {
    if (action.type === "submitAnswer") {
      if (state.phase !== "writing") throw new GameActionError("Not accepting answers right now.");
      const group = state.groups.find((g) => g.id === action.groupId);
      if (!group || !group.playerIds.includes(playerId)) throw new GameActionError("You're not in this prompt group.");
      if (group.answers[playerId]) throw new GameActionError("You already submitted an answer.");
      const text = action.text.trim().slice(0, 140);
      if (!text) throw new GameActionError("Answer can't be empty.");
      const groups = state.groups.map((g) => (g.id === group.id ? { ...g, answers: { ...g.answers, [playerId]: text } } : g));
      let next: WildestAnswerState = { ...state, groups };
      const allAnswered = groups.every((g) => g.playerIds.every((pid) => Boolean(g.answers[pid])));
      if (allAnswered) next = beginVoting(next);
      return next;
    }

    if (action.type === "vote") {
      if (state.phase !== "voting") throw new GameActionError("Not voting right now.");
      const group = state.groups[state.votingGroupIndex];
      if (!group || group.id !== action.groupId) throw new GameActionError("Not the current voting round.");
      if (group.playerIds.includes(playerId)) throw new GameActionError("You can't vote on your own group.");
      if (group.votes[playerId]) throw new GameActionError("You already voted.");
      const answered = group.answerOrder.filter((pid) => group.answers[pid]);
      const optIndex = Number(action.optionId.replace("opt", ""));
      const target = answered[optIndex];
      if (!target) throw new GameActionError("Invalid vote.");
      const groups = state.groups.map((g) => (g.id === group.id ? { ...g, votes: { ...g.votes, [playerId]: target } } : g));
      let next: WildestAnswerState = { ...state, groups };
      const updatedGroup = groups[state.votingGroupIndex]!;
      const eligible = state.playerIds.filter((id) => !group.playerIds.includes(id));
      const allVoted = eligible.every((id) => Boolean(updatedGroup.votes[id]));
      if (allVoted) next = advanceVotingGroup(next);
      return next;
    }

    if (action.type === "timeUp") {
      if (state.phase === "writing") return beginVoting(state);
      if (state.phase === "voting") return advanceVotingGroup(state);
      throw new GameActionError("Nothing to advance.");
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextRoundIndex = state.roundIndex + 1;
      if (nextRoundIndex >= state.totalRounds) return { ...state, phase: "finished" };
      return {
        ...state,
        roundIndex: nextRoundIndex,
        groups: buildRoundGroups(state.playerIds),
        phase: "writing",
        votingGroupIndex: 0,
        writeEndsAt: Date.now() + WRITE_MS,
        voteEndsAt: null,
        lastRoundGains: {},
        log: [...state.log, `Round ${nextRoundIndex + 1} of ${state.totalRounds} — get writing!`].slice(-20),
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const groups: GroupView[] = state.groups.map((g, idx) => {
      const isMine = g.playerIds.includes(playerId);
      const revealed = state.phase === "roundEnd" || state.phase === "finished" || (state.phase === "voting" && idx < state.votingGroupIndex);
      const isCurrentVote = state.phase === "voting" && idx === state.votingGroupIndex;
      const view: GroupView = {
        id: g.id,
        prompt: g.prompt,
        memberIds: g.playerIds,
        isMine,
        revealed,
        isCurrentVote,
        youAnswered: isMine ? Boolean(g.answers[playerId]) : false,
      };
      if (isCurrentVote) {
        const answered = g.answerOrder.filter((pid) => g.answers[pid]);
        const idToOption: Record<PlayerId, string> = {};
        answered.forEach((pid, i) => (idToOption[pid] = `opt${i}`));
        if (!isMine) {
          view.voteOptions = answered.map((pid, i) => ({ optionId: `opt${i}`, text: g.answers[pid]! }));
          const myTarget = g.votes[playerId];
          view.yourVoteOptionId = myTarget ? (idToOption[myTarget] ?? null) : null;
        }
      }
      if (revealed) {
        const voteCounts: Record<PlayerId, number> = {};
        for (const pid of g.playerIds) voteCounts[pid] = 0;
        for (const target of Object.values(g.votes)) voteCounts[target] = (voteCounts[target] ?? 0) + 1;
        view.answers = g.playerIds.map((pid) => ({
          playerId: pid,
          text: g.answers[pid] ?? "(no answer submitted)",
          votes: voteCounts[pid] ?? 0,
        }));
      }
      return view;
    });
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      phase: state.phase,
      groups,
      writeEndsAt: state.writeEndsAt,
      voteEndsAt: state.voteEndsAt,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0, roundGain: state.lastRoundGains[pid] ?? 0 })),
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
