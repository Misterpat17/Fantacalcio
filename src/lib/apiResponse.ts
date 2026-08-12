import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "./auth";

export function jsonError(status: number, code: string, message?: string) {
  return NextResponse.json({ error: code, code, message: message || code }, { status });
}

// Le funzioni SQL segnalano gli errori applicativi con
// `raise exception 'CODICE:dettaglio'`. Qui li trasformiamo in un errore
// tipizzato lato TypeScript in modo che le API route possano rispondere
// con lo status HTTP corretto e un messaggio leggibile.
export class RpcError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

export async function callRpc<T = unknown>(
  sb: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const raw = error.message || "";
    // I messaggi postgres arrivano spesso come "CODICE:dettaglio" oppure
    // preceduti da testo aggiuntivo del driver: cerchiamo il pattern.
    const match = raw.match(/([A-Z_]+)(?::\s*([^\n]*))?$/);
    if (match) {
      throw new RpcError(match[1], match[2]);
    }
    throw new RpcError("RPC_ERROR", raw);
  }
  return data as T;
}

// Estrae un messaggio leggibile da qualunque tipo di errore. Gli errori
// di Supabase/Postgrest (es. da `{ data, error } = await sb.from(...)`)
// sono oggetti con una proprietà `message`, ma NON sono istanze di
// `Error`: senza questo helper finivano nel ramo generico "Errore
// interno", nascondendo la causa reale (RLS, tabella inesistente, ecc.)
// sia all'utente che nei log.
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const pgErr = err as { message: string; details?: string; hint?: string; code?: string };
    const parts = [pgErr.message, pgErr.details, pgErr.hint].filter(Boolean);
    return parts.join(" — ") + (pgErr.code ? ` (codice: ${pgErr.code})` : "");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Errore interno";
  }
}

export function handleRouteError(err: unknown) {
  if (err instanceof AuthError) {
    return jsonError(err.status, err.message);
  }
  if (err instanceof RpcError) {
    const statusByCode: Record<string, number> = {
      NOT_YOUR_TURN: 403,
      INVALID_PHASE: 409,
      PLAYER_NOT_AVAILABLE: 409,
      PLAYER_NOT_FOUND: 404,
      ROUND_NOT_FOUND: 404,
      ROUND_CLOSED: 409,
      ROUND_EXPIRED: 409,
      NOT_ELIGIBLE: 403,
      ROLE_FULL: 409,
      ROLE_FULL_FOR_CALLER: 409,
      AMOUNT_TOO_HIGH: 422,
      AMOUNT_TOO_LOW: 422,
      INVALID_AMOUNT: 422,
      PASS_LIMIT_REACHED: 409,
      AUCTION_NOT_FOUND: 404,
      NOT_PAUSED: 409,
      ROSTER_NOT_FOUND: 404,
      PLAYER_ALREADY_SOLD: 409,
    };
    const status = statusByCode[err.code] || 400;
    return jsonError(status, err.code, err.detail);
  }
  console.error(err);
  return jsonError(500, "INTERNAL_ERROR", errorMessage(err));
}
