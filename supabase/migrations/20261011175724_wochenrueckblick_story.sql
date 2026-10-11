-- Wochenrückblick als Story (11.10.2026): zusätzlich Todos/Putzplan pro Person, früheste und späteste Uhrzeit
-- beim Abhaken (Auszeichnungen Frühaufsteher/Nachteule), fertige Timer (Wäsche-Runden) und Heimwege mit km.
create or replace function private.week_recap(p_week_start date)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  with bounds as (
    select p_week_start as d0, p_week_start + 6 as d6,
           least(p_week_start + 6, (now() at time zone 'Europe/Berlin')::date) as dm,
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
    select r.title, c.done_by, (c.done_at at time zone 'Europe/Berlin')::date as day, c.done_at
      from public.chore_tasks c join public.chore_rules r on r.id = c.rule_id, bounds b
     where c.done_at >= b.t0 and c.done_at < b.t1
  ),
  all_done as (
    select day, done_by, done_at, 'todos' as kind from done_todos
    union all
    select day, done_by, done_at, 'chores' as kind from done_chores
  ),
  -- Uhrzeit beim Abhaken, Nacht bis 4 Uhr zählt zum Vortag (spät, nicht früh)
  clock as (
    select done_by, to_char(done_at at time zone 'Europe/Berlin', 'HH24:MI') as hm,
           ((extract(hour from done_at at time zone 'Europe/Berlin')::int + 20) % 24) * 60
             + extract(minute from done_at at time zone 'Europe/Berlin')::int as rank
      from all_done where done_by is not null
  ),
  done_timers as (
    select t.label from public.timers t, bounds b
     where t.finished_at >= b.t0 and t.finished_at < b.t1 and t.cancelled_at is null
  ),
  done_drives as (
    select d.member, d.length_m from public.drives d, bounds b
     where d.arrived_at >= b.t0 and d.arrived_at < b.t1 and d.cancelled_at is null
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
    'by', coalesce((select jsonb_object_agg(k, n) from (select coalesce(done_by::text, 'open') as k, count(*) as n from all_done group by 1) x), '{}'::jsonb),
    'by_kind', coalesce((select jsonb_object_agg(k, jsonb_build_object('todos', nt, 'chores', nc))
                           from (select coalesce(done_by::text, 'open') as k,
                                        count(*) filter (where kind = 'todos') as nt,
                                        count(*) filter (where kind = 'chores') as nc
                                   from all_done group by 1) x), '{}'::jsonb),
    'earliest', (select jsonb_build_object('member', done_by, 'time', hm) from clock order by rank limit 1),
    'latest', (select jsonb_build_object('member', done_by, 'time', hm) from clock order by rank desc limit 1),
    'best_day', (select jsonb_build_object('day', day, 'n', n) from (select day, count(*) as n from all_done group by day order by n desc, day limit 1) x),
    'meals', coalesce((select jsonb_agg(jsonb_build_object('title', m.title, 'day', m.day, 'recipe_id', m.recipe_id) order by m.day, m.start_time nulls last)
                         from public.meals m where m.day between b.d0 and b.dm), '[]'::jsonb),
    'timers', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc)
                          from (select label, count(*) as n from done_timers group by label) x), '[]'::jsonb),
    'drives', jsonb_build_object(
      'n', (select count(*) from done_drives),
      'km', coalesce((select round(sum(length_m) / 1000.0) from done_drives), 0)
    ),
    'open', (select count(*) from public.todos t where t.done_at is null and t.due_date between b.d0 and b.d6)
          + (select count(*) from public.chore_tasks c where c.done_at is null and c.due_date between b.d0 and b.d6),
    'prev_done', (select count(*) from public.todos t where t.done_at >= b.tp and t.done_at < b.t0)
               + (select count(*) from public.chore_tasks c where c.done_at >= b.tp and c.done_at < b.t0),
    'photos', (select count(*) from public.photos p where p.created_at >= b.t0 and p.created_at < b.t1)
  )
  from bounds b;
$function$;
