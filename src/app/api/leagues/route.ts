import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireGlobalAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

function randomCode(name: string): string {
  const base = (name || "LEGA")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base || "LEGA"}${suffix}`;
}

// Solo l'amministratore globale (un unico account, profiles.is_admin)
// può creare una nuova lega: non serve più una password admin per lega,
// l'identità è già garantita dall'account autenticato.
export async function POST(req: NextRequest) {
  try {
    const admin = await requireGlobalAdmin(req);

    const body = await req.json();
    const {
      name,
      numParticipants = 8,
      creditsIniziali = 1000,
      rosterSize = 25,
      slots = { P: 3, D: 8, C: 8, A: 6 },
      timerSeconds = 30,
      tiebreakSeconds = 15,
      tiebreakRule = "min_increment_1",
      passLimit = null,
      minCreditPerSlot = 1,
      adminPlays = true,
    } = body || {};

    if (!name || typeof name !== "string") return jsonError(422, "MISSING_NAME");

    const sb = supabaseServer();

    let code = randomCode(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await sb.from("leagues").select("id").eq("code", code).maybeSingle();
      if (!existing) break;
      code = randomCode(name);
    }

    const { data: league, error: leagueErr } = await sb
      .from("leagues")
      .insert({
        code,
        name,
        created_by: admin.id,
        num_participants: numParticipants,
        credits_iniziali: creditsIniziali,
        roster_size: rosterSize,
        slots_p: slots.P ?? 3,
        slots_d: slots.D ?? 8,
        slots_c: slots.C ?? 8,
        slots_a: slots.A ?? 6,
        min_credit_per_slot: minCreditPerSlot,
        timer_seconds: timerSeconds,
        tiebreak_seconds: tiebreakSeconds,
        tiebreak_rule: tiebreakRule,
        pass_limit: passLimit,
        status: "SETUP",
      })
      .select()
      .single();

    if (leagueErr || !league) throw leagueErr || new Error("Impossibile creare la lega");

    await sb.from("auction_state").insert({ league_id: league.id, phase: "WAITING" });

    const { data: adminParticipant, error: adminErr } = await sb
      .from("participants")
      .insert({
        league_id: league.id,
        display_name: admin.displayName,
        turn_order: adminPlays ? 1 : null,
        user_id: admin.id,
        is_admin: true,
        is_player: !!adminPlays,
        credits_current: adminPlays ? creditsIniziali : 0,
      })
      .select()
      .single();

    if (adminErr || !adminParticipant) throw adminErr || new Error("Impossibile creare l'admin");

    return NextResponse.json({
      code: league.code,
      leagueId: league.id,
      participantId: adminParticipant.id,
      isAdmin: true,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
