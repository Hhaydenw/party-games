"use client";

import { GameMeta, GameOptions } from "@/lib/types";
import { useParty } from "@/lib/socketClient";

export default function GameOptionsPanel({ meta, options, isHost }: { meta: GameMeta; options: GameOptions; isHost: boolean }) {
  const { setGameOptions } = useParty();
  if (!meta.options || meta.options.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-4 rounded-2xl bg-white/5 p-4">
      {meta.options.map((def) => {
        const value = options[def.key] ?? def.default;
        return (
          <label key={def.key} className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">{def.label}</span>
            {def.type === "number" ? (
              isHost ? (
                <input
                  type="number"
                  className="input w-24 text-center"
                  min={def.min}
                  max={def.max}
                  step={def.step ?? 1}
                  value={value}
                  onChange={(e) => setGameOptions({ [def.key]: Number(e.target.value) })}
                />
              ) : (
                <span className="font-semibold text-slate-200">{value}</span>
              )
            ) : isHost ? (
              <select className="input w-auto" value={value} onChange={(e) => setGameOptions({ [def.key]: e.target.value })}>
                {def.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-semibold text-slate-200">{def.choices.find((c) => c.value === value)?.label ?? value}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
