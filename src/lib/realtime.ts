"use client";

import { supabaseBrowser } from "./supabaseBrowser";

type ChangeHandler = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}) => void;

// Sottoscrizione Supabase Realtime (Postgres Changes) su una tabella,
// filtrata per league_id. Ritorna una funzione di cleanup.
//
// channelSuffix: necessario quando la STESSA tabella viene sottoscritta
// due volte per la stessa lega da due hook diversi nella stessa pagina
// (es. useAuctionState e useBidRounds sottoscrivono entrambi
// "bid_rounds"): senza un nome di canale distinto, Supabase Realtime
// riceve due "join" per lo stesso topic e una delle due sottoscrizioni
// smette di funzionare silenziosamente (o va in errore) — bug reale
// riscontrato sulla pagina Storico, che usa entrambi gli hook.
export function subscribeLeagueTable(
  table: string,
  leagueId: string,
  onChange: ChangeHandler,
  filterColumn: string = "league_id",
  channelSuffix?: string
): () => void {
  const sb = supabaseBrowser();
  const topic = `${table}:${filterColumn}:${leagueId}${channelSuffix ? `:${channelSuffix}` : ""}`;
  const channel = sb
    .channel(topic)
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
