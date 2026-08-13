import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Rinomina un partecipante (solo per questa lega: non tocca il profilo
// globale dell'utente, che resta suo).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; participantId: string }> }
) {
  try {
    const { code, participantId } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);

    const { displayName } = await req.json();
    const trimmed = String(displayName || "").trim();
    if (!trimmed) return jsonError(422, "MISSING_NAME");

    const { data: updated, error } = await sb
      .from("participants")
      .update({ display_name: trimmed })
      .eq("id", participantId)
      .eq("league_id", league.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!updated) return jsonError(404, "PARTICIPANT_NOT_FOUND");

    await sb.from("history").insert({
      league_id: league.id,
      event_type: "ADMIN_RENAME_PARTICIPANT",
      payload: { participant_id: participantId, display_name: trimmed },
    });

    return NextResponse.json({ ok: true, participant: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; participantId: string }> }
) {
  try {
    const { code, participantId } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);

    const { count: rosterCount } = await sb
      .from("rosters")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId);
    if (rosterCount && rosterCount > 0) {
      return jsonError(409, "PARTICIPANT_HAS_ROSTER", "Questo partecipante ha già acquistato giocatori: annulla prima le sue aggiudicazioni.");
    }

    // Un partecipante che ha già chiamato un giocatore o inviato
    // un'offerta (anche persa, anche "non partecipo") lascia una riga in
    // bid_rounds/bids che non ha una foreign key a cascata verso
    // participants (per non perdere lo storico se qualcun altro viene
    // rimosso più avanti): eliminarlo comunque darebbe un errore SQL
    // grezzo, quindi lo blocchiamo qui con un messaggio comprensibile.
    const { count: calledOrWonCount } = await sb
      .from("bid_rounds")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .or(`caller_participant_id.eq.${participantId},winner_participant_id.eq.${participantId}`);
    if (calledOrWonCount && calledOrWonCount > 0) {
      return jsonError(409, "PARTICIPANT_HAS_HISTORY", "Questo partecipante ha già chiamato o vinto un'offerta in questa asta: non può più essere rimosso.");
    }
    const { count: bidCount } = await sb
      .from("bids")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId);
    if (bidCount && bidCount > 0) {
      return jsonError(409, "PARTICIPANT_HAS_HISTORY", "Questo partecipante ha già fatto un'offerta in questa asta: non può più essere rimosso.");
    }

    const { data: state } = await sb.from("auction_state").select("current_turn_participant_id").eq("league_id", league.id).maybeSingle();
    if (state?.current_turn_participant_id === participantId) {
      return jsonError(409, "PARTICIPANT_ON_TURN", "Non puoi rimuovere il partecipante mentre è il suo turno.");
    }

    const { data: removed } = await sb.from("participants").select("display_name").eq("id", participantId).maybeSingle();
    await sb.from("participants").delete().eq("id", participantId).eq("league_id", league.id);

    await sb.from("history").insert({
      league_id: league.id,
      event_type: "ADMIN_REMOVE_PARTICIPANT",
      payload: { participant_id: participantId, display_name: removed?.display_name },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
