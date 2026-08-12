import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Profilo dell'utente autenticato (indipendente da una lega specifica):
// nome visualizzato e se è l'amministratore globale. Usato per decidere
// cosa mostrare in homepage (es. il link "crea lega") e nel pannello
// admin.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("profiles")
      .select("email, display_name, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) return jsonError(404, "PROFILE_NOT_FOUND");

    return NextResponse.json({
      id: user.id,
      email: data.email,
      displayName: data.display_name,
      isAdmin: data.is_admin,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
