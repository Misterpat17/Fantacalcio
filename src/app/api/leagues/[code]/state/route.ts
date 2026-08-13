import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Snapshot pubblico consolidato, usato al primo caricamento (prima che
// la sottoscrizione Realtime sia attiva) e come fallback in caso di
// riconnessione.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb
      .from("leagues")
      .select(
        "id, code, name, num_participants, credits_iniziali, roster_size, slots_p, slots_d, slots_c, slots_a, min_credit_per_slot, timer_seconds, tiebreak_seconds, tiebreak_rule, pass_limit, status"
      )
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const [{ data: state }, { data: participants }, { data: round }] = await Promise.all([
      sb.from("auction_state").select("*").eq("league_id", league.id).maybeSingle(),
      sb
        .from("participants")
        .select("id, display_name, turn_order, is_admin, is_player, credits_current, consecutive_passes, connected, last_seen")
        .eq("league_id", league.id)
        .order("turn_order", { ascending: true, nullsFirst: false }),
      Promise.resolve({ data: null as null }),
    ]);

    let currentPlayer = null;
    let currentRound = null;
    if (state?.current_player_id) {
      const { data } = await sb.from("players").select("*").eq("id", state.current_player_id).maybeSingle();
      currentPlayer = data;
    }
    if (state?.current_round_id) {
      const { data } = await sb
        .from("bid_rounds")
        .select("id, round_number, eligible_participant_ids, participating_participant_ids, declined_participant_ids, started_at, ends_at, status, responded_count, participating_count, winner_participant_id, winner_amount, revealed_bids")
        .eq("id", state.current_round_id)
        .maybeSingle();
      currentRound = data;
    }
    void round;

    return NextResponse.json({
      league,
      state,
      participants: participants || [],
      currentPlayer,
      currentRound,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
