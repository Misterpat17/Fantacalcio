import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

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
