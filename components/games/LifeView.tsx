"use client";

import { useEffect, useRef, useState } from "react";
import { LifeAction, LifeView as ViewType } from "@/lib/games/life";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

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
  retire: "🏆",
};

const TILE_COLOR: Record<string, string> = {
  start: "#22c55e",
  payday: "#22c55e",
  event: "#3b82f6",
  marry: "#ec4899",
  baby: "#f472b6",
  house: "#f2b705",
  career: "#a855f7",
  lawsuit: "#ef4444",
  lottery: "#eab308",
  neutral: "#94a3b8",
  retire: "#f2b705",
};

const PLAYER_COLORS = ["#e94560", "#f2b705", "#22c55e", "#3b82f6", "#a855f7", "#f97316"];

const BOARD_W = 1760;
const BOARD_H = 340;
const MARGIN = 70;

// Lays the board out as a winding, snaking road (like the real board game)
// instead of a plain grid — a sine-wave path across a wide horizontal strip
// that the player scrolls through, with a mountain at the start and a
// resort at the retirement end.
function tilePoint(index: number, total: number) {
  const t = total <= 1 ? 0 : index / (total - 1);
  const x = MARGIN + t * (BOARD_W - MARGIN * 2);
  const wave = Math.sin(index * 0.55) * 100 + Math.sin(index * 0.21) * 45;
  const y = BOARD_H / 2 + wave;
  return { x, y };
}

function money(n: number) {
  return `$${n.toLocaleString()}`;
}

