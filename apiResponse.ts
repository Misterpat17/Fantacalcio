import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Info pubbliche della lega (nessun campo sensibile) + elenco partecipanti
// (per la schermata di ingresso: quanti posti sono già occupati).
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league, error } = await sb
      .from("leagues")
      .select(
        "id, code, name, num_participants, credits_iniziali, roster_size, slots_p, slots_d, slots_c, slots_a, min_credit_per_slot, timer_seconds, tiebreak_seconds, tiebreak_rule, pass_limit, status"
      )
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (error) throw error;
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const { data: participants } = await sb
      .from("participants")
      .select("id, display_name, turn_order, is_admin, is_player, credits_current, connected")
      .eq("league_id", league.id)
      .order("turn_order", { ascending: true, nullsFirst: false });

    return NextResponse.json({ league, participants: participants || [] });
  } catch (err) {
    return handleRouteError(err);
  }
}

// Elimina definitivamente una lega (e, per cascata, tutti i suoi
// partecipanti/giocatori/round/rose/storico: tutte le foreign key su
// leagues(id) sono "on delete cascade", vedi 0001_init.sql). Riservata
// all'admin di quella specifica lega, richiesta dalla sezione "Le tue
// leghe" della home.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb
      .from("leagues")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);

    const { error } = await sb.from("leagues").delete().eq("id", league.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
