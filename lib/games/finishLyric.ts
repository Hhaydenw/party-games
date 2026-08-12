import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { DECADE_CHOICES, GENRE_CHOICES, SongResult, searchSongs } from "./songSource";

// "Finish the Lyric": a short clip plays, then cuts off, and the next line
// of that song's actual lyrics is shown entirely blanked out — one
// underscore-run per word — for everyone to race to type. Songs come from
// the same live iTunes search pool as Name That Tune (`songSource.ts`); the
// lyric text itself comes from lyrics.ovh, a free, keyless lyrics API.
//
// Neither free API exposes word-level timing, so there's no way to know
// exactly when a given lyric line is sung within the preview clip. To keep
// the clip-then-blank flow actually making sense despite that, this always
// targets the *opening* line of the song (typically sung shortly after the
// clip starts, once any instrumental intro ends) and trims playback to a
// short `CLIP_SECONDS` window — see `FinishLyricView.tsx`, which cuts the
// audio off client-side and only reveals the blanks once the clip stops.
export const CLIP_SECONDS = 7;
const ROUND_MS = 32_000; // covers the clip plus a real guessing window after it
const DEFAULT_ROUNDS = 8;

// Tracks song titles already used, across games, for the lifetime of this
// server process, mirroring Name That Tune's freshness guarantee.
const usedTitles = new Set<string>();

interface LyricLine {
  raw: string;
  words: string[];
}

interface LyricsOvhResponse {
  lyrics?: string;
  error?: string;
}

const SECTION_MARKER_RE = /^[[(].*[\])]$/;
const SECTION_WORD_RE = /chorus|verse\s*\d*|bridge|outro|intro|refrain|pre-chorus/i;
const CLEAN_LINE_RE = /^[a-zA-Z0-9'",.!?;: -]+$/;

// Fetches the song's lyrics and picks the opening usable line — real prose,
// not a section marker, a reasonable length to blank out and guess. Taking
// the *first* line (rather than a random one from anywhere in the song) is
// what makes the short clip-then-blank cutoff make sense: it's the line
// most likely to land right around where the clip stops.
async function fetchLyricLine(song: SongResult): Promise<LyricLine | null> {
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(song.artist)}/${encodeURIComponent(song.title)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as LyricsOvhResponse;
    if (!data.lyrics) return null;
    const lines = data.lyrics
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !SECTION_MARKER_RE.test(l) && !SECTION_WORD_RE.test(l) && CLEAN_LINE_RE.test(l));
    if (lines.length < 4) return null;

    const frontPool = lines.slice(0, 6).filter((l) => {
      const wc = l.split(/\s+/).filter(Boolean).length;
      return wc >= 3 && wc <= 8;
    });
    const pick = frontPool[0] ?? lines.find((l) => l.split(/\s+/).filter(Boolean).length >= 2) ?? lines[0]!;
    const words = pick.split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    return { raw: pick, words };
  } catch {
    return null;
  }
}

