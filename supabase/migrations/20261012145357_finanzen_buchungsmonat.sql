-- Finanzen: Monat für die Auswertung (12.10.2026, Wunsch Jonathan). Manche Zahlungen gehören zum Folgemonat:
-- Einzahlungen aufs Gemeinschaftskonto kommen am Monatsende für den nächsten Monat, die Miete wird am 30./31. für den
-- nächsten Monat abgebucht. Regeln in `fin_month_rules` (Muster wie fin_rules, ab Betrag, ab Tag im Monat);
-- passt eine Regel und liegt der Buchungstag ab `from_day`, zählt die Buchung zum Folgemonat (`budget_month`).
-- Die Regeln selbst (mit Namen) stehen nur in der Datenbank, nicht im Repo.

create table if not exists public.fin_month_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  pattern text not null,
  field text not null default 'counterparty' check (field in ('counterparty', 'purpose')),
  min_amount numeric not null default 300,
  from_day int not null default 20 check (from_day between 2 and 31),
  created_at timestamptz not null default now()
);
alter table public.fin_month_rules enable row level security;
create policy "Monatsregeln lesen" on public.fin_month_rules for select to authenticated
  using ((select private.is_member()) and not (select private.is_board()));
create policy "Monatsregeln ändern" on public.fin_month_rules for all to authenticated
  using ((select private.is_member()) and not (select private.is_board()))
  with check ((select private.is_member()) and not (select private.is_board()));

alter table public.fin_transactions add column if not exists budget_month date;

-- Monat einer Buchung: Monatserster, bei passender Regel ab from_day der Folgemonat
create or replace function private.fin_budget_month(p_day date, p_counterparty text, p_purpose text, p_amount numeric)
returns date language sql stable security definer set search_path = '' as $$
  select case when exists (
           select 1 from public.fin_month_rules r
            where abs(p_amount) >= r.min_amount
              and extract(day from p_day) >= r.from_day
              and (case when r.field = 'purpose' then coalesce(p_purpose, '') else coalesce(p_counterparty, '') end) ilike '%' || r.pattern || '%')
         then (date_trunc('month', p_day) + interval '1 month')::date
         else date_trunc('month', p_day)::date end
$$;

create or replace function private.fin_tx_budget_month()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.budget_month := private.fin_budget_month(new.booked_on, new.counterparty, new.purpose, new.amount);
  return new;
end;
$$;
drop trigger if exists fin_tx_budget_month on public.fin_transactions;
create trigger fin_tx_budget_month before insert or update of booked_on, counterparty, purpose, amount
  on public.fin_transactions for each row execute function private.fin_tx_budget_month();

-- Regeln geändert → alle Buchungen neu einordnen
create or replace function private.fin_month_rules_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.fin_transactions t
     set budget_month = private.fin_budget_month(t.booked_on, t.counterparty, t.purpose, t.amount)
   where t.budget_month is distinct from private.fin_budget_month(t.booked_on, t.counterparty, t.purpose, t.amount);
  return null;
end;
$$;
drop trigger if exists fin_month_rules_changed on public.fin_month_rules;
create trigger fin_month_rules_changed after insert or update or delete on public.fin_month_rules
  for each statement execute function private.fin_month_rules_changed();

update public.fin_transactions set budget_month = private.fin_budget_month(booked_on, counterparty, purpose, amount);
alter table public.fin_transactions alter column budget_month set not null;
create index if not exists fin_transactions_budget_month on public.fin_transactions (budget_month);

