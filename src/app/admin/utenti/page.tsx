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
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || newPassword.length < 6) {
      setFeedback({ ok: false, text: "Compila nome, email e una password di almeno 6 caratteri." });
      return;
    }
    await run(
      () =>
        apiFetch("/api/admin/users", {
          method: "POST",
          token,
          body: { displayName: newName.trim(), email: newEmail.trim(), password: newPassword },
        }),
      "Utente creato."
    );
    setNewName("");
    setNewEmail("");
    setNewPassword("");
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
            Crea account per conto di altri, modifica nome/email/password, o elimina un account (lo rimuove anche da
            tutte le leghe a cui partecipa).
          </p>
        </div>

        {feedback && (
          <div className={`rounded-lg px-4 py-2 text-sm ${feedback.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
            {feedback.text}
          </div>
        )}

        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-slate-200">Crea nuovo utente</h2>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-3 gap-2">
            <Input placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <Input placeholder="Password (min. 6)" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <Button type="submit" size="sm" disabled={busy} className="sm:col-span-3">
              Crea utente
            </Button>
          </form>
        </Card>

        <Card className="p-5 space-y-3">
          {users === null && <p className="text-sm text-slate-500">Caricamento...</p>}
          {users?.length === 0 && <p className="text-sm text-slate-500">Nessun utente registrato.</p>}
          {users?.map((u) => (
            <UserRowItem
              key={u.id}
              user={u}
              busy={busy}
              editing={editingId === u.id}
              onToggleEdit={() => setEditingId(editingId === u.id ? null : u.id)}
              onSave={(patch) =>
                run(() => apiFetch(`/api/admin/users/${u.id}`, { method: "PATCH", token, body: patch }), "Utente aggiornato.").then(
                  () => setEditingId(null)
                )
              }
              onDelete={() => {
                if (!confirm(`Eliminare definitivamente l'account di ${u.display_name}? Verrà rimosso da tutte le leghe.`)) return;
                run(() => apiFetch(`/api/admin/users/${u.id}`, { method: "DELETE", token }), "Account eliminato.");
              }}
            />
          ))}
        </Card>
      </div>
    </main>
  );
}

function UserRowItem({
  user,
  busy,
  editing,
  onToggleEdit,
  onSave,
  onDelete,
}: {
  user: UserRow;
  busy: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onSave: (patch: { displayName?: string; email?: string; password?: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(user.display_name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");

  return (
    <div className="border border-slate-800 rounded-lg px-3 py-2 text-sm space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{user.display_name}</p>
          <p className="text-xs text-slate-500 truncate">
            {user.email} {user.is_admin && <span className="text-sky-400 font-semibold">· amministratore</span>}
          </p>
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onToggleEdit}>
          {editing ? "Chiudi" : "Modifica"}
        </Button>
        {!user.is_admin && (
          <Button size="sm" variant="danger" disabled={busy} onClick={onDelete}>
            Elimina
          </Button>
        )}
      </div>

      {editing && (
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            label="Nuova password (lascia vuoto per non cambiarla)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="min. 6 caratteri"
          />
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              const patch: { displayName?: string; email?: string; password?: string } = {};
              if (name.trim() && name.trim() !== user.display_name) patch.displayName = name.trim();
              if (email.trim() && email.trim() !== user.email) patch.email = email.trim();
              if (password) patch.password = password;
              onSave(patch);
            }}
          >
            Salva modifiche
          </Button>
        </div>
      )}
    </div>
  );
}
