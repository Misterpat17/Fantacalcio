"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/Card";
import { Select, Input } from "@/components/ui/Input";
import { RoleBadge } from "@/components/RoleBadge";
import { useAuctionState } from "@/hooks/useAuctionState";
import { useHistoryEvents } from "@/hooks/useHistoryEvents";
import { usePlayers } from "@/hooks/usePlayers";
import { loadSession, StoredSession } from "@/lib/session";
import { Ruolo } from "@/lib/types";

interface AwardPayload {
  player_id?: string;
  player_nome?: string;
  player_ruolo?: Ruolo;
  player_squadra?: string;
  winner_participant_id?: string;
  amount?: number;
  caller_participant_id?: string;
}

export default function StoricoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    const s = loadSession(upperCode);
    if (!s) {
      router.replace("/");
      return;
    }
    setSession(s);
  }, [upperCode, router]);

  const { league, participants, leagueId } = useAuctionState(upperCode);
  const { events } = useHistoryEvents(leagueId);
  const { players } = usePlayers(upperCode, leagueId);

  const [participantFilter, setParticipantFilter] = useState("");
  const [ruoloFilter, setRuoloFilter] = useState<Ruolo | "">("");
  const [squadraFilter, setSquadraFilter] = useState("");
  const [minPrice, setMinPrice] = useState("");

  const participantsById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const squadre = useMemo(() => {
    const set = new Set<string>();
    players.forEach((p) => p.squadra && set.add(p.squadra));
    return Array.from(set).sort();
  }, [players]);

  const awards = useMemo(() => {
    return events
      .filter((e) => e.event_type === "AWARD")
      .map((e) => ({ event: e, payload: e.payload as AwardPayload }))
      .filter(({ payload }) => !ruoloFilter || payload.player_ruolo === ruoloFilter)
      .filter(({ payload }) => !squadraFilter || payload.player_squadra === squadraFilter)
      .filter(({ payload }) => !participantFilter || payload.winner_participant_id === participantFilter)
      .filter(({ payload }) => !minPrice || (payload.amount ?? 0) >= Number(minPrice));
  }, [events, ruoloFilter, squadraFilter, participantFilter, minPrice]);

  const otherEvents = useMemo(
    () => events.filter((e) => !["AWARD"].includes(e.event_type)),
    [events]
  );

  if (!league) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar code={upperCode} leagueName={league.name} isAdmin={!!session?.isAdmin} displayName={session?.displayName} />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-5">
        <h1 className="text-2xl font-black">Storico asta</h1>

        <Card className="p-4 flex flex-wrap gap-3">
          <Select value={participantFilter} onChange={(e) => setParticipantFilter(e.target.value)} className="w-auto">
            <option value="">Tutti i partecipanti</option>
            {participants.filter((p) => p.is_player).map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </Select>
          <Select value={ruoloFilter} onChange={(e) => setRuoloFilter(e.target.value as Ruolo | "")} className="w-auto">
            <option value="">Tutti i ruoli</option>
            <option value="P">P</option>
            <option value="D">D</option>
            <option value="C">C</option>
            <option value="A">A</option>
          </Select>
          <Select value={squadraFilter} onChange={(e) => setSquadraFilter(e.target.value)} className="w-auto">
            <option value="">Tutte le squadre</option>
            {squadre.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Prezzo minimo"
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-40"
          />
        </Card>

        <Card className="divide-y divide-slate-800">
          {awards.length === 0 && <p className="p-6 text-center text-slate-500">Nessuna aggiudicazione trovata.</p>}
          {awards.map(({ event, payload }) => (
            <div key={event.id} className="p-4 flex items-center gap-3">
              {payload.player_ruolo && <RoleBadge ruolo={payload.player_ruolo} />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold">
                  {payload.player_nome} <span className="text-slate-500 font-normal">— {payload.player_squadra}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Chiamato da {participantsById.get(payload.caller_participant_id || "")?.display_name || "?"} · Aggiudicato a{" "}
                  {participantsById.get(payload.winner_participant_id || "")?.display_name || "?"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-black">{payload.amount}</p>
                <p className="text-[11px] text-slate-500">{new Date(event.created_at).toLocaleTimeString("it-IT")}</p>
              </div>
            </div>
          ))}
        </Card>

        <h2 className="font-bold text-slate-300 text-sm uppercase tracking-wide">Altri eventi</h2>
        <Card className="divide-y divide-slate-800 max-h-[40vh] overflow-y-auto">
          {otherEvents.map((event) => (
            <div key={event.id} className="p-3 text-sm flex justify-between gap-3">
              <span className="text-slate-300">{describeEvent(event.event_type, event.payload, participantsById)}</span>
              <span className="text-slate-500 shrink-0">{new Date(event.created_at).toLocaleTimeString("it-IT")}</span>
            </div>
          ))}
        </Card>
      </main>
    </div>
  );
}

function describeEvent(
  type: string,
  payload: Record<string, unknown>,
  participantsById: Map<string, { display_name: string }>
): string {
  const name = (id: unknown) => (typeof id === "string" ? participantsById.get(id)?.display_name || "?" : "?");
  switch (type) {
    case "CALL":
      return `${name(payload.caller_participant_id)} ha chiamato ${payload.player_nome}`;
    case "PASS":
      return `${name(payload.participant_id)} ha passato il turno`;
    case "NO_BIDS":
      return `Nessuna offerta per ${payload.player_nome}`;
    case "TIE":
      return `Pareggio a ${payload.amount} crediti per ${payload.player_nome}`;
    case "PAUSE":
      return "L'admin ha messo in pausa l'asta";
    case "RESUME":
      return "L'admin ha ripreso l'asta";
    case "AUCTION_STARTED":
      return "L'asta è iniziata";
    case "AUCTION_FINISHED":
      return "L'asta è terminata";
    case "ADMIN_REOPEN_CALL":
      return "L'admin ha riaperto la chiamata corrente";
    case "ADMIN_CANCEL_AWARD":
      return `L'admin ha annullato un'aggiudicazione (${name(payload.participant_id)})`;
    case "ADMIN_CORRECT_PRICE":
      return `L'admin ha corretto un prezzo (${payload.old_price} → ${payload.new_price})`;
    case "ADMIN_CORRECT_CREDITS":
      return `L'admin ha corretto i crediti di ${name(payload.participant_id)} a ${payload.new_credits}`;
    case "ADMIN_ASSIGN":
      return `L'admin ha assegnato manualmente un giocatore a ${name(payload.participant_id)}`;
    case "ADMIN_REMOVE_PLAYER":
      return `L'admin ha rimosso ${payload.nome} dall'elenco`;
    case "ADMIN_IMPORT_PLAYERS":
      return `Importati ${payload.count} giocatori`;
    case "ADMIN_ADD_PARTICIPANT":
      return `Aggiunto partecipante ${payload.display_name}`;
    case "ADMIN_REMOVE_PARTICIPANT":
      return `Rimosso partecipante ${payload.display_name}`;
    case "ADMIN_SETTINGS_UPDATED":
      return "L'admin ha aggiornato le impostazioni della lega";
    case "ADMIN_REORDER":
      return "L'admin ha modificato l'ordine dei turni";
    default:
      return type;
  }
}
