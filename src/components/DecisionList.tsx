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
  big,
}: {
  eligibleIds: string[];
  participatingIds: string[];
  declinedIds: string[];
  participants: Participant[];
  compact?: boolean;
  // Variante "da proiettore": elenco verticale, un partecipante per
  // riga, font grande e ingresso animato — pensata per essere letta da
  // lontano sullo schermo condiviso durante la serata.
  big?: boolean;
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

  if (big) {
    return (
      <div className="space-y-3 w-full">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500 text-center lg:text-left">Chi partecipa</p>
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className={
                "flex items-center gap-3 rounded-2xl border px-4 py-3 fade-in-up transition-colors " +
                (r.status === "partecipa"
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : r.status === "non_partecipa"
                  ? "border-slate-800 bg-slate-900/30 opacity-60"
                  : "border-amber-500/30 bg-amber-500/5 decision-waiting")
              }
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span
                className={
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-black " +
                  (r.status === "partecipa"
                    ? "bg-emerald-500 text-slate-950"
                    : r.status === "non_partecipa"
                    ? "bg-slate-800 text-slate-500"
                    : "bg-amber-500/80 text-slate-950")
                }
              >
                {r.status === "partecipa" ? "✅" : r.status === "non_partecipa" ? "❌" : "⏳"}
              </span>
              <span
                className={
                  "text-2xl font-bold truncate " +
                  (r.status === "non_partecipa" ? "text-slate-500 line-through" : "text-slate-100")
                }
              >
                {r.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
