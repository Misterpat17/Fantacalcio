"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { subscribeLeagueTable } from "@/lib/realtime";
import { ReportBidRound } from "@/lib/reportData";

// Storico completo di TUTTI i round dell'asta (non solo quello
// corrente): serve per costruire a schermo il foglio "Storico" (vedi
// src/lib/reportData.ts). Pubblico via RLS ("public read bid_rounds"),
// gli importi (revealed_bids/winner_amount) sono presenti solo per i
// round già risolti — mai per un round ancora aperto.
export function useBidRounds(leagueId: string | null) {
  const [bidRounds, setBidRounds] = useState<ReportBidRound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let active = true;
    supabaseBrowser()
      .from("bid_rounds")
      .select("id, player_id, round_number, status, revealed_bids, winner_participant_id, winner_amount, created_at")
      .eq("league_id", leagueId)
      .order("round_number", { ascending: true })
      .then(({ data }) => {
        if (active) {
          setBidRounds((data as unknown as ReportBidRound[]) || []);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    const unsub = subscribeLeagueTable("bid_rounds", leagueId, ({ eventType, new: row, old }) => {
      setBidRounds((prev) => {
        if (eventType === "DELETE") {
          return prev.filter((r) => r.id !== (old as { id: string })?.id);
        }
        const incoming = row as unknown as ReportBidRound;
        const idx = prev.findIndex((r) => r.id === incoming.id);
        if (idx === -1) return [...prev, incoming];
        const copy = [...prev];
        copy[idx] = incoming;
        return copy;
      });
    });
    return unsub;
  }, [leagueId]);

  return { bidRounds, loading };
}
