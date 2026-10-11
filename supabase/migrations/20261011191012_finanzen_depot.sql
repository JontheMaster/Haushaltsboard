-- Finanzen, Stufe 5 „Depot“ (11.10.2026, docs/finanzen-modul.md): Bestände, Buchungen, Sparpläne, Kurse, Sparziele.
-- Kein Zugriff aufs Depot: das Board kennt nur Positionen und Stückzahlen, Kurse kommen öffentlich (depot-quotes).

create table public.fin_holdings (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.members on delete cascade,
  isin text not null check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  name text not null,
  -- Börsenkürzel für die Kurs-API (Yahoo, z. B. EUNL.DE = Xetra); null = noch nicht gefunden
  symbol text,
  -- aktueller Stand, per Trigger aus fin_holding_tx gerechnet
  quantity numeric(18, 6) not null default 0,
  invested numeric(12, 2) not null default 0,
  avg_buy_price numeric(14, 4),
  currency text not null default 'EUR',
  household boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner, isin)
);

create table public.fin_holding_tx (
  id uuid primary key default gen_random_uuid(),
  holding uuid not null references public.fin_holdings on delete cascade,
  date date not null,
  type text not null check (type in ('buy', 'sell', 'savings_plan', 'dividend', 'correction')),
  -- Stück (bei sell positiv; correction mit Vorzeichen), bei dividend 0
  quantity numeric(18, 6) not null default 0,
  price numeric(14, 4),
  -- Betrag in Euro (Kauf/Sparplan = eingezahlt, sell = Erlös, dividend = Ausschüttung, correction mit Vorzeichen)
  amount numeric(12, 2) not null default 0,
  source text not null default 'manual' check (source in ('manual', 'csv', 'plan')),
  hash text,
  note text,
  created_at timestamptz not null default now(),
  unique (holding, hash)
);
create index fin_holding_tx_holding_idx on public.fin_holding_tx (holding, date);

create table public.fin_savings_plans (
  id uuid primary key default gen_random_uuid(),
  holding uuid not null references public.fin_holdings on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  day_of_month int not null check (day_of_month between 1 and 28),
  active boolean not null default true,
  -- Monat der letzten Ausführung (YYYY-MM-01), gegen doppelte Buchung
  last_month date,
  created_at timestamptz not null default now()
);

-- öffentliche Kurse (Cache) und Tagesschlusskurse
create table public.fin_quotes (
  symbol text primary key,
  price numeric(14, 4) not null,
  currency text not null default 'EUR',
  at timestamptz not null,
  fetched_at timestamptz not null default now(),
  source text not null default 'yahoo'
);
create table public.fin_quotes_daily (
  symbol text not null,
  day date not null,
  close numeric(14, 4) not null,
  primary key (symbol, day)
);

create table public.fin_goals (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.members on delete cascade,
  name text not null check (length(name) between 1 and 60),
  target_amount numeric(12, 2) not null check (target_amount > 0),
  source text not null default 'depot' check (source in ('depot', 'konto', 'beides')),
  deadline date,
  household boolean not null default false,
  created_at timestamptz not null default now()
);

-- Stand einer Position aus ihren Buchungen nachrechnen
create or replace function private.fin_holding_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  h uuid := coalesce(new.holding, old.holding);
  q numeric;
  inv numeric;
begin
  select
    coalesce(sum(case t.type when 'sell' then -t.quantity when 'dividend' then 0 else t.quantity end), 0),
    coalesce(sum(case t.type when 'sell' then -t.amount when 'dividend' then 0 else t.amount end), 0)
    into q, inv
    from public.fin_holding_tx t where t.holding = h;
  update public.fin_holdings
     set quantity = round(q, 6),
         invested = round(greatest(inv, 0), 2),
         avg_buy_price = case when q > 0 then round(greatest(inv, 0) / q, 4) else null end
   where id = h;
  return null;
end;
$$;
create trigger fin_holding_tx_recalc after insert or update or delete on public.fin_holding_tx
  for each row execute function private.fin_holding_recalc();

alter table public.fin_holdings enable row level security;
alter table public.fin_holding_tx enable row level security;
alter table public.fin_savings_plans enable row level security;
alter table public.fin_quotes enable row level security;
alter table public.fin_quotes_daily enable row level security;
alter table public.fin_goals enable row level security;

-- Bestände: eigene nur Besitzer, gemeinsame beide, Tablet nie
create policy "Bestände lesen" on public.fin_holdings for select to authenticated
  using ((select private.is_member()) and not (select private.is_board()) and (owner = (select auth.uid()) or household));
create policy "Eigene Bestände" on public.fin_holdings for insert to authenticated
  with check ((select private.is_member()) and owner = (select auth.uid()));
create policy "Eigene Bestände ändern" on public.fin_holdings for update to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()))
  with check ((select private.is_member()) and owner = (select auth.uid()));
create policy "Eigene Bestände löschen" on public.fin_holdings for delete to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()));

-- Buchungen und Sparpläne folgen ihrer Position (RLS der Position gilt in der Unterabfrage)
create policy "Depot-Buchungen lesen" on public.fin_holding_tx for select to authenticated
  using (exists (select 1 from public.fin_holdings h where h.id = holding));
create policy "Eigene Depot-Buchungen" on public.fin_holding_tx for all to authenticated
  using (exists (select 1 from public.fin_holdings h where h.id = holding and h.owner = (select auth.uid())))
  with check (exists (select 1 from public.fin_holdings h where h.id = holding and h.owner = (select auth.uid())));
create policy "Sparpläne lesen" on public.fin_savings_plans for select to authenticated
  using (exists (select 1 from public.fin_holdings h where h.id = holding));
create policy "Eigene Sparpläne" on public.fin_savings_plans for all to authenticated
  using (exists (select 1 from public.fin_holdings h where h.id = holding and h.owner = (select auth.uid())))
  with check (exists (select 1 from public.fin_holdings h where h.id = holding and h.owner = (select auth.uid())));

-- Kurse sind öffentlich, aber nur für Papiere lesbar, die man selbst sehen darf; schreiben nur der Server
create policy "Kurse sichtbarer Papiere" on public.fin_quotes for select to authenticated
  using (exists (select 1 from public.fin_holdings h where h.symbol = fin_quotes.symbol));
create policy "Schlusskurse sichtbarer Papiere" on public.fin_quotes_daily for select to authenticated
  using (exists (select 1 from public.fin_holdings h where h.symbol = fin_quotes_daily.symbol));

create policy "Sparziele lesen" on public.fin_goals for select to authenticated
  using ((select private.is_member()) and not (select private.is_board()) and (owner = (select auth.uid()) or household));
create policy "Eigene Sparziele" on public.fin_goals for all to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()))
  with check ((select private.is_member()) and owner = (select auth.uid()));

alter publication supabase_realtime add table public.fin_holdings;
alter publication supabase_realtime add table public.fin_quotes;

-- Wand-Einstellungen (Standard an): nur Prozent, ruhige Ansicht
update public.modules set config = config || '{"wall_percent_only": true, "wall_calm": true}'::jsonb where id = 'finanzen';
