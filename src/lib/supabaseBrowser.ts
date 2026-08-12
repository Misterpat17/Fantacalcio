"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Client "pubblico" usato nel browser: usa la anon key, che ha accesso in
// SOLA LETTURA alle tabelle non sensibili (players, participants,
// auction_state, bid_rounds, rosters, history) grazie alle policy RLS.
// Non ha alcun accesso alla tabella `bids` né a `profiles` (nessuna
// policy = deny-all) e non può leggere `leagues`.
//
// È anche il client usato per l'autenticazione reale (Supabase Auth):
// registrazione, login, e gestione della sessione. A differenza della
// versione precedente, qui la sessione va PERSISTITA (persistSession) e
// rinnovata automaticamente (autoRefreshToken), perché ora è la vera
// identità dell'utente — non più un semplice token per-lega.
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
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  return _client;
}
