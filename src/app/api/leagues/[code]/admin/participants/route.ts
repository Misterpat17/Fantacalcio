import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { generateToken, hashToken } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Aggiunta manuale di un partecipante da parte dell'admin (funziona
// anche a lega piena o già avviata, a differenza del join self-service).
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb
      .from("leagues")
      .select("id, credits_iniziali")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);
    const { displayName, isPlayer = true } = await req.json();
    if (!displayName || !String(displayName).trim()) return jsonError(422, "MISSING_NAME");

    const trimmed = String(displayName).trim();
    const { data: existing } = await sb
      .from("participants")
      .select("id")
      .eq("league_id", league.id)
      .ilike("display_name", trimmed)
      .maybeSingle();
    if (existing) return jsonError(409, "NAME_TAKEN");

    let nextOrder: number | null = null;
    if (isPlayer) {
      const { data: maxOrderRow } = await sb
        .from("participants")
        .select("turn_order")
        .eq("league_id", league.id)
        .eq("is_player", true)
        .order("turn_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextOrder = (maxOrderRow?.turn_order ?? 0) + 1;
    }

    const token = generateToken();
    const { data: participant, error } = await sb
      .from("participants")
      .insert({
        league_id: league.id,
        display_name: trimmed,
        turn_order: nextOrder,
        token_hash: hashToken(token),
        is_admin: false,
        is_player: !!isPlayer,
        credits_current: isPlayer ? league.credits_iniziali : 0,
      })
      .select()
      .single();

    if (error || !participant) throw error || new Error("Impossibile aggiungere il partecipante");

    await sb.from("history").insert({
      league_id: league.id,
      event_type: "ADMIN_ADD_PARTICIPANT",
      payload: { participant_id: participant.id, display_name: trimmed },
    });

    // Il token va comunicato manualmente al partecipante (es. condiviso
    // dall'admin) perché possa accedere dal proprio dispositivo.
    return NextResponse.json({ ok: true, participant, token });
  } catch (err) {
    return handleRouteError(err);
  }
}
