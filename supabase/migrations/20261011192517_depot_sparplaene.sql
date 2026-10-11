-- Depot, Sparpläne und Abgleich (11.10.2026):
-- 1. Depotübersicht = Stand der Bank an einem Tag („Anker“): eine correction-Buchung mit Zielwerten (target_*),
--    deren Stück/Betrag sich so einstellt, dass alles bis zu diesem Tag dem Stand der Bank entspricht.
-- 2. Wertpapierkäufe aus dem Giro-Export (Stufe 1) werden mit echtem Datum als Sparplan-Buchung übernommen.
-- 3. Sparpläne: abends zum Schlusskurs buchen; kommt später der Giro-Export, ersetzt er die geschätzte Buchung.

alter table public.fin_holding_tx add column if not exists target_quantity numeric(18, 6);
alter table public.fin_holding_tx add column if not exists target_amount numeric(12, 2);

-- Schlusskurs an einem Tag oder der letzte davor (höchstens 7 Tage zurück)
create or replace function private.fin_close_on(p_symbol text, p_day date)
returns numeric language sql stable security definer set search_path = '' as $$
  select close from public.fin_quotes_daily
   where symbol = p_symbol and day <= p_day and day > p_day - 8
   order by day desc limit 1
$$;

-- Anker einer Position nachziehen: der Reihe nach, jeder Anker gleicht alles bis zu seinem Tag aus
create or replace function private.fin_depot_reconcile(p_holding uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a record;
  run_q numeric;
  run_a numeric;
begin
  for a in select id, date, target_quantity, target_amount from public.fin_holding_tx
            where holding = p_holding and target_quantity is not null order by date, created_at loop
    select coalesce(sum(case type when 'sell' then -quantity when 'dividend' then 0 else quantity end), 0),
           coalesce(sum(case type when 'sell' then -amount when 'dividend' then 0 else amount end), 0)
      into run_q, run_a
      from public.fin_holding_tx
     where holding = p_holding and id <> a.id and date <= a.date
       -- spätere Anker zählen nicht, frühere schon
       and (target_quantity is null or date < a.date);
    update public.fin_holding_tx
       set quantity = round(a.target_quantity - run_q, 6), amount = round(a.target_amount - run_a, 2)
     where id = a.id;
  end loop;
end;
$$;

-- Stand der Bank aus der Depotübersicht setzen (App, nur eigene Positionen)
create or replace function public.fin_depot_snapshot(p_holding uuid, p_quantity numeric, p_invested numeric, p_day date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fin_holdings where id = p_holding and owner = (select auth.uid())) then
    raise exception 'Nur eigene Positionen';
  end if;
  insert into public.fin_holding_tx (holding, date, type, quantity, amount, source, hash, note, target_quantity, target_amount)
  values (p_holding, p_day, 'correction', 0, 0, 'csv', 'depot:' || p_day, 'Abgleich mit der Depotübersicht', p_quantity, p_invested)
  on conflict (holding, hash) do update set target_quantity = excluded.target_quantity, target_amount = excluded.target_amount;
  perform private.fin_depot_reconcile(p_holding);
end;
$$;
revoke all on function public.fin_depot_snapshot(uuid, numeric, numeric, date) from public, anon;
grant execute on function public.fin_depot_snapshot(uuid, numeric, numeric, date) to authenticated;

-- Wertpapierkäufe/-verkäufe aus dem Giro-Export den Positionen zuordnen (ISIN im Verwendungszweck)
create or replace function public.fin_link_giro_buys(p_owner uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  t record;
  h record;
  v_isin text;
  px numeric;
  plan_tx uuid;
  n int := 0;
  touched uuid[] := '{}';
begin
  if (select auth.role()) <> 'service_role' and p_owner <> (select auth.uid()) then
    raise exception 'Nur für dich selbst';
  end if;
  for t in select id, booked_on, kind, purpose, amount, hash from public.fin_transactions
            where owner = p_owner and kind ~* 'wertpapier(kauf|verkauf)' and purpose ~ '[A-Z]{2}[A-Z0-9]{9}[0-9]' loop
    v_isin := substring(t.purpose from '([A-Z]{2}[A-Z0-9]{9}[0-9])');
    select fh.id, fh.symbol into h from public.fin_holdings fh
     where fh.isin = v_isin and (fh.owner = p_owner or fh.household) and fh.active
     order by (fh.owner = p_owner) desc limit 1;
    continue when not found;
    continue when exists (select 1 from public.fin_holding_tx where holding = h.id and hash = 'giro:' || t.hash);
    px := private.fin_close_on(h.symbol, t.booked_on);
    continue when px is null or px <= 0;
    if t.kind ~* 'verkauf' then
      insert into public.fin_holding_tx (holding, date, type, quantity, price, amount, source, hash, note)
      values (h.id, t.booked_on, 'sell', round(abs(t.amount) / px, 6), px, abs(t.amount), 'csv', 'giro:' || t.hash, 'Verkauf laut Girokonto');
    else
      -- vom Sparplan geschätzte Buchung im selben Monat ersetzen
      select id into plan_tx from public.fin_holding_tx
       where holding = h.id and source = 'plan' and type = 'savings_plan'
         and date_trunc('month', date) = date_trunc('month', t.booked_on)
       limit 1;
      if plan_tx is not null then
        update public.fin_holding_tx
           set date = t.booked_on, quantity = round(abs(t.amount) / px, 6), price = px, amount = abs(t.amount),
               source = 'csv', hash = 'giro:' || t.hash, note = 'Sparplan laut Girokonto'
         where id = plan_tx;
      else
        insert into public.fin_holding_tx (holding, date, type, quantity, price, amount, source, hash, note)
        values (h.id, t.booked_on, 'savings_plan', round(abs(t.amount) / px, 6), px, abs(t.amount), 'csv', 'giro:' || t.hash, 'Sparplan laut Girokonto');
      end if;
    end if;
    n := n + 1;
    touched := array_append(touched, h.id);
  end loop;
  -- Anker nachziehen, damit der Stand der Bank gilt
  for h in select distinct unnest(touched) as id loop
    perform private.fin_depot_reconcile(h.id);
  end loop;
  return n;
end;
$$;
revoke all on function public.fin_link_giro_buys(uuid) from public, anon;
grant execute on function public.fin_link_giro_buys(uuid) to authenticated, service_role;

-- Sparpläne ausführen (Cron abends): Ausführungstag = Tag im Monat, am Wochenende der nächste Montag;
-- gebucht zum Schlusskurs dieses Tages, höchstens einmal pro Monat
create or replace function private.fin_run_savings_plans()
returns int language plpgsql security definer set search_path = '' as $$
declare
  p record;
  today date := (now() at time zone 'Europe/Berlin')::date;
  month_start date := date_trunc('month', (now() at time zone 'Europe/Berlin'))::date;
  exec_day date;
  px numeric;
  n int := 0;
begin
  for p in select sp.id, sp.holding, sp.amount, sp.day_of_month, sp.last_month, h.symbol
             from public.fin_savings_plans sp join public.fin_holdings h on h.id = sp.holding
            where sp.active and h.active and h.symbol is not null loop
    continue when p.last_month is not null and p.last_month >= month_start;
    exec_day := month_start + (p.day_of_month - 1);
    exec_day := exec_day + case extract(isodow from exec_day) when 6 then 2 when 7 then 1 else 0 end;
    continue when exec_day > today;
    -- schon gebucht (z. B. aus dem Giro-Export)?
    if exists (select 1 from public.fin_holding_tx where holding = p.holding and type = 'savings_plan' and date >= month_start) then
      update public.fin_savings_plans set last_month = month_start where id = p.id;
      continue;
    end if;
    select close into px from public.fin_quotes_daily where symbol = p.symbol and day >= exec_day and day <= today order by day limit 1;
    continue when px is null or px <= 0;
    insert into public.fin_holding_tx (holding, date, type, quantity, price, amount, source, hash, note)
    values (p.holding, exec_day, 'savings_plan', round(p.amount / px, 6), px, p.amount, 'plan', 'plan:' || p.id || ':' || month_start, 'Sparplan, geschätzt zum Schlusskurs');
    update public.fin_savings_plans set last_month = month_start where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- abends nach Xetra-Schluss (20:30 UTC = 22:30 Sommer- / 21:30 Winterzeit)
select cron.schedule('depot-savings-plans', '30 20 * * 1-5', $$ select private.fin_run_savings_plans(); $$);

-- Bestehende Importe auf Anker umstellen und Giro-Käufe nachtragen
update public.fin_holding_tx t
   set type = 'correction', target_quantity = t.quantity, target_amount = t.amount, note = 'Abgleich mit der Depotübersicht',
       hash = 'depot:' || t.date
 where t.hash like 'depot:%:%';
select public.fin_link_giro_buys(owner) from (select distinct owner from public.fin_holdings) o;
