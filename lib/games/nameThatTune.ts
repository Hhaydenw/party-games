import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";

// A "name that tune" style game: the server fetches a real 30-second preview
// clip for a well-known song from Apple's free, keyless iTunes Search API,
// everyone races to type the title (and artist, for a bonus), points
// awarded by guess order.

type Genre = "pop" | "rock" | "hiphop" | "country" | "rnb" | "electronic";
type Decade = "1960s" | "1970s" | "1980s" | "1990s" | "2000s" | "2010s" | "2020s";

interface SongDef {
  title: string;
  artist: string;
  genre: Genre;
  decade: Decade;
}

const SONG_BANK: SongDef[] = [
  { title: "Billie Jean", artist: "Michael Jackson", genre: "pop", decade: "1980s" },
  { title: "Bohemian Rhapsody", artist: "Queen", genre: "rock", decade: "1970s" },
  { title: "Uptown Funk", artist: "Mark Ronson", genre: "pop", decade: "2010s" },
  { title: "Shake It Off", artist: "Taylor Swift", genre: "pop", decade: "2010s" },
  { title: "Sweet Child O' Mine", artist: "Guns N' Roses", genre: "rock", decade: "1980s" },
  { title: "Hey Jude", artist: "The Beatles", genre: "rock", decade: "1960s" },
  { title: "Dancing Queen", artist: "ABBA", genre: "pop", decade: "1970s" },
  { title: "I Want It That Way", artist: "Backstreet Boys", genre: "pop", decade: "1990s" },
  { title: "Rolling in the Deep", artist: "Adele", genre: "pop", decade: "2010s" },
  { title: "Don't Stop Believin'", artist: "Journey", genre: "rock", decade: "1980s" },
  { title: "Smells Like Teen Spirit", artist: "Nirvana", genre: "rock", decade: "1990s" },
  { title: "Livin' on a Prayer", artist: "Bon Jovi", genre: "rock", decade: "1980s" },
  { title: "Africa", artist: "Toto", genre: "rock", decade: "1980s" },
  { title: "Wonderwall", artist: "Oasis", genre: "rock", decade: "1990s" },
  { title: "I Will Survive", artist: "Gloria Gaynor", genre: "pop", decade: "1970s" },
  { title: "Mr. Brightside", artist: "The Killers", genre: "rock", decade: "2000s" },
  { title: "Since U Been Gone", artist: "Kelly Clarkson", genre: "pop", decade: "2000s" },
  { title: "Crazy in Love", artist: "Beyoncé", genre: "rnb", decade: "2000s" },
  { title: "Party in the U.S.A.", artist: "Miley Cyrus", genre: "pop", decade: "2000s" },
  { title: "Blinding Lights", artist: "The Weeknd", genre: "pop", decade: "2020s" },
  { title: "Shape of You", artist: "Ed Sheeran", genre: "pop", decade: "2010s" },
  { title: "Hotel California", artist: "Eagles", genre: "rock", decade: "1970s" },
  { title: "bad guy", artist: "Billie Eilish", genre: "pop", decade: "2010s" },
  { title: "Old Town Road", artist: "Lil Nas X", genre: "hiphop", decade: "2010s" },
  { title: "Thriller", artist: "Michael Jackson", genre: "pop", decade: "1980s" },
  { title: "Paint It Black", artist: "The Rolling Stones", genre: "rock", decade: "1960s" },
  { title: "Superstition", artist: "Stevie Wonder", genre: "rnb", decade: "1970s" },
  { title: "Get Lucky", artist: "Daft Punk", genre: "electronic", decade: "2010s" },
  { title: "Umbrella", artist: "Rihanna", genre: "pop", decade: "2000s" },
  { title: "Toxic", artist: "Britney Spears", genre: "pop", decade: "2000s" },
  { title: "HUMBLE.", artist: "Kendrick Lamar", genre: "hiphop", decade: "2010s" },
  { title: "Lose Yourself", artist: "Eminem", genre: "hiphop", decade: "2000s" },
  { title: "Fancy", artist: "Iggy Azalea", genre: "hiphop", decade: "2010s" },
  { title: "Take On Me", artist: "a-ha", genre: "pop", decade: "1980s" },
  { title: "Sweet Caroline", artist: "Neil Diamond", genre: "pop", decade: "1970s" },
  { title: "Girls Just Want to Have Fun", artist: "Cyndi Lauper", genre: "pop", decade: "1980s" },
  { title: "Jolene", artist: "Dolly Parton", genre: "country", decade: "1970s" },
  { title: "Friends in Low Places", artist: "Garth Brooks", genre: "country", decade: "1990s" },
  { title: "Before He Cheats", artist: "Carrie Underwood", genre: "country", decade: "2000s" },
  { title: "Cruise", artist: "Florida Georgia Line", genre: "country", decade: "2010s" },
  { title: "Chandelier", artist: "Sia", genre: "pop", decade: "2010s" },
  { title: "Someone Like You", artist: "Adele", genre: "pop", decade: "2010s" },
  { title: "Royals", artist: "Lorde", genre: "pop", decade: "2010s" },
  { title: "Havana", artist: "Camila Cabello", genre: "pop", decade: "2010s" },
  { title: "Despacito", artist: "Luis Fonsi", genre: "pop", decade: "2010s" },
  { title: "Uptown Girl", artist: "Billy Joel", genre: "pop", decade: "1980s" },
  { title: "September", artist: "Earth, Wind & Fire", genre: "rnb", decade: "1970s" },
  { title: "Le Freak", artist: "Chic", genre: "rnb", decade: "1970s" },
  { title: "Stayin' Alive", artist: "Bee Gees", genre: "pop", decade: "1970s" },
  { title: "I Wanna Dance with Somebody", artist: "Whitney Houston", genre: "pop", decade: "1980s" },
  { title: "Like a Prayer", artist: "Madonna", genre: "pop", decade: "1980s" },
  { title: "Vogue", artist: "Madonna", genre: "pop", decade: "1990s" },
  { title: "No Scrubs", artist: "TLC", genre: "rnb", decade: "1990s" },
  { title: "Waterfalls", artist: "TLC", genre: "rnb", decade: "1990s" },
  { title: "My Heart Will Go On", artist: "Celine Dion", genre: "pop", decade: "1990s" },
  { title: "Torn", artist: "Natalie Imbruglia", genre: "pop", decade: "1990s" },
  { title: "Complicated", artist: "Avril Lavigne", genre: "pop", decade: "2000s" },
  { title: "Hey Ya!", artist: "OutKast", genre: "hiphop", decade: "2000s" },
  { title: "In Da Club", artist: "50 Cent", genre: "hiphop", decade: "2000s" },
  { title: "Chasing Cars", artist: "Snow Patrol", genre: "rock", decade: "2000s" },
  { title: "Use Somebody", artist: "Kings of Leon", genre: "rock", decade: "2000s" },
  { title: "Seven Nation Army", artist: "The White Stripes", genre: "rock", decade: "2000s" },
  { title: "Somebody That I Used to Know", artist: "Gotye", genre: "pop", decade: "2010s" },
  { title: "Radioactive", artist: "Imagine Dragons", genre: "rock", decade: "2010s" },
  { title: "Counting Stars", artist: "OneRepublic", genre: "pop", decade: "2010s" },
  { title: "Happy", artist: "Pharrell Williams", genre: "pop", decade: "2010s" },
  { title: "Can't Stop the Feeling!", artist: "Justin Timberlake", genre: "pop", decade: "2010s" },
  { title: "Levitating", artist: "Dua Lipa", genre: "pop", decade: "2020s" },
  { title: "Watermelon Sugar", artist: "Harry Styles", genre: "pop", decade: "2020s" },
  { title: "drivers license", artist: "Olivia Rodrigo", genre: "pop", decade: "2020s" },
  { title: "As It Was", artist: "Harry Styles", genre: "pop", decade: "2020s" },
  { title: "Anti-Hero", artist: "Taylor Swift", genre: "pop", decade: "2020s" },
];

