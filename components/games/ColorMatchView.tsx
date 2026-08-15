"use client";

import { useEffect, useRef, useState } from "react";
import { ColorMatchAction, ColorMatchView as ViewType, RGB } from "@/lib/games/colorMatch";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";
import { serverNow } from "@/lib/serverClock";

interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

function rgbCss({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

// h in degrees (0-360), s/l as percentages (0-100) — matches the sliders'
// own units directly, so no conversion is needed at the call sites.
function hslToRgb({ h, s, l }: HSL): RGB {
  const sf = s / 100;
  const lf = l / 100;
  const c = (1 - Math.abs(2 * lf - 1)) * sf;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lf - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// A dialed.gg/Photoshop-style picker: Hue/Saturation/Lightness instead of
// raw R/G/B. HSL maps far more directly onto how people actually perceive
// color — "which color family, how vivid, how light" — than three
// interacting 0-255 channels where reaching a target hue means guessing at
// combinations. Each slider's track gradient reflects exactly what
// dragging it does: Hue always shows the full vivid rainbow (the reference
// point for picking a color family); Saturation sweeps from grey to fully
// vivid *at the current hue and lightness*; Lightness sweeps from black
// through the current hue/saturation up to white.
//
// A real top-level component, not one declared inside ColorMatchView's
// render body — that was the actual bug behind the sliders being
// undraggable. A function declared inside another component's render is a
// *new* component type on every render; React matches elements by type at
// each position, so a new type forces an unmount-and-remount of that
// subtree, DOM nodes included. Combined with the round countdown
// re-rendering the whole view every 200ms during "guessing", the range
// inputs were being torn down and rebuilt from scratch roughly 5 times a
// second — destroying any in-progress native drag almost as soon as it
// started. Neither of the two earlier CSS-focused fix attempts could ever
// have addressed this, since it was never a styling problem.
function HslSlider({
  label,
  min,
  max,
  value,
  gradient,
  disabled,
  displayValue,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  gradient: string;
  disabled: boolean;
  displayValue: string;
  onChange: (v: number) => void;
}) {
  return (
    // A plain div, not a <label> — wrapping a range input in a <label>
    // (its only purpose here was letting a tap anywhere in the row focus
    // the input) can interact awkwardly with touch gesture handling on
    // some mobile browsers, which lines up with this control's reported
    // "sometimes works, sometimes doesn't" drag behavior. Removing it
    // (combined with the touch-action fix below) leaves nothing standing
    // between a touch and the input itself.
    <div className="flex items-center gap-3">
      <span className="w-4 text-xs font-black text-slate-300">{label}</span>
      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-3.5 -translate-y-1/2 rounded-full ring-1 ring-inset ring-white/15" style={{ background: gradient }} />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="color-slider relative w-full bg-transparent"
          style={{ accentColor: "#ffffff" }}
        />
      </div>
      <span className="w-10 text-right font-mono text-xs text-slate-400">{displayValue}</span>
    </div>
  );
}

const NEUTRAL: HSL = { h: 0, s: 0, l: 50 };

export default function ColorMatchView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: ColorMatchAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const [draft, setDraft] = useState<HSL>(NEUTRAL);

  // Reset the slider draft to neutral grey at the start of each round,
  // rather than carrying over the previous round's guess.
  useEffect(() => {
    setDraft(NEUTRAL);
  }, [view.roundIndex]);

  const deadline = view.phase === "viewing" ? view.viewEndsAt : view.phase === "guessing" ? view.guessEndsAt : null;
  const remainingMs = useCountdown(deadline, isHost, () => onAction({ type: "timeUp" }));

  // Auto-submit whatever's currently dialed in if the guessing clock runs
  // out before you hit "Lock in guess" — previously there was no fallback
  // at all here, so simply not clicking in time meant no guess got
  // recorded whatsoever (scored 0) even if the sliders were sitting on a
  // perfectly reasonable answer. This is a per-player concern (everyone
  // auto-submits their *own* draft), independent of who's "primary" for
  // firing the shared timeUp action above.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const autoSubmitted = useRef(false);
  useEffect(() => {
    autoSubmitted.current = false;
  }, [view.roundIndex]);
  useEffect(() => {
    if (!view.guessEndsAt) return;
    const msLeft = view.guessEndsAt - serverNow();
    if (msLeft <= 0) return;
    const t = setTimeout(() => {
      if (view.youSubmitted || autoSubmitted.current) return;
      autoSubmitted.current = true;
      onAction({ type: "submitGuess", color: hslToRgb(draftRef.current) });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, msLeft + 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.guessEndsAt]);

  const announcedEnd = useRef(false);
  useEffect(() => {
    if (view.phase === "finished" && !announcedEnd.current) {
      announcedEnd.current = true;
      playSound("win");
    }
  }, [view.phase]);

  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (view.phase === "roundEnd" && prevPhase.current !== "roundEnd") playSound("reveal");
    prevPhase.current = view.phase;
  }, [view.phase]);

  const draftRgb = hslToRgb(draft);

  function submitGuess() {
    playSound("select");
    onAction({ type: "submitGuess", color: draftRgb });
  }

  const hueGradient =
    "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))";
  const satGradient = `linear-gradient(to right, hsl(${draft.h},0%,${draft.l}%), hsl(${draft.h},100%,${draft.l}%))`;
  const lightGradient = `linear-gradient(to right, #000, hsl(${draft.h},${draft.s}%,50%), #fff)`;

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs uppercase tracking-widest text-slate-500">
        Round {view.roundIndex + 1} of {view.totalRounds}
      </p>

      {view.phase === "viewing" && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-semibold text-gold">Study this color!</p>
          <div className="h-52 w-52 rounded-3xl border-4 border-white/10 shadow-2xl sm:h-64 sm:w-64" style={{ backgroundColor: rgbCss(view.target!) }} />
          {remainingMs !== null && <p className="text-2xl font-bold text-gold tabular-nums">{Math.ceil(remainingMs / 1000)}s</p>}
        </div>
      )}

      {view.phase === "guessing" && (
        <div className="flex flex-col items-center gap-5">
          <p className="text-sm text-slate-400">Dial in the color from memory…</p>
          {remainingMs !== null && <p className="text-xl font-bold text-gold tabular-nums">{Math.ceil(remainingMs / 1000)}s</p>}
          <div className="h-40 w-40 rounded-3xl border-4 border-white/10 shadow-xl" style={{ backgroundColor: rgbCss(draftRgb) }} />
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white/5 p-4">
            <HslSlider
              label="H"
              min={0}
              max={360}
              value={draft.h}
              gradient={hueGradient}
              disabled={view.youSubmitted}
              displayValue={`${Math.round(draft.h)}°`}
              onChange={(h) => setDraft((d) => ({ ...d, h }))}
            />
            <HslSlider
              label="S"
              min={0}
              max={100}
              value={draft.s}
              gradient={satGradient}
              disabled={view.youSubmitted}
              displayValue={`${Math.round(draft.s)}%`}
              onChange={(s) => setDraft((d) => ({ ...d, s }))}
            />
            <HslSlider
              label="L"
              min={0}
              max={100}
              value={draft.l}
              gradient={lightGradient}
              disabled={view.youSubmitted}
              displayValue={`${Math.round(draft.l)}%`}
              onChange={(l) => setDraft((d) => ({ ...d, l }))}
            />
          </div>
          {view.youSubmitted ? (
            <p className="text-sm text-emerald-400">Guess locked in! Waiting on {view.totalPlayers - view.submittedCount} more…</p>
          ) : (
            <button className="btn-primary" onClick={submitGuess}>
              Lock in guess
            </button>
          )}
        </div>
      )}

      {(view.phase === "roundEnd" || view.phase === "finished") && view.target && view.results && (
        <div className="flex w-full max-w-2xl flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Actual</p>
              <div className="h-20 w-20 rounded-2xl border-2 border-white/20" style={{ backgroundColor: rgbCss(view.target) }} />
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2">
            {view.results.map((r) => (
              <div key={r.playerId} className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
                <div
                  className="h-10 w-10 shrink-0 rounded-lg border border-white/20"
                  style={{ backgroundColor: r.color ? rgbCss(r.color) : "transparent" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nameFor(r.playerId)}</p>
                  <p className="text-xs text-slate-400">{r.color ? `rgb(${r.color.r}, ${r.color.g}, ${r.color.b})` : "No guess"}</p>
                </div>
                <span className={`shrink-0 font-mono text-lg font-black ${r.score !== null && r.score >= 8 ? "text-emerald-400" : r.score !== null && r.score >= 4 ? "text-gold" : "text-accent"}`}>
                  {r.score !== null ? r.score.toFixed(1) : "0.0"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 text-sm">
        {[...view.scores]
          .sort((a, b) => b.score - a.score)
          .map((s) => (
            <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
              {nameFor(s.playerId)}: {s.score.toFixed(1)}
              {s.roundGain > 0 && <span className="ml-1 text-emerald-400">+{s.roundGain.toFixed(1)}</span>}
            </span>
          ))}
      </div>

      {view.phase === "roundEnd" && isHost && (
        <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
          {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next color"}
        </button>
      )}
      {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}

      {view.log.length > 0 && (
        <div className="w-full max-w-xl rounded-xl bg-black/20 p-3 text-xs text-slate-400">
          {[...view.log].reverse().slice(0, 4).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
