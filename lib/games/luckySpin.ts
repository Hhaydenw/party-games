import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { substituteNames } from "@/lib/games/logNames";

// A Wheel-of-Fortune-style letter-guessing game (original name/content, not
// affiliated with or copied from any TV show): spin for a dollar value,
// guess a consonant — right guesses reveal it and let you spin again; a
// miss passes the turn. Buy a vowel for $250 any time it's your turn, or
// try to solve the puzzle outright. Whoever solves banks that round's
// earnings.

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const VOWEL_COST = 250;
const DEFAULT_ROUNDS = 5;

// Dollar segments plus two penalty segments — a smaller wheel than the real
// show's ~24 wedges, but the same flavor (mostly cash, occasional trap).
export type WheelSegment = number | "BANKRUPT" | "LOSE_TURN";
// Exported (as a real value, not just a type) so the client can render an
// actual wheel with these exact wedges in this exact order, and rotate it
// to the specific wedge the server picked rather than just displaying the
// resulting dollar amount in a spinning circle.
export const WHEEL: WheelSegment[] = [500, 600, 700, 800, 300, 900, 400, 650, "BANKRUPT", 750, 850, "LOSE_TURN", 550, 300, 400, 600];

interface PuzzleDef {
  category: string;
  phrase: string;
}

