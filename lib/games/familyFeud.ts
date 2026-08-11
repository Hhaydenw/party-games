import { GameActionError, GameDefinition, GameOptions, PlayerId, PlayerInfo } from "@/lib/types";

// A simplified Family Feud: two teams, survey questions with ranked hidden
// answers, a buzz-in face-off to win control of the board, and a steal
// mechanic. Simplification vs. the TV show: the face-off winner always plays
// (no play/pass choice), and a steal is a single shared guess for the team.

type TeamId = "A" | "B";

interface FeudAnswerDef {
  text: string;
  points: number;
  matches: string[]; // lowercase accepted variants, always includes `text`
}

interface FeudQuestionDef {
  prompt: string;
  answers: FeudAnswerDef[];
}

const QUESTION_BANK: FeudQuestionDef[] = [
  {
    prompt: "Name something you'd bring on a picnic.",
    answers: [
      { text: "Sandwiches", points: 32, matches: ["sandwiches", "sandwich", "food"] },
      { text: "Blanket", points: 26, matches: ["blanket", "picnic blanket"] },
      { text: "Drinks", points: 18, matches: ["drinks", "soda", "water", "beverages"] },
      { text: "Chips", points: 14, matches: ["chips", "snacks"] },
      { text: "Bug spray", points: 10, matches: ["bug spray", "bugspray", "insect repellent"] },
    ],
  },
  {
    prompt: "Name a reason someone would be late to work.",
    answers: [
      { text: "Traffic", points: 35, matches: ["traffic", "traffic jam"] },
      { text: "Overslept", points: 27, matches: ["overslept", "slept in", "alarm didn't go off"] },
      { text: "Car trouble", points: 16, matches: ["car trouble", "car broke down", "flat tire"] },
      { text: "Kids", points: 12, matches: ["kids", "children", "dropping off kids"] },
      { text: "Bad weather", points: 10, matches: ["bad weather", "weather", "storm", "snow"] },
    ],
  },
  {
    prompt: "Name something people do when they can't sleep.",
    answers: [
      { text: "Watch TV", points: 30, matches: ["watch tv", "tv", "watch television", "netflix"] },
      { text: "Scroll their phone", points: 25, matches: ["scroll phone", "phone", "scroll on phone", "social media"] },
      { text: "Count sheep", points: 18, matches: ["count sheep", "counting sheep"] },
      { text: "Read a book", points: 15, matches: ["read", "read a book", "book", "reading"] },
      { text: "Get a snack", points: 12, matches: ["snack", "get a snack", "eat"] },
    ],
  },
  {
    prompt: "Name an animal you'd see at the zoo.",
    answers: [
      { text: "Lion", points: 28, matches: ["lion"] },
      { text: "Elephant", points: 24, matches: ["elephant"] },
      { text: "Giraffe", points: 20, matches: ["giraffe"] },
      { text: "Monkey", points: 16, matches: ["monkey", "ape", "gorilla"] },
      { text: "Penguin", points: 12, matches: ["penguin"] },
    ],
  },
  {
    prompt: "Name something you take with you to the beach.",
    answers: [
      { text: "Towel", points: 30, matches: ["towel", "beach towel"] },
      { text: "Sunscreen", points: 26, matches: ["sunscreen", "sunblock"] },
      { text: "Umbrella", points: 18, matches: ["umbrella", "beach umbrella"] },
      { text: "Cooler", points: 14, matches: ["cooler", "ice chest", "drinks cooler"] },
      { text: "Sunglasses", points: 12, matches: ["sunglasses", "shades"] },
    ],
  },
  {
    prompt: "Name a job where you have to wear a uniform.",
    answers: [
      { text: "Police officer", points: 27, matches: ["police officer", "police", "cop"] },
      { text: "Nurse", points: 23, matches: ["nurse", "doctor", "medical"] },
      { text: "Firefighter", points: 19, matches: ["firefighter", "fireman", "fire fighter"] },
      { text: "Soldier", points: 17, matches: ["soldier", "military", "army"] },
      { text: "Chef", points: 14, matches: ["chef", "cook"] },
    ],
  },
  {
    prompt: "Name something you do to relax after a long day.",
    answers: [
      { text: "Take a shower/bath", points: 26, matches: ["shower", "bath", "take a shower", "take a bath"] },
      { text: "Watch TV", points: 22, matches: ["watch tv", "tv", "netflix"] },
      { text: "Nap", points: 20, matches: ["nap", "sleep", "lie down"] },
      { text: "Exercise", points: 17, matches: ["exercise", "workout", "gym", "run"] },
      { text: "Have a drink", points: 15, matches: ["drink", "have a drink", "wine", "beer", "alcohol"] },
    ],
  },
  {
    prompt: "Name something people are scared of.",
    answers: [
      { text: "Spiders", points: 29, matches: ["spiders", "spider"] },
      { text: "Heights", points: 24, matches: ["heights", "being high up"] },
      { text: "Snakes", points: 20, matches: ["snakes", "snake"] },
      { text: "The dark", points: 15, matches: ["the dark", "dark", "darkness"] },
      { text: "Public speaking", points: 12, matches: ["public speaking", "speaking in public"] },
    ],
  },
  {
    prompt: "Name a food people eat for breakfast.",
    answers: [
      { text: "Eggs", points: 28, matches: ["eggs", "egg"] },
      { text: "Cereal", points: 24, matches: ["cereal"] },
      { text: "Toast", points: 18, matches: ["toast", "bread"] },
      { text: "Pancakes", points: 16, matches: ["pancakes", "waffles"] },
      { text: "Coffee", points: 14, matches: ["coffee"] },
    ],
  },
  {
    prompt: "Name something you'd find in a junk drawer.",
    answers: [
      { text: "Batteries", points: 25, matches: ["batteries", "battery"] },
      { text: "Rubber bands", points: 22, matches: ["rubber bands", "rubber band"] },
      { text: "Old receipts", points: 19, matches: ["receipts", "old receipts", "paper"] },
      { text: "Tape", points: 18, matches: ["tape", "scotch tape"] },
      { text: "Random keys", points: 16, matches: ["keys", "random keys", "old keys"] },
    ],
  },
];

