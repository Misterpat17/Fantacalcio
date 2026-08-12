"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  created_at: string;
}

export default function UtentiPage() {
  const router = useRouter();
  const { loading: authLoading, user, token } = useSupabaseAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<{ users: UserRow[] }>("/api/admin/users", { token });
      setUsers(res.users);
      setForbidden(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_ADMIN") setForbidden(true);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(action: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ ok: true, text: successText });
      await refresh();
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof ApiError ? err.message : "Errore imprevisto." });
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !user) {
    return <main className="flex-1 flex items-center justify-center text-slate-400">Caricamento...</main>;
  }

  if (forbidden) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="p-6 max-w-md text-center space-y-2">
          <h1 className="text-xl font-bold text-rose-400">Accesso riservato</h1>
          <p className="text-sm text-slate-400">Solo l&apos;amministratore può gestire gli utenti registrati.</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex-1 flex justify-center px-4 py-10">
      <div className="w-full max-w-2xl flex flex-col gap-5">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
            ← Torna alla home
          </Link>
          <h1 className="text-2xl font-black mt-2">Utenti registrati</h1>
          <p className="text-slate-400 text-sm mt-1">
            Elenco di tutti gli account. Rinominarli qui cambia il nome visualizzato di default (una lega può comunque
            avere un nome personalizzato per quella lega). Eliminare un account lo rimuove anche da tutte le leghe a cui
            partecipa.
          </p>
        </div>

        {feedback && (
          <div className={`rounded-lg px-4 py-2 text-sm ${feedback.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
            {feedback.text}
          </div>
        )}

        <Card className="p-5 space-y-3">
          {users === null && <p className="text-sm text-slate-500">Caricamento...</p>}
          {users?.length === 0 && <p className="text-sm text-slate-500">Nessun utente registrato.</p>}
          {users?.map((u) => {
            const draft = drafts[u.id] ?? u.display_name;
            const changed = draft.trim() !== "" && draft.trim() !== u.display_name;
            return (
              <div key={u.id} className="flex items-center gap-2 text-sm border border-slate-800 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <Input
                    className="px-2 py-1"
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <p className="text-xs text-slate-500 truncate mt-1">
                    {u.email} {u.is_admin && <span className="text-sky-400 font-semibold">· amministratore</span>}
                  </p>
                </div>
                {changed && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => apiFetch(`/api/admin/users/${u.id}`, { method: "PATCH", token, body: { displayName: draft.trim() } }),
                        "Nome aggiornato."
                      )
                    }
                  >
                    Salva
                  </Button>
                )}
                {!u.is_admin && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Eliminare definitivamente l'account di ${u.display_name}? Verrà rimosso da tutte le leghe.`)) return;
                      run(() => apiFetch(`/api/admin/users/${u.id}`, { method: "DELETE", token }), "Account eliminato.");
                    }}
                  >
                    Elimina
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      </div>
    </main>
  );
}
