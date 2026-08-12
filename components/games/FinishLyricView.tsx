"use client";

import { useEffect, useRef, useState } from "react";
import { FinishLyricAction, FinishLyricView as ViewType } from "@/lib/games/finishLyric";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

export default function FinishLyricView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: FinishLyricAction) => void;
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
    audio.play().catch(() => {});
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

  const revealed = view.phase === "roundEnd" || view.phase === "finished";

  const wasRevealed = useRef(revealed);
  useEffect(() => {
    if (revealed && !wasRevealed.current) playSound(view.youGuessedCorrectly ? "success" : "reveal");
    wasRevealed.current = revealed;
  }, [revealed, view.youGuessedCorrectly]);

  const guessCountRef = useRef(view.guesses.length);
  useEffect(() => {
    if (view.guesses.length > guessCountRef.current) {
      const last = view.guesses[view.guesses.length - 1];
      if (last?.correct) playSound(last.playerId === meId ? "success" : "select");
    }
    guessCountRef.current = view.guesses.length;
  }, [view.guesses, meId]);

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!guessDraft.trim()) return;
    onAction({ type: "guess", text: guessDraft.trim() });
    setGuessDraft("");
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs uppercase tracking-widest text-slate-500">
        Round {view.roundIndex + 1} of {view.totalRounds}
      </p>

      <audio ref={audioRef} src={view.previewUrl} controls className="w-full max-w-xs" />

      {/* The blanked-out lyric line — the whole point of the game */}
      <div className="w-full max-w-lg rounded-2xl border border-gold/20 bg-gold/5 px-6 py-5 text-center">
        <p className="mb-2 text-[11px] uppercase tracking-widest text-slate-500">Finish the lyric</p>
        {revealed ? (
          <p className="text-xl font-bold text-gold [animation:feud-pop_0.4s_ease-out]">"{view.revealedAnswer}"</p>
        ) : (
          <p className="break-words font-mono text-lg font-bold tracking-wider text-slate-100 sm:text-2xl">{view.blankPattern}</p>
        )}
        {remainingMs !== null && view.phase === "guessing" && (
          <p className="mt-2 text-sm font-bold tracking-wide text-gold">⏱ {Math.ceil(remainingMs / 1000)}s</p>
        )}
      </div>

      {view.phase === "guessing" && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <div className="max-h-40 overflow-y-auto rounded-xl bg-black/20 p-3 text-sm">
            {view.guesses.length === 0 && <p className="text-slate-500">Guesses will show up here…</p>}
            {view.guesses.map((g) =>
              g.correct ? (
                <p key={g.id} className="text-emerald-400">
                  🎉 {nameFor(g.playerId)} nailed it!
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
                placeholder="Type the missing line…"
                value={guessDraft}
                maxLength={120}
                onChange={(e) => setGuessDraft(e.target.value)}
              />
              <button className="btn-primary shrink-0">Guess</button>
            </form>
          ) : (
            <p className="text-center text-sm text-emerald-400">You got it! Waiting for the round to end…</p>
          )}
        </div>
      )}

      {revealed && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-slate-400">
            from <span className="text-gold">{view.revealedTitle}</span> by {view.revealedArtist}
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
              {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next lyric"}
            </button>
          )}
          {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}
        </div>
      )}
    </div>
  );
}
