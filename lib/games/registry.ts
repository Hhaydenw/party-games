import { GameDefinition, GameMeta } from "@/lib/types";
import { connect4 } from "./connect4";
import { uno } from "./uno";
import { bluffTrivia } from "./bluffTrivia";
import { drawing } from "./drawing";
import { familyFeud } from "./familyFeud";
import { nameThatTune } from "./nameThatTune";
import { life } from "./life";
import { monopoly } from "./monopoly";

// Games that are designed and on the roadmap but not built yet. Listed so
// the lobby can show what's coming without pretending they're playable.
export const COMING_SOON: GameMeta[] = [];

export const GAMES: Record<string, GameDefinition<any, any, any>> = {
  [connect4.meta.id]: connect4,
  [uno.meta.id]: uno,
  [bluffTrivia.meta.id]: bluffTrivia,
  [drawing.meta.id]: drawing,
  [familyFeud.meta.id]: familyFeud,
  [nameThatTune.meta.id]: nameThatTune,
  [life.meta.id]: life,
  [monopoly.meta.id]: monopoly,
};

export function getGame(id: string): GameDefinition<any, any, any> | undefined {
  return GAMES[id];
}

export function listAvailableGames(): GameMeta[] {
  return Object.values(GAMES).map((g) => g.meta);
}
