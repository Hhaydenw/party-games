"use client";

import { PlayerInfo, RoomSummary } from "@/lib/types";
import { useParty } from "@/lib/socketClient";
import PlayerList from "@/components/PlayerList";

export default function FinishedBanner({ room, me }: { room: RoomSummary; me: PlayerInfo }) {
  const { returnToLobby } = useParty();
  const topScore = Math.max(0, ...room.players.map((p) => p.score));
  const winners = room.players.filter((p) => p.score === topScore && topScore > 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div>
        <p className="text-sm uppercase tracking-widest text-slate-500">Game over</p>
        <h1 className="font-display mt-1 text-4xl font-extrabold">
          🏆 {winners.length ? winners.map((w) => w.name).join(" & ") : "Good game!"}
        </h1>
      </div>
      <div className="card-surface w-full rounded-3xl p-4">
        <PlayerList players={[...room.players].sort((a, b) => b.score - a.score)} meId={me.id} />
      </div>
      {me.isHost ? (
        <button className="btn-primary" onClick={returnToLobby}>
          Back to lobby
        </button>
      ) : (
        <p className="text-sm text-slate-400">Waiting for the host to return to the lobby…</p>
      )}
    </main>
  );
}
