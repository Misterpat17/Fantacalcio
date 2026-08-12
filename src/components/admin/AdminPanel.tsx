"use client";

import { useMemo, useState } from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { RoleBadge } from "../RoleBadge";
import { ImportWizard } from "../ImportWizard";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { AuctionState, LeaguePublic, Participant, Player, RosterEntry, TiebreakRule } from "@/lib/types";

interface Props {
  code: string;
  token: string;
  league: LeaguePublic;
  state: AuctionState;
  participants: Participant[];
  players: Player[];
  rosters: RosterEntry[];
  onRefresh: () => void;
}

const TIMER_OPTIONS = [15, 20, 30, 45, 60];
const TIEBREAK_TIMER_OPTIONS = [10, 15, 20, 30];

export function AdminPanel({ code, token, league, state, participants, players, rosters, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const participantsById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const availablePlayers = players.filter((p) => p.stato === "available");
  const playingParticipants = participants.filter((p) => p.is_player).sort((a, b) => (a.turn_order ?? 999) - (b.turn_order ?? 999));

  async function run(action: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ ok: true, text: successText });
      onRefresh();
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof ApiError ? err.message : "Errore imprevisto." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`rounded-lg px-4 py-2 text-sm ${feedback.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
          {feedback.text}
        </div>
      )}

      <Card className="p-5 space-y-3">
        <h2 className="font-bold text-slate-200">Codice lega</h2>
        <p className="text-3xl font-black font-mono tracking-widest text-sky-400">{code}</p>
        <p className="text-sm text-slate-400">Condividi questo codice con gli altri partecipanti per farli entrare.</p>
        <p className="text-sm text-slate-400">
          Stato: <span className="font-semibold text-slate-200">{league.status}</span> · Fase asta:{" "}
          <span className="font-semibold text-slate-200">{state.phase}</span>
        </p>
      </Card>

      {league.status === "SETUP" && (
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-200">Avvio asta</h2>
          <p className="text-sm text-slate-400">
            Partecipanti iscritti: {playingParticipants.length} / {league.num_participants}. Importa i giocatori prima di
            avviare.
          </p>
          <Button
            disabled={busy}
            onClick={() => run(() => apiFetch(`/api/leagues/${code}/admin/start`, { method: "POST", token }), "Asta avviata!")}
          >
            🚀 Avvia asta
          </Button>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <h2 className="font-bold text-slate-200">Importa giocatori da Excel</h2>
        <ImportWizard code={code} token={token} onImported={onRefresh} />
      </Card>

      {league.status === "RUNNING" && (
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-200">Controlli live</h2>
          <div className="flex flex-wrap gap-3">
            {state.phase !== "PAUSED" ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => apiFetch(`/api/leagues/${code}/admin/pause`, { method: "POST", token }), "Asta in pausa.")}
              >
                ⏸️ Pausa asta
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={() => run(() => apiFetch(`/api/leagues/${code}/admin/resume`, { method: "POST", token }), "Asta ripresa.")}
              >
                ▶️ Riprendi asta
              </Button>
            )}
            {(state.phase === "BIDDING" || state.phase === "TIE_BREAK") && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(
                    () => apiFetch(`/api/leagues/${code}/admin/reopen-call`, { method: "POST", token }),
                    "Chiamata riaperta."
                  )
                }
              >
                ↩️ Riapri chiamata corrente
              </Button>
            )}
          </div>
        </Card>
      )}

      <RosterCorrections code={code} token={token} rosters={rosters} playersById={playersById} participantsById={participantsById} onDone={onRefresh} run={run} busy={busy} />

      <ManualAssignAndCredits
        code={code}
        token={token}
        availablePlayers={availablePlayers}
        playingParticipants={playingParticipants}
        run={run}
        busy={busy}
      />

      <PlayerRemoval code={code} token={token} availablePlayers={availablePlayers} run={run} busy={busy} />

      <ParticipantsAdmin code={code} token={token} participants={playingParticipants} run={run} busy={busy} />

      <SettingsPanel code={code} token={token} league={league} run={run} busy={busy} />
    </div>
  );
}

// -----------------------------------------------------------------------
type RunFn = (action: () => Promise<unknown>, successText: string) => Promise<void>;

function RosterCorrections({
  code,
  token,
  rosters,
  playersById,
  participantsById,
  run,
  busy,
}: {
  code: string;
  token: string;
  rosters: RosterEntry[];
  playersById: Map<string, Player>;
  participantsById: Map<string, Participant>;
  onDone: () => void;
  run: RunFn;
  busy: boolean;
}) {
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-bold text-slate-200">Correzioni aggiudicazioni</h2>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {rosters.length === 0 && <p className="text-sm text-slate-500">Nessuna aggiudicazione ancora registrata.</p>}
        {rosters
          .slice()
          .sort((a, b) => new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime())
          .map((r) => {
            const player = playersById.get(r.player_id);
            const participant = participantsById.get(r.participant_id);
            return (
              <div key={r.id} className="flex items-center gap-2 text-sm border border-slate-800 rounded-lg px-3 py-2">
                {player && <RoleBadge ruolo={player.ruolo} size="sm" />}
                <span className="flex-1 truncate">
                  {player?.nome} → <span className="font-semibold">{participant?.display_name}</span>
                </span>
                <Input
                  type="number"
                  className="w-20 px-2 py-1"
                  value={priceEdits[r.id] ?? String(r.price)}
                  onChange={(e) => setPriceEdits((p) => ({ ...p, [r.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        apiFetch(`/api/leagues/${code}/admin/correct-price`, {
                          method: "POST",
                          token,
                          body: { rosterId: r.id, newPrice: Number(priceEdits[r.id] ?? r.price) },
                        }),
                      "Prezzo corretto."
                    )
                  }
                >
                  Correggi
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => apiFetch(`/api/leagues/${code}/admin/cancel-award`, { method: "POST", token, body: { rosterId: r.id } }),
                      "Aggiudicazione annullata."
                    )
                  }
                >
                  Annulla
                </Button>
              </div>
            );
          })}
      </div>
    </Card>
  );
}

function ManualAssignAndCredits({
  code,
  token,
  availablePlayers,
  playingParticipants,
  run,
  busy,
}: {
  code: string;
  token: string;
  availablePlayers: Player[];
  playingParticipants: Participant[];
  run: RunFn;
  busy: boolean;
}) {
  const [assignParticipant, setAssignParticipant] = useState("");
  const [assignPlayer, setAssignPlayer] = useState("");
  const [assignPrice, setAssignPrice] = useState("1");

  const [creditsParticipant, setCreditsParticipant] = useState("");
  const [creditsValue, setCreditsValue] = useState("");

  return (
    <Card className="p-5 space-y-5">
      <div className="space-y-2">
        <h2 className="font-bold text-slate-200">Assegnazione manuale giocatore</h2>
        <div className="flex flex-wrap gap-2">
          <Select value={assignParticipant} onChange={(e) => setAssignParticipant(e.target.value)} className="w-auto">
            <option value="">Partecipante...</option>
            {playingParticipants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </Select>
          <Select value={assignPlayer} onChange={(e) => setAssignPlayer(e.target.value)} className="w-auto">
            <option value="">Giocatore...</option>
            {availablePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ruolo} · {p.nome} ({p.squadra})
              </option>
            ))}
          </Select>
          <Input type="number" className="w-24" value={assignPrice} onChange={(e) => setAssignPrice(e.target.value)} />
          <Button
            size="sm"
            disabled={busy || !assignParticipant || !assignPlayer}
            onClick={() =>
              run(
                () =>
                  apiFetch(`/api/leagues/${code}/admin/assign`, {
                    method: "POST",
                    token,
                    body: { participantId: assignParticipant, playerId: assignPlayer, price: Number(assignPrice) },
                  }),
                "Giocatore assegnato."
              )
            }
          >
            Assegna
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-bold text-slate-200">Correzione crediti</h2>
        <div className="flex flex-wrap gap-2">
          <Select value={creditsParticipant} onChange={(e) => setCreditsParticipant(e.target.value)} className="w-auto">
            <option value="">Partecipante...</option>
            {playingParticipants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} (attuali: {p.credits_current})
              </option>
            ))}
          </Select>
          <Input
            type="number"
            className="w-28"
            placeholder="Nuovi crediti"
            value={creditsValue}
            onChange={(e) => setCreditsValue(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !creditsParticipant || creditsValue === ""}
            onClick={() =>
              run(
                () =>
                  apiFetch(`/api/leagues/${code}/admin/correct-credits`, {
                    method: "POST",
                    token,
                    body: { participantId: creditsParticipant, newCredits: Number(creditsValue) },
                  }),
                "Crediti aggiornati."
              )
            }
          >
            Applica
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PlayerRemoval({
  code,
  token,
  availablePlayers,
  run,
  busy,
}: {
  code: string;
  token: string;
  availablePlayers: Player[];
  run: RunFn;
  busy: boolean;
}) {
  const [playerId, setPlayerId] = useState("");
  return (
    <Card className="p-5 space-y-2">
      <h2 className="font-bold text-slate-200">Rimuovi giocatore dall&apos;elenco</h2>
      <div className="flex flex-wrap gap-2">
        <Select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="w-auto">
          <option value="">Giocatore...</option>
          {availablePlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.ruolo} · {p.nome} ({p.squadra})
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="danger"
          disabled={busy || !playerId}
          onClick={() =>
            run(
              () => apiFetch(`/api/leagues/${code}/admin/remove-player`, { method: "POST", token, body: { playerId } }),
              "Giocatore rimosso."
            )
          }
        >
          Rimuovi
        </Button>
      </div>
    </Card>
  );
}

function ParticipantsAdmin({
  code,
  token,
  participants,
  run,
  busy,
}: {
  code: string;
  token: string;
  participants: Participant[];
  run: RunFn;
  busy: boolean;
}) {
  const [order, setOrder] = useState<string[]>(participants.map((p) => p.id));
  const [newName, setNewName] = useState("");
  const [lastToken, setLastToken] = useState<{ name: string; token: string } | null>(null);

  const orderedIds = order.filter((id) => participants.some((p) => p.id === id));
  const missing = participants.map((p) => p.id).filter((id) => !orderedIds.includes(id));
  const effectiveOrder = [...orderedIds, ...missing];

  function move(id: string, dir: -1 | 1) {
    const idx = effectiveOrder.indexOf(id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= effectiveOrder.length) return;
    const copy = [...effectiveOrder];
    [copy[idx], copy[swapWith]] = [copy[swapWith], copy[idx]];
    setOrder(copy);
  }

  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-bold text-slate-200">Partecipanti e ordine dei turni</h2>

      <div className="space-y-1.5">
        {effectiveOrder.map((id, idx) => {
          const p = participants.find((pp) => pp.id === id);
          if (!p) return null;
          return (
            <div key={id} className="flex items-center gap-2 text-sm border border-slate-800 rounded-lg px-3 py-2">
              <span className="w-6 text-slate-500 font-mono">{idx + 1}</span>
              <span className="flex-1">{p.display_name}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => move(id, -1)}>
                ↑
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => move(id, 1)}>
                ↓
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  run(
                    () => apiFetch(`/api/leagues/${code}/admin/participants/${id}`, { method: "DELETE", token }),
                    "Partecipante rimosso."
                  )
                }
              >
                Rimuovi
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() =>
          run(
            () =>
              apiFetch(`/api/leagues/${code}/admin/reorder`, {
                method: "POST",
                token,
                body: { orderedParticipantIds: effectiveOrder },
              }),
            "Ordine turni aggiornato."
          )
        }
      >
        Salva ordine
      </Button>

      <div className="pt-3 border-t border-slate-800 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Nome nuovo partecipante" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-auto" />
          <Button
            size="sm"
            disabled={busy || !newName.trim()}
            onClick={() =>
              run(async () => {
                const res = await apiFetch<{ token: string }>(`/api/leagues/${code}/admin/participants`, {
                  method: "POST",
                  token,
                  body: { displayName: newName.trim(), isPlayer: true },
                });
                setLastToken({ name: newName.trim(), token: res.token });
                setNewName("");
              }, "Partecipante aggiunto.")
            }
          >
            Aggiungi partecipante
          </Button>
        </div>
        {lastToken && (
          <p className="text-xs text-amber-400 break-all">
            Token di accesso per {lastToken.name} (da comunicare manualmente, es. copiandolo nel browser del partecipante):{" "}
            <span className="font-mono">{lastToken.token}</span>
          </p>
        )}
      </div>
    </Card>
  );
}

function SettingsPanel({
  code,
  token,
  league,
  run,
  busy,
}: {
  code: string;
  token: string;
  league: LeaguePublic;
  run: RunFn;
  busy: boolean;
}) {
  const [timerSeconds, setTimerSeconds] = useState(league.timer_seconds);
  const [tiebreakSeconds, setTiebreakSeconds] = useState(league.tiebreak_seconds);
  const [tiebreakRule, setTiebreakRule] = useState<TiebreakRule>(league.tiebreak_rule);
  const [passLimitEnabled, setPassLimitEnabled] = useState(league.pass_limit !== null);
  const [passLimit, setPassLimit] = useState(league.pass_limit ?? 3);
  const [minCredit, setMinCredit] = useState(league.min_credit_per_slot);

  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-bold text-slate-200">Impostazioni asta</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <Select label="Durata timer offerta" value={timerSeconds} onChange={(e) => setTimerSeconds(Number(e.target.value))}>
          {TIMER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s} secondi
            </option>
          ))}
        </Select>
        <Select label="Durata timer spareggio" value={tiebreakSeconds} onChange={(e) => setTiebreakSeconds(Number(e.target.value))}>
          {TIEBREAK_TIMER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s} secondi
            </option>
          ))}
        </Select>
      </div>
      <Select label="Regola spareggio" value={tiebreakRule} onChange={(e) => setTiebreakRule(e.target.value as TiebreakRule)}>
        <option value="min_increment_1">Offerta minima superiore di 1 credito</option>
        <option value="free">Offerta libera (≥ importo pareggiato)</option>
        <option value="max_credits">Vince chi ha più crediti disponibili</option>
      </Select>
      <Input
        label="Crediti minimi riservati per slot rimanente"
        type="number"
        min={0}
        value={minCredit}
        onChange={(e) => setMinCredit(Number(e.target.value))}
      />
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={passLimitEnabled} onChange={(e) => setPassLimitEnabled(e.target.checked)} className="rounded" />
        Limita i pass consecutivi
      </label>
      {passLimitEnabled && (
        <Input type="number" min={1} value={passLimit} onChange={(e) => setPassLimit(Number(e.target.value))} />
      )}
      <Button
        disabled={busy}
        onClick={() =>
          run(
            () =>
              apiFetch(`/api/leagues/${code}/admin/settings`, {
                method: "POST",
                token,
                body: {
                  timer_seconds: timerSeconds,
                  tiebreak_seconds: tiebreakSeconds,
                  tiebreak_rule: tiebreakRule,
                  pass_limit: passLimitEnabled ? passLimit : null,
                  min_credit_per_slot: minCredit,
                },
              }),
            "Impostazioni aggiornate."
          )
        }
      >
        Salva impostazioni
      </Button>
    </Card>
  );
}
