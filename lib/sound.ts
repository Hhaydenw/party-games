"use client";

// A tiny synthesized sound-effects engine: every effect is generated on the
// fly with the Web Audio API (oscillators/noise), so there are no audio
// files to ship, license, or fetch. Settings (muted / volume) persist to
// localStorage and are shared across every game view via a small pub-sub
// store, so any component can call `playSound(...)` or render
// `<SoundSettingsButton />` without prop-drilling.

export type SoundName =
  | "click"
  | "select"
  | "success"
  | "fail"
  | "reveal"
  | "buzzer"
  | "countdown"
  | "win"
  | "cardPlay"
  | "draw"
  | "shoot"
  | "explosion"
  | "hit"
  | "turn";

interface SoundSettings {
  muted: boolean;
  volume: number; // 0..1
}

const STORAGE_KEY = "party-games:sound";
const DEFAULT_SETTINGS: SoundSettings = { muted: false, volume: 0.6 };

let settings: SoundSettings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore malformed storage
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore (private browsing etc.)
  }
}

export function getSoundSettings(): SoundSettings {
  hydrate();
  return settings;
}

export function setSoundSettings(next: Partial<SoundSettings>) {
  hydrate();
  settings = { ...settings, ...next };
  persist();
  listeners.forEach((l) => l());
}

export function subscribeSoundSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(ac: AudioContext, out: GainNode, freq: number, startAt: number, duration: number, opts: { type?: OscillatorType; peak?: number; sweepTo?: number } = {}) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, startAt);
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), startAt + duration);
  const peak = opts.peak ?? 0.3;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(out);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function noiseBurst(ac: AudioContext, out: GainNode, startAt: number, duration: number, opts: { peak?: number; lowpass?: number } = {}) {
  const bufferSize = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  const peak = opts.peak ?? 0.25;
  gain.gain.setValueAtTime(peak, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  let node: AudioNode = src;
  if (opts.lowpass) {
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = opts.lowpass;
    src.connect(filter);
    node = filter;
  }
  node.connect(gain);
  gain.connect(out);
  src.start(startAt);
  src.stop(startAt + duration + 0.02);
}

// Each recipe schedules a handful of tones/noise bursts relative to `t0`.
const RECIPES: Record<SoundName, (ac: AudioContext, out: GainNode, t0: number) => void> = {
  click: (ac, out, t0) => tone(ac, out, 720, t0, 0.05, { type: "square", peak: 0.15 }),
  select: (ac, out, t0) => tone(ac, out, 500, t0, 0.08, { type: "triangle", peak: 0.2, sweepTo: 700 }),
  success: (ac, out, t0) => {
    tone(ac, out, 523, t0, 0.12, { type: "triangle", peak: 0.25 });
    tone(ac, out, 659, t0 + 0.1, 0.12, { type: "triangle", peak: 0.25 });
    tone(ac, out, 784, t0 + 0.2, 0.18, { type: "triangle", peak: 0.28 });
  },
  fail: (ac, out, t0) => {
    tone(ac, out, 300, t0, 0.18, { type: "sawtooth", peak: 0.22, sweepTo: 140 });
  },
  reveal: (ac, out, t0) => {
    tone(ac, out, 440, t0, 0.1, { type: "sine", peak: 0.2, sweepTo: 660 });
    tone(ac, out, 660, t0 + 0.08, 0.16, { type: "sine", peak: 0.25, sweepTo: 880 });
  },
  buzzer: (ac, out, t0) => {
    tone(ac, out, 180, t0, 0.35, { type: "sawtooth", peak: 0.3 });
    tone(ac, out, 185, t0, 0.35, { type: "square", peak: 0.15 });
  },
  countdown: (ac, out, t0) => tone(ac, out, 880, t0, 0.06, { type: "square", peak: 0.18 }),
  win: (ac, out, t0) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, out, f, t0 + i * 0.11, 0.22, { type: "triangle", peak: 0.28 }));
  },
  cardPlay: (ac, out, t0) => noiseBurst(ac, out, t0, 0.08, { peak: 0.2, lowpass: 3500 }),
  draw: (ac, out, t0) => noiseBurst(ac, out, t0, 0.05, { peak: 0.15, lowpass: 5000 }),
  shoot: (ac, out, t0) => {
    tone(ac, out, 900, t0, 0.05, { type: "square", peak: 0.15, sweepTo: 200 });
    noiseBurst(ac, out, t0, 0.04, { peak: 0.12, lowpass: 6000 });
  },
  explosion: (ac, out, t0) => {
    noiseBurst(ac, out, t0, 0.3, { peak: 0.35, lowpass: 1200 });
    tone(ac, out, 120, t0, 0.25, { type: "sawtooth", peak: 0.2, sweepTo: 40 });
  },
  hit: (ac, out, t0) => tone(ac, out, 220, t0, 0.08, { type: "square", peak: 0.2, sweepTo: 80 }),
  turn: (ac, out, t0) => tone(ac, out, 600, t0, 0.09, { type: "sine", peak: 0.18, sweepTo: 750 }),
};

export function playSound(name: SoundName) {
  hydrate();
  if (settings.muted || settings.volume <= 0) return;
  const ac = getCtx();
  if (!ac) return;
  const master = ac.createGain();
  master.gain.value = settings.volume;
  master.connect(ac.destination);
  try {
    RECIPES[name](ac, master, ac.currentTime);
  } catch {
    // audio glitches shouldn't ever break gameplay
  }
}
