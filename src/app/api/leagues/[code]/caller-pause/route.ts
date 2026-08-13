import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireParticipant } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

// Gettone personale del chiamante: può fermare il countdown della SUA
// chiamata (fase BIDDING) una sola volta per tutta l'asta. A differenza
// della pausa admin, qui il server verifica anche che chi chiama questa
// route sia davvero il partecipante che ha chiamato il giocatore in
// corso, e che non abbia già usato il gettone in precedenza.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const participant = await requireParticipant(req, league.id);
    await callRpc(sb, "fn_caller_pause", { p_league_id: league.id, p_participant_id: participant.id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
