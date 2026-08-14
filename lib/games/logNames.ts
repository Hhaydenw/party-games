import { PlayerId, PlayerInfo } from "@/lib/types";

// Several games write their turn/activity log with the raw player id baked
// into the string at the moment the action happens (state has no access to
// display names — only the room's player list does), then substitute ids
// for names here, once, when building each player's view. Used by every
// game that shows a visible log — the substitution has to happen somewhere,
// and doing it in one shared place means it can't quietly get skipped when
// a new game's `getPlayerView` forgets to accept/use the `players` param.
export function substituteNames(log: string[], order: PlayerId[], players: PlayerInfo[]): string[] {
  const nameOf = (id: PlayerId) => players.find((p) => p.id === id)?.name ?? id;
  return log.map((line) => {
    let out = line;
    for (const id of order) out = out.split(id).join(nameOf(id));
    return out;
  });
}
