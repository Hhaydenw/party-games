"use client";

import { useEffect, useRef, useState } from "react";
import { NameThatTuneAction, NameThatTuneView as ViewType } from "@/lib/games/nameThatTune";
import { PlayerInfo } from "@/lib/types";
import { playSound, getSoundSettings, subscribeSoundSettings } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";

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
  const [isPlaying, setIsPlaying] = useState(false);
  // Guards handleEnded() specifically, separate from useCountdown's own
  // internal guard for the fallback path below — the two are independent
  // and both are safe to fire (the server safely no-ops a redundant
  // timeUp once the round's already moved past "guessing").
  const endedFired = useRef(false);
  const isHost = meId === view.hostId;

  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  // The preview clip's own playback volume follows the same persisted
  // volume the rest of the app's sound uses (see lib/sound.ts) — so it
  // starts well below max instead of the browser's default 100%, and stays
  // that way across rounds/games instead of resetting each time.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = getSoundSettings().volume;
    return subscribeSoundSettings(() => {
      if (audioRef.current) audioRef.current.volume = getSoundSettings().volume;
    });
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || view.phase !== "guessing") return;
    let cancelled = false;
    function startAtHook() {
      if (cancelled || !audio) return;
      // We don't have real hook/timestamp data for where a song's most
      // recognizable moment falls, so this is a light heuristic — nudge
      // past a small fraction of the clip (most preview clips front-load a
      // representative section already) rather than always starting at
      // dead silence/count-in. Capped low so it never skips meaningfully
      // into the clip.
      const offset = Number.isFinite(audio.duration) ? Math.min(8, audio.duration * 0.15) : 0;
      if (offset > 0) audio.currentTime = offset;
      audio.play().catch(() => {
        // Autoplay was blocked; the visible play button on the record covers this case.
      });
    }
    audio.currentTime = 0;
    if (audio.readyState >= 1) startAtHook();
    else audio.addEventListener("loadedmetadata", startAtHook, { once: true });
    return () => {
      cancelled = true;
      audio.removeEventListener("loadedmetadata", startAtHook);
    };
  }, [view.previewUrl, view.phase]);

  // The round ends when the clip actually finishes playing, so the guess
  // window always lines up with however long that clip really is, instead
  // of a fixed guess that could cut a longer clip off early.
  function handleEnded() {
    setIsPlaying(false);
    if (isHost && view.phase === "guessing" && !endedFired.current) {
      endedFired.current = true;
      onAction({ type: "timeUp" });
    }
  }
  useEffect(() => {
    endedFired.current = false;
  }, [view.roundEndsAt]);

  // Fallback only — in case playback never starts/finishes (autoplay
  // blocked, network hiccup).
  const remainingMs = useCountdown(view.roundEndsAt, isHost, () => onAction({ type: "timeUp" }));

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!guessDraft.trim()) return;
    onAction({ type: "guess", text: guessDraft.trim() });
    setGuessDraft("");
  }

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
          onEnded={handleEnded}
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
          <div className="flex items-center gap-4 rounded-2xl border border-gold/30 bg-gold/5 px-6 py-4 text-center [animation:feud-pop_0.4s_ease-out]">
            {view.revealedArtworkUrl && (
              <img src={view.revealedArtworkUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg shadow-lg" />
            )}
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">Now revealing</p>
              <p className="mt-1 text-lg font-bold">
                <span className="text-gold">{view.revealedTitle}</span>
              </p>
              <p className="text-sm text-slate-400">by {view.revealedArtist}</p>
            </div>
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
