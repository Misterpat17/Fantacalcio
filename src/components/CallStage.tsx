"use client";

import { useState } from "react";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { PlayerHero } from "./PlayerHero";
import { BiddingPanel } from "./BiddingPanel";
import { ResultBanner } from "./ResultBanner";
import { PlayersList } from "./PlayersList";
import { useCountdown } from "@/hooks/useCountdown";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { AuctionState, BidRound, Participant, Player } from "@/lib/types";

interface Props {
  code: string;
  token: string | null;
  myParticipantId: string | null;
  isAdmin: boolean;
  state: AuctionState | null;
  currentPlayer: Player | null;
  currentRound: BidRound | null;
  participants: Participant[];
  players: Player[];
  now: () => number;
  me: {
    myBid: { decision: string; amount: number | null } | null;
    maxBid: number | null;
    roleAvailable: boolean | null;
  } | null;
  onMeRefresh: () => void;
  onGlobalRefresh: () => void;
}

export function CallStage({
  code,
  token,
  myParticipantId,
  isAdmin,
  state,
  currentPlayer,
  currentRound,
  participants,
  players,
  now,
  me,
  onMeRefresh,
  onGlobalRefresh,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remainingMs = useCountdown(state?.phase_end_at, now);

  const callerName = state?.current_caller_participant_id
    ? participants.find((p) => p.id === state.current_caller_participant_id)?.display_name || null
    : null;
  const turnName = state?.current_turn_participant_id
    ? participants.find((p) => p.id === state.current_turn_participant_id)?.display_name || null
    : null;
  const isMyTurn = !!myParticipantId && state?.current_turn_participant_id === myParticipantId;

  async function handleCall(player: Player) {
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/leagues/${code}/call`, { method: "POST", token, body: { playerId: player.id } });
      onGlobalRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? messageForCall(err.code) : "Errore di rete.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePass() {
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/leagues/${code}/pass`, { method: "POST", token });
      onGlobalRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? messageForPass(err.code) : "Errore di rete.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  if (state.phase === "PAUSED") {
    return (
      <Card className="p-8 text-center space-y-2">
        <p className="text-2xl">⏸️</p>
        <h2 className="text-xl font-bold text-amber-400">ASTA IN PAUSA</h2>
        <p className="text-sm text-slate-400">L&apos;amministratore ha sospeso l&apos;asta. Resta connesso: riprenderà a breve.</p>
      </Card>
    );
  }

  if (state.phase === "FINISHED") {
    return (
      <Card className="p-10 text-center space-y-2">
        <p className="text-3xl">🎉</p>
        <h2 className="text-2xl font-black">ASTA TERMINATA</h2>
        <p className="text-sm text-slate-400">Tutte le rose sono state completate. Consulta la classifica per il riepilogo finale.</p>
      </Card>
    );
  }

  if (state.phase === "WAITING") {
    return (
      <Card className="p-8 text-center space-y-2">
        <h2 className="text-xl font-bold">L&apos;asta non è ancora iniziata</h2>
        <p className="text-sm text-slate-400">
          {isAdmin ? "Importa i giocatori e avvia l'asta dal pannello admin." : "In attesa che l'amministratore avvii l'asta."}
        </p>
      </Card>
    );
  }

  if (state.phase === "CALLING") {
    return (
      <div className="space-y-4">
        {state.last_result && (
          <ResultBanner result={state.last_result as never} participants={participants} />
        )}

        {isMyTurn ? (
          <Card className="p-5 space-y-4 border-sky-600/50">
            <div className="text-center">
              <h2 className="text-2xl font-black text-sky-400">È IL TUO TURNO</h2>
              <p className="text-sm text-slate-400">Scegli un giocatore da chiamare, oppure passa il turno.</p>
            </div>
            {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
            <PlayersList players={players} onCall={handleCall} canCall={!busy} maxHeightClass="max-h-[45vh]" />
            <Button variant="secondary" className="w-full" disabled={busy} onClick={handlePass}>
              PASSA IL TURNO
            </Button>
          </Card>
        ) : (
          <Card className="p-8 text-center space-y-1">
            <h2 className="text-lg font-bold">
              È il turno di <span className="text-sky-400">{turnName || "?"}</span>
            </h2>
            <p className="text-sm text-slate-400">In attesa della chiamata...</p>
          </Card>
        )}
      </div>
    );
  }

  if ((state.phase === "BIDDING" || state.phase === "TIE_BREAK") && currentPlayer && currentRound) {
    const eligible = !myParticipantId || currentRound.eligible_participant_ids.includes(myParticipantId);
    return (
      <Card className="p-5 space-y-5">
        <PlayerHero
          player={currentPlayer}
          callerName={state.phase === "BIDDING" ? callerName : null}
          remainingMs={remainingMs}
          respondedCount={currentRound.responded_count}
          participatingCount={currentRound.participating_count}
          eligibleCount={currentRound.eligible_participant_ids.length}
          tieBreak={state.phase === "TIE_BREAK"}
        />
        {token && (
          <BiddingPanel
            code={code}
            token={token}
            roundId={currentRound.id}
            eligible={eligible}
            roleAvailable={me?.roleAvailable ?? null}
            maxBid={me?.maxBid ?? null}
            myBid={me?.myBid ?? null}
            locked={remainingMs !== null && remainingMs <= 0}
            onSubmitted={onMeRefresh}
          />
        )}
      </Card>
    );
  }

  if (state.phase === "AWARDED" && state.last_result) {
    return <ResultBanner result={state.last_result as never} participants={participants} />;
  }

  return (
    <Card className="p-8 text-center text-slate-400">Caricamento stato asta...</Card>
  );
}

function messageForCall(code: string): string {
  switch (code) {
    case "NOT_YOUR_TURN":
      return "Non è il tuo turno.";
    case "PLAYER_NOT_AVAILABLE":
      return "Questo giocatore non è più disponibile.";
    case "ROLE_FULL_FOR_CALLER":
      return "Hai già completato gli slot per questo ruolo.";
    default:
      return "Non è stato possibile chiamare questo giocatore.";
  }
}

function messageForPass(code: string): string {
  if (code === "PASS_LIMIT_REACHED") return "Hai raggiunto il limite massimo di pass consecutivi: devi chiamare un giocatore.";
  if (code === "NOT_YOUR_TURN") return "Non è il tuo turno.";
  return "Non è stato possibile passare il turno.";
}
