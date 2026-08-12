import { PlayerInfo } from "@/lib/types";

export default function PlayerList({
  players,
  meId,
  onKick,
}: {
  players: PlayerInfo[];
  meId: string;
  // Only passed by the lobby (host view) — kicking only makes sense, and is
  // only allowed server-side, before a game/series has started.
  onKick?: (playerId: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {players.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? "bg-emerald-400" : "bg-slate-600"}`} />
          <span className="truncate font-medium">
            {p.name}
            {p.id === meId && <span className="text-slate-500"> (you)</span>}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {p.isHost && <span className="text-xs text-gold">👑 host</span>}
            {p.score > 0 && (
              <span className="text-xs text-slate-400">
                🏆 {p.score} win{p.score === 1 ? "" : "s"}
              </span>
            )}
            {onKick && !p.isHost && (
              <button
                className="rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-accent/20 hover:text-accent"
                title={`Remove ${p.name} from the room`}
                onClick={() => onKick(p.id)}
              >
                ✕
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
