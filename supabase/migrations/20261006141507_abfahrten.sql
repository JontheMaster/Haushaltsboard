-- Abfahrten (VAG/VGN): Ziele, persönliche Einstellungen, Schichten
create table public.transit_places (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  name text not null,
  address text not null,
  lat double precision not null,
  lon double precision not null,
  -- Wörter im Termintitel oder -ort, an denen das Ziel erkannt wird
  keywords text[] not null default '{}',
  -- nur an diesen Wochentagen (1 = Mo … 7 = So); leer = immer
  weekdays int[] not null default '{}',
  -- so viele Minuten vor Beginn da sein
  buffer_min int not null default 10,
  -- false = dorthin nicht mit Öffis (keine Abfahrten zeigen)
  transit boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.transit_prefs (
  member_id uuid primary key references public.members(id) on delete cascade,
  show_on_wall boolean not null default true,
  push_leave boolean not null default false,
  push_leave_min int not null default 10,
  push_delay boolean not null default false,
  -- Termintitel, für die nie ein Weg gesucht wird
  ignore text[] not null default '{}'
);

create table public.transit_shifts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  name text not null,
  start_time time not null,
  place_id uuid not null references public.transit_places(id) on delete cascade
);

create table public.transit_shift_days (
  member_id uuid not null references public.members(id) on delete cascade,
  day date not null,
  shift_id uuid not null references public.transit_shifts(id) on delete cascade,
  primary key (member_id, day)
);

alter table public.transit_places enable row level security;
alter table public.transit_prefs enable row level security;
alter table public.transit_shifts enable row level security;
alter table public.transit_shift_days enable row level security;
create policy "Nur Mitglieder" on public.transit_places for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "Nur Mitglieder" on public.transit_prefs for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "Nur Mitglieder" on public.transit_shifts for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "Nur Mitglieder" on public.transit_shift_days for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));

-- Nur für die Edge Function: Adress-Cache und schon verschickte Mitteilungen
create table public.transit_geocache (
  query text primary key,
  lat double precision,
  lon double precision,
  label text,
  created_at timestamptz not null default now()
);
create table public.transit_notified (
  member_id uuid not null references public.members(id) on delete cascade,
  trip_key text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (member_id, trip_key, kind)
);
alter table public.transit_geocache enable row level security;
alter table public.transit_notified enable row level security;
revoke all on public.transit_geocache, public.transit_notified from anon, authenticated;

-- Modul mit Haltestellen zuhause (Fußweg in Minuten) und Zeitfenster für die Morgen-Kachel
insert into public.modules (id, enabled, config) values ('abfahrten', true, jsonb_build_object(
  'stops', jsonb_build_array(
    jsonb_build_object('id', 'de:09564:1913', 'vgn', 1913, 'name', 'Eibach Bahnhof', 'walk', 15),
    jsonb_build_object('id', 'de:09564:1963', 'vgn', 1963, 'name', 'Heidestraße', 'walk', 10),
    jsonb_build_object('id', 'de:09564:1959', 'vgn', 1959, 'name', 'Eibach Mitte', 'walk', 15)
  ),
  'morning_from', '06:00',
  'morning_to', '09:00',
  'wall_minutes', 30
)) on conflict (id) do nothing;

-- Jonathans Ziele
insert into public.transit_places (member_id, name, address, lat, lon, keywords, weekdays)
select m.id, p.name, p.address, p.lat, p.lon, p.keywords, p.weekdays
from public.members m,
  (values
    ('Arbeit', 'Hummelsteiner Weg 56, 90459 Nürnberg', 49.4402867, 11.0847181, array['arbeit','büro','office','hummelsteiner'], '{}'::int[]),
    ('Halle Mittwoch (U18)', 'Michael-Ende-Straße 20, 90439 Nürnberg', 49.4426375, 11.0533915, array['u18','training'], array[3]),
    ('Halle Freitag (U18)', 'Schafhofstraße 27, 90411 Nürnberg', 49.4794991, 11.1206549, array['u18','training'], array[5]),
    ('Eltern', 'Wilhelm-Albrecht-Straße 163, 91126 Schwabach', 49.3423533, 11.0082848, array['eltern','mama','papa'], '{}'::int[])
  ) as p(name, address, lat, lon, keywords, weekdays)
where m.name = 'Jonathan';

insert into public.transit_prefs (member_id)
select id from public.members where not is_board
on conflict do nothing;

-- Jede Minute: Mitteilungen „Losgehen“ und „Verspätung“ (nur wenn jemand das eingeschaltet hat)
select cron.schedule('transit-watch', '* * * * *', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/transit',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"watch"}'::jsonb
  )
  where exists (select 1 from public.transit_prefs where push_leave or push_delay)
    and exists (select 1 from public.modules where id = 'abfahrten' and enabled);
$$);
