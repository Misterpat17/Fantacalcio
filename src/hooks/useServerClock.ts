"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Il timer NON deve dipendere dall'orologio del dispositivo: calcoliamo
// un offset (serverTime - Date.now()) confrontando il nostro orologio con
// GET /api/time, e lo ri-sincronizziamo periodicamente per correggere la
// deriva. `now()` restituisce sempre "l'ora del server, adesso".
export function useServerClock() {
  const offsetRef = useRef(0);
  const [ready, setReady] = useState(false);

  const sync = useCallback(async () => {
    try {
      const t0 = Date.now();
      const res = await fetch("/api/time", { cache: "no-store" });
      const { serverTime } = await res.json();
      const t1 = Date.now();
      const roundTrip = t1 - t0;
      const serverNow = new Date(serverTime).getTime() + roundTrip / 2;
      offsetRef.current = serverNow - t1;
      setReady(true);
    } catch {
      // in caso di errore manteniamo l'offset precedente
    }
  }, []);

  useEffect(() => {
    sync();
    const interval = setInterval(sync, 30_000);
    return () => clearInterval(interval);
  }, [sync]);

  const now = useCallback(() => Date.now() + offsetRef.current, []);

  return { now, ready, resync: sync };
}
