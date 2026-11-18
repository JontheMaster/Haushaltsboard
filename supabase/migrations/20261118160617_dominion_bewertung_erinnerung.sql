-- Dominion Stufe 2 (18.11.2026): Erinnerung per Push, ein gespieltes Set zu bewerten (gut / naja).
-- 3 Std nach „Das spielen wir“; fiele das in die Nacht (22–9 Uhr Berlin), dann am nächsten Morgen um 10 Uhr.
-- Empfänger: modules.config.push_rating von „dominion“ (Mitglieder-IDs, jede Person schaltet es selbst ein).
alter table public.dominion_games add column remind_at timestamptz, add column reminded_at timestamptz;

create or replace function private.dominion_remind_at(p_from timestamptz)
returns timestamptz language sql immutable set search_path = '' as $$
  select case
    when extract(hour from (p_from + interval '3 hours') at time zone 'Europe/Berlin') >= 22
      then ((((p_from + interval '3 hours') at time zone 'Europe/Berlin')::date + 1) + time '10:00') at time zone 'Europe/Berlin'
    when extract(hour from (p_from + interval '3 hours') at time zone 'Europe/Berlin') < 9
      then ((((p_from + interval '3 hours') at time zone 'Europe/Berlin')::date) + time '10:00') at time zone 'Europe/Berlin'
    else p_from + interval '3 hours'
  end
$$;

create or replace function private.dominion_games_remind()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.played and new.rating is null and new.remind_at is null then
    new.remind_at := private.dominion_remind_at(now());
  end if;
  return new;
end;
$$;
create trigger dominion_games_remind before insert or update of played on public.dominion_games
  for each row execute function private.dominion_games_remind();

create or replace function private.dominion_rating_reminders()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  items jsonb;
  mod record;
begin
  select enabled, config into mod from public.modules where id = 'dominion';
  -- erst als erinnert markieren, dann schicken: nichts doppelt; zu alte (> 1 Tag verpasst) nur markieren
  with due as (
    update public.dominion_games
       set reminded_at = now()
     where rating is null and reminded_at is null and remind_at <= now()
    returning id, remind_at, played_on
  )
  select jsonb_agg(jsonb_build_object('id', id, 'played_on', played_on)) filter (where remind_at > now() - interval '1 day')
    into items from due;

  if items is not null and coalesce(mod.enabled, false) and jsonb_array_length(coalesce(mod.config -> 'push_rating', '[]'::jsonb)) > 0 then
    perform net.http_post(
      url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
      body := jsonb_build_object('action', 'dominion-rate', 'items', items)
    );
  end if;
  return coalesce(items, '[]'::jsonb);
end;
$$;
revoke execute on function private.dominion_rating_reminders() from public, anon, authenticated;

select cron.schedule('dominion-rating-reminder', '*/10 * * * *', $$select private.dominion_rating_reminders()$$);

-- Jonathan will die Erinnerung (18.11.2026); Leviona schaltet sie bei Bedarf selbst ein
update public.modules
   set config = config || jsonb_build_object('push_rating', jsonb_build_array('a1cc1232-2320-4976-9bf6-a6fa265c2450'))
 where id = 'dominion' and not (config ? 'push_rating');
