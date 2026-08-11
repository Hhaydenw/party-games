"use client";

import { useState } from "react";

export default function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable (e.g. non-HTTPS); user can select the text manually.
    }
  }

  return (
    <div className="card-surface rounded-2xl p-4">
      <p className="mb-2 text-sm text-slate-400">Invite friends with this link</p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="input truncate text-sm" onFocus={(e) => e.currentTarget.select()} />
        <button onClick={copy} className="btn-secondary shrink-0">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Or share the room code: <span className="font-semibold tracking-[0.2em] text-gold">{code}</span>
      </p>
    </div>
  );
}
