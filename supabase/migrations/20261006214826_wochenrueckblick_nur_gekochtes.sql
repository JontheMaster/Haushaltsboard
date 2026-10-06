-- „Gekocht“: nur Essen bis heute (in der laufenden Woche stehen sonst schon die geplanten der nächsten Tage drin)
create or replace function private.week_recap(p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
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
                         from public.meals m where m.day between b.d0 and b.dm), '[]'::jsonb),
    -- in dieser Woche fällig und nicht erledigt
    'open', (select count(*) from public.todos t where t.done_at is null and t.due_date between b.d0 and b.d6)
          + (select count(*) from public.chore_tasks c where c.done_at is null and c.due_date between b.d0 and b.d6),
    'prev_done', (select count(*) from public.todos t where t.done_at >= b.tp and t.done_at < b.t0)
               + (select count(*) from public.chore_tasks c where c.done_at >= b.tp and c.done_at < b.t0),
    'photos', (select count(*) from public.photos p where p.created_at >= b.t0 and p.created_at < b.t1)
  )
  from bounds b;
$$;
