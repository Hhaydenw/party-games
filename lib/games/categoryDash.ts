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
  "Things in a garden",
  "Types of cheese",
  "Things you'd find in a first aid kit",
  "Types of nuts",
  "Cartoon characters",
  "Things in an office",
  "Types of pasta",
  "Things you'd see at a concert",
  "Things that glow",
  "Types of boats",
  "Things in a suitcase",
  "Excuses for being late",
  "Types of candy",
  "Things you'd find under a bed",
  "Wrestling/action moves",
  "Things that are slippery",
  "National parks",
  "Types of bread",
  "Things you'd find in a junk drawer",
  "Types of hairstyles",
  "Things at a farmers market",
  "Things that come in pairs",
  "Types of festivals",
  "Things you'd bring to a potluck",
  "Reasons to call in sick",
  "Things in a science lab",
  "Ways to relax",
  "Things you'd find at a flea market",
  "Things that are transparent",
  "Karaoke songs",
  "Things a ghost might do",
  "Things you'd pack in a picnic basket",
  "Ways to travel",
  "Things that squeak",
  "Things you'd find in a treehouse",
  "Reasons to celebrate",
  "Types of markets",
  "Things that are fragile",
  "Karate/martial arts terms",
  "Emotions or feelings",
  "Breakfast foods",
  "Colors",
  "Vegetables",
  "School supplies",
  "Household pets",
  "Fictional creatures",
  "Things you'd find at the gym",
  "Fast food restaurants",
  "Things you do before bed",
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

// The "double letter" bonus is really alliteration: two (or more) separate
// words in the answer starting with the same letter, like "Boom Bap" or
// "Daffy Duck". Split on whitespace/punctuation, take each word's first
// letter, and check for any repeat. Deliberately a rough heuristic, not a
// hand-authored dictionary — that's exactly why there's a manual override
// next to it.
function hasDoubleLetterAuto(text: string): boolean {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const firstLetters = words.map((w) => w[0]);
  return new Set(firstLetters).size < firstLetters.length && firstLetters.length > 1;
}

export type CategoryDashPhase = "ready" | "writing" | "reviewing" | "voting" | "roundEnd" | "finished";

export type AnswerStatus = "empty" | "invalidLetter" | "unique" | "duplicate" | "challenged";

interface ScoredAnswer {
  playerId: PlayerId;
  text: string;
  status: AnswerStatus;
  points: number;
  challengedBy: PlayerId[];
  // Auto-detection (does the normalized answer contain two of the same
  // letter in a row, e.g. "BALLOON") can misfire on a multi-word phrase or
  // an odd normalization edge case — doubleLetterManual lets the host
  // correct it by hand instead of it just being permanently wrong for
  // that answer.
  hasDoubleLetter: boolean;
  doubleLetterManual: boolean; // true if the host has overridden the auto-detected value
  voteCount: number; // favorite-answer votes so far — live during voting, final after
  votedBy: PlayerId[];
  // Who has manually flagged this answer as a duplicate — shown/highlighted
  // the same way challengedBy is, and kept visible even once the majority
  // is reached so a vote can still be retracted (un-marked).
  duplicateMarkedBy: PlayerId[];
}

interface FavoriteVote {
  category: string;
  targetPlayerId: PlayerId;
}

