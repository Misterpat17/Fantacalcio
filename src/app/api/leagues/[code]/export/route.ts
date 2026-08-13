import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabaseServer";
import { handleRouteError, jsonError } from "@/lib/apiResponse";
import { RUOLO_LABEL, Ruolo } from "@/lib/types";

interface RevealedBid {
  participant_id: string;
  decision: string;
  amount: number | null;
}

interface BidRoundRow {
  player_id: string;
  round_number: number;
  status: string;
  revealed_bids: RevealedBid[] | null;
  winner_participant_id: string | null;
  winner_amount: number | null;
  created_at: string;
}

// Esporta rose complete, crediti spesi/rimanenti (anche in formato
// "matrice budget") e lo storico completo delle offerte di ogni asta
// giocatore, in un unico file Excel multi-foglio.
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

    const bidRounds = (bidRoundsRaw || []) as BidRoundRow[];
    const playersById = new Map((players || []).map((p) => [p.id, p]));
    const participantsById = new Map((participants || []).map((p) => [p.id, p]));
    const playingParticipants = (participants || []).filter((p) => p.is_player);

    // Etichette colonna univoche: da quando l'accesso è per account reali,
    // due partecipanti diversi possono avere lo stesso nome visualizzato
    // (il vincolo di unicità è stato rimosso). Disambiguiamo solo per le
    // intestazioni di queste due tabelle a matrice.
    const nameCounts = new Map<string, number>();
    for (const p of playingParticipants) nameCounts.set(p.display_name, (nameCounts.get(p.display_name) || 0) + 1);
    const seen = new Map<string, number>();
    function columnLabel(displayName: string): string {
      if ((nameCounts.get(displayName) || 0) <= 1) return displayName;
      const n = (seen.get(displayName) || 0) + 1;
      seen.set(displayName, n);
      return `${displayName} (${n})`;
    }
    const labelByParticipantId = new Map(playingParticipants.map((p) => [p.id, columnLabel(p.display_name)]));

    // ---------------------------------------------------------------
    // Foglio "Rose"
    // ---------------------------------------------------------------
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

    // ---------------------------------------------------------------
    // Foglio "Riepilogo crediti e rose"
    // ---------------------------------------------------------------
    const riepilogoRows = playingParticipants.map((p) => {
      const mine = (rosters || []).filter((r) => r.participant_id === p.id);
      const speso = mine.reduce((sum, r) => sum + r.price, 0);
      const count = (ruolo: Ruolo) => mine.filter((r) => playersById.get(r.player_id)?.ruolo === ruolo).length;
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

    // ---------------------------------------------------------------
    // Foglio "Budget": una colonna per squadra, righe organizzate per
    // ruolo secondo gli slot configurati in questa lega (P/D/C/A), con
    // il giocatore acquistato in quello slot e il relativo prezzo.
    // ---------------------------------------------------------------
    const budgetAoa: (string | number)[][] = [];
    budgetAoa.push(["", ...playingParticipants.map((p) => labelByParticipantId.get(p.id) || p.display_name)]);
    budgetAoa.push(["Crediti iniziali", ...playingParticipants.map(() => league.credits_iniziali)]);
    budgetAoa.push([
      "Crediti spesi",
      ...playingParticipants.map((p) => (rosters || []).filter((r) => r.participant_id === p.id).reduce((s, r) => s + r.price, 0)),
    ]);
    budgetAoa.push(["Crediti rimanenti", ...playingParticipants.map((p) => p.credits_current)]);
    budgetAoa.push([]);

    const roleBlocks: { label: string; ruolo: Ruolo; slots: number }[] = [
      { label: "PORTIERI", ruolo: "P", slots: league.slots_p },
      { label: "DIFENSORI", ruolo: "D", slots: league.slots_d },
      { label: "CENTROCAMPISTI", ruolo: "C", slots: league.slots_c },
      { label: "ATTACCANTI", ruolo: "A", slots: league.slots_a },
    ];

    for (const block of roleBlocks) {
      budgetAoa.push([`${block.label} (x${block.slots})`]);
      const byParticipant = new Map(
        playingParticipants.map((p) => {
          const mine = (rosters || [])
            .filter((r) => r.participant_id === p.id && playersById.get(r.player_id)?.ruolo === block.ruolo)
            .map((r) => ({ nome: playersById.get(r.player_id)?.nome || "?", price: r.price }))
            .sort((a, b) => b.price - a.price);
          return [p.id, mine] as const;
        })
      );
      for (let i = 0; i < block.slots; i++) {
        const row: (string | number)[] = [`${block.ruolo}${i + 1}`];
        for (const p of playingParticipants) {
          const mine = byParticipant.get(p.id) || [];
          const entry = mine[i];
          row.push(entry ? `${entry.nome} (${entry.price})` : "");
        }
        budgetAoa.push(row);
      }
      budgetAoa.push([]);
    }

    // ---------------------------------------------------------------
    // Foglio "Storico": una riga per ogni giocatore chiamato durante
    // l'asta, con l'offerta di ciascun partecipante (rivelate solo a
    // round chiuso: mai un round ancora aperto). Se un giocatore è
    // andato allo spareggio, l'offerta dei pari-merito è quella
    // dell'ultimo round di spareggio; gli altri restano quelli del
    // round principale.
    // ---------------------------------------------------------------
    const roundsByPlayer = new Map<string, BidRoundRow[]>();
    for (const r of bidRounds) {
      const list = roundsByPlayer.get(r.player_id) || [];
      list.push(r);
      roundsByPlayer.set(r.player_id, list);
    }

    const storicoHeader = [
      "Giocatore",
      "Ruolo",
      "Squadra",
      ...playingParticipants.map((p) => labelByParticipantId.get(p.id) || p.display_name),
      "Vincitore",
      "Prezzo finale",
    ];
    const storicoEntries: { row: (string | number)[]; sortKey: string }[] = [];

    for (const [playerId, roundsForPlayer] of roundsByPlayer) {
      const player = playersById.get(playerId);
      if (!player) continue;
      const sortedRounds = [...roundsForPlayer].sort((a, b) => a.round_number - b.round_number);

      const amountByParticipant = new Map<string, number | null>();
      const decisionByParticipant = new Map<string, string>();
      let finalRound: BidRoundRow | null = null;

      for (const rr of sortedRounds) {
        for (const b of rr.revealed_bids || []) {
          decisionByParticipant.set(b.participant_id, b.decision);
          amountByParticipant.set(b.participant_id, b.amount);
        }
        if (rr.status === "RESOLVED") finalRound = rr;
      }

      const row: (string | number)[] = [player.nome, RUOLO_LABEL[player.ruolo as Ruolo], player.squadra || ""];
      for (const p of playingParticipants) {
        const decision = decisionByParticipant.get(p.id);
        if (decision === "partecipo") row.push(amountByParticipant.get(p.id) ?? "");
        else if (decision === "non_partecipo") row.push("—");
        else row.push("");
      }
      const winnerName = finalRound?.winner_participant_id
        ? participantsById.get(finalRound.winner_participant_id)?.display_name || "?"
        : "Nessuna offerta";
      row.push(winnerName, finalRound?.winner_amount ?? "");

      storicoEntries.push({ row, sortKey: sortedRounds[0]?.created_at || "" });
    }

    storicoEntries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const storicoAoa: (string | number)[][] = [storicoHeader, ...storicoEntries.map((e) => e.row)];

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
