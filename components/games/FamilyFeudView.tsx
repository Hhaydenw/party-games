"use client";

import { useEffect, useRef, useState } from "react";
import { FeudAction, FeudView as ViewType } from "@/lib/games/familyFeud";
import { PlayerInfo } from "@/lib/types";

const TEAM_STYLE: Record<string, { bg: string; ring: string; text: string }> = {
  A: { bg: "bg-red-500/15", ring: "ring-red-400/50", text: "text-red-400" },
  B: { bg: "bg-blue-500/15", ring: "ring-blue-400/50", text: "text-blue-400" },
};

function AnswerTile({ text, points, revealed, index }: { text: string | null; points: number | null; revealed: boolean; index: number }) {
  const wasRevealed = useRef(revealed);
  const [justRevealed, setJustRevealed] = useState(false);

  useEffect(() => {
    if (revealed && !wasRevealed.current) {
      setJustRevealed(true);
      const t = setTimeout(() => setJustRevealed(false), 700);
      return () => clearTimeout(t);
    }
    wasRevealed.current = revealed;
  }, [revealed]);

  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-4 py-2 transition-all duration-300 ${
        revealed ? "border-gold/50 bg-gold/10" : "border-white/10 bg-white/[0.03]"
      } ${justRevealed ? "scale-[1.03] shadow-[0_0_0_2px_rgba(242,183,5,0.6)]" : "scale-100"}`}
    >
      <span className="font-medium">{revealed ? text : `${index + 1}.`}</span>
      {revealed && <span className="font-bold text-gold">{points}</span>}
    </div>
  );
}

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
  const myCaptainId = view.yourTeam === "A" ? view.captainA : view.captainB;
  const isMyTeamsCaptain = meId === myCaptainId;

  useEffect(() => setDraft(""), [view.phase, view.faceoffBuzzedTeam]);

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
        {view.teams.map((t) => {
          const style = TEAM_STYLE[t.id]!;
          return (
            <div key={t.id} className={`rounded-xl px-4 py-2 text-center ring-1 ${style.bg} ${style.ring}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>{t.name}</p>
              <p className="text-2xl font-extrabold">{t.score}</p>
              <p className="text-[11px] text-slate-400">{t.memberIds.map(nameFor).join(", ")}</p>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <h2 className="mt-1 text-xl font-bold">{view.prompt}</h2>
      </div>

      <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-1.5">
        {view.answers.map((a) => (
          <AnswerTile key={a.index} index={a.index} text={a.text} points={a.points} revealed={a.revealed} />
        ))}
      </div>

      <div className="flex items-center justify-center gap-6 text-sm">
        <span>
          Strikes: {"✗".repeat(view.strikes)}
          {"·".repeat(3 - view.strikes)}
        </span>
        <span>
          Pot: <span className="font-bold text-gold">{view.pot}</span>
        </span>
      </div>

      {view.phase === "faceoff" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-slate-400">
            {nameFor(view.captainA)} <span className={TEAM_STYLE.A!.text}>(Red)</span> vs {nameFor(view.captainB)}{" "}
            <span className={TEAM_STYLE.B!.text}>(Blue)</span> — first to buzz gets the first guess
          </p>

          {!view.faceoffBuzzedTeam && (
            <>
              {isMyTeamsCaptain && !view.faceoffAttempted.includes(view.yourTeam) ? (
                <button className="btn-gold text-lg" onClick={() => onAction({ type: "buzz" })}>
                  🔔 Buzz in!
                </button>
              ) : (
                <p className="text-slate-400">Waiting for a captain to buzz in…</p>
              )}
            </>
          )}

          {view.faceoffBuzzedTeam && (
            <>
              <p className={`font-semibold ${TEAM_STYLE[view.faceoffBuzzedTeam]!.text}`}>
                {view.teams.find((t) => t.id === view.faceoffBuzzedTeam)!.name} buzzed in — {nameFor(view.faceoffBuzzedTeam === "A" ? view.captainA : view.captainB)} is answering.
              </p>
              {view.faceoffBuzzedTeam === view.yourTeam && isMyTeamsCaptain ? (
                <form onSubmit={(e) => submit(e, "faceoffAnswer")} className="flex w-full max-w-md gap-2">
                  <input autoFocus className="input" placeholder="Your face-off answer…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <button className="btn-primary shrink-0">Answer</button>
                </form>
              ) : (
                <p className="text-slate-400">Waiting for their answer…</p>
              )}
            </>
          )}
        </div>
      )}

      {view.phase === "controlling" && (
        <div className="flex flex-col items-center gap-3">
          {view.controllingTeam === view.yourTeam ? (
            view.currentGuesserId === meId ? (
              <form onSubmit={(e) => submit(e, "guess")} className="flex w-full max-w-md gap-2">
                <input autoFocus className="input" placeholder="Guess an answer…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn-primary shrink-0">Guess</button>
              </form>
            ) : (
              <p className="text-slate-400">{nameFor(view.currentGuesserId ?? "")}'s turn to guess…</p>
            )
          ) : (
            <p className="text-slate-400">{otherTeamMeta.name} is guessing — {nameFor(view.currentGuesserId ?? "")}'s turn…</p>
          )}
        </div>
      )}

      {view.phase === "stealing" && (
        <div className="flex flex-col items-center gap-3">
          {view.stealingTeam === view.yourTeam ? (
            <>
              <p className="font-semibold text-accent">Steal attempt! One guess for your whole team — anyone can answer.</p>
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
