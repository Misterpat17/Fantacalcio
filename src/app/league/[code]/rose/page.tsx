"use client";

import { use, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/Card";
import { ReportPageHeader } from "@/components/ReportPageHeader";
import { useAuctionState } from "@/hooks/useAuctionState";
import { useRosters } from "@/hooks/useRosters";
import { usePlayers } from "@/hooks/usePlayers";
import { useMe } from "@/hooks/useMe";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { buildRose } from "@/lib/reportData";

export default function RosePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();
  const { loading: authLoading, user, token } = useSupabaseAuth();
  const { data: meData } = useMe(upperCode, token, null);
  const participant = meData?.participant ?? null;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const { league, participants, leagueId } = useAuctionState(upperCode);
  const { rosters } = useRosters(leagueId);
  const { players } = usePlayers(upperCode, leagueId);

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const participantsById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  const roseRows = useMemo(
    () => buildRose(rosters, participantsById, playersById),
    [rosters, participantsById, playersById]
  );

  if (authLoading || !league) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin={!!participant?.is_admin} displayName={participant?.display_name} />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-4">
        <ReportPageHeader code={upperCode} title="Rose" />

        {roseRows.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">Nessun giocatore acquistato finora.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="px-4 py-3">Partecipante</th>
                  <th className="px-4 py-3">Ruolo</th>
                  <th className="px-4 py-3">Giocatore</th>
                  <th className="px-4 py-3">Squadra</th>
                  <th className="px-4 py-3 text-right">Prezzo</th>
                </tr>
              </thead>
              <tbody>
                {roseRows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-semibold">{r.Partecipante}</td>
                    <td className="px-4 py-3 text-slate-400">{r.Ruolo}</td>
                    <td className="px-4 py-3">{r.Giocatore}</td>
                    <td className="px-4 py-3 text-slate-400">{r.Squadra}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.Prezzo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
