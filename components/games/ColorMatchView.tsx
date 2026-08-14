"use client";

import { useEffect, useRef, useState } from "react";
import { ColorMatchAction, ColorMatchView as ViewType, RGB } from "@/lib/games/colorMatch";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

function rgbCss({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export default function ColorMatchView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: ColorMatchAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const [draft, setDraft] = useState<RGB>({ r: 128, g: 128, b: 128 });
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedTimeUp = useRef(false);

  // Reset the slider draft to a neutral grey at the start of each round,
  // rather than carrying over the previous round's guess.
  useEffect(() => {
    setDraft({ r: 128, g: 128, b: 128 });
  }, [view.roundIndex]);

  const deadline = view.phase === "viewing" ? view.viewEndsAt : view.phase === "guessing" ? view.guessEndsAt : null;
  useEffect(() => {
    firedTimeUp.current = false;
    if (!deadline) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && isHost && !firedTimeUp.current) {
        firedTimeUp.current = true;
        onAction({ type: "timeUp" });
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [deadline, isHost, onAction]);

  const announcedEnd = useRef(false);
  useEffect(() => {
    if (view.phase === "finished" && !announcedEnd.current) {
      announcedEnd.current = true;
      playSound("win");
    }
  }, [view.phase]);

  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (view.phase === "roundEnd" && prevPhase.current !== "roundEnd") playSound("reveal");
    prevPhase.current = view.phase;
  }, [view.phase]);

  function submitGuess() {
    playSound("select");
    onAction({ type: "submitGuess", color: draft });
  }

  function Slider({ channel, label }: { channel: "r" | "g" | "b"; label: string }) {
    return (
      <label className="flex items-center gap-3">
        <span className="w-4 text-xs font-bold text-slate-400">{label}</span>
        <input
          type="range"
          min={0}
          max={255}
          value={draft[channel]}
          disabled={view.youSubmitted}
          onChange={(e) => setDraft((d) => ({ ...d, [channel]: Number(e.target.value) }))}
          className="flex-1 accent-accent"
        />
        <span className="w-9 text-right font-mono text-xs text-slate-400">{draft[channel]}</span>
      </label>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs uppercase tracking-widest text-slate-500">
        Round {view.roundIndex + 1} of {view.totalRounds}
      </p>

      {view.phase === "viewing" && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-semibold text-gold">Study this color!</p>
          <div className="h-52 w-52 rounded-3xl border-4 border-white/10 shadow-2xl sm:h-64 sm:w-64" style={{ backgroundColor: rgbCss(view.target!) }} />
          {remainingMs !== null && <p className="text-2xl font-bold text-gold tabular-nums">{Math.ceil(remainingMs / 1000)}s</p>}
        </div>
      )}

      {view.phase === "guessing" && (
        <div className="flex flex-col items-center gap-5">
          <p className="text-sm text-slate-400">Dial in the color from memory…</p>
          {remainingMs !== null && <p className="text-xl font-bold text-gold tabular-nums">{Math.ceil(remainingMs / 1000)}s</p>}
          <div className="h-40 w-40 rounded-3xl border-4 border-white/10 shadow-xl" style={{ backgroundColor: rgbCss(draft) }} />
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white/5 p-4">
            <Slider channel="r" label="R" />
            <Slider channel="g" label="G" />
            <Slider channel="b" label="B" />
          </div>
          {view.youSubmitted ? (
            <p className="text-sm text-emerald-400">Guess locked in! Waiting on {view.totalPlayers - view.submittedCount} more…</p>
          ) : (
            <button className="btn-primary" onClick={submitGuess}>
              Lock in guess
            </button>
          )}
        </div>
      )}

      {(view.phase === "roundEnd" || view.phase === "finished") && view.target && view.results && (
        <div className="flex w-full max-w-2xl flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Actual</p>
              <div className="h-20 w-20 rounded-2xl border-2 border-white/20" style={{ backgroundColor: rgbCss(view.target) }} />
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2">
            {view.results.map((r) => (
              <div key={r.playerId} className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
                <div
                  className="h-10 w-10 shrink-0 rounded-lg border border-white/20"
                  style={{ backgroundColor: r.color ? rgbCss(r.color) : "transparent" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nameFor(r.playerId)}</p>
                  <p className="text-xs text-slate-400">{r.color ? `rgb(${r.color.r}, ${r.color.g}, ${r.color.b})` : "No guess"}</p>
                </div>
                <span className={`shrink-0 font-mono text-lg font-black ${r.score !== null && r.score >= 8 ? "text-emerald-400" : r.score !== null && r.score >= 4 ? "text-gold" : "text-accent"}`}>
                  {r.score !== null ? r.score.toFixed(1) : "0.0"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 text-sm">
        {[...view.scores]
          .sort((a, b) => b.score - a.score)
          .map((s) => (
            <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
              {nameFor(s.playerId)}: {s.score.toFixed(1)}
              {s.roundGain > 0 && <span className="ml-1 text-emerald-400">+{s.roundGain.toFixed(1)}</span>}
            </span>
          ))}
      </div>

      {view.phase === "roundEnd" && isHost && (
        <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
          {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next color"}
        </button>
      )}
      {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}

      {view.log.length > 0 && (
        <div className="w-full max-w-xl rounded-xl bg-black/20 p-3 text-xs text-slate-400">
          {[...view.log].reverse().slice(0, 4).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
