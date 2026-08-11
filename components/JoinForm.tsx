"use client";

import { useState } from "react";
import { useParty } from "@/lib/socketClient";

export default function JoinForm({ code }: { code: string }) {
  const { joinRoom } = useParty();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a display name.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await joinRoom(code, name.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-slate-500">You're joining room</p>
        <h1 className="font-display text-4xl font-extrabold tracking-[0.2em] text-gold">{code}</h1>
      </div>
      <form onSubmit={handleSubmit} className="card-surface w-full rounded-3xl p-6">
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Display name</label>
        <input
          autoFocus
          className="input mb-4"
          placeholder="What should we call you?"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Joining…" : "Join room"}
        </button>
        {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      </form>
    </main>
  );
}
