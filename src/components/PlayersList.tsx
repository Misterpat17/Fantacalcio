"use client";

import { useMemo, useState } from "react";
import { RoleBadge } from "./RoleBadge";
import { Button } from "./ui/Button";
import { Input, Select } from "./ui/Input";
import { Player, RUOLI, Ruolo } from "@/lib/types";

export function PlayersList({
  players,
  onCall,
  canCall,
  emptyLabel = "Nessun giocatore trovato.",
  maxHeightClass = "max-h-[50vh]",
}: {
  players: Player[];
  onCall?: (player: Player) => void;
  canCall?: boolean;
  emptyLabel?: string;
  maxHeightClass?: string;
}) {
  const [search, setSearch] = useState("");
  const [ruoloFilter, setRuoloFilter] = useState<Ruolo | "">("");
  const [squadraFilter, setSquadraFilter] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  const squadre = useMemo(() => {
    const set = new Set<string>();
    players.forEach((p) => p.squadra && set.add(p.squadra));
    return Array.from(set).sort();
  }, [players]);

  const filtered = useMemo(() => {
    return players
      .filter((p) => !onlyAvailable || p.stato === "available")
      .filter((p) => !ruoloFilter || p.ruolo === ruoloFilter)
      .filter((p) => !squadraFilter || p.squadra === squadraFilter)
      .filter((p) => !search || p.nome.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.quotazione ?? 0) - (a.quotazione ?? 0));
  }, [players, onlyAvailable, ruoloFilter, squadraFilter, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Cerca giocatore..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[140px]"
        />
        <Select value={ruoloFilter} onChange={(e) => setRuoloFilter(e.target.value as Ruolo | "")} className="w-auto">
          <option value="">Tutti i ruoli</option>
          {RUOLI.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select value={squadraFilter} onChange={(e) => setSquadraFilter(e.target.value)} className="w-auto">
          <option value="">Tutte le squadre</option>
          {squadre.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 px-2">
          <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="rounded" />
          Solo disponibili
        </label>
      </div>

      <div className={`space-y-1 overflow-y-auto pr-1 ${maxHeightClass}`}>
        {filtered.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">{emptyLabel}</p>}
        {filtered.map((player) => (
          <div
            key={player.id}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
              player.stato === "sold"
                ? "border-slate-800/50 bg-slate-900/20 opacity-50"
                : player.stato === "removed"
                ? "border-slate-800/50 bg-slate-900/20 opacity-30"
                : "border-slate-800 bg-slate-900/40 hover:bg-slate-800/50"
            }`}
          >
            <RoleBadge ruolo={player.ruolo} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{player.nome}</div>
              <div className="text-xs text-slate-500 truncate">
                {player.squadra || "—"}
                {player.quotazione !== null && <span> · Qt. {player.quotazione}</span>}
              </div>
            </div>
            {player.stato === "sold" && <span className="text-xs text-slate-500 shrink-0">venduto</span>}
            {player.stato === "removed" && <span className="text-xs text-slate-500 shrink-0">rimosso</span>}
            {player.stato === "available" && canCall && onCall && (
              <Button size="sm" variant="success" onClick={() => onCall(player)} className="shrink-0">
                Chiama
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
