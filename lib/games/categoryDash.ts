import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";

// A Scattergories-style word race (original name/content, not scraped from
// any commercial game): each round gets a random letter and a handful of
// categories. Everyone races to write one word/phrase per category that
// starts with that letter before time runs out. Answers are then scored —
// unique valid answers score highest, duplicates (two+ players wrote the
// same thing) score less, and anyone can challenge an answer they think
// doesn't actually fit; if a majority of the other players agree, it's
// thrown out. No dictionary/spellcheck is involved (there's no free one
// worth wiring in) — validity is entirely peer-judged, same as how people
// actually play this at a table.

const LETTER_POOL = "ABCDEFGHIJKLMNOPRSTVW".split(""); // skip Q/U/X/Y/Z — rare enough to make rounds miserable

const CATEGORY_BANK: string[] = [
  "Animals",
  "Foods",
  "Movies",
  "Countries",
  "Things in a kitchen",
  "Sports",
  "Occupations",
  "Types of vehicles",
  "Video games",
  "Superheroes",
  "School subjects",
  "Things at the beach",
  "Musical instruments",
  "Board games",
  "Things that are cold",
  "Fictional characters",
  "Types of weather",
  "Things you'd find in a garage",
  "Drinks",
  "Cities",
  "Things in a backpack",
  "TV shows",
  "Types of dances",
  "Things at a birthday party",
  "Household chores",
  "Types of trees",
  "Things that are round",
  "Hobbies",
  "Types of shoes",
  "Things in a hospital",
  "Breeds of dogs",
  "Things you'd pack for vacation",
  "Types of pizza toppings",
  "Things in space",
  "Board/card game pieces",
  "Types of weather disasters",
  "Things at a campsite",
  "Kitchen appliances",
  "Types of music",
  "Things that fly",
  "Farm animals",
  "Things in a toolbox",
  "Types of sandwiches",
  "Winter sports",
  "Things in a classroom",
  "Insects",
  "Things that are sticky",
  "Types of jobs at a restaurant",
  "Things you'd see at a zoo",
  "Card games",
  "Things that make noise",
  "Ice cream flavors",
  "Things in a wallet or purse",
  "Types of exercise",
  "Fruits",
  "Things with wheels",
  "Halloween costumes",
  "Things you'd find at a wedding",
  "Types of soup",
  "Things in a bathroom",
  "Board game pieces or tokens",
  "Things that are heavy",
  "Types of hats",
  "Things you'd bring camping",
  "Musical genres",
  "Things at an amusement park",
  "Types of trucks",
  "Things a superhero might wear",
];

const CATEGORIES_PER_ROUND = 10;
const DEFAULT_ROUNDS = 4;
const DEFAULT_WRITE_MS = 120_000; // 10 categories instead of 6 needs a bit more time, but not a lot more

const usedCategories = new Set<string>();

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function pickCategories(count: number): string[] {
  let pool = CATEGORY_BANK.filter((c) => !usedCategories.has(c));
  if (pool.length < count) {
    usedCategories.clear();
    pool = CATEGORY_BANK;
  }
  const chosen = shuffle(pool).slice(0, count);
  for (const c of chosen) usedCategories.add(c);
  return chosen;
}

function pickLetter(): string {
  return LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)]!;
}

const LEADING_ARTICLES = /^(a|an|the)\s+/i;

// Peeling off a leading article mirrors the usual house rule ("a apple"
// still counts for A even though the real first word is "apple" — wait, no:
// "an apple" is skipped straight to "apple" which starts with A anyway; the
// rule matters more for cases like "the eiffel tower" under E). Only the
// very first word is stripped, once.
function effectiveFirstLetter(text: string): string | null {
  const trimmed = text.trim().replace(LEADING_ARTICLES, "").trim();
  const match = trimmed.match(/[a-zA-Z]/);
  return match ? match[0]!.toUpperCase() : null;
}

function normalizeForDuplicate(text: string): string {
  return text.trim().toLowerCase().replace(/^(a|an|the)\s+/i, "").replace(/[^a-z0-9]/g, "");
}

export type CategoryDashPhase = "writing" | "reviewing" | "roundEnd" | "finished";

