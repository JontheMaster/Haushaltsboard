-- Abfahrten: pro Ziel „kleine Verspätung erlauben“ (Minuten, 0 = aus). Negative Puffer werden dazu umgestellt.
alter table public.transit_places add column if not exists late_ok_min int not null default 0 check (late_ok_min between 0 and 15);
update public.transit_places set late_ok_min = 5, buffer_min = 0 where buffer_min < 0;
alter table public.transit_places add constraint transit_places_buffer_nonneg check (buffer_min >= 0) not valid;
