// Tipi condivisi fra API route, hook realtime e componenti.

export type Ruolo = "P" | "D" | "C" | "A";

export const RUOLI: Ruolo[] = ["P", "D", "C", "A"];

export const RUOLO_LABEL: Record<Ruolo, string> = {
  P: "Portiere",
  D: "Difensore",
  C: "Centrocampista",
  A: "Attaccante",
};

// Colori distintivi per ruolo (Tailwind classes)
export const RUOLO_COLOR: Record<Ruolo, { bg: string; text: string; border: string; dot: string }> = {
  P: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/40", dot: "bg-amber-400" },
  D: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/40", dot: "bg-emerald-400" },
  C: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/40", dot: "bg-sky-400" },
  A: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/40", dot: "bg-rose-400" },
};

export type LeagueStatus = "SETUP" | "RUNNING" | "FINISHED" | "CANCELLED";

export type AuctionPhase =
  | "WAITING"
  | "CALLING"
  | "BIDDING"
  | "TIE_BREAK"
  | "REVEALING"
  | "AWARDED"
  | "PAUSED"
  | "CANCELLED"
  | "FINISHED";

export type TiebreakRule = "min_increment_1" | "free" | "max_credits";

export interface LeaguePublic {
  id: string;
  code: string;
  name: string;
  num_participants: number;
  credits_iniziali: number;
  roster_size: number;
  slots_p: number;
  slots_d: number;
  slots_c: number;
  slots_a: number;
  min_credit_per_slot: number;
  timer_seconds: number;
  tiebreak_seconds: number;
  tiebreak_rule: TiebreakRule;
  pass_limit: number | null;
  status: LeagueStatus;
}

export interface Participant {
  id: string;
  league_id: string;
  display_name: string;
  turn_order: number | null;
  is_admin: boolean;
  is_player: boolean;
  credits_current: number;
  consecutive_passes: number;
  connected: boolean;
  last_seen: string | null;
}

export interface Player {
  id: string;
  league_id: string;
  external_id: string | null;
  nome: string;
  ruolo: Ruolo;
  squadra: string | null;
  quotazione: number | null;
  stato: "available" | "sold" | "removed";
}

export interface AuctionState {
  league_id: string;
  phase: AuctionPhase;
  pre_pause_phase: AuctionPhase | null;
  pre_pause_remaining_ms: number | null;
  current_turn_participant_id: string | null;
  current_caller_participant_id: string | null;
  current_player_id: string | null;
  current_round_id: string | null;
  // Se la pausa attuale è stata avviata dal chiamante (col suo gettone
  // personale) invece che dall'admin, questo è il suo id: solo lui (in
  // più dell'admin, che può sempre riprendere) può far ripartire il
  // countdown.
  paused_by_caller_id: string | null;
  phase_end_at: string | null;
  last_result: Record<string, unknown> | null;
  updated_at: string;
}

export interface BidRound {
  id: string;
  league_id: string;
  player_id: string;
  caller_participant_id: string;
  round_number: number;
  eligible_participant_ids: string[];
  // Id di chi ha risposto "partecipo"/"non partecipo" finora sul round
  // corrente (mai gli importi): usati per mostrare, prima che parta il
  // countdown, chi partecipa e chi non partecipa (dashboard e schermo
  // per il proiettore). Chi non è in nessuno dei due è ancora in attesa.
  participating_participant_ids: string[];
  declined_participant_ids: string[];
  started_at: string;
  // null = countdown non ancora avviato: in attesa che tutti gli aventi
  // diritto rispondano partecipo/non partecipo (vedi decision_deadline_at
  // lato server per la scadenza di sicurezza).
  ends_at: string | null;
  status: "OPEN" | "CLOSED" | "RESOLVED" | "TIE_ADVANCED";
  responded_count: number;
  participating_count: number;
  revealed_bids: { participant_id: string; decision: string; amount: number | null }[] | null;
  winner_participant_id: string | null;
  winner_amount: number | null;
  // Gettone del chiamante per QUESTA chiamata (si ricarica ad ogni
  // nuova chiamata, non è un limite per tutta l'asta): true appena chi
  // ha chiamato questo giocatore ha già fermato una volta il countdown.
  caller_pause_used: boolean;
}

export interface RosterEntry {
  id: string;
  league_id: string;
  participant_id: string;
  player_id: string;
  price: number;
  round_id: string | null;
  purchased_at: string;
}

export interface HistoryEvent {
  id: string;
  league_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export const SLOT_KEY_BY_ROLE: Record<Ruolo, "slots_p" | "slots_d" | "slots_c" | "slots_a"> = {
  P: "slots_p",
  D: "slots_d",
  C: "slots_c",
  A: "slots_a",
};
