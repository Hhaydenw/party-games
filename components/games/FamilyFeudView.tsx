"use client";

import { useEffect, useRef, useState } from "react";
import { FeudAction, FeudView as ViewType } from "@/lib/games/familyFeud";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const TEAM_STYLE: Record<string, { bg: string; ring: string; text: string; solid: string }> = {
  A: { bg: "bg-red-500/15", ring: "ring-red-400/50", text: "text-red-400", solid: "bg-red-600" },
  B: { bg: "bg-blue-500/15", ring: "ring-blue-400/50", text: "text-blue-400", solid: "bg-blue-600" },
};

function AnswerTile({ text, points, revealed, index }: { text: string | null; points: number | null; revealed: boolean; index: number }) {
  const wasRevealed = useRef(revealed);
  const [justRevealed, setJustRevealed] = useState(false);

  useEffect(() => {
    if (revealed && !wasRevealed.current) {
      setJustRevealed(true);
      playSound("reveal");
      const t = setTimeout(() => setJustRevealed(false), 500);
      return () => clearTimeout(t);
    }
    wasRevealed.current = revealed;
  }, [revealed]);

  return (
    <div
      className={`flex items-center gap-3 rounded-md border-b-2 px-4 py-2.5 shadow-[0_2px_0_rgba(0,0,0,0.3)] ${
        revealed
          ? "border-yellow-700 bg-gradient-to-b from-yellow-300 to-yellow-500 text-ink"
          : "border-blue-950 bg-gradient-to-b from-blue-800 to-blue-900 text-blue-100"
      } ${justRevealed ? "[animation:feud-pop_0.4s_ease-out]" : ""}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
          revealed ? "bg-ink text-yellow-300" : "bg-blue-950 text-white"
        }`}
      >
        {index + 1}
      </span>
      <span className="flex-1 font-extrabold uppercase tracking-wide">{revealed ? text : ""}</span>
      {revealed && <span className="rounded bg-ink px-2 py-0.5 text-sm font-black text-yellow-300">{points}</span>}
    </div>
  );
}

function Strikes({ count }: { count: number }) {
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) playSound("fail");
    prevCount.current = count;
  }, [count]);
  return (
    <div className="flex gap-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`flex h-9 w-9 items-center justify-center rounded-md border-2 text-xl font-black transition-all ${
            i < count ? "border-red-500 bg-red-600 text-white [animation:feud-pop_0.3s_ease-out]" : "border-white/10 bg-white/5 text-transparent"
          }`}
        >
          ✗
        </span>
      ))}
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
      <div className="flex flex-wrap items-stretch justify-center gap-4">
        {view.teams.map((t) => {
          const style = TEAM_STYLE[t.id]!;
          return (
            <div key={t.id} className={`min-w-[140px] rounded-t-xl px-5 py-3 text-center ring-2 ${style.bg} ${style.ring}`}>
              <p className={`text-xs font-black uppercase tracking-widest ${style.text}`}>{t.name}</p>
              <p className="font-mono text-3xl font-black tabular-nums">{t.score}</p>
              <p className="text-[11px] text-slate-400">{t.memberIds.map(nameFor).join(", ")}</p>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <p className="inline-block rounded-full bg-gold/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-gold">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <h2 className="mt-2 text-xl font-bold">{view.prompt}</h2>
      </div>

      {/* Game-show board */}
      <div
        className="mx-auto w-full max-w-xl rounded-2xl border-4 border-blue-950 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        style={{ background: "linear-gradient(160deg, #1e3a8a 0%, #0f1f4d 60%, #0a1433 100%)" }}
      >
        <div className="grid grid-cols-1 gap-1.5">
          {view.answers.map((a) => (
            <AnswerTile key={a.index} index={a.index} text={a.text} points={a.points} revealed={a.revealed} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Strikes</span>
          <Strikes count={view.strikes} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pot</span>
          <span className="rounded-lg bg-gold/15 px-4 py-1.5 font-mono text-2xl font-black text-gold">{view.pot}</span>
        </div>
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
                <button
                  className="btn-gold animate-pulse text-lg shadow-[0_0_20px_rgba(242,183,5,0.5)]"
                  onClick={() => {
                    playSound("buzzer");
                    onAction({ type: "buzz" });
                  }}
                >
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
