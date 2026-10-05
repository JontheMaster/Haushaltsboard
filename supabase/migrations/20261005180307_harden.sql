-- is_member() nicht über die API aufrufbar machen: eigenes, nicht veröffentlichtes Schema.
-- Die Policies verweisen intern auf die Funktion selbst und laufen unverändert weiter.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_member() set schema private;

-- Indizes für Fremdschlüssel
create index calendars_owner_idx on public.calendars (owner);
create index chore_rules_assignee_idx on public.chore_rules (assignee);
create index chore_tasks_assignee_idx on public.chore_tasks (assignee);
create index chore_tasks_done_by_idx on public.chore_tasks (done_by);
create index todos_assignee_idx on public.todos (assignee);
create index todos_done_by_idx on public.todos (done_by);
