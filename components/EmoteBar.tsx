"use client";

import { useEffect, useRef, useState } from "react";
import { useParty } from "@/lib/socketClient";
import { EMOTE_OPTIONS } from "@/lib/emojiReactions";

interface FloatingEmote {
  id: string;
  emoji: string;
  name: string;
  left: number; // vw, randomized per burst
}

// A small reaction picker plus the floating, rising-and-fading overlay that
// renders every "room:emote" this client receives — the same idea as
// Google Meet's in-call reactions: quick, ephemeral, everyone sees them
// live, nothing gets stored or logged anywhere.
export default function EmoteBar() {
  const { emotes, sendEmote } = useParty();
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState<FloatingEmote[]>([]);
  // `emotes` lives in the shared socket context and keeps its last ~20
  // entries across screen transitions (lobby -> game -> finished -> lobby),
  // but each of those screens mounts its own fresh EmoteBar instance. Seed
  // `seenIds` with whatever's already in the list right away (a lazy
  // initializer, so it runs before the first paint) rather than starting it
  // empty — otherwise every emote sent during the *previous* screen looks
  // "new" the moment this instance mounts and they all float up at once.
  const seenIds = useRef(new Set<string>(emotes.map((e) => e.id)));

  useEffect(() => {
    const fresh = emotes.filter((e) => !seenIds.current.has(e.id));
    if (fresh.length === 0) return;
    for (const e of fresh) seenIds.current.add(e.id);
    const withPositions = fresh.map((e) => ({ id: e.id, emoji: e.emoji, name: e.name, left: 10 + Math.random() * 80 }));
    setFloating((prev) => [...prev, ...withPositions]);
    for (const e of withPositions) {
      setTimeout(() => setFloating((prev) => prev.filter((f) => f.id !== e.id)), 2600);
    }
  }, [emotes]);

  function react(emoji: string) {
    sendEmote(emoji);
    // Deliberately doesn't close the panel — clicking outside is the only
    // way to dismiss it, so someone can rapid-fire the same (or different)
    // reaction without reopening the picker every time.
  }

  return (
    <>
      <div className="relative">
        <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setOpen((v) => !v)} aria-label="Send a reaction">
          😊
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 grid w-56 grid-cols-6 gap-1 rounded-2xl border border-white/10 bg-ink p-2 shadow-2xl">
              {EMOTE_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:scale-125 hover:bg-white/10"
                  onClick={() => react(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Floating overlay, fixed to the viewport so reactions are visible
          regardless of what's rendered underneath. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-full overflow-hidden">
        {floating.map((f) => (
          <div
            key={f.id}
            className="absolute bottom-0 flex flex-col items-center [animation:emote-rise_2.6s_ease-out_forwards]"
            style={{ left: `${f.left}vw` }}
          >
            <span className="text-4xl drop-shadow-lg">{f.emoji}</span>
            <span className="mt-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">{f.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}
