"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { subscribeLeagueTable } from "@/lib/realtime";
import { AuctionState, BidRound, LeaguePublic, Participant, Player } from "@/lib/types";

interface StateResponse {
  league: LeaguePublic;
  state: AuctionState;
  participants: Participant[];
  currentPlayer: Player | null;
  currentRound: BidRound | null;
}

// Hook centrale della dashboard: mantiene sincronizzati in tempo reale
// stato dell'asta, partecipanti, giocatore/round correnti. Riceve un
// primo snapshot via REST (GET /state) poi si aggiorna via Realtime.
export function useAuctionState(code: string) {
  const [league, setLeague] = useState<LeaguePublic | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [state, setState] = useState<AuctionState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [currentRound, setCurrentRound] = useState<BidRound | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshLeague = useCallback(async () => {
    const data = await apiFetch<{ league: LeaguePublic; participants: Participant[] }>(`/api/leagues/${code}`);
    setLeague(data.league);
  }, [code]);

  const refreshAll = useCallback(async () => {
    const data = await apiFetch<StateResponse>(`/api/leagues/${code}/state`);
    setLeague(data.league);
    setState(data.state);
    setParticipants(data.participants);
    setCurrentPlayer(data.currentPlayer);
    setCurrentRound(data.currentRound);
    setLeagueId(data.league.id);
    setLoading(false);
  }, [code]);

  // Quando cambia il giocatore/round corrente nello stato realtime,
  // recuperiamo i relativi dettagli pubblici (non sensibili).
  const fetchCurrentPlayer = useCallback(async (playerId: string | null) => {
    if (!playerId) {
      setCurrentPlayer(null);
      return;
    }
    const data = await apiFetch<{ players: Player[] }>(`/api/leagues/${code}/players`);
    const found = data.players.find((p) => p.id === playerId) || null;
    setCurrentPlayer(found);
  }, [code]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!leagueId) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      subscribeLeagueTable("auction_state", leagueId, ({ new: row }) => {
        if (!row) return;
        setState(row as unknown as AuctionState);
      }, "league_id")
    );

    unsubs.push(
      subscribeLeagueTable("participants", leagueId, ({ eventType, new: row, old }) => {
        setParticipants((prev) => {
          if (eventType === "DELETE") {
            return prev.filter((p) => p.id !== (old as { id: string })?.id);
          }
          const incoming = row as unknown as Participant;
          const idx = prev.findIndex((p) => p.id === incoming.id);
          if (idx === -1) return [...prev, incoming].sort((a, b) => (a.turn_order ?? 999) - (b.turn_order ?? 999));
          const copy = [...prev];
          copy[idx] = incoming;
          return copy;
        });
      }, "league_id")
    );

    unsubs.push(
      subscribeLeagueTable("bid_rounds", leagueId, ({ new: row }) => {
        if (!row) return;
        setCurrentRound((prev) => {
          const incoming = row as unknown as BidRound;
          // Aggiorna solo se è il round corrente o non ne abbiamo ancora uno.
          if (!prev || prev.id === incoming.id) return incoming;
          return prev;
        });
      }, "league_id")
    );

    unsubs.push(
      subscribeLeagueTable("history", leagueId, ({ new: row }) => {
        const evt = row as { event_type?: string } | null;
        if (evt?.event_type === "ADMIN_SETTINGS_UPDATED") {
          refreshLeague();
        }
      }, "league_id")
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [leagueId, refreshLeague]);

  // Quando il current_player_id cambia (nuova chiamata), recupera i dati
  // pubblici del giocatore.
  useEffect(() => {
    if (state?.current_player_id) {
      fetchCurrentPlayer(state.current_player_id);
    } else {
      setCurrentPlayer(null);
    }
  }, [state?.current_player_id, fetchCurrentPlayer]);

  // Quando il current_round_id cambia e non corrisponde al round in
  // memoria, ricarica lo snapshot completo (copre spareggi/nuovi round).
  useEffect(() => {
    if (state?.current_round_id && currentRound?.id !== state.current_round_id) {
      refreshAll();
    }
    if (!state?.current_round_id && currentRound) {
      setCurrentRound(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.current_round_id]);

  return {
    league,
    state,
    participants,
    currentPlayer,
    currentRound,
    loading,
    leagueId,
    refreshAll,
    refreshLeague,
  };
}
