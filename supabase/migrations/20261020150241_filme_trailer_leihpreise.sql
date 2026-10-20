-- Filme: Trailer (YouTube-Schlüssel von TMDB) und Leihpreise (günstigster Preis pro Anbieter, inoffiziell von JustWatch)
alter table public.movies add column if not exists trailer_key text;
alter table public.movies add column if not exists rent_prices jsonb not null default '[]';
alter table public.movies add column if not exists prices_checked_at timestamptz;
update public.modules set config = config || '{"rent_services": ["Amazon Video", "YouTube"]}'::jsonb
 where id = 'filme' and not (config ? 'rent_services');