const DEFAULT_ROUNDS = 6;

export type FeudPhase = "faceoff" | "controlling" | "stealing" | "roundEnd" | "finished";

interface FeudAnswer {
  text: string;
  points: number;
  matches: string[];
  revealed: boolean;
}

interface FeudTeam {
  id: TeamId;
  name: string;
  memberIds: PlayerId[];
  score: number;
}

export interface FeudState {
  hostId: PlayerId;
  teams: Record<TeamId, FeudTeam>;
  roundIndex: number;
  totalRounds: number;
  questionOrder: number[];
  prompt: string;
  answers: FeudAnswer[];
  phase: FeudPhase;
  // Face-off is now a buzz-in: whoever's captain buzzes first gets first crack
  // at the answer; if they miss, the other captain gets a turn.
  faceoffBuzzedTeam: TeamId | null; // whose captain currently has the floor
  faceoffFirstTeam: TeamId | null; // who buzzed in first this face-off (tiebreak if both miss)
  faceoffAttempted: TeamId[]; // teams that already used their one face-off guess
  controllingTeam: TeamId | null;
  controllingIndex: number; // whose turn (index into that team's memberIds) to guess next
  stealingTeam: TeamId | null;
  strikes: number;
  pot: number;
  roundLog: string[];
  lastRoundResult: { winningTeam: TeamId | null; pot: number; reason: string } | null;
}

export interface FeudView {
  hostId: PlayerId;
  yourTeam: TeamId;
  captainA: PlayerId;
  captainB: PlayerId;
  areYouCaptain: boolean;
  teams: { id: TeamId; name: string; memberIds: PlayerId[]; score: number }[];
  roundIndex: number;
  totalRounds: number;
  prompt: string;
  answers: { index: number; text: string | null; points: number | null; revealed: boolean }[];
  phase: FeudPhase;
  faceoffBuzzedTeam: TeamId | null;
  faceoffAttempted: TeamId[];
  currentGuesserId: PlayerId | null; // whose turn it is to guess during controlling/stealing
  controllingTeam: TeamId | null;
  stealingTeam: TeamId | null;
  strikes: number;
  pot: number;
  roundLog: string[];
  lastRoundResult: FeudState["lastRoundResult"];
}

