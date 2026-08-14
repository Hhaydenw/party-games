"use client";

import { useEffect, useState } from "react";
import { getSoundSettings, setSoundSettings, subscribeSoundSettings } from "@/lib/sound";

export default function SoundSettingsButton() {
  const [open, setOpen] = useState(false);
  const [settings, setLocal] = useState(() => getSoundSettings());

  useEffect(() => subscribeSoundSettings(() => setLocal(getSoundSettings())), []);
  // Re-sync once mounted client-side (localStorage isn't available during SSR).
  useEffect(() => setLocal(getSoundSettings()), []);

  return (
    <div className="relative">
      <button
        className="btn-secondary px-3 py-1.5 text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Sound settings"
      >
        {settings.muted || settings.volume === 0 ? "🔇" : settings.volume < 0.4 ? "🔉" : "🔊"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="card-surface absolute right-0 z-20 mt-2 w-56 rounded-2xl p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Sound effects</span>
              <button
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${settings.muted ? "bg-accent/20 text-accent" : "bg-white/10 text-slate-300"}`}
                onClick={() => setSoundSettings({ muted: !settings.muted })}
              >
                {settings.muted ? "Muted" : "On"}
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Volume
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.volume * 100)}
                disabled={settings.muted}
                onChange={(e) => setSoundSettings({ volume: Number(e.target.value) / 100 })}
                className="accent-accent"
              />
            </label>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-xs text-slate-400">🎵 Lobby music</span>
              <button
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${settings.ambientOn ? "bg-accent/20 text-accent" : "bg-white/10 text-slate-300"}`}
                onClick={() => setSoundSettings({ ambientOn: !settings.ambientOn })}
              >
                {settings.ambientOn ? "On" : "Off"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
