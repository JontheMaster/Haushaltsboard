-- Import-Erinnerung gemeinsam (Wunsch Jonathan 24.11.2026): ein Todo „Umsätze hochladen“ für beide (Offen), nie pro Person.
-- Neu erst, wenn das letzte abgehakt ist und die Frist seitdem um ist, egal ob hochgeladen wurde. Frist = modules.config
-- import_every_days von „finanzen“ (14/30, Standard 30). Noch nie eine Erinnerung: Frist ab dem neuesten Import des Haushalts.
-- Keine Mitteilungen pro Person mehr. Ein Import hakt das offene Todo selbst ab (Trigger auf fin_imports).
create or replace function private.finance_import_reminders(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  every int;
  last_done date;
  last_import date;
begin
  if not p_force and extract(hour from now() at time zone 'Europe/Berlin') <> 9 then
    return jsonb_build_object('skipped', 'nicht 9 Uhr');
  end if;
  -- nur mit Finanzen an und mindestens einer Person, die Finanzen nutzt
  if not exists (select 1 from private.fin_import_state()) then
    return jsonb_build_object('skipped', 'Finanzen aus');
  end if;
  if exists (select 1 from public.todos where link = 'finanzen-import' and done_at is null) then
    return jsonb_build_object('skipped', 'Erinnerung noch offen');
  end if;

  select coalesce((config ->> 'import_every_days')::int, 30) into every from public.modules where id = 'finanzen';
  every := coalesce(every, 30);
  select max((done_at at time zone 'Europe/Berlin')::date) into last_done from public.todos where link = 'finanzen-import';
  if last_done is not null then
    if today - last_done < every then
      return jsonb_build_object('skipped', 'Frist läuft', 'next', last_done + every);
    end if;
  else
    select max(s.last_day) into last_import from private.fin_import_state() s;
    if last_import is not null and today - last_import <= every then
      return jsonb_build_object('skipped', 'Frist läuft', 'next', last_import + every + 1);
    end if;
  end if;

  insert into public.todos (title, assignee, due_date, link) values ('Umsätze hochladen', null, today, 'finanzen-import');
  return jsonb_build_object('todos', 1);
end;
$function$;

-- Import hakt die offene Erinnerung ab (egal wer)
create or replace function private.fin_import_closes_reminder()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.todos set done_at = now(), done_by = new.owner where link = 'finanzen-import' and done_at is null;
  return new;
end;
$function$;

drop trigger if exists fin_imports_close_reminder on public.fin_imports;
create trigger fin_imports_close_reminder after insert on public.fin_imports
  for each row execute function private.fin_import_closes_reminder();

-- Frist als Haushalts-Einstellung (bisher pro Person; die kürzere gilt weiter)
update public.modules
   set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('import_every_days',
         coalesce((select min(import_every_days) from public.fin_profiles where enabled), 30))
 where id = 'finanzen' and not (coalesce(config, '{}'::jsonb) ? 'import_every_days');

-- Mitteilungen pro Person aus
update public.fin_profiles set import_push = false where import_push;
