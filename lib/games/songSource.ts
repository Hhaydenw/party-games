// Shared "find some real songs" helper used by Name That Tune. Rather than
// storing our own hand-picked song list (which goes stale and is always
// small), this searches Apple's free, keyless iTunes Search API directly
// with a genre/decade-flavored query — e.g. "1980s rock hits" — so the
// *search itself* is the source of "biggest songs of that decade/genre",
// and the same call also returns a working preview clip and cover art for
// every hit, so there's no separate storage or lookup step at all.

export type Genre = "pop" | "rock" | "hiphop" | "country" | "rnb" | "electronic" | "billboard" | "tv";
export type Decade = "1960s" | "1970s" | "1980s" | "1990s" | "2000s" | "2010s" | "2020s";

export const GENRE_CHOICES: { value: string; label: string }[] = [
  { value: "all", label: "Any genre" },
  { value: "pop", label: "Pop" },
  { value: "rock", label: "Rock" },
  { value: "hiphop", label: "Hip-Hop" },
  { value: "country", label: "Country" },
  { value: "rnb", label: "R&B" },
  { value: "electronic", label: "Electronic" },
  { value: "billboard", label: "Billboard Hits" },
  { value: "tv", label: "TV Show Songs" },
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
  billboard: "billboard hot 100",
  tv: "tv show theme",
};

// Apple's real `primaryGenreName` on each track — used to post-filter
// results by *actual* catalog genre metadata instead of trusting the search
// query alone, which otherwise lets e.g. R&B tracks bleed into "electronic"
// results just because they matched the search text. Only applied for the
// handful of genres below that map to a real music genre; "billboard" and
// "tv" aren't genres, so they're left unfiltered.
const GENRE_MATCH: Partial<Record<Genre, RegExp>> = {
  pop: /pop/i,
  rock: /rock/i,
  hiphop: /hip-?hop|rap/i,
  country: /country/i,
  rnb: /r&b|soul/i,
  electronic: /dance|electronic|edm|house|techno/i,
};

export interface SongResult {
  title: string;
  artist: string;
  previewUrl: string;
  artworkUrl: string | null;
}

interface ITunesTrack {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
}

// Filters out cover-band/karaoke/lullaby-version compilations, which rank
// surprisingly high for generic "hits" searches but aren't the real
// recording — matching on artist or album name catches most of them.
const COVER_COMPILATION_RE = /lullaby|tribute|karaoke|made famous|as made popular|cover version|instrumental version|the hit crew|piano tribute/i;
function looksLikeRealRecording(track: ITunesTrack): boolean {
  return !COVER_COMPILATION_RE.test(`${track.artistName ?? ""} ${track.collectionName ?? ""} ${track.trackName ?? ""}`);
}

function upscaleArtwork(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/\d+x\d+bb\.(jpg|png)/, "600x600bb.$1");
}

// Builds a handful of search terms from most-specific to broadest, so a
// narrow combo (e.g. "electronic" + "1960s", which barely exists) still
// falls back to something searchable instead of dead-ending the game.
function buildSearchTerms(genre: string, decade: string): string[] {
  const genreLabel = genre !== "all" ? (GENRE_LABEL[genre] ?? "") : "";
  const decadeLabel = decade !== "all" ? decade : "";
  const terms: string[] = [];
  if (genre === "billboard") terms.push(`${decadeLabel} billboard hot 100`.trim(), "billboard number one hits");
  else if (genre === "tv") terms.push(`${decadeLabel} tv show theme song`.trim(), "songs featured in tv shows");
  else if (genreLabel && decadeLabel) terms.push(`${decadeLabel} ${genreLabel} hits`, `best ${genreLabel} songs ${decadeLabel}`);
  else if (genreLabel) terms.push(`best ${genreLabel} hits`, `top ${genreLabel} songs`);
  else if (decadeLabel) terms.push(`${decadeLabel} greatest hits`, `${decadeLabel} number one songs`);
  else terms.push("today's biggest hits", "greatest hits of all time", "classic hit songs");
  return Array.from(new Set(terms));
}

async function searchOnce(term: string, genre: string): Promise<SongResult[]> {
  // `country=US` pins this to the US storefront/catalog — the closest lever
  // iTunes gives us to "USA songs". It scopes catalog/availability, not song
  // language or artist nationality, so it's not a perfect content filter,
  // but it does keep results to what's distributed in the US market.
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&country=US&limit=100`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ITunesTrack[] };
    const genreRe = GENRE_MATCH[genre as Genre];
    return (data.results ?? [])
      .filter((r) => Boolean(r.trackName && r.artistName && r.previewUrl) && looksLikeRealRecording(r))
      .filter((r) => !genreRe || genreRe.test(r.primaryGenreName ?? ""))
      .map((r) => ({ title: r.trackName!, artist: r.artistName!, previewUrl: r.previewUrl!, artworkUrl: upscaleArtwork(r.artworkUrl100) }));
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
    const hits = await searchOnce(term, genre);
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
