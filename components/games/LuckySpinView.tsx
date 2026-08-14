"use client";

import { useEffect, useRef, useState } from "react";
import { LuckySpinAction, LuckySpinView as ViewType, WHEEL, WheelSegment } from "@/lib/games/luckySpin";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ".split("");
const VOWELS = "AEIOU".split("");
const SEG_ANGLE = 360 / WHEEL.length;

function segColor(seg: WheelSegment, i: number): string {
  if (seg === "BANKRUPT") return "#0f1117";
  if (seg === "LOSE_TURN") return "#475569";
  const palette = ["#e94560", "#f2b705", "#22c55e", "#3b82f6", "#a855f7", "#14b8a6"];
  return palette[i % palette.length]!;
}
function segLabel(seg: WheelSegment): string {
  if (seg === "BANKRUPT") return "BANKRUPT";
  if (seg === "LOSE_TURN") return "MISS";
  return `$${seg}`;
}

// A real wedge-by-wedge wheel (not just a spinning circle) — the conic
// gradient draws the wedges, a label is placed at each wedge's center
// angle, and the whole thing rotates to land exactly on the server-chosen
// wedge rather than just showing the resulting dollar amount.
function Wheel({ spinning, lastSpinIndex }: { spinning: boolean; lastSpinIndex: number | null }) {
  const [rotation, setRotation] = useState(0);
  const prevIndex = useRef<number | null>(null);

  useEffect(() => {
    if (lastSpinIndex === null || lastSpinIndex === prevIndex.current) return;
    prevIndex.current = lastSpinIndex;
    const wedgeCenter = lastSpinIndex * SEG_ANGLE + SEG_ANGLE / 2;
    const targetMod = (360 - wedgeCenter + 360) % 360;
    setRotation((prev) => {
      const nextFullTurn = Math.ceil(prev / 360) * 360;
      return nextFullTurn + 4 * 360 + targetMod;
    });
  }, [lastSpinIndex]);

  const gradient = WHEEL.map((seg, i) => `${segColor(seg, i)} ${i * SEG_ANGLE}deg ${(i + 1) * SEG_ANGLE}deg`).join(", ");

  return (
    <div className="relative h-56 w-56 shrink-0">
      <div
        className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 -translate-y-1"
        style={{ borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "16px solid #f2b705" }}
      />
      <div
        className="h-full w-full rounded-full border-4 border-white/20 shadow-2xl transition-transform ease-out"
        style={{ background: `conic-gradient(${gradient})`, transform: `rotate(${rotation}deg)`, transitionDuration: spinning ? "2600ms" : "0ms" }}
      >
        {WHEEL.map((seg, i) => {
          const angle = i * SEG_ANGLE + SEG_ANGLE / 2;
          return (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 h-0 w-0 origin-top-left"
              style={{ transform: `rotate(${angle}deg) translate(0, -92px)` }}
            >
              <span className="block -translate-x-1/2 whitespace-nowrap text-[10px] font-black text-white drop-shadow">{segLabel(seg)}</span>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full border-4 border-ink bg-gold text-lg">🎡</div>
    </div>
  );
}

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
    <div className="grid w-full gap-6 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <p className="mt-1 inline-block rounded-full bg-gold/15 px-3 py-1 text-sm font-bold text-gold">{view.category}</p>
      </div>

      {/* Puzzle board — a navy game-show board, like Family Feud's, with each
          word wrapping onto its own row of tiles instead of one long
          horizontally-scrolling line. */}
      <div className="w-full max-w-3xl rounded-2xl border-4 border-blue-950 bg-gradient-to-b from-blue-900 to-blue-950 p-4 shadow-2xl sm:p-6">
        {revealed ? (
          <p className="whitespace-pre-wrap text-center font-mono text-xl font-black tracking-wider text-gold [animation:feud-pop_0.4s_ease-out] sm:text-2xl">
            {view.revealedPhrase}
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-2">
            {view.boardWords.map((word, wi) => (
              <div key={wi} className="flex gap-1">
                {word.map((c, ci) => (
                  <span
                    key={ci}
                    className={`flex h-9 w-7 items-center justify-center rounded-sm border-b-2 text-sm font-black sm:h-11 sm:w-8 sm:text-base ${
                      c === "_"
                        ? "border-blue-700 bg-blue-800/60 text-transparent"
                        : "border-yellow-700 bg-gradient-to-b from-yellow-300 to-yellow-500 text-ink"
                    }`}
                  >
                    {c === "_" ? "" : c}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wheel + status */}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
        <Wheel spinning={spinning} lastSpinIndex={view.lastSpinIndex} />
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
    </div>

    <aside className="rounded-xl bg-black/20 p-3 text-xs text-slate-400 xl:sticky xl:top-4">
      {view.roundLog.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </aside>
    </div>
  );
}
