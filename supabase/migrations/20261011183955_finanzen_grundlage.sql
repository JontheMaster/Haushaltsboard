-- Finanzen, Stufe 1 (11.10.2026, Spezifikation docs/finanzen-modul.md): Kategorien, Regeln, Buchungen, Importe,
-- Zustimmung pro Person. Keine IBAN, kein BIC, keine Mandatsreferenzen, keine Kontostände (entfernt der Parser).

-- Wand-Tablet-Konto? (sieht nie einzelne Buchungen)
create or replace function private.is_board()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_board from public.members where id = (select auth.uid())), false)
$$;

-- Wer Finanzen für sich eingeschaltet hat (Leviona nur, wenn sie selbst zustimmt); gemeinsame Konten = Haushalt
create table public.fin_profiles (
  member uuid primary key references public.members on delete cascade,
  enabled boolean not null default false,
  -- Kontonamen aus dem CSV-Kopf, deren Buchungen standardmäßig zum Haushalt zählen
  joint_accounts text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.fin_categories (
  id text primary key,
  name text not null,
  icon text not null,
  -- Palettenton aus dem Design System (z. B. pine-600)
  color text not null,
  -- expense = Ausgabe, income = Einnahme, transfer = Umbuchung (zählt nicht als Ausgabe)
  kind text not null default 'expense' check (kind in ('expense', 'income', 'transfer')),
  household_default boolean not null default false,
  monthly_budget numeric(10, 2),
  sort int not null default 0
);

create table public.fin_rules (
  id uuid primary key default gen_random_uuid(),
  -- Text (enthält, ohne Groß/klein) oder /Regex/
  pattern text not null check (length(pattern) between 2 and 120),
  field text not null default 'counterparty' check (field in ('counterparty', 'purpose', 'kind')),
  category text not null references public.fin_categories on delete cascade,
  household boolean,
  -- null = für beide (mitgeliefert), sonst nur für diese Person
  owner uuid references public.members on delete cascade,
  hits int not null default 0,
  created_from text not null default 'manual' check (created_from in ('seed', 'manual')),
  created_at timestamptz not null default now()
);
create index fin_rules_owner_idx on public.fin_rules (owner);

create table public.fin_transactions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.members on delete cascade,
  booked_on date not null,
  -- Zeitpunkt der Kartenzahlung (aus der CSV „KAUFUMSATZ … HHMMSS“ oder Apple Pay), sonst null
  booked_at timestamptz,
  counterparty text not null,
  purpose text not null default '' check (length(purpose) <= 140),
  -- Buchungstext der Bank (Lastschrift, Gutschrift, Dauerauftrag …)
  kind text not null default '',
  amount numeric(12, 2) not null,
  currency text not null default 'EUR',
  category text not null default 'sonstiges' references public.fin_categories on delete set default,
  household boolean not null default false,
  -- noch keine sichere Kategorie → steht in „Zuordnen“
  needs_review boolean not null default false,
  source text not null default 'csv' check (source in ('csv', 'applepay')),
  status text not null default 'booked' check (status in ('pending', 'booked')),
  wallet text,
  -- letzte 4 Ziffern der Karte (wer hat bezahlt, Stufe 4)
  card text check (card ~ '^\d{4}$'),
  account text,
  hash text not null,
  linked_id uuid references public.fin_transactions on delete set null,
  split jsonb,
  created_at timestamptz not null default now(),
  unique (owner, hash)
);
create index fin_tx_owner_day_idx on public.fin_transactions (owner, booked_on desc);
create index fin_tx_household_idx on public.fin_transactions (booked_on desc) where household;

create table public.fin_imports (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.members on delete cascade,
  file_name text,
  account text,
  "from" date,
  "to" date,
  rows_total int not null default 0,
  rows_new int not null default 0,
  rows_duplicate int not null default 0,
  at timestamptz not null default now()
);
create index fin_imports_owner_idx on public.fin_imports (owner, at desc);

alter table public.fin_profiles enable row level security;
alter table public.fin_categories enable row level security;
alter table public.fin_rules enable row level security;
alter table public.fin_transactions enable row level security;
alter table public.fin_imports enable row level security;

create policy "Eigenes Profil" on public.fin_profiles for all to authenticated
  using ((select private.is_member()) and member = (select auth.uid()))
  with check ((select private.is_member()) and member = (select auth.uid()));

-- Kategorien: alle Mitglieder lesen und ändern (Budgets gemeinsam)
create policy "Kategorien lesen" on public.fin_categories for select to authenticated using ((select private.is_member()));
create policy "Kategorien ändern" on public.fin_categories for update to authenticated
  using ((select private.is_member()) and not (select private.is_board()))
  with check ((select private.is_member()) and not (select private.is_board()));

-- Regeln: gemeinsame (owner null) lesen, eigene verwalten
create policy "Regeln lesen" on public.fin_rules for select to authenticated
  using ((select private.is_member()) and (owner is null or owner = (select auth.uid())));
create policy "Eigene Regeln" on public.fin_rules for insert to authenticated
  with check ((select private.is_member()) and owner = (select auth.uid()));
create policy "Eigene Regeln ändern" on public.fin_rules for update to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()))
  with check ((select private.is_member()) and owner = (select auth.uid()));
create policy "Eigene Regeln löschen" on public.fin_rules for delete to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()));

-- Buchungen: eigene sieht nur der Besitzer, Haushalt beide; das Wand-Tablet nie einzelne Buchungen
create policy "Buchungen lesen" on public.fin_transactions for select to authenticated
  using ((select private.is_member()) and not (select private.is_board()) and (owner = (select auth.uid()) or household));
