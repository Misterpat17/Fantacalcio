import { Participant } from "@/lib/types";

// Elenco pubblico di chi ha già risposto partecipo/non partecipo alla
// busta corrente, prima ancora che parta il countdown (e anche durante,
// per chi entra tardi). Non mostra MAI gli importi, solo la decisione:
// stesso principio di sicurezza già usato per lo schermo del proiettore.
export function DecisionList({
  eligibleIds,
  participatingIds,
  declinedIds,
  participants,
  compact,
}: {
  eligibleIds: string[];
  participatingIds: string[];
  declinedIds: string[];
  participants: Participant[];
  compact?: boolean;
}) {
  const byId = new Map(participants.map((p) => [p.id, p]));

  const rows = eligibleIds.map((id) => {
    const status: "partecipa" | "non_partecipa" | "in_attesa" = participatingIds.includes(id)
      ? "partecipa"
      : declinedIds.includes(id)
      ? "non_partecipa"
      : "in_attesa";
    return { id, name: byId.get(id)?.display_name || "?", status };
  });

  if (rows.length === 0) return null;

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <p className="text-xs uppercase tracking-widest text-slate-500 text-center">Chi partecipa</p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {rows.map((r) => (
          <span
            key={r.id}
            className={
              "px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap " +
              (r.status === "partecipa"
                ? "bg-emerald-500/10 text-emerald-400"
                : r.status === "non_partecipa"
                ? "bg-slate-800 text-slate-500 line-through"
                : "bg-amber-500/10 text-amber-400")
            }
          >
            {r.status === "partecipa" ? "✅" : r.status === "non_partecipa" ? "❌" : "⏳"} {r.name}
          </span>
        ))}
      </div>
    </div>
  );
}