// Original puzzles, written fresh for this app (not transcribed from any
// broadcast) — same approach as Family Feud's question bank and Wildest
// Answer's prompts.
const PUZZLE_BANK: PuzzleDef[] = [
  { category: "Phrase", phrase: "BETTER LATE THAN NEVER" },
  { category: "Phrase", phrase: "ACTIONS SPEAK LOUDER THAN WORDS" },
  { category: "Phrase", phrase: "PRACTICE MAKES PERFECT" },
  { category: "Phrase", phrase: "TIME FLIES WHEN YOU ARE HAVING FUN" },
  { category: "Phrase", phrase: "DONT JUDGE A BOOK BY ITS COVER" },
  { category: "Phrase", phrase: "EVERY CLOUD HAS A SILVER LINING" },
  { category: "Phrase", phrase: "THE EARLY BIRD CATCHES THE WORM" },
  { category: "Phrase", phrase: "ONE STEP AT A TIME" },
  { category: "Phrase", phrase: "BACK TO THE DRAWING BOARD" },
  { category: "Phrase", phrase: "OUT OF SIGHT OUT OF MIND" },
  { category: "Movie Title", phrase: "THE MIDNIGHT TRAIN HOME" },
  { category: "Movie Title", phrase: "SUMMER OF BROKEN DREAMS" },
  { category: "Movie Title", phrase: "THE LAST LIGHTHOUSE KEEPER" },
  { category: "Movie Title", phrase: "RUNNING WITH WOLVES" },
  { category: "Movie Title", phrase: "A STRANGER IN THE ATTIC" },
  { category: "Movie Title", phrase: "THE ACCIDENTAL DETECTIVE" },
  { category: "Place", phrase: "A COZY CABIN IN THE MOUNTAINS" },
  { category: "Place", phrase: "THE CORNER COFFEE SHOP" },
  { category: "Place", phrase: "A CROWDED FARMERS MARKET" },
  { category: "Place", phrase: "THE OLD LIGHTHOUSE ON THE CLIFF" },
  { category: "Place", phrase: "A QUIET LIBRARY READING ROOM" },
  { category: "Place", phrase: "THE AMUSEMENT PARK FERRIS WHEEL" },
  { category: "Person", phrase: "A FRIENDLY NEIGHBORHOOD MAIL CARRIER" },
  { category: "Person", phrase: "MY GRANDMOTHERS BEST FRIEND" },
  { category: "Person", phrase: "THE WORLDS GREATEST MAGICIAN" },
  { category: "Person", phrase: "A STUBBORN LITTLE BROTHER" },
  { category: "Person", phrase: "THE NEW KID ON THE BLOCK" },
  { category: "Thing", phrase: "A RUSTY OLD BICYCLE" },
  { category: "Thing", phrase: "A HOMEMADE APPLE PIE" },
  { category: "Thing", phrase: "A COMFORTABLE PAIR OF SLIPPERS" },
  { category: "Thing", phrase: "A BRAND NEW SET OF HEADPHONES" },
  { category: "Thing", phrase: "A HANDWRITTEN LOVE LETTER" },
  { category: "Thing", phrase: "A SLIGHTLY BROKEN UMBRELLA" },
  { category: "Food & Drink", phrase: "A STEAMING BOWL OF CHICKEN SOUP" },
  { category: "Food & Drink", phrase: "FRESHLY BAKED CHOCOLATE CHIP COOKIES" },
  { category: "Food & Drink", phrase: "A TALL GLASS OF LEMONADE" },
  { category: "Food & Drink", phrase: "A CHEESY SLICE OF PEPPERONI PIZZA" },
  { category: "Food & Drink", phrase: "A SCOOP OF MINT CHOCOLATE ICE CREAM" },
  { category: "Occupation", phrase: "A DEDICATED SCHOOL TEACHER" },
  { category: "Occupation", phrase: "A LATE NIGHT RADIO HOST" },
  { category: "Occupation", phrase: "A TRAVELING CIRCUS PERFORMER" },
  { category: "Occupation", phrase: "A CURIOUS SCIENCE RESEARCHER" },
  { category: "Occupation", phrase: "A PATIENT VETERINARIAN" },
  { category: "Around the House", phrase: "FOLDING THE LAUNDRY ON A SUNDAY" },
  { category: "Around the House", phrase: "A SQUEAKY KITCHEN CABINET DOOR" },
  { category: "Around the House", phrase: "WATERING THE HOUSEPLANTS EVERY WEEK" },
  { category: "Around the House", phrase: "A JUNK DRAWER FULL OF BATTERIES" },
  { category: "Around the House", phrase: "REARRANGING THE LIVING ROOM FURNITURE" },
  { category: "On the Map", phrase: "A SMALL FISHING VILLAGE" },
  { category: "On the Map", phrase: "A BUSY DOWNTOWN INTERSECTION" },
  { category: "On the Map", phrase: "A WINDING MOUNTAIN HIGHWAY" },
  { category: "On the Map", phrase: "A SLEEPY SUBURBAN CUL DE SAC" },
  { category: "Famous Duo", phrase: "PEANUT BUTTER AND JELLY" },
  { category: "Famous Duo", phrase: "THUNDER AND LIGHTNING" },
  { category: "Famous Duo", phrase: "SALT AND PEPPER SHAKERS" },
  { category: "Famous Duo", phrase: "NEEDLE IN A HAYSTACK" },
  { category: "Event", phrase: "A SURPRISE BIRTHDAY PARTY" },
  { category: "Event", phrase: "A RAINY DAY WEDDING" },
  { category: "Event", phrase: "THE ANNUAL NEIGHBORHOOD BLOCK PARTY" },
  { category: "Event", phrase: "A LAST MINUTE FAMILY REUNION" },
];

// Tracks puzzles already used, across games, for the lifetime of this server
// process — same freshness pattern used elsewhere.
const usedPhrases = new Set<string>();

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function pickPuzzle(): PuzzleDef {
  let pool = PUZZLE_BANK.filter((p) => !usedPhrases.has(p.phrase));
  if (pool.length === 0) {
    usedPhrases.clear();
    pool = PUZZLE_BANK;
  }
  const puzzle = pool[Math.floor(Math.random() * pool.length)]!;
  usedPhrases.add(puzzle.phrase);
  return puzzle;
}

