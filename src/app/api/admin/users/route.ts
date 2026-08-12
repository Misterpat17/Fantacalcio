import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireGlobalAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

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

// Crea un nuovo account per conto di qualcuno (non serve che si
// registri da solo): l'admin sceglie email, nome e una password iniziale
// da comunicargli. Usa l'API di amministrazione di Supabase Auth, con
// email già confermata (non serve il link di verifica).
export async function POST(req: NextRequest) {
  try {
    await requireGlobalAdmin(req);
    const { email, password, displayName } = await req.json();

    const trimmedEmail = String(email || "").trim();
    const trimmedName = String(displayName || "").trim();
    if (!trimmedEmail || !trimmedName) return jsonError(422, "MISSING_FIELDS");
    if (!password || String(password).length < 6) {
      return jsonError(422, "WEAK_PASSWORD", "La password deve avere almeno 6 caratteri.");
    }

    const sb = supabaseServer();
    const { data, error } = await sb.auth.admin.createUser({
      email: trimmedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { display_name: trimmedName },
    });

    if (error) {
      if (error.message?.toLowerCase().includes("already been registered")) {
        return jsonError(409, "EMAIL_TAKEN", "Esiste già un account con questa email.");
      }
      throw error;
    }
    if (!data.user) throw new Error("Impossibile creare l'utente");

    return NextResponse.json({ ok: true, userId: data.user.id });
  } catch (err) {
    return handleRouteError(err);
  }
}
