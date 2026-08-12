"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuctionState } from "@/hooks/useAuctionState";
import { useRosters } from "@/hooks/useRosters";
import { usePlayers } from "@/hooks/usePlayers";
import { loadSession, StoredSession } from "@/lib/session";
import { Ruolo } from "@/lib/types";

export default function ClassificaPage({ params }: { params: Promise<{ code: string }> }) {
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

  const { league, participants, leagueId } = useAuctionState(upperCode);
  const { rosters } = useRosters(leagueId);
  const { players } = usePlayers(upperCode, leagueId);

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const rows = useMemo(() => {
    return participants
      .filter((p) => p.is_player)
      .map((p) => {
        const mine = rosters.filter((r) => r.participant_id === p.id);
        const speso = mine.reduce((sum, r) => sum + r.price, 0);
        const counts: Record<Ruolo, number> = { P: 0, D: 0, C: 0, A: 0 };
        mine.forEach((r) => {
          const pl = playersById.get(r.player_id);
          if (pl) counts[pl.ruolo] += 1;
        });
        return { participant: p, speso, counts, totale: mine.length };
      })
      .sort((a, b) => b.totale - a.totale || b.participant.credits_current - a.participant.credits_current);
  }, [participants, rosters, playersById]);

  if (!league) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin={!!session?.isAdmin} displayName={session?.displayName} />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">Classifica</h1>
          <a href={`/api/leagues/${upperCode}/export`}>
            <Button variant="secondary">Esporta in Excel</Button>
          </a>
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="px-4 py-3">Partecipante</th>
                <th className="px-4 py-3 text-right">Crediti</th>
                <th className="px-4 py-3 text-center">P</th>
                <th className="px-4 py-3 text-center">D</th>
                <th className="px-4 py-3 text-center">C</th>
                <th className="px-4 py-3 text-center">A</th>
                <th className="px-4 py-3 text-right">Totale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ participant, counts, totale }) => (
                <tr key={participant.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-semibold">{participant.display_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{participant.credits_current}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{counts.P}/{league.slots_p}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{counts.D}/{league.slots_d}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{counts.C}/{league.slots_c}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{counts.A}/{league.slots_a}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{totale}/{league.roster_size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}
