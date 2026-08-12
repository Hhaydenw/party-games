import { GameOptions, PlayerId, PlayerInfo } from "@/lib/types";

// Shared by every team-based game: reads the lobby's pre-game team picker
// (see Lobby.tsx / room.teamAssignments), smuggled through as a reserved
// `__teams` field on options (JSON-encoded PlayerId -> "1"|"2") by
// lib/rooms.ts's startGameInternal. Anyone who didn't pick a side gets
// distributed to whichever team is currently smaller, so choosing teams in
// the lobby is opt-in — a quick-start with nobody picking still works
// exactly like the old fully-random split.
export function assignTeams<T extends string>(players: PlayerInfo[], options: GameOptions, teamIds: readonly [T, T]): Record<PlayerId, T> {
  let explicit: Record<string, "1" | "2"> = {};
  if (typeof options.__teams === "string") {
    try {
      explicit = JSON.parse(options.__teams);
    } catch {
      explicit = {};
    }
  }

  const assignment: Record<PlayerId, T> = {};
  const counts = { [teamIds[0]]: 0, [teamIds[1]]: 0 } as Record<T, number>;
  const unassigned: PlayerInfo[] = [];

  for (const p of players) {
    const pick = explicit[p.id];
    if (pick === "1" || pick === "2") {
      const team = teamIds[Number(pick) - 1] as T;
      assignment[p.id] = team;
      counts[team] += 1;
    } else {
      unassigned.push(p);
    }
  }

  // Shuffle so the fallback distribution isn't always in join order.
  const shuffled = unassigned.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as PlayerInfo, shuffled[i] as PlayerInfo];
  }
  for (const p of shuffled) {
    const team = counts[teamIds[0]]! <= counts[teamIds[1]]! ? teamIds[0] : teamIds[1];
    assignment[p.id] = team;
    counts[team] += 1;
  }

  return assignment;
}
