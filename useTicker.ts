import { LeaguePublic, Participant, Ruolo } from "@/lib/types";

export function ParticipantCard({
  participant,
  league,
  roleCounts,
  speso,
  isCurrentTurn,
  isMe,
}: {
  participant: Participant;
  league: LeaguePublic;
  roleCounts: Record<Ruolo, number>;
  speso: number;
  isCurrentTurn: boolean;
  isMe: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 transition-colors ${
        isCurrentTurn
          ? "border-sky-500 bg-sky-500/10 shadow-lg shadow-sky-500/10"
          : "border-slate-800 bg-slate-900/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${participant.connected ? "bg-emerald-400" : "bg-slate-600"}`} />
          <span className="font-bold truncate">
            {participant.display_name}
            {isMe && <span className="text-sky-400 font-normal"> (tu)</span>}
            {participant.is_admin && <span className="text-amber-400 font-normal text-xs"> · admin</span>}
          </span>
        </div>
        {isCurrentTurn && (
          <span className="text-[10px] font-black uppercase text-sky-300 bg-sky-500/20 px-2 py-0.5 rounded-full shrink-0">
            in turno
          </span>
        )}
      </div>

      {participant.is_player && (
        <>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-lg font-black tabular-nums">{participant.credits_current}</span>
            <span className="text-xs text-slate-500">/ {league.credits_iniziali} crediti</span>
          </div>
          <div className="text-xs text-slate-500">Speso: {speso}</div>

          <div className="mt-2 flex gap-1.5">
            <RoleChip label="P" count={roleCounts.P} limit={league.slots_p} />
            <RoleChip label="D" count={roleCounts.D} limit={league.slots_d} />
            <RoleChip label="C" count={roleCounts.C} limit={league.slots_c} />
            <RoleChip label="A" count={roleCounts.A} limit={league.slots_a} />
          </div>
        </>
      )}
      {!participant.is_player && <div className="mt-1 text-xs text-slate-500">Amministratore (non gioca)</div>}
    </div>
  );
}

function RoleChip({ label, count, limit }: { label: string; count: number; limit: number }) {
  const full = count >= limit;
  return (
    <div
      className={`flex-1 text-center rounded-md py-1 text-[11px] font-bold ${
        full ? "bg-slate-700/60 text-slate-300" : "bg-slate-800/60 text-slate-400"
      }`}
    >
      {label} {count}/{limit}
    </div>
  );
}
