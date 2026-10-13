-- Regenradar (docs/wetter-radar.md, 13.10.2026): Cache für die Radarbilder und den Nowcast.
-- Zeile 1 = aktueller Stand (Edge Function weather-radar, alle 5 Minuten), Zeile 2 = gesicherter Testfall (?radar=test).
-- frames: 8-Bit-Stufen aller Bilder hintereinander (Zeile für Zeile, Nord → Süd), deflate + base64.
-- home_x/home_y: Zuhause im Ausschnitt (aus modules.config.home von nfc), nur für Mitglieder lesbar.
create table if not exists public.weather_radar (
  id int primary key,
  fetched_at timestamptz not null,
  first_at timestamptz not null,
  now_at timestamptz not null,
  step_min int not null default 5,
  width int not null,
  height int not null,
  frame_count int not null,
  frames text not null,
  home_x double precision,
  home_y double precision,
  nowcast jsonb
);
alter table public.weather_radar enable row level security;
create policy "Radar lesen" on public.weather_radar for select to authenticated using ((select private.is_member()));
alter publication supabase_realtime add table public.weather_radar;

select cron.schedule('weather-radar', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/weather-radar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"refresh"}'::jsonb
  );
$cron$);
