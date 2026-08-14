"use client";

import { useEffect, useState } from "react";
import { WordGridAction, WordGridView as ViewType } from "@/lib/games/wordGrid";
import { BOARD_SIZE, PremiumType, getPremium } from "@/lib/games/wordGridBoard";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const PREMIUM_LABEL: Record<Exclude<PremiumType, null>, string> = { DL: "DL", TL: "TL", DW: "DW", TW: "TW", ST: "★" };
const PREMIUM_CLASS: Record<Exclude<PremiumType, null>, string> = {
  DL: "bg-sky-500/20 text-sky-300",
  TL: "bg-blue-600/30 text-blue-300",
  DW: "bg-rose-500/20 text-rose-300",
  TW: "bg-red-600/30 text-red-300",
  ST: "bg-gold/25 text-gold",
};

interface Selected {
  tileId: string;
  letter: string;
  isBlank: boolean;
}
interface Staged {
  row: number;
  col: number;
  tileId: string;
  letter: string;
  isBlank: boolean;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function WordGridView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: WordGridAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [pendingBlankTileId, setPendingBlankTileId] = useState<string | null>(null);
  const [mode, setMode] = useState<"place" | "exchange">("place");
  const [exchangeSet, setExchangeSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!view.isYourTurn) {
      setSelected(null);
      setStaged([]);
      setPendingBlankTileId(null);
      setExchangeSet(new Set());
    }
  }, [view.isYourTurn]);

  useEffect(() => {
    if (view.phase === "finished") playSound("win");
  }, [view.phase]);

  const stagedByCell = new Map(staged.map((s) => [`${s.row},${s.col}`, s]));
  const usedTileIds = new Set(staged.map((s) => s.tileId));

  function clickRackTile(tile: ViewType["yourRack"][number]) {
    if (!view.isYourTurn) return;
    if (mode === "exchange") {
      setExchangeSet((prev) => {
        const next = new Set(prev);
        if (next.has(tile.id)) next.delete(tile.id);
        else next.add(tile.id);
        return next;
      });
      return;
    }
    if (usedTileIds.has(tile.id)) return;
    if (tile.isBlank) {
      setPendingBlankTileId(tile.id);
      return;
    }
    playSound("click");
    setSelected({ tileId: tile.id, letter: tile.letter, isBlank: false });
  }

  function chooseBlankLetter(letter: string) {
    if (!pendingBlankTileId) return;
    setSelected({ tileId: pendingBlankTileId, letter, isBlank: true });
    setPendingBlankTileId(null);
  }

  function clickBoardCell(row: number, col: number) {
    if (!view.isYourTurn || mode !== "place") return;
    if (view.board[row]![col]) return;
    const key = `${row},${col}`;
    if (stagedByCell.has(key)) {
      setStaged((s) => s.filter((x) => !(x.row === row && x.col === col)));
      return;
    }
    if (!selected) return;
    playSound("cardPlay");
    setStaged((s) => [...s, { row, col, tileId: selected.tileId, letter: selected.letter, isBlank: selected.isBlank }]);
    setSelected(null);
  }

  function submitPlay() {
    if (staged.length === 0) return;
    onAction({
      type: "place",
      placements: staged.map((s) => ({ row: s.row, col: s.col, tileId: s.tileId, letter: s.isBlank ? s.letter : undefined })),
    });
    setStaged([]);
  }

  function submitExchange() {
    if (exchangeSet.size === 0) return;
    onAction({ type: "exchange", tileIds: [...exchangeSet] });
    setExchangeSet(new Set());
    setMode("place");
  }

  function submitPass() {
    onAction({ type: "pass" });
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
        <span className={view.isYourTurn ? "font-bold text-gold" : "text-slate-400"}>
          {view.isYourTurn ? "Your turn!" : `${nameFor(view.turnPlayerId)}'s turn`}
        </span>
        <span className="text-slate-500">🎒 {view.bagCount} tiles left in bag</span>
      </div>

      <div className="mx-auto grid w-full max-w-[720px] gap-px overflow-hidden rounded-xl bg-white/10 p-1" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}>
        {view.board.map((row, r) =>
          row.map((cell, c) => {
            const premium = getPremium(r, c);
            const key = `${r},${c}`;
            const stagedTile = stagedByCell.get(key);
            const isCenter = premium === "ST";
            return (
              <button
                key={key}
                onClick={() => clickBoardCell(r, c)}
                disabled={!view.isYourTurn || mode !== "place" || Boolean(cell)}
                className={`relative flex aspect-square items-center justify-center text-[10px] font-bold transition sm:text-xs ${
                  cell
                    ? "bg-ink text-slate-100"
                    : stagedTile
                      ? "bg-gold/40 text-ink"
                      : premium
                        ? PREMIUM_CLASS[premium]
                        : "bg-white/[0.04] text-transparent hover:bg-white/10"
                } ${!cell && !stagedTile && mode === "place" && view.isYourTurn && selected ? "cursor-pointer" : ""}`}
              >
                {cell ? cell.letter : stagedTile ? stagedTile.letter : isCenter ? "★" : premium ? PREMIUM_LABEL[premium] : ""}
              </button>
            );
          })
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">Your rack</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {view.yourRack.map((tile) => {
            const isUsed = usedTileIds.has(tile.id);
            const isSelected = selected?.tileId === tile.id;
            const isExchangeSelected = exchangeSet.has(tile.id);
            return (
              <button
                key={tile.id}
                disabled={!view.isYourTurn || isUsed}
                onClick={() => clickRackTile(tile)}
                className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg border font-black transition disabled:opacity-30 ${
                  isSelected || isExchangeSelected ? "border-gold bg-gold/20 text-gold" : "border-white/15 bg-white/[0.06] text-slate-100 enabled:hover:border-white/40"
                }`}
              >
                <span className="text-lg leading-none">{tile.isBlank ? "?" : tile.letter}</span>
                <span className="text-[9px] text-slate-400">{tile.value}</span>
              </button>
            );
          })}
        </div>
      </div>

      {pendingBlankTileId && (
        <div className="card-surface w-full max-w-md rounded-2xl p-4 text-center">
          <p className="mb-2 text-sm text-slate-300">Choose a letter for your blank tile:</p>
          <div className="flex flex-wrap justify-center gap-1">
            {ALPHABET.map((l) => (
              <button key={l} className="h-8 w-8 rounded-md bg-white/10 text-sm font-bold hover:bg-gold/30" onClick={() => chooseBlankLetter(l)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn-secondary mt-3 text-xs" onClick={() => setPendingBlankTileId(null)}>
            Cancel
          </button>
        </div>
      )}

      {view.isYourTurn && view.phase === "playing" && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {mode === "place" ? (
            <>
              <button className="btn-primary" disabled={staged.length === 0} onClick={submitPlay}>
                Play word{staged.length > 1 ? "s" : ""}
              </button>
              <button className="btn-secondary" disabled={staged.length === 0} onClick={() => setStaged([])}>
                Clear
              </button>
              <button className="btn-secondary" onClick={() => setMode("exchange")}>
                🔁 Exchange tiles instead
              </button>
              <button className="btn-secondary" onClick={submitPass}>
                Pass
              </button>
            </>
          ) : (
            <>
              <button className="btn-primary" disabled={exchangeSet.size === 0} onClick={submitExchange}>
                Exchange {exchangeSet.size || ""} selected
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setMode("place");
                  setExchangeSet(new Set());
                }}
              >
                Back to placing
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 text-sm">
        {[...view.scores]
          .sort((a, b) => b.score - a.score)
          .map((s) => (
            <span key={s.playerId} className={`rounded-xl px-3 py-1.5 ${s.playerId === view.turnPlayerId ? "bg-gold/15 text-gold" : "bg-white/5"}`}>
              {nameFor(s.playerId)}: {s.score}
            </span>
          ))}
      </div>

      {view.phase === "finished" && (
        <div className="card-surface w-full max-w-lg rounded-2xl p-4 text-center">
          <p className="mb-2 font-bold text-gold">🏆 Game over!</p>
          {view.finishedByEmptyRack ? (
            <p className="text-sm text-slate-400">
              {nameFor(view.finishedByEmptyRack)} played their last tile — everyone else's leftover letters counted against them.
            </p>
          ) : (
            <p className="text-sm text-slate-400">Everyone passed in a row — leftover rack letters counted against each player.</p>
          )}
          {view.finalRacks && (
            <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500">
              {view.finalRacks.map((r) => (
                <p key={r.playerId}>
                  {nameFor(r.playerId)}: {r.letters.length ? r.letters.join(" ") : "(empty rack)"}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card-surface w-full max-w-2xl rounded-2xl p-3">
        <p className="mb-1.5 text-xs font-semibold text-slate-400">Play log</p>
        <div className="flex max-h-32 flex-col-reverse gap-1 overflow-y-auto text-xs text-slate-400">
          {[...view.log].reverse().map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
