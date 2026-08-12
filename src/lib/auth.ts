import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { supabaseServer } from "./supabaseServer";

// Genera un token di sessione casuale (dato al browser del partecipante),
// e ne calcola l'hash sha256 (salvato in DB al posto del token in chiaro).
// In questo modo la tabella `participants` può essere leggibile
// pubblicamente (serve per la dashboard realtime) senza permettere a un
// partecipante di "rubare" l'identità di un altro leggendo il token di
// qualcun altro dal database.
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

export interface AuthedParticipant {
  id: string;
  league_id: string;
  display_name: string;
  is_admin: boolean;
}

// Verifica il token del partecipante e ritorna la sua identità autenticata.
// Il confronto avviene lato server tramite la service_role key: il token
// in chiaro non lascia mai il browser del proprietario.
export async function requireParticipant(
  req: NextRequest,
  leagueId: string
): Promise<AuthedParticipant> {
  const token = getBearerToken(req);
  if (!token) {
    throw new AuthError("MISSING_TOKEN", 401);
  }
  const tokenHash = hashToken(token);
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("participants")
    .select("id, league_id, display_name, is_admin")
    .eq("league_id", leagueId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    throw new AuthError("INVALID_TOKEN", 401);
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

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
