"use client";

import { PlayerInfo, RoomSummary } from "@/lib/types";
import { useParty } from "@/lib/socketClient";
import { listAvailableGames } from "@/lib/games/registry";
import GameView from "@/components/GameView";

// Shown right after a game ends. This reuses the exact same view component
// the game used while playing (frozen on its last tick) so players see that
// game's own final scoreboard — points, kills, net worth, whatever's
// relevant to what was actually played — rather than the room's session-wide
// win tally, which now lives in the lobby instead (see Lobby.tsx).
export default function FinishedBanner({ room, me }: { room: RoomSummary; me: PlayerInfo }) {
  const { gameView, returnToLobby, startGame, nextSeriesGame } = useParty();
  const noop = () => {};

  const inSeries = room.seriesActive;
  const isLastSeriesGame = inSeries && room.seriesIndex + 1 >= room.seriesQueue.length;
  const games = listAvailableGames();
  const nameFor = (id: string) => (id === me.id ? "You" : room.players.find((p) => p.id === id)?.name ?? "…");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col items-center gap-6 px-4 py-10 text-center sm:px-6 lg:px-8 lg:py-12">
      <div>
        <p className="text-sm uppercase tracking-widest text-slate-500">
          {inSeries ? `Game ${room.seriesIndex + 1} of ${room.seriesQueue.length} — series` : "Game over"}
        </p>
        <h1 className="font-display mt-1 text-4xl font-extrabold">
          {inSeries && isLastSeriesGame ? "🏆 Series complete!" : "🏆 Good game!"}
        </h1>
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

      {inSeries && (
        <div className="card-surface w-full rounded-3xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">🏆 Series standings</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {room.players
              .map((p) => ({ p, points: room.seriesPoints[p.id] ?? 0 }))
              .sort((a, b) => b.points - a.points)
              .map(({ p, points }) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span className={p.id === me.id ? "font-semibold text-gold" : "text-slate-300"}>{nameFor(p.id)}</span>
                  <span className="text-slate-400">{points} pts</span>
                </li>
              ))}
          </ul>
          {!isLastSeriesGame && (
            <p className="mt-2 text-[11px] text-slate-500">
              Next up: {games.find((g) => g.id === room.seriesQueue[room.seriesIndex + 1])?.name ?? "…"}
            </p>
          )}
        </div>
      )}

      {me.isHost ? (
        <div className="flex flex-wrap justify-center gap-3">
          {inSeries ? (
            isLastSeriesGame ? (
              <button className="btn-secondary" onClick={returnToLobby}>
                Back to lobby
              </button>
            ) : (
              <button className="btn-primary" onClick={nextSeriesGame}>
                ▶ Next game in series
              </button>
            )
          ) : (
            <>
              <button className="btn-primary" onClick={startGame}>
                🔁 Play again
              </button>
              <button className="btn-secondary" onClick={returnToLobby}>
                Back to lobby
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          {inSeries
            ? isLastSeriesGame
              ? "Waiting for the host to return to the lobby…"
              : "Waiting for the host to start the next game…"
            : "Waiting for the host to play again or return to the lobby…"}
        </p>
      )}
    </main>
  );
}
