import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Avvia l'asta: passa la lega da SETUP a RUNNING e imposta il turno sul
// primo partecipante (per turn_order). Richiede almeno un partecipante
// giocante e almeno un giocatore importato.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id, status").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);

    if (league.status !== "SETUP") return jsonError(409, "ALREADY_STARTED");

    const { data: first } = await sb
      .from("participants")
      .select("id")
      .eq("league_id", league.id)
      .eq("is_player", true)
      .order("turn_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!first) return jsonError(409, "NO_PARTICIPANTS", "Nessun partecipante giocante iscritto");

    const { count } = await sb
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("stato", "available");

    if (!count) return jsonError(409, "NO_PLAYERS", "Importa prima l'elenco giocatori");

    await sb.from("leagues").update({ status: "RUNNING", updated_at: new Date().toISOString() }).eq("id", league.id);
    await sb
      .from("auction_state")
      .update({
        phase: "CALLING",
        current_turn_participant_id: first.id,
        current_player_id: null,
        current_caller_participant_id: null,
        current_round_id: null,
        phase_end_at: null,
      })
      .eq("league_id", league.id);

    await sb.from("history").insert({ league_id: league.id, event_type: "AUCTION_STARTED", payload: {} });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
