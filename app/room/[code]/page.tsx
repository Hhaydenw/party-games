"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadSession, useParty } from "@/lib/socketClient";
import JoinForm from "@/components/JoinForm";
import Lobby from "@/components/Lobby";
import GameHost from "@/components/GameHost";
import FinishedBanner from "@/components/FinishedBanner";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const { room, connected, currentPlayerId, rejoinRoom } = useParty();
  const [rejoinState, setRejoinState] = useState<"checking" | "none" | "failed" | "ok">("checking");

  useEffect(() => {
    if (!connected || !code) return;
    const session = loadSession(code);
    if (!session) {
      setRejoinState("none");
      return;
    }
    let cancelled = false;
    rejoinRoom(code).then((res) => {
      if (cancelled) return;
      setRejoinState(res.ok ? "ok" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [connected, code, rejoinRoom]);

  if (!connected || rejoinState === "checking") {
    return <Centered>Connecting…</Centered>;
  }

  const inRoom = !!room && room.code === code && !!currentPlayerId;

  if (!inRoom) {
    return <JoinForm code={code} />;
  }

  const me = room!.players.find((p) => p.id === currentPlayerId);
  if (!me) return <Centered>Waiting for room…</Centered>;

  if (room!.status === "lobby") {
    return <Lobby room={room!} me={me} />;
  }
  if (room!.status === "in-game") {
    return <GameHost room={room!} me={me} />;
  }
  return <FinishedBanner room={room!} me={me} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center text-slate-400">{children}</main>;
}
