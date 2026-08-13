import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

// Assegnazione manuale di un giocatore (bypassa la fase d'asta).
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);
    const { participantId, playerId, price } = await req.json();
    if (!participantId || !playerId || price === undefined) return jsonError(422, "MISSING_FIELDS");

    await callRpc(sb, "fn_admin_assign_player", {
      p_league_id: league.id,
      p_participant_id: participantId,
      p_player_id: playerId,
      p_price: Math.trunc(Number(price)),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
