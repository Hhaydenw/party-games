"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ClientToServerEvents, GameOptions, PlayerId, RoomSummary, ServerToClientEvents } from "@/lib/types";
import { syncClockOffset } from "@/lib/serverClock";

export interface StoredSession {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

export interface ChatMessage {
  playerId: string;
  name: string;
  text: string;
  at: number;
}

export interface EmoteEvent {
  id: string;
  playerId: string;
  name: string;
  emoji: string;
  at: number;
}

function sessionKey(code: string) {
  return `party-games:session:${code.toUpperCase()}`;
}

export function loadSession(code: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sessionKey(code));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(sessionKey(session.code), JSON.stringify(session));
}

function clearSession(code: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionKey(code));
}

interface Ctx {
  connected: boolean;
  room: RoomSummary | null;
  gameView: { gameId: string; view: unknown } | null;
  error: string | null;
  chatMessages: ChatMessage[];
  emotes: EmoteEvent[];
  kickedReason: string | null;
  clearError: () => void;
  createRoom: (name: string, color?: string) => Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  joinRoom: (code: string, name: string, color?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  rejoinRoom: (code: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  selectGame: (gameId: string) => void;
  setGameOptions: (options: GameOptions) => void;
  startGame: () => void;
  returnToLobby: () => void;
  setSeriesQueue: (gameIds: string[]) => void;
  startSeries: () => void;
  nextSeriesGame: () => void;
  setTeam: (team: "1" | "2") => void;
  kickPlayer: (playerId: PlayerId) => void;
  sendAction: (action: unknown) => void;
  sendChat: (text: string) => void;
  sendEmote: (emoji: string) => void;
  // Latest Word Grid tile-preview cells per player, cell coordinates only —
  // see `game:tilePreview`'s doc comment in lib/types.ts. Keyed by
  // playerId; consumers should only trust the entry for whoever's actual
  // turn it currently is (a stale entry for anyone else just never gets
  // cleared, since there's nothing to clear it *to* — no one but the
  // active player can legitimately be staging placements).
  tilePreviews: Record<PlayerId, { row: number; col: number }[]>;
  sendTilePreview: (cells: { row: number; col: number }[]) => void;
  currentPlayerId: string | null;
}

const SocketCtx = createContext<Ctx | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [gameView, setGameView] = useState<{ gameId: string; view: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<EmoteEvent[]>([]);
  const [kickedReason, setKickedReason] = useState<string | null>(null);
  const [tilePreviews, setTilePreviews] = useState<Record<string, { row: number; col: number }[]>>({});
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const currentCodeRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;
    let emoteSeq = 0;

    // Clock offset estimate (see lib/serverClock.ts) — re-synced on every
    // (re)connect, since a dropped/restored connection is exactly when a
    // laptop coming back from sleep or a phone switching networks tends to
    // also have let its clock drift further, and periodically thereafter
    // in case of slow drift during a long session.
    function ping(): Promise<number> {
      return new Promise((resolve, reject) => {
        if (!socket.connected) return reject(new Error("not connected"));
        socket.emit("time:sync", resolve);
      });
    }
    socket.on("connect", () => {
      setConnected(true);
      syncClockOffset(ping);
    });
    const resyncInterval = setInterval(() => {
      if (socket.connected) syncClockOffset(ping);
    }, 90_000);
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (summary) => {
      setRoom(summary);
      currentCodeRef.current = summary.code;
    });
    socket.on("game:view", (payload) => setGameView(payload));
    socket.on("error:message", (message) => setError(message));
    socket.on("chat:message", (msg) => setChatMessages((prev) => [...prev.slice(-49), msg]));
    socket.on("room:emote", (payload) => {
      emoteSeq += 1;
      const event: EmoteEvent = { id: `e${emoteSeq}`, ...payload };
      setEmotes((prev) => [...prev.slice(-19), event]);
    });
    socket.on("game:tilePreview", ({ playerId, cells }) => {
      setTilePreviews((prev) => ({ ...prev, [playerId]: cells }));
    });
    socket.on("room:kicked", ({ reason }) => {
      if (currentCodeRef.current) clearSession(currentCodeRef.current);
      setKickedReason(reason);
      setRoom(null);
      setGameView(null);
    });
    socket.on("session", ({ playerId, token, code }) => {
      setCurrentPlayerId(playerId);
      const existing = loadSession(code);
      saveSession({ code, playerId, token, name: existing?.name ?? "" });
    });

    return () => {
      clearInterval(resyncInterval);
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((name: string, color?: string) => {
    return new Promise<{ ok: true; code: string } | { ok: false; error: string }>((resolve) => {
      socketRef.current?.emit("room:create", { name, color }, (res) => {
        if (res.ok) {
          saveSession({ code: res.code, playerId: res.playerId, token: res.token, name });
          setCurrentPlayerId(res.playerId);
          resolve({ ok: true, code: res.code });
        } else {
          resolve(res);
        }
      });
    });
  }, []);

  const joinRoom = useCallback((code: string, name: string, color?: string) => {
    const upper = code.toUpperCase();
    return new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
      socketRef.current?.emit("room:join", { code: upper, name, color }, (res) => {
        if (res.ok) {
          saveSession({ code: upper, playerId: res.playerId, token: res.token, name });
          setCurrentPlayerId(res.playerId);
          resolve({ ok: true });
        } else {
          resolve(res);
        }
      });
    });
  }, []);

