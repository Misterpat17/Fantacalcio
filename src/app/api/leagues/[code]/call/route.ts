import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireParticipant } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

// Solo il partecipante di turno può chiamare un giocatore ancora
// disponibile: fn_call_player verifica tutto lato server (turno, stato
// del giocatore, slot di ruolo) dentro un'unica transazione.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const participant = await requireParticipant(req, league.id);
    const { playerId } = await req.json();
    if (!playerId) return jsonError(422, "MISSING_PLAYER_ID");

    const round = await callRpc(sb, "fn_call_player", {
      p_league_id: league.id,
      p_caller_participant_id: participant.id,
      p_player_id: playerId,
    });

    return NextResponse.json({ ok: true, round });
  } catch (err) {
    return handleRouteError(err);
  }
}
