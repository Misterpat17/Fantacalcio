"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { Participant } from "@/lib/types";

interface MeResponse {
  participant: Participant;
  myBid: { decision: string; amount: number | null } | null;
  maxBid: number | null;
  roleAvailable: boolean | null;
}

// Dati privati del partecipante autenticato (i propri crediti aggiornati,
// la propria scelta sul round corrente, l'offerta massima consentita).
export function useMe(code: string, token: string | null, roundId: string | null | undefined) {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<MeResponse>(`/api/leagues/${code}/me`, { token });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [code, token]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, roundId]);

  return { data, loading, refresh };
}
