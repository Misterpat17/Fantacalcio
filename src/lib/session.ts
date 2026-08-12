"use client";

// Gestione della sessione del partecipante lato browser. Il token è
// generato dal server al momento dell'ingresso in lega e salvato SOLO
// qui (localStorage): il server conserva solo l'hash. Permette di
// riprendere l'asta se il browser viene chiuso/ricaricato.

export interface StoredSession {
  token: string;
  participantId: string;
  displayName: string;
  isAdmin: boolean;
  leagueCode: string;
}

function storageKey(leagueCode: string) {
  return `fanta:${leagueCode.toUpperCase()}`;
}

export function saveSession(session: StoredSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(session.leagueCode), JSON.stringify(session));
}

export function loadSession(leagueCode: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(leagueCode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession(leagueCode: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(leagueCode));
}
