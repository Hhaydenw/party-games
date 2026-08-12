"use client";

import { useEffect, useRef, useState } from "react";
import { MonopolyAction, MonopolyView as ViewType } from "@/lib/games/monopoly";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

const PLAYER_COLORS = ["#e94560", "#f2b705", "#22c55e", "#3b82f6", "#a855f7", "#f97316"];

const COLOR_SWATCH: Record<string, string> = {
  brown: "#8b4513",
  lightblue: "#87ceeb",
  pink: "#e91e63",
  orange: "#f97316",
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  darkblue: "#1e3a8a",
};

const DIE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const CORNER_ICON: Record<string, string> = { go: "➡️", jail: "🔒", freeParking: "🅿️", goToJail: "👮" };
function nonPropertyIcon(type: string, name: string) {
  if (CORNER_ICON[type]) return CORNER_ICON[type]!;
  if (type === "chest") return "📦";
  if (type === "chance") return "❓";
  if (type === "tax") return "💵";
  if (type === "railroad") return "🚂";
  if (type === "utility") return name.startsWith("Electric") ? "💡" : "🚰";
  return "";
}

function money(n: number) {
  return `$${n.toLocaleString()}`;
}

// Lays the 40 tiles out on the real square Monopoly perimeter (11x11 grid),
// GO in the bottom-right corner, running counter-clockwise.
function tileGridPos(index: number): { row: number; col: number } {
  if (index === 0) return { row: 10, col: 10 };
  if (index <= 9) return { row: 10, col: 10 - index };
  if (index === 10) return { row: 10, col: 0 };
  if (index <= 19) return { row: 10 - (index - 10), col: 0 };
  if (index === 20) return { row: 0, col: 0 };
  if (index <= 29) return { row: 0, col: index - 20 };
  if (index === 30) return { row: 0, col: 10 };
  return { row: index - 30, col: 10 };
}

function Dice({ rolling, lastRoll }: { rolling: boolean; lastRoll: [number, number] | null }) {
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    if (!rolling) return;
    const interval = setInterval(() => {
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 80);
    return () => clearInterval(interval);
  }, [rolling]);
  const shown = rolling ? faces : lastRoll ?? faces;
  return (
    <div className="flex gap-2 text-4xl">
      <span className={rolling ? "animate-bounce" : ""}>{DIE_FACES[shown[0] - 1]}</span>
      <span className={rolling ? "animate-bounce" : ""}>{DIE_FACES[shown[1] - 1]}</span>
    </div>
  );
}

