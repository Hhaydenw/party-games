"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryDashAction, CategoryDashView as ViewType } from "@/lib/games/categoryDash";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const STATUS_LABEL: Record<string, string> = {
  unique: "✓ unique",
  duplicate: "= duplicate",
  invalidLetter: "✕ wrong letter",
  challenged: "✕ challenged out",
  empty: "— blank",
};
const STATUS_CLASS: Record<string, string> = {
  unique: "text-emerald-400",
  duplicate: "text-amber-400",
  invalidLetter: "text-slate-500",
  challenged: "text-accent",
  empty: "text-slate-600",
};

export default function CategoryDashView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: CategoryDashAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedTimeUp = useRef(false);

  // The input's displayed value used to be bound straight to the server-
  // echoed `view.yourDrafts`, sending an action on every keystroke — typing
  // faster than the round trip could snap already-typed characters back to
  // a stale echo, dropping letters. Local state is now the source of truth
  // for what's on screen; the server copy is only used to seed it once per
  // round (and as a fallback before you've typed anything locally).
  const [localDrafts, setLocalDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    setLocalDrafts({});
  }, [view.roundIndex]);

  useEffect(() => {
    firedTimeUp.current = false;
    if (!view.writeEndsAt) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, view.writeEndsAt! - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && isHost && !firedTimeUp.current) {
        firedTimeUp.current = true;
        onAction({ type: "timeUp" });
      }
    };
    tick();
    const interval = setInterval(tick, 300);
    return () => clearInterval(interval);
  }, [view.writeEndsAt, isHost, onAction]);

  const announcedEnd = useRef(false);
  useEffect(() => {
    if (view.phase === "finished" && !announcedEnd.current) {
      announcedEnd.current = true;
      playSound("win");
    }
  }, [view.phase]);

  function setDraft(category: string, text: string) {
    setLocalDrafts((prev) => ({ ...prev, [category]: text }));
    onAction({ type: "setAnswer", category, text });
  }

  if (view.phase === "writing") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <div className="flex items-center gap-4">
          <span className="font-display flex h-16 w-16 items-center justify-center rounded-2xl bg-gold text-4xl font-black text-ink">
            {view.letter}
          </span>
          {remainingMs !== null && <span className="text-2xl font-bold text-gold tabular-nums">⏱ {Math.ceil(remainingMs / 1000)}s</span>}
        </div>
        <p className="text-sm text-slate-400">
          {view.submittedCount}/{view.totalPlayers} players have started writing
        </p>
        <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {view.categories.map((category) => (
            <label key={category} className="flex flex-col gap-1 rounded-2xl bg-white/5 p-3">
              <span className="text-xs font-semibold text-slate-300">{category}</span>
              <input
                className="input"
                placeholder={`${view.letter}...`}
                maxLength={40}
                value={localDrafts[category] ?? view.yourDrafts[category] ?? ""}
                onChange={(e) => setDraft(category, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (view.phase === "reviewing" && view.review) {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-lg font-bold">
          Round {view.roundIndex + 1} · Letter {view.letter} · Review answers
        </p>
        <p className="max-w-md text-center text-xs text-slate-500">
          Duplicates score less, wrong-letter answers score nothing automatically. Think someone's answer is bogus
          (right letter, but doesn't actually fit)? Challenge it — if more than half the other players agree, it
          scores zero.
        </p>
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          {view.review.map((cat) => (
            <div key={cat.category} className="rounded-2xl bg-white/5 p-4">
              <p className="mb-2 text-sm font-semibold text-gold">{cat.category}</p>
              <div className="flex flex-col gap-1.5">
                {cat.answers.map((a) => (
                  <div key={a.playerId} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-slate-300">{nameFor(a.playerId)}: </span>
                      {a.text || <span className="text-slate-600">(blank)</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={`text-xs ${STATUS_CLASS[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                      {a.playerId !== meId && a.text && (a.status === "unique" || a.status === "duplicate") && (
                        <button
                          className={`rounded-md px-1.5 py-0.5 text-xs transition ${
                            a.challengedBy.includes(meId) ? "bg-accent/30 text-accent" : "text-slate-500 hover:bg-accent/20 hover:text-accent"
                          }`}
                          title="Challenge this answer"
                          onClick={() => onAction({ type: "challenge", category: cat.category, targetPlayerId: a.playerId })}
                        >
                          🚩 {a.challengedBy.length > 0 ? a.challengedBy.length : ""}
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {isHost ? (
          <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
            Lock in scores
          </button>
        ) : (
          <p className="text-sm text-slate-400">Waiting for the host to lock in scores…</p>
        )}
      </div>
    );
  }

  if (view.phase === "roundEnd" || view.phase === "finished") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-lg font-bold">{view.phase === "finished" ? "🏆 Final results!" : `Round ${view.roundIndex + 1} results`}</p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          {[...view.scores]
            .sort((a, b) => b.score - a.score)
            .map((s) => (
              <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
                {nameFor(s.playerId)}: {s.score}
                {s.roundGain > 0 && <span className="ml-1 text-emerald-400">+{s.roundGain}</span>}
              </span>
            ))}
        </div>
        {view.phase === "roundEnd" && isHost && (
          <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
            {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next round"}
          </button>
        )}
        {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}
      </div>
    );
  }

  return null;
}
