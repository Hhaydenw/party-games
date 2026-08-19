"use client";

import { useEffect, useRef, useState } from "react";
import { LuckySpinAction, LuckySpinView as ViewType, WHEEL, WheelSegment, SPIN_DURATION_MS } from "@/lib/games/luckySpin";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { serverNow } from "@/lib/serverClock";

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ".split("");
const VOWELS = "AEIOU".split("");
const SEG_ANGLE = 360 / WHEEL.length;
const SPIN_FULL_TURNS = 4;

// A wider, higher-contrast palette (12 hues vs. the old 6) so adjacent
// wedges read as distinctly different at a glance, closer to the real
// wheel's dense, colorful look now that there are 24 of them.
function segColor(seg: WheelSegment, i: number): string {
  if (seg === "BANKRUPT") return "#0f1117";
  if (seg === "LOSE_TURN") return "#475569";
  const palette = [
    "#22c55e", "#f97316", "#3b82f6", "#e94560",
    "#a855f7", "#f2b705", "#14b8a6", "#ec4899",
    "#6366f1", "#84cc16", "#06b6d4", "#f43f5e",
  ];
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
// wedge rather than just displaying the resulting dollar amount.
//
// Labels run *vertically* (stacked top-to-bottom via `writing-mode`)
// instead of tangentially around the rim. That sidesteps the whole
// upside-down/mirrored-text problem an earlier version had to work around
// with a 180°-flip hack for the lower half of the wheel — every label
// simply reads top-to-bottom along its own spoke, at every wedge, with no
// special-casing needed for which half of the wheel it's on.
function Wheel({ rotation, spinning }: { rotation: number; spinning: boolean }) {
  const gradient = WHEEL.map((seg, i) => `${segColor(seg, i)} ${i * SEG_ANGLE}deg ${(i + 1) * SEG_ANGLE}deg`).join(", ");

  return (
    // No mobile constraint to design around here, so this is sized to be
    // as legible as possible rather than capped to fit a phone screen.
    <div className="relative h-[440px] w-[440px] shrink-0">
      <div
        className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 -translate-y-1"
        style={{ borderLeft: "16px solid transparent", borderRight: "16px solid transparent", borderTop: "28px solid #f2b705" }}
      />
      <div
        className={`h-full w-full rounded-full border-4 shadow-2xl transition-transform ${spinning ? "border-gold/60" : "border-white/20"}`}
        style={{
          background: `conic-gradient(${gradient})`,
          transform: `rotate(${rotation}deg)`,
          transitionDuration: `${SPIN_DURATION_MS}ms`,
          transitionTimingFunction: "cubic-bezier(0.17, 0.67, 0.14, 1)",
          boxShadow: spinning ? "0 0 32px 5px rgba(242,183,5,0.45)" : undefined,
        }}
      >
        {WHEEL.map((seg, i) => {
          const angle = i * SEG_ANGLE + SEG_ANGLE / 2;
          return (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 h-0 w-0 origin-top-left"
              style={{ transform: `rotate(${angle}deg) translate(0, -180px)` }}
            >
              <span
                className="block -translate-x-1/2 text-xs font-black text-white drop-shadow"
                style={{ writingMode: "vertical-rl", textOrientation: "upright", letterSpacing: "-1px" }}
              >
                {segLabel(seg)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 m-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-ink bg-gold text-2xl">🎡</div>
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
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  const revealed = view.phase === "roundEnd" || view.phase === "finished";
  const wasRevealed = useRef(revealed);
  useEffect(() => {
    if (revealed && !wasRevealed.current) playSound(view.lastRoundResult?.winnerId === meId ? "win" : "reveal");
    wasRevealed.current = revealed;
  }, [revealed, view.lastRoundResult, meId]);

  // `spinning` is derived from the server-broadcast `spinEndsAt` deadline
  // (via the clock-synced serverNow(), same as every other timer) instead
  // of local-only state set by whoever clicked Spin. That was the actual
  // bug behind the wheel "not spinning for other players" — the previous
  // version's `spinning` flag only ever became true on the clicking
  // player's own client (a local setTimeout keyed to their click), so
  // spectators' UI never agreed with what the wheel itself was doing, and
  // the reveal-gating logic below (which used that same local flag) could
  // end up stuck in an inconsistent state for them. Deriving it from a
  // real, shared deadline means every client's idea of "is a spin
  // currently animating" is identical.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!view.spinEndsAt) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 100);
    return () => clearInterval(interval);
  }, [view.spinEndsAt]);
  const spinning = view.spinEndsAt !== null && serverNow() < view.spinEndsAt;

  // The wheel's rotation target — recomputed whenever the server hands us
  // a *new spin*, continuing smoothly from wherever it currently sits
  // rather than resetting, so a spin landing while a previous spin's
  // animation hasn't fully settled yet (possible right after Bankrupt/Lose
  // a Turn immediately passes the turn to someone who spins again) still
  // reads as one continuous motion instead of jumping.
  //
  // "Is this a new spin" is keyed off `spinSeq` (a plain incrementing
  // counter, bumped once per spin server-side), not `lastSpinIndex` — that
  // used to be the bug behind a spin occasionally just not animating at
  // all. `lastSpinIndex` is a wedge index (0-15), which two different
  // spins can perfectly legitimately land on again — a ~6% chance on any
  // given spin, compounding across a whole game's worth of spins — and
  // this effect only re-runs when its dependency's *value* actually
  // changes, so landing on the same wedge as the last spin this client
  // processed left it reading identically to before and nothing
  // re-triggered. (An earlier attempt at this fix keyed off `spinEndsAt`
  // instead, assuming a millisecond timestamp couldn't collide — it can,
  // between two spins close enough together, which a quick test caught.
  // `spinSeq` can't collide, full stop.)
  const [rotation, setRotation] = useState(0);
  const prevSpinSeq = useRef<number | null>(null);
  useEffect(() => {
    if (view.lastSpinIndex === null || view.spinSeq === prevSpinSeq.current) return;
    prevSpinSeq.current = view.spinSeq;
    const wedgeCenter = view.lastSpinIndex * SEG_ANGLE + SEG_ANGLE / 2;
    const targetMod = (360 - wedgeCenter + 360) % 360;
    setRotation((prev) => {
      const nextFullTurn = Math.ceil(prev / 360) * 360;
      return nextFullTurn + SPIN_FULL_TURNS * 360 + targetMod;
    });

    // A ticking sound that fires as wedges sweep past the pointer, spaced
    // with an ease-out curve so it starts fast and audibly decelerates
    // into the landing — a fixed tick count rather than one scaled to the
    // exact number of wedge-crossings, which keeps this cheap regardless
    // of how many full turns the spin makes.
    const TICKS = 18;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= TICKS; i++) {
      const t = SPIN_DURATION_MS * Math.pow(i / TICKS, 1.8);
      timers.push(setTimeout(() => playSound("click"), t));
    }
    return () => timers.forEach(clearTimeout);
  }, [view.spinSeq, view.lastSpinIndex]);

  function spin() {
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

  // Alerts you the moment it becomes your turn — including the very first
  // turn of the game, decided by the order-spin below — so you don't have
  // to be staring at the screen to notice. Same wasMyTurn-ref pattern used
  // by Monopoly/Uno: only fires on the false -> true transition, not on
  // every render while it's already your turn.
  const wasMyTurn = useRef(view.yourTurn);
  useEffect(() => {
    if (view.yourTurn && !wasMyTurn.current) playSound("turn");
    wasMyTurn.current = view.yourTurn;
  }, [view.yourTurn]);

  if (view.phase === "orderSpin") {
    const youSpun = view.orderSpinValues.find((v) => v.playerId === meId);
    const ranked = [...view.orderSpinValues].sort((a, b) => b.value - a.value);
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="text-center">
          <p className="text-lg font-bold">Spin to see who goes first!</p>
          <p className="mt-1 text-sm text-slate-400">Everyone spins once — highest number goes first.</p>
        </div>
        <div
          key={youSpun ? "spun" : "unspun"}
          className={`flex h-32 w-32 items-center justify-center rounded-full border-4 border-gold/60 bg-white/5 text-4xl font-black text-gold shadow-lg ${
            youSpun ? "[animation:feud-pop_0.4s_ease-out]" : ""
          }`}
        >
          {youSpun ? youSpun.value : "?"}
        </div>
        {youSpun ? (
          <p className="text-sm text-slate-400">
            You rolled <span className="font-bold text-gold">{youSpun.value}</span>. Waiting on{" "}
            {view.orderSpinValues.length}/{players.length} players…
          </p>
        ) : (
          <button
            className="btn-gold text-lg"
            onClick={() => {
              playSound("click");
              onAction({ type: "spinForOrder" });
            }}
          >
            🎡 Spin for turn order
          </button>
        )}
        {ranked.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 text-sm">
            {ranked.map((v, i) => (
              <span key={v.playerId} className="rounded-xl bg-white/5 px-3 py-1.5 font-semibold">
                {i === 0 ? "🥇 " : ""}
                {nameFor(v.playerId)}: {v.value}
              </span>
            ))}
          </div>
        )}
      </div>
    );
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
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
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
      <div className="flex flex-col items-center gap-3">
        <Wheel rotation={rotation} spinning={spinning} />
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
          {/* Gated on `spinning` (the shared, server-synced deadline), not
              just `view.currentSegmentValue` — the server resolves the
              spin almost instantly, well before the wheel is done
              animating, so showing the result the moment that response
              arrives would spoil it mid-spin. */}
          {spinning ? (
            <p className="animate-pulse text-sm font-semibold text-gold">🎡 Spinning…</p>
          ) : view.currentSegmentValue === null ? (
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
                disabled={spinning || view.currentSegmentValue === null || view.guessedLetters.includes(l)}
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
                disabled={spinning || !view.canBuyVowel || view.guessedLetters.includes(l)}
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

      {/* Per-round earnings only ever showed "this round" amounts, with no
          running total visible anywhere until a round actually ended —
          this strip is the game's cumulative winnings, visible the whole
          time (it's what actually determines who's winning). */}
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-widest text-slate-500">Total winnings</p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          {[...view.totalScores]
            .sort((a, b) => b.score - a.score)
            .map((s) => (
              <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5 font-semibold">
                {nameFor(s.playerId)}: ${s.score}
              </span>
            ))}
        </div>
      </div>

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
