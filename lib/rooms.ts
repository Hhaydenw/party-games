import { customAlphabet, nanoid } from "nanoid";
import { GameActionError, GameMeta, GameOptions, PlayerId, PlayerInfo, RoomStatus, RoomSummary } from "@/lib/types";
import { getGame } from "@/lib/games/registry";

// Fills in defaults for any missing/invalid option and drops anything not
// declared in the game's meta, so a game's reducer can trust `options` is
// well-formed without re-validating it itself.
function resolveOptions(meta: GameMeta, stored: GameOptions): GameOptions {
  const resolved: GameOptions = {};
  for (const def of meta.options ?? []) {
    const raw = stored[def.key];
    if (def.type === "number") {
      const n = typeof raw === "number" ? raw : Number(raw);
      resolved[def.key] = Number.isFinite(n) ? Math.min(def.max, Math.max(def.min, Math.round(n))) : def.default;
    } else {
      const valid = def.choices.some((c) => c.value === raw);
      resolved[def.key] = valid ? (raw as string) : def.default;
    }
  }
  return resolved;
}

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
  gameOptions: GameOptions;
  gameState: unknown;
  createdAt: number;
  lastActivity: number;
  // Series Mode.
  seriesQueue: string[];
  seriesActive: boolean;
  seriesIndex: number;
  seriesPoints: Record<PlayerId, number>;
}

const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours of inactivity

// Placement points awarded per game in a series, indexed by finish position
// (0 = 1st place). Positions beyond this list all get the same 1 point.
// This is position-based, not tie-aware: if a game's own ranking doesn't
// distinguish a tie, both players still land on adjacent positions here
// (e.g. a 2-way tie for 1st gets 10 and 7, not 10 and 10) — a deliberate
// simplification rather than needing every game to report grouped ranks.
const SERIES_PLACEMENT_POINTS = [10, 7, 5, 3];
function pointsForPlacement(index: number): number {
  return SERIES_PLACEMENT_POINTS[index] ?? 1;
}

export class RoomError extends Error {}

