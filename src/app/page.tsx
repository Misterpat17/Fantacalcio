"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { saveSession } from "@/lib/session";

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !name.trim()) return;
    setLoading(true);
    try {
      const upperCode = code.trim().toUpperCase();
      const res = await apiFetch<{ token: string; participantId: string; leagueId: string; isAdmin: boolean }>(
        `/api/leagues/${upperCode}/join`,
        { method: "POST", body: { displayName: name.trim() } }
      );
      saveSession({
        token: res.token,
        participantId: res.participantId,
        displayName: name.trim(),
        isAdmin: res.isAdmin,
        leagueCode: upperCode,
      });
      router.push(`/league/${upperCode}/dashboard`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(messageFor(err.code));
      } else {
        setError("Errore di connessione. Riprova.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tight">
            ⚽ ASTA <span className="text-sky-400">FANTACALCIO</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Asta a busta chiusa, con chiamata a turno, in tempo reale — fino a 8 partecipanti.
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <h2 className="font-bold text-lg">Entra in una lega</h2>
          <form onSubmit={handleJoin} className="space-y-3">
            <Input
              label="Codice lega"
              placeholder="es. FANTA2026"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              maxLength={16}
            />
            <Input
              label="Il tuo nome"
              placeholder="es. Mario"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entra nell'asta"}
            </Button>
          </form>
        </Card>

        <div className="flex items-center gap-3 text-slate-500 text-xs">
          <div className="h-px flex-1 bg-slate-800" />
          oppure
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        <Card className="p-6 space-y-3">
          <h2 className="font-bold text-lg">Sei l&apos;amministratore?</h2>
          <p className="text-sm text-slate-400">
            Crea una nuova asta, importa i giocatori da Excel e gestisci l&apos;intera serata.
          </p>
          <Link href="/crea">
            <Button variant="secondary" className="w-full">
              Crea una nuova asta
            </Button>
          </Link>
        </Card>
      </div>
    </main>
  );
}

function messageFor(code: string): string {
  switch (code) {
    case "LEAGUE_NOT_FOUND":
      return "Nessuna lega trovata con questo codice.";
    case "NAME_TAKEN":
      return "Questo nome è già stato usato in questa lega.";
    case "LEAGUE_FULL":
      return "La lega ha già raggiunto il numero massimo di partecipanti.";
    case "LEAGUE_NOT_JOINABLE":
      return "L'asta è già iniziata: chiedi all'admin di aggiungerti manualmente.";
    default:
      return "Non è stato possibile completare l'operazione.";
  }
}