const GENRE_CHOICES: { value: string; label: string }[] = [
  { value: "all", label: "Any genre" },
  { value: "pop", label: "Pop" },
  { value: "rock", label: "Rock" },
  { value: "hiphop", label: "Hip-Hop" },
  { value: "country", label: "Country" },
  { value: "rnb", label: "R&B" },
  { value: "electronic", label: "Electronic" },
];

const DECADE_CHOICES: { value: string; label: string }[] = [
  { value: "all", label: "Any decade" },
  { value: "1960s", label: "60s" },
  { value: "1970s", label: "70s" },
  { value: "1980s", label: "80s" },
  { value: "1990s", label: "90s" },
  { value: "2000s", label: "2000s" },
  { value: "2010s", label: "2010s" },
  { value: "2020s", label: "2020s" },
];

const ROUND_MS = 25_000;
const DEFAULT_ROUNDS = 8;

// Tracks song titles already played, across games, for the lifetime of this
// server process — so replaying the game in the same room (or a different
// one) doesn't serve the same songs again until the pool is exhausted.
const playedTitles = new Set<string>();

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

// Tries songs from the pre-shuffled order (skipping ones already used this
// game) until one returns a playable clip. Prefers songs not yet played in
// any previous game on this server; if that pool runs dry, falls back to the
// full candidate list rather than dead-ending the game.
async function pickNextSong(songOrder: number[], usedIndices: number[], bank: SongDef[]): Promise<{ index: number; title: string; artist: string; previewUrl: string } | null> {
  const remaining = songOrder.filter((i) => !usedIndices.includes(i));
  const fresh = remaining.filter((i) => !playedTitles.has(bank[i]!.title));
  const candidates = fresh.length > 0 ? fresh : remaining;
  for (const index of candidates) {
    const song = bank[index]!;
    const preview = await fetchPreview(song);
    if (preview) {
      playedTitles.add(song.title);
      return { index, title: song.title, artist: song.artist, previewUrl: preview.previewUrl };
    }
  }
  return null;
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
  bank: SongDef[]; // the filtered candidate pool for this game (genre/decade applied)
  songOrder: number[]; // shuffled indices into `bank`
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
    let bank = SONG_BANK.filter((s) => (genre === "all" || s.genre === genre) && (decade === "all" || s.decade === decade));
    if (bank.length < 3) bank = SONG_BANK; // filter too narrow to be playable; fall back to everything

    const songOrder = shuffle(bank.map((_, i) => i));
    const totalRounds = Math.min(Number(options.rounds) || DEFAULT_ROUNDS, bank.length);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;

    const first = await pickNextSong(songOrder, [], bank);
    if (!first) throw new Error("Couldn't load any song clips right now. Try again in a bit.");

    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      bank,
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
      const next = await pickNextSong(state.songOrder, state.usedIndices, state.bank);
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
