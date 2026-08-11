"use client";

import { useEffect, useRef, useState } from "react";
import { NameThatTuneAction, NameThatTuneView as ViewType } from "@/lib/games/nameThatTune";
import { PlayerInfo } from "@/lib/types";

export default function NameThatTuneView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: NameThatTuneAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [guessDraft, setGuessDraft] = useState("");
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedTimeUp = useRef(false);
  const isHost = meId === view.hostId;

  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || view.phase !== "guessing") return;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay was blocked; the visible "Play clip" button covers this case.
    });
  }, [view.previewUrl, view.phase]);

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

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!guessDraft.trim()) return;
    onAction({ type: "guess", text: guessDraft.trim() });
    setGuessDraft("");
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <h2 className="mt-1 text-2xl font-bold">🎵 What song is this?</h2>
        {remainingMs !== null && view.phase === "guessing" && <p className="mt-1 text-sm font-semibold text-gold">{Math.ceil(remainingMs / 1000)}s</p>}
      </div>

      <audio ref={audioRef} src={view.previewUrl} controls className="w-full max-w-md" />

      {view.phase === "guessing" && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <div className="max-h-40 overflow-y-auto rounded-xl bg-black/20 p-3 text-sm">
            {view.guesses.length === 0 && <p className="text-slate-500">Guesses will show up here…</p>}
            {view.guesses.map((g) =>
              g.correct ? (
                <p key={g.id} className="text-emerald-400">
                  🎉 {nameFor(g.playerId)} got it!
                </p>
              ) : (
                <p key={g.id} className="text-slate-300">
                  <span className="font-semibold text-slate-400">{nameFor(g.playerId)}: </span>
                  {g.text}
                </p>
              )
            )}
          </div>
          {!view.youGuessedCorrectly ? (
            <form onSubmit={submitGuess} className="flex gap-2">
              <input
                autoFocus
                className="input"
                placeholder="Song title or artist…"
                value={guessDraft}
                maxLength={80}
                onChange={(e) => setGuessDraft(e.target.value)}
              />
              <button className="btn-primary shrink-0">Guess</button>
            </form>
          ) : (
            <p className="text-center text-sm text-emerald-400">You got it! Waiting for the round to end…</p>
          )}
        </div>
      )}

      {(view.phase === "roundEnd" || view.phase === "finished") && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-lg font-bold">
            It was <span className="text-gold">{view.revealedTitle}</span> by <span className="text-gold">{view.revealedArtist}</span>
          </p>
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
              {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next song"}
            </button>
          )}
          {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}
        </div>
      )}
    </div>
  );
}
