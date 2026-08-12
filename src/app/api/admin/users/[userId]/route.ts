import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireGlobalAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Rinomina il display_name globale di un utente (visibile ovunque non
// sia stato sovrascritto con un nome specifico per una singola lega).
// Nota: non è possibile cambiare qui il flag is_admin — l'amministratore
// globale è unico ed è impostato manualmente via SQL, per evitare che un
// errore in questo pannello lasci il sistema senza amministratore.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireGlobalAdmin(req);
    const { userId } = await params;
    const { displayName } = await req.json();
    const trimmed = String(displayName || "").trim();
    if (!trimmed) return jsonError(422, "MISSING_NAME");

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError(404, "USER_NOT_FOUND");

    return NextResponse.json({ ok: true, user: data });
  } catch (err) {
    return handleRouteError(err);
  }
}

// Elimina definitivamente un account (Supabase Auth + profilo +
// partecipazioni a qualunque lega, tramite cascade). L'amministratore
// non può eliminare se stesso, per evitare di restare senza accesso.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireGlobalAdmin(req);
    const { userId } = await params;

    if (userId === admin.id) {
      return jsonError(409, "CANNOT_DELETE_SELF", "Non puoi eliminare il tuo stesso account amministratore.");
    }

    const sb = supabaseServer();
    const { error } = await sb.auth.admin.deleteUser(userId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
