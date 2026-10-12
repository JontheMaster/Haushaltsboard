-- Finanzen Stufe 3 „Auswertung und Budgets“ (12.10.2026).
-- Eine Abfrage für Handy und Wand: security definer, aber streng gefiltert auf das, was die aufrufende Person sehen
-- darf (eigene Buchungen + Haushalt, nie die privaten der anderen Person); das Tablet-Konto bekommt immer nur Haushalt.
-- Umbuchungen (Kategorie-Art transfer) zählen nie als Ausgabe. Zeitzone Europe/Berlin.
create or replace function public.fin_overview(p_month date default null, p_household_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := (select auth.uid());
  hh_only boolean := p_household_only or (select private.is_board());
  today date := (now() at time zone 'Europe/Berlin')::date;
  m0 date := date_trunc('month', coalesce(p_month, today))::date;
  m1 date := (date_trunc('month', coalesce(p_month, today)) + interval '1 month')::date;
  result jsonb;
begin
  if not (select private.is_member()) then
    raise exception 'Nur für Mitglieder';
  end if;

  with tx as (
    select t.*, c.kind as cat_kind
      from public.fin_transactions t join public.fin_categories c on c.id = t.category
     where (t.household or (not hh_only and t.owner = viewer))
  ),
  spend as (select * from tx where cat_kind = 'expense' and amount < 0),
  cats as (
    select c.id, c.name, c.icon, c.color, c.monthly_budget, c.sort,
      coalesce((select -sum(s.amount) from spend s where s.category = c.id and s.booked_on >= m0 and s.booked_on < m1), 0) as spent,
      coalesce((select -sum(s.amount) / 3 from spend s where s.category = c.id and s.booked_on >= (m0 - interval '3 months')::date and s.booked_on < m0), 0) as avg3
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
    'total_spent', (select round(coalesce(-sum(amount), 0), 2) from spend where booked_on >= m0 and booked_on < m1),
    'total_avg3', (select round(coalesce(-sum(amount), 0) / 3, 2) from spend where booked_on >= (m0 - interval '3 months')::date and booked_on < m0),
    'total_income', (select round(coalesce(sum(amount), 0), 2) from tx where cat_kind = 'income' and amount > 0 and booked_on >= m0 and booked_on < m1),
    'months', (select jsonb_agg(jsonb_build_object('month', mm,
                  'spent', (select round(coalesce(-sum(s.amount), 0), 2) from spend s where date_trunc('month', s.booked_on)::date = mm),
                  'income', (select round(coalesce(sum(x.amount), 0), 2) from tx x where x.cat_kind = 'income' and x.amount > 0 and date_trunc('month', x.booked_on)::date = mm)
                ) order by mm)
               from generate_series((m0 - interval '11 months')::date, m0, interval '1 month') as g(mmt), lateral (select g.mmt::date as mm) z),
    'heatmap', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'n', n, 'sum', round(sm, 2)))
                 from (select extract(isodow from booked_at at time zone 'Europe/Berlin')::int as dow,
                              extract(hour from booked_at at time zone 'Europe/Berlin')::int as hr,
                              count(*) as n, -sum(amount) as sm
                         from spend where booked_at is not null and booked_on > today - 90
                        group by 1, 2) h), '[]'::jsonb),
    'heatmap_n', (select count(*) from spend where booked_at is not null and booked_on > today - 90),
    -- „Wo“: nur Kartenzahlungen (Läden), keine Überweisungen an Personen (z. B. Miete), damit an der Wand keine Namen stehen
    'merchants', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n, 'avg', round(sm / n, 2), 'sum', round(sm, 2)) order by sm desc)
                  from (select counterparty as name, count(*) as n, -sum(amount) as sm
                          from spend where booked_on > today - 90 and booked_at is not null group by counterparty order by -sum(amount) desc limit 8) w), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.fin_overview(date, boolean) from public, anon;
grant execute on function public.fin_overview(date, boolean) to authenticated;

-- Wochenrückblick: Zeile „Diese Woche 186 € für den Haushalt, davon 124 € Lebensmittel“ (nur Haushalt, Summen)
create or replace function private.fin_week(p_start date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (
    select t.category, c.name, -t.amount as amount
      from public.fin_transactions t join public.fin_categories c on c.id = t.category
     where t.household and c.kind = 'expense' and t.amount < 0 and t.booked_on between p_start and p_start + 6
  )
  select case when (select count(*) from s) = 0 then null else jsonb_build_object(
    'total', (select round(sum(amount), 0) from s),
    'top', (select jsonb_build_object('name', name, 'amount', round(sum(amount), 0)) from s group by name order by sum(amount) desc limit 1)
  ) end
$$;

create or replace function public.week_recap(p_week_start date default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  w date;
begin
  if not (private.is_member() or auth.role() = 'service_role') then
    raise exception 'Nur für Mitglieder';
  end if;
  w := coalesce(p_week_start, today - (extract(isodow from today)::int - 1));
  return private.week_recap(w) || jsonb_build_object('fin', private.fin_week(w));
end;
$$;
