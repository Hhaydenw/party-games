"use client";

import { LifeAction, LifeView as ViewType } from "@/lib/games/life";
import { PlayerInfo } from "@/lib/types";

const TILE_ICON: Record<string, string> = {
  start: "🏁",
  payday: "💰",
  event: "❓",
  marry: "💍",
  baby: "👶",
  house: "🏠",
  career: "💼",
  neutral: "·",
  retire: "🎉",
};

const PLAYER_COLORS = ["#e94560", "#f2b705", "#22c55e", "#3b82f6", "#a855f7", "#f97316"];

function money(n: number) {
  return `$${n.toLocaleString()}`;
}

export default function LifeView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: LifeAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const current = view.order[view.turnIndex]!;
  const colorFor = (id: string) => PLAYER_COLORS[view.order.indexOf(id) % PLAYER_COLORS.length]!;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        {view.phase === "finished" ? (
          <p className="text-lg font-bold">🏆 Everyone's retired — final results below!</p>
        ) : (
          <p className="text-lg">
            {view.yourTurn ? <span className="font-bold text-accent">Your turn</span> : <span className="text-slate-400">Waiting on {nameFor(current)}…</span>}
            {view.lastRoll !== null && <span className="ml-2 text-sm text-slate-500">(last spin: {view.lastRoll})</span>}
          </p>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-3xl grid-cols-9 gap-1 sm:grid-cols-12">
        {view.board.map((kind, i) => {
          const occupants = view.players.filter((p) => p.position === i);
          return (
            <div
              key={i}
              className={`relative flex h-10 flex-col items-center justify-center rounded-md text-[10px] ${
                kind === "retire" ? "bg-gold/20" : kind === "payday" ? "bg-emerald-500/10" : "bg-white/5"
              }`}
              title={kind}
            >
              <span>{TILE_ICON[kind]}</span>
              {occupants.length > 0 && (
                <div className="absolute -bottom-1 flex gap-0.5">
                  {occupants.map((p) => (
                    <span key={p.id} className="h-2 w-2 rounded-full border border-black/30" style={{ backgroundColor: colorFor(p.id) }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {view.players.map((p) => (
          <div key={p.id} className="card-surface rounded-2xl p-4" style={{ borderColor: p.id === current ? colorFor(p.id) : undefined }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(p.id) }} />
              <p className="font-semibold">{nameFor(p.id)}</p>
              {p.finished && <span className="ml-auto text-xs text-gold">retired</span>}
            </div>
            <p className="text-sm text-slate-300">
              {p.career ? `${p.career.title} · ${money(p.career.salary)}/payday` : "No career chosen yet"}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
              <span>Cash: {money(p.cash)}</span>
              {p.married && <span>💍 Married</span>}
              {p.kids > 0 && <span>👶 {p.kids}</span>}
              {p.house && <span>🏠 {p.house.name}</span>}
            </p>
            <p className="mt-1 text-sm font-bold text-gold">Net worth: {money(p.netWorth)}</p>
          </div>
        ))}
      </div>

      {view.yourTurn && view.needsPathChoice && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-5">
          <p className="font-semibold">Choose your path</p>
          <div className="flex gap-3">
            <button className="btn-primary" onClick={() => onAction({ type: "choosePath", path: "college" })}>
              College — pay $50,000 tuition now, higher-paying careers
            </button>
            <button className="btn-secondary" onClick={() => onAction({ type: "choosePath", path: "career" })}>
              Career — start working immediately, lower pay
            </button>
          </div>
        </div>
      )}

      {view.yourTurn && !view.needsPathChoice && (
        <div className="flex justify-center">
          <button className="btn-primary text-lg" onClick={() => onAction({ type: "spin" })}>
            🎡 Spin
          </button>
        </div>
      )}

      <div className="rounded-xl bg-black/20 p-3 text-xs text-slate-400">
        {view.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
