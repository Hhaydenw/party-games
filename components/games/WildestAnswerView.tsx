"use client";

import { useEffect, useRef, useState } from "react";
import { WildestAnswerAction, WildestAnswerView as ViewType } from "@/lib/games/wildestAnswer";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";

export default function WildestAnswerView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: WildestAnswerAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  const deadline = view.phase === "writing" ? view.writeEndsAt : view.phase === "voting" ? view.voteEndsAt : null;
  const remainingMs = useCountdown(deadline, isHost, () => onAction({ type: "timeUp" }));

  useEffect(() => setDraft({}), [view.roundIndex]);

  const votingGroup = view.groups.find((g) => g.isCurrentVote);
  const votedRef = useRef<string | null>(null);
  useEffect(() => {
    const justVoted = votingGroup?.yourVoteOptionId ?? null;
    if (justVoted && justVoted !== votedRef.current) playSound("select");
    votedRef.current = justVoted ?? null;
  }, [votingGroup?.yourVoteOptionId]);

  const announcedEnd = useRef(false);
  useEffect(() => {
    if (view.phase === "finished" && !announcedEnd.current) {
      announcedEnd.current = true;
      playSound("win");
    }
  }, [view.phase]);

  function submitAnswer(groupId: string) {
    const text = (draft[groupId] ?? "").trim();
    if (!text) return;
    playSound("select");
    onAction({ type: "submitAnswer", groupId, text });
  }

  function vote(groupId: string, optionId: string) {
    playSound("select");
    onAction({ type: "vote", groupId, optionId });
  }

  if (view.phase === "writing") {
    const myGroup = view.groups.find((g) => g.isMine);
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds} · Writing
        </p>
        {remainingMs !== null && <p className="text-sm font-bold text-gold">⏱ {Math.ceil(remainingMs / 1000)}s</p>}
        {myGroup && (
          <div className="w-full max-w-lg rounded-2xl border border-gold/20 bg-gold/5 p-5 text-center">
            <p className="mb-1 text-[11px] uppercase tracking-widest text-slate-500">Your prompt</p>
            <p className="mb-4 text-lg font-bold">{myGroup.prompt}</p>
            {!myGroup.youAnswered ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitAnswer(myGroup.id);
                }}
                className="flex flex-col gap-2"
              >
                <input
                  autoFocus
                  className="input"
                  placeholder="Your funniest answer…"
                  maxLength={140}
                  value={draft[myGroup.id] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [myGroup.id]: e.target.value }))}
                />
                <button className="btn-primary self-center">Submit</button>
              </form>
            ) : (
              <p className="text-sm text-emerald-400">Submitted! Waiting on everyone else…</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-500">
          {view.groups.map((g) => (
            <span key={g.id} className={`rounded-full px-3 py-1 ${g.isMine ? "bg-gold/10 text-gold" : "bg-white/5"}`}>
              {g.memberIds.map(nameFor).join(" & ")}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (view.phase === "voting" && votingGroup) {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds} · Voting on {votingGroup.memberIds.map(nameFor).join(" vs ")}
        </p>
        {remainingMs !== null && <p className="text-sm font-bold text-gold">⏱ {Math.ceil(remainingMs / 1000)}s</p>}
        <p className="text-lg font-bold text-center max-w-lg">{votingGroup.prompt}</p>
        {votingGroup.isMine ? (
          <p className="text-slate-400">This is your prompt — sit tight while everyone votes!</p>
        ) : (
          <div className="flex w-full max-w-lg flex-col gap-3">
            {votingGroup.voteOptions?.map((opt) => (
              <button
                key={opt.optionId}
                disabled={Boolean(votingGroup.yourVoteOptionId)}
                onClick={() => vote(votingGroup.id, opt.optionId)}
                className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-default ${
                  votingGroup.yourVoteOptionId === opt.optionId
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-white/10 bg-white/[0.03] enabled:hover:border-white/30"
                }`}
              >
                {opt.text}
              </button>
            ))}
            {votingGroup.yourVoteOptionId && <p className="text-center text-sm text-slate-400">Vote in! Waiting on everyone else…</p>}
          </div>
        )}
      </div>
    );
  }

  if (view.phase === "roundEnd" || view.phase === "finished") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-lg font-bold">{view.phase === "finished" ? "🏆 Final results!" : `Round ${view.roundIndex + 1} results`}</p>

        <div className="flex w-full max-w-xl flex-col gap-4">
          {view.groups.map((g) => (
            <div key={g.id} className="rounded-2xl bg-white/5 p-4">
              <p className="mb-2 text-sm font-semibold text-gold">{g.prompt}</p>
              <div className="flex flex-col gap-2">
                {g.answers?.map((a) => (
                  <div key={a.playerId} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold text-slate-300">{nameFor(a.playerId)}: </span>
                      {a.text}
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-slate-400">{a.votes} vote{a.votes === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3 text-sm">
          {[...view.scores]
            .sort((a, b) => b.score - a.score)
            .map((s) => (
              <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
                {nameFor(s.playerId)}: {s.score}
                {s.roundGain > 0 && <span className="ml-1 text-emerald-400">+{s.roundGain}</span>}
              </span>
            ))}
        </div>

        {view.phase === "roundEnd" && isHost && (
          <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
            {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next round"}
          </button>
        )}
        {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}
      </div>
    );
  }

  return null;
}
