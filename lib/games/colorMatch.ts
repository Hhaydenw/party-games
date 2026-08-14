import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { substituteNames } from "@/lib/games/logNames";

// An original color-memory game (not affiliated with dialed.gg or any other
// commercial game): a target color flashes on screen, then hides — everyone
// dials in R/G/B sliders from memory to recreate it, and scores 0-10 (10 =
// perfect) based on how close the guess actually looks, not just raw RGB
// distance (see labDistance below).

const VIEW_MS_DEFAULT = 4000;
const GUESS_MS_DEFAULT = 30_000;
const DEFAULT_ROUNDS = 6;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

function randomColor(): RGB {
  // Random in HSL space and converted to RGB — avoids the muddy
  // near-black/near-white/near-grey colors a uniform RGB random tends to
  // produce, which are hard to distinguish and no fun to study.
  const h = Math.random() * 360;
  const s = 0.45 + Math.random() * 0.5; // 45-95%
  const l = 0.3 + Math.random() * 0.4; // 30-70%
  return hslToRgb(h, s, l);
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// Perceptual color distance (CIE76 deltaE in Lab space) rather than raw RGB
// Euclidean distance — RGB distance judges e.g. dark-blue-vs-black as
// "close" when they don't look it, while Lab roughly tracks how different
// two colors actually look to a person.
function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function rgbToLab({ r, g, b }: RGB): [number, number, number] {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);
  // sRGB -> XYZ (D65)
  const x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;
  const xn = x / 0.95047;
  const yn = y / 1.0;
  const zn = z / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(xn);
  const fy = f(yn);
  const fz = f(zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function labDistance(a: RGB, b: RGB): number {
  const [l1, a1, b1] = rgbToLab(a);
  const [l2, a2, b2] = rgbToLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}
// Empirically, a CIE76 deltaE around 100 covers most of the plausible
// "way off" guess space for saturated colors in this game (max possible is
// higher, e.g. pure white vs pure black is ~100 alone, but two saturated
// hues can exceed that) — clamping at 100 keeps the 0-10 scale from
// bottoming out at 0 for every merely-bad guess.
const MAX_DELTA_E = 100;
function scoreFromDistance(distance: number): number {
  const clamped = Math.min(distance, MAX_DELTA_E);
  return Math.round((1 - clamped / MAX_DELTA_E) * 10 * 10) / 10; // one decimal place
}

export type ColorMatchPhase = "viewing" | "guessing" | "roundEnd" | "finished";

interface RoundGuess {
  color: RGB;
  score: number;
}

export interface ColorMatchState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  totalRounds: number;
  viewMs: number;
  guessMs: number;
  roundIndex: number;
  target: RGB;
  phase: ColorMatchPhase;
  viewEndsAt: number | null;
  guessEndsAt: number | null;
  guesses: Record<PlayerId, RoundGuess | null>;
  scores: Record<PlayerId, number>;
  lastRoundGains: Record<PlayerId, number>;
  log: string[];
}

interface RoundGuessView {
  playerId: PlayerId;
  color: RGB | null; // null if they never submitted
  score: number | null;
}

export interface ColorMatchView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  phase: ColorMatchPhase;
  target: RGB | null; // only present while "viewing", and again once revealed
  viewEndsAt: number | null;
  guessEndsAt: number | null;
  yourGuess: RGB | null;
  youSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  results: RoundGuessView[] | null; // populated once revealed
  scores: { playerId: PlayerId; score: number; roundGain: number }[];
  log: string[];
}

export type ColorMatchAction = { type: "submitGuess"; color: RGB } | { type: "timeUp" } | { type: "advance" };

