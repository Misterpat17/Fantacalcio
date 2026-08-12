"use client";

import { use, useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { useAuctionState } from "@/hooks/useAuctionState";
import { usePlayers } from "@/hooks/usePlayers";
import { useRosters } from "@/hooks/useRosters";
import { loadSession, StoredSession } from "@/lib/session";

export default function AdminPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSession(loadSession(upperCode));
    setChecked(true);
  }, [upperCode]);

  const { league, state, participants, leagueId, refreshAll, refreshLeague } = useAuctionState(upperCode);
  const { players } = usePlayers(upperCode, leagueId);
  const { rosters } = useRosters(leagueId);

  if (!checked) return null;

  if (!session || !session.isAdmin) {
    return (
      <AdminLogin
        code={upperCode}
        onLoggedIn={() => setSession(loadSession(upperCode))}
      />
    );
  }

  if (!league || !state) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin displayName={session.displayName} />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <h1 className="text-2xl font-black mb-5">Pannello amministratore</h1>
        <AdminPanel
          code={upperCode}
          token={session.token}
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
