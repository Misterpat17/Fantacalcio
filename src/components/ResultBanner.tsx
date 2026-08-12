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

export function ResultBanner({ result, participants }: { result: LastResult; participants: Participant[] }) {
  if (result.no_bids) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-center fade-in-up">
        <p className="font-bold text-slate-300">Nessuna offerta per {result.player_nome}</p>
        <p className="text-sm text-slate-500">Il giocatore resta disponibile per una chiamata futura.</p>
      </div>
    );
  }

  const winner = participants.find((p) => p.id === result.winner_participant_id);

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
