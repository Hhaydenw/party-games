"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ClientToServerEvents, GameOptions, RoomSummary, ServerToClientEvents } from "@/lib/types";

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

interface Ctx {
  connected: boolean;
  room: RoomSummary | null;
  gameView: { gameId: string; view: unknown } | null;
  error: string | null;
  chatMessages: ChatMessage[];
  clearError: () => void;
  createRoom: (name: string) => Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  joinRoom: (code: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  rejoinRoom: (code: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  selectGame: (gameId: string) => void;
  setGameOptions: (options: GameOptions) => void;
  startGame: () => void;
  returnToLobby: () => void;
  setSeriesQueue: (gameIds: string[]) => void;
  startSeries: () => void;
  nextSeriesGame: () => void;
  sendAction: (action: unknown) => void;
  sendChat: (text: string) => void;
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
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (summary) => setRoom(summary));
    socket.on("game:view", (payload) => setGameView(payload));
    socket.on("error:message", (message) => setError(message));
    socket.on("chat:message", (msg) => setChatMessages((prev) => [...prev.slice(-49), msg]));
    socket.on("session", ({ playerId, token, code }) => {
      setCurrentPlayerId(playerId);
      const existing = loadSession(code);
      saveSession({ code, playerId, token, name: existing?.name ?? "" });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    return new Promise<{ ok: true; code: string } | { ok: false; error: string }>((resolve) => {
      socketRef.current?.emit("room:create", { name }, (res) => {
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

  const joinRoom = useCallback((code: string, name: string) => {
    const upper = code.toUpperCase();
    return new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
      socketRef.current?.emit("room:join", { code: upper, name }, (res) => {
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
  const sendAction = useCallback((action: unknown) => socketRef.current?.emit("game:action", { action }), []);
  const sendChat = useCallback((text: string) => socketRef.current?.emit("chat:send", { text }), []);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<Ctx>(
    () => ({
      connected,
      room,
      gameView,
      error,
      chatMessages,
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
      sendAction,
      sendChat,
      currentPlayerId,
    }),
    [
      connected,
      room,
      gameView,
      error,
      chatMessages,
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
      sendAction,
      sendChat,
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
