import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { DECADE_CHOICES, GENRE_CHOICES, SongResult, searchSongs } from "./songSource";

// A "name that tune" style game: the server searches Apple's free, keyless
// iTunes Search API for real songs matching the chosen genre/decade (which
// doubles as both "find the biggest songs" and "get a preview clip" in one
// call — see `lib/games/songSource.ts`), everyone races to type the title
// (and artist, for a bonus), points awarded by guess order.

// This is a safety cap, not the primary round-end trigger — the actual
// round ends when the clip finishes playing (the client fires `timeUp` on
// the <audio> element's `ended` event) so the guess window always lines up
// with however long that particular preview clip actually is, rather than
// a fixed guess that could cut a longer clip off early. This cap only
// matters if playback never starts/finishes for some reason (autoplay
// blocked, network hiccup).
const ROUND_MS = 30_000;
const DEFAULT_ROUNDS = 8;

// Tracks song titles already played, across games, for the lifetime of this
// server process — so replaying the game in the same room (or a different
// one) doesn't serve the same songs again until the pool is exhausted.
const playedTitles = new Set<string>();

function pickNext(pool: SongResult[], order: number[], used: number[]): { index: number; song: SongResult } | null {
  const remaining = order.filter((i) => !used.includes(i));
  let fresh = remaining.filter((i) => !playedTitles.has(pool[i]!.title));
  // Unlike every other game's freshness pool (Category Dash, Price Check,
  // Family Feud), this one never cleared `playedTitles` once a search
  // pool's fully exhausted — it just silently fell back to serving from
  // `remaining` with no freshness preference at all, forever, for however
  // long the server keeps running. For a narrow genre/decade combo (a
  // small search result pool), replaying the game a few times exhausts it
  // fast, and once that happens *every* pick — including round 1 of a
  // fresh "Play again" — comes from the same small fully-played pool with
  // nothing steering it away from whatever was just played. Clearing and
  // retrying (same pattern used everywhere else) at least gets freshness
  // preference back rather than abandoning it permanently.
  if (fresh.length === 0 && playedTitles.size > 0) {
    playedTitles.clear();
    fresh = remaining;
  }
  const candidates = fresh.length > 0 ? fresh : remaining;
  if (candidates.length === 0) return null;
  const index = candidates[0]!;
  playedTitles.add(pool[index]!.title);
  return { index, song: pool[index]! };
}

export type TunePhase = "guessing" | "roundEnd" | "finished";
export type TuneField = "title" | "artist";

interface GuessLogEntry {
  id: string;
  playerId: PlayerId;
  field: TuneField;
  text: string;
  correct: boolean;
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
  artworkUrl: string | null;
  phase: TunePhase;
  guesses: GuessLogEntry[];
  // Order of correctness matters — position determines points, same as
  // the old single-list version did, just tracked per field now that
  // title and artist are guessed (and scored) independently.
  correctTitleGuessers: PlayerId[];
  correctArtistGuessers: PlayerId[];
  roundStartedAt: number;
  roundEndsAt: number | null;
  scores: Record<PlayerId, number>;
}

interface RevealResult {
  playerId: PlayerId;
  titleCorrect: boolean;
  titleMs: number | null; // time from round start to their correct title guess
  artistCorrect: boolean;
  artistMs: number | null;
}

export interface NameThatTuneView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  previewUrl: string;
  revealedTitle: string | null;
  revealedArtist: string | null;
  revealedArtworkUrl: string | null;
  phase: TunePhase;
  guesses: { id: string; playerId: PlayerId; field: TuneField; text: string | null; correct: boolean; at: number }[];
  yourTitleCorrect: boolean;
  yourArtistCorrect: boolean;
  // Who got what right and how fast — populated once revealed (roundEnd/
  // finished), null during guessing.
  results: RevealResult[] | null;
  roundEndsAt: number | null;
  scores: { playerId: PlayerId; score: number }[];
}

export type NameThatTuneAction = { type: "guess"; field: TuneField; text: string } | { type: "timeUp" } | { type: "advance" };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

const ONES_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS_WORDS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// Rewrites number words to digits ("three" -> "3", "twenty one" -> "21") so
// a guess doesn't fail just because someone typed the numeral a song title
// spells out, or vice versa (e.g. "3 Days Grace" vs "Three Days Grace").
function wordsToDigits(text: string): string {
  const words = text.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const nextVal = ONES_WORDS[words[i + 1] ?? ""];
    if (TENS_WORDS[w] !== undefined && nextVal !== undefined && nextVal < 10) {
      out.push(String(TENS_WORDS[w]! + nextVal));
      i++;
    } else if (TENS_WORDS[w] !== undefined) {
      out.push(String(TENS_WORDS[w]));
    } else if (ONES_WORDS[w] !== undefined) {
      out.push(String(ONES_WORDS[w]));
    } else if (w === "hundred" && out.length > 0 && /^\d+$/.test(out[out.length - 1]!)) {
      out[out.length - 1] = String(Number(out[out.length - 1]) * 100);
    } else {
      out.push(w);
    }
  }
  return out.join(" ");
}

