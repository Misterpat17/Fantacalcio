"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { saveSession } from "@/lib/session";

const TIMER_OPTIONS = [15, 20, 30, 45, 60];
const TIEBREAK_OPTIONS = [10, 15, 20, 30];

export default function CreaLegaPage() {
  const router = useRouter();
  const [name, setName] = useState("Lega di Mario");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPlays, setAdminPlays] = useState(true);
  const [numParticipants, setNumParticipants] = useState(8);
  const [creditsIniziali, setCreditsIniziali] = useState(1000);
  const [rosterSize, setRosterSize] = useState(25);
  const [slotP, setSlotP] = useState(3);
  const [slotD, setSlotD] = useState(8);
  const [slotC, setSlotC] = useState(8);
  const [slotA, setSlotA] = useState(6);
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [tiebreakSeconds, setTiebreakSeconds] = useState(15);
  const [tiebreakRule, setTiebreakRule] = useState<"min_increment_1" | "free" | "max_credits">("min_increment_1");
  const [passLimitEnabled, setPassLimitEnabled] = useState(false);
  const [passLimit, setPassLimit] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotsTotal = slotP + slotD + slotC + slotA;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !adminDisplayName.trim() || adminPassword.length < 4) {
      setError("Compila tutti i campi obbligatori (password admin di almeno 4 caratteri).");
      return;
    }
    if (slotsTotal !== rosterSize) {
      setError(`La somma degli slot per ruolo (${slotsTotal}) deve essere uguale alla dimensione della rosa (${rosterSize}).`);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ code: string; token: string; participantId: string; isAdmin: boolean }>(
        "/api/leagues",
        {
          method: "POST",
          body: {
            name: name.trim(),
            adminDisplayName: adminDisplayName.trim(),
            adminPassword,
            adminPlays,
            numParticipants,
            creditsIniziali,
            rosterSize,
            slots: { P: slotP, D: slotD, C: slotC, A: slotA },
            timerSeconds,
            tiebreakSeconds,
            tiebreakRule,
            passLimit: passLimitEnabled ? passLimit : null,
          },
        }
      );
      saveSession({
        token: res.token,
        participantId: res.participantId,
        displayName: adminDisplayName.trim(),
        isAdmin: true,
        leagueCode: res.code,
      });
      router.push(`/league/${res.code}/admin`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore durante la creazione della lega.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex justify-center px-4 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-black">Crea una nuova asta</h1>
          <p className="text-slate-400 text-sm mt-1">
            Configura la lega. Potrai modificare alcune impostazioni anche in seguito dal pannello admin.
          </p>
        </div>

        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-slate-200">Dati lega e amministratore</h2>
          <Input label="Nome della lega" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Il tuo nome (admin)"
              value={adminDisplayName}
              onChange={(e) => setAdminDisplayName(e.target.value)}
              required
            />
            <Input
              label="Password admin"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="min. 4 caratteri"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={adminPlays} onChange={(e) => setAdminPlays(e.target.checked)} className="rounded" />
            Anche io partecipo all&apos;asta come giocatore (con la mia rosa)
          </label>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-slate-200">Partecipanti e crediti</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Numero partecipanti"
              type="number"
              min={2}
              max={20}
              value={numParticipants}
              onChange={(e) => setNumParticipants(Number(e.target.value))}
            />
            <Input
              label="Crediti iniziali"
              type="number"
              min={1}
              value={creditsIniziali}
              onChange={(e) => setCreditsIniziali(Number(e.target.value))}
            />
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-slate-200">Composizione rosa</h2>
          <Input
            label="Numero totale giocatori in rosa"
            type="number"
            min={1}
            value={rosterSize}
            onChange={(e) => setRosterSize(Number(e.target.value))}
          />
          <div className="grid grid-cols-4 gap-3">
            <Input label="Portieri" type="number" min={0} value={slotP} onChange={(e) => setSlotP(Number(e.target.value))} />
            <Input label="Difensori" type="number" min={0} value={slotD} onChange={(e) => setSlotD(Number(e.target.value))} />
            <Input label="Centrocamp." type="number" min={0} value={slotC} onChange={(e) => setSlotC(Number(e.target.value))} />
            <Input label="Attaccanti" type="number" min={0} value={slotA} onChange={(e) => setSlotA(Number(e.target.value))} />
          </div>
          <p className={`text-sm ${slotsTotal === rosterSize ? "text-emerald-400" : "text-amber-400"}`}>
            Totale slot: {slotsTotal} / {rosterSize}
          </p>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-slate-200">Timer e spareggi</h2>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Durata timer offerta"
              value={timerSeconds}
              onChange={(e) => setTimerSeconds(Number(e.target.value))}
            >
              {TIMER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} secondi
                </option>
              ))}
            </Select>
            <Select
              label="Durata timer spareggio"
              value={tiebreakSeconds}
              onChange={(e) => setTiebreakSeconds(Number(e.target.value))}
            >
              {TIEBREAK_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} secondi
                </option>
              ))}
            </Select>
          </div>
          <Select
            label="Regola in caso di pareggio"
            value={tiebreakRule}
            onChange={(e) => setTiebreakRule(e.target.value as typeof tiebreakRule)}
          >
            <option value="min_increment_1">Offerta minima superiore di 1 credito</option>
            <option value="free">Offerta libera (≥ importo pareggiato)</option>
            <option value="max_credits">Vince chi ha più crediti disponibili (nessun nuovo turno)</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={passLimitEnabled} onChange={(e) => setPassLimitEnabled(e.target.checked)} className="rounded" />
            Limita il numero di &quot;passo&quot; consecutivi per partecipante
          </label>
          {passLimitEnabled && (
            <Input
              label="Massimo pass consecutivi"
              type="number"
              min={1}
              value={passLimit}
              onChange={(e) => setPassLimit(Number(e.target.value))}
            />
          )}
        </Card>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <Button type="submit" size="lg" disabled={loading}>
          {loading ? "Creazione in corso..." : "Crea la lega e ottieni il codice"}
        </Button>
      </form>
    </main>
  );
}
