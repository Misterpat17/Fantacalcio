import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { generateToken, hashToken } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { displayName } = await req.json();

    if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
      return jsonError(422, "MISSING_NAME");
    }

    const sb = supabaseServer();
    const { data: league, error: leagueErr } = await sb
      .from("leagues")
      .select("id, status, num_participants, credits_iniziali")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (leagueErr) throw leagueErr;
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");
    if (league.status !== "SETUP") {
      return jsonError(409, "LEAGUE_NOT_JOINABLE", "L'asta è già iniziata: chiedi all'admin di aggiungerti manualmente.");
    }

    const trimmed = displayName.trim();

    const { data: existing } = await sb
      .from("participants")
      .select("id")
      .eq("league_id", league.id)
      .ilike("display_name", trimmed)
      .maybeSingle();

    if (existing) {
      return jsonError(409, "NAME_TAKEN", "Questo nome è già stato usato in questa lega. Se sei tu, usa il dispositivo con cui ti sei iscritto.");
    }

    const { count } = await sb
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("is_player", true);

    if ((count ?? 0) >= league.num_participants) {
      return jsonError(409, "LEAGUE_FULL", "La lega ha già raggiunto il numero massimo di partecipanti.");
    }

    const { data: maxOrderRow } = await sb
      .from("participants")
      .select("turn_order")
      .eq("league_id", league.id)
      .eq("is_player", true)
      .order("turn_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxOrderRow?.turn_order ?? 0) + 1;
    const token = generateToken();

    const { data: participant, error: insErr } = await sb
      .from("participants")
      .insert({
        league_id: league.id,
        display_name: trimmed,
        turn_order: nextOrder,
        token_hash: hashToken(token),
        is_admin: false,
        is_player: true,
        credits_current: league.credits_iniziali,
      })
      .select()
      .single();

    if (insErr || !participant) throw insErr || new Error("Impossibile aggiungere il partecipante");

    return NextResponse.json({
      token,
      participantId: participant.id,
      leagueId: league.id,
      isAdmin: false,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
