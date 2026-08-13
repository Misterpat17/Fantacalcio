"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { apiFetch, ApiError } from "@/lib/apiClient";

interface Props {
  code: string;
  token: string | null;
  roundId: string;
  eligible: boolean;
  roleAvailable: boolean | null;
  maxBid: number | null;
  // Prezzo minimo (quotazione da Excel + 1 alla chiamata principale,
  // altrimenti l'incremento minimo di spareggio): solo un aiuto in UI,
  // il vincolo vero è comunque applicato lato server.
  minBid?: number | null;
  myBid: { decision: string; amount: number | null } | null;
  locked: boolean; // timer scaduto lato client (guardia soft, il server è comunque l'autorità)
  // true da quando il countdown è partito (tutti hanno risposto): da
  // qui in poi la scelta partecipo/non-partecipo è definitiva e non si
  // può più cambiare (si può solo, se già "partecipo", modificare
  // l'importo). Il server applica lo stesso vincolo in fn_submit_bid.
  countdownStarted: boolean;
  onSubmitted: () => void;
}

export function BiddingPanel({
  code,
  token,
  roundId,
  eligible,
  roleAvailable,
  maxBid,
  minBid,
  myBid,
  locked,
  countdownStarted,
  onSubmitted,
}: Props) {
  const [decision, setDecision] = useState<"partecipo" | "non_partecipo" | null>(
    (myBid?.decision as "partecipo" | "non_partecipo") || null
  );
  const [amount, setAmount] = useState<string>(myBid?.amount ? String(myBid.amount) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  // true dal momento in cui l'utente clicca PARTECIPO/NON PARTECIPO in
  // questa busta: da qui in poi il polling periodico di `myBid` non deve
  // più sovrascrivere la sua scelta locale, altrimenti chi rispondeva
  // "non partecipo" e poi cambiava idea cliccando "partecipo" si vedeva
  // riportare la scelta indietro dal refresh successivo prima ancora di
  // riuscire a confermare la nuova offerta.
  const userEditedRef = useRef(false);

  // Nuova busta: si riparte "vergini", pronti a precaricare di nuovo
  // un'eventuale scelta già salvata (es. dopo un ricaricamento pagina).
  useEffect(() => {
    userEditedRef.current = false;
  }, [roundId]);

  useEffect(() => {
    if (userEditedRef.current) return;
    setDecision((myBid?.decision as "partecipo" | "non_partecipo") || null);
    setAmount(myBid?.amount ? String(myBid.amount) : "");
  }, [myBid?.decision, myBid?.amount]);

  if (!eligible) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-center text-slate-400">
        Non sei tra i partecipanti ammessi a questo spareggio. Attendi l&apos;esito.
      </div>
    );
  }

  // Countdown già partito (tutti hanno risposto): la scelta registrata
  // sul server è definitiva, non si può più passare da "non partecipo"
  // a "partecipo" (né il contrario) — si può solo, restando
  // "partecipo", cambiare l'importo dell'offerta.
  const decisionLockedByCountdown = countdownStarted && myBid?.decision != null;

  async function submit(finalDecision: "partecipo" | "non_partecipo") {
    setError(null);
    setSubmitting(true);
    try {
      const body: { roundId: string; decision: string; amount?: number } = { roundId, decision: finalDecision };
      if (finalDecision === "partecipo") {
        const n = Math.trunc(Number(amount));
        if (Number.isNaN(n) || n < 0) {
          setError("Inserisci un importo valido.");
          setSubmitting(false);
          return;
        }
        if (minBid != null && n < minBid) {
          setError(`L'offerta minima per questo giocatore è ${minBid} crediti.`);
          setSubmitting(false);
          return;
        }
        body.amount = n;
      }
      await apiFetch(`/api/leagues/${code}/bid`, { method: "POST", token, body });
      setDecision(finalDecision);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 1500);
      onSubmitted();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(messageFor(err.code, err.message));
      } else {
        setError("Errore di rete. Riprova.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <h3 className="font-bold text-center text-lg">PARTECIPI?</h3>

      {roleAvailable === false && (
        <p className="text-sm text-amber-400 text-center">
          Hai già completato il numero massimo di giocatori per questo ruolo: puoi solo scegliere &quot;Non partecipo&quot;.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant={decision === "partecipo" ? "success" : "ghost"}
          disabled={
            locked || submitting || roleAvailable === false || (decisionLockedByCountdown && myBid?.decision !== "partecipo")
          }
          onClick={() => {
            userEditedRef.current = true;
            setDecision("partecipo");
          }}
        >
          ✅ PARTECIPO
        </Button>
        <Button
          variant={decision === "non_partecipo" ? "danger" : "ghost"}
          disabled={locked || submitting || (decisionLockedByCountdown && myBid?.decision !== "non_partecipo")}
          onClick={() => {
            userEditedRef.current = true;
            setDecision("non_partecipo");
            submit("non_partecipo");
          }}
        >
          ❌ NON PARTECIPO
        </Button>
      </div>

      {decisionLockedByCountdown && (
        <p className="text-center text-[11px] text-slate-500">
          Il countdown è partito: la tua scelta partecipo/non partecipo è definitiva
          {decision === "partecipo" ? " (puoi ancora modificare l'importo qui sotto)." : "."}
        </p>
      )}

      {decision === "partecipo" && (
        <div className="space-y-2 fade-in-up">
          <label className="text-sm font-medium text-slate-300">LA TUA OFFERTA</label>
          <input
            type="number"
            inputMode="numeric"
            min={minBid ?? 0}
            max={maxBid ?? undefined}
            value={amount}
            disabled={locked || submitting}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full text-center text-3xl font-black rounded-xl bg-slate-800 border border-slate-700 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-center text-xs text-slate-400">
            {minBid != null && `Offerta minima: ${minBid}`}
            {minBid != null && maxBid !== null && " · "}
            {maxBid !== null && `Offerta massima: ${maxBid}`}
          </p>
          <Button
            variant="success"
            className="w-full"
            disabled={locked || submitting || !amount}
            onClick={() => submit("partecipo")}
          >
            {confirmed ? "Offerta registrata ✓" : "CONFERMA OFFERTA"}
          </Button>
          <p className="text-center text-[11px] text-slate-500">
            Puoi modificare l&apos;offerta più volte: conta solo l&apos;ultima registrata prima della scadenza.
          </p>
        </div>
      )}

      {decision === "non_partecipo" && confirmed && (
        <p className="text-center text-sm text-slate-400">Scelta registrata.</p>
      )}

      {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
    </div>
  );
}

function messageFor(code: string, fallback: string): string {
  if (code.startsWith("AMOUNT_TOO_HIGH")) return "L'offerta supera il massimo consentito.";
  if (code.startsWith("AMOUNT_TOO_LOW")) {
    const min = Number(fallback);
    return Number.isFinite(min) && min > 0
      ? `L'offerta minima per questo giocatore è ${min} crediti.`
      : "L'offerta è inferiore al minimo consentito.";
  }
  switch (code) {
    case "ROLE_FULL":
      return "Hai già completato gli slot per questo ruolo.";
    case "ROUND_EXPIRED":
    case "ROUND_CLOSED":
      return "Il tempo per questa chiamata è terminato.";
    case "NOT_ELIGIBLE":
      return "Non puoi partecipare a questo spareggio.";
    case "DECISION_LOCKED":
      return "Il countdown è partito: non puoi più cambiare la tua scelta partecipo/non partecipo.";
    default:
      return fallback;
  }
}
