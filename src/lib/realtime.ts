"use client";

import { supabaseBrowser } from "./supabaseBrowser";

type ChangeHandler = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}) => void;

// Sottoscrizione Supabase Realtime (Postgres Changes) su una tabella,
// filtrata per league_id. Ritorna una funzione di cleanup.
export function subscribeLeagueTable(
  table: string,
  leagueId: string,
  onChange: ChangeHandler,
  filterColumn: string = "league_id"
): () => void {
  const sb = supabaseBrowser();
  const channel = sb
    .channel(`${table}:${filterColumn}:${leagueId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `${filterColumn}=eq.${leagueId}` },
      (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => {
        onChange(payload);
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
