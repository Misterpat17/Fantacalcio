"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { saveSession } from "@/lib/session";

export function AdminLogin({ code, onLoggedIn }: { code: string; onLoggedIn: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; participantId: string }>(`/api/leagues/${code}/admin/login`, {
        method: "POST",
        body: { displayName, password },
      });
      saveSession({
        token: res.token,
        participantId: res.participantId,
        displayName,
        isAdmin: true,
        leagueCode: code,
      });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof ApiError ? "Nome o password admin non corretti." : "Errore di rete.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <Card className="p-6 w-full max-w-sm space-y-4">
        <h1 className="font-bold text-lg">Accesso amministratore</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input label="Nome admin" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Accesso..." : "Accedi"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
