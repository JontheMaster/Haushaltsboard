-- NFC-Baustein „Timer starten“ (z. B. Waschmaschine): Karte oben an Wand und Handy mit Restzeit,
-- am Ende Push an beide und optional ein Todo ohne Person (Entscheidung Jonathan 11.10.2026).

alter table public.nfc_actions drop constraint nfc_actions_type_check;
alter table public.nfc_actions add constraint nfc_actions_type_check
  check (type in ('log', 'chore_done', 'todo_done', 'todo_create', 'bring_add', 'visit_toggle', 'notify', 'timer'));

create table public.timers (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 1 and 60),
  icon text not null default 'Timer',
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  started_by uuid references public.members on delete set null,
  action_id uuid references public.nfc_actions on delete set null,
  done_text text not null default '',
  todo_title text,
  finished_at timestamptz,
  cancelled_at timestamptz
);
create index timers_open_idx on public.timers (ends_at) where finished_at is null and cancelled_at is null;
create index timers_started_by_idx on public.timers (started_by);
create index timers_action_id_idx on public.timers (action_id);

alter table public.timers enable row level security;
create policy "Nur Mitglieder" on public.timers for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

alter publication supabase_realtime add table public.timers;

-- jede Minute: abgelaufene Timer abschließen (Push + Todo), nur wenn einer fällig ist
select cron.schedule('finish-timers', '* * * * *', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/nfc',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"finish-timers"}'::jsonb
  )
  where exists (
    select 1 from public.timers where ends_at <= now() and finished_at is null and cancelled_at is null
  );
$$);
