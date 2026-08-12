import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

// Annulla la chiamata/offerta in corso e torna in fase CALLING per lo
// stesso chiamante, senza assegnare il giocatore (utile in caso di
// errore o chiamata sbagliata).
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);
    await callRpc(sb, "fn_admin_reopen_call", { p_league_id: league.id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
