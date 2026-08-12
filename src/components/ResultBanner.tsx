import { Participant } from "@/lib/types";

interface LastResult {
  player_id?: string;
  player_nome?: string;
  player_ruolo?: string;
  player_squadra?: string;
  no_bids?: boolean;
  winner_participant_id?: string;
  amount?: number;
  tie_break_auto?: boolean;
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

  if (variant === "screen") {
    return (
      <div className="rounded-2xl border border-emerald-600/50 bg-emerald-500/10 px-10 py-8 flex items-center justify-between gap-10 fade-in-up">
        <div className="text-left">
          <p className="text-sm font-black uppercase tracking-widest text-emerald-400">Aggiudicato</p>
          <p className="text-4xl font-black">{result.player_nome}</p>
          <p className="text-lg text-slate-400">{result.player_squadra}</p>
          <p className="text-2xl mt-3">
            🏆 <span className="font-bold">{winner?.display_name || "?"}</span>
          </p>
          {result.tie_break_auto && (
            <p className="text-xs text-slate-500 mt-1">Pareggio risolto per maggior disponibilità di crediti.</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-6xl font-black text-emerald-400 whitespace-nowrap">{result.amount}</p>
          <p className="text-sm uppercase tracking-widest text-slate-500">crediti</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-600/50 bg-emerald-500/10 p-4 text-center space-y-1 fade-in-up">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-400">AGGIUDICATO</p>
      <p className="text-xl font-black">
        {result.player_nome} <span className="text-slate-400 font-medium">— {result.player_squadra}</span>
      </p>
      <p className="text-lg">
        🏆 <span className="font-bold">{winner?.display_name || "?"}</span> · 💰{" "}
        <span className="font-bold">{result.amount}</span> crediti
      </p>
      {result.tie_break_auto && (
        <p className="text-xs text-slate-500">Pareggio risolto per maggior disponibilità di crediti.</p>
      )}
    </div>
  );
}
