import { PlayerInfo } from "@/lib/types";

export default function PlayerList({ players, meId }: { players: PlayerInfo[]; meId: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {players.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? "bg-emerald-400" : "bg-slate-600"}`} />
          <span className="truncate font-medium">
            {p.name}
            {p.id === meId && <span className="text-slate-500"> (you)</span>}
          </span>
          {p.isHost && <span className="ml-auto text-xs text-gold">👑 host</span>}
          {p.score > 0 && <span className="ml-auto text-xs text-slate-400">🏆 {p.score} win{p.score === 1 ? "" : "s"}</span>}
        </li>
      ))}
    </ul>
  );
}
