-- Massagen-Konto (Wunsch Jonathan 4.11.2026): wer bei Wetten gewonnen hat, hat Massagen gut.
-- Jede Zeile ist eine Buchung: +1 gewonnen, -1 eingelöst. Stand = Summe pro Person. Nur am Handy, nie am Tablet.
create table public.massage_log (
  id uuid primary key default gen_random_uuid(),
  member uuid not null references public.members (id) on delete cascade,
  delta smallint not null check (delta in (1, -1)),
  note text check (char_length(note) <= 120),
  created_by uuid references public.members (id) on delete set null,
  source text not null default 'app' check (source in ('app', 'alexa')),
  created_at timestamptz not null default now()
);
create index massage_log_member_idx on public.massage_log (member, created_at desc);

alter table public.massage_log enable row level security;
create policy "Mitglieder ohne Tablet lesen" on public.massage_log for select to authenticated
  using ((select private.is_member()) and not (select private.is_board()));
create policy "Mitglieder ohne Tablet buchen" on public.massage_log for insert to authenticated
  with check ((select private.is_member()) and not (select private.is_board()));
create policy "Mitglieder ohne Tablet nehmen zurück" on public.massage_log for delete to authenticated
  using ((select private.is_member()) and not (select private.is_board()));

alter publication supabase_realtime add table public.massage_log;

insert into public.modules (id, enabled, config) values ('massagen', true, '{}'::jsonb) on conflict (id) do nothing;
