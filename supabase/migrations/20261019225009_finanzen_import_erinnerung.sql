-- Smarte Import-Erinnerung (Finanzen Stufe 1, Ergänzung 20.10.2026)
alter table public.fin_profiles
  add column import_every_days int not null default 30 check (import_every_days in (14, 30)),
  add column import_push boolean not null default false,
  add column import_pushed_at timestamptz;

-- Verknüpfung eines Todos mit einer Stelle in der App, z. B. 'finanzen-import' (Antippen öffnet den Import)
alter table public.todos add column link text;

-- offene Todos der alten Monats-Erinnerung übernehmen
update public.todos set link = 'finanzen-import' where title = 'Umsätze hochladen' and done_at is null;

-- Verknüpfte Todos rutschen nicht nach der Todo-Regel, sie bleiben auf heute, bis sie erledigt sind
create or replace function private.roll_over_todos()
returns void language plpgsql security definer set search_path = '' as $function$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  update public.todos
     set moved_since = coalesce(moved_since, due_date), due_date = today, remind_at = null
   where done_at is null and due_date < today and link is not null;

  update public.todos
     set due_date = null, moved_since = null, remind_at = null
   where done_at is null and due_date < today and moved_since is not null and link is null;

  update public.todos
     set moved_since = due_date, due_date = today, remind_at = null
   where done_at is null and due_date < today and moved_since is null and link is null;
end;
$function$;

-- Stand pro Person mit Finanzen: bis wann importiert, Frist, Tage seitdem (nur Daten, keine Beträge; auch fürs Tablet)
create or replace function private.fin_import_state()
returns table (member uuid, name text, last_day date, every_days int, days int, push boolean, pushed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.member, m.name,
         coalesce(i.last_to, p.created_at::date) as last_day,
         p.import_every_days,
         ((now() at time zone 'Europe/Berlin')::date - coalesce(i.last_to, p.created_at::date))::int as days,
         p.import_push, p.import_pushed_at
    from public.fin_profiles p
    join public.members m on m.id = p.member and not m.is_board
    left join lateral (select coalesce(max(f."to"), max(f.at)::date) as last_to from public.fin_imports f where f.owner = p.member) i on true
   where p.enabled
     and coalesce((select enabled from public.modules where id = 'finanzen'), false);
$$;

create or replace function public.fin_import_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('member', s.member, 'name', s.name, 'last', s.last_day, 'every', s.every_days, 'days', s.days, 'over', s.days - s.every_days) order by s.name)
                     from private.fin_import_state() s), '[]'::jsonb);
end;
$$;
revoke execute on function public.fin_import_status() from public, anon;
grant execute on function public.fin_import_status() to authenticated;

-- Täglich 9 Uhr Berlin: wer über der Frist ist, bekommt das Todo (oder, wenn eingestellt, eine Mitteilung)
create or replace function private.finance_import_reminders(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  n_todos int := 0;
  pushes jsonb;
begin
  if not p_force and extract(hour from now() at time zone 'Europe/Berlin') <> 9 then
    return jsonb_build_object('skipped', 'nicht 9 Uhr');
  end if;

  insert into public.todos (title, assignee, due_date, link)
  select 'Umsätze hochladen', s.member, today, 'finanzen-import'
    from private.fin_import_state() s
   where s.days > s.every_days and not s.push
     and not exists (select 1 from public.todos t where t.link = 'finanzen-import' and t.assignee = s.member and t.done_at is null);
  get diagnostics n_todos = row_count;

  -- Mitteilung statt Todo: höchstens alle 7 Tage, bis importiert wurde
  with due as (
    select s.member, s.days from private.fin_import_state() s
     where s.days > s.every_days and s.push
       and (s.pushed_at is null or s.pushed_at < now() - interval '7 days')
  ), marked as (
    update public.fin_profiles p set import_pushed_at = now() from due where p.member = due.member returning due.member, due.days
  )
  select jsonb_agg(jsonb_build_object('member', member, 'days', days)) into pushes from marked;

  if pushes is not null then
    perform net.http_post(
      url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
      body := jsonb_build_object('action', 'fin-import', 'items', pushes)
    );
  end if;
  return jsonb_build_object('todos', n_todos, 'pushes', coalesce(pushes, '[]'::jsonb));
end;
$$;
revoke execute on function private.finance_import_reminders(boolean) from public, anon, authenticated;

select cron.unschedule('finance-upload-todos');
drop function if exists private.finance_upload_todos();
select cron.schedule('finance-import-reminders', '0 7,8 * * *', $$ select private.finance_import_reminders(); $$);
