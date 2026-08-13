"use client";

import { Fragment, use, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/Card";
import { ReportPageHeader } from "@/components/ReportPageHeader";
import { useAuctionState } from "@/hooks/useAuctionState";
import { useRosters } from "@/hooks/useRosters";
import { usePlayers } from "@/hooks/usePlayers";
import { useMe } from "@/hooks/useMe";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { buildBudget, buildColumnLabels } from "@/lib/reportData";

export default function BudgetPage({ params }: { params: Promise<{ code: string }> }) {
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
  const playingParticipants = useMemo(() => participants.filter((p) => p.is_player), [participants]);

  const budget = useMemo(() => {
    if (!league) return null;
    const labels = buildColumnLabels(playingParticipants);
    return buildBudget(league, playingParticipants, rosters, playersById, labels);
  }, [league, playingParticipants, rosters, playersById]);

  if (authLoading || !league) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin={!!participant?.is_admin} displayName={participant?.display_name} />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-4">
        <ReportPageHeader code={upperCode} title="Budget" />

        {!budget || budget.participantIds.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">Nessun partecipante con rosa in questa lega.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="px-4 py-3"></th>
                  {budget.participantLabels.map((label) => (
                    <th key={label} className="px-4 py-3 text-left">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/60">
                  <td className="px-4 py-2 text-slate-400">Crediti iniziali</td>
                  {budget.creditiIniziali.map((v, i) => (
                    <td key={i} className="px-4 py-2">
                      {v}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td className="px-4 py-2 text-slate-400">Crediti spesi</td>
                  {budget.creditiSpesi.map((v, i) => (
                    <td key={i} className="px-4 py-2">
                      {v}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="px-4 py-2 text-slate-400 font-semibold">Crediti rimanenti</td>
                  {budget.creditiRimanenti.map((v, i) => (
                    <td key={i} className="px-4 py-2 font-semibold text-emerald-400">
                      {v}
                    </td>
                  ))}
                </tr>

                {budget.blocks.map((block) => (
                  <Fragment key={block.label}>
                    <tr>
                      <td colSpan={budget.participantLabels.length + 1} className="px-4 pt-4 pb-1 text-xs font-bold text-slate-500 uppercase tracking-wide">
                        {block.label} (x{block.slots})
                      </td>
                    </tr>
                    {block.rows.map((row, i) => (
                      <tr key={`${block.label}-${i}`} className="border-b border-slate-800/40 hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">
                          {block.ruolo}
                          {i + 1}
                        </td>
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-2 text-slate-200">
                            {cell || <span className="text-slate-600">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
