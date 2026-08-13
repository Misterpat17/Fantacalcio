import { RUOLO_LABEL, Ruolo } from "./types";

// Logica di aggregazione condivisa tra l'export Excel
// (src/app/api/leagues/[code]/export/route.ts) e le viste a schermo
// Budget/Rose/Storico (src/app/league/[code]/{budget,rose,storico}/page.tsx):
// stesso calcolo, stesse cifre, in un solo posto — evita che l'export e
// la dashboard possano un giorno mostrare numeri diversi per lo stesso dato.

export interface ReportParticipant {
  id: string;
  display_name: string;
  is_player: boolean;
  credits_current: number;
}

export interface ReportPlayer {
  id: string;
  nome: string;
  ruolo: Ruolo;
  squadra: string | null;
}

export interface ReportRoster {
  participant_id: string;
  player_id: string;
  price: number;
  purchased_at: string;
}

export interface ReportBidRound {
  id?: string;
  player_id: string;
  round_number: number;
  status: string;
  revealed_bids: { participant_id: string; decision: string; amount: number | null }[] | null;
  winner_participant_id: string | null;
  winner_amount: number | null;
  created_at: string;
}

export interface ReportLeague {
  credits_iniziali: number;
  slots_p: number;
  slots_d: number;
  slots_c: number;
  slots_a: number;
}

// Etichette colonna univoche: da quando l'accesso è per account reali,
// due partecipanti diversi possono avere lo stesso nome visualizzato (il
// vincolo di unicità è stato rimosso). Disambigua solo per le colonne
// delle due tabelle a matrice (Budget, Storico).
export function buildColumnLabels(playingParticipants: ReportParticipant[]): Map<string, string> {
  const nameCounts = new Map<string, number>();
  for (const p of playingParticipants) nameCounts.set(p.display_name, (nameCounts.get(p.display_name) || 0) + 1);
  const seen = new Map<string, number>();
  const labelByParticipantId = new Map<string, string>();
  for (const p of playingParticipants) {
    const total = nameCounts.get(p.display_name) || 0;
    if (total <= 1) {
      labelByParticipantId.set(p.id, p.display_name);
      continue;
    }
    const n = (seen.get(p.display_name) || 0) + 1;
    seen.set(p.display_name, n);
    labelByParticipantId.set(p.id, `${p.display_name} (${n})`);
  }
  return labelByParticipantId;
}

export interface RiepilogoRow {
  Partecipante: string;
  "Crediti iniziali": number;
  "Crediti spesi": number;
  "Crediti rimanenti": number;
  Portieri: number;
  Difensori: number;
  Centrocampisti: number;
  Attaccanti: number;
  "Totale giocatori": number;
}

