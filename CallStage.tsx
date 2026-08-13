"use client";

import { useMemo } from "react";
import { ParticipantCard } from "./ParticipantCard";
import { AuctionState, LeaguePublic, Participant, Player, RosterEntry, Ruolo } from "@/lib/types";

export function ParticipantsSidebar({
  league,
  participants,
  rosters,
  players,
  state,
  myParticipantId,
}: {
  league: LeaguePublic;
  participants: Participant[];
  rosters: RosterEntry[];
  players: Player[];
  state: AuctionState | null;
  myParticipantId: string | null;
}) {
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const rows = useMemo(() => {
    return participants
      .filter((p) => p.is_player || p.is_admin)
      .sort((a, b) => (a.turn_order ?? 999) - (b.turn_order ?? 999))
      .map((participant) => {
        const mine = rosters.filter((r) => r.participant_id === participant.id);
        const speso = mine.reduce((sum, r) => sum + r.price, 0);
        const roleCounts: Record<Ruolo, number> = { P: 0, D: 0, C: 0, A: 0 };
        for (const r of mine) {
          const player = playersById.get(r.player_id);
          if (player) roleCounts[player.ruolo] += 1;
        }
        return { participant, speso, roleCounts };
      });
  }, [participants, rosters, playersById]);

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-slate-300 text-sm uppercase tracking-wide px-1">Partecipanti</h2>
      <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
        {rows.map(({ participant, speso, roleCounts }) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            league={league}
            roleCounts={roleCounts}
            speso={speso}
            isCurrentTurn={state?.current_turn_participant_id === participant.id}
            isMe={participant.id === myParticipantId}
          />
        ))}
      </div>
    </div>
  );
}
