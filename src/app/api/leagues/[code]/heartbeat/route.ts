import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireParticipant } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiResponse";

// Chiamato periodicamente dal client per segnalare che il partecipante è
// online (mostrato nella lista partecipanti) e per rilevare rapidamente
// una ripresa dopo disconnessione.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return NextResponse.json({ ok: false }, { status: 404 });

    const participant = await requireParticipant(req, league.id);
    await sb
      .from("participants")
      .update({ connected: true, last_seen: new Date().toISOString() })
      .eq("id", participant.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
