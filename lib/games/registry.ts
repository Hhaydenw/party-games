import { GameDefinition, GameMeta } from "@/lib/types";
import { connect4 } from "./connect4";
import { uno } from "./uno";
import { bluffTrivia } from "./bluffTrivia";

// Games that are designed and on the roadmap but not built yet. Listed so
// the lobby can show what's coming without pretending they're playable.
export const COMING_SOON: GameMeta[] = [
  { id: "monopoly", name: "Monopoly", tagline: "Buy, trade, and bankrupt your friends.", category: "board", minPlayers: 2, maxPlayers: 6, comingSoon: true },
  { id: "life", name: "The Game of Life", tagline: "Careers, kids, and a race to retirement.", category: "board", minPlayers: 2, maxPlayers: 6, comingSoon: true },
  { id: "family-feud", name: "Family Feud", tagline: "Guess the top survey answers before the other team.", category: "party", minPlayers: 4, maxPlayers: 12, comingSoon: true },
  { id: "name-that-tune", name: "Name That Tune", tagline: "Race to identify songs from short clips.", category: "party", minPlayers: 2, maxPlayers: 12, comingSoon: true },
  { id: "hearts", name: "Hearts", tagline: "Classic trick-taking card game.", category: "card", minPlayers: 3, maxPlayers: 4, comingSoon: true },
];

export const GAMES: Record<string, GameDefinition<any, any, any>> = {
  [connect4.meta.id]: connect4,
  [uno.meta.id]: uno,
  [bluffTrivia.meta.id]: bluffTrivia,
};

export function getGame(id: string): GameDefinition<any, any, any> | undefined {
  return GAMES[id];
}

export function listAvailableGames(): GameMeta[] {
  return Object.values(GAMES).map((g) => g.meta);
}