export type AnswerStatus = "empty" | "invalidLetter" | "unique" | "duplicate" | "challenged";

interface ScoredAnswer {
  playerId: PlayerId;
  text: string;
  status: AnswerStatus;
  points: number;
  challengedBy: PlayerId[];
}

export interface CategoryDashState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  totalRounds: number;
  writeMs: number;
  roundIndex: number;
  letter: string;
  categories: string[];
  phase: CategoryDashPhase;
  drafts: Record<PlayerId, Record<string, string>>; // live while writing
  answers: Record<PlayerId, Record<string, string>> | null; // frozen once writing ends
  // category -> targetPlayerId -> set of challengers, only meaningful during "reviewing"
  challenges: Record<string, PlayerId[]>;
  writeEndsAt: number | null;
  scores: Record<PlayerId, number>;
  lastRoundGains: Record<PlayerId, number>;
  log: string[];
}

interface CategoryReviewView {
  category: string;
  answers: ScoredAnswer[];
}

export interface CategoryDashView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  letter: string;
  categories: string[];
  phase: CategoryDashPhase;
  yourDrafts: Record<string, string>;
  submittedCount: number; // how many players have at least started this round (had any draft) — writing phase only
  totalPlayers: number;
  writeEndsAt: number | null;
  review: CategoryReviewView[] | null; // populated once writing ends
  scores: { playerId: PlayerId; score: number; roundGain: number }[];
}

export type CategoryDashAction =
  | { type: "setAnswer"; category: string; text: string }
  | { type: "timeUp" }
  | { type: "challenge"; category: string; targetPlayerId: PlayerId }
  | { type: "advance" };

function challengeKey(category: string, targetPlayerId: PlayerId): string {
  return `${category}::${targetPlayerId}`;
}

// Pure scoring pass — recomputed on demand (not stored) so live challenge
// votes during "reviewing" are always reflected immediately.
function scoreRound(state: CategoryDashState): { review: CategoryReviewView[]; roundGains: Record<PlayerId, number> } {
  const roundGains: Record<PlayerId, number> = {};
  for (const pid of state.playerIds) roundGains[pid] = 0;
  const answers = state.answers ?? {};
  const eligibleVoters = state.playerIds.length - 1;

  const review: CategoryReviewView[] = state.categories.map((category) => {
    // Group by normalized text among non-empty, letter-valid answers.
    const groups = new Map<string, PlayerId[]>();
    for (const pid of state.playerIds) {
      const text = (answers[pid]?.[category] ?? "").trim();
      if (!text) continue;
      if (effectiveFirstLetter(text) !== state.letter) continue;
      const norm = normalizeForDuplicate(text);
      if (!norm) continue;
      const group = groups.get(norm) ?? [];
      group.push(pid);
      groups.set(norm, group);
    }

    const scored: ScoredAnswer[] = state.playerIds.map((pid) => {
      const text = (answers[pid]?.[category] ?? "").trim();
      const challengedBy = state.challenges[challengeKey(category, pid)] ?? [];
      if (!text) return { playerId: pid, text: "", status: "empty", points: 0, challengedBy };
      if (effectiveFirstLetter(text) !== state.letter) {
        return { playerId: pid, text, status: "invalidLetter", points: 0, challengedBy };
      }
      const norm = normalizeForDuplicate(text);
      const groupSize = groups.get(norm)?.length ?? 1;
      const challengeSucceeded = eligibleVoters > 0 && challengedBy.length > eligibleVoters / 2;
      if (challengeSucceeded) return { playerId: pid, text, status: "challenged", points: 0, challengedBy };
      const points = groupSize > 1 ? 1 : 2;
      const status: AnswerStatus = groupSize > 1 ? "duplicate" : "unique";
      roundGains[pid] = (roundGains[pid] ?? 0) + points;
      return { playerId: pid, text, status, points, challengedBy };
    });

    return { category, answers: scored };
  });

  return { review, roundGains };
}

