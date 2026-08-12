-- =====================================================================
-- Fantacalcio Asta a Busta Chiusa — schema iniziale
-- =====================================================================
-- Note di sicurezza:
--  - Tutte le scritture passano SOLO dalle API route Next.js con la
--    service_role key (che bypassa RLS). Il client browser usa la anon
--    key ed è di sola lettura sulle tabelle "pubbliche".
--  - La tabella `bids` NON ha alcuna policy RLS: con RLS abilitata e
--    zero policy, anon/authenticated non possono leggerla né scriverla
--    in alcun modo, nemmeno via Realtime. Solo service_role (che bypassa
--    RLS) vi accede. Questo garantisce che le offerte non siano MAI
--    presenti nel frontend prima della rivelazione.
--  - `leagues` non è leggibile da anon (contiene l'hash password admin):
--    le info pubbliche della lega vengono esposte via API route
--    (/api/leagues/[code]) che filtra i campi sensibili.
--  - Il token di sessione dei partecipanti è salvato come hash
--    (`token_hash`), mai in chiaro: la tabella `participants` può quindi
--    essere leggibile pubblicamente (serve per dashboard/classifica in
--    realtime) senza rischi di impersonificazione.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- LEAGUES
-- ---------------------------------------------------------------------
create table if not exists leagues (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  name                  text not null,
  admin_password_hash   text not null,
  num_participants      int not null default 8,
  credits_iniziali      int not null default 1000,
  roster_size           int not null default 25,
  slots_p               int not null default 3,
  slots_d               int not null default 8,
  slots_c               int not null default 8,
  slots_a               int not null default 6,
  min_credit_per_slot   int not null default 1,
  timer_seconds         int not null default 30 check (timer_seconds in (15,20,30,45,60)),
  tiebreak_seconds      int not null default 15 check (tiebreak_seconds in (10,15,20,30)),
  tiebreak_rule         text not null default 'min_increment_1'
                          check (tiebreak_rule in ('min_increment_1','free','max_credits')),
  pass_limit            int, -- null = illimitato
  status                text not null default 'SETUP'
                          check (status in ('SETUP','RUNNING','FINISHED','CANCELLED')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table leagues is 'Una lega/asta. admin_password_hash non deve mai essere esposto al client.';

-- ---------------------------------------------------------------------
-- PARTICIPANTS
-- ---------------------------------------------------------------------
create table if not exists participants (
  id                  uuid primary key default gen_random_uuid(),
  league_id           uuid not null references leagues(id) on delete cascade,
  display_name        text not null,
  turn_order          int, -- null per un admin "spettatore" che non gioca (non entra nella rotazione dei turni)
  token_hash          text not null, -- sha256 hex del token di sessione; il token in chiaro è noto solo al browser del partecipante
  is_admin            boolean not null default false,
  is_player           boolean not null default true, -- false = admin che gestisce l'asta senza avere una propria rosa
  credits_current      int not null,
  consecutive_passes  int not null default 0,
  connected           boolean not null default false,
  last_seen           timestamptz,
  created_at          timestamptz not null default now(),
  unique (league_id, display_name),
  unique (league_id, turn_order)
);

-- ---------------------------------------------------------------------
-- PLAYERS
-- ---------------------------------------------------------------------
create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  external_id   text,
  nome          text not null,
  ruolo         text not null check (ruolo in ('P','D','C','A')),
  squadra       text,
  quotazione    int,
  stato         text not null default 'available' check (stato in ('available','sold','removed')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_players_league_stato on players(league_id, stato);
create index if not exists idx_players_league_ruolo on players(league_id, ruolo);

-- ---------------------------------------------------------------------
-- AUCTION STATE (una riga per lega — lo "stato macchina" corrente)
-- ---------------------------------------------------------------------
create table if not exists auction_state (
  league_id                     uuid primary key references leagues(id) on delete cascade,
  phase                         text not null default 'WAITING'
                                  check (phase in (
                                    'WAITING','CALLING','BIDDING','TIE_BREAK',
                                    'REVEALING','AWARDED','PAUSED','CANCELLED','FINISHED'
                                  )),
  pre_pause_phase               text,
  pre_pause_remaining_ms        int,
  current_turn_participant_id   uuid references participants(id),
  current_caller_participant_id uuid references participants(id),
  current_player_id             uuid references players(id),
  current_round_id              uuid,
  phase_end_at                  timestamptz,
  last_result                   jsonb,
  updated_at                    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- BID ROUNDS (una riga per ogni finestra a tempo: chiamata principale o
-- spareggio). Contiene SOLO dati non sensibili + il "reveal" a chiusura.
-- ---------------------------------------------------------------------
create table if not exists bid_rounds (
  id                        uuid primary key default gen_random_uuid(),
  league_id                 uuid not null references leagues(id) on delete cascade,
  player_id                 uuid not null references players(id),
  caller_participant_id     uuid not null references participants(id),
  round_number              int not null default 1,
  eligible_participant_ids  uuid[] not null,
  started_at                timestamptz not null default now(),
  ends_at                   timestamptz not null,
  status                    text not null default 'OPEN'
                              check (status in ('OPEN','CLOSED','RESOLVED','TIE_ADVANCED')),
  responded_count           int not null default 0,
  participating_count       int not null default 0,
  revealed_bids             jsonb, -- popolato SOLO alla chiusura: [{participant_id, decision, amount}]
  winner_participant_id     uuid references participants(id),
  winner_amount             int,
  created_at                timestamptz not null default now()
);

create index if not exists idx_bid_rounds_league on bid_rounds(league_id);
create index if not exists idx_bid_rounds_player on bid_rounds(player_id);

-- ---------------------------------------------------------------------
-- BIDS — la tabella SEGRETA. Nessuna policy RLS = nessun accesso da anon.
-- ---------------------------------------------------------------------
create table if not exists bids (
  id                uuid primary key default gen_random_uuid(),
  round_id          uuid not null references bid_rounds(id) on delete cascade,
  participant_id    uuid not null references participants(id),
  decision          text not null check (decision in ('partecipo','non_partecipo')),
  amount            int, -- null se non_partecipo
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (round_id, participant_id)
);

-- ---------------------------------------------------------------------
-- ROSTERS (acquisti storici — pubblico)
-- ---------------------------------------------------------------------
create table if not exists rosters (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references leagues(id) on delete cascade,
  participant_id    uuid not null references participants(id),
  player_id         uuid not null references players(id),
  price             int not null,
  round_id          uuid references bid_rounds(id),
  purchased_at      timestamptz not null default now(),
  unique (league_id, player_id) -- un giocatore può essere assegnato una sola volta
);

create index if not exists idx_rosters_participant on rosters(participant_id);

-- ---------------------------------------------------------------------
-- HISTORY (storico eventi — pubblico, usato anche come "bus" di refresh
-- per entità non realtime come le impostazioni lega)
-- ---------------------------------------------------------------------
create table if not exists history (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  event_type    text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_history_league on history(league_id, created_at desc);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table leagues enable row level security;
alter table participants enable row level security;
alter table players enable row level security;
alter table auction_state enable row level security;
alter table bid_rounds enable row level security;
alter table bids enable row level security; -- nessuna policy: deny-all per anon/authenticated
alter table rosters enable row level security;
alter table history enable row level security;

-- leagues: nessuna policy -> deny-all per anon (info pubbliche via API route)

-- Le altre tabelle sono leggibili pubblicamente (nessun dato sensibile)
create policy "public read participants" on participants for select using (true);
create policy "public read players" on players for select using (true);
create policy "public read auction_state" on auction_state for select using (true);
create policy "public read bid_rounds" on bid_rounds for select using (true);
create policy "public read rosters" on rosters for select using (true);
create policy "public read history" on history for select using (true);

-- Nessuna policy di insert/update/delete per anon/authenticated su nessuna
-- tabella: tutte le scritture avvengono via service_role (bypassa RLS).

-- =====================================================================
-- REALTIME: pubblica le tabelle "pubbliche" sul canale supabase_realtime
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'auction_state'
  ) then
    alter publication supabase_realtime add table auction_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table participants;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'bid_rounds'
  ) then
    alter publication supabase_realtime add table bid_rounds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rosters'
  ) then
    alter publication supabase_realtime add table rosters;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'history'
  ) then
    alter publication supabase_realtime add table history;
  end if;
end $$;

-- =====================================================================
-- TRIGGER: mantiene aggiornati i contatori "pubblici" su bid_rounds
-- (numero di risposte / numero di partecipanti che hanno detto PARTECIPO)
-- senza mai esporre gli importi.
-- =====================================================================
create or replace function fn_bid_progress_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update bid_rounds
     set responded_count = (select count(*) from bids where round_id = coalesce(new.round_id, old.round_id)),
         participating_count = (select count(*) from bids where round_id = coalesce(new.round_id, old.round_id) and decision = 'partecipo')
   where id = coalesce(new.round_id, old.round_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bid_progress on bids;
create trigger trg_bid_progress
after insert or update or delete on bids
for each row execute function fn_bid_progress_touch();

create or replace function fn_touch_auction_state() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_auction_state on auction_state;
create trigger trg_touch_auction_state
before update on auction_state
for each row execute function fn_touch_auction_state();
