// Real, self-hosted speech-to-text — no paid API, no API key. Runs an
// open-source Whisper model (Xenova/whisper-tiny.en, via transformers.js) in
// this Node process, giving word-level timestamps for what's actually sung
// in a clip. `ffmpeg-static` decodes the remote mp3 preview to raw PCM
// without writing temp files. The model downloads once (~40MB) on first use
// and is cached by transformers.js for the life of the server process.

import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { pipeline } from "@huggingface/transformers";

export interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// Decodes a remote audio URL straight to 16kHz mono PCM (what Whisper
// expects) by piping ffmpeg's stdout, without touching disk.
function decodeToFloat32(url: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static binary not available"));
      return;
    }
    const args = ["-i", url, "-f", "s16le", "-ac", "1", "-ar", "16000", "-loglevel", "error", "-"];
    const proc = spawn(ffmpegPath as unknown as string, args);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) {
        reject(new Error(`ffmpeg produced no audio (exit ${code})`));
        return;
      }
      const sampleCount = Math.floor(buf.length / 2);
      const floats = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) floats[i] = buf.readInt16LE(i * 2) / 32768;
      resolve(floats);
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asrPromise: Promise<any> | null = null;
function getAsr() {
  if (!asrPromise) {
    asrPromise = pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en");
  }
  return asrPromise;
}

// Transcribes a clip and returns word-level timestamps, or null if anything
// in the pipeline fails or times out — callers should always have a
// non-transcription fallback, since this depends on a model download and
// real (if modest) CPU work per call.
export async function transcribeClip(url: string, timeoutMs = 25_000): Promise<TranscriptWord[] | null> {
  try {
    const audio = await withTimeout(decodeToFloat32(url), timeoutMs, "audio decode");
    const asr = await withTimeout(getAsr(), timeoutMs, "model load");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await withTimeout(
      asr(audio, { return_timestamps: "word", chunk_length_s: 30 }),
      timeoutMs,
      "transcription"
    );
    const chunks: unknown[] = Array.isArray(result?.chunks) ? result.chunks : [];
    const words: TranscriptWord[] = [];
    for (const c of chunks) {
      const chunk = c as { text?: string; timestamp?: [number | null, number | null] };
      const text = chunk.text?.trim();
      const start = chunk.timestamp?.[0];
      if (!text || start == null) continue;
      const end = chunk.timestamp?.[1] ?? start;
      words.push({ word: text, start, end });
    }
    return words.length > 0 ? words : null;
  } catch {
    return null;
  }
}
