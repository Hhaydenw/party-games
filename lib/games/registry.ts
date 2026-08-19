import { GameDefinition, GameMeta } from "@/lib/types";
import { uno } from "./uno";
import { trivia } from "./trivia";
import { drawing } from "./drawing";
import { familyFeud } from "./familyFeud";
import { nameThatTune } from "./nameThatTune";
import { monopoly } from "./monopoly";
import { tanks } from "./tanks";
import { wildestAnswer } from "./wildestAnswer";
import { priceCheck } from "./priceCheck";
import { luckySpin } from "./luckySpin";
import { categoryDash } from "./categoryDash";
import { wordGrid } from "./wordGrid";
import { colorMatch } from "./colorMatch";
import { streetSnap } from "./streetSnap";

// Games that are designed and on the roadmap but not built yet. Listed so
// the lobby can show what's coming without pretending they're playable.
export const COMING_SOON: GameMeta[] = [];

export const GAMES: Record<string, GameDefinition<any, any, any>> = {
  [uno.meta.id]: uno,
  [trivia.meta.id]: trivia,
  [drawing.meta.id]: drawing,
  [familyFeud.meta.id]: familyFeud,
  [nameThatTune.meta.id]: nameThatTune,
  [monopoly.meta.id]: monopoly,
  [tanks.meta.id]: tanks,
  [wildestAnswer.meta.id]: wildestAnswer,
  [priceCheck.meta.id]: priceCheck,
  [luckySpin.meta.id]: luckySpin,
  [categoryDash.meta.id]: categoryDash,
  [wordGrid.meta.id]: wordGrid,
  [colorMatch.meta.id]: colorMatch,
  [streetSnap.meta.id]: streetSnap,
};

export function getGame(id: string): GameDefinition<any, any, any> | undefined {
  return GAMES[id];
}

export function listAvailableGames(): GameMeta[] {
  return Object.values(GAMES).map((g) => g.meta);
}
