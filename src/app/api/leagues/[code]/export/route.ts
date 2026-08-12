import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabaseServer";
import { handleRouteError, jsonError } from "@/lib/apiResponse";
import { RUOLO_LABEL, Ruolo } from "@/lib/types";

// Esporta rose complete, crediti spesi, prezzi di acquisto e storico
// dell'asta in un unico file Excel multi-foglio.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb
      .from("leagues")
      .select("id, name, credits_iniziali")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const [{ data: participants }, { data: rosters }, { data: players }, { data: history }] = await Promise.all([
      sb
        .from("participants")
        .select("id, display_name, turn_order, credits_current, is_player")
        .eq("league_id", league.id)
        .order("turn_order", { ascending: true, nullsFirst: false }),
      sb.from("rosters").select("participant_id, player_id, price, purchased_at").eq("league_id", league.id),
      sb.from("players").select("id, nome, ruolo, squadra").eq("league_id", league.id),
      sb.from("history").select("event_type, payload, created_at").eq("league_id", league.id).order("created_at", { ascending: true }),
    ]);

    const playersById = new Map((players || []).map((p) => [p.id, p]));
    const participantsById = new Map((participants || []).map((p) => [p.id, p]));

    // Foglio "Rose"
    const roseRows = (rosters || [])
      .map((r) => {
        const player = playersById.get(r.player_id);
        const participant = participantsById.get(r.participant_id);
        return {
          Partecipante: participant?.display_name || "?",
          Ruolo: player ? RUOLO_LABEL[player.ruolo as Ruolo] : "?",
          Giocatore: player?.nome || "?",
          Squadra: player?.squadra || "",
          Prezzo: r.price,
          "Data acquisto": r.purchased_at,
        };
      })
      .sort((a, b) => a.Partecipante.localeCompare(b.Partecipante) || a.Ruolo.localeCompare(b.Ruolo));

    // Foglio "Riepilogo crediti e rose"
    const riepilogoRows = (participants || [])
      .filter((p) => p.is_player)
      .map((p) => {
        const mine = (rosters || []).filter((r) => r.participant_id === p.id);
        const speso = mine.reduce((sum, r) => sum + r.price, 0);
        const count = (ruolo: Ruolo) =>
          mine.filter((r) => playersById.get(r.player_id)?.ruolo === ruolo).length;
        return {
          Partecipante: p.display_name,
          "Crediti iniziali": league.credits_iniziali,
          "Crediti spesi": speso,
          "Crediti rimanenti": p.credits_current,
          Portieri: count("P"),
          Difensori: count("D"),
          Centrocampisti: count("C"),
          Attaccanti: count("A"),
          "Totale giocatori": mine.length,
        };
      });

    // Foglio "Storico"
    const storicoRows = (history || []).map((h) => ({
      Data: h.created_at,
      Evento: h.event_type,
      Dettagli: JSON.stringify(h.payload),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(riepilogoRows), "Riepilogo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roseRows), "Rose");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(storicoRows), "Storico");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="asta_${code.toUpperCase()}.xlsx"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
