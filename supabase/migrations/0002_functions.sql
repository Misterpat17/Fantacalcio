-- =====================================================================
-- Fantacalcio Asta — funzioni della macchina a stati (RPC)
-- =====================================================================
-- Tutte le funzioni "fn_*" sono richiamabili SOLO da service_role.
-- Le API route Next.js autenticano il partecipante/admin tramite token
-- PRIMA di chiamare l'RPC con la service_role key: quindi l'identità
-- (participant_id) arriva già verificata quando raggiunge queste
-- funzioni. Il blocco di GRANT/REVOKE in fondo al file impedisce a un
-- client anon di invocarle direttamente saltando i controlli applicativi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Offerta massima consentita (crediti - riserva per slot rimanenti)
-- ---------------------------------------------------------------------
create or replace function fn_calc_max_bid(p_league_id uuid, p_participant_id uuid)
returns int language plpgsql stable as $$
declare
  v_league leagues;
  v_credits int;
  v_owned int;
  v_remaining_after int;
  v_reserve int;
  v_max int;
begin
  select * into v_league from leagues where id = p_league_id;
  select credits_current into v_credits from participants where id = p_participant_id;
  select count(*) into v_owned from rosters where participant_id = p_participant_id;

  v_remaining_after := v_league.roster_size - v_owned - 1;
  if v_remaining_after < 0 then v_remaining_after := 0; end if;
  v_reserve := v_remaining_after * v_league.min_credit_per_slot;
  v_max := v_credits - v_reserve;
  if v_max < 0 then v_max := 0; end if;
  return v_max;
end;
$$;

create or replace function fn_role_slot_available(p_league_id uuid, p_participant_id uuid, p_ruolo text)
returns boolean language plpgsql stable as $$
declare
  v_league leagues;
  v_limit int;
  v_owned int;
begin
  select * into v_league from leagues where id = p_league_id;
  v_limit := case p_ruolo
    when 'P' then v_league.slots_p
    when 'D' then v_league.slots_d
    when 'C' then v_league.slots_c
    when 'A' then v_league.slots_a
    else 0
  end;
  select count(*) into v_owned
    from rosters r join players pl on pl.id = r.player_id
    where r.participant_id = p_participant_id and pl.ruolo = p_ruolo;
  return v_owned < v_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- Avanzamento turno circolare, salta chi ha già la rosa completa,
