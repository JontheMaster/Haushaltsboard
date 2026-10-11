-- Depot-Auswertung (11.10.2026): Verlauf und Sparquote als RPCs mit den Rechten des Aufrufers (security invoker),
-- also nur eigene und gemeinsame Positionen bzw. Buchungen. Zeitzone Europe/Berlin.

-- Depotwert und eingezahltes Geld pro Börsentag ab p_from (ohne Datum: ab dem ersten Kauf)
create or replace function public.fin_depot_history(p_from date default null)
returns table (day date, value numeric, invested numeric)
language sql stable security invoker set search_path = '' as $$
  with h as (
    select id, symbol from public.fin_holdings where active and symbol is not null
  ),
  start as (
    select coalesce(p_from, (select min(t.date) from public.fin_holding_tx t join h on h.id = t.holding)) as d
  ),
  days as (
    select distinct d.day from public.fin_quotes_daily d join h on h.symbol = d.symbol, start
     where d.day >= start.d
  ),
  pos as (
    select dd.day, h.symbol,
      (select coalesce(sum(case t.type when 'sell' then -t.quantity when 'dividend' then 0 else t.quantity end), 0)
         from public.fin_holding_tx t where t.holding = h.id and t.date <= dd.day) as q,
      (select coalesce(sum(case t.type when 'sell' then -t.amount when 'dividend' then 0 else t.amount end), 0)
         from public.fin_holding_tx t where t.holding = h.id and t.date <= dd.day) as inv
    from days dd cross join h
  )
  select p.day,
         round(sum(p.q * coalesce((select c.close from public.fin_quotes_daily c
                                    where c.symbol = p.symbol and c.day <= p.day order by c.day desc limit 1), 0)), 2),
         round(sum(greatest(p.inv, 0)), 2)
    from pos p
   group by p.day
   order by p.day
$$;

-- Sparquote pro Monat: Einzahlungen ins Depot (Käufe, Sparpläne) / Einnahmen (Kategorie-Art income)
create or replace function public.fin_savings_rate(p_months int default 12)
returns table (month date, saved numeric, income numeric)
language sql stable security invoker set search_path = '' as $$
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
               where c.kind = 'income' and x.amount > 0 and date_trunc('month', x.booked_on)::date = m.month), 0)
    from months m
   order by m.month
$$;

grant execute on function public.fin_depot_history(date) to authenticated;
grant execute on function public.fin_savings_rate(int) to authenticated;