function clampChannel(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function startRound(state: ColorMatchState, roundIndex: number): ColorMatchState {
  const guesses: Record<PlayerId, RoundGuess | null> = {};
  for (const id of state.playerIds) guesses[id] = null;
  return {
    ...state,
    roundIndex,
    target: randomColor(),
    phase: "viewing",
    viewEndsAt: Date.now() + state.viewMs,
    guessEndsAt: null,
    guesses,
    lastRoundGains: {},
    log: [...state.log, `Round ${roundIndex + 1} of ${state.totalRounds} — study the color!`].slice(-20),
  };
}

export const colorMatch: GameDefinition<ColorMatchState, ColorMatchView, ColorMatchAction> = {
  meta: {
    id: "color-match",
    name: "Color Match",
    tagline: "Study a color, then dial it back in from memory — closest match wins the round.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 12,
    options: [
      { key: "rounds", label: "Rounds", type: "number", min: 2, max: 12, default: DEFAULT_ROUNDS },
      { key: "viewSeconds", label: "Seconds to study the color", type: "number", min: 2, max: 10, default: VIEW_MS_DEFAULT / 1000 },
      { key: "guessSeconds", label: "Seconds to guess", type: "number", min: 10, max: 60, default: GUESS_MS_DEFAULT / 1000, step: 5 },
    ],
  },
  createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const totalRounds = Math.min(Math.max(Number(options.rounds) || DEFAULT_ROUNDS, 2), 12);
    const viewMs = Math.min(Math.max((Number(options.viewSeconds) || VIEW_MS_DEFAULT / 1000) * 1000, 2000), 10_000);
    const guessMs = Math.min(Math.max((Number(options.guessSeconds) || GUESS_MS_DEFAULT / 1000) * 1000, 10_000), 60_000);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;
    const base: ColorMatchState = {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      totalRounds,
      viewMs,
      guessMs,
      roundIndex: 0,
      target: { r: 0, g: 0, b: 0 },
      phase: "viewing",
      viewEndsAt: null,
      guessEndsAt: null,
      guesses: {},
      scores,
      lastRoundGains: {},
      log: [],
    };
    return startRound(base, 0);
  },
  applyAction(state, playerId, action) {
    if (action.type === "submitGuess") {
      if (state.phase !== "guessing") throw new GameActionError("Not accepting guesses right now.");
      if (state.guesses[playerId]) throw new GameActionError("You already submitted a guess this round.");
      const color: RGB = { r: clampChannel(action.color.r), g: clampChannel(action.color.g), b: clampChannel(action.color.b) };
      const score = scoreFromDistance(labDistance(state.target, color));
      const guesses = { ...state.guesses, [playerId]: { color, score } };
      let next: ColorMatchState = { ...state, guesses };
      const allSubmitted = state.playerIds.every((pid) => guesses[pid]);
      if (allSubmitted) next = revealRound(next);
      return next;
    }

    if (action.type === "timeUp") {
      if (state.phase === "viewing") {
        return { ...state, phase: "guessing", viewEndsAt: null, guessEndsAt: Date.now() + state.guessMs };
      }
      if (state.phase === "guessing") {
        return revealRound(state);
      }
      throw new GameActionError("Nothing to advance.");
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
    const revealed = state.phase === "roundEnd" || state.phase === "finished";
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      phase: state.phase,
      target: state.phase === "viewing" || revealed ? state.target : null,
      viewEndsAt: state.viewEndsAt,
      guessEndsAt: state.guessEndsAt,
      yourGuess: state.guesses[playerId]?.color ?? null,
      youSubmitted: Boolean(state.guesses[playerId]),
      submittedCount: Object.values(state.guesses).filter(Boolean).length,
      totalPlayers: state.playerIds.length,
      results: revealed
        ? state.playerIds.map((pid) => ({ playerId: pid, color: state.guesses[pid]?.color ?? null, score: state.guesses[pid]?.score ?? null }))
        : null,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0, roundGain: state.lastRoundGains[pid] ?? 0 })),
      log: substituteNames(state.log.slice(-8), state.playerIds, players),
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

function revealRound(state: ColorMatchState): ColorMatchState {
  const lastRoundGains: Record<PlayerId, number> = {};
  const scores = { ...state.scores };
  for (const pid of state.playerIds) {
    const gain = state.guesses[pid]?.score ?? 0;
    lastRoundGains[pid] = gain;
    scores[pid] = (scores[pid] ?? 0) + gain;
  }
  const best = state.playerIds.reduce<{ pid: PlayerId; score: number } | null>((acc, pid) => {
    const s = state.guesses[pid]?.score;
    if (s === undefined || s === null) return acc;
    if (!acc || s > acc.score) return { pid, score: s };
    return acc;
  }, null);
  const log = [
    ...state.log,
    best ? `${best.pid} had the closest match (${best.score.toFixed(1)}/10)!` : "Nobody submitted a guess this round.",
  ].slice(-20);
  return { ...state, phase: "roundEnd", guessEndsAt: null, scores, lastRoundGains, log };
}
