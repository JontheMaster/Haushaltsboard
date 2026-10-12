-- Essensplan: Hackfleisch am Vortag rauslegen (12.10.2026, Wunsch Jonathan).
-- Ist morgen ein Essen geplant, in dem Hackfleisch steckt (Zutat im Rezept, Rezeptname oder Name des Essens),
-- legt das Board heute ein Todo „Hackfleisch rauslegen · morgen …“ an (Offen, mit Erinnerung um 17 Uhr; wird das
-- Essen später eingeplant, sofort). Die Push kommt über die normalen Todo-Erinnerungen (Cron send-reminders, bei
-- „Offen“ an beide Handys). Pro Essen nur einmal (`meals.thaw_todo_at`), auch wenn das Todo gelöscht wird.
-- Erkennung: „Hackfleisch“ oder ein Wort, das auf „hack“ endet (Rinderhack, gemischtes Hack), nicht „gehackt“.

alter table public.meals add column if not exists thaw_todo_at timestamptz;

create or replace function private.thaw_todos()
returns int language plpgsql security definer set search_path = '' as $$
declare
  now_b timestamp := now() at time zone 'Europe/Berlin';
  today date := (now() at time zone 'Europe/Berlin')::date;
  remind timestamptz := greatest(now() + interval '1 minute', (today + time '17:00') at time zone 'Europe/Berlin');
  n int := 0;
  m record;
  pat text := '(hackfleisch|hack\M)';
begin
  if not coalesce((select enabled from public.modules where id = 'essensplan'), false) then
    return 0;
  end if;
  -- nur tagsüber (nachts keine Push)
  if extract(hour from now_b) < 10 or extract(hour from now_b) >= 22 then
    return 0;
  end if;
  for m in
    select ml.id, ml.title
      from public.meals ml
      left join public.recipes r on r.id = ml.recipe_id
     where ml.day = today + 1 and ml.thaw_todo_at is null
       and (ml.title ~* pat or coalesce(r.title, '') ~* pat
            or exists (select 1 from jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) i where (i ->> 'name') ~* pat))
     order by ml.start_time nulls last
  loop
    insert into public.todos (title, due_date, remind_at)
      values (left('Hackfleisch rauslegen · morgen ' || m.title, 200), today, remind);
    update public.meals set thaw_todo_at = now() where id = m.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

select cron.schedule('thaw-todos', '5 * * * *', 'select private.thaw_todos()');