export default function MonopolyView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: MonopolyAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");
  const current = view.order[view.turnIndex]!;
  const isHost = meId === view.hostId;
  const colorFor = (id: string) => PLAYER_COLORS[view.order.indexOf(id) % PLAYER_COLORS.length]!;
  const me = view.players.find((p) => p.id === meId)!;
  const myProperties = view.properties.filter((p) => p.ownerId === meId);
  const pendingTile = view.pendingPropertyIndex !== null ? view.board[view.pendingPropertyIndex] : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rolling, setRolling] = useState(false);
  const prevRoll = useRef(view.lastRoll);
  const [showTradePanel, setShowTradePanel] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (view.lastRoll !== prevRoll.current) {
      prevRoll.current = view.lastRoll;
      setRolling(false);
    }
  }, [view.lastRoll]);

  const wasMyTurn = useRef(view.yourTurn);
  useEffect(() => {
    if (view.yourTurn && !wasMyTurn.current) playSound("turn");
    wasMyTurn.current = view.yourTurn;
  }, [view.yourTurn]);

  const announcedEnd = useRef(false);
  useEffect(() => {
    if (view.phase === "finished" && !announcedEnd.current) {
      announcedEnd.current = true;
      playSound("win");
    }
  }, [view.phase]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  }

  function handleRoll() {
    setRolling(true);
    playSound("click");
    onAction({ type: "roll" });
  }

  if (view.phase === "setup") {
    return (
      <div className="flex flex-col items-center gap-6 py-10">
        <h2 className="text-xl font-bold">🎩 Pick your piece</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {view.players.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 px-3 py-2">
              <span className="text-2xl">{p.piece ?? "❔"}</span>
              <span className="text-xs text-slate-400">{nameFor(p.id)}</span>
            </div>
          ))}
        </div>
        {!view.yourPiece ? (
          <div className="flex flex-wrap justify-center gap-3">
            {view.availablePieces.map((piece) => (
              <button
                key={piece}
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-3xl transition hover:scale-110 hover:bg-white/10"
                onClick={() => onAction({ type: "choosePiece", piece })}
              >
                {piece}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-slate-400">You picked {view.yourPiece}. Waiting for everyone else…</p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col gap-5 ${isFullscreen ? "overflow-y-auto bg-ink p-6" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg">
          {view.phase === "finished" ? (
            <span className="font-bold">🏆 Game over!</span>
          ) : view.yourTurn ? (
            <span className="font-bold text-accent">Your turn</span>
          ) : (
            <span className="text-slate-400">Waiting on {nameFor(current)}…</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs" onClick={() => setShowTradePanel((v) => !v)}>
            🤝 Trade
          </button>
          <button className="btn-secondary text-xs" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit fullscreen" : "⛶ Fullscreen"}
          </button>
          {isHost && view.phase !== "finished" && (
            <button className="btn-secondary text-xs" onClick={() => onAction({ type: "endGame" })}>
              End game now
            </button>
          )}
        </div>
      </div>

      {showTradePanel && (
        <TradePanel view={view} onAction={onAction} meId={meId} nameFor={nameFor} onClose={() => setShowTradePanel(false)} />
      )}

      {view.trades.filter((t) => t.status === "pending" && (t.fromPlayerId === meId || t.toPlayerId === meId)).length > 0 && (
        <div className="flex flex-col gap-2">
          {view.trades
            .filter((t) => t.status === "pending" && (t.fromPlayerId === meId || t.toPlayerId === meId))
            .map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-gold/10 px-4 py-2 text-sm">
                <span>
                  {t.fromPlayerId === meId ? (
                    <>
                      You offered {nameFor(t.toPlayerId)}: {t.offerProperties.map((i) => view.board[i]!.name).join(", ") || "nothing"}
                      {t.offerCash > 0 && ` + $${t.offerCash}`} for {t.requestProperties.map((i) => view.board[i]!.name).join(", ") || "nothing"}
                      {t.requestCash > 0 && ` + $${t.requestCash}`}
                    </>
                  ) : (
                    <>
                      {nameFor(t.fromPlayerId)} offers you {t.offerProperties.map((i) => view.board[i]!.name).join(", ") || "nothing"}
                      {t.offerCash > 0 && ` + $${t.offerCash}`} for {t.requestProperties.map((i) => view.board[i]!.name).join(", ") || "nothing"}
                      {t.requestCash > 0 && ` + $${t.requestCash}`}
                    </>
                  )}
                </span>
                {t.toPlayerId === meId ? (
                  <div className="ml-auto flex gap-2">
                    <button className="btn-primary px-3 py-1 text-xs" onClick={() => onAction({ type: "respondTrade", tradeId: t.id, accept: true })}>
                      Accept
                    </button>
                    <button className="btn-secondary px-3 py-1 text-xs" onClick={() => onAction({ type: "respondTrade", tradeId: t.id, accept: false })}>
                      Decline
                    </button>
                  </div>
                ) : (
                  <button className="btn-secondary ml-auto px-3 py-1 text-xs" onClick={() => onAction({ type: "cancelTrade", tradeId: t.id })}>
                    Cancel
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Board: real 11x11 square perimeter layout, sized up so prices/rent are legible */}
      <div
        className="relative mx-auto aspect-square w-full max-w-[900px] rounded-2xl border-4 border-emerald-900 p-2 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
        style={{ background: "radial-gradient(circle at 50% 50%, #0d5c3f 0%, #073b28 100%)" }}
      >
        {view.board.map((tile, i) => {
          const { row, col } = tileGridPos(i);
          const prop = view.properties[i]!;
          const occupants = view.players.filter((p) => p.position === i && !p.bankrupt);
          const isCorner = i === 0 || i === 10 || i === 20 || i === 30;
          const isOwnable = tile.price !== undefined;
          return (
            <div
              key={i}
              className={`absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden border border-black/30 p-0.5 text-center leading-tight ${
                isCorner ? "z-10 bg-slate-100 text-[7px] font-bold text-ink sm:text-[9px]" : "bg-slate-50 text-[6px] text-ink sm:text-[7.5px]"
              }`}
              style={{ left: `${(col / 11) * 100}%`, top: `${(row / 11) * 100}%`, width: `${100 / 11}%`, height: `${100 / 11}%` }}
              title={tile.name}
            >
              {tile.color && <span className="h-1.5 w-full shrink-0 sm:h-2.5" style={{ backgroundColor: COLOR_SWATCH[tile.color] }} />}
              {isCorner ? (
                <span className="text-base sm:text-2xl">{nonPropertyIcon(tile.type, tile.name)}</span>
              ) : (
                <span className="text-xs sm:text-base">{nonPropertyIcon(tile.type, tile.name)}</span>
              )}
              <span className="line-clamp-2 font-semibold text-ink/90">{tile.name}</span>
              {isOwnable && !prop.ownerId && <span className="font-bold text-emerald-700">{money(tile.price!)}</span>}
              {prop.ownerId && (
                <span className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" style={{ backgroundColor: colorFor(prop.ownerId) }} />
                    {prop.mortgaged && <span className="font-bold text-accent">Mortgaged</span>}
                  </span>
                  {!prop.mortgaged && prop.currentRent !== null && (
                    <span className="font-bold text-accent">Rent {money(prop.currentRent)}</span>
                  )}
                  {prop.houses > 0 && <span>{prop.houses === 5 ? "🏨" : "🏠".repeat(prop.houses)}</span>}
                </span>
              )}
              {occupants.length > 0 && (
                <div className="absolute -bottom-1 flex flex-wrap justify-center gap-0.5">
                  {occupants.map((p) => (
                    <span key={p.id} className="text-sm transition-all duration-500 sm:text-lg" style={{ filter: `drop-shadow(0 0 2px ${colorFor(p.id)})` }}>
                      {p.piece}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-4xl font-black tracking-widest text-emerald-100/10 sm:text-6xl">
          MONOPOLY
        </div>
      </div>

      {/* Players */}
      <div className="grid gap-3 sm:grid-cols-2">
        {view.players.map((p) => (
          <div key={p.id} className={`card-surface rounded-2xl p-3 ${p.bankrupt ? "opacity-40" : ""}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">{p.piece}</span>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(p.id) }} />
              <p className="font-semibold">{nameFor(p.id)}</p>
              {p.bankrupt && <span className="ml-auto text-xs text-accent">bankrupt</span>}
              {p.inJail && !p.bankrupt && <span className="ml-auto text-xs text-slate-400">🔒 in jail</span>}
            </div>
            <p className="text-xs text-slate-400">
              Cash: {money(p.cash)} · Properties: {p.propertyCount}
              {p.jailCards > 0 && ` · 🎟️ ${p.jailCards}`}
            </p>
            <p className="text-sm font-bold text-gold">Net worth: {money(p.netWorth)}</p>
          </div>
        ))}
      </div>

      {/* Auction */}
      {view.phase === "auction" && view.auction && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-gold/10 p-5">
          <p className="font-semibold">
            🔨 Auction: {view.board[view.auction.propertyIndex]!.name} (list price {money(view.board[view.auction.propertyIndex]!.price ?? 0)})
          </p>
          <p className="text-sm text-slate-300">
            High bid: <span className="font-bold text-gold">{money(view.auction.highBid)}</span>
            {view.auction.highBidderId && ` by ${nameFor(view.auction.highBidderId)}`}
          </p>
          <p className="text-xs text-slate-400">Still bidding: {view.auction.activeBidders.map(nameFor).join(", ")}</p>
          {view.auction.currentBidderId === meId ? (
            <AuctionBidForm view={view} onAction={onAction} me={me} />
          ) : (
            <p className="text-sm text-slate-400">Waiting on {nameFor(view.auction.currentBidderId)}…</p>
          )}
        </div>
      )}

      {/* Turn actions */}
      {view.yourTurn && view.phase !== "finished" && view.phase !== "auction" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-5">
          {view.phase === "awaitingRoll" && me.inJail && (
            <div className="flex flex-wrap justify-center gap-2">
              <p className="w-full text-center text-sm text-slate-400">You're in jail.</p>
              <Dice rolling={rolling} lastRoll={view.lastRoll} />
              <button className="btn-primary" onClick={handleRoll}>
                Roll for doubles
              </button>
              <button className="btn-secondary" onClick={() => onAction({ type: "payBail" })}>
                Pay $50 bail
              </button>
              {me.jailCards > 0 && (
                <button className="btn-secondary" onClick={() => onAction({ type: "useJailCard" })}>
                  Use Get Out of Jail Free
                </button>
              )}
            </div>
          )}

          {view.phase === "awaitingRoll" && !me.inJail && (
            <div className="flex flex-col items-center gap-3">
              <Dice rolling={rolling} lastRoll={view.lastRoll} />
              <button className="btn-primary text-lg" onClick={handleRoll} disabled={rolling}>
                🎲 Roll dice
              </button>
            </div>
          )}

          {view.phase === "awaitingPropertyDecision" && pendingTile && (
            <div className="flex flex-col items-center gap-2">
              <p>
                Buy <span className="font-semibold">{pendingTile.name}</span> for {money(pendingTile.price ?? 0)}?
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  onClick={() => {
                    playSound("success");
                    onAction({ type: "buyProperty" });
                  }}
                  disabled={me.cash < (pendingTile.price ?? 0)}
                >
                  Buy
                </button>
                <button className="btn-secondary" onClick={() => onAction({ type: "declineProperty" })}>
                  Pass to auction
                </button>
              </div>
            </div>
          )}

          {view.phase === "awaitingTurnEnd" && (
            <button className="btn-primary" onClick={() => onAction({ type: "endTurn" })}>
              End turn
            </button>
          )}
        </div>
      )}

      {/* Property management */}
      {view.yourTurn && (view.phase === "awaitingTurnEnd" || view.phase === "awaitingRoll") && myProperties.length > 0 && (
        <div className="rounded-2xl bg-white/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Manage your properties</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {myProperties.map((p) => {
              const tile = view.board[p.index]!;
              return (
                <div key={p.index} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-xs">
                  <span className="truncate">
                    {tile.name} {p.mortgaged && <span className="text-accent">(mortgaged)</span>}
                    {p.houses > 0 && ` · ${p.houses === 5 ? "hotel" : `${p.houses} house${p.houses > 1 ? "s" : ""}`}`}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    {tile.type === "property" && !p.mortgaged && (
                      <>
                        <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => onAction({ type: "buildHouse", propertyIndex: p.index })}>
                          Build
                        </button>
                        {p.houses > 0 && (
                          <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => onAction({ type: "sellHouse", propertyIndex: p.index })}>
                            Sell house
                          </button>
                        )}
                      </>
                    )}
                    {!p.mortgaged && p.houses === 0 && (
                      <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => onAction({ type: "mortgageProperty", propertyIndex: p.index })}>
                        Mortgage
                      </button>
                    )}
                    {p.mortgaged && (
                      <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => onAction({ type: "unmortgageProperty", propertyIndex: p.index })}>
                        Unmortgage
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-black/20 p-3 text-xs text-slate-400">
        {view.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function AuctionBidForm({ view, onAction, me }: { view: ViewType; onAction: (a: MonopolyAction) => void; me: ViewType["players"][number] }) {
  const [amount, setAmount] = useState(String((view.auction?.highBid ?? 0) + 10));
  return (
    <div className="flex gap-2">
      <input
        type="number"
        className="input w-28"
        min={(view.auction?.highBid ?? 0) + 1}
        max={me.cash}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button className="btn-primary" onClick={() => onAction({ type: "auctionBid", amount: Number(amount) })}>
        Bid
      </button>
      <button className="btn-secondary" onClick={() => onAction({ type: "auctionPass" })}>
        Pass
      </button>
    </div>
  );
}

function TradePanel({
  view,
  onAction,
  meId,
  nameFor,
  onClose,
}: {
  view: ViewType;
  onAction: (a: MonopolyAction) => void;
  meId: string;
  nameFor: (id: string) => string;
  onClose: () => void;
}) {
  const others = view.players.filter((p) => p.id !== meId && !p.bankrupt);
  const [toPlayerId, setToPlayerId] = useState(others[0]?.id ?? "");
  const [offerProperties, setOfferProperties] = useState<number[]>([]);
  const [requestProperties, setRequestProperties] = useState<number[]>([]);
  const [offerCash, setOfferCash] = useState(0);
  const [requestCash, setRequestCash] = useState(0);

  const myProps = view.properties.filter((p) => p.ownerId === meId);
  const theirProps = view.properties.filter((p) => p.ownerId === toPlayerId);

  function toggle(list: number[], setList: (v: number[]) => void, idx: number) {
    setList(list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx]);
  }

  function submit() {
    if (!toPlayerId) return;
    onAction({ type: "proposeTrade", toPlayerId, offerProperties, offerCash, requestProperties, requestCash });
    onClose();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Propose a trade</h3>
        <button className="text-sm text-slate-400" onClick={onClose}>
          ✕
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        Trade with:
        <select className="input w-auto" value={toPlayerId} onChange={(e) => setToPlayerId(e.target.value)}>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {nameFor(p.id)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-400">You give</p>
          <div className="flex flex-wrap gap-1">
            {myProps.map((p) => (
              <button
                key={p.index}
                onClick={() => toggle(offerProperties, setOfferProperties, p.index)}
                className={`rounded-lg px-2 py-1 text-[11px] ${offerProperties.includes(p.index) ? "bg-accent/30 ring-1 ring-accent" : "bg-black/20"}`}
              >
                {view.board[p.index]!.name}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs">
            + cash: <input type="number" className="input w-24 py-1" min={0} value={offerCash} onChange={(e) => setOfferCash(Number(e.target.value))} />
          </label>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-400">You get</p>
          <div className="flex flex-wrap gap-1">
            {theirProps.map((p) => (
              <button
                key={p.index}
                onClick={() => toggle(requestProperties, setRequestProperties, p.index)}
                className={`rounded-lg px-2 py-1 text-[11px] ${requestProperties.includes(p.index) ? "bg-gold/30 ring-1 ring-gold" : "bg-black/20"}`}
              >
                {view.board[p.index]!.name}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs">
            + cash: <input type="number" className="input w-24 py-1" min={0} value={requestCash} onChange={(e) => setRequestCash(Number(e.target.value))} />
          </label>
        </div>
      </div>
      <button className="btn-primary self-start" onClick={submit} disabled={!toPlayerId}>
        Send offer
      </button>
    </div>
  );
}
