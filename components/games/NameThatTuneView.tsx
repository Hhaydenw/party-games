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
  const [isPlaying, setIsPlaying] = useState(false);
  const firedTimeUp = useRef(false);
  const isHost = meId === view.hostId;

  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || view.phase !== "guessing") return;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay was blocked; the visible play button on the record covers this case.
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

  const revealed = view.phase === "roundEnd" || view.phase === "finished";

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs uppercase tracking-widest text-slate-500">
        Round {view.roundIndex + 1} of {view.totalRounds}
      </p>

      {/* Jukebox console */}
      <div
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-white/10 p-6"
        style={{ background: "radial-gradient(circle at 50% 0%, rgba(242,183,5,0.12), transparent 60%), #14142a" }}
      >
        <div className="relative flex h-40 w-40 items-center justify-center">
          {/* Turntable platter glow */}
          <div className="absolute h-40 w-40 rounded-full bg-gold/10 blur-xl" />
          {/* Vinyl record */}
          <div
            className={`relative h-36 w-36 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.6)] ${isPlaying ? "[animation:record-spin_2.8s_linear_infinite]" : ""}`}
            style={{
              background:
                "repeating-radial-gradient(circle at center, #0c0c14 0px, #0c0c14 3px, #1c1c2e 3px, #1c1c2e 5px)",
            }}
          >
            <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 38% 32%, rgba(255,255,255,0.25), transparent 45%)" }} />
            <div className="absolute inset-[38%] flex items-center justify-center rounded-full bg-gold shadow-inner">
              <span className="text-lg">🎵</span>
            </div>
          </div>
        </div>

        {/* Equalizer bars */}
        <div className="flex h-8 items-end gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className={`w-1.5 rounded-full bg-gold ${isPlaying ? "[animation:eq-bounce_0.7s_ease-in-out_infinite]" : ""}`}
              style={{ height: "100%", animationDelay: `${i * 90}ms`, transform: isPlaying ? undefined : "scaleY(0.15)" }}
            />
          ))}
        </div>

        <audio
          ref={audioRef}
          src={view.previewUrl}
          controls
          className="w-full max-w-xs"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />

        {remainingMs !== null && view.phase === "guessing" && (
          <p className="text-sm font-bold tracking-wide text-gold">⏱ {Math.ceil(remainingMs / 1000)}s</p>
        )}
      </div>

      {view.phase === "guessing" && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <div className="max-h-40 overflow-y-auto rounded-xl bg-black/20 p-3 text-sm">
            {view.guesses.length === 0 && <p className="text-slate-500">Guesses will show up here…</p>}
            {view.guesses.map((g) =>
              g.correct ? (
                <p key={g.id} className="text-emerald-400">
                  🎉 {nameFor(g.playerId)} got it!{g.bothBonus && " 🎯 title + artist bonus!"}
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
            <form onSubmit={submitGuess} className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="input"
                  placeholder="Song title or artist…"
                  value={guessDraft}
                  maxLength={80}
                  onChange={(e) => setGuessDraft(e.target.value)}
                />
                <button className="btn-primary shrink-0">Guess</button>
              </div>
              <p className="text-center text-xs text-slate-500">Tip: guess both, e.g. "Bohemian Rhapsody - Queen", for bonus points</p>
            </form>
          ) : (
            <p className="text-center text-sm text-emerald-400">You got it! Waiting for the round to end…</p>
          )}
        </div>
      )}

      {revealed && (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl border border-gold/30 bg-gold/5 px-6 py-4 text-center [animation:feud-pop_0.4s_ease-out]">
            <p className="text-xs uppercase tracking-widest text-slate-500">Now revealing</p>
            <p className="mt-1 text-lg font-bold">
              <span className="text-gold">{view.revealedTitle}</span>
            </p>
            <p className="text-sm text-slate-400">by {view.revealedArtist}</p>
          </div>
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