function normalizeSolve(s: string): string {
  return s
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function isFullyRevealed(phrase: string, guessedLetters: string[]): boolean {
  const letters = new Set(guessedLetters);
  return phrase
    .split("")
    .filter((c) => /[A-Z]/.test(c))
    .every((c) => letters.has(c));
}

export type LuckySpinPhase = "playing" | "roundEnd" | "finished";

export interface LuckySpinState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  order: PlayerId[];
  turnIndex: number;
  roundIndex: number;
  totalRounds: number;
  category: string;
  phrase: string;
  guessedLetters: string[];
  roundEarnings: Record<PlayerId, number>;
  totalScores: Record<PlayerId, number>;
  phase: LuckySpinPhase;
  currentSegmentValue: number | null;
  lastSpinResult: WheelSegment | null;
  lastSpinIndex: number | null;
  roundLog: string[];
  lastRoundResult: { winnerId: PlayerId | null; phrase: string; reason: string } | null;
}

export interface LuckySpinView {
  hostId: PlayerId;
  order: PlayerId[];
  currentPlayerId: PlayerId;
  yourTurn: boolean;
  roundIndex: number;
  totalRounds: number;
  category: string;
  boardWords: string[][]; // each word's letters, "_" for unguessed
  revealedPhrase: string | null; // full phrase, once solved/round over
  guessedLetters: string[];
  roundEarnings: { playerId: PlayerId; amount: number }[];
  totalScores: { playerId: PlayerId; score: number }[];
  phase: LuckySpinPhase;
  currentSegmentValue: number | null;
  lastSpinResult: WheelSegment | null;
  lastSpinIndex: number | null;
  canBuyVowel: boolean;
  roundLog: string[];
  lastRoundResult: LuckySpinState["lastRoundResult"];
}

export type LuckySpinAction =
  | { type: "spin" }
  | { type: "guessConsonant"; letter: string }
  | { type: "buyVowel"; letter: string }
  | { type: "solve"; text: string }
  | { type: "advance" };

// Structured per-word/per-letter board data (word breaks preserved) instead
// of a single pre-formatted ASCII string — lets the client wrap the board
// onto multiple rows at word boundaries instead of needing to horizontally
// scroll a single long line.
function buildBoardWords(phrase: string, guessedLetters: string[]): string[][] {
  const letters = new Set(guessedLetters);
  return phrase.split(" ").map((word) => word.split("").map((c) => (letters.has(c) ? c : "_")));
}

function startRound(state: LuckySpinState, roundIndex: number): LuckySpinState {
  const puzzle = pickPuzzle();
  const roundEarnings: Record<PlayerId, number> = {};
  for (const id of state.playerIds) roundEarnings[id] = 0;
  return {
    ...state,
    roundIndex,
    category: puzzle.category,
    phrase: puzzle.phrase,
    guessedLetters: [],
    roundEarnings,
    phase: "playing",
    currentSegmentValue: null,
    lastSpinResult: null,
    lastSpinIndex: null,
    roundLog: [`Round ${roundIndex + 1}: category is "${puzzle.category}"`],
    lastRoundResult: null,
  };
}

function passTurn(state: LuckySpinState): Pick<LuckySpinState, "turnIndex" | "currentSegmentValue"> {
  return { turnIndex: (state.turnIndex + 1) % state.order.length, currentSegmentValue: null };
}

