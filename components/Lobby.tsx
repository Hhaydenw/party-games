"use client";

import { useState } from "react";
import { COMING_SOON, listAvailableGames } from "@/lib/games/registry";
import { PlayerInfo, RoomSummary } from "@/lib/types";
import { useParty } from "@/lib/socketClient";
import InviteLink from "@/components/InviteLink";
import PlayerList from "@/components/PlayerList";
import ChatBox from "@/components/ChatBox";
import GameOptionsPanel from "@/components/GameOptionsPanel";
import SoundSettingsButton from "@/components/SoundSettingsButton";
import EmoteBar from "@/components/EmoteBar";

const CATEGORY_LABEL: Record<string, string> = { card: "🃏 Card", board: "🎲 Board", party: "📱 Party" };

export default function Lobby({ room, me }: { room: RoomSummary; me: PlayerInfo }) {
  const { selectGame, startGame, setSeriesQueue, startSeries, setTeam, kickPlayer, error, clearError } = useParty();
  const games = listAvailableGames();
  const selected = games.find((g) => g.id === room.gameId);
  const connectedCount = room.players.filter((p) => p.connected).length;

  // Series Mode is a local toggle that changes what clicking a game card
  // does (single-select-and-start vs. add-to-a-queue); it snaps on
  // automatically once the room already has a queue set up, so joining
  // players/guests see the right view without having to toggle it
  // themselves.
  const [seriesModeOn, setSeriesModeOn] = useState(false);
  const seriesMode = seriesModeOn || room.seriesQueue.length > 0;

  const canStart =
    me.isHost && !!selected && connectedCount >= selected.minPlayers && connectedCount <= selected.maxPlayers;
  const canStartSeries = me.isHost && room.seriesQueue.length >= 2;

  // The server only accepts (and echoes back) a queue of 2+ games, so a
  // 0-or-1-item lineup is purely local until it crosses that floor — this
  // draft is what the host's card badges/list reflect while building it up.
  const [queueDraft, setQueueDraft] = useState<string[]>(room.seriesQueue);

  function toggleQueued(gameId: string) {
    if (!me.isHost) return;
    const next = queueDraft.includes(gameId) ? queueDraft.filter((id) => id !== gameId) : [...queueDraft, gameId];
    setQueueDraft(next);
    if (next.length >= 2) setSeriesQueue(next);
  }

  const displayedQueue = me.isHost ? queueDraft : room.seriesQueue;

  // Team games get a pre-game team picker. Family Feud always needs teams;
  // Tanks only when its "teams" option is chosen. Series Mode plays each
  // game with default options (no per-game customization yet), so Tanks
  // would default to solo there — only Family Feud triggers it in a series.
  const showTeamPicker = seriesMode
    ? displayedQueue.includes("family-feud")
    : room.gameId === "family-feud" || (room.gameId === "tanks" && room.gameOptions.mode === "teams");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold">🎉 Party Games</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            Room <span className="font-semibold tracking-[0.2em] text-gold">{room.code}</span>
          </span>
          <EmoteBar />
          <SoundSettingsButton />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="card-surface min-w-0 rounded-3xl p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{seriesMode ? "Build a series" : "Choose a game"}</h2>
            {me.isHost && (
              <div className="flex rounded-full bg-white/5 p-1 text-xs">
                <button
                  className={`rounded-full px-3 py-1 font-semibold transition ${!seriesMode ? "bg-accent text-white" : "text-slate-400"}`}
                  onClick={() => setSeriesModeOn(false)}
                >
                  Single game
                </button>
                <button
                  className={`rounded-full px-3 py-1 font-semibold transition ${seriesMode ? "bg-accent text-white" : "text-slate-400"}`}
                  onClick={() => setSeriesModeOn(true)}
                >
                  🏆 Series mode
                </button>
              </div>
            )}
          </div>

          {seriesMode && (
            <p className="mb-4 text-xs text-slate-500">
              Pick several games to play back-to-back — each game's own final ranking earns placement points (1st=10,
              2nd=7, 3rd=5, 4th=3, else 1) that stack into one running series leaderboard. Each game plays with its
              default settings.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {games.map((g) => {
              const queuedIndex = displayedQueue.indexOf(g.id);
              const isQueued = queuedIndex !== -1;
              return (
                <button
                  key={g.id}
                  disabled={!me.isHost}
                  onClick={() => (seriesMode ? toggleQueued(g.id) : selectGame(g.id))}
                  className={`relative rounded-2xl border p-4 text-left transition disabled:cursor-default ${
                    seriesMode
                      ? isQueued
                        ? "border-gold bg-gold/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20"
                      : room.gameId === g.id
                        ? "border-accent bg-accent/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20"
                  }`}
                >
                  {isQueued && (
                    <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-xs font-black text-ink">
                      {queuedIndex + 1}
                    </span>
                  )}
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {CATEGORY_LABEL[g.category]}
                  </div>
                  <div className="text-lg font-bold">{g.name}</div>
                  <p className="mt-1 text-sm text-slate-400">{g.tagline}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {g.minPlayers}–{g.maxPlayers} players
                  </p>
                </button>
              );
            })}
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

          {!seriesMode && selected && <GameOptionsPanel meta={selected} options={room.gameOptions} isHost={me.isHost} />}

          {!seriesMode ? (
            me.isHost ? (
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
            )
          ) : (
            <div className="mt-6">
              <p className="mb-2 text-sm text-slate-300">
                Lineup: {displayedQueue.length === 0 ? "none yet" : displayedQueue.map((id) => games.find((g) => g.id === id)?.name ?? id).join(" → ")}
              </p>
              {me.isHost ? (
                <button className="btn-primary" disabled={!canStartSeries} onClick={startSeries}>
                  🏆 Start series ({room.seriesQueue.length} game{room.seriesQueue.length === 1 ? "" : "s"})
                </button>
              ) : (
                <p className="text-sm text-slate-400">Waiting for the host to start the series…</p>
              )}
              {me.isHost && displayedQueue.length === 1 && <p className="mt-2 text-xs text-slate-500">Add at least one more game.</p>}
            </div>
          )}

          {showTeamPicker && (
            <div className="mt-6 rounded-2xl bg-white/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-300">Choose teams</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(["1", "2"] as const).map((team) => {
                  const isRed = team === "1";
                  const members = room.players.filter((p) => room.teamAssignments[p.id] === team);
                  return (
                    <div key={team} className={`rounded-xl border p-3 ${isRed ? "border-red-400/40 bg-red-500/10" : "border-blue-400/40 bg-blue-500/10"}`}>
                      <p className={`mb-2 text-xs font-black uppercase tracking-widest ${isRed ? "text-red-400" : "text-blue-400"}`}>
                        Team {isRed ? "Red" : "Blue"}
                      </p>
                      <ul className="flex min-h-[1.5rem] flex-col gap-1 text-sm text-slate-200">
                        {members.length === 0 && <li className="text-slate-500">Empty</li>}
                        {members.map((p) => (
                          <li key={p.id}>{p.id === me.id ? "You" : p.name}</li>
                        ))}
                      </ul>
                      <button
                        className="btn-secondary mt-3 w-full py-1.5 text-xs"
                        disabled={room.teamAssignments[me.id] === team}
                        onClick={() => setTeam(team)}
                      >
                        {room.teamAssignments[me.id] === team ? "✓ On this team" : "Join"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Anyone who doesn't pick a side gets balanced onto a team automatically when the game starts.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 cursor-pointer text-sm text-accent" onClick={clearError}>
              {error} (dismiss)
            </p>
          )}
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <InviteLink code={room.code} />
          <div className="card-surface rounded-3xl p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Players ({room.players.length})</h3>
            <PlayerList players={room.players} meId={me.id} onKick={me.isHost ? kickPlayer : undefined} />
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