function startRound(state: CategoryDashState, roundIndex: number, writeMs: number): CategoryDashState {
  return {
    ...state,
    roundIndex,
    letter: pickLetter(),
    categories: pickCategories(CATEGORIES_PER_ROUND),
    phase: "writing",
    drafts: {},
    answers: null,
    challenges: {},
    writeEndsAt: Date.now() + writeMs,
    lastRoundGains: {},
    log: [...state.log, `Round ${roundIndex + 1} of ${state.totalRounds} begins!`].slice(-20),
  };
}

export const categoryDash: GameDefinition<CategoryDashState, CategoryDashView, CategoryDashAction> = {
  meta: {
    id: "category-dash",
    name: "Category Dash",
    tagline: "Scattergories-style word race — same letter, different categories, unique answers score big.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 12,
    options: [
      { key: "rounds", label: "Rounds", type: "number", min: 2, max: 8, default: DEFAULT_ROUNDS },
      { key: "writeSeconds", label: "Seconds to write", type: "number", min: 30, max: 150, default: DEFAULT_WRITE_MS / 1000, step: 15 },
    ],
  },
  createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const totalRounds = Math.min(Math.max(Number(options.rounds) || DEFAULT_ROUNDS, 2), 8);
    const writeMs = Math.min(Math.max((Number(options.writeSeconds) || DEFAULT_WRITE_MS / 1000) * 1000, 30_000), 150_000);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;
    const base: CategoryDashState = {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      totalRounds,
      writeMs,
      roundIndex: 0,
      letter: "A",
      categories: [],
      phase: "writing",
      drafts: {},
      answers: null,
      challenges: {},
      writeEndsAt: null,
      scores,
      lastRoundGains: {},
      log: [],
    };
    return startRound(base, 0, writeMs);
  },
  applyAction(state, playerId, action) {
    if (action.type === "setAnswer") {
      if (state.phase !== "writing") throw new GameActionError("Not accepting answers right now.");
      if (!state.categories.includes(action.category)) throw new GameActionError("Unknown category.");
      const text = action.text.slice(0, 40);
      const drafts = { ...state.drafts, [playerId]: { ...(state.drafts[playerId] ?? {}), [action.category]: text } };
      return { ...state, drafts };
    }

    if (action.type === "timeUp") {
      if (state.phase !== "writing") throw new GameActionError("Nothing to advance.");
      return { ...state, phase: "reviewing", answers: state.drafts, writeEndsAt: null };
    }

    if (action.type === "challenge") {
      if (state.phase !== "reviewing") throw new GameActionError("Not reviewing answers right now.");
      if (!state.categories.includes(action.category)) throw new GameActionError("Unknown category.");
      if (action.targetPlayerId === playerId) throw new GameActionError("You can't challenge your own answer.");
      if (!state.playerIds.includes(action.targetPlayerId)) throw new GameActionError("Unknown player.");
      const key = challengeKey(action.category, action.targetPlayerId);
      const current = state.challenges[key] ?? [];
      const nextVotes = current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId];
      return { ...state, challenges: { ...state.challenges, [key]: nextVotes } };
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase === "reviewing") {
        const { roundGains } = scoreRound(state);
        const scores = { ...state.scores };
        for (const [pid, gain] of Object.entries(roundGains)) scores[pid] = (scores[pid] ?? 0) + gain;
        return { ...state, phase: "roundEnd", scores, lastRoundGains: roundGains };
      }
      if (state.phase === "roundEnd") {
        const nextRound = state.roundIndex + 1;
        if (nextRound >= state.totalRounds) return { ...state, phase: "finished" };
        return startRound(state, nextRound, state.writeMs);
      }
      throw new GameActionError("Nothing to advance.");
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const { review } = state.phase === "reviewing" || state.phase === "roundEnd" || state.phase === "finished" ? scoreRound(state) : { review: null };
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      letter: state.letter,
      categories: state.categories,
      phase: state.phase,
      yourDrafts: state.drafts[playerId] ?? {},
      submittedCount: Object.values(state.drafts).filter((d) => Object.values(d).some((v) => v.trim())).length,
      totalPlayers: state.playerIds.length,
      writeEndsAt: state.writeEndsAt,
      review,
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
  getRanking(state) {
    return [...state.playerIds].sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  },
};