function blankPattern(words: string[]): string {
  return words
    .map((w) => {
      const trailingPunct = w.match(/[^a-zA-Z0-9']+$/)?.[0] ?? "";
      const core = w.slice(0, w.length - trailingPunct.length);
      return "_".repeat(Math.max(1, core.length)) + trailingPunct;
    })
    .join(" ");
}

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

// Exact match after normalizing, or "close enough" (mostly the same words
// in the same order) so small typos don't wrongly fail a guess.
function isCorrectGuess(guess: string, answer: string): boolean {
  const g = normalizeWords(guess);
  const a = normalizeWords(answer);
  if (g.length === 0 || a.length === 0) return false;
  if (g.join(" ") === a.join(" ")) return true;
  if (Math.abs(g.length - a.length) > 1) return false;
  let hits = 0;
  const len = Math.min(g.length, a.length);
  for (let i = 0; i < len; i++) if (g[i] === a[i]) hits += 1;
  return hits / a.length >= 0.75;
}

interface RoundPick {
  index: number;
  song: SongResult;
  line: LyricLine;
}

// Tries candidate songs in order (skipping ones already used) until one has
// lyrics we can build a round from — not every song has data on lyrics.ovh,
// or a line that survives the filters above, so this may check a handful.
async function pickRound(pool: SongResult[], order: number[], used: number[]): Promise<RoundPick | null> {
  const remaining = order.filter((i) => !used.includes(i));
  const fresh = remaining.filter((i) => !usedTitles.has(pool[i]!.title));
  const candidates = (fresh.length > 0 ? fresh : remaining).slice(0, 20);
  for (const index of candidates) {
    const song = pool[index]!;
    const line = await fetchLyricLine(song);
    if (line) {
      usedTitles.add(song.title);
      return { index, song, line };
    }
  }
  return null;
}

export type LyricPhase = "guessing" | "roundEnd" | "finished";

interface GuessLogEntry {
  id: string;
  playerId: PlayerId;
  text: string;
  correct: boolean;
  at: number;
}

export interface FinishLyricState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  pool: SongResult[];
  poolOrder: number[];
  usedIndices: number[];
  roundIndex: number;
  totalRounds: number;
  title: string;
  artist: string;
  previewUrl: string;
  answer: string;
  blankPattern: string;
  phase: LyricPhase;
  guesses: GuessLogEntry[];
  correctGuessers: PlayerId[];
  roundEndsAt: number | null;
  scores: Record<PlayerId, number>;
}

export interface FinishLyricView {
  hostId: PlayerId;
  roundIndex: number;
  totalRounds: number;
  previewUrl: string;
  blankPattern: string;
  revealedAnswer: string | null;
  revealedTitle: string | null;
  revealedArtist: string | null;
  phase: LyricPhase;
  guesses: { id: string; playerId: PlayerId; text: string | null; correct: boolean; at: number }[];
  correctGuessers: PlayerId[];
  youGuessedCorrectly: boolean;
  roundEndsAt: number | null;
  scores: { playerId: PlayerId; score: number }[];
}

export type FinishLyricAction = { type: "guess"; text: string } | { type: "timeUp" } | { type: "advance" };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

let guessSeq = 0;
function nextGuessId(): string {
  guessSeq += 1;
  return `l${guessSeq}`;
}

export const finishLyric: GameDefinition<FinishLyricState, FinishLyricView, FinishLyricAction> = {
  meta: {
    id: "finish-the-lyric",
    name: "Finish the Lyric",
    tagline: "The song plays, the rest of the line goes blank — type it before anyone else.",
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

    let pool = await searchSongs(genre, decade, 30);
    if (pool.length < 5) pool = await searchSongs("all", "all", 30);
    if (pool.length < 3) throw new Error("Couldn't find any songs to play right now. Try again in a bit.");

    const poolOrder = shuffle(pool.map((_, i) => i));
    const first = await pickRound(pool, poolOrder, []);
    if (!first) throw new Error("Couldn't find any lyrics to build a round from right now (lyrics.ovh might be down). Try again in a bit.");

    const totalRounds = Math.min(Number(options.rounds) || DEFAULT_ROUNDS, pool.length);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;

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
      answer: first.line.raw,
      blankPattern: blankPattern(first.line.words),
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
      const text = action.text.trim().slice(0, 120);
      if (!text) throw new GameActionError("Guess can't be empty.");
      const correct = isCorrectGuess(text, state.answer);
      const entry: GuessLogEntry = { id: nextGuessId(), playerId, text, correct, at: Date.now() };
      let next: FinishLyricState = { ...state, guesses: [...state.guesses.slice(-49), entry] };

      if (correct) {
        const position = state.correctGuessers.length;
        const points = position === 0 ? 3 : position === 1 ? 2 : 1;
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
      const next = await pickRound(state.pool, state.poolOrder, state.usedIndices);
      if (!next) {
        return { ...state, phase: "finished" };
      }
      return {
        ...state,
        roundIndex: nextRoundIndex,
        usedIndices: [...state.usedIndices, next.index],
        title: next.song.title,
        artist: next.song.artist,
        previewUrl: next.song.previewUrl,
        answer: next.line.raw,
        blankPattern: blankPattern(next.line.words),
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
      blankPattern: state.blankPattern,
      revealedAnswer: revealed ? state.answer : null,
      revealedTitle: revealed ? state.title : null,
      revealedArtist: revealed ? state.artist : null,
      phase: state.phase,
      guesses: state.guesses.map((g) => ({
        id: g.id,
        playerId: g.playerId,
        correct: g.correct,
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
