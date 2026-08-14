"use client";

import { useEffect, useRef, useState } from "react";
import { WordGridAction, WordGridView as ViewType } from "@/lib/games/wordGrid";
import { BOARD_SIZE, PremiumType, getPremium } from "@/lib/games/wordGridBoard";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { useParty } from "@/lib/socketClient";

const PREMIUM_LABEL: Record<Exclude<PremiumType, null>, string> = { DL: "DL", TL: "TL", DW: "DW", TW: "TW", ST: "★" };
const PREMIUM_CLASS: Record<Exclude<PremiumType, null>, string> = {
  DL: "bg-sky-600/40 text-sky-100",
  TL: "bg-blue-800/50 text-blue-100",
  DW: "bg-rose-700/40 text-rose-100",
  TW: "bg-red-800/50 text-red-100",
  ST: "bg-gold/40 text-ink",
};

interface Staged {
  row: number;
  col: number;
  tileId: string;
  letter: string;
  isBlank: boolean;
  value: number;
}
type BoardTile = ViewType["board"][number][number];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Scans horizontal/vertical runs of 2+ letters through a given board cell —
// used by the "click a played word" definition lookup, since the board
// only stores individual letters, not word boundaries.
function wordsThroughCell(board: (BoardTile | null)[][], row: number, col: number): string[] {
  const words: string[] = [];
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
  ] as const) {
    let r = row;
    let c = col;
    while (board[r - dr]?.[c - dc]) {
      r -= dr;
      c -= dc;
    }
    let word = "";
    let rr = r;
    let cc = c;
    while (board[rr]?.[cc]) {
      word += board[rr]![cc]!.letter;
      rr += dr;
      cc += dc;
    }
    if (word.length >= 2) words.push(word);
  }
  return words;
}

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
  const { tilePreviews, sendTilePreview } = useParty();
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const colorFor = (id: string) => players.find((p) => p.id === id)?.color ?? "#8a6d3b";

  // `selected` is the click-to-place flow's "armed" tile; drag-and-drop
  // skips it entirely and stages directly on drop. Both funnel into the
  // same `stageTile` so sound/preview-broadcast behavior stays identical
  // regardless of which input method was used.
  const [selected, setSelected] = useState<{ tileId: string; letter: string; isBlank: boolean; value: number } | null>(null);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [pendingBlank, setPendingBlank] = useState<{ tileId: string; drop: { row: number; col: number } | null } | null>(null);
  const [mode, setMode] = useState<"place" | "exchange">("place");
  const [exchangeSet, setExchangeSet] = useState<Set<string>>(new Set());
  const [wordPopup, setWordPopup] = useState<{ row: number; col: number; words: string[] } | null>(null);
  const [definition, setDefinition] = useState<{ word: string; loading: boolean; text: string | null } | null>(null);
  const draggedTileId = useRef<string | null>(null);

  useEffect(() => {
    if (!view.isYourTurn) {
      setSelected(null);
      setStaged([]);
      setPendingBlank(null);
      setExchangeSet(new Set());
    }
  }, [view.isYourTurn]);

  useEffect(() => {
    if (view.phase === "finished") playSound("win");
  }, [view.phase]);

  // Broadcast a live "here's where I'm about to place" hint (cells only,
  // never letters) whenever the local staging changes, so opponents see
  // activity on the board instead of it looking frozen until you submit.
  useEffect(() => {
    if (!view.isYourTurn) return;
    sendTilePreview(staged.map((s) => ({ row: s.row, col: s.col })));
  }, [staged, view.isYourTurn, sendTilePreview]);

  // Turn timer — any client can report it running out (matching the other
  // timer-based games), but only the current turn's own client actually
  // fires it automatically; the host also has a manual "Skip round" override
  // in the room header for when that player's disconnected.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedTimeUp = useRef(false);
  useEffect(() => {
    firedTimeUp.current = false;
    if (!view.turnEndsAt) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, view.turnEndsAt! - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && view.isYourTurn && !firedTimeUp.current) {
        firedTimeUp.current = true;
        onAction({ type: "timeUp" });
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [view.turnEndsAt, view.isYourTurn, onAction]);

  const stagedByCell = new Map(staged.map((s) => [`${s.row},${s.col}`, s]));
  const usedTileIds = new Set(staged.map((s) => s.tileId));
  const opponentPreview = view.turnPlayerId !== meId ? (tilePreviews[view.turnPlayerId] ?? []) : [];
  const opponentPreviewKeys = new Set(opponentPreview.map((c) => `${c.row},${c.col}`));

  function stageTile(row: number, col: number, tileId: string, letter: string, isBlank: boolean, value: number) {
    playSound("tilePlace");
    setStaged((s) => [...s, { row, col, tileId, letter, isBlank, value }]);
  }

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
      setPendingBlank({ tileId: tile.id, drop: null });
      return;
    }
    playSound("click");
    setSelected({ tileId: tile.id, letter: tile.letter, isBlank: false, value: tile.value });
  }

  function chooseBlankLetter(letter: string) {
    if (!pendingBlank) return;
    const tile = view.yourRack.find((t) => t.id === pendingBlank.tileId);
    if (pendingBlank.drop) {
      stageTile(pendingBlank.drop.row, pendingBlank.drop.col, pendingBlank.tileId, letter, true, tile?.value ?? 0);
    } else {
      setSelected({ tileId: pendingBlank.tileId, letter, isBlank: true, value: tile?.value ?? 0 });
    }
    setPendingBlank(null);
  }

  function clickBoardCell(row: number, col: number) {
    const cell = view.board[row]![col];
    if (cell) {
      const words = wordsThroughCell(view.board, row, col);
      if (words.length > 0) setWordPopup({ row, col, words });
      return;
    }
    if (!view.isYourTurn || mode !== "place") return;
    const key = `${row},${col}`;
    if (stagedByCell.has(key)) {
      setStaged((s) => s.filter((x) => !(x.row === row && x.col === col)));
      return;
    }
    if (!selected) return;
    stageTile(row, col, selected.tileId, selected.letter, selected.isBlank, selected.value);
    setSelected(null);
  }

  function dropOnCell(e: React.DragEvent, row: number, col: number) {
    e.preventDefault();
    if (!view.isYourTurn || mode !== "place") return;
    if (view.board[row]![col]) return;
    const key = `${row},${col}`;
    if (stagedByCell.has(key)) return;
    const tileId = draggedTileId.current ?? e.dataTransfer.getData("text/plain");
    draggedTileId.current = null;
    if (!tileId || usedTileIds.has(tileId)) return;
    const tile = view.yourRack.find((t) => t.id === tileId);
    if (!tile) return;
    if (tile.isBlank) {
      setPendingBlank({ tileId, drop: { row, col } });
      return;
    }
    stageTile(row, col, tile.id, tile.letter, false, tile.value);
  }

  async function lookUpWord(word: string) {
    setDefinition({ word, loading: true, text: null });
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
      if (!res.ok) {
        setDefinition({ word, loading: false, text: "No definition found (it's still a valid play — this free dictionary just doesn't cover every word list entry)." });
        return;
      }
      const data = await res.json();
      const entry = data[0];
      const meaning = entry?.meanings?.[0];
      const def = meaning?.definitions?.[0]?.definition;
      setDefinition({
        word,
        loading: false,
        text: def ? `${meaning.partOfSpeech ? `(${meaning.partOfSpeech}) ` : ""}${def}` : "No definition found.",
      });
    } catch {
      setDefinition({ word, loading: false, text: "Couldn't reach the dictionary right now." });
    }
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
    <div className="grid w-full gap-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
        <span className={view.isYourTurn ? "font-bold text-gold" : "text-slate-400"}>
          {view.isYourTurn ? "Your turn!" : `${nameFor(view.turnPlayerId)}'s turn`}
        </span>
        {remainingMs !== null && (
          <span className={`font-bold tabular-nums ${remainingMs < 20_000 ? "text-accent" : "text-slate-400"}`}>
            ⏱ {Math.floor(remainingMs / 1000 / 60)}:{String(Math.ceil((remainingMs / 1000) % 60)).padStart(2, "0")}
          </span>
        )}
        <span className="text-slate-500">🎒 {view.bagCount} tiles left in bag</span>
      </div>

      {/* Board — a wood-grain frame around the grid, wooden-tile styling
          throughout, tinted by whoever played each letter. */}
      <div
        className="mx-auto w-full max-w-[760px] rounded-2xl border-4 p-2 shadow-2xl sm:p-3"
        style={{
          borderColor: "#5c3d21",
          background: "repeating-linear-gradient(100deg, #7a5230 0px, #6e4a2a 3px, #7d5533 7px, #714b2b 11px, #7a5230 16px)",
        }}
      >
        <div className="grid gap-[3px] rounded-lg bg-[#4a3016] p-[3px]" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}>
          {view.board.map((row, r) =>
            row.map((cell, c) => {
              const premium = getPremium(r, c);
              const key = `${r},${c}`;
              const stagedTile = stagedByCell.get(key);
              const isCenter = premium === "ST";
              const isPreview = opponentPreviewKeys.has(key) && !cell && !stagedTile;
              const ownerColor = cell ? colorFor(cell.placedBy) : stagedTile ? colorFor(meId) : null;
              return (
                <button
                  key={key}
                  onClick={() => clickBoardCell(r, c)}
                  onDragOver={(e) => {
                    if (view.isYourTurn && mode === "place" && !cell) e.preventDefault();
                  }}
                  onDrop={(e) => dropOnCell(e, r, c)}
                  disabled={!cell && (!view.isYourTurn || mode !== "place")}
                  title={cell ? "Click to see the word(s) this letter is part of" : undefined}
                  className={`relative flex aspect-square items-center justify-center rounded-[2px] text-[10px] font-black transition sm:text-xs ${
                    cell || stagedTile
                      ? "border-b-2 shadow-[0_1px_0_rgba(0,0,0,0.4)]"
                      : premium
                        ? PREMIUM_CLASS[premium]
                        : "bg-[#8a6a44]/40 text-transparent hover:bg-[#8a6a44]/70"
                  } ${isPreview ? "ring-2 ring-inset" : ""}`}
                  style={
                    cell || stagedTile
                      ? {
                          background: `linear-gradient(180deg, ${ownerColor}, ${ownerColor}cc)`,
                          borderColor: "rgba(0,0,0,0.35)",
                          color: "#1a1208",
                          opacity: stagedTile && !cell ? 0.85 : 1,
                        }
                      : isPreview
                        ? ({ "--tw-ring-color": colorFor(view.turnPlayerId) } as React.CSSProperties)
                        : undefined
                  }
                >
                  {cell ? cell.letter : stagedTile ? stagedTile.letter : isCenter ? "★" : premium ? PREMIUM_LABEL[premium] : ""}
                  {(cell || stagedTile) && (
                    <span className="absolute bottom-0 right-0.5 text-[7px] font-bold leading-none opacity-70">{(cell ?? stagedTile)!.value}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {wordPopup && (
        <div className="card-surface w-full max-w-md rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-300">Word{wordPopup.words.length > 1 ? "s" : ""} here</p>
            <button
              className="text-xs text-slate-500 hover:text-slate-300"
              onClick={() => {
                setWordPopup(null);
                setDefinition(null);
              }}
            >
              ✕ close
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {wordPopup.words.map((w) => (
              <button key={w} className="btn-secondary px-3 py-1 text-xs" onClick={() => lookUpWord(w)}>
                {w}
              </button>
            ))}
          </div>
          {definition && (
            <div className="mt-3 rounded-xl bg-black/20 p-3 text-sm">
              <p className="mb-1 font-bold text-gold">{definition.word}</p>
              <p className="text-slate-300">{definition.loading ? "Looking it up…" : definition.text}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">Your rack — drag tiles onto the board, or tap one then tap a square</p>
        <div className="flex flex-wrap justify-center gap-1.5 rounded-xl border-2 border-[#5c3d21] bg-[#7a5230] p-2">
          {view.yourRack.map((tile) => {
            const isUsed = usedTileIds.has(tile.id);
            const isSelected = selected?.tileId === tile.id;
            const isExchangeSelected = exchangeSet.has(tile.id);
            return (
              <button
                key={tile.id}
                draggable={view.isYourTurn && !isUsed && mode === "place"}
                onDragStart={(e) => {
                  draggedTileId.current = tile.id;
                  e.dataTransfer.setData("text/plain", tile.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  draggedTileId.current = null;
                }}
                disabled={!view.isYourTurn || isUsed}
                onClick={() => clickRackTile(tile)}
                className={`flex h-12 w-12 flex-col items-center justify-center rounded-md border-b-2 font-black transition disabled:opacity-30 ${
                  isSelected || isExchangeSelected
                    ? "border-gold bg-gradient-to-b from-gold to-yellow-600 text-ink ring-2 ring-gold"
                    : "border-[#4a3016] bg-gradient-to-b from-[#f0dfc0] to-[#dcc59a] text-ink enabled:hover:brightness-105 enabled:active:cursor-grabbing"
                } ${view.isYourTurn && !isUsed && mode === "place" ? "cursor-grab" : ""}`}
              >
                <span className="text-lg leading-none">{tile.isBlank ? "?" : tile.letter}</span>
                <span className="text-[9px] opacity-70">{tile.value}</span>
              </button>
            );
          })}
        </div>
      </div>

      {pendingBlank && (
        <div className="card-surface w-full max-w-md rounded-2xl p-4 text-center">
          <p className="mb-2 text-sm text-slate-300">Choose a letter for your blank tile:</p>
          <div className="flex flex-wrap justify-center gap-1">
            {ALPHABET.map((l) => (
              <button key={l} className="h-8 w-8 rounded-md bg-white/10 text-sm font-bold hover:bg-gold/30" onClick={() => chooseBlankLetter(l)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn-secondary mt-3 text-xs" onClick={() => setPendingBlank(null)}>
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
            <span
              key={s.playerId}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
              style={{ backgroundColor: s.playerId === view.turnPlayerId ? `${colorFor(s.playerId)}33` : undefined }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorFor(s.playerId) }} />
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
    </div>

    <aside className="card-surface rounded-2xl p-3 xl:sticky xl:top-4">
      <p className="mb-1.5 text-xs font-semibold text-slate-400">Play log</p>
      <div className="flex max-h-64 flex-col-reverse gap-1 overflow-y-auto text-xs text-slate-400 xl:max-h-[calc(100vh-8rem)]">
        {[...view.log].reverse().map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </aside>
    </div>
  );
}