-- Auswertung: Monat, Schnitt, Verlauf und Einnahmen nach budget_month (Wann/Wo bleiben beim echten Tag)
create or replace function public.fin_overview(p_month date default null, p_household_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := (select auth.uid());
  hh_only boolean := p_household_only or (select private.is_board());
  today date := (now() at time zone 'Europe/Berlin')::date;
  m0 date := date_trunc('month', coalesce(p_month, today))::date;
  m1 date := (date_trunc('month', coalesce(p_month, today)) + interval '1 month')::date;
  result jsonb;
  n3 int;
begin
  if not (select private.is_member()) then
    raise exception 'Nur für Mitglieder';
  end if;

  select greatest(1, count(distinct t.budget_month)) into n3
    from public.fin_transactions t
   where (t.household or (not hh_only and t.owner = viewer))
     and t.budget_month >= (m0 - interval '3 months')::date and t.budget_month < m0;

  with tx as (
    select t.*, c.kind as cat_kind
      from public.fin_transactions t join public.fin_categories c on c.id = t.category
     where (t.household or (not hh_only and t.owner = viewer))
  ),
  spend as (select * from tx where cat_kind = 'expense' and amount < 0),
  cats as (
    select c.id, c.name, c.icon, c.color, c.monthly_budget, c.sort,
      coalesce((select -sum(s.amount) from spend s where s.category = c.id and s.budget_month = m0), 0) as spent,
      coalesce((select -sum(s.amount) / n3 from spend s where s.category = c.id and s.budget_month >= (m0 - interval '3 months')::date and s.budget_month < m0), 0) as avg3
    from public.fin_categories c where c.kind = 'expense'
  )
  select jsonb_build_object(
    'month', m0,
    'household_only', hh_only,
    'days_in_month', (m1 - m0),
    'days_passed', case when today >= m0 and today < m1 then (today - m0) + 1 else (m1 - m0) end,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'icon', icon, 'color', color,
                     'spent', round(spent, 2), 'avg3', round(avg3, 2), 'budget', monthly_budget) order by spent desc, sort)
                   from cats where spent > 0 or avg3 > 0 or monthly_budget is not null), '[]'::jsonb),
    'total_spent', (select round(coalesce(-sum(amount), 0), 2) from spend where budget_month = m0),
    'total_avg3', (select round(coalesce(-sum(amount), 0) / n3, 2) from spend where budget_month >= (m0 - interval '3 months')::date and budget_month < m0),
    'total_income', (select round(coalesce(sum(amount), 0), 2) from tx where cat_kind = 'income' and amount > 0 and budget_month = m0),
    'months', (select jsonb_agg(jsonb_build_object('month', mm,
                  'spent', (select round(coalesce(-sum(s.amount), 0), 2) from spend s where s.budget_month = mm),
                  'income', (select round(coalesce(sum(x.amount), 0), 2) from tx x where x.cat_kind = 'income' and x.amount > 0 and x.budget_month = mm)
                ) order by mm)
               from generate_series((m0 - interval '11 months')::date, m0, interval '1 month') as g(mmt), lateral (select g.mmt::date as mm) z),
    'heatmap', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'n', n, 'sum', round(sm, 2)))
                 from (select extract(isodow from booked_at at time zone 'Europe/Berlin')::int as dow,
                              extract(hour from booked_at at time zone 'Europe/Berlin')::int as hr,
                              count(*) as n, -sum(amount) as sm
                         from spend where booked_at is not null and booked_on > today - 90
                        group by 1, 2) h), '[]'::jsonb),
    'heatmap_n', (select count(*) from spend where booked_at is not null and booked_on > today - 90),
    'merchants', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'avg', round(sm / n, 2), 'sum', round(sm, 2)) order by sm desc)
                  from (select counterparty as name, count(*) as n, -sum(amount) as sm
                          from spend where booked_on > today - 90 and booked_at is not null group by counterparty order by -sum(amount) desc limit 8) w), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.fin_overview(date, boolean) from public, anon;
grant execute on function public.fin_overview(date, boolean) to authenticated;

-- Sparquote: Einnahmen ebenfalls nach budget_month
create or replace function public.fin_savings_rate(p_months integer default 12)
returns table(month date, saved numeric, income numeric) language sql stable set search_path to '' as $$
  with months as (
    select generate_series(
      date_trunc('month', (now() at time zone 'Europe/Berlin'))::date - make_interval(months => p_months - 1),
      date_trunc('month', (now() at time zone 'Europe/Berlin'))::date,
      interval '1 month')::date as month
  )
  select m.month,
    coalesce((select sum(t.amount) from public.fin_holding_tx t join public.fin_holdings h on h.id = t.holding
               where t.type in ('buy', 'savings_plan') and date_trunc('month', t.date)::date = m.month), 0),
    coalesce((select sum(x.amount) from public.fin_transactions x join public.fin_categories c on c.id = x.category
               where c.kind = 'income' and x.amount > 0 and x.budget_month = m.month), 0)
    from months m
   order by m.month
$$;
