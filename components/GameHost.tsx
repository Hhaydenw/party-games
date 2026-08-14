"use client";

import { PlayerInfo, RoomSummary } from "@/lib/types";
import { useParty } from "@/lib/socketClient";
import GameView from "@/components/GameView";
import PlayerList from "@/components/PlayerList";
import SoundSettingsButton from "@/components/SoundSettingsButton";
import EmoteBar from "@/components/EmoteBar";

// Games whose rounds run on a countdown that the client fires a "timeUp"
// action for once it elapses — the host can nudge that along early instead
// of waiting out a round that's dragging (e.g. everyone's clearly stuck).
// Real-time tick-loop games (Tanks, Void Raiders, ...) and turn-based games
// without a clock aren't in this list since a generic timeUp wouldn't mean
// anything to them.
const SKIPPABLE_GAMES = new Set(["trivia", "drawing", "family-feud", "name-that-tune", "wildest-answer", "price-check", "category-dash"]);

export default function GameHost({ room, me }: { room: RoomSummary; me: PlayerInfo }) {
  const { gameView, sendAction, error, clearError, returnToLobby } = useParty();

  if (!gameView || gameView.gameId !== room.gameId) {
    return <main className="flex min-h-screen items-center justify-center text-slate-400">Loading game…</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold">🎉 Party Games</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            Room <span className="font-semibold tracking-[0.2em] text-gold">{room.code}</span>
          </span>
          <EmoteBar />
          <SoundSettingsButton />
          {me.isHost && room.gameId && SKIPPABLE_GAMES.has(room.gameId) && (
            <button
              className="btn-secondary px-3 py-1.5 text-sm"
              title="Skip the current round's timer early"
              onClick={() => sendAction({ type: "timeUp" })}
            >
              ⏭ Skip round
            </button>
          )}
          {me.isHost && (
            <button className="btn-secondary px-3 py-1.5 text-sm" onClick={returnToLobby}>
              End game
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="cursor-pointer rounded-xl bg-accent/10 px-4 py-2 text-sm text-accent" onClick={clearError}>
          {error} (dismiss)
        </p>
      )}

      <div className="grid flex-1 gap-5 xl:grid-cols-[1fr_280px]">
        <section className="card-surface min-w-0 rounded-3xl p-4 sm:p-6">
          <GameView gameId={gameView.gameId} view={gameView.view} onAction={sendAction} meId={me.id} players={room.players} />
        </section>
        <aside className="card-surface h-fit rounded-3xl p-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Players</h3>
          <PlayerList players={room.players} meId={me.id} />
        </aside>
      </div>
    </main>
  );
}
