import { GameActionError, GameDefinition, PlayerId } from "@/lib/types";

// A Pictionary/skribbl.io-style game: one player draws a secret word on a
// shared canvas, everyone else races to guess it in a chat-style feed.

const WORD_BANK: string[] = [
  "guitar", "volcano", "pizza", "robot", "umbrella", "castle", "octopus", "rainbow",
  "skateboard", "campfire", "lighthouse", "dragon", "snowman", "cactus", "helicopter",
  "pirate", "waterfall", "sandwich", "telescope", "jellyfish", "backpack", "unicorn",
  "spaceship", "penguin", "windmill", "mermaid", "trampoline", "scarecrow", "avocado",
  "flamingo", "treasure chest", "hot air balloon", "bowling", "cupcake", "kangaroo",
  "lightning", "igloo", "saxophone", "hammock", "tornado", "peacock", "waffle",
  "chandelier", "submarine", "beehive", "campground", "snorkel", "pretzel", "compass",
  "roller coaster", "haunted house", "bagpipes", "koala", "typewriter", "wizard",
];

const ROUND_MS = 80_000;

export type DrawingPhase = "choosing" | "drawing" | "roundEnd" | "finished";

export interface StrokePoint {
  x: number; // 0..1, relative to canvas size
  y: number;
}

export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: StrokePoint[];
}

interface GuessLogEntry {
  id: string;
  playerId: PlayerId;
  text: string;
  correct: boolean;
  at: number;
}

export interface DrawingState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  order: PlayerId[]; // drawer rotation, one lap = totalRounds
  roundIndex: number;
  totalRounds: number;
  drawerId: PlayerId;
  phase: DrawingPhase;
  usedWords: string[];
  wordOptions: string[];
  word: string | null;
  strokes: Stroke[];
  guesses: GuessLogEntry[];
  correctGuessers: PlayerId[];
  roundEndsAt: number | null;
  scores: Record<PlayerId, number>;
  lastRoundReveal: { word: string; correctGuessers: PlayerId[] } | null;
}

export interface DrawingView {
  hostId: PlayerId;
  isDrawer: boolean;
  drawerId: PlayerId;
  phase: DrawingPhase;
  roundIndex: number;
  totalRounds: number;
  wordOptions: string[] | null;
  word: string | null;
  wordLength: number | null;
  strokes: Stroke[];
  guesses: { id: string; playerId: PlayerId; text: string | null; correct: boolean; at: number }[];
  correctGuessers: PlayerId[];
  youGuessedCorrectly: boolean;
  roundEndsAt: number | null;
  scores: { playerId: PlayerId; score: number }[];
  lastRoundReveal: { word: string; correctGuessers: PlayerId[] } | null;
}

export type DrawingAction =
  | { type: "chooseWord"; word: string }
  | { type: "strokeStart"; strokeId: string; color: string; width: number; point: StrokePoint }
  | { type: "strokePoint"; strokeId: string; point: StrokePoint }
  | { type: "strokeEnd"; strokeId: string }
  | { type: "clear" }
  | { type: "guess"; text: string }
  | { type: "timeUp" }
  | { type: "advance" };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function pickWordOptions(used: string[]): string[] {
  const available = WORD_BANK.filter((w) => !used.includes(w));
  const pool = available.length >= 3 ? available : WORD_BANK;
  return shuffle(pool).slice(0, 3);
}

let guessSeq = 0;
function nextGuessId(): string {
  guessSeq += 1;
  return `g${guessSeq}`;
}

function endRound(state: DrawingState): DrawingState {
  const bonus = state.correctGuessers.length;
  const scores = { ...state.scores };
  if (bonus > 0) scores[state.drawerId] = (scores[state.drawerId] ?? 0) + bonus;
  return {
    ...state,
    phase: "roundEnd",
    scores,
    lastRoundReveal: { word: state.word ?? "", correctGuessers: state.correctGuessers },
  };
}

