import { createServer } from "node:http";
import next from "next";
import { Server, Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@/lib/types";
import { roomManager, RoomError } from "@/lib/rooms";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const hostname = "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

interface SocketMeta {
  code: string;
  playerId: string;
}

const socketMeta = new Map<string, SocketMeta>();

function roomChannel(code: string) {
  return `room:${code}`;
}

function broadcastRoomState(io: Server<ClientToServerEvents, ServerToClientEvents>, code: string) {
  let summary;
  try {
    summary = roomManager.getSummary(code);
  } catch {
    return; // room no longer exists
  }
  io.to(roomChannel(code)).emit("room:state", summary);

  const socketsInRoom = io.sockets.adapter.rooms.get(roomChannel(code));
  if (!socketsInRoom) return;
  for (const socketId of socketsInRoom) {
    const meta = socketMeta.get(socketId);
    if (!meta) continue;
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const gameView = roomManager.getPlayerGameView(code, meta.playerId);
    if (gameView) socket.emit("game:view", gameView);
    if (summary.status === "finished" && summary.gameId) {
      // winnerIds already reflected in player scores in summary; client can diff.
    }
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
  });

  // Real-time games (e.g. Tanks) advance on a server-side timer independent
  // of player actions; RoomManager calls back here whenever a tick changes
  // state so it gets broadcast just like any other update.
  roomManager.onTick((code) => broadcastRoomState(io, code));

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    socket.on("room:create", ({ name }, cb) => {
      try {
        const { code, playerId, token } = roomManager.createRoom(name);
        socketMeta.set(socket.id, { code, playerId });
        socket.join(roomChannel(code));
        socket.emit("session", { playerId, token, code });
        cb({ ok: true, code, playerId, token });
        broadcastRoomState(io, code);
      } catch (err) {
        cb({ ok: false, error: err instanceof Error ? err.message : "Failed to create room." });
      }
    });

    socket.on("room:join", ({ code, name }, cb) => {
      try {
        const upper = code.trim().toUpperCase();
        const { playerId, token } = roomManager.joinRoom(upper, name);
        socketMeta.set(socket.id, { code: upper, playerId });
        socket.join(roomChannel(upper));
        socket.emit("session", { playerId, token, code: upper });
        cb({ ok: true, playerId, token });
        broadcastRoomState(io, upper);
      } catch (err) {
        cb({ ok: false, error: err instanceof Error ? err.message : "Failed to join room." });
      }
    });

    socket.on("room:rejoin", ({ code, playerId, token }, cb) => {
      try {
        const upper = code.trim().toUpperCase();
        roomManager.rejoin(upper, playerId, token);
        socketMeta.set(socket.id, { code: upper, playerId });
        socket.join(roomChannel(upper));
        cb({ ok: true });
        broadcastRoomState(io, upper);
      } catch (err) {
        cb({ ok: false, error: err instanceof Error ? err.message : "Failed to reconnect." });
      }
    });

    socket.on("room:selectGame", ({ gameId }) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        roomManager.selectGame(meta.code, meta.playerId, gameId);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("room:setGameOptions", ({ options }) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        roomManager.setGameOptions(meta.code, meta.playerId, options);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("room:startGame", async () => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        await roomManager.startGame(meta.code, meta.playerId);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("room:setSeriesQueue", ({ gameIds }) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        roomManager.setSeriesQueue(meta.code, meta.playerId, gameIds);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("room:startSeries", async () => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        await roomManager.startSeries(meta.code, meta.playerId);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("room:nextSeriesGame", async () => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        await roomManager.nextSeriesGame(meta.code, meta.playerId);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("room:setTeam", ({ team }) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        roomManager.setTeam(meta.code, meta.playerId, team);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("room:kickPlayer", ({ playerId: targetId }) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        roomManager.kickPlayer(meta.code, meta.playerId, targetId);
        // Find the kicked player's own socket (if connected) and evict them
        // from the room channel so they stop receiving broadcasts, with a
        // dedicated event so their client can show why, distinct from a
        // normal disconnect.
        for (const [socketId, m] of socketMeta) {
          if (m.code === meta.code && m.playerId === targetId) {
            const targetSocket = io.sockets.sockets.get(socketId);
            targetSocket?.emit("room:kicked", { reason: "The host removed you from the room." });
            targetSocket?.leave(roomChannel(meta.code));
            socketMeta.delete(socketId);
          }
        }
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("room:emote", ({ emoji }) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      let summary;
      try {
        summary = roomManager.getSummary(meta.code);
      } catch {
        return;
      }
      const player = summary.players.find((p) => p.id === meta.playerId);
      if (!player) return;
      const allowed = ["👍", "❤️", "😂", "🎉", "👏", "😮", "🔥", "👎"];
      if (!allowed.includes(emoji)) return;
      io.to(roomChannel(meta.code)).emit("room:emote", { playerId: meta.playerId, name: player.name, emoji, at: Date.now() });
    });

    socket.on("room:returnToLobby", () => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        roomManager.returnToLobby(meta.code, meta.playerId);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("game:action", async ({ action }) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      try {
        await roomManager.applyGameAction(meta.code, meta.playerId, action);
        broadcastRoomState(io, meta.code);
      } catch (err) {
        socket.emit("error:message", err instanceof RoomError ? err.message : "Something went wrong.");
      }
    });

    socket.on("chat:send", ({ text }) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      const trimmed = text.trim().slice(0, 280);
      if (!trimmed) return;
      let summary;
      try {
        summary = roomManager.getSummary(meta.code);
      } catch {
        return;
      }
      const player = summary.players.find((p) => p.id === meta.playerId);
      if (!player) return;
      io.to(roomChannel(meta.code)).emit("chat:message", { playerId: meta.playerId, name: player.name, text: trimmed, at: Date.now() });
    });

    socket.on("disconnect", () => {
      const meta = socketMeta.get(socket.id);
      socketMeta.delete(socket.id);
      if (!meta) return;
      roomManager.markDisconnected(meta.code, meta.playerId);
      broadcastRoomState(io, meta.code);
    });
  });

  setInterval(() => roomManager.sweepStaleRooms(), 15 * 60 * 1000);

  httpServer.listen(port, hostname, () => {
    console.log(`> Party Games ready on http://localhost:${port}`);
  });
});
