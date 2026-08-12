import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);
    const { rosterId, newPrice } = await req.json();
    if (!rosterId || newPrice === undefined) return jsonError(422, "MISSING_FIELDS");

    await callRpc(sb, "fn_admin_correct_price", {
      p_league_id: league.id,
      p_roster_id: rosterId,
      p_new_price: Math.trunc(Number(newPrice)),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
