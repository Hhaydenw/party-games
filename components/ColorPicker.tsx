"use client";

import { AVATAR_COLORS } from "@/lib/avatarColors";

export default function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium text-slate-300">Avatar color</label>
      <div className="flex flex-wrap gap-2">
        {AVATAR_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Choose color ${c}`}
            onClick={() => onChange(c)}
            className={`h-8 w-8 rounded-full transition ${value === c ? "ring-2 ring-white ring-offset-2 ring-offset-ink" : "opacity-70 hover:opacity-100"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
