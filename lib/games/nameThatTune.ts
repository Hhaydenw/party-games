import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { DECADE_CHOICES, GENRE_CHOICES, SongResult, searchSongs } from "./songSource";

// A "name that tune" style game: the server searches Apple's free, keyless
// iTunes Search API for real songs matching the chosen genre/decade (which
// doubles as both "find the biggest songs" and "get a preview clip" in one
// call — see `lib/games/songSource.ts`), everyone races to type the title
// (and artist, for a bonus), points awarded by guess order.

const ROUND_MS = 25_000;
const DEFAULT_ROUNDS = 8;

// Tracks song titles already played, across games, for the lifetime of this
// server process — so replaying the game in the same room (or a different
// one) doesn't serve the same songs again until the pool is exhausted.
const playedTitles = new Set<string>();

function pickNext(pool: SongResult[], order: number[], used: number[]): { index: number; song: SongResult } | null {
  const remaining = order.filter((i) => !used.includes(i));
  const fresh = remaining.filter((i) => !playedTitles.has(pool[i]!.title));
  const candidates = fresh.length > 0 ? fresh : remaining;
  if (candidates.length === 0) return null;
  const index = candidates[0]!;
  playedTitles.add(pool[index]!.title);
  return { index, song: pool[index]! };
}

export type TunePhase = "guessing" | "roundEnd" | "finished";

interface GuessLogEntry {
  id: string;
  playerId: PlayerId;
  text: string;
  correct: boolean;
  bothBonus: boolean;
  at: number;
}

export interface NameThatTuneState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  pool: SongResult[]; // this game's candidate pool, from a live iTunes search
  poolOrder: number[]; // shuffled indices into `pool`
  usedIndices: number[];
  roundIndex: number;
  totalRounds: number;
  title: string;
  artist: string;
  previewUrl: string;
  phase: TunePhase;
  guesses: GuessLogEntry[];
  correctGuessers: PlayerId[];
  roundEndsAt: number | null;
  scores: Record<PlayerId, number>;
}

export interface NameThatTuneView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  previewUrl: string;
  revealedTitle: string | null;
  revealedArtist: string | null;
  phase: TunePhase;
  guesses: { id: string; playerId: PlayerId; text: string | null; correct: boolean; bothBonus: boolean; at: number }[];
  correctGuessers: PlayerId[];
  youGuessedCorrectly: boolean;
  roundEndsAt: number | null;
  scores: { playerId: PlayerId; score: number }[];
}

export type NameThatTuneAction = { type: "guess"; text: string } | { type: "timeUp" } | { type: "advance" };

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

function matches(guess: string, target: string): boolean {
  if (!guess || !target) return false;
  if (guess === target) return true;
  return guess.length >= 4 && target.length >= 4 && target.includes(guess);
}

// Returns whether the guess matches the title, artist, or both (for a bonus)
// — e.g. "Bohemian Rhapsody by Queen" or "Bohemian Rhapsody - Queen".
function scoreGuess(text: string, title: string, artist: string): { correct: boolean; bothBonus: boolean } {
  const guess = normalize(text);
  const t = normalize(title);
  const a = normalize(artist);
  const titleHit = matches(guess, t) || (guess.includes(t) && t.length >= 4);
  const artistHit = matches(guess, a) || (guess.includes(a) && a.length >= 4);
  if (titleHit && artistHit) return { correct: true, bothBonus: true };
  if (titleHit || artistHit) return { correct: true, bothBonus: false };
  return { correct: false, bothBonus: false };
}

let guessSeq = 0;
function nextGuessId(): string {
  guessSeq += 1;
  return `t${guessSeq}`;
}

