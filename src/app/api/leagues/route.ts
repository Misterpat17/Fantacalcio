import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabaseServer";
import { generateToken, hashToken } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

function randomCode(name: string): string {
  const base = (name || "LEGA")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base || "LEGA"}${suffix}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      adminDisplayName,
      adminPassword,
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
    if (!adminDisplayName || typeof adminDisplayName !== "string") return jsonError(422, "MISSING_ADMIN_NAME");
    if (!adminPassword || String(adminPassword).length < 4) return jsonError(422, "WEAK_ADMIN_PASSWORD", "La password admin deve avere almeno 4 caratteri");

    const sb = supabaseServer();
    const passwordHash = await bcrypt.hash(String(adminPassword), 10);

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
        admin_password_hash: passwordHash,
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

    const token = generateToken();
    const { data: admin, error: adminErr } = await sb
      .from("participants")
      .insert({
        league_id: league.id,
        display_name: adminDisplayName,
        turn_order: adminPlays ? 1 : null,
        token_hash: hashToken(token),
        is_admin: true,
        is_player: !!adminPlays,
        credits_current: adminPlays ? creditsIniziali : 0,
      })
      .select()
      .single();

    if (adminErr || !admin) throw adminErr || new Error("Impossibile creare l'admin");

    return NextResponse.json({
      code: league.code,
      leagueId: league.id,
      token,
      participantId: admin.id,
      isAdmin: true,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