function normalize(s: string): string {
  const cleaned = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents/diacritics (é, è, ñ, ö, ...) so near-misses still match
    .toLowerCase()
    .trim()
    .replace(/^(a|an|the)\s+/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
  return wordsToDigits(cleaned);
}

// A near-miss-tolerant match: exact after normalizing, or the target is a
// substring of a long-enough guess (catches "queen bohemian rhapsody" or
// minor typos/extra words without requiring an exact match).
function fieldMatch(text: string, target: string): boolean {
  const guess = normalize(text);
  const t = normalize(target);
  if (!guess || !t) return false;
  if (guess === t) return true;
  if (guess.length >= 4 && t.length >= 4 && t.includes(guess)) return true;
  return guess.includes(t) && t.length >= 4;
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
      artworkUrl: first.song.artworkUrl,
      phase: "guessing",
      guesses: [],
      correctTitleGuessers: [],
      correctArtistGuessers: [],
      roundStartedAt: Date.now(),
      roundEndsAt: Date.now() + ROUND_MS,
      scores,
    };
  },
  async applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "guess") {
      if (state.phase !== "guessing") throw new GameActionError("Not accepting guesses right now.");
      const list = action.field === "title" ? state.correctTitleGuessers : state.correctArtistGuessers;
      if (list.includes(playerId)) throw new GameActionError(`You already got the ${action.field} right.`);
      const text = action.text.trim().slice(0, 80);
      if (!text) throw new GameActionError("Guess can't be empty.");
      const target = action.field === "title" ? state.title : state.artist;
      const correct = fieldMatch(text, target);
      const entry: GuessLogEntry = { id: nextGuessId(), playerId, field: action.field, text, correct, at: Date.now() };
      let next: NameThatTuneState = { ...state, guesses: [...state.guesses.slice(-49), entry] };

      if (correct) {
        const position = list.length;
        const points = position === 0 ? 3 : position === 1 ? 2 : 1;
        const updatedList = [...list, playerId];
        const otherList = action.field === "title" ? state.correctArtistGuessers : state.correctTitleGuessers;
        // Getting the *second* field right (in either order) is a bonus —
        // same spirit as the old single-guess "got both at once" bonus,
        // just reachable across two separate guesses now that the fields
        // are independent.
        const completedBoth = otherList.includes(playerId);
        const totalPoints = points + (completedBoth ? 2 : 0);
        next = {
          ...next,
          ...(action.field === "title" ? { correctTitleGuessers: updatedList } : { correctArtistGuessers: updatedList }),
          scores: { ...next.scores, [playerId]: (next.scores[playerId] ?? 0) + totalPoints },
        };
        const titleDone = action.field === "title" ? updatedList : state.correctTitleGuessers;
        const artistDone = action.field === "artist" ? updatedList : state.correctArtistGuessers;
        const everyoneDone = state.playerIds.every((pid) => titleDone.includes(pid) && artistDone.includes(pid));
        if (everyoneDone) next = { ...next, phase: "roundEnd" };
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
        artworkUrl: next.song.artworkUrl,
        phase: "guessing",
        guesses: [],
        correctTitleGuessers: [],
        correctArtistGuessers: [],
        roundStartedAt: Date.now(),
        roundEndsAt: Date.now() + ROUND_MS,
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const yourTitleCorrect = state.correctTitleGuessers.includes(playerId);
    const yourArtistCorrect = state.correctArtistGuessers.includes(playerId);
    const revealed = state.phase === "roundEnd" || state.phase === "finished";
    const results: RevealResult[] | null = revealed
      ? state.playerIds.map((pid) => {
          const titleGuess = state.guesses.find((g) => g.playerId === pid && g.field === "title" && g.correct);
          const artistGuess = state.guesses.find((g) => g.playerId === pid && g.field === "artist" && g.correct);
          return {
            playerId: pid,
            titleCorrect: Boolean(titleGuess),
            titleMs: titleGuess ? titleGuess.at - state.roundStartedAt : null,
            artistCorrect: Boolean(artistGuess),
            artistMs: artistGuess ? artistGuess.at - state.roundStartedAt : null,
          };
        })
      : null;
    return {
      hostId: state.hostId,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      previewUrl: state.previewUrl,
      revealedTitle: revealed ? state.title : null,
      revealedArtist: revealed ? state.artist : null,
      revealedArtworkUrl: revealed ? state.artworkUrl : null,
      phase: state.phase,
      guesses: state.guesses.map((g) => {
        const viewerFieldCorrect = g.field === "title" ? yourTitleCorrect : yourArtistCorrect;
        return {
          id: g.id,
          playerId: g.playerId,
          field: g.field,
          correct: g.correct,
          at: g.at,
          text: !g.correct || g.playerId === playerId || viewerFieldCorrect || revealed ? g.text : null,
        };
      }),
      yourTitleCorrect,
      yourArtistCorrect,
      results,
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
  getRanking(state) {
    return [...state.playerIds].sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  },
};
