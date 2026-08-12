"use client";

import { COMING_SOON, listAvailableGames } from "@/lib/games/registry";
import { PlayerInfo, RoomSummary } from "@/lib/types";
import { useParty } from "@/lib/socketClient";
import InviteLink from "@/components/InviteLink";
import PlayerList from "@/components/PlayerList";
import ChatBox from "@/components/ChatBox";
import GameOptionsPanel from "@/components/GameOptionsPanel";
import SoundSettingsButton from "@/components/SoundSettingsButton";

const CATEGORY_LABEL: Record<string, string> = { card: "🃏 Card", board: "🎲 Board", party: "📱 Party" };

export default function Lobby({ room, me }: { room: RoomSummary; me: PlayerInfo }) {
  const { selectGame, startGame, error, clearError } = useParty();
  const games = listAvailableGames();
  const selected = games.find((g) => g.id === room.gameId);
  const connectedCount = room.players.filter((p) => p.connected).length;

  const canStart =
    me.isHost && !!selected && connectedCount >= selected.minPlayers && connectedCount <= selected.maxPlayers;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold">🎉 Party Games</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            Room <span className="font-semibold tracking-[0.2em] text-gold">{room.code}</span>
          </span>
          <SoundSettingsButton />
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <section className="card-surface rounded-3xl p-6">
          <h2 className="mb-4 text-lg font-semibold">Choose a game</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {games.map((g) => (
              <button
                key={g.id}
                disabled={!me.isHost}
                onClick={() => selectGame(g.id)}
                className={`rounded-2xl border p-4 text-left transition disabled:cursor-default ${
                  room.gameId === g.id
                    ? "border-accent bg-accent/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {CATEGORY_LABEL[g.category]}
                </div>
                <div className="text-lg font-bold">{g.name}</div>
                <p className="mt-1 text-sm text-slate-400">{g.tagline}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {g.minPlayers}–{g.maxPlayers} players
                </p>
              </button>
            ))}
            {COMING_SOON.map((g) => (
              <div key={g.id} className="rounded-2xl border border-dashed border-white/10 p-4 opacity-50">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {CATEGORY_LABEL[g.category]}
                </div>
                <div className="text-lg font-bold">{g.name}</div>
                <p className="mt-1 text-sm text-slate-400">{g.tagline}</p>
                <p className="mt-2 text-xs text-slate-500">Coming soon</p>
              </div>
            ))}
          </div>

          {selected && <GameOptionsPanel meta={selected} options={room.gameOptions} isHost={me.isHost} />}

          {me.isHost ? (
            <div className="mt-6 flex items-center gap-4">
              <button className="btn-primary" disabled={!canStart} onClick={startGame}>
                Start game
              </button>
              {selected && !canStart && (
                <p className="text-sm text-slate-400">
                  Needs {selected.minPlayers}–{selected.maxPlayers} connected players (currently {connectedCount}).
                </p>
              )}
              {!selected && <p className="text-sm text-slate-400">Pick a game above to get started.</p>}
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-400">
              {selected ? `Waiting for the host to start ${selected.name}…` : "Waiting for the host to pick a game…"}
            </p>
          )}
          {error && (
            <p className="mt-3 cursor-pointer text-sm text-accent" onClick={clearError}>
              {error} (dismiss)
            </p>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <InviteLink code={room.code} />
          <div className="card-surface rounded-3xl p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Players ({room.players.length})</h3>
            <PlayerList players={room.players} meId={me.id} />
          </div>
          {room.players.some((p) => p.score > 0) && (
            <div className="card-surface rounded-3xl p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-300">🏆 Session standings</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {[...room.players]
                  .sort((a, b) => b.score - a.score)
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <span className={p.id === me.id ? "font-semibold text-gold" : "text-slate-300"}>{p.name}</span>
                      <span className="text-slate-400">
                        {p.score} win{p.score === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">Wins across every game played in this room tonight.</p>
            </div>
          )}
          <ChatBox meId={me.id} />
        </aside>
      </div>
    </main>
  );
}
