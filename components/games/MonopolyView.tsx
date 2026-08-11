"use client";

import { MonopolyAction, MonopolyView as ViewType } from "@/lib/games/monopoly";
import { PlayerInfo } from "@/lib/types";

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

function money(n: number) {
  return `$${n.toLocaleString()}`;
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg">
          {view.phase === "finished" ? (
            <span className="font-bold">🏆 Game over!</span>
          ) : view.yourTurn ? (
            <span className="font-bold text-accent">Your turn</span>
          ) : (
            <span className="text-slate-400">Waiting on {nameFor(current)}…</span>
          )}
          {view.lastRoll && <span className="ml-2 text-sm text-slate-500">(rolled {view.lastRoll[0]} + {view.lastRoll[1]})</span>}
        </p>
        {isHost && view.phase !== "finished" && (
          <button className="btn-secondary text-xs" onClick={() => onAction({ type: "endGame" })}>
            End game now
          </button>
        )}
      </div>

      {/* Board */}
      <div className="mx-auto grid w-full max-w-4xl grid-cols-8 gap-1 sm:grid-cols-10">
        {view.board.map((tile, i) => {
          const prop = view.properties[i]!;
          const occupants = view.players.filter((p) => p.position === i && !p.bankrupt);
          return (
            <div key={i} className="relative flex h-14 flex-col items-center justify-center rounded-md bg-white/5 p-0.5 text-center text-[8px] leading-tight">
              {tile.color && <span className="h-1.5 w-full rounded-sm" style={{ backgroundColor: COLOR_SWATCH[tile.color] }} />}
              <span className="mt-0.5 line-clamp-2 text-slate-300">{tile.name}</span>
              {prop.ownerId && (
                <span className="mt-0.5 flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorFor(prop.ownerId) }} />
                  {prop.mortgaged && <span className="text-accent">M</span>}
                  {prop.houses > 0 && <span>{prop.houses === 5 ? "🏨" : "🏠".repeat(prop.houses)}</span>}
                </span>
              )}
              {occupants.length > 0 && (
                <div className="absolute -bottom-1 flex gap-0.5">
                  {occupants.map((p) => (
                    <span key={p.id} className="h-1.5 w-1.5 rounded-full border border-black/40" style={{ backgroundColor: colorFor(p.id) }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Players */}
      <div className="grid gap-3 sm:grid-cols-2">
        {view.players.map((p) => (
          <div key={p.id} className={`card-surface rounded-2xl p-3 ${p.bankrupt ? "opacity-40" : ""}`}>
            <div className="mb-1 flex items-center gap-2">
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

      {/* Turn actions */}
      {view.yourTurn && view.phase !== "finished" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-5">
          {view.phase === "awaitingRoll" && me.inJail && (
            <div className="flex flex-wrap justify-center gap-2">
              <p className="w-full text-center text-sm text-slate-400">You're in jail.</p>
              <button className="btn-primary" onClick={() => onAction({ type: "roll" })}>
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
            <button className="btn-primary text-lg" onClick={() => onAction({ type: "roll" })}>
              🎲 Roll dice
            </button>
          )}

          {view.phase === "awaitingPropertyDecision" && pendingTile && (
            <div className="flex flex-col items-center gap-2">
              <p>
                Buy <span className="font-semibold">{pendingTile.name}</span> for {money(pendingTile.price ?? 0)}?
              </p>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => onAction({ type: "buyProperty" })} disabled={me.cash < (pendingTile.price ?? 0)}>
                  Buy
                </button>
                <button className="btn-secondary" onClick={() => onAction({ type: "declineProperty" })}>
                  Pass
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

      {/* Property management (always visible on your turn, before ending it) */}
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
