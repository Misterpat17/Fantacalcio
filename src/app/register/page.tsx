"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim() || !email.trim() || password.length < 6) {
      setError("Compila nome, email e una password di almeno 6 caratteri.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabaseBrowser().auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (signUpError) {
        setError(messageFor(signUpError.message));
        return;
      }
      if (!data.session) {
        // Capita se la conferma email è ancora attiva sul progetto Supabase.
        setError(
          "Registrazione effettuata, ma serve confermare l'email prima di accedere. Se non ti aspettavi questo messaggio, chiedi all'amministratore di disattivare la conferma email in Supabase."
        );
        return;
      }
      router.push("/");
    } catch {
      setError("Errore di connessione. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-black tracking-tight">Crea il tuo account</h1>
          <p className="text-slate-400 text-sm">Ti serve per entrare in una lega ed essere riconosciuto ad ogni accesso.</p>
        </div>

        <Card className="p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Il tuo nome"
              placeholder="es. Mario"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
            />
            <Input
              label="Email"
              type="email"
              placeholder="tu@esempio.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              placeholder="min. 6 caratteri"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Registrazione in corso..." : "Registrati"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-slate-400">
          Hai già un account?{" "}
          <Link href="/login" className="text-sky-400 font-medium">
            Accedi
          </Link>
        </p>
      </div>
    </main>
  );
}

function messageFor(raw: string): string {
  if (raw.includes("already registered") || raw.includes("already exists")) {
    return "Esiste già un account con questa email. Prova ad accedere.";
  }
  if (raw.includes("Password should be")) {
    return "La password deve avere almeno 6 caratteri.";
  }
  if (raw.includes("valid email")) {
    return "Inserisci un'email valida.";
  }
  return "Non è stato possibile completare la registrazione.";
}
