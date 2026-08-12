-- =====================================================================
-- Schermo "visualizzatore" per proiettore: durante il countdown mostra
-- CHI sta partecipando alla busta corrente (solo i nomi, mai gli
-- importi — quelli restano segreti fino alla chiusura del round, esatto
-- come per tutto il resto dell'app). Per farlo serve un elenco pubblico
-- degli id dei partecipanti che hanno risposto "partecipo" sul round
-- corrente: lo teniamo aggiornato con lo stesso trigger che già
-- mantiene responded_count/participating_count.
-- =====================================================================

alter table bid_rounds add column if not exists participating_participant_ids uuid[] not null default '{}';

create or replace function fn_bid_progress_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update bid_rounds
     set responded_count = (select count(*) from bids where round_id = coalesce(new.round_id, old.round_id)),
         participating_count = (select count(*) from bids where round_id = coalesce(new.round_id, old.round_id) and decision = 'partecipo'),
         participating_participant_ids = (
           select coalesce(array_agg(participant_id), array[]::uuid[])
           from bids where round_id = coalesce(new.round_id, old.round_id) and decision = 'partecipo'
         )
   where id = coalesce(new.round_id, old.round_id);
  return coalesce(new, old);
end;
$$;
