import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireParticipant } from "@/lib/auth";
import { callRpc, handleRouteError, jsonError } from "@/lib/apiResponse";

// Offerta a busta chiusa. La riga finisce nella tabella `bids`, che non
// ha alcuna policy RLS: nessun altro client (nemmeno via Realtime) può
// leggerla prima della rivelazione. L'offerta è modificabile chiamando
// di nuovo questa route fino alla scadenza del round (fn_submit_bid lo
// verifica lato server con un lock di riga, quindi non può mai
// accettare/aggiornare un'offerta dopo la chiusura).
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const participant = await requireParticipant(req, league.id);
    const { roundId, decision, amount } = await req.json();

    if (!roundId || !decision) return jsonError(422, "MISSING_FIELDS");
    if (decision !== "partecipo" && decision !== "non_partecipo") return jsonError(422, "INVALID_DECISION");

    const result = await callRpc<{ ok: boolean; max_bid: number }>(sb, "fn_submit_bid", {
      p_round_id: roundId,
      p_participant_id: participant.id,
      p_decision: decision,
      p_amount: decision === "partecipo" ? Math.trunc(Number(amount)) : null,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
