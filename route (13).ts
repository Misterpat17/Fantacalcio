import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireGlobalAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Modifica un utente: nome visualizzato, email e/o password (tutti
// opzionali, si aggiorna solo quello che viene passato). Nota: non è
// possibile cambiare qui il flag is_admin — l'amministratore globale è
// unico ed è impostato manualmente via SQL, per evitare che un errore in
// questo pannello lasci il sistema senza amministratore.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireGlobalAdmin(req);
    const { userId } = await params;
    const { displayName, email, password } = await req.json();
    const sb = supabaseServer();

    if (email || password) {
      const authUpdate: { email?: string; password?: string } = {};
      if (email) authUpdate.email = String(email).trim();
      if (password) {
        if (String(password).length < 6) {
          return jsonError(422, "WEAK_PASSWORD", "La password deve avere almeno 6 caratteri.");
        }
        authUpdate.password = String(password);
      }
      const { error: authErr } = await sb.auth.admin.updateUserById(userId, authUpdate);
      if (authErr) throw authErr;
    }

    const profileUpdate: { display_name?: string; email?: string } = {};
    if (displayName) profileUpdate.display_name = String(displayName).trim();
    if (email) profileUpdate.email = String(email).trim();

    let data = null;
    if (Object.keys(profileUpdate).length > 0) {
      const { data: updated, error } = await sb.from("profiles").update(profileUpdate).eq("id", userId).select().maybeSingle();
      if (error) throw error;
      data = updated;
    } else {
      const { data: existing } = await sb.from("profiles").select().eq("id", userId).maybeSingle();
      data = existing;
    }

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
