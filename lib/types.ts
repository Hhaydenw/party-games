// Core shared types used by both the server and the client.

export type PlayerId = string;

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  connected: boolean;
  isHost: boolean;
  score: number;
}

export type RoomStatus = "lobby" | "in-game" | "finished";

export interface RoomSummary {
  code: string;
  status: RoomStatus;
  players: PlayerInfo[];
  gameId: string | null;
  hostId: PlayerId | null;
}

export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  category: "card" | "board" | "party";
  minPlayers: number;
  maxPlayers: number;
  comingSoon?: boolean;
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
  createInitialState(players: PlayerInfo[]): S | Promise<S>;
  applyAction(state: S, playerId: PlayerId, action: A): S | Promise<S>;
  getPlayerView(state: S, playerId: PlayerId, players: PlayerInfo[]): V;
  isGameOver(state: S): boolean;
  getWinnerIds(state: S): PlayerId[];
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
}

export interface ClientToServerEvents {
  "room:create": (payload: { name: string }, cb: (res: { ok: true; code: string; playerId: PlayerId; token: string } | { ok: false; error: string }) => void) => void;
  "room:join": (payload: { code: string; name: string }, cb: (res: { ok: true; playerId: PlayerId; token: string } | { ok: false; error: string }) => void) => void;
  "room:rejoin": (payload: { code: string; playerId: PlayerId; token: string }, cb: (res: { ok: true } | { ok: false; error: string }) => void) => void;
  "room:selectGame": (payload: { gameId: string }) => void;
  "room:startGame": () => void;
  "room:returnToLobby": () => void;
  "game:action": (payload: { action: unknown }) => void;
  "chat:send": (payload: { text: string }) => void;
}
