-- =====================================================================
-- Evoluzioni richieste da Daniele il 13/08/2026:
--  - prezzo minimo alla chiamata principale = quotazione (da Excel) + 1;
--  - in caso di pareggio, se il chiamante è tra i pari-merito si
--    aggiudica lui direttamente (nessuno spareggio); altrimenti si va
--    comunque allo spareggio come già avveniva;
--  - lista pubblica di chi ha già risposto partecipo/non partecipo,
--    PRIMA che parta il countdown (mai gli importi, solo la decisione —
--    stesso principio già usato per lo schermo del proiettore);
--  - il "reveal" a fine busta (last_result) ora include l'elenco
--    completo delle offerte in ordine decrescente, per mostrarle in UI
--    dall'alto verso il basso e per l'export Excel a matrice.
-- =====================================================================

alter table bid_rounds add column if not exists declined_participant_ids uuid[] not null default '{}';

-- ---------------------------------------------------------------------
-- Trigger pubblico: ora mantiene anche l'elenco di chi ha risposto
-- "non partecipo" (mai gli importi), oltre a chi ha risposto "partecipo".
-- ---------------------------------------------------------------------
create or replace function fn_bid_progress_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update bid_rounds
     set responded_count = (select count(*) from bids where round_id = coalesce(new.round_id, old.round_id)),
         participating_count = (select count(*) from bids where round_id = coalesce(new.round_id, old.round_id) and decision = 'partecipo'),
         participating_participant_ids = (
           select coalesce(array_agg(participant_id), array[]::uuid[])
           from bids where round_id = coalesce(new.round_id, old.round_id) and decision = 'partecipo'
         ),
         declined_participant_ids = (
           select coalesce(array_agg(participant_id), array[]::uuid[])
           from bids where round_id = coalesce(new.round_id, old.round_id) and decision = 'non_partecipo'
         )
   where id = coalesce(new.round_id, old.round_id);
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- OFFERTA: prezzo minimo alla chiamata principale (round 1) = quotazione
-- del giocatore (importata da Excel) + 1. Per gli spareggi resta la
-- regola già esistente (>= offerta del round precedente, +1 se
-- "min_increment_1").
-- ---------------------------------------------------------------------
create or replace function fn_submit_bid(p_round_id uuid, p_participant_id uuid, p_decision text, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_round bid_rounds;
  v_league leagues;
  v_player players;
  v_max int;
  v_prior_amount int;
  v_min_required int;
  v_final_amount int;
  v_responded int;
  v_new_ends timestamptz;
begin
  select * into v_round from bid_rounds where id = p_round_id for update;
  if v_round is null then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_round.status <> 'OPEN' then raise exception 'ROUND_CLOSED'; end if;
  if v_round.ends_at is not null and now() >= v_round.ends_at then raise exception 'ROUND_EXPIRED'; end if;
  if not (p_participant_id = any(v_round.eligible_participant_ids)) then raise exception 'NOT_ELIGIBLE'; end if;
  if p_decision not in ('partecipo','non_partecipo') then raise exception 'INVALID_DECISION'; end if;

  select * into v_league from leagues where id = v_round.league_id;
  select * into v_player from players where id = v_round.player_id;

  v_final_amount := null;

  if p_decision = 'partecipo' then
    if not fn_role_slot_available(v_round.league_id, p_participant_id, v_player.ruolo) then
      raise exception 'ROLE_FULL';
    end if;
    v_max := fn_calc_max_bid(v_round.league_id, p_participant_id);
    if p_amount is null or p_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;
    if p_amount > v_max then raise exception 'AMOUNT_TOO_HIGH:%', v_max; end if;

    if v_round.round_number = 1 then
      v_min_required := coalesce(v_player.quotazione, 0) + 1;
      if p_amount < v_min_required then
        raise exception 'AMOUNT_TOO_LOW:%', v_min_required;
      end if;
    else
      select winner_amount into v_prior_amount from bid_rounds
        where player_id = v_round.player_id and round_number = v_round.round_number - 1
        order by created_at desc limit 1;
      if v_prior_amount is not null then
        if v_league.tiebreak_rule = 'min_increment_1' then
          v_min_required := v_prior_amount + 1;
        else
          v_min_required := v_prior_amount;
        end if;
        if p_amount < v_min_required then
          raise exception 'AMOUNT_TOO_LOW:%', v_min_required;
        end if;
      end if;
    end if;

    v_final_amount := p_amount;
  end if;

  insert into bids(round_id, participant_id, decision, amount)
  values (p_round_id, p_participant_id, p_decision, v_final_amount)
  on conflict (round_id, participant_id)
  do update set decision = excluded.decision, amount = excluded.amount, updated_at = now();

  if v_round.ends_at is null then
    select count(*) into v_responded from bids where round_id = p_round_id;
    if v_responded >= array_length(v_round.eligible_participant_ids, 1) then
      v_new_ends := now() + (
        case when v_round.round_number > 1 then v_league.tiebreak_seconds else v_league.timer_seconds end
        || ' seconds'
      )::interval;

      update bid_rounds set ends_at = v_new_ends where id = p_round_id and ends_at is null;
      update auction_state set phase_end_at = v_new_ends
        where league_id = v_round.league_id and current_round_id = p_round_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'max_bid', coalesce(v_max, 0));
