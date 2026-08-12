import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Non esiste un processo server persistente in un'infrastruttura
// serverless (Vercel): il "tick" è la fonte di verità per chiudere un
// round scaduto. Ogni client connesso invia questa richiesta ~1 volta al
// secondo mentre il timer è attivo; chi arriva DOPO la scadenza scatena
// la risoluzione. fn_resolve_round è protetta da un lock di riga
// (`for update` sul round) quindi è sicura anche se più client la
// chiamano nello stesso istante: solo la prima transazione risolve,
// le altre trovano lo stato già cambiato e non fanno nulla.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const { data: state } = await sb
      .from("auction_state")
      .select("phase, current_round_id, phase_end_at")
      .eq("league_id", league.id)
      .maybeSingle();

    if (!state || !["BIDDING", "TIE_BREAK"].includes(state.phase) || !state.current_round_id) {
      return NextResponse.json({ noop: true });
    }
    if (!state.phase_end_at || new Date(state.phase_end_at).getTime() > Date.now()) {
      return NextResponse.json({ noop: true });
    }

    const { data, error } = await sb.rpc("fn_resolve_round", { p_round_id: state.current_round_id });
    if (error) throw error;

    return NextResponse.json({ noop: false, result: data });
  } catch (err) {
    return handleRouteError(err);
  }
}
