"use client";

import { use, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/Card";
import { ReportPageHeader } from "@/components/ReportPageHeader";
import { useAuctionState } from "@/hooks/useAuctionState";
import { usePlayers } from "@/hooks/usePlayers";
import { useBidRounds } from "@/hooks/useBidRounds";
import { useMe } from "@/hooks/useMe";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { buildColumnLabels, buildStorico } from "@/lib/reportData";

export default function StoricoPage({ params }: { params: Promise<{ code: string }> }) {
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
  const { players } = usePlayers(upperCode, leagueId);
  const { bidRounds } = useBidRounds(leagueId);

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const participantsById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const playingParticipants = useMemo(() => participants.filter((p) => p.is_player), [participants]);

  const storico = useMemo(() => {
    const labels = buildColumnLabels(playingParticipants);
    return buildStorico(playingParticipants, playersById, participantsById, bidRounds, labels);
  }, [playingParticipants, playersById, participantsById, bidRounds]);

  if (authLoading || !league) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin={!!participant?.is_admin} displayName={participant?.display_name} />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-4">
        <ReportPageHeader code={upperCode} title="Storico" />
        <p className="text-xs text-slate-500 -mt-2">
          Solo i giocatori già aggiudicati. &quot;—&quot; = non partecipo, casella vuota = non ha risposto o non era tra gli aventi diritto.
        </p>

        {storico.rows.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">Nessun giocatore aggiudicato finora.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="px-4 py-3">Giocatore</th>
                  <th className="px-4 py-3">Ruolo</th>
                  <th className="px-4 py-3">Squadra</th>
                  {storico.participantLabels.map((label) => (
                    <th key={label} className="px-3 py-3 text-right">
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3">Vincitore</th>
                  <th className="px-4 py-3 text-right">Prezzo finale</th>
                </tr>
              </thead>
              <tbody>
                {storico.rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-semibold">{r.giocatore}</td>
                    <td className="px-4 py-3 text-slate-400">{r.ruolo}</td>
                    <td className="px-4 py-3 text-slate-400">{r.squadra}</td>
                    {r.offerte.map((v, j) => (
                      <td key={j} className="px-3 py-3 text-right font-mono text-slate-300">
                        {v === "—" ? <span className="text-slate-600">—</span> : v}
                      </td>
                    ))}
                    <td className="px-4 py-3 font-semibold text-emerald-400">{r.vincitore}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{r.prezzoFinale}</td>
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
