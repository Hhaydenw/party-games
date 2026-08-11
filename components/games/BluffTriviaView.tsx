"use client";

import { useEffect, useState } from "react";
import { BluffTriviaAction, BluffTriviaView as ViewType } from "@/lib/games/bluffTrivia";
import { PlayerInfo } from "@/lib/types";

export default function BluffTriviaView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: BluffTriviaAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const [draft, setDraft] = useState("");
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const isHost = meId === view.hostId;

  // Clear the input whenever a new round starts, in case the player never
  // submitted (e.g. the host force-advanced) and stale text got left behind.
  useEffect(() => {
    setDraft("");
  }, [view.roundIndex]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onAction({ type: "submit", text: draft.trim() });
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <h2 className="mt-2 text-xl font-bold">{view.prompt}</h2>
      </div>

      {view.phase === "answering" && (
        <div className="flex flex-col items-center gap-4">
          {!view.yourSubmission ? (
            <form onSubmit={submit} className="flex w-full max-w-md gap-2">
              <input
                autoFocus
                className="input"
                placeholder="Write a convincing fake answer…"
                value={draft}
                maxLength={140}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn-primary shrink-0">Submit</button>
            </form>
          ) : (
            <p className="text-slate-400">
              You wrote: <span className="text-slate-200">"{view.yourSubmission}"</span>
            </p>
          )}
          <p className="text-sm text-slate-500">
            {view.submittedCount}/{view.totalPlayers} answers in
          </p>
          {isHost && (
            <button className="btn-secondary text-sm" onClick={() => onAction({ type: "advance" })}>
              Force move to voting
            </button>
          )}
        </div>
      )}

      {view.phase === "voting" && view.options && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-slate-400">Which one is the real answer?</p>
          <div className="flex w-full max-w-md flex-col gap-2">
            {view.options.map((opt) => (
              <button
                key={opt.id}
                disabled={!!view.yourVote}
                onClick={() => onAction({ type: "vote", optionId: opt.id })}
                className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-default ${
                  view.yourVote === opt.id ? "border-accent bg-accent/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                {opt.text}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            {view.votedCount}/{view.totalPlayers} votes in
          </p>
          {isHost && (
            <button className="btn-secondary text-sm" onClick={() => onAction({ type: "advance" })}>
              Force reveal
            </button>
          )}
        </div>
      )}

      {(view.phase === "reveal" || view.phase === "finished") && view.revealedOptions && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full max-w-lg flex-col gap-2">
            {view.revealedOptions.map((opt) => {
              const voterNames = (view.voters?.[opt.id] ?? []).map(nameFor);
              return (
                <div
                  key={opt.id}
                  className={`rounded-xl border px-4 py-3 ${opt.isTruth ? "border-emerald-400 bg-emerald-400/10" : "border-white/10 bg-white/[0.03]"}`}
                >
                  <p className="font-medium">
                    {opt.text} {opt.isTruth && <span className="text-emerald-400">✓ truth</span>}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {opt.authorId && <>by {nameFor(opt.authorId)} · </>}
                    {voterNames.length ? `voted by ${voterNames.join(", ")}` : "no votes"}
                  </p>
                </div>
              );
            })}
          </div>

          {view.lastRoundScoring.length > 0 && (
            <div className="text-sm text-slate-400">
              {view.lastRoundScoring.map((d, i) => (
                <p key={i}>
                  {nameFor(d.playerId)} +{d.delta} — {d.reason}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 text-sm">
            {[...view.scores]
              .sort((a, b) => b.score - a.score)
              .map((s) => (
                <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
                  {nameFor(s.playerId)}: {s.score}
                </span>
              ))}
          </div>

          {isHost && view.phase === "reveal" && (
            <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
              {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next round"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