-- termina l'asta se tutti hanno completato la rosa.
-- ---------------------------------------------------------------------
create or replace function fn_advance_turn(p_league_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_league leagues;
  v_state auction_state;
  v_ids uuid[];
  v_count_total int;
  v_all_done boolean;
  v_start_order int;
  v_ord int;
  v_pid uuid;
  v_found uuid;
  v_i int;
begin
  select * into v_league from leagues where id = p_league_id;
  select * into v_state from auction_state where league_id = p_league_id for update;

  select array_agg(id order by turn_order) into v_ids
    from participants where league_id = p_league_id and is_player = true;
  v_count_total := coalesce(array_length(v_ids, 1), 0);

  select not exists (
    select 1 from participants p
    where p.league_id = p_league_id and p.is_player = true
      and (select count(*) from rosters r where r.participant_id = p.id) < v_league.roster_size
  ) into v_all_done;

  if v_all_done or v_count_total = 0 then
    update auction_state set
      phase = 'FINISHED', current_turn_participant_id = null, current_player_id = null,
      current_caller_participant_id = null, current_round_id = null, phase_end_at = null
    where league_id = p_league_id;
    update leagues set status = 'FINISHED', updated_at = now() where id = p_league_id;
    insert into history(league_id, event_type, payload) values (p_league_id, 'AUCTION_FINISHED', '{}'::jsonb);
    return;
  end if;

  select turn_order into v_start_order from participants where id = v_state.current_turn_participant_id;
  if v_start_order is null then v_start_order := 0; end if;

  v_found := null;
  for v_i in 1..v_count_total loop
    v_ord := ((v_start_order - 1 + v_i) % v_count_total) + 1;
    select id into v_pid from participants where league_id = p_league_id and is_player = true and turn_order = v_ord;
    if v_pid is not null and (select count(*) from rosters r where r.participant_id = v_pid) < v_league.roster_size then
      v_found := v_pid;
      exit;
    end if;
  end loop;

  update auction_state set
    phase = 'CALLING',
    current_turn_participant_id = v_found,
    current_player_id = null,
    current_caller_participant_id = null,
    current_round_id = null,
    phase_end_at = null
  where league_id = p_league_id;
end;
$$;

-- ---------------------------------------------------------------------
-- CHIAMATA
-- ---------------------------------------------------------------------
create or replace function fn_call_player(p_league_id uuid, p_caller_participant_id uuid, p_player_id uuid)
returns bid_rounds language plpgsql security definer set search_path = public as $$
declare
  v_state auction_state;
  v_league leagues;
  v_player players;
  v_round bid_rounds;
begin
  select * into v_state from auction_state where league_id = p_league_id for update;
  if v_state is null then raise exception 'AUCTION_NOT_FOUND'; end if;
  if v_state.phase not in ('WAITING','CALLING') then
    raise exception 'INVALID_PHASE:%', v_state.phase;
  end if;
  if v_state.current_turn_participant_id is distinct from p_caller_participant_id then
    raise exception 'NOT_YOUR_TURN';
  end if;

  select * into v_league from leagues where id = p_league_id;
  select * into v_player from players where id = p_player_id and league_id = p_league_id for update;
  if v_player is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_player.stato <> 'available' then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
  if not fn_role_slot_available(p_league_id, p_caller_participant_id, v_player.ruolo) then
    raise exception 'ROLE_FULL_FOR_CALLER';
  end if;

  insert into bid_rounds (league_id, player_id, caller_participant_id, round_number, eligible_participant_ids, ends_at)
  values (
    p_league_id, p_player_id, p_caller_participant_id, 1,
    (select array_agg(id) from participants where league_id = p_league_id and is_player = true),
    now() + (v_league.timer_seconds || ' seconds')::interval
  ) returning * into v_round;

  update auction_state set
    phase = 'BIDDING',
    current_player_id = p_player_id,
    current_caller_participant_id = p_caller_participant_id,
    current_round_id = v_round.id,
    phase_end_at = v_round.ends_at,
    last_result = null
  where league_id = p_league_id;

  update participants set consecutive_passes = 0 where id = p_caller_participant_id;

  insert into history(league_id, event_type, payload) values (
    p_league_id, 'CALL', jsonb_build_object(
      'player_id', p_player_id, 'player_nome', v_player.nome, 'player_ruolo', v_player.ruolo,
      'player_squadra', v_player.squadra, 'caller_participant_id', p_caller_participant_id
    )
  );

  return v_round;
end;
$$;

-- ---------------------------------------------------------------------
-- PASSA
-- ---------------------------------------------------------------------
create or replace function fn_pass_turn(p_league_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_state auction_state;
  v_league leagues;
  v_part participants;
begin
  select * into v_state from auction_state where league_id = p_league_id for update;
  if v_state is null then raise exception 'AUCTION_NOT_FOUND'; end if;
  if v_state.phase not in ('WAITING','CALLING') then raise exception 'INVALID_PHASE:%', v_state.phase; end if;
  if v_state.current_turn_participant_id is distinct from p_participant_id then raise exception 'NOT_YOUR_TURN'; end if;

  select * into v_league from leagues where id = p_league_id;
  select * into v_part from participants where id = p_participant_id for update;

  if v_league.pass_limit is not null and v_part.consecutive_passes >= v_league.pass_limit then
    raise exception 'PASS_LIMIT_REACHED';
  end if;

  update participants set consecutive_passes = consecutive_passes + 1 where id = p_participant_id;

  insert into history(league_id, event_type, payload) values (
    p_league_id, 'PASS', jsonb_build_object('participant_id', p_participant_id)
  );

  perform fn_advance_turn(p_league_id);
end;
$$;

-- ---------------------------------------------------------------------
-- OFFERTA (a busta chiusa — modificabile fino alla scadenza del round)
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
begin
  select * into v_round from bid_rounds where id = p_round_id for update;
  if v_round is null then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_round.status <> 'OPEN' then raise exception 'ROUND_CLOSED'; end if;
  if now() >= v_round.ends_at then raise exception 'ROUND_EXPIRED'; end if;
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

    if v_round.round_number > 1 then
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

  return jsonb_build_object('ok', true, 'max_bid', coalesce(v_max, 0));
end;
$$;

-- ---------------------------------------------------------------------
-- RISOLUZIONE ROUND (chiamata dal "tick" server-side ad ogni scadenza)
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
  if now() < v_round.ends_at then
    return jsonb_build_object('not_expired', true);
  end if;

  select * into v_league from leagues where id = v_round.league_id;
  select * into v_player from players where id = v_round.player_id for update;

  select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', b.participant_id, 'decision', b.decision, 'amount', b.amount
    )), '[]'::jsonb)
    into v_revealed
    from bids b where b.round_id = p_round_id;

  select max(amount) into v_top_amount from bids where round_id = p_round_id and decision = 'partecipo';

  if v_top_amount is null then
    update bid_rounds set status = 'RESOLVED', revealed_bids = v_revealed where id = p_round_id;

    update auction_state set phase = 'AWARDED',
      last_result = jsonb_build_object(
        'player_id', v_player.id, 'player_nome', v_player.nome, 'player_ruolo', v_player.ruolo,
        'player_squadra', v_player.squadra, 'no_bids', true
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
        'player_squadra', v_player.squadra, 'winner_participant_id', v_winner, 'amount', v_top_amount
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

  -- PAREGGIO
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
        'tie_break_auto', true
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

  insert into bid_rounds(league_id, player_id, caller_participant_id, round_number, eligible_participant_ids, ends_at)
  values (
    v_round.league_id, v_player.id, v_round.caller_participant_id, v_round.round_number + 1,
    v_tied, now() + (v_league.tiebreak_seconds || ' seconds')::interval
  ) returning * into v_new_round;

  update auction_state set
    phase = 'TIE_BREAK',
    current_round_id = v_new_round.id,
    phase_end_at = v_new_round.ends_at
    where league_id = v_round.league_id;

  return jsonb_build_object('resolved', false, 'tie', true, 'new_round_id', v_new_round.id, 'tied_participant_ids', to_jsonb(v_tied));
end;
$$;

-- ---------------------------------------------------------------------
-- FUNZIONI ADMIN
-- ---------------------------------------------------------------------
create or replace function fn_admin_pause(p_league_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_state auction_state;
  v_remaining int;
begin
  select * into v_state from auction_state where league_id = p_league_id for update;
  if v_state.phase in ('PAUSED','FINISHED','CANCELLED') then
    raise exception 'INVALID_PHASE:%', v_state.phase;
  end if;
  if v_state.phase_end_at is not null then
    v_remaining := greatest(0, (ceil(extract(epoch from (v_state.phase_end_at - now())) * 1000)))::int;
  else
    v_remaining := null;
  end if;
  update auction_state set
    pre_pause_phase = v_state.phase,
    pre_pause_remaining_ms = v_remaining,
    phase = 'PAUSED',
    phase_end_at = null
  where league_id = p_league_id;

  insert into history(league_id, event_type, payload) values (p_league_id, 'PAUSE', '{}'::jsonb);
end;
$$;

create or replace function fn_admin_resume(p_league_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_state auction_state;
  v_new_ends timestamptz;
begin
  select * into v_state from auction_state where league_id = p_league_id for update;
  if v_state.phase <> 'PAUSED' then raise exception 'NOT_PAUSED'; end if;

  if v_state.pre_pause_remaining_ms is not null and v_state.current_round_id is not null then
    v_new_ends := now() + (v_state.pre_pause_remaining_ms || ' milliseconds')::interval;
    update bid_rounds set ends_at = v_new_ends where id = v_state.current_round_id;
    update auction_state set phase = v_state.pre_pause_phase, phase_end_at = v_new_ends,
      pre_pause_phase = null, pre_pause_remaining_ms = null
      where league_id = p_league_id;
  else
    update auction_state set phase = v_state.pre_pause_phase, phase_end_at = null,
      pre_pause_phase = null, pre_pause_remaining_ms = null
      where league_id = p_league_id;
  end if;

  insert into history(league_id, event_type, payload) values (p_league_id, 'RESUME', '{}'::jsonb);
end;
$$;

create or replace function fn_admin_reopen_call(p_league_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_state auction_state;
begin
  select * into v_state from auction_state where league_id = p_league_id for update;
  if v_state.phase not in ('BIDDING','TIE_BREAK') then raise exception 'INVALID_PHASE:%', v_state.phase; end if;

  update bid_rounds set status = 'RESOLVED' where id = v_state.current_round_id and status = 'OPEN';

  update auction_state set
    phase = 'CALLING',
    current_turn_participant_id = v_state.current_caller_participant_id,
    current_player_id = null,
    current_caller_participant_id = null,
    current_round_id = null,
    phase_end_at = null
  where league_id = p_league_id;

  insert into history(league_id, event_type, payload) values (p_league_id, 'ADMIN_REOPEN_CALL', '{}'::jsonb);
end;
$$;

create or replace function fn_admin_cancel_award(p_league_id uuid, p_roster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roster rosters;
begin
  select * into v_roster from rosters where id = p_roster_id and league_id = p_league_id for update;
  if v_roster is null then raise exception 'ROSTER_NOT_FOUND'; end if;

  update participants set credits_current = credits_current + v_roster.price where id = v_roster.participant_id;
  update players set stato = 'available' where id = v_roster.player_id;
  delete from rosters where id = p_roster_id;

  insert into history(league_id, event_type, payload) values (
    p_league_id, 'ADMIN_CANCEL_AWARD', jsonb_build_object(
      'player_id', v_roster.player_id, 'participant_id', v_roster.participant_id, 'price', v_roster.price
    )
  );
end;
$$;

create or replace function fn_admin_correct_price(p_league_id uuid, p_roster_id uuid, p_new_price int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roster rosters;
  v_delta int;
begin
  select * into v_roster from rosters where id = p_roster_id and league_id = p_league_id for update;
  if v_roster is null then raise exception 'ROSTER_NOT_FOUND'; end if;
  v_delta := v_roster.price - p_new_price;
  update rosters set price = p_new_price where id = p_roster_id;
  update participants set credits_current = credits_current + v_delta where id = v_roster.participant_id;

  insert into history(league_id, event_type, payload) values (
    p_league_id, 'ADMIN_CORRECT_PRICE', jsonb_build_object(
      'roster_id', p_roster_id, 'old_price', v_roster.price, 'new_price', p_new_price
    )
  );
end;
$$;

create or replace function fn_admin_correct_credits(p_league_id uuid, p_participant_id uuid, p_new_credits int) returns void
language plpgsql security definer set search_path = public as $$
begin
  update participants set credits_current = p_new_credits where id = p_participant_id and league_id = p_league_id;
  insert into history(league_id, event_type, payload) values (
    p_league_id, 'ADMIN_CORRECT_CREDITS', jsonb_build_object('participant_id', p_participant_id, 'new_credits', p_new_credits)
  );
end;
$$;

create or replace function fn_admin_assign_player(p_league_id uuid, p_participant_id uuid, p_player_id uuid, p_price int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
begin
  select * into v_player from players where id = p_player_id and league_id = p_league_id for update;
  if v_player is null or v_player.stato <> 'available' then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  insert into rosters(league_id, participant_id, player_id, price) values (p_league_id, p_participant_id, p_player_id, p_price);
  update players set stato = 'sold' where id = p_player_id;
  update participants set credits_current = credits_current - p_price where id = p_participant_id;

  insert into history(league_id, event_type, payload) values (
    p_league_id, 'ADMIN_ASSIGN', jsonb_build_object(
      'participant_id', p_participant_id, 'player_id', p_player_id, 'price', p_price
    )
  );
end;
$$;

create or replace function fn_admin_remove_player(p_league_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_player players;
begin
  select * into v_player from players where id = p_player_id and league_id = p_league_id for update;
  if v_player is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_player.stato = 'sold' then raise exception 'PLAYER_ALREADY_SOLD'; end if;
  update players set stato = 'removed' where id = p_player_id;
  insert into history(league_id, event_type, payload) values (
    p_league_id, 'ADMIN_REMOVE_PLAYER', jsonb_build_object('player_id', p_player_id, 'nome', v_player.nome)
  );
end;
$$;

create or replace function fn_admin_reorder(p_league_id uuid, p_ordered_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_i int := 0;
begin
  update participants set turn_order = -1 * (turn_order + 1000) where league_id = p_league_id;
  foreach v_id in array p_ordered_ids loop
    v_i := v_i + 1;
    update participants set turn_order = v_i where id = v_id and league_id = p_league_id;
  end loop;
  insert into history(league_id, event_type, payload) values (
    p_league_id, 'ADMIN_REORDER', jsonb_build_object('order', to_jsonb(p_ordered_ids))
  );
end;
$$;

-- =====================================================================
-- Blocco tutte le funzioni RPC critiche a anon/authenticated: solo
-- service_role (usato dalle API route server-side) può eseguirle.
-- =====================================================================
revoke execute on function fn_calc_max_bid(uuid, uuid) from public;
revoke execute on function fn_role_slot_available(uuid, uuid, text) from public;
revoke execute on function fn_advance_turn(uuid) from public;
revoke execute on function fn_call_player(uuid, uuid, uuid) from public;
revoke execute on function fn_pass_turn(uuid, uuid) from public;
revoke execute on function fn_submit_bid(uuid, uuid, text, int) from public;
revoke execute on function fn_resolve_round(uuid) from public;
revoke execute on function fn_admin_pause(uuid) from public;
revoke execute on function fn_admin_resume(uuid) from public;
revoke execute on function fn_admin_reopen_call(uuid) from public;
revoke execute on function fn_admin_cancel_award(uuid, uuid) from public;
revoke execute on function fn_admin_correct_price(uuid, uuid, int) from public;
revoke execute on function fn_admin_correct_credits(uuid, uuid, int) from public;
revoke execute on function fn_admin_assign_player(uuid, uuid, uuid, int) from public;
revoke execute on function fn_admin_remove_player(uuid, uuid) from public;
revoke execute on function fn_admin_reorder(uuid, uuid[]) from public;

grant execute on function fn_calc_max_bid(uuid, uuid) to service_role;
grant execute on function fn_role_slot_available(uuid, uuid, text) to service_role;
grant execute on function fn_advance_turn(uuid) to service_role;
grant execute on function fn_call_player(uuid, uuid, uuid) to service_role;
grant execute on function fn_pass_turn(uuid, uuid) to service_role;
grant execute on function fn_submit_bid(uuid, uuid, text, int) to service_role;
grant execute on function fn_resolve_round(uuid) to service_role;
grant execute on function fn_admin_pause(uuid) to service_role;
grant execute on function fn_admin_resume(uuid) to service_role;
grant execute on function fn_admin_reopen_call(uuid) to service_role;
grant execute on function fn_admin_cancel_award(uuid, uuid) to service_role;
grant execute on function fn_admin_correct_price(uuid, uuid, int) to service_role;
grant execute on function fn_admin_correct_credits(uuid, uuid, int) to service_role;
grant execute on function fn_admin_assign_player(uuid, uuid, uuid, int) to service_role;
grant execute on function fn_admin_remove_player(uuid, uuid) to service_role;
grant execute on function fn_admin_reorder(uuid, uuid[]) to service_role;
