-- Finanzen: Kontoverlauf auch an der Wand (12.10.2026, Wunsch Jonathan): Tagessummen für das Tablet (nur Haushalt)
-- und der neueste Saldo als Anker in fin_overview (Tablet: nur Gemeinschaftskonten, nie private Konten).
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
    'total_income_avg3', (select round(coalesce(sum(amount), 0) / n3, 2) from tx where cat_kind = 'income' and amount > 0 and budget_month >= (m0 - interval '3 months')::date and budget_month < m0),
    -- Einnahmen nach Quelle (Gegenpartei), nur am Handy (an der Wand stünden sonst Namen)
    'income_sources', case when (select private.is_board()) then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('name', name, 'amount', round(cur, 2), 'avg3', round(prev / n3, 2)) order by cur desc, prev desc)
                 from (select counterparty as name,
                              coalesce(sum(amount) filter (where budget_month = m0), 0) as cur,
                              coalesce(sum(amount) filter (where budget_month >= (m0 - interval '3 months')::date and budget_month < m0), 0) as prev
                         from tx where cat_kind = 'income' and amount > 0 and budget_month >= (m0 - interval '3 months')::date and budget_month <= m0
                        group by counterparty) z where cur > 0 or prev > 0), '[]'::jsonb) end,
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
    -- für Budget-Vorschläge und Tendenzen: pro Kategorie die letzten 6 vollen Monate (nach budget_month) und 8 volle Wochen
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', c.id,
                   'months', (select jsonb_agg(coalesce((select round(-sum(s.amount), 2) from spend s where s.category = c.id and s.budget_month = mm), 0) order by mm)
                                from generate_series((m0 - interval '6 months')::date, (m0 - interval '1 month')::date, interval '1 month') as g(mm)),
                   'weeks', (select jsonb_agg(coalesce((select round(-sum(s.amount), 2) from spend s where s.category = c.id and s.booked_on >= wk::date and s.booked_on < wk::date + 7), 0) order by wk)
                               from generate_series(date_trunc('week', today)::date - 56, date_trunc('week', today)::date - 7, interval '7 days') as w(wk))))
                 from public.fin_categories c where c.kind = 'expense'), '[]'::jsonb),
    -- erster Monat mit Daten (für „wie viele volle Monate gibt es schon“)
    'first_month', (select min(budget_month) from tx),
    -- Kontoverlauf: Summe aller Buchungen pro Tag (auch Umbuchungen), letzte 13 Monate
    'daily', coalesce((select jsonb_agg(jsonb_build_array(d, v) order by d)
                 from (select booked_on as d, round(sum(amount), 2) as v from tx where booked_on >= (m1 - interval '13 months')::date and booked_on < m1 group by 1) z), '[]'::jsonb),
    -- Anker für den Kontoverlauf: neuester Saldo der sichtbaren Konten (Tablet: nur Gemeinschaftskonten)
    'balance', (select jsonb_build_object('amount', sum(b.amount), 'on', max(b.as_of))
                  from (select distinct on (account) amount, as_of from public.fin_balances
                         where household or (not hh_only and owner = viewer)
                         order by account, as_of desc, updated_at desc) b
                having count(*) > 0),
    'merchants', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'avg', round(sm / n, 2), 'sum', round(sm, 2)) order by sm desc)
                  from (select counterparty as name, count(*) as n, -sum(amount) as sm
                          from spend where booked_on > today - 90 and booked_at is not null group by counterparty order by -sum(amount) desc limit 8) w), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.fin_overview(date, boolean) from public, anon;
grant execute on function public.fin_overview(date, boolean) to authenticated;

