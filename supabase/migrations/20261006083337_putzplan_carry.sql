-- Putzplan: Liegengebliebenes bleibt, bis es erledigt ist (Entscheidung Jonathan 6.10.2026).
-- Die Anzeige zeigt pro Regel nur die älteste offene Aufgabe; wer sie abhakt, erledigt die inzwischen
-- fälligen Wiederholungen mit (sonst stünde dieselbe Aufgabe sofort noch einmal da).

create or replace function private.generate_chores(p_rule uuid default null)
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

  for r in
    select * from public.chore_rules where active and (p_rule is null or id = p_rule)
  loop
    -- „irgendwann in der Woche“ gibt es nur bei wöchentlich, alle 2 Wochen und monatlich
    per_week := r.placement = 'week' and r.rhythm in ('weekly', 'biweekly', 'monthly');

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

-- Regel geändert: nur offene Aufgaben ab heute neu erzeugen; Liegengebliebenes bleibt stehen
create or replace function private.chore_rule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  delete from public.chore_tasks
   where rule_id = new.id and done_at is null and occurs_on >= today;
  if new.active then
    perform private.generate_chores(new.id);
  end if;
  return new;
end;
$$;

-- Abgehakt: inzwischen fällige, noch offene Wiederholungen derselben Regel sind damit mit erledigt
create function private.chore_task_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  update public.chore_tasks
     set done_at = new.done_at, done_by = new.done_by
   where rule_id = new.rule_id
     and id <> new.id
     and done_at is null
     and occurs_on > new.occurs_on
     and (coalesce(due_date, week_start) <= today);
  return new;
end;
$$;

revoke execute on function private.chore_task_done() from public, anon, authenticated;

create trigger chore_tasks_done
  after update of done_at on public.chore_tasks
  for each row
  when (old.done_at is null and new.done_at is not null)
  execute function private.chore_task_done();
