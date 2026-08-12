import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireParticipant } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const participant = await requireParticipant(req, league.id);
    await callRpc(sb, "fn_pass_turn", { p_league_id: league.id, p_participant_id: participant.id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
