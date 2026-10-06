-- Erinnerungen per Push: Todo mit Uhrzeit → Mitteilung aufs Handy (nur Handys, nie das Wand-Tablet)
create extension if not exists pg_net with schema extensions;

alter table public.todos
  add column remind_at timestamptz,
  add column reminded_at timestamptz;

-- Neue oder geänderte Uhrzeit: wieder erinnern
create or replace function private.todos_remind_reset()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;
create trigger todos_remind_reset before update on public.todos
  for each row execute function private.todos_remind_reset();

-- Angemeldete Handys. Jedes Mitglied sieht und verwaltet nur seine eigenen.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "Eigene Handys" on public.push_subscriptions for all to authenticated
  using (member_id = (select auth.uid()) and (select private.is_member()))
  with check (member_id = (select auth.uid()) and (select private.is_member()));

-- Schlüssel für Web Push und für den Cron-Aufruf: geheim, nur die Edge Function (Service-Rolle) liest sie
create table public.push_config (
  id int primary key default 1 check (id = 1),
  vapid jsonb,
  cron_key text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1);

-- Modul für „Alle Funktionen“
insert into public.modules (id, enabled, config) values ('erinnerungen', true, '{}'::jsonb)
on conflict (id) do nothing;

-- Rutscht ein Todo um Mitternacht weiter, entfällt die Uhrzeit
create or replace function private.roll_over_todos()
returns void language plpgsql security definer set search_path = '' as $function$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  update public.todos
     set due_date = null, moved_since = null, remind_at = null
   where done_at is null and due_date < today and moved_since is not null;

  update public.todos
     set moved_since = due_date, due_date = today, remind_at = null
   where done_at is null and due_date < today and moved_since is null;
end;
$function$;

-- Jede Minute: nur wenn etwas fällig ist, die Function `reminders` aufrufen
select cron.schedule('send-reminders', '* * * * *', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"send"}'::jsonb
  )
  where exists (
    select 1 from public.todos
     where remind_at <= now() and reminded_at is null and done_at is null
  );
$$);
