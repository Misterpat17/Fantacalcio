import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireGlobalAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiResponse";

// Elenco di tutti gli utenti registrati (account reali), indipendente da
// una singola lega. Solo l'amministratore globale può vederlo.
export async function GET(req: NextRequest) {
  try {
    await requireGlobalAdmin(req);
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("profiles")
      .select("id, email, display_name, is_admin, created_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ users: data || [] });
  } catch (err) {
    return handleRouteError(err);
  }
}
