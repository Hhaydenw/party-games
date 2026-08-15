"use client";

import { useEffect, useRef, useState } from "react";
import { PriceCheckAction, PriceCheckView as ViewType } from "@/lib/games/priceCheck";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Only lets through what a valid in-progress price looks like — digits and
// at most one decimal point, capped at two decimal places — so the field
// can only ever hold text that's headed toward a valid number, without
// ever needing to reject/clear a keystroke.
function sanitizePriceDraft(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
    const [whole, frac] = cleaned.split(".");
    cleaned = frac !== undefined ? `${whole}.${frac.slice(0, 2)}` : cleaned;
  }
  return cleaned;
}

const MEDALS = ["🥇", "🥈", "🥉"];

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
  // A plain string, not a controlled `type="number"` input — number inputs
  // report `""` from `e.target.value` at various valid-looking intermediate
  // typing states (a lone decimal point, certain mobile keyboard/locale
  // behavior), and since this is a controlled component, that empty value
  // immediately gets fed straight back into the DOM as the new value —
  // wiping out whatever had just been typed, on every affected keystroke.
  // A sanitized text field sidesteps the whole class of bug.
  const [draft, setDraft] = useState("");
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  useEffect(() => setDraft(""), [view.roundIndex]);

  const remainingMs = useCountdown(view.roundEndsAt, isHost, () => onAction({ type: "timeUp" }));

  const revealed = view.phase === "roundEnd" || view.phase === "finished";
  const wasRevealed = useRef(revealed);
  useEffect(() => {
    if (revealed && !wasRevealed.current) playSound(view.roundWinnerIds.includes(meId) ? "success" : "reveal");
    wasRevealed.current = revealed;
  }, [revealed, view.roundWinnerIds, meId]);

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount <= 0) return;
    playSound("select");
    onAction({ type: "guess", amount });
    setDraft("");
  }

  const timerFrac = remainingMs !== null ? Math.max(0, Math.min(1, remainingMs / ROUND_MS_APPROX)) : 1;

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs uppercase tracking-widest text-slate-500">
        Round {view.roundIndex + 1} of {view.totalRounds}
      </p>

      {/* Product card — a price-tag-style presentation: photo up top, a
          countdown bar along the bottom edge instead of plain text, and
          the reveal punches in with the same pop animation used
          elsewhere for "the answer" moments. */}
      <div className="relative flex w-full max-w-md flex-col items-center gap-3 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 pb-5 shadow-xl">
        {view.thumbnail && (
          <div className="flex h-44 w-44 items-center justify-center rounded-2xl bg-white/5 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.thumbnail} alt={view.title} className="h-full w-full object-contain" />
          </div>
        )}
        <p className="text-xs uppercase tracking-widest text-slate-500">
          {view.brand} · {view.category}
        </p>
        <h2 className="text-center text-lg font-bold leading-tight">{view.title}</h2>
        {revealed ? (
          <p className="text-3xl font-black text-gold [animation:feud-pop_0.4s_ease-out]">{money(view.revealedPrice!)}</p>
        ) : (
          <p className="text-sm text-slate-500">What's the real price?</p>
        )}

        {!revealed && remainingMs !== null && view.phase === "guessing" && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/5">
            <div
              className={`h-full transition-[width] duration-300 ease-linear ${timerFrac < 0.25 ? "bg-accent" : "bg-gold"}`}
              style={{ width: `${timerFrac * 100}%` }}
            />
          </div>
        )}
      </div>
      {!revealed && remainingMs !== null && view.phase === "guessing" && (
        <p className="-mt-4 text-sm font-bold text-gold">⏱ {Math.ceil(remainingMs / 1000)}s</p>
      )}

      {view.phase === "guessing" && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-center text-sm text-slate-500">
            {view.guessedCount}/{view.totalPlayers} guessed
          </p>
          {view.yourGuess === null ? (
            <form onSubmit={submitGuess} className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/30">
                <span className="text-2xl font-black text-slate-400">$</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  className="w-40 bg-transparent text-center text-2xl font-black text-slate-100 outline-none placeholder:text-slate-600"
                  placeholder="0.00"
                  value={draft}
                  onChange={(e) => setDraft(sanitizePriceDraft(e.target.value))}
                />
              </div>
              <button className="btn-primary w-full" disabled={!draft || Number(draft) <= 0}>
                Lock in guess
              </button>
            </form>
          ) : (
            <p className="text-center text-sm text-emerald-400">You guessed {money(view.yourGuess)}. Waiting on everyone else…</p>
          )}
        </div>
      )}

      {revealed && (
        <div className="flex flex-col items-center gap-3">
          {view.roundWinnerIds.length > 0 && (
            <p className="text-center font-semibold text-emerald-400">🎯 Closest: {view.roundWinnerIds.map(nameFor).join(" & ")}!</p>
          )}
          {view.allGuesses && view.allGuesses.length > 0 && (
            <div className="flex w-full max-w-sm flex-col gap-1.5 text-sm">
              {view.allGuesses.map((g, i) => {
                const won = view.roundWinnerIds.includes(g.playerId);
                return (
                  <div
                    key={g.playerId}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${
                      won ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {MEDALS[i] && <span>{MEDALS[i]}</span>}
                      {nameFor(g.playerId)}
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="tabular-nums">{money(g.amount)}</span>
                      <span className="text-xs tabular-nums text-slate-500">
                        {g.diff === 0 ? "exact!" : `off by ${money(g.diff)}`}
                      </span>
                    </span>
                  </div>
                );
              })}
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

// Only used to normalize the countdown bar's fill fraction — matches the
// engine's ROUND_MS (30s). Not exported from the engine, so mirrored here;
// the bar just looks slightly off if the engine's constant ever changes,
// nothing functional depends on it.
const ROUND_MS_APPROX = 30_000;
