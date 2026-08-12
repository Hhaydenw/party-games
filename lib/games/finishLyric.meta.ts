import { GameMeta } from "@/lib/types";
import { DECADE_CHOICES, GENRE_CHOICES } from "./songSource";

// Finish the Lyric's `meta` lives in its own tiny, client-safe file,
// separate from `finishLyric.ts`'s full engine. The engine transitively
// imports `lib/transcribe.ts` (Node-only: child_process, ffmpeg-static, the
// local Whisper model) for real cutoff detection, which can never be part
// of a browser bundle. The lobby only needs this metadata (name, tagline,
// player counts, options) to render the game picker and settings panel —
// see `lib/games/gameList.ts`, which is what the client actually imports.
export const DEFAULT_ROUNDS = 8;

export const finishLyricMeta: GameMeta = {
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
};
