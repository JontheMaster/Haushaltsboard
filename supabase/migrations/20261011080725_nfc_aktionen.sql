-- NFC-Aktionen: ein Sticker löst per iPhone-Kurzbefehl eine Aktion aus (Edge Function `nfc`).
-- Nur die Technik, keine fertigen Aktionen (Entscheidung Jonathan 11.10.2026): Tags legt Jonathan selbst an.

create table public.nfc_actions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  label text not null check (length(label) between 1 and 60),
  icon text not null default 'Nfc',
  type text not null check (type in ('log', 'chore_done', 'todo_done', 'todo_create', 'bring_add', 'visit_toggle', 'notify')),
  params jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  category text not null default 'haushalt' check (category in ('haushalt', 'persoenlich', 'vorrat', 'wartung', 'spass')),
  points int not null default 1 check (points between 0 and 100),
  private boolean not null default false,
  owner uuid references public.members on delete cascade,
  created_at timestamptz not null default now(),
  -- private Aktionen gehören immer einer Person
  check (not private or owner is not null)
);
create index nfc_actions_owner_idx on public.nfc_actions (owner);

-- Persönliche Kurzbefehl-Tokens: nur der SHA-256-Hash wird gespeichert, der Token selbst nie
create table public.member_tokens (
  id uuid primary key default gen_random_uuid(),
  member uuid not null references public.members on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (length(label) between 1 and 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked boolean not null default false
);
create index member_tokens_member_idx on public.member_tokens (member);

-- Protokoll: jeder Aufruf, auch Fehler
create table public.nfc_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  action_id uuid references public.nfc_actions on delete set null,
  member uuid references public.members on delete set null,
  at timestamptz not null default now(),
  ok boolean not null,
  message text not null default '',
  private boolean not null default false
);
create index nfc_events_at_idx on public.nfc_events (at desc);
create index nfc_events_member_action_idx on public.nfc_events (member, action_id, at desc);
create index nfc_events_action_id_idx on public.nfc_events (action_id);

alter table public.nfc_actions enable row level security;
alter table public.member_tokens enable row level security;
alter table public.nfc_events enable row level security;

-- Aktionen: alle Mitglieder; private nur ihr Besitzer
create policy "NFC-Aktionen" on public.nfc_actions for all to authenticated
  using ((select private.is_member()) and (not private or owner = (select auth.uid())))
  with check ((select private.is_member()) and (not private or owner = (select auth.uid())));

-- Tokens: jede Person nur ihre eigenen
create policy "Eigene Tokens" on public.member_tokens for all to authenticated
  using ((select private.is_member()) and member = (select auth.uid()))
  with check ((select private.is_member()) and member = (select auth.uid()));

-- Events: lesen für Mitglieder, private nur für die Person selbst; schreiben nur die Edge Function (Service-Rolle)
create policy "NFC-Protokoll lesen" on public.nfc_events for select to authenticated
  using ((select private.is_member()) and (not private or member = (select auth.uid())));

alter publication supabase_realtime add table public.nfc_actions, public.nfc_events;

-- Modul für „Alle Funktionen“
insert into public.modules (id, enabled, config) values ('nfc', true, '{}'::jsonb) on conflict (id) do nothing;
