import { GameActionError, GameDefinition, PlayerId } from "@/lib/types";

// A "name that tune" style game: the server fetches a real 30-second preview
// clip for a well-known song from Apple's free, keyless iTunes Search API,
// everyone races to type the title, points awarded by guess order.

interface SongDef {
  title: string;
  artist: string;
}

const SONG_BANK: SongDef[] = [
  { title: "Billie Jean", artist: "Michael Jackson" },
  { title: "Bohemian Rhapsody", artist: "Queen" },
  { title: "Uptown Funk", artist: "Mark Ronson" },
  { title: "Shake It Off", artist: "Taylor Swift" },
  { title: "Sweet Child O' Mine", artist: "Guns N' Roses" },
  { title: "Hey Jude", artist: "The Beatles" },
  { title: "Dancing Queen", artist: "ABBA" },
  { title: "I Want It That Way", artist: "Backstreet Boys" },
  { title: "Rolling in the Deep", artist: "Adele" },
  { title: "Don't Stop Believin'", artist: "Journey" },
  { title: "Smells Like Teen Spirit", artist: "Nirvana" },
  { title: "Livin' on a Prayer", artist: "Bon Jovi" },
  { title: "Africa", artist: "Toto" },
  { title: "Wonderwall", artist: "Oasis" },
  { title: "I Will Survive", artist: "Gloria Gaynor" },
  { title: "Mr. Brightside", artist: "The Killers" },
  { title: "Since U Been Gone", artist: "Kelly Clarkson" },
  { title: "Crazy in Love", artist: "Beyoncé" },
  { title: "Party in the U.S.A.", artist: "Miley Cyrus" },
  { title: "Blinding Lights", artist: "The Weeknd" },
];

const ROUND_MS = 25_000;
const TOTAL_ROUNDS = 8;

interface ITunesResult {
  previewUrl?: string;
  artworkUrl100?: string;
}

async function fetchPreview(song: SongDef): Promise<{ previewUrl: string; artworkUrl: string } | null> {
  const term = encodeURIComponent(`${song.title} ${song.artist}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: ITunesResult[] };
    const hit = data.results?.[0];
    if (!hit?.previewUrl) return null;
    return { previewUrl: hit.previewUrl, artworkUrl: hit.artworkUrl100 ?? "" };
  } catch {
    return null;
  }
}

// Tries songs from the pre-shuffled order (skipping ones already used) until
// one returns a playable clip. Songs that fail to resolve are pushed to the
// back so a later round can retry them if we run out of fresh ones.
async function pickNextSong(songOrder: number[], usedIndices: number[]): Promise<{ index: number; title: string; artist: string; previewUrl: string } | null> {
  const candidates = songOrder.filter((i) => !usedIndices.includes(i));
  for (const index of candidates) {
    const song = SONG_BANK[index]!;
    const preview = await fetchPreview(song);
    if (preview) return { index, title: song.title, artist: song.artist, previewUrl: preview.previewUrl };
  }
  return null;
}

export type TunePhase = "guessing" | "roundEnd" | "finished";

interface GuessLogEntry {
  id: string;
  playerId: PlayerId;
  text: string;
  correct: boolean;
  at: number;
}

export interface NameThatTuneState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  songOrder: number[];
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
  guesses: { id: string; playerId: PlayerId; text: string | null; correct: boolean; at: number }[];
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

function isCorrectGuess(text: string, title: string): boolean {
  const guess = normalize(text);
  const target = normalize(title);
  if (!guess) return false;
  if (guess === target) return true;
  return guess.length >= 4 && target.length >= 4 && target.includes(guess);
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
  },
  async createInitialState(players) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const songOrder = shuffle(SONG_BANK.map((_, i) => i));
    const totalRounds = Math.min(TOTAL_ROUNDS, SONG_BANK.length);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;

    const first = await pickNextSong(songOrder, []);
    if (!first) throw new Error("Couldn't load any song clips right now. Try again in a bit.");

    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      songOrder,
      usedIndices: [first.index],
      roundIndex: 0,
      totalRounds,
      title: first.title,
      artist: first.artist,
      previewUrl: first.previewUrl,
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
      const correct = isCorrectGuess(text, state.title) || isCorrectGuess(text, state.artist);
      const entry: GuessLogEntry = { id: nextGuessId(), playerId, text, correct, at: Date.now() };
      let next: NameThatTuneState = { ...state, guesses: [...state.guesses.slice(-49), entry] };

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
      const next = await pickNextSong(state.songOrder, state.usedIndices);
      if (!next) {
        // Ran out of songs that resolve to a playable clip; end the game early.
        return { ...state, phase: "finished" };
      }
      return {
        ...state,
        roundIndex: nextRoundIndex,
        usedIndices: [...state.usedIndices, next.index],
        title: next.title,
        artist: next.artist,
        previewUrl: next.previewUrl,
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
