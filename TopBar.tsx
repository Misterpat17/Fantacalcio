import { Participant } from "@/lib/types";

interface RevealedBid {
  participant_id: string;
  decision: string;
  amount: number | null;
}

interface LastResult {
  player_id?: string;
  player_nome?: string;
  player_ruolo?: string;
  player_squadra?: string;
  no_bids?: boolean;
  winner_participant_id?: string;
  amount?: number;
  tie_break_auto?: boolean;
  tie_break_caller?: boolean;
  // Elenco di tutte le offerte del round appena chiuso, già ordinato dal
  // server dall'importo più alto al più basso (chi non partecipa in
  // fondo): mostrato dall'alto verso il basso, come richiesto.
  bids?: RevealedBid[];
}

// Elenco delle offerte in ordine decrescente, dall'alto verso il basso.
// Le offerte sono già rivelate a questo punto (round chiuso): mostrarle
// non viola il principio "mai gli importi prima della chiusura".
function BidsRanked({
  bids,
  participants,
  winnerId,
  compact,
}: {
  bids: RevealedBid[];
  participants: Participant[];
  winnerId?: string;
  compact?: boolean;
}) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  // Difesa extra lato client: ri-ordiniamo comunque per importo
  // decrescente (chi non partecipa in fondo), anche se il server li
  // manda già ordinati.
  const sorted = [...bids].sort((a, b) => {
    const aIn = a.decision === "partecipo" ? 1 : 0;
    const bIn = b.decision === "partecipo" ? 1 : 0;
    if (aIn !== bIn) return bIn - aIn;
    return (b.amount ?? -1) - (a.amount ?? -1);
  });

  if (sorted.length === 0) return null;

  return (
    <div className={compact ? "space-y-1 mt-3" : "space-y-1.5 mt-4"}>
      {sorted.map((b, idx) => {
        const p = byId.get(b.participant_id);
        const isWinner = !!winnerId && b.participant_id === winnerId;
        const partecipa = b.decision === "partecipo";
        return (
          <div
            key={b.participant_id}
            className={
              "flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm " +
              (isWinner ? "bg-emerald-500/15 font-bold" : "bg-slate-900/40")
            }
          >
            <span className={partecipa ? "" : "text-slate-500"}>
              {isWinner ? "🏆" : `${idx + 1}.`} {p?.display_name || "?"}
            </span>
            <span className={partecipa ? (isWinner ? "text-emerald-400" : "text-slate-200") : "text-slate-600"}>
              {partecipa ? b.amount : "non partecipa"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ResultBanner({
  result,
  participants,
  variant = "default",
}: {
  result: LastResult;
  participants: Participant[];
  // "screen": layout più leggibile a distanza per lo schermo del
  // proiettore — nome del vincitore a sinistra, prezzo grande a destra.
  variant?: "default" | "screen";
}) {
  if (result.no_bids) {
    if (variant === "screen") {
      return (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 px-10 py-8 text-center fade-in-up">
          <p className="text-3xl font-bold text-slate-300">Nessuna offerta per {result.player_nome}</p>
          <p className="text-slate-500 mt-2">Il giocatore resta disponibile per una chiamata futura.</p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-center fade-in-up">
        <p className="font-bold text-slate-300">Nessuna offerta per {result.player_nome}</p>
        <p className="text-sm text-slate-500">Il giocatore resta disponibile per una chiamata futura.</p>
      </div>
    );
  }

  const winner = participants.find((p) => p.id === result.winner_participant_id);
  const tieNote = result.tie_break_caller
    ? "Pareggio: se lo aggiudica chi ha chiamato il giocatore."
    : result.tie_break_auto
    ? "Pareggio risolto per maggior disponibilità di crediti."
    : null;

  if (variant === "screen") {
    return (
      <div className="rounded-2xl border border-emerald-600/50 bg-emerald-500/10 px-10 py-8 fade-in-up">
        <div className="flex items-center justify-between gap-10">
          <div className="text-left">
            <p className="text-sm font-black uppercase tracking-widest text-emerald-400">Aggiudicato</p>
            <p className="text-4xl font-black">{result.player_nome}</p>
            <p className="text-lg text-slate-400">{result.player_squadra}</p>
            <p className="text-2xl mt-3">
              🏆 <span className="font-bold">{winner?.display_name || "?"}</span>
            </p>
            {tieNote && <p className="text-xs text-slate-500 mt-1">{tieNote}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-6xl font-black text-emerald-400 whitespace-nowrap">{result.amount}</p>
            <p className="text-sm uppercase tracking-widest text-slate-500">crediti</p>
          </div>
        </div>
        {result.bids && (
          <BidsRanked bids={result.bids} participants={participants} winnerId={result.winner_participant_id} />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-600/50 bg-emerald-500/10 p-4 space-y-1 fade-in-up">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-400 text-center">AGGIUDICATO</p>
      <p className="text-xl font-black text-center">
        {result.player_nome} <span className="text-slate-400 font-medium">— {result.player_squadra}</span>
      </p>
      <p className="text-lg text-center">
        🏆 <span className="font-bold">{winner?.display_name || "?"}</span> · 💰{" "}
        <span className="font-bold">{result.amount}</span> crediti
      </p>
      {tieNote && <p className="text-xs text-slate-500 text-center">{tieNote}</p>}
      {result.bids && (
        <BidsRanked bids={result.bids} participants={participants} winnerId={result.winner_participant_id} compact />
      )}
    </div>
  );
}
