// Shared "find some real songs" helper used by both Name That Tune and
// Finish the Lyric. Rather than storing our own hand-picked song list (which
// goes stale and is always small), this searches Apple's free, keyless
// iTunes Search API directly with a genre/decade-flavored query — e.g.
// "1980s rock hits" — so the *search itself* is the source of "biggest
// songs of that decade/genre", and the same call also returns a working
// 30-second preview URL for every hit, so there's no separate storage or
// lookup step at all.

export type Genre = "pop" | "rock" | "hiphop" | "country" | "rnb" | "electronic";
export type Decade = "1960s" | "1970s" | "1980s" | "1990s" | "2000s" | "2010s" | "2020s";

export const GENRE_CHOICES: { value: string; label: string }[] = [
  { value: "all", label: "Any genre" },
  { value: "pop", label: "Pop" },
  { value: "rock", label: "Rock" },
  { value: "hiphop", label: "Hip-Hop" },
  { value: "country", label: "Country" },
  { value: "rnb", label: "R&B" },
  { value: "electronic", label: "Electronic" },
];

export const DECADE_CHOICES: { value: string; label: string }[] = [
  { value: "all", label: "Any decade" },
  { value: "1960s", label: "60s" },
  { value: "1970s", label: "70s" },
  { value: "1980s", label: "80s" },
  { value: "1990s", label: "90s" },
  { value: "2000s", label: "2000s" },
  { value: "2010s", label: "2010s" },
  { value: "2020s", label: "2020s" },
];

const GENRE_LABEL: Record<string, string> = {
  pop: "pop",
  rock: "rock",
  hiphop: "hip hop",
  country: "country",
  rnb: "r&b",
  electronic: "electronic dance",
};

export interface SongResult {
  title: string;
  artist: string;
  previewUrl: string;
}

interface ITunesTrack {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
}

// Filters out cover-band/karaoke/lullaby-version compilations, which rank
// surprisingly high for generic "hits" searches but aren't the real
// recording — matching on artist or album name catches most of them.
const COVER_COMPILATION_RE = /lullaby|tribute|karaoke|made famous|as made popular|cover version|instrumental version|the hit crew|piano tribute/i;
function looksLikeRealRecording(track: ITunesTrack): boolean {
  return !COVER_COMPILATION_RE.test(`${track.artistName ?? ""} ${track.collectionName ?? ""}`);
}

// Builds a handful of search terms from most-specific to broadest, so a
// narrow combo (e.g. "electronic" + "1960s", which barely exists) still
// falls back to something searchable instead of dead-ending the game.
function buildSearchTerms(genre: string, decade: string): string[] {
  const genreLabel = genre !== "all" ? GENRE_LABEL[genre] : "";
  const decadeLabel = decade !== "all" ? decade : "";
  const terms: string[] = [];
  if (genreLabel && decadeLabel) terms.push(`${decadeLabel} ${genreLabel} hits`, `best ${genreLabel} songs ${decadeLabel}`);
  else if (genreLabel) terms.push(`best ${genreLabel} hits`, `top ${genreLabel} songs`);
  else if (decadeLabel) terms.push(`${decadeLabel} greatest hits`, `${decadeLabel} number one songs`);
  else terms.push("today's biggest hits", "greatest hits of all time", "classic hit songs");
  return Array.from(new Set(terms));
}

async function searchOnce(term: string): Promise<SongResult[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=100`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ITunesTrack[] };
    return (data.results ?? [])
      .filter((r) => Boolean(r.trackName && r.artistName && r.previewUrl) && looksLikeRealRecording(r))
      .map((r) => ({ title: r.trackName!, artist: r.artistName!, previewUrl: r.previewUrl! }));
  } catch {
    return [];
  }
}

// Searches iTunes with progressively broader terms until there's a
// reasonably sized, deduplicated pool of real songs (with working preview
// clips) to build a game's rounds from.
export async function searchSongs(genre: string, decade: string, minPoolSize = 15): Promise<SongResult[]> {
  const terms = buildSearchTerms(genre, decade);
  const seen = new Set<string>();
  const pool: SongResult[] = [];
  for (const term of terms) {
    const hits = await searchOnce(term);
    for (const hit of hits) {
      const key = `${hit.title}|${hit.artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(hit);
    }
    if (pool.length >= minPoolSize) break;
  }
  return pool;
}
