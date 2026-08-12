import { GameDefinition } from "@/lib/types";
import { uno } from "./uno";
import { trivia } from "./trivia";
import { drawing } from "./drawing";
import { familyFeud } from "./familyFeud";
import { nameThatTune } from "./nameThatTune";
import { finishLyric } from "./finishLyric";
import { life } from "./life";
import { monopoly } from "./monopoly";
import { tanks } from "./tanks";

// Server-only: the full game engines, including Finish the Lyric's, which
// transitively needs Node built-ins for real audio transcription (see
// `lib/transcribe.ts`). This module must only ever be imported from
// server-side code (`lib/rooms.ts`) — never from a client component. The
// lobby's game picker uses `lib/games/gameList.ts` instead, which is
// client-safe.
export const GAMES: Record<string, GameDefinition<any, any, any>> = {
  [uno.meta.id]: uno,
  [trivia.meta.id]: trivia,
  [drawing.meta.id]: drawing,
  [familyFeud.meta.id]: familyFeud,
  [nameThatTune.meta.id]: nameThatTune,
  [finishLyric.meta.id]: finishLyric,
  [life.meta.id]: life,
  [monopoly.meta.id]: monopoly,
  [tanks.meta.id]: tanks,
};

export function getGame(id: string): GameDefinition<any, any, any> | undefined {
  return GAMES[id];
}
