"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export interface AuthUser {
  id: string;
  email: string | null;
}

// Stato di autenticazione basato sulla sessione reale di Supabase Auth.
// Sostituisce il vecchio "session.ts" (localStorage custom per lega):
// qui la persistenza e il rinnovo del token sono già gestiti da
// supabase-js (vedi supabaseBrowser.ts), noi ci limitiamo a osservarne
// lo stato e a esporre il token corrente per le chiamate API.
//
// `loading` è true SOLO durante il controllo iniziale della sessione
// (utile per non "sbattere" l'utente su una pagina di login mentre la
// sessione salvata sta ancora venendo letta).
export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const sb = supabaseBrowser();

    sb.auth.getSession().then(({ data }) => setSession(data.session ?? null));

    const { data: sub } = sb.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabaseBrowser().auth.signOut();
  }, []);

  const user: AuthUser | null = session
    ? { id: session.user.id, email: session.user.email ?? null }
    : null;

  return {
    loading: session === undefined,
    session: session ?? null,
    user,
    token: session?.access_token ?? null,
    signOut,
  };
}
