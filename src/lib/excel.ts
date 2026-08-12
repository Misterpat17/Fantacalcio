"use client";

// Parsing lato client del file Excel di Lega Fantacalcio (o formati simili)
// con SheetJS. I giocatori vengono importati SOLO dopo che l'utente ha
// verificato l'anteprima e (se necessario) corretto la mappatura colonne.

import * as XLSX from "xlsx";

export interface ParsedSheet {
  sheetName: string;
  headerRow: string[];
  rows: (string | number | null)[][];
}

export async function parseWorkbookFile(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  return wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const raw: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      blankrows: false,
    });
    if (raw.length === 0) return { sheetName, headerRow: [], rows: [] };
    const headerRow = raw[0].map((h) => (h === null ? "" : String(h)));
    return { sheetName, headerRow, rows: raw.slice(1) };
  });
}

export type ColumnRole = "ruolo" | "nome" | "squadra" | "quotazione" | "external_id" | "ignora";

const HEADER_HINTS: Record<ColumnRole, string[]> = {
  ruolo: ["r", "ruolo", "rm"],
  nome: ["nome", "calciatore", "giocatore", "cognome"],
  squadra: ["squadra", "team", "club"],
  quotazione: ["qt.a", "qta", "quotazione", "quotazioneattuale", "prezzo", "qt.i", "qti"],
  external_id: ["id", "codice", "idfg"],
  ignora: [],
};

// Cerca di indovinare a quale campo corrisponde ciascuna colonna in base
// all'intestazione. L'utente può poi correggere manualmente (requisito
// "associare le colonne se il formato Excel cambia").
export function guessColumnMapping(headerRow: string[]): Record<number, ColumnRole> {
  const mapping: Record<number, ColumnRole> = {};
  const used = new Set<ColumnRole>();

  headerRow.forEach((raw, idx) => {
    const h = (raw || "").toString().trim().toLowerCase().replace(/\s+/g, "");
    let found: ColumnRole = "ignora";
    for (const role of Object.keys(HEADER_HINTS) as ColumnRole[]) {
      if (role === "ignora") continue;
      if (used.has(role)) continue;
      if (HEADER_HINTS[role].some((hint) => h === hint || h.includes(hint))) {
        found = role;
        break;
      }
    }
    if (found !== "ignora") used.add(found);
    mapping[idx] = found;
  });

  return mapping;
}

const RUOLO_ALIASES: Record<string, "P" | "D" | "C" | "A"> = {
  p: "P",
  por: "P",
  portiere: "P",
  d: "D",
  dif: "D",
  difensore: "D",
  c: "C",
  cen: "C",
  centrocampista: "C",
  a: "A",
  att: "A",
  attaccante: "A",
};

export function normalizeRuolo(value: unknown): "P" | "D" | "C" | "A" | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toLowerCase();
  return RUOLO_ALIASES[v] ?? null;
}

export interface ImportRow {
  external_id: string | null;
  nome: string;
  ruolo: "P" | "D" | "C" | "A";
  squadra: string | null;
  quotazione: number | null;
}

export interface ImportRowError {
  rowIndex: number;
  reason: string;
}

export function buildImportRows(
  rows: (string | number | null)[][],
  mapping: Record<number, ColumnRole>
): { valid: ImportRow[]; errors: ImportRowError[] } {
  const colFor = (role: ColumnRole): number | null => {
    const entry = Object.entries(mapping).find(([, r]) => r === role);
    return entry ? Number(entry[0]) : null;
  };

  const idxNome = colFor("nome");
  const idxRuolo = colFor("ruolo");
  const idxSquadra = colFor("squadra");
  const idxQuot = colFor("quotazione");
  const idxExt = colFor("external_id");

  const valid: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  rows.forEach((row, i) => {
    const nome = idxNome !== null ? row[idxNome] : null;
    const ruoloRaw = idxRuolo !== null ? row[idxRuolo] : null;
    const ruolo = normalizeRuolo(ruoloRaw);

    if (!nome || String(nome).trim() === "") {
      errors.push({ rowIndex: i, reason: "Nome mancante" });
      return;
    }
    if (!ruolo) {
      errors.push({ rowIndex: i, reason: `Ruolo non riconosciuto: "${ruoloRaw ?? ""}"` });
      return;
    }

    valid.push({
      external_id: idxExt !== null && row[idxExt] !== null ? String(row[idxExt]) : null,
      nome: String(nome).trim(),
      ruolo,
      squadra: idxSquadra !== null && row[idxSquadra] !== null ? String(row[idxSquadra]).trim() : null,
      quotazione:
        idxQuot !== null && row[idxQuot] !== null && row[idxQuot] !== ""
          ? Number(row[idxQuot])
          : null,
    });
  });

  return { valid, errors };
}
