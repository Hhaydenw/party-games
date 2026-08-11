"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useParty } from "@/lib/socketClient";

export default function HomePage() {
  const router = useRouter();
  const { createRoom, connected } = useParty();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a display name first.");
      return;
    }
    setBusy("create");
    setError(null);
    const res = await createRoom(name.trim());
    setBusy(null);
    if (res.ok) {
      router.push(`/room/${res.code}`);
    } else {
      setError(res.error);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError("Enter the 4-letter room code your friend sent you.");
      return;
    }
    router.push(`/room/${trimmed}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="font-display text-5xl font-extrabold tracking-tight">
          🎉 Party <span className="text-accent">Games</span>
        </h1>
        <p className="mt-3 text-slate-400">Cards, boards, and Jackbox-style games with your friends. Create a room, share the link, play.</p>
      </div>

      <div className="card-surface w-full rounded-3xl p-6">
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Display name</label>
        <input
          className="input mb-5"
          placeholder="What should we call you?"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
        />

        <form onSubmit={handleCreate} className="mb-6">
          <button type="submit" className="btn-primary w-full" disabled={!connected || busy === "create"}>
            {busy === "create" ? "Creating…" : "Create a new room"}
          </button>
        </form>

        <div className="mb-5 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
          <div className="h-px flex-1 bg-white/10" />
          or join a friend's room
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            className="input text-center uppercase tracking-[0.3em]"
            placeholder="CODE"
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn-secondary shrink-0">
            Join
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}
        {!connected && <p className="mt-4 text-sm text-slate-500">Connecting…</p>}
      </div>
    </main>
  );
}