  const rejoinRoom = useCallback((code: string) => {
    const upper = code.toUpperCase();
    const session = loadSession(upper);
    if (!session) return Promise.resolve({ ok: false as const, error: "No saved session." });
    return new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
      socketRef.current?.emit("room:rejoin", { code: upper, playerId: session.playerId, token: session.token }, (res) => {
        if (res.ok) setCurrentPlayerId(session.playerId);
        resolve(res);
      });
    });
  }, []);

  const selectGame = useCallback((gameId: string) => socketRef.current?.emit("room:selectGame", { gameId }), []);
  const setGameOptions = useCallback((options: GameOptions) => socketRef.current?.emit("room:setGameOptions", { options }), []);
  const startGame = useCallback(() => socketRef.current?.emit("room:startGame"), []);
  const returnToLobby = useCallback(() => socketRef.current?.emit("room:returnToLobby"), []);
  const setSeriesQueue = useCallback((gameIds: string[]) => socketRef.current?.emit("room:setSeriesQueue", { gameIds }), []);
  const startSeries = useCallback(() => socketRef.current?.emit("room:startSeries"), []);
  const nextSeriesGame = useCallback(() => socketRef.current?.emit("room:nextSeriesGame"), []);
  const setTeam = useCallback((team: "1" | "2") => socketRef.current?.emit("room:setTeam", { team }), []);
  const kickPlayer = useCallback((playerId: PlayerId) => socketRef.current?.emit("room:kickPlayer", { playerId }), []);
  const sendAction = useCallback((action: unknown) => socketRef.current?.emit("game:action", { action }), []);
  const sendChat = useCallback((text: string) => socketRef.current?.emit("chat:send", { text }), []);
  const sendEmote = useCallback((emoji: string) => socketRef.current?.emit("room:emote", { emoji }), []);
  const sendTilePreview = useCallback((cells: { row: number; col: number }[]) => socketRef.current?.emit("game:tilePreview", { cells }), []);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<Ctx>(
    () => ({
      connected,
      room,
      gameView,
      error,
      chatMessages,
      emotes,
      kickedReason,
      clearError,
      createRoom,
      joinRoom,
      rejoinRoom,
      selectGame,
      setGameOptions,
      startGame,
      returnToLobby,
      setSeriesQueue,
      startSeries,
      nextSeriesGame,
      setTeam,
      kickPlayer,
      sendAction,
      sendChat,
      sendEmote,
      tilePreviews,
      sendTilePreview,
      currentPlayerId,
    }),
    [
      connected,
      room,
      gameView,
      error,
      chatMessages,
      emotes,
      kickedReason,
      clearError,
      createRoom,
      joinRoom,
      rejoinRoom,
      selectGame,
      setGameOptions,
      startGame,
      returnToLobby,
      setSeriesQueue,
      startSeries,
      nextSeriesGame,
      setTeam,
      kickPlayer,
      sendAction,
      sendChat,
      sendEmote,
      tilePreviews,
      sendTilePreview,
      currentPlayerId,
    ]
  );

  return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>;
}

export function useParty() {
  const ctx = useContext(SocketCtx);
  if (!ctx) throw new Error("useParty must be used within SocketProvider");
  return ctx;
}
