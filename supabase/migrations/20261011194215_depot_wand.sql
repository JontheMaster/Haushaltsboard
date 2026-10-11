-- Depot an der Wand (11.10.2026): Das Tablet-Konto sieht keine Zeilen (RLS). Diese eine Abfrage (security definer)
-- liefert nur Zusammenfassungen der GEMEINSAMEN Depots und Ziele: Veränderung in %, Gewinn seit Kauf in %,
-- Kursentwicklung 30 Tage als Index (Start = 100), Ziel-Fortschritt in %. Eurobeträge nur, wenn
-- modules.config.wall_percent_only von „finanzen“ ausdrücklich false ist. Nie Positionen, Namen von Papieren oder Stückzahlen.
create or replace function public.fin_wall_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select config from public.modules where id = 'finanzen' and enabled), null);
  percent_only boolean;
  today date := (now() at time zone 'Europe/Berlin')::date;
  v_now numeric := 0;
  v_prev numeric := 0;
  v_week numeric := 0;
  v_month numeric := 0;
  inv numeric := 0;
  spark jsonb;
  goals jsonb;
  quote_at timestamptz;
begin
  if not (select private.is_member()) then
    raise exception 'Nur für Mitglieder';
  end if;
  if cfg is null then
    return null;
  end if;
  percent_only := coalesce((cfg ->> 'wall_percent_only')::boolean, true);

  -- aktuelle Stückzahl je gemeinsamer Position, Kurs jetzt und zu früheren Schlusskursen (Kursentwicklung ohne Einzahlungen)
  with h as (
    select id, symbol, quantity, invested from public.fin_holdings where household and active and symbol is not null and quantity > 0
  ),
  px as (
    select h.id, h.quantity, h.invested,
      (select price from public.fin_quotes q where q.symbol = h.symbol) as now_px,
      (select at from public.fin_quotes q where q.symbol = h.symbol) as now_at,
      (select close from public.fin_quotes_daily d where d.symbol = h.symbol and d.day < today order by d.day desc limit 1) as prev_px,
      (select close from public.fin_quotes_daily d where d.symbol = h.symbol and d.day <= today - 7 order by d.day desc limit 1) as week_px,
      (select close from public.fin_quotes_daily d where d.symbol = h.symbol and d.day <= today - 30 order by d.day desc limit 1) as month_px
    from h
  )
  select coalesce(sum(quantity * coalesce(now_px, prev_px)), 0),
         coalesce(sum(quantity * coalesce(prev_px, now_px)), 0),
         coalesce(sum(quantity * coalesce(week_px, now_px)), 0),
         coalesce(sum(quantity * coalesce(month_px, now_px)), 0),
         coalesce(sum(invested), 0),
         max(now_at)
    into v_now, v_prev, v_week, v_month, inv, quote_at
    from px;

  -- Kursentwicklung der letzten 30 Tage als Index (heutige Stückzahlen, Start = 100)
  with h as (
    select symbol, quantity from public.fin_holdings where household and active and symbol is not null and quantity > 0
  ),
  days as (
    select distinct d.day from public.fin_quotes_daily d join h on h.symbol = d.symbol where d.day > today - 31
  ),
  series as (
    select dd.day, sum(h.quantity * coalesce((select c.close from public.fin_quotes_daily c where c.symbol = h.symbol and c.day <= dd.day order by c.day desc limit 1), 0)) as v
      from days dd cross join h group by dd.day
  ),
  indexed as (
    select day, v, first_value(v) over (order by day) as base from series
  )
  select jsonb_agg(round(v / nullif(base, 0) * 100, 2) order by day) into spark from indexed;

  -- gemeinsame Ziele: Fortschritt in % (Depot = gemeinsamer Depotwert, Konto = eingetragener Betrag)
  select jsonb_agg(jsonb_build_object(
           'name', g.name,
           'pct', round(least(999, (case when g.source = 'konto' then 0 else v_now end + case when g.source = 'depot' then 0 else g.manual_amount end) / g.target_amount * 100), 1),
           'months', case when g.deadline is null then null else greatest(1, ceil((g.deadline - today) / 30.44)) end,
           'saved', case when percent_only then null else round(case when g.source = 'konto' then 0 else v_now end + case when g.source = 'depot' then 0 else g.manual_amount end, 0) end,
           'target', case when percent_only then null else round(g.target_amount, 0) end
         ) order by g.sort, g.created_at)
    into goals
    from public.fin_goals g where g.household;

  if v_now = 0 and goals is null then
    return null;
  end if;

  return jsonb_build_object(
    'percent_only', percent_only,
    'calm', coalesce((cfg ->> 'wall_calm')::boolean, true),
    'quote_at', quote_at,
    'day_pct', case when v_prev > 0 then round((v_now - v_prev) / v_prev * 100, 2) end,
    'week_pct', case when v_week > 0 then round((v_now - v_week) / v_week * 100, 2) end,
    'month_pct', case when v_month > 0 then round((v_now - v_month) / v_month * 100, 2) end,
    'gain_pct', case when inv > 0 then round((v_now - inv) / inv * 100, 2) end,
    'spark', coalesce(spark, '[]'::jsonb),
    'goals', coalesce(goals, '[]'::jsonb),
    'value', case when percent_only then null else round(v_now, 0) end,
    'gain', case when percent_only then null else round(v_now - inv, 0) end
  );
end;
$$;
revoke all on function public.fin_wall_summary() from public, anon;
grant execute on function public.fin_wall_summary() to authenticated;
