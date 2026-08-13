import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

// Modifica l'ordine dei turni. Riceve l'elenco COMPLETO degli id dei
// partecipanti giocanti nel nuovo ordine desiderato.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);
    const { orderedParticipantIds } = await req.json();
    if (!Array.isArray(orderedParticipantIds) || orderedParticipantIds.length === 0) {
      return jsonError(422, "MISSING_ORDER");
    }

    await callRpc(sb, "fn_admin_reorder", {
      p_league_id: league.id,
      p_ordered_ids: orderedParticipantIds,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
