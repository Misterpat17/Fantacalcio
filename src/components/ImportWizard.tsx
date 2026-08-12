"use client";

import { useRef, useState } from "react";
import { Button } from "./ui/Button";
import { Select } from "./ui/Input";
import { RoleBadge } from "./RoleBadge";
import {
  buildImportRows,
  ColumnRole,
  guessColumnMapping,
  ImportRow,
  ImportRowError,
  ParsedSheet,
  parseWorkbookFile,
} from "@/lib/excel";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { Ruolo } from "@/lib/types";

const COLUMN_ROLE_LABEL: Record<ColumnRole, string> = {
  ruolo: "Ruolo (P/D/C/A)",
  nome: "Nome giocatore",
  squadra: "Squadra",
  quotazione: "Quotazione",
  external_id: "ID giocatore",
  ignora: "Ignora colonna",
};

export function ImportWizard({ code, token, onImported }: { code: string; token: string | null; onImported: () => void }) {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<number, ColumnRole>>({});
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSheet = sheets[sheetIndex];
  const { valid, errors } = activeSheet ? buildImportRows(activeSheet.rows, mapping) : { valid: [] as ImportRow[], errors: [] as ImportRowError[] };

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    try {
      const parsed = await parseWorkbookFile(file);
      setSheets(parsed);
      setSheetIndex(0);
      setMapping(guessColumnMapping(parsed[0]?.headerRow || []));
    } catch {
      setError("Impossibile leggere il file. Assicurati che sia un file Excel (.xlsx) valido.");
    }
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await apiFetch<{ imported: number }>(`/api/leagues/${code}/players/import`, {
        method: "POST",
        token,
        body: { rows: valid, mode },
      });
      setResult(`Importati ${res.imported} giocatori con successo.`);
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore durante l'importazione.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          📄 Carica file Excel
        </Button>
        <span className="text-xs text-slate-500">
          Formato Lega Fantacalcio (colonne R / Nome / Squadra / Qt.A) o simili.
        </span>
      </div>

      {sheets.length > 1 && (
        <Select label="Foglio" value={sheetIndex} onChange={(e) => setSheetIndex(Number(e.target.value))} className="w-auto">
          {sheets.map((s, i) => (
            <option key={s.sheetName} value={i}>
              {s.sheetName}
            </option>
          ))}
        </Select>
      )}

      {activeSheet && (
        <>
          <div>
            <h3 className="font-bold text-sm text-slate-300 mb-2">Associa le colonne</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {activeSheet.headerRow.map((header, idx) => (
                <div key={idx} className="space-y-1">
                  <p className="text-xs text-slate-500 truncate" title={header}>
                    Colonna: <span className="font-mono">{header || `#${idx + 1}`}</span>
                  </p>
                  <Select
                    value={mapping[idx] || "ignora"}
                    onChange={(e) => setMapping((m) => ({ ...m, [idx]: e.target.value as ColumnRole }))}
                  >
                    {Object.entries(COLUMN_ROLE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-sm text-slate-300 mb-2">
              Anteprima ({valid.length} validi{errors.length > 0 ? `, ${errors.length} da ignorare` : ""})
            </h3>
            <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800">
              {valid.slice(0, 50).map((row, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <RoleBadge ruolo={row.ruolo as Ruolo} size="sm" />
                  <span className="flex-1 truncate">{row.nome}</span>
                  <span className="text-slate-500 text-xs">{row.squadra}</span>
                  <span className="text-slate-500 text-xs w-10 text-right">{row.quotazione ?? "—"}</span>
                </div>
              ))}
              {valid.length > 50 && (
                <p className="text-xs text-slate-500 px-3 py-2">...e altri {valid.length - 50} giocatori</p>
              )}
            </div>
            {errors.length > 0 && (
              <details className="mt-2 text-xs text-amber-400">
                <summary className="cursor-pointer">{errors.length} righe non importabili</summary>
                <ul className="mt-1 space-y-0.5 text-slate-500">
                  {errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Riga {e.rowIndex + 2}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Select value={mode} onChange={(e) => setMode(e.target.value as "replace" | "append")} className="w-auto">
              <option value="replace">Sostituisci elenco disponibili</option>
              <option value="append">Aggiungi ai giocatori esistenti</option>
            </Select>
            <Button onClick={handleImport} disabled={importing || valid.length === 0}>
              {importing ? "Importazione in corso..." : `Importa ${valid.length} giocatori`}
            </Button>
          </div>

          {result && <p className="text-sm text-emerald-400">{result}</p>}
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </>
      )}
    </div>
  );
}
