-- Handy-Startseite pro Person: Karten oben (Musik, Weg, Essen, Jubiläum, Rückblick) einzeln ausblenden
alter table public.layouts add column if not exists hidden_headers text[] not null default '{}';
