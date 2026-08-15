"use client";

import { useState } from "react";
import { PlayerInfo } from "@/lib/types";
import Avatar from "@/components/Avatar";

export default function PlayerList({
  players,
  meId,
  onKick,
}: {
  players: PlayerInfo[];
  meId: string;
  // Only passed by the lobby (host view) — kicking only makes sense, and is
  // only allowed server-side, before a game/series has started.
  onKick?: (playerId: string) => void;
}) {
  // Kicking has no undo, so a single stray click shouldn't be able to do
  // it — same two-click-to-confirm pattern used for Street Snap's "Skip
  // round" button. First click on the ✕ arms it and swaps to a check icon;
  // a second click within a few seconds actually kicks, and it
  // auto-disarms if nothing follows.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-2">
      {players.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
          <span className="relative shrink-0">
            <Avatar name={p.name} color={p.color} />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-ink ${p.connected ? "bg-emerald-400" : "bg-slate-600"}`}
            />
          </span>
          <span className="truncate font-medium">
            {p.name}
            {p.id === meId && <span className="text-slate-500"> (you)</span>}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {p.isHost && <span className="text-xs text-gold">👑 host</span>}
            {p.isSpectator && <span className="text-xs text-slate-500">👀 spectating</span>}
            {p.score > 0 && (
              <span className="text-xs text-slate-400">
                🏆 {p.score} win{p.score === 1 ? "" : "s"}
              </span>
            )}
            {onKick && !p.isHost && (
              <button
                className={`rounded-md px-1.5 py-0.5 text-xs transition ${
                  confirmingId === p.id ? "bg-accent/30 text-accent" : "text-slate-500 hover:bg-accent/20 hover:text-accent"
                }`}
                title={confirmingId === p.id ? `Click again to remove ${p.name}` : `Remove ${p.name} from the room`}
                onClick={() => {
                  if (confirmingId !== p.id) {
                    setConfirmingId(p.id);
                    setTimeout(() => setConfirmingId((cur) => (cur === p.id ? null : cur)), 3000);
                    return;
                  }
                  setConfirmingId(null);
                  onKick(p.id);
                }}
              >
                {confirmingId === p.id ? "✓ Confirm?" : "✕"}
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
