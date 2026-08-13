import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabaseServer";
import { handleRouteError, jsonError } from "@/lib/apiResponse";
import { buildBudget, buildColumnLabels, buildRiepilogo, buildRose, buildStorico, ReportBidRound } from "@/lib/reportData";

// Esporta rose complete, crediti spesi/rimanenti (anche in formato
// "matrice budget") e lo storico completo delle offerte di ogni asta
// giocatore, in un unico file Excel multi-foglio. Stessa identica logica
// di calcolo delle viste a schermo Budget/Rose/Storico (src/lib/reportData.ts):
// qui viene solo convertita in fogli Excel.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const sb = supabaseServer();
    const { data: league } = await sb
      .from("leagues")
      .select("id, name, credits_iniziali, slots_p, slots_d, slots_c, slots_a")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!league) return jsonError(404, "LEAGUE_NOT_FOUND");

    const [{ data: participants }, { data: rosters }, { data: players }, { data: bidRoundsRaw }] = await Promise.all([
      sb
        .from("participants")
        .select("id, display_name, turn_order, credits_current, is_player")
        .eq("league_id", league.id)
        .order("turn_order", { ascending: true, nullsFirst: false }),
      sb.from("rosters").select("participant_id, player_id, price, purchased_at").eq("league_id", league.id),
      sb.from("players").select("id, nome, ruolo, squadra").eq("league_id", league.id),
      sb
        .from("bid_rounds")
        .select("player_id, round_number, status, revealed_bids, winner_participant_id, winner_amount, created_at")
        .eq("league_id", league.id)
        .order("round_number", { ascending: true }),
    ]);

    const bidRounds = (bidRoundsRaw || []) as ReportBidRound[];
    const playersById = new Map((players || []).map((p) => [p.id, p]));
    const participantsById = new Map((participants || []).map((p) => [p.id, p]));
    const playingParticipants = (participants || []).filter((p) => p.is_player);
    const labelByParticipantId = buildColumnLabels(playingParticipants);

    const riepilogoRows = buildRiepilogo(league, playingParticipants, rosters || [], playersById);
    const roseRows = buildRose(rosters || [], participantsById, playersById);
    const budget = buildBudget(league, playingParticipants, rosters || [], playersById, labelByParticipantId);
    const storico = buildStorico(playingParticipants, playersById, participantsById, bidRounds, labelByParticipantId);

    // ---------------------------------------------------------------
    // Foglio "Budget" -> aoa (una colonna per squadra, righe per ruolo)
    // ---------------------------------------------------------------
    const budgetAoa: (string | number)[][] = [];
    budgetAoa.push(["", ...budget.participantLabels]);
    budgetAoa.push(["Crediti iniziali", ...budget.creditiIniziali]);
    budgetAoa.push(["Crediti spesi", ...budget.creditiSpesi]);
    budgetAoa.push(["Crediti rimanenti", ...budget.creditiRimanenti]);
    budgetAoa.push([]);
    for (const block of budget.blocks) {
      budgetAoa.push([`${block.label} (x${block.slots})`]);
      block.rows.forEach((row, i) => budgetAoa.push([`${block.ruolo}${i + 1}`, ...row]));
      budgetAoa.push([]);
    }

    // ---------------------------------------------------------------
    // Foglio "Storico" -> aoa (solo giocatori effettivamente aggiudicati)
    // ---------------------------------------------------------------
    const storicoHeader = ["Giocatore", "Ruolo", "Squadra", ...storico.participantLabels, "Vincitore", "Prezzo finale"];
    const storicoAoa: (string | number)[][] = [
      storicoHeader,
      ...storico.rows.map((r) => [r.giocatore, r.ruolo, r.squadra, ...r.offerte, r.vincitore, r.prezzoFinale]),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(riepilogoRows), "Riepilogo");
    XLSX.utils.book_append_sheet(wb, sheetWithWidths(XLSX.utils.aoa_to_sheet(budgetAoa), budgetAoa), "Budget");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roseRows), "Rose");
    XLSX.utils.book_append_sheet(wb, sheetWithWidths(XLSX.utils.aoa_to_sheet(storicoAoa), storicoAoa), "Storico");

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

// Larghezza colonne proporzionata al contenuto, altrimenti Excel le
// mostra tutte troppo strette per queste due tabelle a matrice.
function sheetWithWidths(ws: ReturnType<typeof XLSX.utils.aoa_to_sheet>, aoa: (string | number)[][]) {
  const maxCols = aoa.reduce((m, row) => Math.max(m, row.length), 0);
  ws["!cols"] = Array.from({ length: maxCols }, (_, i) => {
    const width = aoa.reduce((m, row) => {
      const cell = row[i];
      const len = cell == null ? 0 : String(cell).length;
      return Math.max(m, len);
    }, 8);
    return { wch: Math.min(width + 2, 28) };
  });
  return ws;
}
