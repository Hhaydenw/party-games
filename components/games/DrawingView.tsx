"use client";

import { useEffect, useRef, useState } from "react";
import { DrawingAction, DrawingView as ViewType, Stroke } from "@/lib/games/drawing";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";

const PALETTE = ["#f5f5f5", "#1a1a2e", "#e94560", "#f2b705", "#22c55e", "#3b82f6", "#a855f7", "#78350f"];
const WIDTHS = [3, 6, 12];

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const first = stroke.points[0]!;
  ctx.moveTo(first.x * w, first.y * h);
  if (stroke.points.length === 1) {
    // A tap with no drag: draw a dot.
    ctx.lineTo(first.x * w + 0.01, first.y * h);
  }
  for (const p of stroke.points.slice(1)) {
    ctx.lineTo(p.x * w, p.y * h);
  }
  ctx.stroke();
}

export default function DrawingView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: DrawingAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(PALETTE[1]!);
  const [width, setWidth] = useState(WIDTHS[0]!);
  const drawingStrokeId = useRef<string | null>(null);
  const lastEmitAt = useRef(0);
  const [guessDraft, setGuessDraft] = useState("");

  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  // Redraw the whole canvas whenever the authoritative stroke list changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const stroke of view.strokes) drawStroke(ctx, stroke, canvas.width, canvas.height);
  }, [view.strokes]);

  const guessCountRef = useRef(view.guesses.length);
  useEffect(() => {
    if (view.guesses.length > guessCountRef.current) {
      const last = view.guesses[view.guesses.length - 1];
      if (last?.correct) playSound(last.playerId === meId ? "success" : "select");
    }
    guessCountRef.current = view.guesses.length;
  }, [view.guesses, meId]);

  const wasRoundEnd = useRef(view.phase === "roundEnd" || view.phase === "finished");
  useEffect(() => {
    const isEnd = view.phase === "roundEnd" || view.phase === "finished";
    if (isEnd && !wasRoundEnd.current) playSound("reveal");
    wasRoundEnd.current = isEnd;
  }, [view.phase]);

  // Local countdown ticker; the drawer's client is the primary one to fire
  // timeUp (with the usual fallback if their tab stalls — see useCountdown).
  const remainingMs = useCountdown(view.roundEndsAt, view.isDrawer, () => onAction({ type: "timeUp" }));

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!view.isDrawer || view.phase !== "drawing") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const id = randomId();
    drawingStrokeId.current = id;
    onAction({ type: "strokeStart", strokeId: id, color, width, point: pointFromEvent(e) });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingStrokeId.current) return;
    const now = Date.now();
    if (now - lastEmitAt.current < 35) return; // throttle
    lastEmitAt.current = now;
    onAction({ type: "strokePoint", strokeId: drawingStrokeId.current, point: pointFromEvent(e) });
  }

  function handlePointerUp() {
    if (!drawingStrokeId.current) return;
    onAction({ type: "strokeEnd", strokeId: drawingStrokeId.current });
    drawingStrokeId.current = null;
  }

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!guessDraft.trim()) return;
    onAction({ type: "guess", text: guessDraft.trim() });
    setGuessDraft("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-center">
        <p className="text-sm text-slate-400">
          Round {view.roundIndex + 1} of {view.totalRounds} · turn {view.turnInRound} of {view.playersPerRound} ·{" "}
          {nameFor(view.drawerId)} is drawing
        </p>
        {remainingMs !== null && view.phase === "drawing" && (
          <p className="text-sm font-semibold text-gold">{Math.ceil(remainingMs / 1000)}s</p>
        )}
      </div>

      {view.phase === "choosing" && (
        <div className="flex flex-col items-center gap-3 py-6">
          {view.isDrawer ? (
            <>
              <p className="font-semibold">Pick a word to draw</p>
              <div className="flex flex-wrap justify-center gap-2">
                {view.wordOptions?.map((w) => (
                  <button key={w} className="btn-primary" onClick={() => onAction({ type: "chooseWord", word: w })}>
                    {w}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-slate-400">{nameFor(view.drawerId)} is choosing a word…</p>
          )}
        </div>
      )}

      {(view.phase === "drawing" || view.phase === "roundEnd" || view.phase === "finished") && (
        <>
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              width={800}
              height={500}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full max-w-2xl touch-none rounded-2xl border border-white/10 bg-[#f5f5f5]"
              style={{ aspectRatio: "8 / 5", cursor: view.isDrawer ? "crosshair" : "default" }}
            />
          </div>

          {view.isDrawer && view.phase === "drawing" && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <p className="rounded-lg bg-white/5 px-3 py-1 text-sm">
                Word: <span className="font-semibold text-gold">{view.word}</span>
              </p>
              <div className="flex gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-white" : "border-black/20"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                {WIDTHS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWidth(w)}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border ${width === w ? "border-accent bg-accent/20" : "border-white/20"}`}
                  >
                    <span className="rounded-full bg-current" style={{ width: w, height: w }} />
                  </button>
                ))}
              </div>
              <button className="btn-secondary text-sm" onClick={() => onAction({ type: "clear" })}>
                Clear
              </button>
            </div>
          )}

          {!view.isDrawer && view.phase === "drawing" && view.wordMask && (
            <p className="whitespace-pre text-center font-mono text-lg tracking-[0.35em] text-slate-300">
              {view.wordMask.replace(/ /g, "   ")}
            </p>
          )}

          {view.phase === "drawing" && (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
              <div className="max-h-40 overflow-y-auto rounded-xl bg-black/20 p-3 text-sm">
                {view.guesses.length === 0 && <p className="text-slate-500">Guesses will show up here…</p>}
                {view.guesses.map((g) =>
                  g.correct ? (
                    <p key={g.id} className="text-emerald-400">
                      🎉 {nameFor(g.playerId)} guessed the word!
                    </p>
                  ) : (
                    <p key={g.id} className="text-slate-300">
                      <span className="font-semibold text-slate-400">{nameFor(g.playerId)}: </span>
                      {g.text}
                    </p>
                  )
                )}
              </div>
              {!view.isDrawer && !view.youGuessedCorrectly && (
                <form onSubmit={submitGuess} className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Type your guess…"
                    value={guessDraft}
                    maxLength={60}
                    onChange={(e) => setGuessDraft(e.target.value)}
                  />
                  <button className="btn-primary shrink-0">Guess</button>
                </form>
              )}
              {view.youGuessedCorrectly && <p className="text-center text-sm text-emerald-400">You got it! Waiting for the round to end…</p>}
            </div>
          )}

          {(view.phase === "roundEnd" || view.phase === "finished") && view.lastRoundReveal && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-lg font-bold">
                The word was <span className="text-gold">{view.lastRoundReveal.word}</span>
              </p>
              <p className="text-sm text-slate-400">
                {view.lastRoundReveal.correctGuessers.length
                  ? `Guessed by ${view.lastRoundReveal.correctGuessers.map(nameFor).join(", ")}`
                  : "Nobody guessed it that round."}
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
              {view.phase === "roundEnd" && (meId === view.hostId || meId === view.drawerId) && (
                <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
                  {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next round"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