function Spinner({ rolling, lastRoll, onSpin, disabled }: { rolling: boolean; lastRoll: number | null; onSpin: () => void; disabled: boolean }) {
  const [spins, setSpins] = useState(0);
  const wasRolling = useRef(false);
  useEffect(() => {
    if (rolling && !wasRolling.current) setSpins((s) => s + 1);
    wasRolling.current = rolling;
  }, [rolling]);
  const segmentAngle = 360 / 10;
  const settledAngle = lastRoll ? (lastRoll - 1) * segmentAngle + segmentAngle / 2 : 0;
  const rotation = spins * 1080 + settledAngle;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-36 w-36">
        <div
          className="h-36 w-36 rounded-full border-4 border-white/80 shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-transform duration-[900ms] ease-out"
          style={{
            background: "conic-gradient(#e94560 0deg 36deg, #f2b705 36deg 72deg, #22c55e 72deg 108deg, #3b82f6 108deg 144deg, #a855f7 144deg 180deg, #f97316 180deg 216deg, #ec4899 216deg 252deg, #eab308 252deg 288deg, #14b8a6 288deg 324deg, #ef4444 324deg 360deg)",
            transform: `rotate(${rotation}deg)`,
          }}
        >
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 text-xs font-black text-white drop-shadow"
              style={{ transform: `rotate(${i * segmentAngle + segmentAngle / 2}deg) translate(0, -52px) rotate(${-(i * segmentAngle + segmentAngle / 2)}deg)`, marginLeft: -4, marginTop: -6 }}
            >
              {i + 1}
            </span>
          ))}
        </div>
        <div className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-ink shadow" />
        <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-sm font-black text-gold shadow-inner">
          {lastRoll ?? "?"}
        </div>
      </div>
      <button className="btn-primary text-lg" onClick={onSpin} disabled={disabled}>
        🎡 Spin
      </button>
    </div>
  );
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
  const [rolling, setRolling] = useState(false);
  const prevRoll = useRef(view.lastRoll);

  useEffect(() => {
    if (view.lastRoll !== prevRoll.current) {
      prevRoll.current = view.lastRoll;
      setRolling(false);
    }
  }, [view.lastRoll]);

  const wasMyTurn = useRef(view.yourTurn);
  useEffect(() => {
    if (view.yourTurn && !wasMyTurn.current) playSound("turn");
    wasMyTurn.current = view.yourTurn;
  }, [view.yourTurn]);

  const finishedCount = useRef(view.players.filter((p) => p.finished).length);
  useEffect(() => {
    const nowFinished = view.players.filter((p) => p.finished).length;
    if (nowFinished > finishedCount.current) playSound(view.players.find((p) => p.id === meId)?.finished ? "win" : "reveal");
    finishedCount.current = nowFinished;
  }, [view.players, meId]);

  function handleSpin() {
    setRolling(true);
    playSound("click");
    onAction({ type: "spin" });
  }

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
                onClick={() => {
                  playSound("select");
                  onAction({ type: "choosePiece", piece });
                }}
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

  const startPt = tilePoint(0, total);
  const endPt = tilePoint(total - 1, total);
  const roadPoints = view.board.map((_, i) => tilePoint(i, total));
  const roadD = roadPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

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

      {/* Winding board, like the real LIFE track — wide and horizontally scrollable */}
      <div
        className="mx-auto w-full max-w-4xl overflow-x-auto overflow-y-hidden rounded-2xl border-4 border-emerald-900/60 p-2 shadow-inner"
        style={{ background: "linear-gradient(160deg, #163a26 0%, #0c2417 100%)" }}
      >
        <svg width={BOARD_W} height={BOARD_H} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} className="block">
          {/* Mountain near the start */}
          <polygon points={`${startPt.x - 70},${startPt.y + 10} ${startPt.x - 20},${startPt.y - 90} ${startPt.x + 20},${startPt.y + 10}`} fill="#475569" opacity={0.8} />
          <polygon points={`${startPt.x - 20},${startPt.y - 90} ${startPt.x - 5},${startPt.y - 65} ${startPt.x + 5},${startPt.y - 70} ${startPt.x + 20},${startPt.y - 45} ${startPt.x - 20},${startPt.y - 45}`} fill="#e2e8f0" opacity={0.9} />

          {/* Resort glow near retirement */}
          <circle cx={endPt.x + 10} cy={endPt.y} r={70} fill="url(#resortGlow)" />
          <defs>
            <radialGradient id="resortGlow">
              <stop offset="0%" stopColor="#f2b705" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#f2b705" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* Road ribbon */}
          <path d={roadD} fill="none" stroke="#3f3f46" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
          <path d={roadD} fill="none" stroke="#52525b" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
          <path d={roadD} fill="none" stroke="#f2b705" strokeWidth={2} strokeDasharray="10 12" strokeLinecap="round" opacity={0.7} />

          {/* Tiles */}
          {view.board.map((kind, i) => {
            const p = tilePoint(i, total);
            const isBig = kind === "start" || kind === "retire";
            const r = isBig ? 20 : 14;
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={r} fill={TILE_COLOR[kind]} stroke="#0c2417" strokeWidth={2.5} />
                <text x={p.x} y={p.y + (isBig ? 6 : 5)} textAnchor="middle" fontSize={isBig ? 18 : 13}>
                  {TILE_ICON[kind]}
                </text>
              </g>
            );
          })}

          {/* Player tokens, offset within their tile so multiple pieces don't fully overlap */}
          {view.players.map((p, pi) => {
            const pos = tilePoint(p.position, total);
            const offsetX = (pi % 3) * 16 - 16;
            const offsetY = Math.floor(pi / 3) * 16 - 24;
            return (
              <text
                key={p.id}
                x={pos.x + offsetX}
                y={pos.y + offsetY}
                textAnchor="middle"
                fontSize={20}
                style={{ transition: "x 0.7s ease-in-out, y 0.7s ease-in-out", filter: `drop-shadow(0 0 3px ${colorFor(p.id)})` }}
              >
                {p.piece ?? "🚗"}
              </text>
            );
          })}
        </svg>
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
          <Spinner rolling={rolling} lastRoll={view.lastRoll} onSpin={handleSpin} disabled={rolling} />
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
