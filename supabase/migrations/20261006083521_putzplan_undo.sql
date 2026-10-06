-- Rückgängig: was beim Abhaken automatisch mit erledigt wurde (gleicher Zeitpunkt), wieder öffnen
create function private.chore_task_undone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chore_tasks
     set done_at = null, done_by = null
   where rule_id = new.rule_id
     and id <> new.id
     and done_at = old.done_at;
  return new;
end;
$$;

revoke execute on function private.chore_task_undone() from public, anon, authenticated;

create trigger chore_tasks_undone
  after update of done_at on public.chore_tasks
  for each row
  when (old.done_at is not null and new.done_at is null)
  execute function private.chore_task_undone();
