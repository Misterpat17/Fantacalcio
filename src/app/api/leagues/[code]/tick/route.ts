import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const { data: state } = await sb
      .from("auction_state")
      .select("phase, current_round_id")
      .eq("league_id", league.id)
      .maybeSingle();

    if (!state || !["BIDDING", "TIE_BREAK"].includes(state.phase) || !state.current_round_id) {
      return NextResponse.json({ noop: true });
    }

    const { data: round } = await sb
      .from("bid_rounds")
      .select("id, status, ends_at, decision_deadline_at")
      .eq("id", state.current_round_id)
      .maybeSingle();

    if (!round || round.status !== "OPEN") {
      return NextResponse.json({ noop: true });
    }

    if (!round.ends_at) {
      if (new Date(round.decision_deadline_at).getTime() > Date.now()) {
        return NextResponse.json({ noop: true });
      }
      const { data, error } = await sb.rpc("fn_force_start_timer", { p_round_id: round.id });
      if (error) throw error;
      return NextResponse.json({ noop: false, result: data });
    }

    if (new Date(round.ends_at).getTime() > Date.now()) {
      return NextResponse.json({ noop: true });
    }

    const { data, error } = await sb.rpc("fn_resolve_round", { p_round_id: round.id });
    if (error) throw error;

    return NextResponse.json({ noop: false, result: data });
  } catch (err) {
    return handleRouteError(err);
  }
}
