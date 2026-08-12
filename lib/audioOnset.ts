"use client";

// Real signal-processing onset detection, done entirely client-side with the
// browser's built-in Web Audio API — no paid transcription/alignment service,
// no external dependency. Given a clip URL, this decodes the raw audio and
// finds the first sustained rise in energy after a quiet intro: a solid proxy
// for "this is where the vocals/hook actually start," which is what
// Finish the Lyric needs to know when to cut the clip off. It's a heuristic
// (see caveats below), not word-level lyric alignment — no free API exposes
// that — but it replaces a blind fixed-second guess with an answer grounded
// in the actual audio.

interface OnsetOptions {
  minSeconds?: number; // never cut before this, even if onset detection fires early
  maxSeconds?: number; // never cut later than this, even if nothing triggers
  windowMs?: number; // analysis window size
  sustainWindows?: number; // how many consecutive above-threshold windows count as "real"
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// Returns the detected onset time in seconds, or null if detection wasn't
// possible/confident (caller should fall back to a fixed default).
export async function detectVocalOnsetSeconds(url: string, opts: OnsetOptions = {}): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const minSeconds = opts.minSeconds ?? 2;
  const maxSeconds = opts.maxSeconds ?? 14;
  const windowMs = opts.windowMs ?? 50;
  const sustainWindows = opts.sustainWindows ?? 4; // ~200ms of sustained energy, not a single transient hit

  let ctx: AudioContext | null = null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    ctx = new Ctor();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    const windowSize = Math.max(1, Math.floor((sr * windowMs) / 1000));

    const energies: number[] = [];
    for (let i = 0; i + windowSize <= channel.length; i += windowSize) {
      let sum = 0;
      for (let j = i; j < i + windowSize; j++) sum += channel[j]! * channel[j]!;
      energies.push(Math.sqrt(sum / windowSize));
    }
    if (energies.length === 0) return null;

    // Baseline = the quiet-intro level, sampled from the very start of the
    // clip. A sustained jump well above that is treated as the real onset.
    const introWindows = Math.max(1, Math.floor(1000 / windowMs));
    const baseline = median(energies.slice(0, introWindows));
    const threshold = baseline * 3 + 0.01;

    let onsetIndex = -1;
    let streak = 0;
    for (let i = introWindows; i < energies.length; i++) {
      if (energies[i]! > threshold) {
        streak += 1;
        if (streak >= sustainWindows) {
          onsetIndex = i - streak + 1;
          break;
        }
      } else {
        streak = 0;
      }
    }
    if (onsetIndex < 0) return null;

    const seconds = (onsetIndex * windowMs) / 1000;
    return Math.min(Math.max(seconds, minSeconds), maxSeconds);
  } catch {
    return null;
  } finally {
    ctx?.close().catch(() => {});
  }
}