export function buildRiepilogo(
  league: ReportLeague,
  playingParticipants: ReportParticipant[],
  rosters: ReportRoster[],
  playersById: Map<string, ReportPlayer>
): RiepilogoRow[] {
  return playingParticipants.map((p) => {
    const mine = rosters.filter((r) => r.participant_id === p.id);
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
}

export interface RoseRow {
  Partecipante: string;
  Ruolo: string;
  Giocatore: string;
  Squadra: string;
  Prezzo: number;
  "Data acquisto": string;
}

export function buildRose(
  rosters: ReportRoster[],
  participantsById: Map<string, ReportParticipant>,
  playersById: Map<string, ReportPlayer>
): RoseRow[] {
  return rosters
    .map((r) => {
      const player = playersById.get(r.player_id);
      const participant = participantsById.get(r.participant_id);
      return {
        Partecipante: participant?.display_name || "?",
        Ruolo: player ? RUOLO_LABEL[player.ruolo] : "?",
        Giocatore: player?.nome || "?",
        Squadra: player?.squadra || "",
        Prezzo: r.price,
        "Data acquisto": r.purchased_at,
      };
    })
    .sort((a, b) => a.Partecipante.localeCompare(b.Partecipante) || a.Ruolo.localeCompare(b.Ruolo));
}

export interface BudgetBlock {
  label: string;
  ruolo: Ruolo;
  slots: number;
  // rows[i] = una riga (slot i+1) con, per ogni partecipante (stesso
  // ordine di participantLabels), "Nome (prezzo)" oppure "" se vuoto.
  rows: string[][];
}

export interface BudgetReport {
  participantIds: string[];
  participantLabels: string[];
  creditiIniziali: number[];
  creditiSpesi: number[];
  creditiRimanenti: number[];
  blocks: BudgetBlock[];
}

export function buildBudget(
  league: ReportLeague,
  playingParticipants: ReportParticipant[],
  rosters: ReportRoster[],
  playersById: Map<string, ReportPlayer>,
  labelByParticipantId: Map<string, string>
): BudgetReport {
  const roleBlocks: { label: string; ruolo: Ruolo; slots: number }[] = [
    { label: "PORTIERI", ruolo: "P", slots: league.slots_p },
    { label: "DIFENSORI", ruolo: "D", slots: league.slots_d },
    { label: "CENTROCAMPISTI", ruolo: "C", slots: league.slots_c },
    { label: "ATTACCANTI", ruolo: "A", slots: league.slots_a },
  ];

  const blocks: BudgetBlock[] = roleBlocks.map((block) => {
    const byParticipant = new Map(
      playingParticipants.map((p) => {
        const mine = rosters
          .filter((r) => r.participant_id === p.id && playersById.get(r.player_id)?.ruolo === block.ruolo)
          .map((r) => ({ nome: playersById.get(r.player_id)?.nome || "?", price: r.price }))
          .sort((a, b) => b.price - a.price);
        return [p.id, mine] as const;
      })
    );
    const rows: string[][] = [];
    for (let i = 0; i < block.slots; i++) {
      rows.push(
        playingParticipants.map((p) => {
          const mine = byParticipant.get(p.id) || [];
          const entry = mine[i];
          return entry ? `${entry.nome} (${entry.price})` : "";
        })
      );
    }
    return { label: block.label, ruolo: block.ruolo, slots: block.slots, rows };
  });

  return {
    participantIds: playingParticipants.map((p) => p.id),
    participantLabels: playingParticipants.map((p) => labelByParticipantId.get(p.id) || p.display_name),
    creditiIniziali: playingParticipants.map(() => league.credits_iniziali),
    creditiSpesi: playingParticipants.map((p) => rosters.filter((r) => r.participant_id === p.id).reduce((s, r) => s + r.price, 0)),
    creditiRimanenti: playingParticipants.map((p) => p.credits_current),
    blocks,
  };
}

export interface StoricoRow {
  giocatore: string;
  ruolo: string;
  squadra: string;
  // stesso ordine di participantLabels: numero (offerta), "—" (non
  // partecipo) o "" (non ha risposto / non era tra gli aventi diritto).
  offerte: (string | number)[];
  vincitore: string;
  prezzoFinale: number | string;
  sortKey: string;
}

export interface StoricoReport {
  participantLabels: string[];
  rows: StoricoRow[];
}

// Solo i giocatori EFFETTIVAMENTE AGGIUDICATI (venduti a qualcuno): i
// giocatori chiamati ma senza offerte, o le cui buste sono ancora
// aperte, non compaiono qui. Se un giocatore è andato allo spareggio,
// l'offerta dei pari-merito è quella dell'ultimo round di spareggio; gli
// altri restano quelli del round principale.
export function buildStorico(
  playingParticipants: ReportParticipant[],
  playersById: Map<string, ReportPlayer>,
  participantsById: Map<string, ReportParticipant>,
  bidRounds: ReportBidRound[],
  labelByParticipantId: Map<string, string>
): StoricoReport {
  const roundsByPlayer = new Map<string, ReportBidRound[]>();
  for (const r of bidRounds) {
    const list = roundsByPlayer.get(r.player_id) || [];
    list.push(r);
    roundsByPlayer.set(r.player_id, list);
  }

  const rows: StoricoRow[] = [];

  for (const [playerId, roundsForPlayer] of roundsByPlayer) {
    const player = playersById.get(playerId);
    if (!player) continue;
    const sortedRounds = [...roundsForPlayer].sort((a, b) => a.round_number - b.round_number);

    const amountByParticipant = new Map<string, number | null>();
    const decisionByParticipant = new Map<string, string>();
    let finalRound: ReportBidRound | null = null;

    for (const rr of sortedRounds) {
      for (const b of rr.revealed_bids || []) {
        decisionByParticipant.set(b.participant_id, b.decision);
        amountByParticipant.set(b.participant_id, b.amount);
      }
      if (rr.status === "RESOLVED") finalRound = rr;
    }

    if (!finalRound?.winner_participant_id) continue;

    const offerte = playingParticipants.map((p) => {
      const decision = decisionByParticipant.get(p.id);
      if (decision === "partecipo") return amountByParticipant.get(p.id) ?? "";
      if (decision === "non_partecipo") return "—";
      return "";
    });
    const winnerName = participantsById.get(finalRound.winner_participant_id)?.display_name || "?";

    rows.push({
      giocatore: player.nome,
      ruolo: RUOLO_LABEL[player.ruolo],
      squadra: player.squadra || "",
      offerte,
      vincitore: winnerName,
      prezzoFinale: finalRound.winner_amount ?? "",
      sortKey: sortedRounds[0]?.created_at || "",
    });
  }

  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return {
    participantLabels: playingParticipants.map((p) => labelByParticipantId.get(p.id) || p.display_name),
    rows,
  };
}
