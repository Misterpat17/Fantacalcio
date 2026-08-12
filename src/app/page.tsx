"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

interface MeResponse {
  displayName: string;
  isAdmin: boolean;
  email: string;
}

export default function HomePage() {
  const router = useRouter();
  const { loading: authLoading, user, token, signOut } = useSupabaseAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    apiFetch<MeResponse>("/api/me", { token })
      .then(setMe)
      .catch(() => setMe(null));
  }, [token]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !token) return;
    setLoading(true);
    try {
      const upperCode = code.trim().toUpperCase();
      await apiFetch(`/api/leagues/${upperCode}/join`, { method: "POST", token });
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

  if (authLoading) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  if (!user) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black tracking-tight">
              ⚽ ASTA <span className="text-sky-400">FANTACALCIO</span>
            </h1>
            <p className="text-slate-400 text-sm">
              Asta a busta chiusa, con chiamata a turno, in tempo reale.
            </p>
          </div>
          <Card className="p-6 space-y-3 text-center">
            <p className="text-slate-300">Accedi o registrati per entrare in una lega.</p>
            <div className="flex flex-col gap-2">
              <Link href="/login">
                <Button className="w-full">Accedi</Button>
              </Link>
              <Link href="/register">
                <Button variant="secondary" className="w-full">
                  Registrati
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tight">
            ⚽ ASTA <span className="text-sky-400">FANTACALCIO</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Ciao {me?.displayName || user.email} — entra in una lega con il codice che ti hanno dato.
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
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entra nell'asta"}
            </Button>
          </form>
        </Card>

        {me?.isAdmin && (
          <>
            <div className="flex items-center gap-3 text-slate-500 text-xs">
              <div className="h-px flex-1 bg-slate-800" />
              amministratore
              <div className="h-px flex-1 bg-slate-800" />
            </div>
            <Card className="p-6 space-y-3">
              <h2 className="font-bold text-lg">Pannello amministratore</h2>
              <p className="text-sm text-slate-400">Crea una nuova asta o gestisci gli utenti registrati.</p>
              <div className="flex flex-col gap-2">
                <Link href="/crea">
                  <Button variant="secondary" className="w-full">
                    Crea una nuova asta
                  </Button>
                </Link>
                <Link href="/admin/utenti">
                  <Button variant="secondary" className="w-full">
                    Gestisci utenti registrati
                  </Button>
                </Link>
              </div>
            </Card>
          </>
        )}

        <button onClick={() => signOut()} className="text-center text-sm text-slate-500 hover:text-slate-300">
          Esci
        </button>
      </div>
    </main>
  );
}

function messageFor(code: string): string {
  switch (code) {
    case "LEAGUE_NOT_FOUND":
      return "Nessuna lega trovata con questo codice.";
    case "LEAGUE_FULL":
      return "La lega ha già raggiunto il numero massimo di partecipanti.";
    case "LEAGUE_NOT_JOINABLE":
      return "L'asta è già iniziata: chiedi all'admin di aggiungerti manualmente.";
    default:
      return "Non è stato possibile completare l'operazione.";
  }
}
