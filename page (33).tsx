import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

const MUTABLE_FIELDS = [
  "timer_seconds",
  "tiebreak_seconds",
  "tiebreak_rule",
  "pass_limit",
  "min_credit_per_slot",
] as const;

// Aggiorna le impostazioni "sicure" da modificare anche ad asta in corso.
// `leagues` non è realtime (non leggibile da anon): dopo l'update
// scriviamo un evento in `history` (che è realtime) così i client sanno
// di dover ricaricare le info di lega via GET /api/leagues/[code].
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    for (const field of MUTABLE_FIELDS) {
      if (body[field] !== undefined) patch[field] = body[field];
    }
    if (Object.keys(patch).length === 0) return jsonError(422, "NO_FIELDS");

    patch.updated_at = new Date().toISOString();
    const { error } = await sb.from("leagues").update(patch).eq("id", league.id);
    if (error) throw error;

    await sb.from("history").insert({
      league_id: league.id,
      event_type: "ADMIN_SETTINGS_UPDATED",
      payload: patch,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