export interface CategoryDashState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  totalRounds: number;
  writeMs: number;
  roundIndex: number;
  readyPlayers: PlayerId[]; // only meaningful during "ready"
  letter: string;
  categories: string[];
  phase: CategoryDashPhase;
  drafts: Record<PlayerId, Record<string, string>>; // live while writing
  answers: Record<PlayerId, Record<string, string>> | null; // frozen once writing ends
  // category -> targetPlayerId -> set of challengers, only meaningful during "reviewing"
  challenges: Record<string, PlayerId[]>;
  // category::targetPlayerId -> set of players who've manually flagged that
  // answer as a duplicate of something else even though the text itself
  // didn't auto-match — the same majority-vote pattern as challenges.
  manualDuplicateVotes: Record<string, PlayerId[]>;
  // category::targetPlayerId -> host-set override for the auto-detected
  // "does this answer have a double letter" call.
  doubleLetterOverrides: Record<string, boolean>;
  // voterId -> which specific answer they picked as their favorite —
  // only meaningful during "voting", which comes after reviewing/
  // challenges so voting only ever considers answers that survived.
  votes: Record<PlayerId, FavoriteVote>;
  writeEndsAt: number | null;
  scores: Record<PlayerId, number>;
  lastRoundGains: Record<PlayerId, number>;
  lastRoundMvpIds: PlayerId[]; // whoever's answer won the favorite-answer vote this round
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
  readyCount: number; // only meaningful during "ready"
  totalPlayersForReady: number;
  youAreReady: boolean;
  letter: string;
  categories: string[];
  phase: CategoryDashPhase;
  yourDrafts: Record<string, string>;
  submittedCount: number; // how many players have at least started this round (had any draft) — writing phase only
  totalPlayers: number;
  writeEndsAt: number | null;
  review: CategoryReviewView[] | null; // populated once writing ends
  yourVote: FavoriteVote | null; // your favorite-answer pick this round, once voting starts
  votedCount: number; // how many players have voted so far — voting phase only
  lastRoundMvpIds: PlayerId[];
  scores: { playerId: PlayerId; score: number; roundGain: number }[];
}

export type CategoryDashAction =
  | { type: "ready" }
  | { type: "setAnswer"; category: string; text: string }
  | { type: "timeUp" }
  | { type: "challenge"; category: string; targetPlayerId: PlayerId }
  | { type: "markDuplicate"; category: string; targetPlayerId: PlayerId }
  | { type: "setDoubleLetter"; category: string; targetPlayerId: PlayerId; value: boolean }
  | { type: "voteFavorite"; category: string; targetPlayerId: PlayerId }
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
      const key = challengeKey(category, pid);
      const text = (answers[pid]?.[category] ?? "").trim();
      const challengedBy = state.challenges[key] ?? [];
      const voteEntries = Object.entries(state.votes).filter(([, v]) => v.category === category && v.targetPlayerId === pid);
      const votedBy = voteEntries.map(([voterId]) => voterId);
      const voteCount = votedBy.length;
      const hasDoubleLetter = state.doubleLetterOverrides[key] ?? hasDoubleLetterAuto(text);
      const doubleLetterManual = key in state.doubleLetterOverrides;
      const manualDupBy = state.manualDuplicateVotes[key] ?? [];
      if (!text) {
        return { playerId: pid, text: "", status: "empty", points: 0, challengedBy, hasDoubleLetter: false, doubleLetterManual: false, voteCount, votedBy, duplicateMarkedBy: manualDupBy };
      }
      if (effectiveFirstLetter(text) !== state.letter) {
        return { playerId: pid, text, status: "invalidLetter", points: 0, challengedBy, hasDoubleLetter, doubleLetterManual, voteCount, votedBy, duplicateMarkedBy: manualDupBy };
      }
      const norm = normalizeForDuplicate(text);
      const autoGroupSize = groups.get(norm)?.length ?? 1;
      const manualDupSucceeded = eligibleVoters > 0 && manualDupBy.length > eligibleVoters / 2;
      const isDuplicate = autoGroupSize > 1 || manualDupSucceeded;
      const challengeSucceeded = eligibleVoters > 0 && challengedBy.length > eligibleVoters / 2;
      if (challengeSucceeded) {
        return { playerId: pid, text, status: "challenged", points: 0, challengedBy, hasDoubleLetter, doubleLetterManual, voteCount, votedBy, duplicateMarkedBy: manualDupBy };
      }
      const basePoints = isDuplicate ? 1 : 2;
      const points = hasDoubleLetter ? basePoints * 2 : basePoints;
      const status: AnswerStatus = isDuplicate ? "duplicate" : "unique";
      roundGains[pid] = (roundGains[pid] ?? 0) + points;
      return { playerId: pid, text, status, points, challengedBy, hasDoubleLetter, doubleLetterManual, voteCount, votedBy, duplicateMarkedBy: manualDupBy };
    });

    return { category, answers: scored };
  });

  return { review, roundGains };
}