create policy "Eigene Buchungen anlegen" on public.fin_transactions for insert to authenticated
  with check ((select private.is_member()) and owner = (select auth.uid()));
create policy "Eigene Buchungen ändern" on public.fin_transactions for update to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()))
  with check ((select private.is_member()) and owner = (select auth.uid()));
create policy "Eigene Buchungen löschen" on public.fin_transactions for delete to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()));

create policy "Eigene Importe" on public.fin_imports for all to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()))
  with check ((select private.is_member()) and owner = (select auth.uid()));

alter publication supabase_realtime add table public.fin_transactions;
alter publication supabase_realtime add table public.fin_profiles;

-- Start-Kategorien (Farben = Palettentöne; Blau/Beere bleiben den Personen, Grün/Rot erledigt/dringend)
insert into public.fin_categories (id, name, icon, color, kind, household_default, sort) values
  ('lebensmittel', 'Lebensmittel', 'ShoppingCart', 'pine-600', 'expense', true, 1),
  ('drogerie', 'Drogerie', 'SprayCan', 'sage-600', 'expense', true, 2),
  ('haushalt', 'Haushalt', 'House', 'moss-600', 'expense', true, 3),
  ('wohnen', 'Wohnen', 'KeyRound', 'ember-600', 'expense', true, 4),
  ('nebenkosten', 'Nebenkosten', 'Zap', 'honey-600', 'expense', true, 5),
  ('mobilitaet', 'Mobilität', 'Bus', 'peach-600', 'expense', false, 6),
  ('essen-gehen', 'Essen gehen', 'UtensilsCrossed', 'coral-600', 'expense', false, 7),
  ('lieferdienste', 'Lieferdienste', 'Bike', 'brick-600', 'expense', false, 8),
  ('freizeit', 'Freizeit', 'PartyPopper', 'apricot-600', 'expense', false, 9),
  ('abos', 'Abos', 'Repeat', 'sage-400', 'expense', false, 10),
  ('gesundheit', 'Gesundheit', 'HeartPulse', 'pine-400', 'expense', false, 11),
  ('kleidung', 'Kleidung', 'Shirt', 'peach-400', 'expense', false, 12),
  ('geschenke', 'Geschenke', 'Gift', 'coral-400', 'expense', false, 13),
  ('sonstiges', 'Sonstiges', 'Shapes', 'moss-400', 'expense', false, 14),
  ('einnahmen', 'Einnahmen', 'ArrowDownLeft', 'honey-400', 'income', false, 15),
  ('umbuchung', 'Umbuchung', 'ArrowLeftRight', 'pine-200', 'transfer', false, 16);

-- Start-Regeln für typische Händler (für beide)
insert into public.fin_rules (pattern, field, category, created_from) values
  ('rewe', 'counterparty', 'lebensmittel', 'seed'),
  ('edeka', 'counterparty', 'lebensmittel', 'seed'),
  ('aldi', 'counterparty', 'lebensmittel', 'seed'),
  ('lidl', 'counterparty', 'lebensmittel', 'seed'),
  ('netto', 'counterparty', 'lebensmittel', 'seed'),
  ('kaufland', 'counterparty', 'lebensmittel', 'seed'),
  ('penny', 'counterparty', 'lebensmittel', 'seed'),
  ('lebensm', 'counterparty', 'lebensmittel', 'seed'),
  ('/\bdm\b|dm-drogerie/', 'counterparty', 'drogerie', 'seed'),
  ('rossmann', 'counterparty', 'drogerie', 'seed'),
  ('/m(ü|ue)ller/', 'counterparty', 'drogerie', 'seed'),
  ('lieferando', 'counterparty', 'lieferdienste', 'seed'),
  ('wolt', 'counterparty', 'lieferdienste', 'seed'),
  ('uber eats', 'counterparty', 'lieferdienste', 'seed'),
  ('/\bdb\b|deutsche bahn|db vertrieb/', 'counterparty', 'mobilitaet', 'seed'),
  ('/\bvag\b|verkehrs-aktiengesellschaft/', 'counterparty', 'mobilitaet', 'seed'),
  ('/\b(aral|shell|esso|jet|total ?energies|agip|star tankstelle)\b|tankstelle/', 'counterparty', 'mobilitaet', 'seed'),
  ('netflix', 'counterparty', 'abos', 'seed'),
  ('spotify', 'counterparty', 'abos', 'seed'),
  ('disney', 'counterparty', 'abos', 'seed'),
  ('/apple\.com|\bapple\b/', 'counterparty', 'abos', 'seed'),
  ('google', 'counterparty', 'abos', 'seed'),
  ('wertpapier', 'kind', 'umbuchung', 'seed');

-- Modul (global an; ob jemand mitmacht, steht in fin_profiles)
insert into public.modules (id, enabled, config) values ('finanzen', true, '{}'::jsonb) on conflict (id) do nothing;

-- Am 1. jedes Monats: Todo „Umsätze hochladen“ für jede Person mit eingeschaltetem Finanzen-Modul
create or replace function private.finance_upload_todos()
returns int language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  n int := 0;
begin
  if not coalesce((select enabled from public.modules where id = 'finanzen'), false) then
    return 0;
  end if;
  insert into public.todos (title, assignee, due_date)
  select 'Umsätze hochladen', p.member, today
    from public.fin_profiles p
    join public.members m on m.id = p.member and not m.is_board
   where p.enabled
     and not exists (select 1 from public.todos t where t.title = 'Umsätze hochladen' and t.assignee = p.member and t.due_date = today);
  get diagnostics n = row_count;
  return n;
end;
$$;

select cron.schedule('finance-upload-todos', '0 4 1 * *', $$ select private.finance_upload_todos(); $$);
