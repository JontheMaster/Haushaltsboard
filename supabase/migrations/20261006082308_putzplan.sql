-- Phase 2, Teil 3: Putzplan (wiederkehrende Aufgaben)
-- Regeln (chore_rules) werden am Handy gepflegt; daraus entstehen Aufgaben (chore_tasks) für die nächsten 14 Tage.
-- Liegengebliebenes rutscht nicht: die nächste Wiederholung ersetzt es.

-- Pro Regel: fester Tag oder „irgendwann in der Woche“ (dann selbst auf einen Tag ziehen)
alter table public.chore_rules
  add column placement text not null default 'day' check (placement in ('day', 'week')),
  add column created_at timestamptz not null default now();

-- Aufgaben: occurs_on = Termin laut Regel; due_date = geplanter Tag (null = noch nicht eingeplant, nur bei „Woche“)
alter table public.chore_tasks
  alter column due_date drop not null,
  add column occurs_on date not null,
  add column week_start date not null;
create unique index chore_tasks_rule_occurs_idx on public.chore_tasks (rule_id, occurs_on);
create index chore_tasks_week_idx on public.chore_tasks (week_start);

-- Aufgaben erzeugen (alle Regeln oder eine), ersetzt Liegengebliebenes
create function private.generate_chores(p_rule uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  monday date := date_trunc('week', (now() at time zone 'Europe/Berlin')::date)::date;
  people uuid[];
  r record;
  d date;
  hit boolean;
  idx int;
  per_week boolean;
begin
  -- Jonathan zuerst (person-a), dann Leviona (person-b): Reihenfolge fürs Abwechseln
  select array_agg(id order by color) into people from public.members where not is_board;

  -- Liegengebliebenes ersetzen: unerledigte Aufgaben aus vergangenen Tagen bzw. Wochen fallen weg
  delete from public.chore_tasks t
   where t.done_at is null
     and (p_rule is null or t.rule_id = p_rule)
     and ((t.due_date is not null and t.due_date < today)
       or (t.due_date is null and t.week_start < monday));

  for r in
    select * from public.chore_rules where active and (p_rule is null or id = p_rule)
  loop
    -- „irgendwann in der Woche“ gibt es nur bei wöchentlich, alle 2 Wochen und monatlich
    per_week := r.placement = 'week' and r.rhythm in ('weekly', 'biweekly', 'monthly');

    -- Wochen-Aufgaben ab Montag dieser Woche erzeugen, Tages-Aufgaben ab heute
    for d in
      select g::date from generate_series(case when per_week then monday else today end, today + 13, interval '1 day') g
    loop
      continue when d < r.anchor_date;
      hit := case r.rhythm
        when 'daily' then true
        when 'weekly' then extract(isodow from d) = extract(isodow from r.anchor_date)
        when 'biweekly' then extract(isodow from d) = extract(isodow from r.anchor_date) and ((d - r.anchor_date) / 7) % 2 = 0
        when 'monthly' then extract(day from d) = least(
          extract(day from r.anchor_date),
          extract(day from (date_trunc('month', d) + interval '1 month - 1 day')))
        when 'weekdays' then extract(isodow from d)::smallint = any (r.weekdays)
        else false
      end;
      continue when not hit;

      -- Zähler fürs Abwechseln: pro Tag, pro Woche, pro zwei Wochen oder pro Monat
      idx := case r.rhythm
        when 'daily' then d - r.anchor_date
        when 'biweekly' then (d - r.anchor_date) / 14
        when 'monthly' then (extract(year from d) * 12 + extract(month from d))::int
                          - (extract(year from r.anchor_date) * 12 + extract(month from r.anchor_date))::int
        else (date_trunc('week', d)::date - date_trunc('week', r.anchor_date)::date) / 7
      end;

      insert into public.chore_tasks (rule_id, occurs_on, due_date, week_start, assignee)
      values (
        r.id,
        d,
        case when per_week then null else d end,
        date_trunc('week', d)::date,
        case r.assignee_mode
          when 'fixed' then r.assignee
          when 'alternate' then people[1 + (idx % greatest(array_length(people, 1), 1))]
          else null
        end
      )
      on conflict (rule_id, occurs_on) do nothing;
    end loop;
  end loop;
end;
$$;

revoke execute on function private.generate_chores(uuid) from public, anon, authenticated;

-- Regel neu oder geändert: offene Aufgaben dieser Regel neu erzeugen (Erledigtes bleibt)
create function private.chore_rule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chore_tasks where rule_id = new.id and done_at is null;
  if new.active then
    perform private.generate_chores(new.id);
  end if;
  return new;
end;
$$;

revoke execute on function private.chore_rule_changed() from public, anon, authenticated;

create trigger chore_rules_changed
  after insert or update on public.chore_rules
  for each row execute function private.chore_rule_changed();

-- Jede Nacht kurz nach Mitternacht (Berlin) die nächsten 14 Tage auffüllen
select cron.schedule('generate-chores', '35 23 * * *', 'select private.generate_chores()');
