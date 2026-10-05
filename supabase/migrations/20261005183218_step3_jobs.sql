-- Schritt 3: Bring!-Token-Speicher und nächtlicher Todo-Job

-- ───────── Bring!-Sitzung ─────────
-- Nur die Edge Function (Service Role) liest und schreibt hier. RLS an, keine Policy = für alle anderen zu.
create table public.bring_session (
  id int primary key default 1 check (id = 1),
  user_uuid text not null,
  access_token text not null,
  expires_at timestamptz not null,
  list_uuid text,
  list_name text
);
alter table public.bring_session enable row level security;
revoke all on public.bring_session from anon, authenticated;

-- Einkauf-Modul: nur die Liste „Zuhause“ (nicht „Anschaffungen“)
update public.modules set config = jsonb_build_object('list_name', 'Zuhause') where id = 'einkauf';

-- ───────── Unerledigte Todos rutschen ─────────
-- Läuft kurz nach Mitternacht (Europe/Berlin).
-- 1. Unerledigt, Tag vorbei, noch nie verschoben → auf heute, moved_since = ursprünglicher Tag („seit …“)
-- 2. Unerledigt, Tag vorbei, schon einmal verschoben → zurück nach „Offen, noch ohne Tag“
create function private.roll_over_todos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  update public.todos
     set due_date = null, moved_since = null
   where done_at is null and due_date < today and moved_since is not null;

  update public.todos
     set moved_since = due_date, due_date = today
   where done_at is null and due_date < today and moved_since is null;
end;
$$;

revoke execute on function private.roll_over_todos() from public, anon, authenticated;

create extension if not exists pg_cron;

-- 23:30 UTC = 0:30 (Winter) bzw. 1:30 (Sommer) in Berlin, also immer nach Mitternacht
select cron.schedule('roll-over-todos', '30 23 * * *', 'select private.roll_over_todos()');
