// Core shared types used by both the server and the client.

export type PlayerId = string;

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  connected: boolean;
  isHost: boolean;
  score: number;
  // Hex color chosen at join time (or auto-assigned), used for avatar
  // initials/dots throughout the UI so players are recognizable at a glance
  // across the player list, team pickers, and per-game views.
  color: string;
  // Someone who joined while a game was already in progress rather than
  // from the lobby — they're visible in the room, can chat/react, but
  // don't take a player slot and can't act in the game. Cleared back to a
  // normal player automatically once the room returns to the lobby.
  isSpectator: boolean;
}

export type RoomStatus = "lobby" | "in-game" | "finished";

export interface RoomSummary {
  code: string;
  status: RoomStatus;
  players: PlayerInfo[];
  gameId: string | null;
  hostId: PlayerId | null;
  gameOptions: GameOptions;
  // Series Mode: the host queues up several games in advance; points from
  // each one's final ranking accumulate into `seriesPoints` as the room
  // works through `seriesQueue`. Empty/false/zero when not running a series.
  seriesQueue: string[];
  seriesIndex: number; // index into seriesQueue of the game currently playing/just finished
  seriesActive: boolean;
  seriesPoints: Record<PlayerId, number>;
  // Pre-game team picker for team-based games (Family Feud, Tanks in teams
  // mode): each player who has chosen a side maps to "1" or "2" here.
  // Generic labels rather than a game's own team ids ("A"/"B", "red"/"blue")
  // since this is set in the lobby before any specific game's state exists;
  // each team game's own createInitialState maps "1"/"2" to its own ids.
  teamAssignments: Record<PlayerId, "1" | "2">;
}

// A configurable setting a game exposes in the lobby before it starts (e.g.
// "number of rounds", "song genre"). The host adjusts these; everyone sees
// the current values.
export interface GameOptionNumberDef {
  key: string;
  label: string;
  type: "number";
  min: number;
  max: number;
  default: number;
  step?: number;
}
export interface GameOptionSelectDef {
  key: string;
  label: string;
  type: "select";
  choices: { value: string; label: string }[];
  default: string;
}
export type GameOptionDef = GameOptionNumberDef | GameOptionSelectDef;
export type GameOptions = Record<string, number | string>;

export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  category: "card" | "board" | "party";
  minPlayers: number;
  maxPlayers: number;
  comingSoon?: boolean;
  options?: GameOptionDef[];
  // If set alongside `tick`, the room manager runs a periodic simulation
  // step this often (ms) while the game is in progress — for real-time
  // games (e.g. continuous movement) rather than purely turn-based ones.
  tickIntervalMs?: number;
}

// A game plugin. `S` is the full authoritative server-side state,
// `V` is what an individual player is allowed to see, `A` is an action a
// player can submit.
//
// `createInitialState` and `applyAction` may return a Promise. Most games are
// pure and synchronous (their return value just resolves immediately); a game
// that needs to hit an external API for round setup (e.g. fetching a song
// clip) can `async`/`await` inside them instead.
export interface GameDefinition<S = unknown, V = unknown, A = unknown> {
  meta: GameMeta;
  createInitialState(players: PlayerInfo[], options: GameOptions): S | Promise<S>;
  applyAction(state: S, playerId: PlayerId, action: A): S | Promise<S>;
  // Optional: advances a real-time game's simulation by `dtMs`, independent
  // of any player action (e.g. moving tanks/bullets). Paired with
  // `meta.tickIntervalMs`.
  tick?(state: S, dtMs: number): S | Promise<S>;
  getPlayerView(state: S, playerId: PlayerId, players: PlayerInfo[]): V;
  isGameOver(state: S): boolean;
  getWinnerIds(state: S): PlayerId[];
  // Optional: full best-to-worst finish order, used by Series Mode to award
  // placement points across games with completely different scoring scales.
  // Only meaningful once `isGameOver` is true. Games that don't implement
  // this fall back to "winners tied for 1st, everyone else tied for last".
  getRanking?(state: S): PlayerId[];
}

export class GameActionError extends Error {}

// ---- Socket.IO event payloads ----

export interface ServerToClientEvents {
  "room:state": (room: RoomSummary) => void;
  "game:view": (payload: { gameId: string; view: unknown }) => void;
  "game:ended": (payload: { winnerIds: PlayerId[] }) => void;
  "session": (payload: { playerId: PlayerId; token: string; code: string }) => void;
  "error:message": (message: string) => void;
  "chat:message": (payload: { playerId: PlayerId; name: string; text: string; at: number }) => void;
  // Ephemeral, Google Meet-style floating reactions — never stored in room
  // state, just relayed live to everyone currently in the room.
  "room:emote": (payload: { playerId: PlayerId; name: string; emoji: string; at: number }) => void;
  // Sent directly to a kicked player's own socket so their client can show
  // why they were bounced back to the join screen, distinct from a normal
  // disconnect/room-closed case.
  "room:kicked": (payload: { reason: string }) => void;
  // Ephemeral "here's where I'm about to place a tile" hint for Word Grid —
  // cell coordinates only, never the letter, and never stored in game
  // state; purely a live courtesy so opponents can see activity happening
  // during someone's turn instead of a board that looks frozen until they
  // commit.
  "game:tilePreview": (payload: { playerId: PlayerId; cells: { row: number; col: number }[] }) => void;
}

export interface ClientToServerEvents {
  "room:create": (payload: { name: string; color?: string }, cb: (res: { ok: true; code: string; playerId: PlayerId; token: string } | { ok: false; error: string }) => void) => void;
  "room:join": (payload: { code: string; name: string; color?: string }, cb: (res: { ok: true; playerId: PlayerId; token: string } | { ok: false; error: string }) => void) => void;
  "room:rejoin": (payload: { code: string; playerId: PlayerId; token: string }, cb: (res: { ok: true } | { ok: false; error: string }) => void) => void;
  "room:selectGame": (payload: { gameId: string }) => void;
  "room:setGameOptions": (payload: { options: GameOptions }) => void;
  "room:startGame": () => void;
  "room:returnToLobby": () => void;
  "room:setSeriesQueue": (payload: { gameIds: string[] }) => void;
  "room:startSeries": () => void;
  "room:nextSeriesGame": () => void;
  "room:setTeam": (payload: { team: "1" | "2" }) => void;
  "room:kickPlayer": (payload: { playerId: PlayerId }) => void;
  "game:action": (payload: { action: unknown }) => void;
  "chat:send": (payload: { text: string }) => void;
  "room:emote": (payload: { emoji: string }) => void;
  "game:tilePreview": (payload: { cells: { row: number; col: number }[] }) => void;
  // Plain round-trip ping used to estimate clock offset against the
  // server's clock — see lib/serverClock.ts. No payload; the server just
  // acks with its own current timestamp.
  "time:sync": (cb: (serverNow: number) => void) => void;
}
