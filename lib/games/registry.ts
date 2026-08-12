import { GameDefinition, GameMeta } from "@/lib/types";
import { uno } from "./uno";
import { trivia } from "./trivia";
import { drawing } from "./drawing";
import { familyFeud } from "./familyFeud";
import { nameThatTune } from "./nameThatTune";
import { life } from "./life";
import { monopoly } from "./monopoly";
import { tanks } from "./tanks";

// Games that are designed and on the roadmap but not built yet. Listed so
// the lobby can show what's coming without pretending they're playable.
export const COMING_SOON: GameMeta[] = [];

export const GAMES: Record<string, GameDefinition<any, any, any>> = {
  [uno.meta.id]: uno,
  [trivia.meta.id]: trivia,
  [drawing.meta.id]: drawing,
  [familyFeud.meta.id]: familyFeud,
  [nameThatTune.meta.id]: nameThatTune,
  [life.meta.id]: life,
  [monopoly.meta.id]: monopoly,
  [tanks.meta.id]: tanks,
};

export function getGame(id: string): GameDefinition<any, any, any> | undefined {
  return GAMES[id];
}

export function listAvailableGames(): GameMeta[] {
  return Object.values(GAMES).map((g) => g.meta);
}
