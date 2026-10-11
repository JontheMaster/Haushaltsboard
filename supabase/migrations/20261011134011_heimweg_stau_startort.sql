-- Heimweg-Kachel: Stau-Abschnitte (Anteile der Strecke [von, bis]) und Name des Startorts
alter table public.drives add column if not exists jams jsonb not null default '[]'::jsonb;
alter table public.drives add column if not exists origin_label text;
