"use client";

import { Connect4Action, Connect4View as ViewType } from "@/lib/games/connect4";
import { PlayerInfo } from "@/lib/types";

const DISC_COLORS = ["bg-accent", "bg-gold"];

export default function Connect4View({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: Connect4Action) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const nameFor = (id: string | null) => players.find((p) => p.id === id)?.name ?? "…";
  const colorFor = (id: string | null) => (id ? DISC_COLORS[view.order.indexOf(id) % 2] : "");
  const current = view.order[view.turnIndex] ?? null;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        {view.winnerId ? (
          <p className="text-xl font-bold">
            🎉 <span className={colorFor(view.winnerId)?.replace("bg-", "text-")}>{nameFor(view.winnerId)}</span> connected
            four!
          </p>
        ) : view.isDraw ? (
          <p className="text-xl font-bold">It's a draw!</p>
        ) : (
          <p className="text-lg">
            {view.yourTurn ? (
              <span className="font-bold text-accent">Your turn — drop a disc</span>
            ) : (
              <span className="text-slate-400">Waiting on {nameFor(current)}…</span>
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5 rounded-2xl bg-panel p-3 shadow-inner">
        {Array.from({ length: 7 }).map((_, col) => (
          <button
            key={col}
            className="flex flex-col gap-1.5 disabled:cursor-default"
            disabled={!view.yourTurn}
            onClick={() => onAction({ type: "drop", col })}
          >
            {view.board.map((row, r) => {
              const cell = row[col];
              const isLast = view.lastMove?.row === r && view.lastMove?.col === col;
              return (
                <span
                  key={r}
                  className={`h-9 w-9 rounded-full border-2 transition sm:h-10 sm:w-10 ${
                    cell ? colorFor(cell) : "bg-white/5"
                  } ${isLast ? "border-white" : "border-black/20"}`}
                />
              );
            })}
          </button>
        ))}
      </div>

      <div className="flex gap-6 text-sm">
        {view.order.map((pid, i) => (
          <div key={pid} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${DISC_COLORS[i % 2]}`} />
            {nameFor(pid)}
            {pid === meId && " (you)"}
          </div>
        ))}
      </div>
    </div>
  );
}
