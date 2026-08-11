"use client";

import { useState } from "react";
import { useParty } from "@/lib/socketClient";

export default function ChatBox({ meId }: { meId: string }) {
  const { chatMessages, sendChat } = useParty();
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    sendChat(text.trim());
    setText("");
  }

  return (
    <div className="card-surface flex flex-1 flex-col rounded-3xl p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">Chat</h3>
      <div className="mb-2 flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
        {chatMessages.length === 0 && <p className="text-slate-500">No messages yet.</p>}
        {chatMessages.map((m, i) => (
          <p key={i} className={m.playerId === meId ? "text-slate-200" : "text-slate-400"}>
            <span className="font-semibold text-slate-300">{m.name}: </span>
            {m.text}
          </p>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="input text-sm"
          placeholder="Say something…"
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-secondary shrink-0 px-3 text-sm">Send</button>
      </form>
    </div>
  );
}
