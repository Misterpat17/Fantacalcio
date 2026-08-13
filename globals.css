"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { subscribeLeagueTable } from "@/lib/realtime";
import { HistoryEvent } from "@/lib/types";

export function useHistoryEvents(leagueId: string | null) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let active = true;
    supabaseBrowser()
      .from("history")
      .select("*")
      .eq("league_id", leagueId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (active) {
          setEvents((data as HistoryEvent[]) || []);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    const unsub = subscribeLeagueTable("history", leagueId, ({ new: row }) => {
      if (!row) return;
      setEvents((prev) => [row as unknown as HistoryEvent, ...prev]);
    });
    return unsub;
  }, [leagueId]);

  return { events, loading };
}
