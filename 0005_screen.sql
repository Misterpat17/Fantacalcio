import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireParticipant } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Info private del partecipante autenticato: la propria offerta (o
// decisione) sul round corrente e l'offerta massima consentita. Questi
// dati non passano MAI dalla tabella `bids` letta via anon key: qui
// usiamo la service_role sul server, ed è l'unico modo per un client di
// conoscere la PROPRIA scelta (mai quella altrui).
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const participant = await requireParticipant(req, league.id);

    const { data: full } = await sb
      .from("participants")
      .select("*")
      .eq("id", participant.id)
      .single();

    const { data: state } = await sb
      .from("auction_state")
      .select("current_round_id, current_player_id, phase")
      .eq("league_id", league.id)
      .maybeSingle();

    let myBid: { decision: string; amount: number | null } | null = null;
    let maxBid: number | null = null;
    let roleAvailable: boolean | null = null;

    if (state?.current_round_id) {
      const { data: bid } = await sb
        .from("bids")
        .select("decision, amount")
        .eq("round_id", state.current_round_id)
        .eq("participant_id", participant.id)
        .maybeSingle();
      myBid = bid || null;

      const { data: maxBidData } = await sb.rpc("fn_calc_max_bid", {
        p_league_id: league.id,
        p_participant_id: participant.id,
      });
      maxBid = maxBidData ?? null;

      if (state.current_player_id) {
        const { data: player } = await sb.from("players").select("ruolo").eq("id", state.current_player_id).maybeSingle();
        if (player) {
          const { data: roleOk } = await sb.rpc("fn_role_slot_available", {
            p_league_id: league.id,
            p_participant_id: participant.id,
            p_ruolo: player.ruolo,
          });
          roleAvailable = roleOk ?? null;
        }
      }
    }

    return NextResponse.json({ participant: full, myBid, maxBid, roleAvailable });
  } catch (err) {
    return handleRouteError(err);
  }
}
