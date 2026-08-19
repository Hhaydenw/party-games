"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryDashAction, CategoryDashView as ViewType } from "@/lib/games/categoryDash";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { useCountdown } from "@/lib/useCountdown";

const STATUS_LABEL: Record<string, string> = {
  unique: "✓ unique",
  duplicate: "= duplicate",
  invalidLetter: "✕ wrong letter",
  challenged: "✕ challenged out",
  empty: "— blank",
};
const STATUS_CLASS: Record<string, string> = {
  unique: "text-emerald-400",
  duplicate: "text-amber-400",
  invalidLetter: "text-slate-500",
  challenged: "text-accent",
  empty: "text-slate-600",
};

export default function CategoryDashView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: CategoryDashAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  // The input's displayed value used to be bound straight to the server-
  // echoed `view.yourDrafts`, sending an action on every keystroke — typing
  // faster than the round trip could snap already-typed characters back to
  // a stale echo, dropping letters. Local state is now the source of truth
  // for what's on screen; the server copy is only used to seed it once per
  // round (and as a fallback before you've typed anything locally).
  const [localDrafts, setLocalDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    setLocalDrafts({});
  }, [view.roundIndex]);

  const remainingMs = useCountdown(view.writeEndsAt, isHost, () => onAction({ type: "timeUp" }));

  const announcedEnd = useRef(false);
  useEffect(() => {
    if (view.phase === "finished" && !announcedEnd.current) {
      announcedEnd.current = true;
      playSound("win");
    }
  }, [view.phase]);

  function setDraft(category: string, text: string) {
    setLocalDrafts((prev) => ({ ...prev, [category]: text }));
    onAction({ type: "setAnswer", category, text });
  }

  if (view.phase === "ready") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <div className="card-surface flex flex-col items-center gap-4 rounded-3xl p-8 text-center">
          <p className="text-lg font-bold">Get ready!</p>
          <p className="max-w-sm text-sm text-slate-400">
            The letter and categories won't be revealed until everyone's ready, so nobody gets a head start.
          </p>
          <p className="text-sm text-slate-400">
            {view.readyCount}/{view.totalPlayersForReady} ready
          </p>
          {view.youAreReady ? (
            <p className="text-sm font-semibold text-emerald-400">✓ You're ready — waiting on everyone else…</p>
          ) : (
            <button
              className="btn-gold text-lg"
              onClick={() => {
                playSound("click");
                onAction({ type: "ready" });
              }}
            >
              I'm ready!
            </button>
          )}
          {isHost && view.readyCount < view.totalPlayersForReady && (
            <button className="text-xs text-slate-500 underline hover:text-slate-300" onClick={() => onAction({ type: "timeUp" })}>
              Start now without waiting for everyone
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view.phase === "writing") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <div className="flex items-center gap-4">
          <span className="font-display flex h-16 w-16 items-center justify-center rounded-2xl bg-gold text-4xl font-black text-ink">
            {view.letter}
          </span>
          {remainingMs !== null && <span className="text-2xl font-bold text-gold tabular-nums">⏱ {Math.ceil(remainingMs / 1000)}s</span>}
        </div>
        <p className="text-sm text-slate-400">
          {view.submittedCount}/{view.totalPlayers} players have started writing
        </p>
        <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {view.categories.map((category) => (
            <label key={category} className="flex flex-col gap-1 rounded-2xl bg-white/5 p-3">
              <span className="text-xs font-semibold text-slate-300">{category}</span>
              <input
                className="input"
                placeholder={`${view.letter}...`}
                maxLength={40}
                value={localDrafts[category] ?? view.yourDrafts[category] ?? ""}
                onChange={(e) => setDraft(category, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (view.phase === "reviewing" && view.review) {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-lg font-bold">
          Round {view.roundIndex + 1} · Letter {view.letter} · Review answers
        </p>
        <p className="max-w-md text-center text-xs text-slate-500">
          Duplicates score less, wrong-letter answers score nothing automatically. Think someone's answer is bogus
          (right letter, but doesn't actually fit)? 🚩 Challenge it. Think two different-looking answers are really
          the same thing? 🔁 Mark it a duplicate by hand. Both need more than half the other players to agree, and
          you can click either button again to take back your vote. Alliterative answers (like "Boom Bap" or "Daffy
          Duck") score double — the host can correct that call if it's wrong.
        </p>
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          {view.review.map((cat) => (
            <div key={cat.category} className="rounded-2xl bg-white/5 p-4">
              <p className="mb-2 text-sm font-semibold text-gold">{cat.category}</p>
              <div className="flex flex-col gap-1.5">
                {cat.answers.map((a) => (
                  <div key={a.playerId} className="flex flex-col gap-1 rounded-lg bg-black/20 px-3 py-1.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 line-clamp-2 break-words">
                        <span className="font-semibold text-slate-300">{nameFor(a.playerId)}: </span>
                        {a.text || <span className="text-slate-600">(blank)</span>}
                      </span>
                      <span className={`shrink-0 text-xs ${STATUS_CLASS[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                        {a.hasDoubleLetter && a.status !== "empty" && a.status !== "invalidLetter" ? " ×2" : ""}
                      </span>
                    </div>
                    {a.text && a.status !== "empty" && a.status !== "invalidLetter" && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.playerId !== meId && (
                          <button
                            className={`rounded-md px-1.5 py-0.5 text-xs transition ${
                              a.challengedBy.includes(meId) ? "bg-accent/30 text-accent" : "text-slate-500 hover:bg-accent/20 hover:text-accent"
                            }`}
                            title={
                              a.challengedBy.includes(meId)
                                ? "Click to un-challenge this answer"
                                : "Challenge this answer — doesn't actually fit the category"
                            }
                            onClick={() => onAction({ type: "challenge", category: cat.category, targetPlayerId: a.playerId })}
                          >
                            🚩 {a.status === "challenged" ? "Challenged" : "Challenge"} {a.challengedBy.length > 0 ? `(${a.challengedBy.length})` : ""}
                          </button>
                        )}
                        {a.playerId !== meId && (
                          <button
                            className={`rounded-md px-1.5 py-0.5 text-xs transition ${
                              a.duplicateMarkedBy.includes(meId)
                                ? "bg-amber-500/30 text-amber-400"
                                : "text-slate-500 hover:bg-amber-500/20 hover:text-amber-400"
                            }`}
                            title={
                              a.duplicateMarkedBy.includes(meId)
                                ? "Click to un-mark this as a duplicate"
                                : "Mark as a duplicate of another answer (different wording, same idea)"
                            }
                            onClick={() => onAction({ type: "markDuplicate", category: cat.category, targetPlayerId: a.playerId })}
                          >
                            🔁 Duplicate? {a.duplicateMarkedBy.length > 0 ? `(${a.duplicateMarkedBy.length})` : ""}
                          </button>
                        )}
                        {isHost && (
                          <button
                            className="rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-sky-500/20 hover:text-sky-400"
                            title={a.hasDoubleLetter ? "Turn off the double-letter bonus for this answer" : "Give this answer the double-letter bonus"}
                            onClick={() =>
                              onAction({ type: "setDoubleLetter", category: cat.category, targetPlayerId: a.playerId, value: !a.hasDoubleLetter })
                            }
                          >
                            🔤 {a.hasDoubleLetter ? "Remove ×2" : "Mark ×2"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {isHost ? (
          <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
            Continue to favorite vote →
          </button>
        ) : (
          <p className="text-sm text-slate-400">Waiting for the host to continue…</p>
        )}
      </div>
    );
  }

  if (view.phase === "voting" && view.review) {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-lg font-bold">Round {view.roundIndex + 1} · Vote for your favorite answer</p>
        <p className="max-w-md text-center text-xs text-slate-500">
          Pick the single answer (from anyone but yourself) that impressed you most this round — whoever gets the
          most votes earns their team (or themselves) a bonus point.
        </p>
        <p className="text-sm text-slate-400">
          {view.votedCount}/{view.totalPlayers} players have voted
        </p>
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          {view.review.map((cat) => (
            <div key={cat.category} className="rounded-2xl bg-white/5 p-4">
              <p className="mb-2 text-sm font-semibold text-gold">{cat.category}</p>
              <div className="flex flex-col gap-1.5">
                {cat.answers
                  .filter((a) => a.status === "unique" || a.status === "duplicate")
                  .map((a) => {
                    const isMyVote = view.yourVote?.category === cat.category && view.yourVote?.targetPlayerId === a.playerId;
                    return (
                      <div key={a.playerId} className="flex flex-col gap-1 rounded-lg bg-black/20 px-3 py-1.5 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 line-clamp-2 break-words">
                            <span className="font-semibold text-slate-300">{nameFor(a.playerId)}: </span>
                            {a.text}
                          </span>
                          {a.playerId !== meId && (
                            <button
                              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                                isMyVote ? "bg-gold/20 text-gold" : "text-slate-500 hover:bg-gold/20 hover:text-gold"
                              }`}
                              title="Vote this your favorite answer"
                              onClick={() => {
                                playSound("select");
                                onAction({ type: "voteFavorite", category: cat.category, targetPlayerId: a.playerId });
                              }}
                            >
                              {isMyVote ? "★ Your pick" : "☆ Vote"}
                            </button>
                          )}
                        </div>
                        {/* Live vote attribution — who's picked this answer so far. */}
                        {a.votedBy.length > 0 && (
                          <p className="truncate text-xs text-slate-500">
                            ❤️ {a.votedBy.map(nameFor).join(", ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
        {isHost && (
          <button className="btn-secondary text-xs" onClick={() => onAction({ type: "advance" })}>
            Skip ahead (tally votes now)
          </button>
        )}
      </div>
    );
  }

  if (view.phase === "roundEnd" || view.phase === "finished") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-lg font-bold">{view.phase === "finished" ? "🏆 Final results!" : `Round ${view.roundIndex + 1} results`}</p>
        {view.phase === "roundEnd" && view.lastRoundMvpIds.length > 0 && (
          <p className="text-center text-sm font-semibold text-gold">
            ⭐ {view.lastRoundMvpIds.map(nameFor).join(" & ")} had the crowd's favorite answer — +1 bonus point!
          </p>
        )}
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
