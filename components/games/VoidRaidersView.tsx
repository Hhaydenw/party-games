"use client";

import { useEffect, useRef } from "react";
import { VoidRaidersAction, VoidRaidersView as ViewType } from "@/lib/games/voidRaiders";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const SHIP_COLORS = ["#22c55e", "#3b82f6", "#f2b705", "#ec4899"];
const INVADER_COLORS = ["#f2b705", "#ec4899", "#a855f7", "#3b82f6", "#22c55e"];

// Classic pixel-invader silhouettes (two alternating frames for a bit of
// life), drawn as a small filled grid instead of a plain circle.
const INVADER_FRAME_A = ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10111111101", "10100000101", "00011011000"];
const INVADER_FRAME_B = ["00100000100", "10010001001", "10111111101", "10101110101", "11111111111", "01111111110", "01000000010", "10100000101"];

function drawInvader(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, wiggle: boolean) {
  const grid = wiggle ? INVADER_FRAME_B : INVADER_FRAME_A;
  const rows = grid.length;
  const cols = grid[0]!.length;
  const cell = (r * 2.2) / cols;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  for (let ry = 0; ry < rows; ry++) {
    const line = grid[ry]!;
    for (let cx = 0; cx < cols; cx++) {
      if (line[cx] === "1") ctx.fillRect((cx - cols / 2) * cell, (ry - rows / 2) * cell, cell + 0.5, cell + 0.5);
    }
  }
  ctx.restore();
}

// A small rocket-ish ship (nose, swept wings, cockpit, engine flame)
// instead of a plain triangle.
function drawPlayerShip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, thrust: boolean) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.2);
  ctx.lineTo(r * 0.35, -r * 0.2);
  ctx.lineTo(r * 0.22, r * 0.6);
  ctx.lineTo(-r * 0.22, r * 0.6);
  ctx.lineTo(-r * 0.35, -r * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(r * 0.3, r * 0.1);
  ctx.lineTo(r * 1.1, r * 0.75);
  ctx.lineTo(r * 0.3, r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, r * 0.1);
  ctx.lineTo(-r * 1.1, r * 0.75);
  ctx.lineTo(-r * 0.3, r * 0.6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.15, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  if (thrust) {
    ctx.fillStyle = "rgba(242,183,5,0.9)";
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, r * 0.6);
    ctx.lineTo(0, r * (1.0 + Math.random() * 0.3));
    ctx.lineTo(r * 0.15, r * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export default function VoidRaidersView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: VoidRaidersAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputState = useRef({ left: false, right: false });
  const shootInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSent = useRef("");

  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const colorFor = (id: string) => SHIP_COLORS[view.ships.findIndex((s) => s.id === id) % SHIP_COLORS.length]!;

  useEffect(() => {
    function down(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") inputState.current.left = true;
      else if (k === "d" || k === "arrowright") inputState.current.right = true;
      else if (k === " ") onAction({ type: "shoot" });
    }
    function up(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") inputState.current.left = false;
      else if (k === "d" || k === "arrowright") inputState.current.right = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onAction]);

  useEffect(() => {
    const interval = setInterval(() => {
      const s = inputState.current;
      const payload = `${s.left}${s.right}`;
      if (payload !== lastSent.current) {
        lastSent.current = payload;
        onAction({ type: "input", left: s.left, right: s.right });
      }
    }, 40);
    return () => clearInterval(interval);
  }, [onAction]);

  function startShooting() {
    onAction({ type: "shoot" });
    if (shootInterval.current) return;
    shootInterval.current = setInterval(() => onAction({ type: "shoot" }), 110);
  }
  function stopShooting() {
    if (shootInterval.current) {
      clearInterval(shootInterval.current);
      shootInterval.current = null;
    }
  }
  useEffect(() => stopShooting, []);

  const prevWave = useRef(view.wave);
  useEffect(() => {
    if (view.wave > prevWave.current) playSound("reveal");
    prevWave.current = view.wave;
  }, [view.wave]);

  const me = view.ships.find((s) => s.id === meId);
  const prevMe = useRef(me);
  useEffect(() => {
    if (me && prevMe.current) {
      if (me.lives < prevMe.current.lives) playSound("hit");
      if (prevMe.current.alive && !me.alive) playSound("explosion");
      if (me.score > prevMe.current.score) playSound("shoot");
    }
    prevMe.current = me;
  }, [me]);

  const announcedEnd = useRef(false);
  useEffect(() => {
    if (view.phase === "finished" && !announcedEnd.current) {
      announcedEnd.current = true;
      playSound("win");
    }
  }, [view.phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const sx = canvas.width / view.arena.width;
    const sy = canvas.height / view.arena.height;

    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const wiggle = Math.floor(Date.now() / 400) % 2 === 0;
    for (const e of view.enemies) {
      const color = INVADER_COLORS[e.row % INVADER_COLORS.length]!;
      drawInvader(ctx, e.x * sx, e.y * sy, view.enemyRadius * sx, color, wiggle);
    }

    for (const b of view.bullets) {
      ctx.fillStyle = b.from === "player" ? "#f2b705" : "#ef4444";
      ctx.beginPath();
      ctx.arc(b.x * sx, b.y * sy, Math.max(2, view.bulletRadius * sx), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of view.ships) {
      if (!s.alive) continue;
      if (s.invulnerable && Math.floor(Date.now() / 100) % 2 === 0) continue; // blink while invulnerable
      const color = colorFor(s.id);
      const x = s.x * sx;
      const y = s.y * sy;
      const r = view.shipRadius * sx;
      drawPlayerShip(ctx, x, y, r, color, true);
      ctx.fillStyle = "#fff";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(nameFor(s.id), x, y + r + 20);
    }
  }, [view, meId]);

  const remainingSec = Math.max(0, Math.ceil((view.matchEndsAt - Date.now()) / 1000));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          ⏱ {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")} · Wave {view.wave}
        </p>
        {view.phase === "finished" && <p className="font-bold text-gold">🏆 Match over!</p>}
      </div>

      <div className="relative mx-auto w-full max-w-4xl">
        <canvas
          ref={canvasRef}
          width={900}
          height={650}
          className="w-full select-none rounded-2xl border border-white/10"
          style={{ aspectRatio: "900 / 650", cursor: "crosshair" }}
          onMouseDown={startShooting}
          onMouseUp={stopShooting}
          onMouseLeave={stopShooting}
        />
        {me && !me.alive && view.phase === "playing" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60">
            <p className="text-xl font-bold text-accent">💥 Your ship was destroyed!</p>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-500">A/D or ←/→ to move · space or click/hold to fire</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {[...view.ships]
          .sort((a, b) => b.score - a.score)
          .map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(s.id) }} />
              <span>{nameFor(s.id)}</span>
              <span className="ml-auto text-xs text-slate-400">
                {s.score} pts · {"❤️".repeat(Math.max(0, s.lives))}
                {s.lives === 0 && "💀"}
              </span>
            </div>
          ))}
      </div>

      {view.phase === "finished" && <p className="text-center text-sm text-slate-400">Match over — head back to the lobby to play again.</p>}
    </div>
  );
}
