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
  lawsuit: "⚖️",
  lottery: "🎰",
  neutral: "·",
  retire: "🎉",
};

const PLAYER_COLORS = ["#e94560", "#f2b705", "#22c55e", "#3b82f6", "#a855f7", "#f97316"];

const COLS = 6;

// Lays the board out as a winding snake path (like a real board game),
// alternating direction every row, computed as percentages so it's fully
// responsive.
function tilePercentPosition(index: number, total: number) {
  const rows = Math.ceil(total / COLS);
  const row = Math.floor(index / COLS);
  const colInRow = index % COLS;
  const col = row % 2 === 0 ? colInRow : COLS - 1 - colInRow;
  return {
    left: `${(col / COLS) * 100}%`,
    top: `${(row / rows) * 100}%`,
    width: `${100 / COLS}%`,
    height: `${100 / rows}%`,
  };
}

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
  const total = view.board.length;
  const rows = Math.ceil(total / COLS);

  if (view.phase === "setup") {
    return (
      <div className="flex flex-col items-center gap-6 py-10">
        <h2 className="text-xl font-bold">🚗 Pick your piece</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {view.players.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 px-3 py-2">
              <span className="text-2xl">{p.piece ?? "❔"}</span>
              <span className="text-xs text-slate-400">{nameFor(p.id)}</span>
            </div>
          ))}
        </div>
        {!view.yourPiece ? (
          <div className="flex flex-wrap justify-center gap-3">
            {view.availablePieces.map((piece) => (
              <button
                key={piece}
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-3xl transition hover:scale-110 hover:bg-white/10"
                onClick={() => onAction({ type: "choosePiece", piece })}
              >
                {piece}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-slate-400">You picked {view.yourPiece}. Waiting for everyone else…</p>
        )}
      </div>
    );
  }

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

      <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-panel" style={{ aspectRatio: `${COLS} / ${rows}` }}>
        {view.board.map((kind, i) => {
          const pos = tilePercentPosition(i, total);
          return (
            <div
              key={i}
              className={`absolute flex flex-col items-center justify-center border border-black/20 text-[9px] sm:text-xs ${
                kind === "retire" ? "bg-gold/25" : kind === "payday" ? "bg-emerald-500/15" : "bg-white/5"
              }`}
              style={pos}
              title={kind}
            >
              <span className="text-base sm:text-lg">{TILE_ICON[kind]}</span>
            </div>
          );
        })}

        {view.players.map((p, pi) => {
          const pos = tilePercentPosition(p.position, total);
          // Offset each player's token slightly within the tile so multiple pieces on one space don't fully overlap.
          const offsetX = (pi % 3) * 22 - 22;
          const offsetY = Math.floor(pi / 3) * 22 - 11;
          return (
            <div
              key={p.id}
              className="absolute flex items-center justify-center text-lg transition-all duration-700 ease-in-out sm:text-2xl"
              style={{
                left: `calc(${pos.left} + ${pos.width} / 2 + ${offsetX}px)`,
                top: `calc(${pos.top} + ${pos.height} / 2 + ${offsetY}px)`,
                transform: "translate(-50%, -50%)",
                filter: `drop-shadow(0 0 3px ${colorFor(p.id)})`,
              }}
              title={nameFor(p.id)}
            >
              {p.piece ?? "🚗"}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {view.players.map((p) => (
          <div key={p.id} className="card-surface rounded-2xl p-4" style={{ borderColor: p.id === current ? colorFor(p.id) : undefined }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{p.piece}</span>
              <p className="font-semibold">{nameFor(p.id)}</p>
              {p.finished && <span className="ml-auto text-xs text-gold">retired</span>}
            </div>
            <p className="text-sm text-slate-300">{p.career ? `${p.career.title} · ${money(p.career.salary)}/payday` : "No career chosen yet"}</p>
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
