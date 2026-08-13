import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireParticipant } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

// Fa ripartire il countdown fermato con il gettone del chiamante
// (fn_caller_pause): solo chi ha avviato QUELLA pausa può farla
// ripartire da qui (l'admin può comunque riprendere in qualsiasi
// momento con i suoi pulsanti esistenti, indipendentemente da questo).
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const participant = await requireParticipant(req, league.id);
    await callRpc(sb, "fn_caller_resume", { p_league_id: league.id, p_participant_id: participant.id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