// A round starts in "ready" — the letter/categories aren't picked yet, so
// there's nothing for an early clicker to get a head start thinking about.
// Everyone clicking Ready (or the host forcing it) is what actually reveals
// the round and starts the write clock, via beginWriting below.
function startRound(state: CategoryDashState, roundIndex: number): CategoryDashState {
  return {
    ...state,
    roundIndex,
    readyPlayers: [],
    letter: "",
    categories: [],
    phase: "ready",
    drafts: {},
    answers: null,
    challenges: {},
    manualDuplicateVotes: {},
    doubleLetterOverrides: {},
    votes: {},
    writeEndsAt: null,
    lastRoundGains: {},
    lastRoundMvpIds: [],
  };
}

function beginWriting(state: CategoryDashState, writeMs: number): CategoryDashState {
  return {
    ...state,
    letter: pickLetter(),
    categories: pickCategories(CATEGORIES_PER_ROUND),
    phase: "writing",
    writeEndsAt: Date.now() + writeMs,
    log: [...state.log, `Round ${state.roundIndex + 1} of ${state.totalRounds} begins!`].slice(-20),
  };
}

// Tallies the round's category points (the existing scoreRound pass) plus
// a +1 bonus for whoever's answer got picked as everyone's favorite —
// ties (more than one answer getting the single highest vote count) all
// get the bonus rather than arbitrarily picking one.
function finalizeVoting(state: CategoryDashState): CategoryDashState {
  const { roundGains } = scoreRound(state);

  const counts = new Map<string, { targetPlayerId: PlayerId; count: number }>();
  for (const vote of Object.values(state.votes)) {
    const key = challengeKey(vote.category, vote.targetPlayerId);
    const entry = counts.get(key) ?? { targetPlayerId: vote.targetPlayerId, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const maxVotes = Math.max(0, ...[...counts.values()].map((c) => c.count));
  const mvpBonus: Record<PlayerId, number> = {};
  const lastRoundMvpIds: PlayerId[] = [];
  if (maxVotes > 0) {
    for (const { targetPlayerId, count } of counts.values()) {
      if (count !== maxVotes) continue;
      mvpBonus[targetPlayerId] = (mvpBonus[targetPlayerId] ?? 0) + 1;
      lastRoundMvpIds.push(targetPlayerId);
    }
  }

  const lastRoundGains: Record<PlayerId, number> = {};
  const scores = { ...state.scores };
  for (const pid of state.playerIds) {
    const gain = (roundGains[pid] ?? 0) + (mvpBonus[pid] ?? 0);
    lastRoundGains[pid] = gain;
    scores[pid] = (scores[pid] ?? 0) + gain;
  }

  return { ...state, phase: "roundEnd", scores, lastRoundGains, lastRoundMvpIds };
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
      readyPlayers: [],
      letter: "",
      categories: [],
      phase: "ready",
      drafts: {},
      answers: null,
      challenges: {},
      manualDuplicateVotes: {},
      doubleLetterOverrides: {},
      votes: {},
      writeEndsAt: null,
      scores,
      lastRoundGains: {},
      lastRoundMvpIds: [],
      log: [],
    };
    return startRound(base, 0);
  },
  applyAction(state, playerId, action) {
    if (action.type === "ready") {
      if (state.phase !== "ready") throw new GameActionError("Not waiting to start right now.");
      if (state.readyPlayers.includes(playerId)) return state;
      const readyPlayers = [...state.readyPlayers, playerId];
      if (state.playerIds.every((pid) => readyPlayers.includes(pid))) {
        return beginWriting({ ...state, readyPlayers }, state.writeMs);
      }
      return { ...state, readyPlayers };
    }

    if (action.type === "setAnswer") {
      if (state.phase !== "writing") throw new GameActionError("Not accepting answers right now.");
      if (!state.categories.includes(action.category)) throw new GameActionError("Unknown category.");
      const text = action.text.slice(0, 40);
      const drafts = { ...state.drafts, [playerId]: { ...(state.drafts[playerId] ?? {}), [action.category]: text } };
      return { ...state, drafts };
    }

    if (action.type === "timeUp") {
      // The header's "Skip round" button (SKIPPABLE_GAMES) sends this same
      // action regardless of phase, as a host escape hatch if the game's
      // stuck waiting on someone — e.g. a straggler never clicking Ready,
      // everyone's done challenging but nobody's advancing, or voting is
      // stuck on one holdout.
      if (state.phase === "ready") return beginWriting(state, state.writeMs);
      if (state.phase === "writing") {
        return { ...state, phase: "reviewing", answers: state.drafts, writeEndsAt: null };
      }
      if (state.phase === "voting") return finalizeVoting(state);
      throw new GameActionError("Nothing to advance.");
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

    if (action.type === "markDuplicate") {
      if (state.phase !== "reviewing") throw new GameActionError("Not reviewing answers right now.");
      if (!state.categories.includes(action.category)) throw new GameActionError("Unknown category.");
      if (!state.playerIds.includes(action.targetPlayerId)) throw new GameActionError("Unknown player.");
      const key = challengeKey(action.category, action.targetPlayerId);
      const current = state.manualDuplicateVotes[key] ?? [];
      const nextVotes = current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId];
      return { ...state, manualDuplicateVotes: { ...state.manualDuplicateVotes, [key]: nextVotes } };
    }

    if (action.type === "setDoubleLetter") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can correct the double-letter call.");
      if (state.phase !== "reviewing" && state.phase !== "voting") throw new GameActionError("Not reviewing answers right now.");
      const key = challengeKey(action.category, action.targetPlayerId);
      return { ...state, doubleLetterOverrides: { ...state.doubleLetterOverrides, [key]: action.value } };
    }

    if (action.type === "voteFavorite") {
      if (state.phase !== "voting") throw new GameActionError("Not voting on favorites right now.");
      if (!state.categories.includes(action.category)) throw new GameActionError("Unknown category.");
      if (action.targetPlayerId === playerId) throw new GameActionError("You can't vote for your own answer.");
      if (!state.playerIds.includes(action.targetPlayerId)) throw new GameActionError("Unknown player.");
      const { review } = scoreRound(state);
      const cat = review.find((r) => r.category === action.category);
      const answer = cat?.answers.find((a) => a.playerId === action.targetPlayerId);
      if (!answer || (answer.status !== "unique" && answer.status !== "duplicate")) {
        throw new GameActionError("That answer isn't eligible for a vote.");
      }
      // A plain overwrite, not a toggle — picking a different answer just
      // replaces your previous pick, same as changing your mind before
      // committing. Everyone having voted auto-resolves the round; the
      // host can also force it early via "advance" (or the header's
      // universal Skip round, which reuses timeUp) if someone's stalling.
      const votes = { ...state.votes, [playerId]: { category: action.category, targetPlayerId: action.targetPlayerId } };
      let next: CategoryDashState = { ...state, votes };
      const allVoted = state.playerIds.every((pid) => Boolean(votes[pid]));
      if (allVoted) next = finalizeVoting(next);
      return next;
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase === "ready") {
        return beginWriting(state, state.writeMs);
      }
      if (state.phase === "reviewing") {
        return { ...state, phase: "voting" };
      }
      if (state.phase === "voting") {
        return finalizeVoting(state);
      }
      if (state.phase === "roundEnd") {
        const nextRound = state.roundIndex + 1;
        if (nextRound >= state.totalRounds) return { ...state, phase: "finished" };
        return startRound(state, nextRound);
      }
      throw new GameActionError("Nothing to advance.");
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const revealed = state.phase === "reviewing" || state.phase === "voting" || state.phase === "roundEnd" || state.phase === "finished";
    const { review } = revealed ? scoreRound(state) : { review: null };
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      readyCount: state.readyPlayers.length,
      totalPlayersForReady: state.playerIds.length,
      youAreReady: state.readyPlayers.includes(playerId),
      letter: state.letter,
      categories: state.categories,
      phase: state.phase,
      yourDrafts: state.drafts[playerId] ?? {},
      submittedCount: Object.values(state.drafts).filter((d) => Object.values(d).some((v) => v.trim())).length,
      totalPlayers: state.playerIds.length,
      writeEndsAt: state.writeEndsAt,
      review,
      yourVote: state.votes[playerId] ?? null,
      votedCount: Object.keys(state.votes).length,
      lastRoundMvpIds: state.lastRoundMvpIds,
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
