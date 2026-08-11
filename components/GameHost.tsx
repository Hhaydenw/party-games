"use client";

import { PlayerInfo, RoomSummary } from "@/lib/types";
import { useParty } from "@/lib/socketClient";
import Connect4View from "@/components/games/Connect4View";
import UnoView from "@/components/games/UnoView";
import BluffTriviaView from "@/components/games/BluffTriviaView";
import DrawingView from "@/components/games/DrawingView";
import FamilyFeudView from "@/components/games/FamilyFeudView";
import NameThatTuneView from "@/components/games/NameThatTuneView";
import LifeView from "@/components/games/LifeView";
import MonopolyView from "@/components/games/MonopolyView";
import PlayerList from "@/components/PlayerList";

export default function GameHost({ room, me }: { room: RoomSummary; me: PlayerInfo }) {
  const { gameView, sendAction, error, clearError, returnToLobby } = useParty();

  if (!gameView || gameView.gameId !== room.gameId) {
    return <main className="flex min-h-screen items-center justify-center text-slate-400">Loading game…</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold">🎉 Party Games</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            Room <span className="font-semibold tracking-[0.2em] text-gold">{room.code}</span>
          </span>
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

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <section className="card-surface rounded-3xl p-6">
          {gameView.gameId === "connect4" && (
            <Connect4View view={gameView.view as any} onAction={sendAction} meId={me.id} players={room.players} />
          )}
          {gameView.gameId === "uno" && (
            <UnoView view={gameView.view as any} onAction={sendAction} meId={me.id} players={room.players} />
          )}
          {gameView.gameId === "bluff-trivia" && (
            <BluffTriviaView view={gameView.view as any} onAction={sendAction} meId={me.id} players={room.players} />
          )}
          {gameView.gameId === "drawing" && (
            <DrawingView view={gameView.view as any} onAction={sendAction} meId={me.id} players={room.players} />
          )}
          {gameView.gameId === "family-feud" && (
            <FamilyFeudView view={gameView.view as any} onAction={sendAction} meId={me.id} players={room.players} />
          )}
          {gameView.gameId === "name-that-tune" && (
            <NameThatTuneView view={gameView.view as any} onAction={sendAction} meId={me.id} players={room.players} />
          )}
          {gameView.gameId === "life" && <LifeView view={gameView.view as any} onAction={sendAction} meId={me.id} players={room.players} />}
          {gameView.gameId === "monopoly" && <MonopolyView view={gameView.view as any} onAction={sendAction} meId={me.id} players={room.players} />}
        </section>
        <aside className="card-surface h-fit rounded-3xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Players</h3>
          <PlayerList players={room.players} meId={me.id} />
        </aside>
      </div>
    </main>
  );
}
