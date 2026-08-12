"use client";

import { useEffect, useRef, useState } from "react";
import { PriceCheckAction, PriceCheckView as ViewType } from "@/lib/games/priceCheck";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PriceCheckView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: PriceCheckAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const [draft, setDraft] = useState("");
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedTimeUp = useRef(false);
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  useEffect(() => setDraft(""), [view.roundIndex]);

  useEffect(() => {
    firedTimeUp.current = false;
    if (!view.roundEndsAt) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, view.roundEndsAt! - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && isHost && !firedTimeUp.current) {
        firedTimeUp.current = true;
        onAction({ type: "timeUp" });
      }
    };
    tick();
    const interval = setInterval(tick, 300);
    return () => clearInterval(interval);
  }, [view.roundEndsAt, isHost, onAction]);

  const revealed = view.phase === "roundEnd" || view.phase === "finished";
  const wasRevealed = useRef(revealed);
  useEffect(() => {
    if (revealed && !wasRevealed.current) playSound(view.roundWinnerIds.includes(meId) ? "success" : "reveal");
    wasRevealed.current = revealed;
  }, [revealed, view.roundWinnerIds, meId]);

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount < 0) return;
    playSound("select");
    onAction({ type: "guess", amount });
    setDraft("");
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs uppercase tracking-widest text-slate-500">
        Round {view.roundIndex + 1} of {view.totalRounds}
      </p>

      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        {view.thumbnail && <img src={view.thumbnail} alt={view.title} className="h-40 w-40 rounded-xl object-contain bg-white/5" />}
        <p className="text-xs uppercase tracking-widest text-slate-500">{view.brand} · {view.category}</p>
        <h2 className="text-center text-lg font-bold">{view.title}</h2>
        {revealed ? (
          <p className="text-2xl font-black text-gold [animation:feud-pop_0.4s_ease-out]">{money(view.revealedPrice!)}</p>
        ) : (
          remainingMs !== null && view.phase === "guessing" && <p className="text-sm font-bold text-gold">⏱ {Math.ceil(remainingMs / 1000)}s</p>
        )}
      </div>

      {view.phase === "guessing" && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-center text-sm text-slate-500">
            {view.guessedCount}/{view.totalPlayers} guessed
          </p>
          {view.yourGuess === null ? (
            <form onSubmit={submitGuess} className="flex gap-2">
              <span className="input flex w-14 shrink-0 items-center justify-center px-0 text-slate-400">$</span>
              <input
                autoFocus
                type="number"
                min={0}
                step="0.01"
                className="input"
                placeholder="Your price guess…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn-primary shrink-0">Guess</button>
            </form>
          ) : (
            <p className="text-center text-sm text-emerald-400">You guessed {money(view.yourGuess)}. Waiting on everyone else…</p>
          )}
        </div>
      )}

      {revealed && (
        <div className="flex flex-col items-center gap-3">
          {view.roundWinnerIds.length > 0 && (
            <p className="text-center font-semibold text-emerald-400">
              🎯 Closest: {view.roundWinnerIds.map(nameFor).join(" & ")}!
            </p>
          )}
          {view.allGuesses && view.allGuesses.length > 0 && (
            <div className="flex w-full max-w-sm flex-col gap-1.5 text-sm">
              {view.allGuesses.map((g) => (
                <div
                  key={g.playerId}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${
                    view.roundWinnerIds.includes(g.playerId) ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-300"
                  }`}
                >
                  <span>{nameFor(g.playerId)}</span>
                  <span className="tabular-nums">{money(g.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            {[...view.scores]
              .sort((a, b) => b.score - a.score)
              .map((s) => (
                <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
                  {nameFor(s.playerId)}: {s.score}
                </span>
              ))}
          </div>
          {view.phase === "roundEnd" && isHost && (
            <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
              {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next product"}
            </button>
          )}
          {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}
        </div>
      )}
    </div>
  );
}
