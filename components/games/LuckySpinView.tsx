"use client";

import { useEffect, useRef, useState } from "react";
import { LuckySpinAction, LuckySpinView as ViewType } from "@/lib/games/luckySpin";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ".split("");
const VOWELS = "AEIOU".split("");

export default function LuckySpinView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: LuckySpinAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const [solveDraft, setSolveDraft] = useState("");
  const [spinning, setSpinning] = useState(false);
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  const prevSpin = useRef(view.lastSpinResult);
  useEffect(() => {
    if (view.lastSpinResult !== prevSpin.current) {
      setSpinning(false);
      prevSpin.current = view.lastSpinResult;
    }
  }, [view.lastSpinResult]);

  const revealed = view.phase === "roundEnd" || view.phase === "finished";
  const wasRevealed = useRef(revealed);
  useEffect(() => {
    if (revealed && !wasRevealed.current) playSound(view.lastRoundResult?.winnerId === meId ? "win" : "reveal");
    wasRevealed.current = revealed;
  }, [revealed, view.lastRoundResult, meId]);

  function spin() {
    setSpinning(true);
    playSound("click");
    onAction({ type: "spin" });
  }

  function guessLetter(letter: string, isVowel: boolean) {
    playSound("select");
    onAction(isVowel ? { type: "buyVowel", letter } : { type: "guessConsonant", letter });
  }

  function submitSolve(e: React.FormEvent) {
    e.preventDefault();
    if (!solveDraft.trim()) return;
    playSound("select");
    onAction({ type: "solve", text: solveDraft.trim() });
    setSolveDraft("");
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs uppercase tracking-widest text-slate-500">
        Round {view.roundIndex + 1} of {view.totalRounds} · {view.category}
      </p>

      {/* Puzzle board */}
      <div className="w-full max-w-2xl overflow-x-auto rounded-2xl border border-gold/20 bg-gold/5 px-4 py-6 text-center">
        {revealed ? (
          <p className="whitespace-pre-wrap font-mono text-xl font-black tracking-wider text-gold [animation:feud-pop_0.4s_ease-out] sm:text-2xl">
            {view.revealedPhrase}
          </p>
        ) : (
          <p className="whitespace-pre font-mono text-lg font-black tracking-wider text-slate-100 sm:text-xl">{view.display}</p>
        )}
      </div>

      {/* Wheel + status */}
      <div className="flex items-center gap-6">
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/20 text-lg font-black shadow-lg ${
            spinning ? "animate-spin" : ""
          }`}
          style={{ background: "conic-gradient(#e94560 0deg 60deg, #f2b705 60deg 120deg, #22c55e 120deg 180deg, #3b82f6 180deg 240deg, #a855f7 240deg 300deg, #f97316 300deg 360deg)" }}
        >
          <span className="rounded-full bg-ink px-2 py-1 text-xs text-white">
            {spinning ? "…" : view.currentSegmentValue !== null ? `$${view.currentSegmentValue}` : view.lastSpinResult === "BANKRUPT" ? "BANKRUPT" : view.lastSpinResult === "LOSE_TURN" ? "MISS" : "?"}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          {view.phase === "finished" ? (
            "🏆 Game over!"
          ) : view.yourTurn ? (
            <span className="font-bold text-accent">Your turn</span>
          ) : (
            <>Waiting on {nameFor(view.currentPlayerId)}…</>
          )}
        </p>
      </div>

      {view.phase === "playing" && view.yourTurn && (
        <div className="flex flex-col items-center gap-4">
          {view.currentSegmentValue === null ? (
            <button className="btn-gold text-lg" onClick={spin} disabled={spinning}>
              🎡 Spin
            </button>
          ) : (
            <p className="text-sm text-slate-400">Landed on ${view.currentSegmentValue} — guess a consonant, buy a vowel, or solve.</p>
          )}

          <div className="flex flex-wrap justify-center gap-1.5">
            {CONSONANTS.map((l) => (
              <button
                key={l}
                disabled={view.currentSegmentValue === null || view.guessedLetters.includes(l)}
                onClick={() => guessLetter(l, false)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-sm font-bold transition enabled:hover:bg-accent/40 disabled:opacity-30"
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {VOWELS.map((l) => (
              <button
                key={l}
                disabled={!view.canBuyVowel || view.guessedLetters.includes(l)}
                onClick={() => guessLetter(l, true)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/20 text-sm font-bold text-gold transition enabled:hover:bg-gold/40 disabled:opacity-30"
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Buying a vowel costs $250 (needs $250+ in your round earnings)</p>

          <form onSubmit={submitSolve} className="flex w-full max-w-md gap-2">
            <input
              className="input"
              placeholder="Solve the puzzle…"
              value={solveDraft}
              onChange={(e) => setSolveDraft(e.target.value)}
            />
            <button className="btn-primary shrink-0">Solve</button>
          </form>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 text-sm">
        {view.roundEarnings.map((e) => (
          <span key={e.playerId} className={`rounded-xl px-3 py-1.5 ${e.playerId === view.currentPlayerId && view.phase === "playing" ? "bg-accent/20 ring-1 ring-accent/40" : "bg-white/5"}`}>
            {nameFor(e.playerId)}: ${e.amount} this round
          </span>
        ))}
      </div>

      {revealed && (
        <div className="flex flex-col items-center gap-3">
          {view.lastRoundResult && (
            <p className="text-center font-semibold text-emerald-400">
              {view.lastRoundResult.winnerId ? `${nameFor(view.lastRoundResult.winnerId)} ${view.lastRoundResult.reason}!` : "Round over."}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            {[...view.totalScores]
              .sort((a, b) => b.score - a.score)
              .map((s) => (
                <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
                  {nameFor(s.playerId)}: ${s.score}
                </span>
              ))}
          </div>
          {view.phase === "roundEnd" && isHost && (
            <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
              {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next puzzle"}
            </button>
          )}
          {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}
        </div>
      )}

      <div className="rounded-xl bg-black/20 p-3 text-xs text-slate-400">
        {view.roundLog.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
