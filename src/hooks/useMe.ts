"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { Participant } from "@/lib/types";

interface MeResponse {
  participant: Participant;
  myBid: { decision: string; amount: number | null } | null;
  maxBid: number | null;
  roleAvailable: boolean | null;
}

// Dati privati del partecipante autenticato (i propri crediti aggiornati,
// la propria scelta sul round corrente, l'offerta massima consentita, e
// la propria identità di partecipante — usata anche per il gating delle
// pagine dashboard/admin). Se l'utente è loggato ma non fa parte di
// questa lega, l'API risponde 403 NOT_A_PARTICIPANT: lo esponiamo come
// `error` così le pagine possono mostrare un invito a iscriversi.
export function useMe(code: string, token: string | null, roundId: string | null | undefined) {
  const [data, setData] = useState<MeResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<MeResponse>(`/api/leagues/${code}/me`, { token });
      setData(res);
      setError(null);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err : new ApiError("Errore di rete.", 0, "NETWORK_ERROR"));
    } finally {
      setLoading(false);
    }
  }, [code, token]);

  useEffect(() => {
    refresh();
  }, [refresh, roundId]);

  return { data, error, loading, refresh };
}
