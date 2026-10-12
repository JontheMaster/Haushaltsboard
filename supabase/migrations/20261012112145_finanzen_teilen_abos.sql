-- Finanzen Stufe 4 „Gemeinsame Ausgaben und Abos“ (12.10.2026, docs/finanzen-modul.md).
-- Wer schuldet wem: Haushaltsausgaben, die eine Person vom eigenen Konto bezahlt hat (nicht vom Gemeinschaftskonto),
-- werden nach Anteil aufgeteilt: Standard 50/50, pro Kategorie (`fin_categories.owner_share`) oder pro Buchung
-- (`fin_transactions.split` = {"owner": 0..1}, Anteil der zahlenden Person) änderbar.
-- „Ausgleichen“ legt eine Zeile in `fin_settlements` an (vermerkt, wer wem überwiesen hat; das Board überweist nie).
-- Abos: Markierungen pro Person in `fin_sub_marks` (kündigen → Todo, ausblenden); die Erkennung rechnet die App.

alter table public.fin_categories add column if not exists owner_share numeric not null default 0.5
  check (owner_share between 0 and 1);
-- Kategorien dürfen beide ändern (Budget, Aufteilung); bestehende Policy deckt owner_share mit ab
comment on column public.fin_transactions.split is 'Aufteilung {"owner": Anteil der zahlenden Person 0..1}; null = Kategorie';

create table if not exists public.fin_settlements (
  id uuid primary key default gen_random_uuid(),
  payer uuid not null references public.members(id) on delete cascade,
  payee uuid not null references public.members(id) on delete cascade,
  amount numeric not null check (amount > 0),
  settled_on date not null default (now() at time zone 'Europe/Berlin')::date,
  note text,
  created_by uuid not null default auth.uid() references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (payer <> payee)
);
alter table public.fin_settlements enable row level security;
create policy "Ausgleich lesen" on public.fin_settlements for select to authenticated
  using ((select private.is_member()) and not (select private.is_board()));
create policy "Ausgleich anlegen" on public.fin_settlements for insert to authenticated
  with check ((select private.is_member()) and not (select private.is_board()) and created_by = (select auth.uid())
              and (select auth.uid()) in (payer, payee));
create policy "Eigenen Ausgleich löschen" on public.fin_settlements for delete to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));

create table if not exists public.fin_sub_marks (
  owner uuid not null default auth.uid() references public.members(id) on delete cascade,
  sub_key text not null,
  status text not null check (status in ('cancel', 'hide')),
  todo uuid references public.todos(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (owner, sub_key)
);
alter table public.fin_sub_marks enable row level security;
create policy "Eigene Abo-Markierungen" on public.fin_sub_marks for all to authenticated
  using ((select private.is_member()) and owner = (select auth.uid()))
  with check ((select private.is_member()) and owner = (select auth.uid()));

-- Saldo zwischen den beiden Personen. Security definer, gibt aber nur Summen zurück (nie einzelne private Buchungen;
-- die zählenden Buchungen sind ohnehin Haushalt und für beide sichtbar). Tablet bekommt nichts.
-- ready = beide haben Finanzen eingeschaltet. Gezählt wird ab dem Tag, ab dem beide Daten haben (since).
-- balance > 0: person b schuldet person a (a = person-a, b = person-b, sortiert nach Farbe wie people in der App).

create or replace function public.fin_balance()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := (select auth.uid());
  a uuid;
  b uuid;
  a_on boolean;
  b_on boolean;
  since date;
  result jsonb;
begin
  if not (select private.is_member()) or (select private.is_board()) then
    return null;
  end if;
  select id into a from public.members where not is_board order by color limit 1;
  select id into b from public.members where not is_board and id <> a order by color limit 1;
  if b is null then
    return null;
  end if;
  select coalesce(bool_or(enabled), false) into a_on from public.fin_profiles where member = a;
  select coalesce(bool_or(enabled), false) into b_on from public.fin_profiles where member = b;
  if not (a_on and b_on) then
    return jsonb_build_object('ready', false, 'a', a, 'b', b, 'a_on', a_on, 'b_on', b_on);
  end if;
  -- ab wann beide Daten haben (sonst wirkt die längere Historie einer Person wie Schulden)
  select greatest((select min(booked_on) from public.fin_transactions where owner = a),
                  (select min(booked_on) from public.fin_transactions where owner = b)) into since;

  with paid as (
    select t.owner, t.booked_on,
           -t.amount * (1 - coalesce((t.split ->> 'owner')::numeric, c.owner_share)) as other_part
      from public.fin_transactions t
      join public.fin_categories c on c.id = t.category
      left join public.fin_profiles p on p.member = t.owner
     where t.household and c.kind = 'expense' and t.owner in (a, b) and t.booked_on >= since
       -- vom Gemeinschaftskonto bezahlt zählt nicht (gehört beiden); Apple Pay ohne Konto gilt wie beim Import als gemeinsam,
       -- wenn die Person ein Gemeinschaftskonto hat
       and not coalesce(
             case when t.account is null
                  then exists (select 1 from unnest(p.joint_accounts) j where j not like '-%')
                  else t.account = any (p.joint_accounts) end, false)
  ),
  owed as (
    -- positiv = b schuldet a
    select coalesce(sum(case when owner = a then other_part else -other_part end), 0) as v from paid
  ),
  settled as (
    -- b zahlt a → Schuld von b sinkt
    select coalesce(sum(case when payer = b and payee = a then amount when payer = a and payee = b then -amount else 0 end), 0) as v
      from public.fin_settlements where settled_on >= since
  ),
  months as (
    select date_trunc('month', booked_on)::date as m,
           round(sum(case when owner = a then other_part else -other_part end), 2) as v,
           count(*) as n
      from paid group by 1
  )
  select jsonb_build_object(
    'ready', true, 'a', a, 'b', b, 'since', since,
    'balance', round((select v from owed) - (select v from settled), 2),
    'count', (select count(*) from paid),
    'n_a', (select count(*) from paid where owner = a),
    'n_b', (select count(*) from paid where owner = b),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'delta', v, 'n', n) order by m desc) from (select * from months order by m desc limit 6) z), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'payer', payer, 'payee', payee, 'amount', amount, 'on', settled_on, 'mine', created_by = viewer) order by settled_on desc, created_at desc)
                     from (select * from public.fin_settlements order by settled_on desc, created_at desc limit 8) s), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.fin_balance() from public, anon;
grant execute on function public.fin_balance() to authenticated;
