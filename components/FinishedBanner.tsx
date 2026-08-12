"use client";

import { PlayerInfo, RoomSummary } from "@/lib/types";
import { useParty } from "@/lib/socketClient";
import GameView from "@/components/GameView";

// Shown right after a game ends. This reuses the exact same view component
// the game used while playing (frozen on its last tick) so players see that
// game's own final scoreboard — points, kills, net worth, whatever's
// relevant to what was actually played — rather than the room's session-wide
// win tally, which now lives in the lobby instead (see Lobby.tsx).
export default function FinishedBanner({ room, me }: { room: RoomSummary; me: PlayerInfo }) {
  const { gameView, returnToLobby, startGame } = useParty();
  const noop = () => {};

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center gap-6 px-6 py-12 text-center">
      <div>
        <p className="text-sm uppercase tracking-widest text-slate-500">Game over</p>
        <h1 className="font-display mt-1 text-4xl font-extrabold">🏆 Good game!</h1>
      </div>

      {gameView && gameView.gameId === room.gameId ? (
        <div className="card-surface w-full rounded-3xl p-6 text-left">
          <GameView gameId={gameView.gameId} view={gameView.view} onAction={noop} meId={me.id} players={room.players} />
        </div>
      ) : (
        <div className="card-surface w-full rounded-3xl p-4">
          {[...room.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <p key={p.id} className={p.id === me.id ? "font-semibold text-gold" : ""}>
                {p.name}
              </p>
            ))}
        </div>
      )}

      {me.isHost ? (
        <div className="flex flex-wrap justify-center gap-3">
          <button className="btn-primary" onClick={startGame}>
            🔁 Play again
          </button>
          <button className="btn-secondary" onClick={returnToLobby}>
            Back to lobby
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Waiting for the host to play again or return to the lobby…</p>
      )}
    </main>
  );
}
