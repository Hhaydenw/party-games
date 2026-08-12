import { GameMeta } from "@/lib/types";
import { uno } from "./uno";
import { trivia } from "./trivia";
import { drawing } from "./drawing";
import { familyFeud } from "./familyFeud";
import { nameThatTune } from "./nameThatTune";
import { finishLyricMeta } from "./finishLyric.meta";
import { life } from "./life";
import { monopoly } from "./monopoly";
import { tanks } from "./tanks";

// Client-safe game listing for the lobby's game picker and settings panel.
// Every game here except Finish the Lyric is imported by its full module
// (they're all client-safe — nothing but `fetch`, which works in the
// browser too). Finish the Lyric is the one exception: its full engine
// transitively imports `lib/transcribe.ts` (Node-only: child_process,
// ffmpeg-static, a local Whisper model) for real audio transcription, which
// can never be part of a browser bundle — so this imports only its
// lightweight `finishLyric.meta.ts` instead. See `lib/games/registry.ts`
// for the full server-side `GAMES` map (used only by `lib/rooms.ts`, never
// imported from a client component).
export const COMING_SOON: GameMeta[] = [];

export const GAME_METAS: GameMeta[] = [
  uno.meta,
  trivia.meta,
  drawing.meta,
  familyFeud.meta,
  nameThatTune.meta,
  finishLyricMeta,
  life.meta,
  monopoly.meta,
  tanks.meta,
];

export function listAvailableGames(): GameMeta[] {
  return GAME_METAS;
}
