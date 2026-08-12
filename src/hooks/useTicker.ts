"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/apiClient";

// Ogni client attivo invia un "tick" al server ~1 volta al secondo
// mentre un timer è in corso. È il meccanismo che garantisce la
// chiusura del round anche in assenza di un processo server persistente
// (infrastruttura serverless). Vedi commenti in /api/.../tick/route.ts.
export function useTicker(code: string, active: boolean, onResolved?: () => void) {
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch<{ noop: boolean }>(`/api/leagues/${code}/tick`, { method: "POST" });
        if (!res.noop) onResolved?.();
      } catch {
        // ignora errori di rete transitori
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [code, active, onResolved]);
}
