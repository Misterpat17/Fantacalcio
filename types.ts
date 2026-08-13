import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/apiResponse";

interface ImportRowBody {
  external_id: string | null;
  nome: string;
  ruolo: "P" | "D" | "C" | "A";
  squadra: string | null;
  quotazione: number | null;
}

// L'anteprima e la mappatura colonne avvengono lato client (SheetJS).
// Questa route riceve l'elenco già normalizzato e lo scrive nel DB.
// Protetta: solo l'admin della lega può importare giocatori.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb.from("leagues").select("id").eq("code", code.toUpperCase()).maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    await requireAdmin(req, league.id);

    const body = await req.json();
    const rows: ImportRowBody[] = body?.rows || [];
    const mode: "replace" | "append" = body?.mode === "append" ? "append" : "replace";

    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonError(422, "EMPTY_IMPORT", "Nessun giocatore da importare");
    }

    if (mode === "replace") {
      // Rimuove solo i giocatori non ancora assegnati: non tocca mai chi
      // è già stato acquistato (evita di rompere le rose esistenti).
      await sb.from("players").delete().eq("league_id", league.id).eq("stato", "available");
    }

    const toInsert = rows.map((r) => ({
      league_id: league.id,
      external_id: r.external_id,
      nome: r.nome,
      ruolo: r.ruolo,
      squadra: r.squadra,
      quotazione: r.quotazione,
      stato: "available" as const,
    }));

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await sb.from("players").insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
    }

    await sb.from("history").insert({
      league_id: league.id,
      event_type: "ADMIN_IMPORT_PLAYERS",
      payload: { count: inserted, mode },
    });

    return NextResponse.json({ ok: true, imported: inserted });
  } catch (err) {
    return handleRouteError(err);
  }
}
