-- Todo auf einen anderen Tag verschoben (z. B. per Ziehen), Uhrzeit nicht ausdrücklich geändert:
-- die Erinnerung wandert mit (gleiche Uhrzeit am neuen Tag); ohne festen Tag entfällt sie.
create or replace function private.todos_remind_reset()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.due_date is distinct from old.due_date
     and new.remind_at is not distinct from old.remind_at
     and old.remind_at is not null then
    if new.due_date is null then
      new.remind_at := null;
    else
      new.remind_at := (new.due_date + (old.remind_at at time zone 'Europe/Berlin')::time) at time zone 'Europe/Berlin';
    end if;
  end if;
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;
