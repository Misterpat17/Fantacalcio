"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("Email o password non corretti.");
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
          <h1 className="text-2xl font-black tracking-tight">Accedi</h1>
          <p className="text-slate-400 text-sm">Entra con l&apos;account che hai registrato.</p>
        </div>

        <Card className="p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Accesso in corso..." : "Accedi"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-slate-400">
          Non hai ancora un account?{" "}
          <Link href="/register" className="text-sky-400 font-medium">
            Registrati
          </Link>
        </p>
      </div>
    </main>
  );
}
