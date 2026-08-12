import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

// Elenco giocatori con filtri (ruolo, squadra, stato, ricerca testuale).
// Pubblico: nessun dato sensibile in questa tabella.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const url = new URL(req.url);
    const ruolo = url.searchParams.get("ruolo");
    const squadra = url.searchParams.get("squadra");
    const stato = url.searchParams.get("stato");
    const search = url.searchParams.get("search");

    let query = sb.from("players").select("*").eq("league_id", league.id);
    if (ruolo) query = query.eq("ruolo", ruolo);
    if (squadra) query = query.eq("squadra", squadra);
    if (stato) query = query.eq("stato", stato);
    if (search) query = query.ilike("nome", `%${search}%`);

    const { data, error } = await query.order("ruolo").order("quotazione", { ascending: false, nullsFirst: false });
    if (error) throw error;

    return NextResponse.json({ players: data || [] });
  } catch (err) {
    return handleRouteError(err);
  }
}
