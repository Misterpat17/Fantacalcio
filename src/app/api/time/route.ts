import { NextResponse } from "next/server";

// Endpoint leggero per la sincronizzazione dell'orologio: ogni client
// calcola l'offset (serverTime - Date.now()) e lo usa per mostrare un
// timer coerente con l'orario ufficiale del server, indipendentemente
// dall'orologio locale del dispositivo.
export async function GET() {
  return NextResponse.json({ serverTime: new Date().toISOString() });
}

export const dynamic = "force-dynamic";