export const luckySpin: GameDefinition<LuckySpinState, LuckySpinView, LuckySpinAction> = {
  meta: {
    id: "lucky-spin",
    name: "Lucky Spin",
    tagline: "Spin the wheel, guess letters, solve the puzzle before anyone else.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 6,
    options: [{ key: "rounds", label: "Rounds", type: "number", min: 2, max: 10, default: DEFAULT_ROUNDS }],
  },
  createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const order = players.map((p) => p.id);
    const totalScores: Record<PlayerId, number> = {};
    for (const p of players) totalScores[p.id] = 0;
    const totalRounds = Math.min(Math.max(Number(options.rounds) || DEFAULT_ROUNDS, 2), 10);
    const base: LuckySpinState = {
      hostId: host.id,
      playerIds: order,
      order,
      turnIndex: 0,
      roundIndex: 0,
      totalRounds,
      category: "",
      phrase: "",
      guessedLetters: [],
      roundEarnings: {},
      totalScores,
      phase: "playing",
      currentSegmentValue: null,
      lastSpinResult: null,
      lastSpinIndex: null,
      roundLog: [],
      lastRoundResult: null,
    };
    return startRound(base, 0);
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");
    const currentPlayerId = state.order[state.turnIndex]!;

    if (action.type === "spin") {
      if (state.phase !== "playing") throw new GameActionError("Not your turn to spin.");
      if (playerId !== currentPlayerId) throw new GameActionError("It's not your turn.");
      if (state.currentSegmentValue !== null) throw new GameActionError("You already spun — guess a consonant, buy a vowel, or solve.");
      const segmentIndex = Math.floor(Math.random() * WHEEL.length);
      const segment = WHEEL[segmentIndex]!;

      if (segment === "BANKRUPT") {
        const roundEarnings = { ...state.roundEarnings, [currentPlayerId]: 0 };
        return {
          ...state,
          roundEarnings,
          lastSpinResult: segment,
          lastSpinIndex: segmentIndex,
          ...passTurn(state),
          roundLog: [...state.roundLog, `${currentPlayerId} spun BANKRUPT and loses this round's earnings!`].slice(-30),
        };
      }
      if (segment === "LOSE_TURN") {
        return {
          ...state,
          lastSpinResult: segment,
          lastSpinIndex: segmentIndex,
          ...passTurn(state),
          roundLog: [...state.roundLog, `${currentPlayerId} spun Lose a Turn.`].slice(-30),
        };
      }
      return {
        ...state,
        currentSegmentValue: segment,
        lastSpinResult: segment,
        lastSpinIndex: segmentIndex,
        roundLog: [...state.roundLog, `${currentPlayerId} spun $${segment}.`].slice(-30),
      };
    }

    if (action.type === "guessConsonant") {
      if (state.phase !== "playing") throw new GameActionError("Round's over.");
      if (playerId !== currentPlayerId) throw new GameActionError("It's not your turn.");
      if (state.currentSegmentValue === null) throw new GameActionError("Spin first.");
      const letter = action.letter.trim().toUpperCase();
      if (!/^[A-Z]$/.test(letter) || VOWELS.has(letter)) throw new GameActionError("Pick a single consonant.");
      if (state.guessedLetters.includes(letter)) throw new GameActionError("That letter's already been guessed.");

      const value = state.currentSegmentValue;
      const count = state.phrase.split("").filter((c) => c === letter).length;
      const guessedLetters = [...state.guessedLetters, letter];

      if (count > 0) {
        const roundEarnings = { ...state.roundEarnings, [currentPlayerId]: (state.roundEarnings[currentPlayerId] ?? 0) + value * count };
        const log = [...state.roundLog, `${currentPlayerId} found ${count} "${letter}"${count > 1 ? "'s" : ""} — +$${value * count}!`].slice(-30);
        if (isFullyRevealed(state.phrase, guessedLetters)) {
          return endRound({ ...state, guessedLetters, roundEarnings, roundLog: log }, currentPlayerId, "board fully revealed");
        }
        return { ...state, guessedLetters, roundEarnings, currentSegmentValue: null, roundLog: log };
      }

      return {
        ...state,
        guessedLetters,
        roundLog: [...state.roundLog, `${currentPlayerId} guessed "${letter}" — not in the puzzle.`].slice(-30),
        ...passTurn(state),
      };
    }

    if (action.type === "buyVowel") {
      if (state.phase !== "playing") throw new GameActionError("Round's over.");
      if (playerId !== currentPlayerId) throw new GameActionError("It's not your turn.");
      const letter = action.letter.trim().toUpperCase();
      if (!VOWELS.has(letter)) throw new GameActionError("Pick a vowel.");
      if (state.guessedLetters.includes(letter)) throw new GameActionError("That letter's already been guessed.");
      const earnings = state.roundEarnings[currentPlayerId] ?? 0;
      if (earnings < VOWEL_COST) throw new GameActionError(`You need $${VOWEL_COST} to buy a vowel.`);

      const roundEarnings = { ...state.roundEarnings, [currentPlayerId]: earnings - VOWEL_COST };
      const count = state.phrase.split("").filter((c) => c === letter).length;
      const guessedLetters = [...state.guessedLetters, letter];

      if (count > 0) {
        const log = [...state.roundLog, `${currentPlayerId} bought "${letter}" for $${VOWEL_COST} — found ${count}.`].slice(-30);
        if (isFullyRevealed(state.phrase, guessedLetters)) {
          return endRound({ ...state, guessedLetters, roundEarnings, roundLog: log }, currentPlayerId, "board fully revealed");
        }
        return { ...state, guessedLetters, roundEarnings, roundLog: log };
      }

      return {
        ...state,
        guessedLetters,
        roundEarnings,
        roundLog: [...state.roundLog, `${currentPlayerId} bought "${letter}" for $${VOWEL_COST} — not in the puzzle.`].slice(-30),
        ...passTurn(state),
      };
    }

    if (action.type === "solve") {
      if (state.phase !== "playing") throw new GameActionError("Round's over.");
      if (playerId !== currentPlayerId) throw new GameActionError("It's not your turn.");
      const text = normalizeSolve(action.text);
      if (!text) throw new GameActionError("Enter your solve attempt.");
      if (text === normalizeSolve(state.phrase)) {
        return endRound(state, currentPlayerId, "solved it");
      }
      return {
        ...state,
        roundLog: [...state.roundLog, `${currentPlayerId} guessed "${action.text}" — not quite.`].slice(-30),
        ...passTurn(state),
      };
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextRoundIndex = state.roundIndex + 1;
      if (nextRoundIndex >= state.totalRounds) return { ...state, phase: "finished" };
      return startRound(state, nextRoundIndex);
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId, players) {
    const currentPlayerId = state.order[state.turnIndex]!;
    const revealed = state.phase === "roundEnd" || state.phase === "finished";
    return {
      hostId: state.hostId,
      order: state.order,
      currentPlayerId,
      yourTurn: currentPlayerId === playerId && state.phase === "playing",
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      category: state.category,
      boardWords: buildBoardWords(state.phrase, state.guessedLetters),
      revealedPhrase: revealed ? state.phrase : null,
      guessedLetters: state.guessedLetters,
      roundEarnings: state.playerIds.map((pid) => ({ playerId: pid, amount: state.roundEarnings[pid] ?? 0 })),
      totalScores: state.playerIds.map((pid) => ({ playerId: pid, score: state.totalScores[pid] ?? 0 })),
      phase: state.phase,
      currentSegmentValue: state.currentSegmentValue,
      lastSpinResult: state.lastSpinResult,
      lastSpinIndex: state.lastSpinIndex,
      canBuyVowel: (state.roundEarnings[currentPlayerId] ?? 0) >= VOWEL_COST,
      roundLog: substituteNames(state.roundLog.slice(-8), state.order, players),
      lastRoundResult: state.lastRoundResult,
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const max = Math.max(...Object.values(state.totalScores));
    return Object.entries(state.totalScores)
      .filter(([, v]) => v === max)
      .map(([k]) => k);
  },
  getRanking(state) {
    return [...state.playerIds].sort((a, b) => (state.totalScores[b] ?? 0) - (state.totalScores[a] ?? 0));
  },
};

function endRound(state: LuckySpinState, winnerId: PlayerId, reason: string): LuckySpinState {
  const totalScores = { ...state.totalScores, [winnerId]: (state.totalScores[winnerId] ?? 0) + (state.roundEarnings[winnerId] ?? 0) };
  return {
    ...state,
    totalScores,
    phase: "roundEnd",
    lastRoundResult: { winnerId, phrase: state.phrase, reason },
    roundLog: [...state.roundLog, `${winnerId} wins the round — ${reason}! Banks $${state.roundEarnings[winnerId] ?? 0}.`].slice(-30),
  };
}
