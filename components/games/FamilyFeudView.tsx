"use client";

import { useState } from "react";
import { FeudAction, FeudView as ViewType } from "@/lib/games/familyFeud";
import { PlayerInfo } from "@/lib/types";

export default function FamilyFeudView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: FeudAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const [draft, setDraft] = useState("");
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const isHost = meId === view.hostId;
  const otherTeamMeta = view.teams.find((t) => t.id !== view.yourTeam)!;

  function submit(e: React.FormEvent, type: FeudAction["type"]) {
    e.preventDefault();
    if (!draft.trim()) return;
    if (type === "faceoffAnswer") onAction({ type: "faceoffAnswer", text: draft.trim() });
    if (type === "guess") onAction({ type: "guess", text: draft.trim() });
    if (type === "steal") onAction({ type: "steal", text: draft.trim() });
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {view.teams.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl px-4 py-2 text-center ${t.id === view.yourTeam ? "bg-accent/15 ring-1 ring-accent/40" : "bg-white/5"}`}
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">{t.name}</p>
            <p className="text-2xl font-extrabold">{t.score}</p>
            <p className="text-[11px] text-slate-500">{t.memberIds.map(nameFor).join(", ")}</p>
          </div>
        ))}
      </div>

      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <h2 className="mt-1 text-xl font-bold">{view.prompt}</h2>
      </div>

      <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-1.5">
        {view.answers.map((a) => (
          <div
            key={a.index}
            className={`flex items-center justify-between rounded-lg border px-4 py-2 ${a.revealed ? "border-gold/50 bg-gold/10" : "border-white/10 bg-white/[0.03]"}`}
          >
            <span className="font-medium">{a.revealed ? a.text : `${a.index + 1}.`}</span>
            {a.revealed && <span className="font-bold text-gold">{a.points}</span>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-6 text-sm">
        <span>Strikes: {"✗".repeat(view.strikes)}{"·".repeat(3 - view.strikes)}</span>
        <span>Pot: <span className="font-bold text-gold">{view.pot}</span></span>
      </div>

      {view.phase === "faceoff" && (
        <div className="flex flex-col items-center gap-3">
          {view.areYouCaptain ? (
            view.yourFaceoffSubmitted ? (
              <p className="text-slate-400">Answer locked in — waiting on the other captain…</p>
            ) : (
              <form onSubmit={(e) => submit(e, "faceoffAnswer")} className="flex w-full max-w-md gap-2">
                <input autoFocus className="input" placeholder="Your face-off answer…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn-primary shrink-0">Answer</button>
              </form>
            )
          ) : (
            <p className="text-slate-400">
              {nameFor(view.captainA)} vs {nameFor(view.captainB)} are facing off…
            </p>
          )}
        </div>
      )}

      {view.phase === "controlling" && (
        <div className="flex flex-col items-center gap-3">
          {view.controllingTeam === view.yourTeam ? (
            <form onSubmit={(e) => submit(e, "guess")} className="flex w-full max-w-md gap-2">
              <input autoFocus className="input" placeholder="Guess an answer…" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn-primary shrink-0">Guess</button>
            </form>
          ) : (
            <p className="text-slate-400">{otherTeamMeta.name} is guessing…</p>
          )}
        </div>
      )}

      {view.phase === "stealing" && (
        <div className="flex flex-col items-center gap-3">
          {view.stealingTeam === view.yourTeam ? (
            <>
              <p className="font-semibold text-accent">Steal attempt! One guess for your whole team.</p>
              <form onSubmit={(e) => submit(e, "steal")} className="flex w-full max-w-md gap-2">
                <input autoFocus className="input" placeholder="Your team's steal guess…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn-primary shrink-0">Steal</button>
              </form>
            </>
          ) : (
            <p className="text-slate-400">{otherTeamMeta.name} is attempting to steal…</p>
          )}
        </div>
      )}

      {(view.phase === "roundEnd" || view.phase === "finished") && view.lastRoundResult && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-center font-semibold">{view.lastRoundResult.reason}</p>
          {view.phase === "roundEnd" && isHost && (
            <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
              {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next round"}
            </button>
          )}
          {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}
        </div>
      )}

      <div className="rounded-xl bg-black/20 p-3 text-xs text-slate-400">
        {view.roundLog.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
