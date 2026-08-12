import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Client "amministrativo" usato SOLO lato server (API route). Usa la
// service_role key: bypassa la RLS, quindi non deve MAI essere importato
// in un componente client ("use client") né esposto al browser.
let _client: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Variabili d'ambiente mancanti: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatorie sul server."
    );
  }

  _client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}
