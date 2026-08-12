-- =====================================================================
-- Account utente reali (Supabase Auth) al posto del token anonimo.
--
-- Modello:
--  - Chiunque può registrarsi liberamente (email + password, gestiti da
--    Supabase Auth). Alla creazione di un account, un trigger crea
--    automaticamente una riga in `profiles` (display_name, is_admin).
--  - Esiste UN SOLO amministratore globale (vincolo enforced a livello
--    di indice: `profiles_single_admin_idx`). Solo lui può creare leghe
--    e gestire gli utenti. Va promosso manualmente con una query dedicata
--    DOPO essersi registrato la prima volta (vedi istruzioni separate).
--  - Un utente loggato entra in una lega inserendo il codice: diventa un
--    `participants` collegato al proprio account (`user_id`), non più a
--    un token casuale.
--  - `profiles` non ha alcuna policy RLS (come `bids`): accessibile solo
--    da service_role lato server, mai direttamente dal browser.
--
-- Dato che introduce un cambio di modello incompatibile con i dati di
-- test già presenti, questa migration AZZERA tutte le leghe/partecipanti
-- esistenti (scelta confermata dall'utente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Azzeramento dati di test (nessun account utente reale esisteva
--    ancora, quindi non tocchiamo auth.users).
-- ---------------------------------------------------------------------
truncate table history, rosters, bids, bid_rounds, auction_state, participants, players, leagues cascade;

-- ---------------------------------------------------------------------
-- 2. PROFILES — un profilo per ogni account Supabase Auth registrato.
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Al massimo un profilo può avere is_admin = true in qualsiasi momento:
-- questo è ciò che garantisce "un solo amministratore globale".
create unique index if not exists profiles_single_admin_idx on profiles (is_admin) where is_admin = true;

alter table profiles enable row level security;
-- Nessuna policy: deny-all per anon/authenticated, come `bids`. Solo le
-- API route (service_role) leggono/scrivono profiles.

-- Trigger: crea automaticamente il profilo alla registrazione.
create or replace function fn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
after insert on auth.users
for each row execute function fn_handle_new_user();

-- ---------------------------------------------------------------------
-- 3. LEAGUES — non serve più una password admin per lega: solo
--    l'amministratore globale (profiles.is_admin) può crearne.
-- ---------------------------------------------------------------------
alter table leagues drop column if exists admin_password_hash;
alter table leagues add column if not exists created_by uuid references auth.users(id);

-- ---------------------------------------------------------------------
-- 4. PARTICIPANTS — collegati a un account reale (user_id) invece che
--    a un token casuale. Un utente può essere iscritto una sola volta
--    per lega (non più "univoco per nome": due persone possono avere
--    lo stesso nome visualizzato).
-- ---------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'participants'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%display_name%'
  loop
    execute format('alter table participants drop constraint %I', c.conname);
  end loop;
end $$;

alter table participants drop column if exists token_hash;
alter table participants add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table participants alter column user_id set not null;

create unique index if not exists participants_league_user_unique on participants(league_id, user_id);

comment on table profiles is 'Un profilo per account Supabase Auth. Nessuna policy RLS: solo service_role vi accede.';
