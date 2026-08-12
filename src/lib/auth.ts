import { NextRequest } from "next/server";
import { supabaseServer } from "./supabaseServer";

// Autenticazione basata su account reali (Supabase Auth) invece del
// vecchio token casuale per lega. Il client invia in ogni richiesta il
// proprio access token Supabase (Authorization: Bearer <access_token>),
// generato al login/registrazione e rinnovato automaticamente dalla
// libreria supabase-js. Qui lo verifichiamo chiamando l'endpoint Auth di
// Supabase (mai fidandosi ciecamente di un id passato dal client).
export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

export async function requireUser(req: NextRequest): Promise<AuthedUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new AuthError("MISSING_TOKEN", 401);
  }
  const sb = supabaseServer();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError("INVALID_TOKEN", 401);
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

export interface AuthedParticipant {
  id: string;
  league_id: string;
  display_name: string;
  is_admin: boolean;
  user_id: string;
}

// Verifica che l'utente autenticato sia iscritto (participants) alla
// lega richiesta, e ritorna la sua identità di partecipante.
export async function requireParticipant(
  req: NextRequest,
  leagueId: string
): Promise<AuthedParticipant> {
  const user = await requireUser(req);
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("participants")
    .select("id, league_id, display_name, is_admin, user_id")
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    throw new AuthError("NOT_A_PARTICIPANT", 403);
  }
  return data as AuthedParticipant;
}

export async function requireAdmin(
  req: NextRequest,
  leagueId: string
): Promise<AuthedParticipant> {
  const participant = await requireParticipant(req, leagueId);
  if (!participant.is_admin) {
    throw new AuthError("NOT_ADMIN", 403);
  }
  return participant;
}

// Amministratore GLOBALE (profiles.is_admin = true): un solo account in
// tutto il sistema, imposto manualmente via SQL. Serve per le azioni non
// legate a una lega specifica: creare una nuova lega, gestire gli utenti
// registrati.
export async function requireGlobalAdmin(
  req: NextRequest
): Promise<AuthedUser & { displayName: string }> {
  const user = await requireUser(req);
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("profiles")
    .select("is_admin, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !data.is_admin) {
    throw new AuthError("NOT_ADMIN", 403);
  }
  return { ...user, displayName: data.display_name };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
