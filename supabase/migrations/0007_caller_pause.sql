-- ---------------------------------------------------------------------
-- Gettone "pausa del chiamante": chi chiama un giocatore può fermare il
-- countdown della SUA chiamata (fase BIDDING) una sola volta per tutta
-- l'asta. Riusa lo stesso meccanismo di pre_pause_phase/
-- pre_pause_remaining_ms già usato dalla pausa admin, quindi il
-- countdown riprende esattamente da dove si era fermato. L'admin può
-- comunque riprendere in qualsiasi momento con i suoi pulsanti esistenti
-- (fn_admin_resume): questo gettone aggiunge solo un modo IN PIÙ per
-- fermare/far ripartire, riservato a chi ha chiamato il giocatore.
-- ---------------------------------------------------------------------

alter table participants add column if not exists caller_pause_used boolean not null default false;

alter table auction_state
  add column if not exists paused_by_caller_id uuid references participants(id) on delete set null;

create or replace function fn_caller_pause(p_league_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_participant participants;
  v_state auction_state;
  v_remaining int;
begin
  select * into v_participant from participants where id = p_participant_id and league_id = p_league_id for update;
  if v_participant is null then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  if v_participant.caller_pause_used then raise exception 'PAUSE_ALREADY_USED'; end if;

  select * into v_state from auction_state where league_id = p_league_id for update;
  if v_state is null then raise exception 'STATE_NOT_FOUND'; end if;
  if v_state.phase <> 'BIDDING' then raise exception 'INVALID_PHASE:%', v_state.phase; end if;
  if v_state.current_caller_participant_id is distinct from p_participant_id then raise exception 'NOT_CALLER'; end if;

  if v_state.phase_end_at is not null then
    v_remaining := greatest(0, (ceil(extract(epoch from (v_state.phase_end_at - now())) * 1000)))::int;
  else
    v_remaining := null;
  end if;

  update auction_state set
    pre_pause_phase = v_state.phase,
    pre_pause_remaining_ms = v_remaining,
    phase = 'PAUSED',
    phase_end_at = null,
    paused_by_caller_id = p_participant_id
  where league_id = p_league_id;

  -- Il gettone si consuma subito: vale "una pausa per tutta l'asta",
  -- non conta se poi viene ripresa.
  update participants set caller_pause_used = true where id = p_participant_id;

  insert into history(league_id, event_type, payload) values (
    p_league_id, 'CALLER_PAUSE', jsonb_build_object('participant_id', p_participant_id)
  );
end;
$$;

create or replace function fn_caller_resume(p_league_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_state auction_state;
  v_new_ends timestamptz;
begin
  select * into v_state from auction_state where league_id = p_league_id for update;
  if v_state is null then raise exception 'STATE_NOT_FOUND'; end if;
  if v_state.phase <> 'PAUSED' then raise exception 'NOT_PAUSED'; end if;
  if v_state.paused_by_caller_id is distinct from p_participant_id then raise exception 'NOT_YOUR_PAUSE'; end if;

  if v_state.pre_pause_remaining_ms is not null and v_state.current_round_id is not null then
    v_new_ends := now() + (v_state.pre_pause_remaining_ms || ' milliseconds')::interval;
    update bid_rounds set ends_at = v_new_ends where id = v_state.current_round_id;
    update auction_state set phase = v_state.pre_pause_phase, phase_end_at = v_new_ends,
      pre_pause_phase = null, pre_pause_remaining_ms = null, paused_by_caller_id = null
      where league_id = p_league_id;
  else
    update auction_state set phase = v_state.pre_pause_phase, phase_end_at = null,
      pre_pause_phase = null, pre_pause_remaining_ms = null, paused_by_caller_id = null
      where league_id = p_league_id;
  end if;

  insert into history(league_id, event_type, payload) values (
    p_league_id, 'CALLER_RESUME', jsonb_build_object('participant_id', p_participant_id)
  );
end;
$$;
