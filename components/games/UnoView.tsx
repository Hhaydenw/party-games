"use client";

import { useState } from "react";
import { UnoAction, UnoCard, UnoColor, UnoView as ViewType } from "@/lib/games/uno";
import { PlayerInfo } from "@/lib/types";

const COLOR_BG: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-400 text-ink",
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  wild: "bg-gradient-to-br from-red-500 via-yellow-400 to-blue-500",
};

const VALUE_LABEL: Record<string, string> = {
  skip: "⦸",
  reverse: "⇄",
  draw2: "+2",
  wild: "★",
  wild4: "+4",
};

function CardFace({ card, small }: { card: UnoCard; small?: boolean }) {
  return (
    <span
      className={`flex items-center justify-center rounded-lg font-extrabold shadow ${COLOR_BG[card.color]} ${
        small ? "h-14 w-10 text-lg" : "h-20 w-14 text-2xl"
      }`}
    >
      {VALUE_LABEL[card.value] ?? card.value}
    </span>
  );
}

export default function UnoView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: UnoAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const [pendingWildId, setPendingWildId] = useState<string | null>(null);
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const current = view.order[view.turnIndex];

  function handlePlay(card: UnoCard) {
    if (!view.yourTurn) return;
    if (card.color === "wild") {
      setPendingWildId(card.id);
      return;
    }
    onAction({ type: "play", cardId: card.id });
  }

  function chooseColor(color: UnoColor) {
    if (pendingWildId) onAction({ type: "play", cardId: pendingWildId, chosenColor: color });
    setPendingWildId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {view.winnerId ? (
        <p className="text-center text-xl font-bold">🎉 {nameFor(view.winnerId)} wins!</p>
      ) : (
        <p className="text-center text-lg">
          {view.yourTurn ? (
            <span className="font-bold text-accent">Your turn</span>
          ) : (
            <span className="text-slate-400">Waiting on {nameFor(current!)}…</span>
          )}
        </p>
      )}

      <div className="flex items-center justify-center gap-6">
        <button
          className="flex flex-col items-center gap-1 disabled:opacity-40"
          disabled={!view.yourTurn}
          onClick={() => onAction({ type: "draw" })}
        >
          <span className="flex h-20 w-14 items-center justify-center rounded-lg border-2 border-dashed border-white/30 text-xs text-slate-400">
            Draw
          </span>
          <span className="text-xs text-slate-500">{view.drawPileCount} left</span>
        </button>

        <div className="flex flex-col items-center gap-1">
          {view.discardTop && <CardFace card={view.discardTop} />}
          <span className="flex items-center gap-1 text-xs text-slate-400">
            Current color
            <span className={`h-3 w-3 rounded-full ${COLOR_BG[view.currentColor]}`} />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4 text-sm">
        {view.order.map((pid) => (
          <div key={pid} className={`rounded-xl px-3 py-1.5 ${pid === current ? "bg-accent/20" : "bg-white/5"}`}>
            {nameFor(pid)}: {view.handCounts[pid]} card{view.handCounts[pid] === 1 ? "" : "s"}
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm text-slate-400">Your hand</p>
        <div className="flex flex-wrap gap-2">
          {view.yourHand.map((card) => (
            <button key={card.id} disabled={!view.yourTurn} onClick={() => handlePlay(card)} className="disabled:opacity-60">
              <CardFace card={card} small />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-black/20 p-3 text-xs text-slate-400">
        {view.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {pendingWildId && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-6">
          <div className="card-surface rounded-2xl p-6 text-center">
            <p className="mb-4 font-semibold">Choose a color</p>
            <div className="flex gap-3">
              {(["red", "yellow", "green", "blue"] as UnoColor[]).map((c) => (
                <button key={c} className={`h-12 w-12 rounded-full ${COLOR_BG[c]}`} onClick={() => chooseColor(c)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
