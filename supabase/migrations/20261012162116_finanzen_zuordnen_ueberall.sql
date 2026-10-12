-- Finanzen überall (12.10.2026, Wunsch Jonathan):
-- 1. Zuordnen von der Startseite (Wand und Handy): Liste und Zuordnen als RPC, damit auch das Tablet-Konto
--    Haushaltsbuchungen ohne Kategorie zuordnen kann (nur Haushalt; am Handy zusätzlich die eigenen privaten).
--    „Immer so“ legt eine Regel für die Person an, der die Buchung gehört (eine Regel pro Gegenpartei, die alte
--    wird ersetzt) und ordnet offene Buchungen derselben Gegenpartei mit zu.
-- 2. Wochenrückblick: mehr Zahlen in private.fin_week (Vorwoche, Kategorien, Lieblingsladen, Kartenzahlungen).

create or replace function public.fin_review_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := (select auth.uid());
  board boolean := (select private.is_board());
begin
  if not (select private.is_member()) then
    raise exception 'Nur für Mitglieder';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'booked_on', t.booked_on, 'booked_at', t.booked_at,
                     'counterparty', t.counterparty, 'label', n.label, 'purpose', t.purpose, 'amount', t.amount,
                     'category', t.category, 'created_at', t.created_at, 'reason', t.review_reason)
                     order by t.booked_on desc, t.created_at desc)
                    from (select * from public.fin_transactions x
                           where x.needs_review and (x.household or (not board and x.owner = viewer))
                           order by x.booked_on desc, x.created_at desc limit 40) t
                    left join public.fin_names n on n.counterparty = t.counterparty), '[]'::jsonb);
end;
$$;
revoke all on function public.fin_review_list() from public, anon;
grant execute on function public.fin_review_list() to authenticated;

create or replace function public.fin_review_assign(p_id uuid, p_category text, p_always boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := (select auth.uid());
  board boolean := (select private.is_board());
  t public.fin_transactions;
  more int := 0;
begin
  if not (select private.is_member()) then
    raise exception 'Nur für Mitglieder';
  end if;
  select * into t from public.fin_transactions x where x.id = p_id and (x.household or (not board and x.owner = viewer));
  if t.id is null then
    raise exception 'Buchung nicht gefunden';
  end if;
  if not exists (select 1 from public.fin_categories c where c.id = p_category) then
    raise exception 'Kategorie unbekannt';
  end if;
  update public.fin_transactions set category = p_category, needs_review = false, review_reason = null where id = t.id;
  if p_always and length(trim(t.counterparty)) >= 2 then
    delete from public.fin_rules r where r.owner = t.owner and r.field = 'counterparty' and r.created_from = 'manual' and r.pattern = left(trim(t.counterparty), 120);
    insert into public.fin_rules (pattern, field, category, household, owner, created_from)
      values (left(trim(t.counterparty), 120), 'counterparty', p_category, t.household, t.owner, 'manual');
    update public.fin_transactions x set category = p_category, needs_review = false, review_reason = null
     where x.owner = t.owner and x.needs_review and x.counterparty = t.counterparty and x.id <> t.id
       and (x.household or (not board and x.owner = viewer));
    get diagnostics more = row_count;
  end if;
  return more;
end;
$$;
revoke all on function public.fin_review_assign(uuid, text, boolean) from public, anon;
grant execute on function public.fin_review_assign(uuid, text, boolean) to authenticated;

-- Wochenrückblick: nur Haushalt, nur Summen (Läden mit eigenem Anzeigenamen)
create or replace function private.fin_week(p_start date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (
    select t.category, c.name, c.color, t.counterparty, t.booked_at, -t.amount as amount
      from public.fin_transactions t join public.fin_categories c on c.id = t.category
     where t.household and c.kind = 'expense' and t.amount < 0 and t.booked_on between p_start and p_start + 6
  ),
  prev as (
    select coalesce(sum(-t.amount), 0) as v
      from public.fin_transactions t join public.fin_categories c on c.id = t.category
     where t.household and c.kind = 'expense' and t.amount < 0 and t.booked_on between p_start - 7 and p_start - 1
  )
  select case when (select count(*) from s) = 0 then null else jsonb_build_object(
    'total', (select round(sum(amount), 0) from s),
    'top', (select jsonb_build_object('name', name, 'amount', round(sum(amount), 0)) from s group by name order by sum(amount) desc limit 1),
    'prev', (select round(v, 0) from prev),
    'cats', (select jsonb_agg(jsonb_build_object('name', name, 'color', color, 'amount', round(a, 0)) order by a desc)
               from (select name, color, sum(amount) as a from s group by name, color order by sum(amount) desc limit 4) x),
    'shop', (select jsonb_build_object('name', coalesce(n.label, y.counterparty), 'n', y.cnt, 'amount', round(y.a, 0))
               from (select counterparty, count(*) as cnt, sum(amount) as a from s where booked_at is not null
                      group by counterparty order by count(*) desc, sum(amount) desc limit 1) y
               left join public.fin_names n on n.counterparty = y.counterparty),
    'card_payments', (select count(*) from s where booked_at is not null)
  ) end
$$;