export const nameThatTune: GameDefinition<NameThatTuneState, NameThatTuneView, NameThatTuneAction> = {
  meta: {
    id: "name-that-tune",
    name: "Name That Tune",
    tagline: "Race to identify real 30-second song clips before everyone else.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 12,
    options: [
      { key: "rounds", label: "Rounds", type: "number", min: 3, max: 15, default: DEFAULT_ROUNDS },
      { key: "genre", label: "Genre", type: "select", choices: GENRE_CHOICES, default: "all" },
      { key: "decade", label: "Decade", type: "select", choices: DECADE_CHOICES, default: "all" },
    ],
  },
  async createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const genre = String(options.genre ?? "all");
    const decade = String(options.decade ?? "all");

    let pool = await searchSongs(genre, decade);
    if (pool.length < 3) pool = await searchSongs("all", "all"); // narrow combo came up dry; broaden
    if (pool.length < 3) throw new Error("Couldn't load any song clips right now. Try again in a bit.");

    const poolOrder = shuffle(pool.map((_, i) => i));
    const totalRounds = Math.min(Number(options.rounds) || DEFAULT_ROUNDS, pool.length);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;

    const first = pickNext(pool, poolOrder, []);
    if (!first) throw new Error("Couldn't load any song clips right now. Try again in a bit.");

    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      pool,
      poolOrder,
      usedIndices: [first.index],
      roundIndex: 0,
      totalRounds,
      title: first.song.title,
      artist: first.song.artist,
      previewUrl: first.song.previewUrl,
      phase: "guessing",
      guesses: [],
      correctGuessers: [],
      roundEndsAt: Date.now() + ROUND_MS,
      scores,
    };
  },
  async applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "guess") {
      if (state.phase !== "guessing") throw new GameActionError("Not accepting guesses right now.");
      if (state.correctGuessers.includes(playerId)) throw new GameActionError("You already guessed it.");
      const text = action.text.trim().slice(0, 80);
      if (!text) throw new GameActionError("Guess can't be empty.");
      const { correct, bothBonus } = scoreGuess(text, state.title, state.artist);
      const entry: GuessLogEntry = { id: nextGuessId(), playerId, text, correct, bothBonus, at: Date.now() };
      let next: NameThatTuneState = { ...state, guesses: [...state.guesses.slice(-49), entry] };

      if (correct) {
        const position = state.correctGuessers.length;
        const basePoints = position === 0 ? 3 : position === 1 ? 2 : 1;
        const points = basePoints + (bothBonus ? 2 : 0);
        next = {
          ...next,
          correctGuessers: [...state.correctGuessers, playerId],
          scores: { ...next.scores, [playerId]: (next.scores[playerId] ?? 0) + points },
        };
        if (next.correctGuessers.length === state.playerIds.length) {
          next = { ...next, phase: "roundEnd" };
        }
      }
      return next;
    }

    if (action.type === "timeUp") {
      if (state.phase !== "guessing") throw new GameActionError("Round already ended.");
      return { ...state, phase: "roundEnd" };
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextRoundIndex = state.roundIndex + 1;
      if (nextRoundIndex >= state.totalRounds) {
        return { ...state, phase: "finished" };
      }
      const next = pickNext(state.pool, state.poolOrder, state.usedIndices);
      if (!next) {
        // Ran out of songs in this pool; end the game early.
        return { ...state, phase: "finished" };
      }
      return {
        ...state,
        roundIndex: nextRoundIndex,
        usedIndices: [...state.usedIndices, next.index],
        title: next.song.title,
        artist: next.song.artist,
        previewUrl: next.song.previewUrl,
        phase: "guessing",
        guesses: [],
        correctGuessers: [],
        roundEndsAt: Date.now() + ROUND_MS,
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const viewerCorrect = state.correctGuessers.includes(playerId);
    const revealed = state.phase === "roundEnd" || state.phase === "finished";
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      previewUrl: state.previewUrl,
      revealedTitle: revealed ? state.title : null,
      revealedArtist: revealed ? state.artist : null,
      phase: state.phase,
      guesses: state.guesses.map((g) => ({
        id: g.id,
        playerId: g.playerId,
        correct: g.correct,
        bothBonus: g.bothBonus,
        at: g.at,
        text: !g.correct || g.playerId === playerId || viewerCorrect || revealed ? g.text : null,
      })),
      correctGuessers: state.correctGuessers,
      youGuessedCorrectly: viewerCorrect,
      roundEndsAt: state.roundEndsAt,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0 })),
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