export type FeudAction = { type: "buzz" } | { type: "faceoffAnswer"; text: string } | { type: "guess"; text: string } | { type: "steal"; text: string } | { type: "advance" };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^(a|an|the)\s+/, "")
    .replace(/[^a-z0-9 ]/g, "");
}

function buildAnswers(def: FeudQuestionDef): FeudAnswer[] {
  return def.answers.map((a) => ({ text: a.text, points: a.points, matches: a.matches, revealed: false }));
}

function findMatch(text: string, answers: FeudAnswer[]): number | null {
  const guess = normalize(text);
  if (!guess) return null;
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i]!;
    if (a.revealed) continue;
    for (const variant of a.matches) {
      const v = normalize(variant);
      if (guess === v) return i;
      if (guess.length >= 4 && v.length >= 4 && (guess.includes(v) || v.includes(guess))) return i;
    }
  }
  return null;
}

function captainOf(team: FeudTeam, roundIndex: number): PlayerId {
  return team.memberIds[roundIndex % team.memberIds.length]!;
}

function startRound(state: FeudState, roundIndex: number): FeudState {
  const def = QUESTION_BANK[state.questionOrder[roundIndex]!]!;
  return {
    ...state,
    roundIndex,
    prompt: def.prompt,
    answers: buildAnswers(def),
    phase: "faceoff",
    faceoffBuzzedTeam: null,
    faceoffFirstTeam: null,
    faceoffAttempted: [],
    controllingTeam: null,
    controllingIndex: 0,
    stealingTeam: null,
    strikes: 0,
    pot: 0,
    roundLog: [`Round ${roundIndex + 1}: ${def.prompt}`],
    lastRoundResult: null,
  };
}

// Reveals every remaining hidden answer (so the board shows the full survey
// once a round is over) and banks the pot for the winning team, if any.
function endRound(state: FeudState, winningTeam: TeamId | null, reason: string): FeudState {
  const teams = { ...state.teams };
  if (winningTeam) {
    teams[winningTeam] = { ...teams[winningTeam], score: teams[winningTeam].score + state.pot };
  }
  const answers = state.answers.map((a) => (a.revealed ? a : { ...a, revealed: true }));
  return {
    ...state,
    teams,
    answers,
    phase: "roundEnd",
    lastRoundResult: { winningTeam, pot: state.pot, reason },
    roundLog: [...state.roundLog, reason],
  };
}

