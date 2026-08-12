"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { CallStage } from "@/components/CallStage";
import { PlayersList } from "@/components/PlayersList";
import { ParticipantsSidebar } from "@/components/ParticipantsSidebar";
import { Card } from "@/components/ui/Card";
import { useAuctionState } from "@/hooks/useAuctionState";
import { usePlayers } from "@/hooks/usePlayers";
import { useRosters } from "@/hooks/useRosters";
import { useServerClock } from "@/hooks/useServerClock";
import { useTicker } from "@/hooks/useTicker";
import { useMe } from "@/hooks/useMe";
import { loadSession, StoredSession } from "@/lib/session";
import { apiFetch } from "@/lib/apiClient";

export default function DashboardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    const s = loadSession(upperCode);
    if (!s) {
      router.replace("/");
      return;
    }
    setSession(s);
  }, [upperCode, router]);

  const { league, state, participants, currentPlayer, currentRound, leagueId, refreshAll, refreshLeague } =
    useAuctionState(upperCode);
  const { players } = usePlayers(upperCode, leagueId);
  const { rosters } = useRosters(leagueId);
  const { now } = useServerClock();
  const { data: meData, refresh: refreshMe } = useMe(upperCode, session?.token ?? null, currentRound?.id);

  const activeTimer = state?.phase === "BIDDING" || state?.phase === "TIE_BREAK";
  const onResolved = useCallback(() => {
    refreshAll();
    refreshMe();
  }, [refreshAll, refreshMe]);
  useTicker(upperCode, activeTimer, onResolved);

  // Heartbeat: segnala che sono online (mostrato agli altri partecipanti).
  useEffect(() => {
    if (!session?.token) return;
    const send = () => apiFetch(`/api/leagues/${upperCode}/heartbeat`, { method: "POST", token: session.token }).catch(() => {});
    send();
    const interval = setInterval(send, 20_000);
    return () => clearInterval(interval);
  }, [upperCode, session?.token]);

  if (session === undefined || !league || !state) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento asta...</main>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin={!!session?.isAdmin} displayName={session?.displayName} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <CallStage
            code={upperCode}
            token={session?.token ?? null}
            myParticipantId={session?.participantId ?? null}
            isAdmin={!!session?.isAdmin}
            state={state}
            currentPlayer={currentPlayer}
            currentRound={currentRound}
            participants={participants}
            players={players}
            now={now}
            me={meData ? { myBid: meData.myBid, maxBid: meData.maxBid, roleAvailable: meData.roleAvailable } : null}
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
            myParticipantId={session?.participantId ?? null}
          />
        </div>
      </main>
    </div>
  );
}
