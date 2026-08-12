"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { subscribeLeagueTable } from "@/lib/realtime";
import { RosterEntry } from "@/lib/types";

export function useRosters(leagueId: string | null) {
  const [rosters, setRosters] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let active = true;
    supabaseBrowser()
      .from("rosters")
      .select("*")
      .eq("league_id", leagueId)
      .then(({ data }) => {
        if (active) {
          setRosters((data as RosterEntry[]) || []);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    const unsub = subscribeLeagueTable("rosters", leagueId, ({ eventType, new: row, old }) => {
      setRosters((prev) => {
        if (eventType === "DELETE") {
          return prev.filter((r) => r.id !== (old as { id: string })?.id);
        }
        const incoming = row as unknown as RosterEntry;
        const idx = prev.findIndex((r) => r.id === incoming.id);
        if (idx === -1) return [...prev, incoming];
        const copy = [...prev];
        copy[idx] = incoming;
        return copy;
      });
    });
    return unsub;
  }, [leagueId]);

  return { rosters, loading };
}
