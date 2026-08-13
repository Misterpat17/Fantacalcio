import { RoleBadge } from "./RoleBadge";
import { TimerDisplay } from "./TimerDisplay";
import { Player, RUOLO_LABEL } from "@/lib/types";

export function PlayerHero({
  player,
  callerName,
  remainingMs,
  respondedCount,
  participatingCount,
  eligibleCount,
  tieBreak,
}: {
  player: Player;
  callerName: string | null;
  remainingMs: number | null;
  respondedCount: number;
  participatingCount: number;
  eligibleCount: number;
  tieBreak: boolean;
}) {
  return (
    <div className="text-center space-y-3 py-4">
      <p className="text-xs uppercase tracking-widest text-slate-400">
        {tieBreak ? "🔥 SPAREGGIO" : "🔥 GIOCATORE IN ASTA"}
      </p>
      <h2 className="text-3xl sm:text-4xl font-black tracking-tight">{player.nome.toUpperCase()}</h2>
      <p className="text-slate-400 font-medium">{player.squadra || "—"}</p>
      <div className="flex justify-center">
        <RoleBadge ruolo={player.ruolo} size="lg" />
        <span className="sr-only">{RUOLO_LABEL[player.ruolo]}</span>
      </div>
      {callerName && <p className="text-sm text-slate-500">Chiamato da {callerName}</p>}

      {remainingMs !== null ? (
        <TimerDisplay remainingMs={remainingMs} size="xl" />
      ) : (
        <div className="py-2">
          <p className="text-lg font-bold text-amber-400">⏳ In attesa che tutti rispondano...</p>
          <p className="text-xs text-slate-500 mt-1">
            Il tempo per l&apos;offerta partirà non appena tutti avranno scelto.
          </p>
        </div>
      )}

      <p className="text-sm text-slate-400">
        {respondedCount}/{eligibleCount} hanno risposto · {participatingCount} partecipano
      </p>
    </div>
  );
}
