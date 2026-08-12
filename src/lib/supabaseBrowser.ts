"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Client "pubblico" usato nel browser: usa la anon key, che ha accesso in
// SOLA LETTURA alle tabelle non sensibili (players, participants,
// auction_state, bid_rounds, rosters, history) grazie alle policy RLS.
// Non ha alcun accesso alla tabella `bids` (nessuna policy = deny-all) e
// non può leggere `leagues` (contiene l'hash della password admin).
let _client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Variabili d'ambiente mancanti: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  _client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}
