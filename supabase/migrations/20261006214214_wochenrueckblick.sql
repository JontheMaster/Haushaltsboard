-- Wochenrückblick: was in einer Woche (Mo–So, Europe/Berlin) erledigt und gekocht wurde.
-- Board und Handys rufen public.week_recap() auf, die Edge Function reminders für die Sonntags-Mitteilung.

create or replace function private.week_recap(p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with bounds as (
    select p_week_start as d0, p_week_start + 6 as d6,
           (p_week_start::timestamp at time zone 'Europe/Berlin') as t0,
           ((p_week_start + 7)::timestamp at time zone 'Europe/Berlin') as t1,
           ((p_week_start - 7)::timestamp at time zone 'Europe/Berlin') as tp
  ),
  done_todos as (
    select t.title, t.done_by, (t.done_at at time zone 'Europe/Berlin')::date as day, t.done_at
      from public.todos t, bounds b
     where t.done_at >= b.t0 and t.done_at < b.t1
  ),
  done_chores as (
    select r.title, c.done_by, (c.done_at at time zone 'Europe/Berlin')::date as day
      from public.chore_tasks c join public.chore_rules r on r.id = c.rule_id, bounds b
     where c.done_at >= b.t0 and c.done_at < b.t1
  ),
  all_done as (
    select day, done_by from done_todos union all select day, done_by from done_chores
  )
  select jsonb_build_object(
    'week_start', b.d0,
    'week_end', b.d6,
    'todos', jsonb_build_object(
      'done', (select count(*) from done_todos),
      'items', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'done_by', done_by, 'day', day) order by done_at)
                           from (select * from done_todos order by done_at limit 60) x), '[]'::jsonb)
    ),
    'chores', jsonb_build_object(
      'done', (select count(*) from done_chores),
      'items', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'n', n) order by n desc, title)
                           from (select title, count(*) as n from done_chores group by title) x), '[]'::jsonb)
    ),
    -- erledigt pro Person (Todos + Putzplan); ohne done_by zählt es als „open“
    'by', coalesce((select jsonb_object_agg(k, n) from (select coalesce(done_by::text, 'open') as k, count(*) as n from all_done group by 1) x), '{}'::jsonb),
    'best_day', (select jsonb_build_object('day', day, 'n', n) from (select day, count(*) as n from all_done group by day order by n desc, day limit 1) x),
    'meals', coalesce((select jsonb_agg(jsonb_build_object('title', m.title, 'day', m.day, 'recipe_id', m.recipe_id) order by m.day, m.start_time nulls last)
                         from public.meals m where m.day between b.d0 and b.d6), '[]'::jsonb),
    -- in dieser Woche fällig und nicht erledigt
    'open', (select count(*) from public.todos t where t.done_at is null and t.due_date between b.d0 and b.d6)
          + (select count(*) from public.chore_tasks c where c.done_at is null and c.due_date between b.d0 and b.d6),
    'prev_done', (select count(*) from public.todos t where t.done_at >= b.tp and t.done_at < b.t0)
               + (select count(*) from public.chore_tasks c where c.done_at >= b.tp and c.done_at < b.t0),
    'photos', (select count(*) from public.photos p where p.created_at >= b.t0 and p.created_at < b.t1)
  )
  from bounds b;
$$;

-- Für Mitglieder (Board, Handys) und die Edge Function (service_role). Ohne Datum: die laufende Woche.
create or replace function public.week_recap(p_week_start date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not (private.is_member() or auth.role() = 'service_role') then
    raise exception 'Nur für Mitglieder';
  end if;
  return private.week_recap(coalesce(p_week_start, today - (extract(isodow from today)::int - 1)));
end;
$$;

revoke all on function public.week_recap(date) from public, anon;
grant execute on function public.week_recap(date) to authenticated, service_role;

-- Module: Wochenrückblick (config.push = Mitglieder, die sonntags eine Mitteilung wollen) und WLAN für Gäste
insert into public.modules (id, enabled, config) values
  ('wochenrueckblick', true, '{"push": []}'::jsonb),
  ('wlan', true, '{}'::jsonb)
on conflict (id) do nothing;

-- Sonntags 18:00 Berlin: Cron läuft um 16 und 17 Uhr UTC, die Function schickt nur, wenn es in Berlin 18 Uhr ist
select cron.schedule('weekly-recap', '0 16,17 * * 0', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"weekly"}'::jsonb
  );
$$);