export const familyFeud: GameDefinition<FeudState, FeudView, FeudAction> = {
  meta: {
    id: "family-feud",
    name: "Family Feud",
    tagline: "Two teams, survey says! Face off, control the board, and steal points.",
    category: "party",
    minPlayers: 4,
    maxPlayers: 12,
    options: [{ key: "rounds", label: "Rounds", type: "number", min: 1, max: QUESTION_BANK.length, default: DEFAULT_ROUNDS }],
  },
  createInitialState(players: PlayerInfo[], options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const shuffled = shuffle(players);
    const teamA: FeudTeam = { id: "A", name: "Team Red", memberIds: [], score: 0 };
    const teamB: FeudTeam = { id: "B", name: "Team Blue", memberIds: [], score: 0 };
    shuffled.forEach((p, i) => (i % 2 === 0 ? teamA : teamB).memberIds.push(p.id));
    const roundCount = Math.min(Number(options.rounds) || DEFAULT_ROUNDS, QUESTION_BANK.length);
    const questionOrder = shuffle(QUESTION_BANK.map((_, i) => i)).slice(0, roundCount);

    const base: FeudState = {
      hostId: host.id,
      teams: { A: teamA, B: teamB },
      roundIndex: 0,
      totalRounds: questionOrder.length,
      questionOrder,
      prompt: "",
      answers: [],
      phase: "faceoff",
      faceoffBuzzedTeam: null,
      faceoffFirstTeam: null,
      faceoffAttempted: [],
      controllingTeam: null,
      controllingIndex: 0,
      stealingTeam: null,
      strikes: 0,
      pot: 0,
      roundLog: [],
      lastRoundResult: null,
    };
    return startRound(base, 0);
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");
    const yourTeam: TeamId | null = state.teams.A.memberIds.includes(playerId) ? "A" : state.teams.B.memberIds.includes(playerId) ? "B" : null;
    if (!yourTeam) throw new GameActionError("You're not on a team in this game.");

    if (action.type === "buzz") {
      if (state.phase !== "faceoff") throw new GameActionError("No face-off happening right now.");
      if (state.faceoffBuzzedTeam) throw new GameActionError("Someone already buzzed in.");
      const captain = captainOf(state.teams[yourTeam], state.roundIndex);
      if (playerId !== captain) throw new GameActionError("Only your team's face-off player can buzz in.");
      if (state.faceoffAttempted.includes(yourTeam)) throw new GameActionError("Your team already had a turn.");
      return {
        ...state,
        faceoffBuzzedTeam: yourTeam,
        faceoffFirstTeam: state.faceoffFirstTeam ?? yourTeam,
        roundLog: [...state.roundLog, `${state.teams[yourTeam].name} buzzed in first!`],
      };
    }

    if (action.type === "faceoffAnswer") {
      if (state.phase !== "faceoff") throw new GameActionError("No face-off happening right now.");
      if (state.faceoffBuzzedTeam !== yourTeam) throw new GameActionError("Buzz in first.");
      const captain = captainOf(state.teams[yourTeam], state.roundIndex);
      if (playerId !== captain) throw new GameActionError("Only your team's face-off player can answer.");
      const text = action.text.trim().slice(0, 60);
      if (!text) throw new GameActionError("Answer can't be empty.");

      const attempted = [...state.faceoffAttempted, yourTeam];
      const idx = findMatch(text, state.answers);
      const log = [...state.roundLog, `${state.teams[yourTeam].name} answered "${text}".`];

      if (idx !== null) {
        const answers = state.answers.slice();
        answers[idx] = { ...answers[idx]!, revealed: true };
        return {
          ...state,
          answers,
          faceoffAttempted: attempted,
          phase: "controlling",
          controllingTeam: yourTeam,
          controllingIndex: 0,
          pot: answers[idx]!.points,
          roundLog: [...log, `On the board! ${state.teams[yourTeam].name} takes control.`],
        };
      }

      const otherTeam: TeamId = yourTeam === "A" ? "B" : "A";
      if (!attempted.includes(otherTeam)) {
        // Not on the board — pass the floor to the other captain.
        return {
          ...state,
          faceoffBuzzedTeam: otherTeam,
          faceoffAttempted: attempted,
          roundLog: [...log, `Not on the board. ${state.teams[otherTeam].name}'s turn to answer.`],
        };
      }

      // Both teams missed — whoever buzzed in first gets control with an empty pot.
      const winner = state.faceoffFirstTeam ?? yourTeam;
      return {
        ...state,
        faceoffAttempted: attempted,
        phase: "controlling",
        controllingTeam: winner,
        controllingIndex: 0,
        pot: 0,
        roundLog: [...log, `Both teams missed. ${state.teams[winner].name} takes control.`],
      };
    }

    if (action.type === "guess") {
      if (state.phase !== "controlling") throw new GameActionError("Your team isn't in control right now.");
      if (yourTeam !== state.controllingTeam) throw new GameActionError("It's the other team's turn to guess.");
      const team = state.teams[yourTeam];
      const expectedGuesser = team.memberIds[state.controllingIndex % team.memberIds.length]!;
      if (playerId !== expectedGuesser) throw new GameActionError("It's a teammate's turn to guess.");
      const text = action.text.trim().slice(0, 60);
      if (!text) throw new GameActionError("Guess can't be empty.");
      const idx = findMatch(text, state.answers);
      const controllingIndex = state.controllingIndex + 1;

      if (idx === null) {
        const strikes = state.strikes + 1;
        const log = [...state.roundLog, `${state.teams[yourTeam].name} guessed "${text}" — strike ${strikes}!`];
        if (strikes >= 3) {
          const other: TeamId = yourTeam === "A" ? "B" : "A";
          return { ...state, strikes, controllingIndex, phase: "stealing", stealingTeam: other, roundLog: log };
        }
        return { ...state, strikes, controllingIndex, roundLog: log };
      }

      const answers = state.answers.slice();
      answers[idx] = { ...answers[idx]!, revealed: true };
      const pot = state.pot + answers[idx]!.points;
      const log = [...state.roundLog, `${state.teams[yourTeam].name} revealed "${answers[idx]!.text}" (${answers[idx]!.points} pts).`];
      const boardCleared = answers.every((a) => a.revealed);
      const next = { ...state, answers, pot, controllingIndex, roundLog: log };
      if (boardCleared) return endRound(next, yourTeam, `${state.teams[yourTeam].name} cleared the board and banks ${pot} points!`);
      return next;
    }

    if (action.type === "steal") {
      if (state.phase !== "stealing") throw new GameActionError("Not a steal opportunity right now.");
      if (yourTeam !== state.stealingTeam) throw new GameActionError("Only the stealing team can guess.");
      const text = action.text.trim().slice(0, 60);
      if (!text) throw new GameActionError("Guess can't be empty.");
      const idx = findMatch(text, state.answers);
      if (idx !== null) {
        const answers = state.answers.slice();
        answers[idx] = { ...answers[idx]!, revealed: true };
        return endRound(
          { ...state, answers },
          yourTeam,
          `${state.teams[yourTeam].name} steals with "${answers[idx]!.text}" and takes ${state.pot} points!`
        );
      }
      const controllingTeam = state.controllingTeam!;
      return endRound(state, controllingTeam, `${state.teams[yourTeam].name}'s steal attempt failed. ${state.teams[controllingTeam].name} keeps ${state.pot} points.`);
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextIndex = state.roundIndex + 1;
      if (nextIndex >= state.totalRounds) return { ...state, phase: "finished" };
      return startRound(state, nextIndex);
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const yourTeam: TeamId = state.teams.A.memberIds.includes(playerId) ? "A" : "B";
    const captainA = captainOf(state.teams.A, state.roundIndex);
    const captainB = captainOf(state.teams.B, state.roundIndex);
    const areYouCaptain = playerId === captainA || playerId === captainB;
    let currentGuesserId: PlayerId | null = null;
    if (state.phase === "controlling" && state.controllingTeam) {
      const team = state.teams[state.controllingTeam];
      currentGuesserId = team.memberIds[state.controllingIndex % team.memberIds.length]!;
    }
    return {
      hostId: state.hostId,
      yourTeam,
      captainA,
      captainB,
      areYouCaptain,
      teams: (["A", "B"] as TeamId[]).map((id) => ({ id, name: state.teams[id].name, memberIds: state.teams[id].memberIds, score: state.teams[id].score })),
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      prompt: state.prompt,
      answers: state.answers.map((a, index) => ({
        index,
        text: a.revealed ? a.text : null,
        points: a.revealed ? a.points : null,
        revealed: a.revealed,
      })),
      phase: state.phase,
      faceoffBuzzedTeam: state.faceoffBuzzedTeam,
      faceoffAttempted: state.faceoffAttempted,
      currentGuesserId,
      controllingTeam: state.controllingTeam,
      stealingTeam: state.stealingTeam,
      strikes: state.strikes,
      pot: state.pot,
      roundLog: state.roundLog.slice(-6),
      lastRoundResult: state.lastRoundResult,
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    if (state.teams.A.score === state.teams.B.score) return [...state.teams.A.memberIds, ...state.teams.B.memberIds];
    const winner = state.teams.A.score > state.teams.B.score ? state.teams.A : state.teams.B;
    return winner.memberIds;
  },
};
