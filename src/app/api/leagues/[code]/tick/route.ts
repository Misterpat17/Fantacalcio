import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Non esiste un processo server persistente in un'infrastruttura
// serverless (Vercel): il "tick" è la fonte di verità per far avanzare
// l'asta. Ogni client connesso invia questa richiesta ~1 volta al
// secondo mentre un round è aperto. Un round attraversa due fasi:
//
// 1. Attesa decisioni (bid_rounds.ends_at IS NULL): nessun countdown
//    visibile, in attesa che tutti gli aventi diritto rispondano
//    partecipo/non partecipo. Se scade `decision_deadline_at` (scadenza
//    di sicurezza) prima che tutti abbiano risposto, fn_force_start_timer
//    considera "non partecipo" chi manca e avvia il countdown comunque.
// 2. Countdown attivo (ends_at impostato): alla scadenza, fn_resolve_round
//    chiude il round e assegna il giocatore.
//
// Entrambe le funzioni sono protette da un lock di riga (`for update` sul
// round) quindi sono sicure anche se più client arrivano nello stesso
// istante: solo la prima transazione agisce, le altre trovano lo stato
// già cambiato e non fanno nulla.
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
      // Fase 1: nessun countdown ancora. Agiamo solo se è scaduta la
      // scadenza di sicurezza per l'attesa delle decisioni.
      if (new Date(round.decision_deadline_at).getTime() > Date.now()) {
        return NextResponse.json({ noop: true });
      }
      const { data, error } = await sb.rpc("fn_force_start_timer", { p_round_id: round.id });
      if (error) throw error;
      return NextResponse.json({ noop: false, result: data });
    }

    // Fase 2: countdown attivo.
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
