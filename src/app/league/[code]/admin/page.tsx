"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { Card } from "@/components/ui/Card";
import { useAuctionState } from "@/hooks/useAuctionState";
import { usePlayers } from "@/hooks/usePlayers";
import { useRosters } from "@/hooks/useRosters";
import { useMe } from "@/hooks/useMe";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

export default function AdminPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();
  const { loading: authLoading, user, token } = useSupabaseAuth();

  const { league, state, participants, leagueId, refreshAll, refreshLeague } = useAuctionState(upperCode);
  const { players } = usePlayers(upperCode, leagueId);
  const { rosters } = useRosters(leagueId);
  const { data: meData, error: meError } = useMe(upperCode, token, null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  if (meError?.code === "NOT_A_PARTICIPANT") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="p-6 max-w-md text-center space-y-2">
          <h1 className="text-xl font-bold text-rose-400">Non fai parte di questa lega</h1>
          <p className="text-sm text-slate-400">Entra prima nella lega dalla home con il codice, poi torna qui.</p>
        </Card>
      </main>
    );
  }

  const participant = meData?.participant ?? null;

  if (participant && !participant.is_admin) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="p-6 max-w-md text-center space-y-2">
          <h1 className="text-xl font-bold text-rose-400">Accesso riservato</h1>
          <p className="text-sm text-slate-400">Non sei l&apos;amministratore di questa lega.</p>
        </Card>
      </main>
    );
  }

  if (!league || !state || !participant) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin displayName={participant.display_name} />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <h1 className="text-2xl font-black mb-5">Pannello amministratore</h1>
        <AdminPanel
          code={upperCode}
          token={token}
          league={league}
          state={state}
          participants={participants}
          players={players}
          rosters={rosters}
          onRefresh={() => {
            refreshAll();
            refreshLeague();
          }}
        />
      </main>
    </div>
  );
}
