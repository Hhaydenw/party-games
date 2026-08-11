"use client";

import { useEffect, useRef, useState } from "react";
import { TriviaAction, TriviaView as ViewType } from "@/lib/games/trivia";
import { PlayerInfo } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];

export default function TriviaView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: TriviaAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const isHost = meId === view.hostId;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedTimeUp = useRef(false);

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

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds} · {view.category} · {view.difficulty}
        </p>
        <h2 className="mt-2 text-xl font-bold">{view.question}</h2>
        {remainingMs !== null && view.phase === "question" && <p className="mt-1 text-sm font-semibold text-gold">{Math.ceil(remainingMs / 1000)}s</p>}
      </div>

      <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {view.options.map((opt, i) => {
          const isMine = view.yourAnswerIndex === i;
          const isCorrect = view.correctIndex === i;
          const revealed = view.correctIndex !== null;
          let style = "border-white/10 bg-white/[0.03] hover:border-white/20";
          if (revealed && isCorrect) style = "border-emerald-400 bg-emerald-400/15";
          else if (revealed && isMine && !isCorrect) style = "border-accent bg-accent/15";
          else if (!revealed && isMine) style = "border-gold bg-gold/10";
          return (
            <button
              key={i}
              disabled={view.yourAnswerIndex !== null || revealed}
              onClick={() => onAction({ type: "answer", optionIndex: i })}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-default ${style}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{LETTERS[i]}</span>
              {opt}
              {revealed && isCorrect && <span className="ml-auto">✅</span>}
            </button>
          );
        })}
      </div>

      {view.phase === "question" && (
        <p className="text-sm text-slate-500">
          {view.answeredCount}/{view.totalPlayers} answered
        </p>
      )}

      {(view.phase === "reveal" || view.phase === "finished") && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            {[...view.scores]
              .sort((a, b) => b.score - a.score)
              .map((s) => (
                <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
                  {nameFor(s.playerId)}: {s.score}
                </span>
              ))}
          </div>
          {view.phase === "reveal" && isHost && (
            <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
              {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next question"}
            </button>
          )}
          {view.phase === "reveal" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}
        </div>
      )}
    </div>
  );
}
