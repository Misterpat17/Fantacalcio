"use client";

import { useCallback, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { CallStage } from "@/components/CallStage";
import { PlayersList } from "@/components/PlayersList";
import { ParticipantsSidebar } from "@/components/ParticipantsSidebar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuctionState } from "@/hooks/useAuctionState";
import { usePlayers } from "@/hooks/usePlayers";
import { useRosters } from "@/hooks/useRosters";
import { useServerClock } from "@/hooks/useServerClock";
import { useTicker } from "@/hooks/useTicker";
import { useMe } from "@/hooks/useMe";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { apiFetch, ApiError } from "@/lib/apiClient";

export default function DashboardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();
  const { loading: authLoading, user, token } = useSupabaseAuth();

  const { league, state, participants, currentPlayer, currentRound, leagueId, refreshAll, refreshLeague } =
    useAuctionState(upperCode);
  const { players } = usePlayers(upperCode, leagueId);
  const { rosters } = useRosters(leagueId);
  const { now } = useServerClock();
  const { data: meData, error: meError, refresh: refreshMe } = useMe(upperCode, token, currentRound?.id);

  const activeTimer = state?.phase === "BIDDING" || state?.phase === "TIE_BREAK";
  const onResolved = useCallback(() => {
    refreshAll();
    refreshMe();
  }, [refreshAll, refreshMe]);
  useTicker(upperCode, activeTimer, onResolved);

  // Heartbeat: segnala che sono online (mostrato agli altri partecipanti).
  const participant = meData?.participant ?? null;
  const heartbeatToken = participant ? token : null;
  useHeartbeat(upperCode, heartbeatToken);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  if (meError?.code === "NOT_A_PARTICIPANT") {
    return <JoinPrompt code={upperCode} token={token} onJoined={refreshMe} />;
  }

  if (!league || !state || !participant) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento asta...</main>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin={participant.is_admin} displayName={participant.display_name} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <CallStage
            code={upperCode}
            token={token}
            myParticipantId={participant.id}
            isAdmin={participant.is_admin}
            state={state}
            currentPlayer={currentPlayer}
            currentRound={currentRound}
            participants={participants}
            players={players}
            now={now}
            me={meData ? { myBid: meData.myBid, maxBid: meData.maxBid, roleAvailable: meData.roleAvailable } : null}
            callerPauseUsed={participant.caller_pause_used}
            onMeRefresh={refreshMe}
            onGlobalRefresh={() => {
              refreshAll();
              refreshLeague();
              refreshMe();
            }}
          />

          <Card className="p-5">
            <h2 className="font-bold text-slate-300 text-sm uppercase tracking-wide mb-3">Giocatori</h2>
            <PlayersList players={players} />
          </Card>
        </div>

        <div>
          <ParticipantsSidebar
            league={league}
            participants={participants}
            rosters={rosters}
            players={players}
            state={state}
            myParticipantId={participant.id}
          />
        </div>
      </main>
    </div>
  );
}

// Segnala periodicamente che il partecipante è online (mostrato agli
// altri come "connesso" nella sidebar).
function useHeartbeat(code: string, token: string | null) {
  useEffect(() => {
    if (!token) return;
    const send = () => apiFetch(`/api/leagues/${code}/heartbeat`, { method: "POST", token }).catch(() => {});
    send();
    const interval = setInterval(send, 20_000);
    return () => clearInterval(interval);
  }, [code, token]);
}

function JoinPrompt({ code, token, onJoined }: { code: string; token: string | null; onJoined: () => void }) {
  async function handleJoin() {
    if (!token) return;
    try {
      await apiFetch(`/api/leagues/${code}/join`, { method: "POST", token });
      onJoined();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante l'iscrizione.");
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <Card className="p-6 max-w-md text-center space-y-3">
        <h1 className="text-xl font-bold">Non fai ancora parte di questa lega</h1>
        <p className="text-sm text-slate-400">Vuoi entrare nella lega con il codice {code}?</p>
        <Button className="w-full" onClick={handleJoin}>
          Entra nella lega
        </Button>
      </Card>
    </main>
  );
}
