"use client";

import { useEffect, useRef } from "react";
import { TanksAction, TanksView as ViewType } from "@/lib/games/tanks";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const TEAM_COLOR: Record<string, string> = { red: "#ef4444", blue: "#3b82f6" };
const SOLO_COLORS = ["#e94560", "#f2b705", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#14b8a6", "#ec4899"];

export default function TanksView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: TanksAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputState = useRef({ up: false, down: false, left: false, right: false });
  const angleRef = useRef(0);
  const shootInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSent = useRef("");

  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const colorFor = (p: ViewType["players"][number]) =>
    view.mode === "teams" ? TEAM_COLOR[p.team] ?? "#888" : SOLO_COLORS[view.players.findIndex((x) => x.id === p.id) % SOLO_COLORS.length]!;

  // Keyboard capture (WASD).
  useEffect(() => {
    function down(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "w") inputState.current.up = true;
      else if (k === "s") inputState.current.down = true;
      else if (k === "a") inputState.current.left = true;
      else if (k === "d") inputState.current.right = true;
    }
    function up(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "w") inputState.current.up = false;
      else if (k === "s") inputState.current.down = false;
      else if (k === "a") inputState.current.left = false;
      else if (k === "d") inputState.current.right = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Stream the current input state to the server at a steady rate.
  useEffect(() => {
    const interval = setInterval(() => {
      const s = inputState.current;
      const payload = `${s.up}${s.down}${s.left}${s.right}${angleRef.current.toFixed(2)}`;
      if (payload !== lastSent.current) {
        lastSent.current = payload;
        onAction({ type: "input", up: s.up, down: s.down, left: s.left, right: s.right, angle: angleRef.current });
      }
    }, 60);
    return () => clearInterval(interval);
  }, [onAction]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * view.arena.width;
    const my = ((e.clientY - rect.top) / rect.height) * view.arena.height;
    const me = view.players.find((p) => p.id === meId);
    if (me) angleRef.current = Math.atan2(my - me.y, mx - me.x);
  }

  function startShooting() {
    playSound("shoot");
    onAction({ type: "shoot" });
    if (shootInterval.current) return;
    shootInterval.current = setInterval(() => {
      playSound("shoot");
      onAction({ type: "shoot" });
    }, 120);
  }
  function stopShooting() {
    if (shootInterval.current) {
      clearInterval(shootInterval.current);
      shootInterval.current = null;
    }
  }
  useEffect(() => stopShooting, []);

  // Redraw whenever a new tick arrives from the server.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const sx = canvas.width / view.arena.width;
    const sy = canvas.height / view.arena.height;

    ctx.fillStyle = "#0f1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const b of view.bullets) {
      ctx.beginPath();
      ctx.fillStyle = view.mode === "teams" ? TEAM_COLOR[b.team] ?? "#fff" : "#fff";
      ctx.arc(b.x * sx, b.y * sy, Math.max(3, view.bulletRadius * sx), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of view.players) {
      if (!p.alive) continue;
      const color = colorFor(p);
      ctx.save();
      ctx.translate(p.x * sx, p.y * sy);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(0, 0, view.tankRadius * sx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(p.angle) * view.tankRadius * sx * 1.7, Math.sin(p.angle) * view.tankRadius * sy * 1.7);
      ctx.stroke();
      ctx.restore();

      const barW = view.tankRadius * 2 * sx;
      const barX = p.x * sx - barW / 2;
      const barY = p.y * sy - view.tankRadius * sy - 12;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(barX, barY, barW, 4);
      ctx.fillStyle = p.health > 50 ? "#22c55e" : p.health > 20 ? "#f2b705" : "#ef4444";
      ctx.fillRect(barX, barY, barW * (p.health / 100), 4);

      ctx.fillStyle = "#fff";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(nameFor(p.id), p.x * sx, barY - 4);
    }
  }, [view, meId]);

  const me = view.players.find((p) => p.id === meId);
  const remainingSec = Math.max(0, Math.ceil((view.matchEndsAt - Date.now()) / 1000));

  // React to my own tank's health/aliveness/kills changing between ticks —
  // that's the signal for "I got hit", "I died", or "I got a kill".
  const prevMe = useRef(me);
  useEffect(() => {
    if (me && prevMe.current) {
      if (me.health < prevMe.current.health) playSound("hit");
      if (prevMe.current.alive && !me.alive) playSound("explosion");
      if (me.kills > prevMe.current.kills) playSound("success");
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          ⏱ {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
        </p>
        {view.phase === "finished" && <p className="font-bold text-gold">🏆 Match over!</p>}
      </div>

      <div className="relative mx-auto w-full max-w-5xl">
        <canvas
          ref={canvasRef}
          width={1000}
          height={600}
          className="w-full select-none rounded-2xl border border-white/10"
          style={{ aspectRatio: "1000 / 600", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseDown={startShooting}
          onMouseUp={stopShooting}
          onMouseLeave={stopShooting}
        />
        {me && !me.alive && view.phase === "playing" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60">
            <p className="text-xl font-bold text-accent">💥 You died! Respawning…</p>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-500">WASD to move · aim with the mouse · click to shoot</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {[...view.players]
          .sort((a, b) => b.kills - a.kills)
          .map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(p) }} />
              <span>{nameFor(p.id)}</span>
              <span className="ml-auto text-xs text-slate-400">
                {p.kills} kills · {p.deaths} deaths
              </span>
            </div>
          ))}
      </div>

      {view.phase === "finished" && <p className="text-center text-sm text-slate-400">Match over — head back to the lobby to play again.</p>}
    </div>
  );
}
