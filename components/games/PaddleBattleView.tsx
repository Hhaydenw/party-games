"use client";

import { useEffect, useRef } from "react";
import { PaddleBattleAction, PaddleBattleView as ViewType } from "@/lib/games/paddleBattle";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

export default function PaddleBattleView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: PaddleBattleAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputState = useRef({ up: false, down: false });
  const lastSent = useRef("");

  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const me = view.paddles.find((p) => p.id === meId);
  const opponent = view.paddles.find((p) => p.id !== meId);
  const isSpectator = !me;

  // Keyboard capture — W/S and arrow keys both work.
  useEffect(() => {
    if (isSpectator) return;
    function down(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") inputState.current.up = true;
      else if (k === "s" || k === "arrowdown") inputState.current.down = true;
    }
    function up(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") inputState.current.up = false;
      else if (k === "s" || k === "arrowdown") inputState.current.down = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [isSpectator]);

  // Stream input to the server at a steady rate.
  useEffect(() => {
    if (isSpectator) return;
    const interval = setInterval(() => {
      const s = inputState.current;
      const payload = `${s.up}${s.down}`;
      if (payload !== lastSent.current) {
        lastSent.current = payload;
        onAction({ type: "input", up: s.up, down: s.down });
      }
    }, 40);
    return () => clearInterval(interval);
  }, [onAction, isSpectator]);

  // Score-change sound.
  const prevScores = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const p of view.paddles) {
      const prev = prevScores.current[p.id];
      if (prev !== undefined && p.score > prev) playSound(p.id === meId ? "success" : "hit");
    }
    prevScores.current = Object.fromEntries(view.paddles.map((p) => [p.id, p.score]));
  }, [view.paddles, meId]);

  const announcedEnd = useRef(false);
  useEffect(() => {
    if (view.phase === "finished" && !announcedEnd.current) {
      announcedEnd.current = true;
      playSound("win");
    }
  }, [view.phase]);

  // Redraw whenever a new tick arrives from the server.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const sx = canvas.width / view.arena.width;
    const sy = canvas.height / view.arena.height;

    ctx.fillStyle = "#0a1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center dashed line.
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const p of view.paddles) {
      const x = p.side === "left" ? 24 * sx : view.arena.width * sx - 24 * sx;
      ctx.fillStyle = p.id === meId ? "#f2b705" : "#e94560";
      ctx.fillRect(x - (view.paddleWidth * sx) / 2, p.y * sy - (view.paddleHeight * sy) / 2, view.paddleWidth * sx, view.paddleHeight * sy);
    }

    if (!view.serving || view.phase === "finished") {
      ctx.beginPath();
      ctx.fillStyle = "#fff";
      ctx.arc(view.ball.x * sx, view.ball.y * sy, Math.max(4, view.ballRadius * sx), 0, Math.PI * 2);
      ctx.fill();
    }
  }, [view, meId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-10 text-3xl font-black tabular-nums">
        {view.paddles.map((p) => (
          <span key={p.id} className={p.id === meId ? "text-gold" : "text-accent"}>
            {p.score}
          </span>
        ))}
      </div>
      <p className="text-center text-sm text-slate-400">
        {view.phase === "finished"
          ? "🏆 Match over!"
          : isSpectator
            ? `${nameFor(view.paddles[0]!.id)} vs ${nameFor(view.paddles[1]!.id)}`
            : `You (${me!.side}) vs ${nameFor(opponent!.id)}`}
      </p>

      <div className="relative mx-auto w-full max-w-2xl">
        <canvas
          ref={canvasRef}
          width={800}
          height={500}
          className="w-full select-none rounded-2xl border border-white/10"
          style={{ aspectRatio: "800 / 500" }}
        />
      </div>
      <p className="text-center text-xs text-slate-500">W/S or ↑/↓ to move your paddle · first to {view.winningScore} wins</p>

      {view.phase === "finished" && (
        <p className="text-center text-sm text-slate-400">Match over — head back to the lobby to play again.</p>
      )}
    </div>
  );
}