class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  // Serializes async game operations (createInitialState/applyAction may await
  // a network call, e.g. Name That Tune fetching a song) per room, so two
  // actions arriving close together can't race and clobber each other's state.
  private locks = new Map<string, Promise<unknown>>();
  // Real-time games (declaring `tick` + `meta.tickIntervalMs`) get a
  // periodic simulation step independent of player actions, e.g. tanks
  // moving each frame rather than on discrete turns.
  private tickIntervals = new Map<string, NodeJS.Timeout>();
  private tickListener: ((code: string) => void) | null = null;

  // Registered once by server/index.ts so a tick that changes state can
  // trigger a broadcast without RoomManager needing to know about sockets.
  onTick(listener: (code: string) => void) {
    this.tickListener = listener;
  }

  private stopTicking(code: string) {
    const handle = this.tickIntervals.get(code);
    if (handle) {
      clearInterval(handle);
      this.tickIntervals.delete(code);
    }
  }

  private maybeStartTicking(code: string) {
    this.stopTicking(code);
    const room = this.rooms.get(code);
    if (!room || room.status !== "in-game" || !room.gameId) return;
    const game = getGame(room.gameId);
    if (!game?.tick) return;
    const intervalMs = game.meta.tickIntervalMs ?? 50;
    const handle = setInterval(async () => {
      const changed = await this.tickGame(code);
      if (!changed) {
        this.stopTicking(code);
        return;
      }
      this.tickListener?.(code);
    }, intervalMs);
    this.tickIntervals.set(code, handle);
  }

  private async tickGame(code: string): Promise<boolean> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      if (!room || room.status !== "in-game" || !room.gameId) return false;
      const game = getGame(room.gameId);
      if (!game?.tick) return false;
      const intervalMs = game.meta.tickIntervalMs ?? 50;
      room.gameState = await game.tick(room.gameState, intervalMs);
      if (game.isGameOver(room.gameState)) {
        room.status = "finished";
        const winnerIds = new Set(game.getWinnerIds(room.gameState));
        for (const pid of winnerIds) {
          const p = room.players.get(pid);
          if (p) p.score += 1;
        }
        if (room.seriesActive) this.awardSeriesPoints(room, game, room.gameState);
      }
      this.touch(room);
      return true;
    });
  }

  // Converts a finished game's own ranking (or, failing that, its winners)
  // into placement points added to the room's running series total.
  private awardSeriesPoints(room: InternalRoom, game: NonNullable<ReturnType<typeof getGame>>, gameState: unknown) {
    let ranking: PlayerId[];
    if (game.getRanking) {
      ranking = game.getRanking(gameState);
    } else {
      const winners = new Set(game.getWinnerIds(gameState));
      ranking = [...room.playerOrder.filter((id) => winners.has(id)), ...room.playerOrder.filter((id) => !winners.has(id))];
    }
    ranking.forEach((pid, i) => {
      room.seriesPoints[pid] = (room.seriesPoints[pid] ?? 0) + pointsForPlacement(i);
    });
  }

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
      gameOptions: {},
      gameState: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      seriesQueue: [],
      seriesActive: false,
      seriesIndex: -1,
      seriesPoints: {},
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
    room.gameOptions = {};
    this.touch(room);
  }

  setGameOptions(code: string, requesterId: PlayerId, options: GameOptions): void {
    const room = this.getRoomOrThrow(code);
    this.assertHost(room, requesterId);
    if (room.status !== "lobby") throw new RoomError("Can't change settings mid-game.");
    if (!room.gameId) throw new RoomError("Pick a game first.");
    room.gameOptions = { ...room.gameOptions, ...options };
    this.touch(room);
  }

  // Shared by single-game startGame and Series Mode's startSeries/
  // nextSeriesGame — validates player counts, builds initial state, and
  // flips the room into "in-game".
  private async startGameInternal(room: InternalRoom, gameId: string, options: GameOptions): Promise<void> {
    const game = getGame(gameId);
    if (!game) throw new RoomError("Unknown game.");
    const players = room.playerOrder.map((id) => room.players.get(id)!).filter((p) => p.connected);
    if (players.length < game.meta.minPlayers) throw new RoomError(`${game.meta.name} needs at least ${game.meta.minPlayers} players.`);
    if (players.length > game.meta.maxPlayers) throw new RoomError(`${game.meta.name} supports at most ${game.meta.maxPlayers} players.`);
    try {
      room.gameState = await game.createInitialState(players, resolveOptions(game.meta, options));
    } catch (err) {
      throw new RoomError(err instanceof Error ? err.message : "Failed to start the game.");
    }
    room.gameId = gameId;
    room.status = "in-game";
    this.touch(room);
    this.maybeStartTicking(room.code);
  }

  async startGame(code: string, requesterId: PlayerId): Promise<void> {
    return this.withLock(code, async () => {
      const room = this.getRoomOrThrow(code);
      this.assertHost(room, requesterId);
      if (!room.gameId) throw new RoomError("Pick a game first.");
      await this.startGameInternal(room, room.gameId, room.gameOptions);
    });
  }

  // Host sets an ordered lineup of games (each played with its default
  // options) before starting a series — a lightweight v1 rather than
  // exposing full per-game options-in-queue customization.
  setSeriesQueue(code: string, requesterId: PlayerId, gameIds: string[]): void {
    const room = this.getRoomOrThrow(code);
    this.assertHost(room, requesterId);
    if (room.status !== "lobby") throw new RoomError("Can't change the series lineup mid-game.");
    const filtered = gameIds.filter((id) => Boolean(getGame(id)));
    if (filtered.length < 2) throw new RoomError("Add at least 2 games to build a series.");
    room.seriesQueue = filtered;
    this.touch(room);
  }

  async startSeries(code: string, requesterId: PlayerId): Promise<void> {
    return this.withLock(code, async () => {
      const room = this.getRoomOrThrow(code);
      this.assertHost(room, requesterId);
      if (room.seriesQueue.length < 2) throw new RoomError("Set up a series with at least 2 games first.");
      room.seriesActive = true;
      room.seriesIndex = 0;
      room.seriesPoints = {};
      for (const pid of room.playerOrder) room.seriesPoints[pid] = 0;
      await this.startGameInternal(room, room.seriesQueue[0]!, {});
    });
  }

  async nextSeriesGame(code: string, requesterId: PlayerId): Promise<void> {
    return this.withLock(code, async () => {
      const room = this.getRoomOrThrow(code);
      this.assertHost(room, requesterId);
      if (!room.seriesActive) throw new RoomError("No series in progress.");
      if (room.status !== "finished") throw new RoomError("Finish the current game first.");
      const nextIndex = room.seriesIndex + 1;
      if (nextIndex >= room.seriesQueue.length) throw new RoomError("That was the last game in the series.");
      room.seriesIndex = nextIndex;
      await this.startGameInternal(room, room.seriesQueue[nextIndex]!, {});
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
      this.stopTicking(code);
      const winnerIds = new Set(game.getWinnerIds(room.gameState));
      for (const pid of winnerIds) {
        const p = room.players.get(pid);
        if (p) p.score += 1;
      }
      if (room.seriesActive) this.awardSeriesPoints(room, game, room.gameState);
    }
    this.touch(room);
  }

  returnToLobby(code: string, requesterId: PlayerId): void {
    const room = this.getRoomOrThrow(code);
    this.assertHost(room, requesterId);
    this.stopTicking(code);
    room.status = "lobby";
    room.gameId = null;
    room.gameOptions = {};
    room.gameState = null;
    room.seriesQueue = [];
    room.seriesActive = false;
    room.seriesIndex = -1;
    room.seriesPoints = {};
    this.touch(room);
  }

  getSummary(code: string): RoomSummary {
    const room = this.getRoomOrThrow(code);
    const meta = room.gameId ? getGame(room.gameId)?.meta : undefined;
    return {
      code: room.code,
      status: room.status,
      players: room.playerOrder.map((id) => {
        const { token: _token, ...pub } = room.players.get(id)!;
        return pub;
      }),
      gameId: room.gameId,
      hostId: room.hostId,
      gameOptions: meta ? resolveOptions(meta, room.gameOptions) : {},
      seriesQueue: room.seriesQueue,
      seriesIndex: room.seriesIndex,
      seriesActive: room.seriesActive,
      seriesPoints: room.seriesPoints,
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
        this.stopTicking(code);
        this.rooms.delete(code);
      }
    }
  }
}

export const roomManager = new RoomManager();
