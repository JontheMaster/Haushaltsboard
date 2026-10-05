-- Haushaltsboard: Grundschema, Zugriffsschutz, Realtime
-- Zugriff haben nur Mitglieder (Jonathan, Leviona, Tablet). Alles andere sieht nichts.

-- ───────── Tabellen ─────────

create table public.members (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  color text not null check (color in ('person-a', 'person-b', 'board')),
  is_board boolean not null default false
);

create table public.calendars (
  id text primary key,                          -- z. B. 'jonathan_privat' → Secret ICAL_JONATHAN_PRIVAT
  owner uuid references public.members on delete set null,
  label text not null,
  hide_in_visit boolean not null default false
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  due_date date,                                -- null = ungeplant
  this_week boolean not null default false,
  assignee uuid references public.members on delete set null,  -- null = offen
  moved_since date,                             -- gesetzt, wenn einmal verschoben
  done_at timestamptz,
  done_by uuid references public.members on delete set null,
  created_at timestamptz not null default now()
);
create index todos_due_date_idx on public.todos (due_date);
create index todos_open_idx on public.todos (done_at) where done_at is null;

-- Putzplan: eigenes Modul (Phase 2)
create table public.chore_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  rhythm text not null check (rhythm in ('daily', 'weekly', 'biweekly', 'monthly', 'weekdays')),
  weekdays smallint[],                          -- 1 = Mo … 7 = So
  anchor_date date not null,                    -- erster Termin, wichtig für 2-Wochen-Rhythmus
  assignee_mode text not null check (assignee_mode in ('fixed', 'alternate', 'open')),
  assignee uuid references public.members on delete set null,
  show_in_today boolean not null default true,
  active boolean not null default true
);

create table public.chore_tasks (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.chore_rules on delete cascade,
  due_date date not null,
  assignee uuid references public.members on delete set null,
  done_at timestamptz,
  done_by uuid references public.members on delete set null
);
create index chore_tasks_rule_idx on public.chore_tasks (rule_id);
create index chore_tasks_due_date_idx on public.chore_tasks (due_date);

-- Module und Startseite
create table public.modules (
  id text primary key,                          -- 'todos', 'einkauf', 'uhr-wetter', …
  enabled boolean not null default true,
  config jsonb not null default '{}'
);

create table public.layouts (
  id uuid primary key default gen_random_uuid(),
  device text,                                  -- z. B. 'wand'
  member uuid references public.members on delete cascade,  -- Handy-Layout pro Person
  tiles jsonb not null default '[]',            -- [{ module, size, x, y }]
  check (device is not null or member is not null)
);
create unique index layouts_device_idx on public.layouts (device) where device is not null;
create unique index layouts_member_idx on public.layouts (member) where member is not null;

create table public.settings (
  id int primary key default 1 check (id = 1),
  visit_mode boolean not null default false,
  night_from time not null default '23:00',
  night_to time not null default '07:00'
);

-- ───────── Zugriffsschutz ─────────

-- security definer: liest members ohne RLS, sonst würde die Regel für members sich selbst abfragen
create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where id = auth.uid());
$$;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['members', 'calendars', 'todos', 'chore_rules', 'chore_tasks', 'modules', 'layouts', 'settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "Nur Mitglieder" on public.%I for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))',
      t
    );
  end loop;
end $$;

-- ───────── Realtime ─────────

alter publication supabase_realtime add table public.todos, public.chore_tasks, public.modules, public.layouts, public.settings;

-- ───────── Startwerte ─────────

insert into public.settings (id) values (1);

insert into public.modules (id) values ('uhr-wetter'), ('todos'), ('einkauf');

insert into public.calendars (id, label, hide_in_visit) values
  ('leviona_privat', 'Leviona', false),
  ('jonathan_privat', 'Jonathan privat', false),
  ('jonathan_ej', 'Evangelische Jugend', false),
  ('jonathan_uni', 'Uni', false),
  ('jonathan_kirchenvorstand', 'Kirchenvorstand', false),
  ('jonathan_focus', 'Fokus-Blöcke', true),
  ('jonathan_arbeit_termine', 'Arbeit, Termine', true),
  ('jonathan_arbeit_trainings', 'Arbeit, Trainings', true);
