-- Schichten (docs/schichtplan-sync.md, Teil 1–2, Go Jonathan 26.10.2026):
-- Kalender der Art „schicht“ erscheinen nicht als Termine, sondern als schmale Schicht-Zeile.
alter table public.calendars add column kind text not null default 'termine' check (kind in ('termine', 'schicht'));
update public.calendars set kind = 'schicht' where id = 'leviona_arbeit';

-- Schicht-Arten: Titel im Kalender → Name und Symbol (Leviona bestätigt/ändert in Alle Funktionen → Kalender)
create table public.shift_types (
  id uuid primary key default gen_random_uuid(),
  -- Text (ganzer Titel oder Teil davon, ohne Groß/klein) oder /Regex/
  match text not null,
  label text not null,
  -- Lucide-Name aus der festen Auswahl in der App
  icon text not null default 'briefcase',
  -- „frei“: kein Dienst (Termine-Kachel lässt es weg, Woche zeigt ein kleines „frei“)
  is_free boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.shift_types enable row level security;
create policy shift_types_member on public.shift_types for all to authenticated using (private.is_member()) with check (private.is_member());

insert into public.shift_types (match, label, icon, is_free, sort) values
  ('Schule', 'Schule', 'graduation-cap', false, 1),
  ('frei', 'Frei', 'palm-tree', true, 2);

alter publication supabase_realtime add table public.shift_types;
