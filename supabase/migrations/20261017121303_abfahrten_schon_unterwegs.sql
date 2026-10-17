-- Abfahrten: kein Weg ab zuhause, wenn man direkt davor woanders ist und die Pause kürzer ist (Minuten, pro Person)
alter table public.transit_prefs add column if not exists home_gap_min int not null default 90 check (home_gap_min between 0 and 300);
