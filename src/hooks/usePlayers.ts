"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { subscribeLeagueTable } from "@/lib/realtime";
import { Player } from "@/lib/types";

export function usePlayers(code: string, leagueId: string | null) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ players: Player[] }>(`/api/leagues/${code}/players`).then((data) => {
      if (active) {
        setPlayers(data.players);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    if (!leagueId) return;
    const unsub = subscribeLeagueTable("players", leagueId, ({ eventType, new: row, old }) => {
      setPlayers((prev) => {
        if (eventType === "DELETE") {
          return prev.filter((p) => p.id !== (old as { id: string })?.id);
        }
        const incoming = row as unknown as Player;
        const idx = prev.findIndex((p) => p.id === incoming.id);
        if (idx === -1) return [...prev, incoming];
        const copy = [...prev];
        copy[idx] = incoming;
        return copy;
      });
    });
    return unsub;
  }, [leagueId]);

  return { players, loading };
}