export const drawing: GameDefinition<DrawingState, DrawingView, DrawingAction> = {
  meta: {
    id: "drawing",
    name: "Doodle Guess",
    tagline: "One player draws, everyone else races to guess. Pictionary-style.",
    category: "party",
    minPlayers: 3,
    maxPlayers: 10,
  },
  createInitialState(players) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const order = shuffle(players.map((p) => p.id));
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;
    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      order,
      roundIndex: 0,
      totalRounds: order.length,
      drawerId: order[0]!,
      phase: "choosing",
      usedWords: [],
      wordOptions: pickWordOptions([]),
      word: null,
      strokes: [],
      guesses: [],
      correctGuessers: [],
      roundEndsAt: null,
      scores,
      lastRoundReveal: null,
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "chooseWord") {
      if (state.phase !== "choosing") throw new GameActionError("Not choosing a word right now.");
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer picks the word.");
      if (!state.wordOptions.includes(action.word)) throw new GameActionError("Invalid word choice.");
      return {
        ...state,
        phase: "drawing",
        word: action.word,
        usedWords: [...state.usedWords, action.word],
        strokes: [],
        guesses: [],
        correctGuessers: [],
        roundEndsAt: Date.now() + ROUND_MS,
      };
    }

    if (action.type === "strokeStart") {
      if (state.phase !== "drawing") throw new GameActionError("Not drawing right now.");
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer can draw.");
      const stroke: Stroke = { id: action.strokeId, color: action.color, width: action.width, points: [action.point] };
      return { ...state, strokes: [...state.strokes, stroke] };
    }

    if (action.type === "strokePoint") {
      if (state.phase !== "drawing") throw new GameActionError("Not drawing right now.");
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer can draw.");
      const idx = state.strokes.findIndex((s) => s.id === action.strokeId);
      if (idx === -1) return state; // stroke start was dropped/raced; ignore quietly
      const strokes = state.strokes.slice();
      strokes[idx] = { ...strokes[idx]!, points: [...strokes[idx]!.points, action.point] };
      return { ...state, strokes };
    }

    if (action.type === "strokeEnd") {
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer can draw.");
      return state; // bookkeeping no-op; kept for symmetry / future undo support
    }

    if (action.type === "clear") {
      if (state.phase !== "drawing") throw new GameActionError("Not drawing right now.");
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer can clear the canvas.");
      return { ...state, strokes: [] };
    }

    if (action.type === "guess") {
      if (state.phase !== "drawing") throw new GameActionError("Not accepting guesses right now.");
      if (playerId === state.drawerId) throw new GameActionError("The drawer can't guess.");
      if (state.correctGuessers.includes(playerId)) throw new GameActionError("You already guessed it.");
      const text = action.text.trim().slice(0, 60);
      if (!text) throw new GameActionError("Guess can't be empty.");
      const isCorrect = state.word !== null && text.toLowerCase() === state.word.toLowerCase();
      const entry: GuessLogEntry = { id: nextGuessId(), playerId, text, correct: isCorrect, at: Date.now() };
      let next: DrawingState = { ...state, guesses: [...state.guesses.slice(-49), entry] };

      if (isCorrect) {
        const position = state.correctGuessers.length;
        const points = position === 0 ? 3 : position === 1 ? 2 : 1;
        next = {
          ...next,
          correctGuessers: [...state.correctGuessers, playerId],
          scores: { ...next.scores, [playerId]: (next.scores[playerId] ?? 0) + points },
        };
        const everyoneIn = state.playerIds.filter((id) => id !== state.drawerId).every((id) => next.correctGuessers.includes(id));
        if (everyoneIn) next = endRound(next);
      }
      return next;
    }

    if (action.type === "timeUp") {
      if (state.phase !== "drawing") throw new GameActionError("Round already ended.");
      return endRound(state);
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId && playerId !== state.drawerId) throw new GameActionError("Only the host or drawer can advance.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextRoundIndex = state.roundIndex + 1;
      if (nextRoundIndex >= state.totalRounds) {
        return { ...state, phase: "finished" };
      }
      return {
        ...state,
        roundIndex: nextRoundIndex,
        drawerId: state.order[nextRoundIndex]!,
        phase: "choosing",
        wordOptions: pickWordOptions(state.usedWords),
        word: null,
        strokes: [],
        guesses: [],
        correctGuessers: [],
        roundEndsAt: null,
        lastRoundReveal: null,
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const isDrawer = playerId === state.drawerId;
    const viewerAlreadyCorrect = state.correctGuessers.includes(playerId);
    return {
      hostId: state.hostId,
      isDrawer,
      drawerId: state.drawerId,
      phase: state.phase,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      wordOptions: isDrawer && state.phase === "choosing" ? state.wordOptions : null,
      word: isDrawer ? state.word : state.phase === "roundEnd" || state.phase === "finished" ? state.lastRoundReveal?.word ?? null : null,
      wordLength: !isDrawer && state.phase === "drawing" && state.word ? state.word.length : null,
      strokes: state.strokes,
      guesses: state.guesses.map((g) => ({
        id: g.id,
        playerId: g.playerId,
        correct: g.correct,
        at: g.at,
        text: !g.correct || isDrawer || g.playerId === playerId || viewerAlreadyCorrect ? g.text : null,
      })),
      correctGuessers: state.correctGuessers,
      youGuessedCorrectly: viewerAlreadyCorrect,
      roundEndsAt: state.roundEndsAt,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0 })),
      lastRoundReveal: state.phase === "roundEnd" || state.phase === "finished" ? state.lastRoundReveal : null,
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
