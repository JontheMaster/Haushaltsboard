-- Fernseh-Launcher (24.10.2026): Angebote mit direkten Anbieter-Links von JustWatch, 6 Std gemerkt
alter table public.movies add column if not exists offers jsonb;
alter table public.movies add column if not exists offers_checked_at timestamptz;
