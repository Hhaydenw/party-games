"use client";

import { useEffect, useRef, useState } from "react";
import { UnoAction, UnoCard, UnoColor, UnoView as ViewType, isPlayable } from "@/lib/games/uno";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const COLOR_BG: Record<string, string> = {
  red: "bg-gradient-to-br from-red-500 to-red-700",
  yellow: "bg-gradient-to-br from-yellow-300 to-yellow-500",
  green: "bg-gradient-to-br from-emerald-500 to-emerald-700",
  blue: "bg-gradient-to-br from-blue-500 to-blue-700",
  wild: "bg-gradient-to-br from-red-500 via-yellow-400 via-40% to-blue-600",
};

const COLOR_TEXT: Record<string, string> = {
  red: "text-red-600",
  yellow: "text-yellow-500",
  green: "text-emerald-600",
  blue: "text-blue-600",
  wild: "text-ink",
};

const COLOR_DOT: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-400",
  green: "bg-emerald-500",
  blue: "bg-blue-500",
};

const VALUE_LABEL: Record<string, string> = {
  skip: "⦸",
  reverse: "⇄",
  draw2: "+2",
  wild: "★",
  wild4: "+4",
};

function CardFace({ card, small, tilt = 0 }: { card: UnoCard; small?: boolean; tilt?: number }) {
  const label = VALUE_LABEL[card.value] ?? card.value;
  const dims = small ? "h-20 w-14" : "h-28 w-20";
  return (
    <span
      className={`relative inline-flex ${dims} shrink-0 flex-col justify-between rounded-xl border-[3px] border-white bg-white p-1 shadow-[0_4px_10px_rgba(0,0,0,0.5)]`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <span className={`absolute inset-[3px] rounded-lg ${COLOR_BG[card.color]}`} />
      <span className={`relative text-[11px] font-black leading-none text-white drop-shadow ${small ? "" : "text-sm"}`}>{label}</span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className={`flex -rotate-[20deg] items-center justify-center rounded-full bg-white font-black shadow-inner ${
            small ? "h-9 w-7 text-base" : "h-14 w-10 text-2xl"
          } ${COLOR_TEXT[card.color]}`}
        >
          {label}
        </span>
      </span>
      <span className={`relative self-end rotate-180 text-[11px] font-black leading-none text-white drop-shadow ${small ? "" : "text-sm"}`}>{label}</span>
    </span>
  );
}

function CardBack({ small }: { small?: boolean }) {
  const dims = small ? "h-20 w-14" : "h-24 w-16";
  return (
    <span
      className={`relative inline-flex ${dims} shrink-0 items-center justify-center rounded-xl border-[3px] border-white shadow-[0_4px_10px_rgba(0,0,0,0.5)]`}
      style={{
        background:
          "repeating-linear-gradient(45deg, #1a1a2e, #1a1a2e 6px, #e94560 6px, #e94560 12px)",
      }}
    >
      <span className="flex h-8 w-8 -rotate-12 items-center justify-center rounded-full bg-gold text-lg font-black text-ink shadow">?</span>
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

  const lastDiscardId = useRef(view.discardTop?.id);
  useEffect(() => {
    if (view.discardTop?.id !== lastDiscardId.current) {
      lastDiscardId.current = view.discardTop?.id;
      playSound("cardPlay");
    }
  }, [view.discardTop?.id]);

  const wasMyTurn = useRef(view.yourTurn);
  useEffect(() => {
    if (view.yourTurn && !wasMyTurn.current) playSound("turn");
    wasMyTurn.current = view.yourTurn;
  }, [view.yourTurn]);

  const announcedWinner = useRef(false);
  useEffect(() => {
    if (view.winnerId && !announcedWinner.current) {
      announcedWinner.current = true;
      playSound(view.winnerId === meId ? "win" : "reveal");
    }
  }, [view.winnerId, meId]);

  const canPlay = (card: UnoCard) => Boolean(view.discardTop) && isPlayable(card, view.discardTop!, view.currentColor, view.pendingDraw);
  const hasPlayableCard = view.yourHand.some(canPlay);

  // Auto-draw when it's your turn and nothing in your hand is legal to
  // play, instead of leaving you stuck staring at an unplayable hand. A
  // short delay lets you actually see why before it happens.
  useEffect(() => {
    if (!view.yourTurn || view.winnerId || hasPlayableCard) return;
    const t = setTimeout(() => {
      playSound("draw");
      onAction({ type: "draw" });
    }, 900);
    return () => clearTimeout(t);
  }, [view.yourTurn, view.winnerId, hasPlayableCard, onAction]);

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
            <span className="font-bold text-accent">Your turn{!hasPlayableCard && " — no playable card, drawing…"}</span>
          ) : (
            <span className="text-slate-400">Waiting on {nameFor(current!)}…</span>
          )}
        </p>
      )}

      {view.pendingDraw && !view.winnerId && (
        <p className="text-center text-sm font-semibold text-accent">
          ⚠️ +{view.pendingDraw.count} pending — stack a matching {view.pendingDraw.kind === "draw2" ? "+2" : "+4"} or draw {view.pendingDraw.count}
        </p>
      )}

      {/* Felt table */}
      <div
        className="rounded-3xl border border-emerald-950/50 p-6 shadow-inner"
        style={{ background: "radial-gradient(circle at 50% 30%, #0d5c3f, #073b28 75%)" }}
      >
        <div className="flex items-center justify-center gap-8">
          <button
            className="flex flex-col items-center gap-1.5 transition disabled:opacity-40 enabled:hover:-translate-y-1"
            disabled={!view.yourTurn}
            onClick={() => {
              playSound("draw");
              onAction({ type: "draw" });
            }}
          >
            <CardBack />
            <span className="text-xs font-medium text-emerald-100/80">{view.drawPileCount} left</span>
          </button>

          <div className="flex flex-col items-center gap-1.5">
            {view.discardTop && <CardFace card={view.discardTop} />}
            <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-xs text-emerald-100/90">
              <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT[view.currentColor]}`} />
              {view.currentColor}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3 text-sm">
        {view.order.map((pid) => (
          <div key={pid} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${pid === current ? "bg-accent/20 ring-1 ring-accent/40" : "bg-white/5"}`}>
            <span className="inline-block h-5 w-4 rounded-sm border border-white/40" style={{ background: "repeating-linear-gradient(45deg, #1a1a2e, #1a1a2e 2px, #e94560 2px, #e94560 4px)" }} />
            {nameFor(pid)}: {view.handCounts[pid]} card{view.handCounts[pid] === 1 ? "" : "s"}
          </div>
        ))}
      </div>

      <div>
        <p className="mb-3 text-center text-sm text-slate-400">Your hand</p>
        <div className="flex flex-wrap justify-center px-4 pb-2 pt-3" style={{ gap: 0 }}>
          {view.yourHand.map((card, i) => {
            const mid = (view.yourHand.length - 1) / 2;
            const tilt = (i - mid) * 4;
            const playableNow = canPlay(card);
            return (
              <button
                key={card.id}
                disabled={!view.yourTurn || !playableNow}
                onClick={() => handlePlay(card)}
                className="relative transition-transform duration-150 first:ml-0 enabled:hover:z-10 enabled:hover:-translate-y-3 disabled:opacity-60"
                style={{ marginLeft: i === 0 ? 0 : -28, transform: `rotate(${tilt}deg)`, transformOrigin: "bottom center" }}
              >
                <CardFace card={card} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl bg-black/20 p-3 text-xs text-slate-400">
        {view.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {pendingWildId && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-6">
          <div className="card-surface rounded-2xl p-6 text-center">
            <p className="mb-4 font-semibold">Choose a color</p>
            <div className="flex gap-3">
              {(["red", "yellow", "green", "blue"] as UnoColor[]).map((c) => (
                <button
                  key={c}
                  className={`h-12 w-12 rounded-full border-2 border-white/70 shadow-lg transition hover:scale-110 ${COLOR_BG[c]}`}
                  onClick={() => chooseColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
