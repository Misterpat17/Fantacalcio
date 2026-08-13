"use client";

import { useEffect, useState } from "react";

// Millisecondi rimanenti fino a `endsAtIso`, calcolati con l'orologio
// sincronizzato col server (vedi useServerClock). Si aggiorna ogni 200ms
// per un countdown fluido.
export function useCountdown(endsAtIso: string | null | undefined, now: () => number) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAtIso) {
      setRemainingMs(null);
      return;
    }
    const endsAt = new Date(endsAtIso).getTime();
    const tick = () => setRemainingMs(Math.max(0, endsAt - now()));
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [endsAtIso, now]);

  return remainingMs;
}