end;
$$;

-- ---------------------------------------------------------------------
-- RISOLUZIONE: last_result ora include "bids" (elenco completo delle
-- offerte, già ordinato per importo decrescente — chi non partecipa in
-- fondo) da mostrare in UI. In caso di pareggio, se il chiamante è tra i
-- pari-merito si aggiudica lui direttamente.
-- ---------------------------------------------------------------------
create or replace function fn_resolve_round(p_round_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round bid_rounds;
  v_league leagues;
  v_player players;
  v_top_amount int;
  v_top_count int;
  v_winner uuid;
  v_tied uuid[];
  v_revealed jsonb;
  v_new_round bid_rounds;
begin
  select * into v_round from bid_rounds where id = p_round_id for update;
  if v_round is null then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_round.status <> 'OPEN' then
    return jsonb_build_object('already_resolved', true);
  end if;
  if v_round.ends_at is null or now() < v_round.ends_at then
    return jsonb_build_object('not_expired', true);
  end if;

  select * into v_league from leagues where id = v_round.league_id;
  select * into v_player from players where id = v_round.player_id for update;

  select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', b.participant_id, 'decision', b.decision, 'amount', b.amount
    ) order by (b.decision = 'partecipo') desc, b.amount desc nulls last), '[]'::jsonb)
    into v_revealed
    from bids b where b.round_id = p_round_id;

  select max(amount) into v_top_amount from bids where round_id = p_round_id and decision = 'partecipo';

  if v_top_amount is null then
    update bid_rounds set status = 'RESOLVED', revealed_bids = v_revealed where id = p_round_id;

    update auction_state set phase = 'AWARDED',
      last_result = jsonb_build_object(
        'player_id', v_player.id, 'player_nome', v_player.nome, 'player_ruolo', v_player.ruolo,
        'player_squadra', v_player.squadra, 'no_bids', true, 'bids', v_revealed
      )
      where league_id = v_round.league_id;

    insert into history(league_id, event_type, payload) values (
      v_round.league_id, 'NO_BIDS', jsonb_build_object('player_id', v_player.id, 'player_nome', v_player.nome)
    );

    perform fn_advance_turn(v_round.league_id);
    return jsonb_build_object('resolved', true, 'no_bids', true);
  end if;

  select array_agg(participant_id) into v_tied
    from bids where round_id = p_round_id and decision = 'partecipo' and amount = v_top_amount;

  v_top_count := array_length(v_tied, 1);

  if v_top_count = 1 then
    v_winner := v_tied[1];

    update bid_rounds set status = 'RESOLVED', revealed_bids = v_revealed,
      winner_participant_id = v_winner, winner_amount = v_top_amount
      where id = p_round_id;

    insert into rosters(league_id, participant_id, player_id, price, round_id)
      values (v_round.league_id, v_winner, v_player.id, v_top_amount, p_round_id);

    update participants set credits_current = credits_current - v_top_amount where id = v_winner;
    update players set stato = 'sold' where id = v_player.id;

    update auction_state set phase = 'AWARDED',
      last_result = jsonb_build_object(
        'player_id', v_player.id, 'player_nome', v_player.nome, 'player_ruolo', v_player.ruolo,
        'player_squadra', v_player.squadra, 'winner_participant_id', v_winner, 'amount', v_top_amount,
        'bids', v_revealed
      )
      where league_id = v_round.league_id;

    insert into history(league_id, event_type, payload) values (
      v_round.league_id, 'AWARD', jsonb_build_object(
        'player_id', v_player.id, 'player_nome', v_player.nome, 'player_ruolo', v_player.ruolo,
        'player_squadra', v_player.squadra, 'winner_participant_id', v_winner, 'amount', v_top_amount,
        'caller_participant_id', v_round.caller_participant_id
      )
    );

    perform fn_advance_turn(v_round.league_id);
    return jsonb_build_object('resolved', true, 'winner_participant_id', v_winner, 'amount', v_top_amount);
  end if;

  -- PAREGGIO: se il chiamante è tra i pari-merito, si aggiudica lui
  -- direttamente (nessuno spareggio). Altrimenti procede come già faceva.
  if v_round.caller_participant_id = any(v_tied) then
    v_winner := v_round.caller_participant_id;

    update bid_rounds set status = 'RESOLVED', revealed_bids = v_revealed,
      winner_participant_id = v_winner, winner_amount = v_top_amount
      where id = p_round_id;

    insert into rosters(league_id, participant_id, player_id, price, round_id)
      values (v_round.league_id, v_winner, v_player.id, v_top_amount, p_round_id);

    update participants set credits_current = credits_current - v_top_amount where id = v_winner;
    update players set stato = 'sold' where id = v_player.id;

    update auction_state set phase = 'AWARDED',
      last_result = jsonb_build_object(
        'player_id', v_player.id, 'player_nome', v_player.nome, 'player_ruolo', v_player.ruolo,
        'player_squadra', v_player.squadra, 'winner_participant_id', v_winner, 'amount', v_top_amount,
        'tie_break_caller', true, 'bids', v_revealed
      )
      where league_id = v_round.league_id;

    insert into history(league_id, event_type, payload) values (
      v_round.league_id, 'AWARD', jsonb_build_object(
        'player_id', v_player.id, 'player_nome', v_player.nome, 'winner_participant_id', v_winner,
        'amount', v_top_amount, 'tie_break_caller', true
      )
    );

    perform fn_advance_turn(v_round.league_id);
    return jsonb_build_object('resolved', true, 'winner_participant_id', v_winner, 'amount', v_top_amount, 'tie_break_caller', true);
  end if;

  update bid_rounds set status = 'TIE_ADVANCED', revealed_bids = v_revealed, winner_amount = v_top_amount
    where id = p_round_id;

  insert into history(league_id, event_type, payload) values (
    v_round.league_id, 'TIE', jsonb_build_object(
      'player_id', v_player.id, 'player_nome', v_player.nome, 'amount', v_top_amount,
      'tied_participant_ids', to_jsonb(v_tied)
    )
  );

  if v_league.tiebreak_rule = 'max_credits' then
    select id into v_winner from participants
      where id = any(v_tied)
      order by credits_current desc, turn_order asc
      limit 1;

    insert into rosters(league_id, participant_id, player_id, price, round_id)
      values (v_round.league_id, v_winner, v_player.id, v_top_amount, p_round_id);

    update participants set credits_current = credits_current - v_top_amount where id = v_winner;
    update players set stato = 'sold' where id = v_player.id;
    update bid_rounds set winner_participant_id = v_winner where id = p_round_id;

    update auction_state set phase = 'AWARDED',
      last_result = jsonb_build_object(
        'player_id', v_player.id, 'player_nome', v_player.nome, 'player_ruolo', v_player.ruolo,
        'player_squadra', v_player.squadra, 'winner_participant_id', v_winner, 'amount', v_top_amount,
        'tie_break_auto', true, 'bids', v_revealed
      )
      where league_id = v_round.league_id;

    insert into history(league_id, event_type, payload) values (
      v_round.league_id, 'AWARD', jsonb_build_object(
        'player_id', v_player.id, 'player_nome', v_player.nome, 'winner_participant_id', v_winner,
        'amount', v_top_amount, 'tie_break_auto', true
      )
    );

    perform fn_advance_turn(v_round.league_id);
    return jsonb_build_object('resolved', true, 'winner_participant_id', v_winner, 'amount', v_top_amount, 'tie_break_auto', true);
  end if;

  insert into bid_rounds(league_id, player_id, caller_participant_id, round_number, eligible_participant_ids, ends_at, decision_deadline_at)
  values (
    v_round.league_id, v_player.id, v_round.caller_participant_id, v_round.round_number + 1,
    v_tied, null, now() + interval '90 seconds'
  ) returning * into v_new_round;

  update auction_state set
    phase = 'TIE_BREAK',
    current_round_id = v_new_round.id,
    phase_end_at = null
    where league_id = v_round.league_id;

  return jsonb_build_object('resolved', false, 'tie', true, 'new_round_id', v_new_round.id, 'tied_participant_ids', to_jsonb(v_tied));
end;
$$;
