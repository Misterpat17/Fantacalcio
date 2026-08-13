"use client";

import { use } from "react";
import { RoleBadge } from "@/components/RoleBadge";
import { TimerDisplay } from "@/components/TimerDisplay";
import { ResultBanner } from "@/components/ResultBanner";
import { DecisionList } from "@/components/DecisionList";
import { useAuctionState } from "@/hooks/useAuctionState";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { RUOLO_LABEL } from "@/lib/types";

// Pagina pubblica, pensata per essere proiettata su un maxi schermo
// durante la serata: nessun login richiesto, basta conoscere il codice
// della lega (lo stesso che si condivide per farsi iscrivere). Di sola
// lettura: non permette mai di chiamare o fare offerte. Mostra chi
// partecipa e chi non partecipa alla busta corrente (solo le DECISIONI,
// mai gli importi — quelli restano segreti finché il round non si
// chiude, poi vengono rivelati in ordine decrescente come ovunque
// nell'app).
export default function SchermoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const { league, state, participants, currentPlayer, currentRound } = useAuctionState(upperCode);
  const { now } = useServerClock();
  const remainingMs = useCountdown(state?.phase_end_at, now);

  const participantsById = new Map(participants.map((p) => [p.id, p]));
  const callerName = state?.current_caller_participant_id
    ? participantsById.get(state.current_caller_participant_id)?.display_name || null
    : null;
  const turnName = state?.current_turn_participant_id
    ? participantsById.get(state.current_turn_participant_id)?.display_name || null
    : null;

  if (!league || !state) {
    return <main className="flex-1 flex items-center justify-center text-slate-400 text-2xl">Caricamento...</main>;
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-8 text-center">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-slate-400">{league.name}</h1>
        <p className="text-sm font-mono text-slate-600">{upperCode}</p>
      </div>

      {state.phase === "WAITING" && (
        <p className="text-3xl font-bold text-slate-400">L&apos;asta non è ancora iniziata</p>
      )}

      {state.phase === "PAUSED" && <p className="text-4xl font-bold text-amber-400">⏸️ ASTA IN PAUSA</p>}

      {state.phase === "FINISHED" && <p className="text-4xl font-black">🎉 ASTA TERMINATA</p>}

      {state.phase === "CALLING" && (
        <div className="space-y-6 w-full max-w-3xl">
          {state.last_result && <ResultBanner result={state.last_result as never} participants={participants} variant="screen" />}
          <p className="text-3xl font-bold text-slate-300">
            Turno di <span className="text-sky-400">{turnName || "?"}</span>
          </p>
        </div>
      )}

      {(state.phase === "BIDDING" || state.phase === "TIE_BREAK") && currentPlayer && currentRound && (
        <div className="space-y-6 fade-in-up">
          <p className="text-lg uppercase tracking-widest text-slate-500">
            {state.phase === "TIE_BREAK" ? "🔥 SPAREGGIO" : "🔥 GIOCATORE IN ASTA"}
          </p>
          <h2 className="text-6xl font-black tracking-tight">{currentPlayer.nome.toUpperCase()}</h2>
          <p className="text-2xl text-slate-400">{currentPlayer.squadra || "—"}</p>
          <div className="flex justify-center">
            <RoleBadge ruolo={currentPlayer.ruolo} size="lg" />
            <span className="sr-only">{RUOLO_LABEL[currentPlayer.ruolo]}</span>
          </div>
          {callerName && <p className="text-lg text-slate-500">Chiamato da {callerName}</p>}

          {remainingMs !== null ? (
            <TimerDisplay remainingMs={remainingMs} size="xl" />
          ) : (
            <p className="text-2xl font-bold text-amber-400">⏳ In attesa che tutti rispondano...</p>
          )}

          <div className="pt-4">
            <DecisionList
              eligibleIds={currentRound.eligible_participant_ids}
              participatingIds={currentRound.participating_participant_ids}
              declinedIds={currentRound.declined_participant_ids}
              participants={participants}
            />
          </div>
        </div>
      )}

      {state.phase === "AWARDED" && state.last_result && (
        <div className="w-full max-w-3xl">
          <ResultBanner result={state.last_result as never} participants={participants} variant="screen" />
        </div>
      )}
    </main>
  );
}
