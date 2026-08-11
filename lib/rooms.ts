import { customAlphabet, nanoid } from "nanoid";
import { GameActionError, PlayerId, PlayerInfo, RoomStatus, RoomSummary } from "@/lib/types";
import { getGame } from "@/lib/games/registry";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const genCode = customAlphabet(ROOM_CODE_ALPHABET, 4);

interface InternalPlayer extends PlayerInfo {
  token: string;
}

interface InternalRoom {
  code: string;
  status: RoomStatus;
  players: Map<PlayerId, InternalPlayer>;
  playerOrder: PlayerId[];
  hostId: PlayerId | null;
  gameId: string | null;
  gameState: unknown;
  createdAt: number;
  lastActivity: number;
}

const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours of inactivity

export class RoomError extends Error {}

class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  // Serializes async game operations (createInitialState/applyAction may await
  // a network call, e.g. Name That Tune fetching a song) per room, so two
  // actions arriving close together can't race and clobber each other's state.
  private locks = new Map<string, Promise<unknown>>();

  private async withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(code) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    this.locks.set(
      code,
      run.catch(() => undefined)
    );
    return run;
  }

  private makeCode(): string {
    let code = genCode();
    let attempts = 0;
    while (this.rooms.has(code) && attempts < 20) {
      code = genCode();
      attempts++;
    }
    return code;
  }

  private touch(room: InternalRoom) {
    room.lastActivity = Date.now();
  }

  private getRoomOrThrow(code: string): InternalRoom {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new RoomError("Room not found. Check the code and try again.");
    return room;
  }

  createRoom(name: string): { code: string; playerId: PlayerId; token: string } {
    const trimmed = name.trim().slice(0, 24) || "Player";
    const code = this.makeCode();
    const playerId = nanoid(10);
    const token = nanoid(24);
    const player: InternalPlayer = { id: playerId, name: trimmed, connected: true, isHost: true, score: 0, token };
    const room: InternalRoom = {
      code,
      status: "lobby",
      players: new Map([[playerId, player]]),
      playerOrder: [playerId],
      hostId: playerId,
      gameId: null,
      gameState: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    return { code, playerId, token };
  }

  joinRoom(code: string, name: string): { playerId: PlayerId; token: string } {
    const room = this.getRoomOrThrow(code);
    if (room.status !== "lobby") throw new RoomError("This room is mid-game. Wait for it to finish or ask the host to return to the lobby.");
    if (room.players.size >= 16) throw new RoomError("This room is full.");
    const trimmed = name.trim().slice(0, 24) || "Player";
    const takenNames = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    let finalName = trimmed;
    let suffix = 2;
    while (takenNames.has(finalName.toLowerCase())) {
      finalName = `${trimmed} (${suffix})`;
      suffix++;
    }
    const playerId = nanoid(10);
    const token = nanoid(24);
    const player: InternalPlayer = { id: playerId, name: finalName, connected: true, isHost: false, score: 0, token };
    room.players.set(playerId, player);
    room.playerOrder.push(playerId);
    this.touch(room);
    return { playerId, token };
  }

  rejoin(code: string, playerId: PlayerId, token: string): void {
    const room = this.getRoomOrThrow(code);
    const player = room.players.get(playerId);
    if (!player || player.token !== token) throw new RoomError("Couldn't reconnect you to that room.");
    player.connected = true;
    this.touch(room);
  }

  markDisconnected(code: string, playerId: PlayerId): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.get(playerId);
    if (player) player.connected = false;
    this.touch(room);
  }

  selectGame(code: string, requesterId: PlayerId, gameId: string): void {
    const room = this.getRoomOrThrow(code);
    this.assertHost(room, requesterId);
    if (room.status !== "lobby") throw new RoomError("Finish the current game before picking a new one.");
    if (!getGame(gameId)) throw new RoomError("Unknown game.");
    room.gameId = gameId;
    this.touch(room);
  }

  async startGame(code: string, requesterId: PlayerId): Promise<void> {
    return this.withLock(code, async () => {
      const room = this.getRoomOrThrow(code);
      this.assertHost(room, requesterId);
      if (!room.gameId) throw new RoomError("Pick a game first.");
      const game = getGame(room.gameId);
      if (!game) throw new RoomError("Unknown game.");
      const players = room.playerOrder.map((id) => room.players.get(id)!).filter((p) => p.connected);
      if (players.length < game.meta.minPlayers) throw new RoomError(`${game.meta.name} needs at least ${game.meta.minPlayers} players.`);
      if (players.length > game.meta.maxPlayers) throw new RoomError(`${game.meta.name} supports at most ${game.meta.maxPlayers} players.`);
      try {
        room.gameState = await game.createInitialState(players);
      } catch (err) {
        throw new RoomError(err instanceof Error ? err.message : "Failed to start the game.");
      }
      room.status = "in-game";
      this.touch(room);
    });
  }

  async applyGameAction(code: string, playerId: PlayerId, action: unknown): Promise<void> {
    return this.withLock(code, () => this.applyGameActionLocked(code, playerId, action));
  }

  private async applyGameActionLocked(code: string, playerId: PlayerId, action: unknown): Promise<void> {
    const room = this.getRoomOrThrow(code);
    if (room.status !== "in-game" || !room.gameId) throw new RoomError("No game is in progress.");
    const game = getGame(room.gameId);
    if (!game) throw new RoomError("Unknown game.");
    try {
      room.gameState = await game.applyAction(room.gameState, playerId, action);
    } catch (err) {
      if (err instanceof GameActionError) throw new RoomError(err.message);
      throw err;
    }
    if (game.isGameOver(room.gameState)) {
      room.status = "finished";
      const winnerIds = new Set(game.getWinnerIds(room.gameState));
      for (const pid of winnerIds) {
        const p = room.players.get(pid);
        if (p) p.score += 1;
      }
    }
    this.touch(room);
  }

  returnToLobby(code: string, requesterId: PlayerId): void {
    const room = this.getRoomOrThrow(code);
    this.assertHost(room, requesterId);
    room.status = "lobby";
    room.gameId = null;
    room.gameState = null;
    this.touch(room);
  }

  getSummary(code: string): RoomSummary {
    const room = this.getRoomOrThrow(code);
    return {
      code: room.code,
      status: room.status,
      players: room.playerOrder.map((id) => {
        const { token: _token, ...pub } = room.players.get(id)!;
        return pub;
      }),
      gameId: room.gameId,
      hostId: room.hostId,
    };
  }

  getPlayerGameView(code: string, playerId: PlayerId): { gameId: string; view: unknown } | null {
    const room = this.getRoomOrThrow(code);
    if (!room.gameId || room.gameState === null) return null;
    const game = getGame(room.gameId);
    if (!game) return null;
    const players = room.playerOrder.map((id) => room.players.get(id)!);
    return { gameId: room.gameId, view: game.getPlayerView(room.gameState, playerId, players) };
  }

  getRoomStatus(code: string): RoomStatus {
    return this.getRoomOrThrow(code).status;
  }

  roomExists(code: string): boolean {
    return this.rooms.has(code.toUpperCase());
  }

  private assertHost(room: InternalRoom, requesterId: PlayerId) {
    if (room.hostId !== requesterId) throw new RoomError("Only the host can do that.");
  }

  // Called periodically to drop long-abandoned rooms from memory.
  sweepStaleRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const allDisconnected = [...room.players.values()].every((p) => !p.connected);
      if (now - room.lastActivity > ROOM_TTL_MS || (allDisconnected && now - room.lastActivity > 30 * 60 * 1000)) {
        this.rooms.delete(code);
      }
    }
  }
}

export const roomManager = new RoomManager();
