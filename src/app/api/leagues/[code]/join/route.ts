import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Un utente già registrato e autenticato entra in una lega con il
// codice. Idempotente: se è già iscritto, ritorna semplicemente la sua
// iscrizione esistente invece di errore (utile per un refresh di
// pagina o un secondo tentativo).
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const user = await requireUser(req);
    const sb = supabaseServer();

    const { data: league, error: leagueErr } = await sb
      .from("leagues")
      .select("id, status, num_participants, credits_iniziali")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (leagueErr) throw leagueErr;
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const { data: existing } = await sb
      .from("participants")
      .select("id, is_admin")
      .eq("league_id", league.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ participantId: existing.id, leagueId: league.id, isAdmin: existing.is_admin });
    }

    // Si può entrare finché la lega non è finita o annullata: anche ad
    // asta avviata (o in pausa), purché non sia già stato raggiunto il
    // numero massimo di partecipanti (controllato più sotto).
    if (league.status === "FINISHED" || league.status === "CANCELLED") {
      return jsonError(409, "LEAGUE_NOT_JOINABLE", "Questa lega non accetta più nuovi partecipanti.");
    }

    const { data: profile } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const displayName = profile?.display_name || user.email || "Partecipante";

    const { count } = await sb
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("is_player", true);

    if ((count ?? 0) >= league.num_participants) {
      return jsonError(409, "LEAGUE_FULL", "La lega ha già raggiunto il numero massimo di partecipanti.");
    }

    const { data: maxOrderRow } = await sb
      .from("participants")
      .select("turn_order")
      .eq("league_id", league.id)
      .eq("is_player", true)
      .order("turn_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxOrderRow?.turn_order ?? 0) + 1;

    const { data: participant, error: insErr } = await sb
      .from("participants")
      .insert({
        league_id: league.id,
        display_name: displayName,
        turn_order: nextOrder,
        user_id: user.id,
        is_admin: false,
        is_player: true,
        credits_current: league.credits_iniziali,
      })
      .select()
      .single();

    if (insErr || !participant) throw insErr || new Error("Impossibile aggiungere il partecipante");

    return NextResponse.json({ participantId: participant.id, leagueId: league.id, isAdmin: false });
  } catch (err) {
    return handleRouteError(err);
  }
}
