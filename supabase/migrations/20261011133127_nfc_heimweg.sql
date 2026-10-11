-- NFC-Baustein „Heimweg (Auto)“: Standort vom iPhone → Fahrzeit mit Verkehr (TomTom, Secret TOMTOM_KEY) →
-- Push an die andere Person, Karte mit fahrendem Auto an Wand und Handy (Entscheidung Jonathan 11.10.2026).

alter table public.nfc_actions drop constraint nfc_actions_type_check;
alter table public.nfc_actions add constraint nfc_actions_type_check
  check (type in ('log', 'chore_done', 'todo_done', 'todo_create', 'bring_add', 'visit_toggle', 'notify', 'timer', 'night_mode', 'drive_home'));

create table public.drives (
  id uuid primary key default gen_random_uuid(),
  member uuid not null references public.members on delete cascade,
  started_at timestamptz not null default now(),
  -- Strecke vereinfacht (höchstens ~120 Punkte [lat, lon]) und Länge in Metern
  route jsonb not null default '[]'::jsonb,
  length_m int not null,
  -- geschätzter Anteil der Strecke (0–1) zum Zeitpunkt checked_at, Ankunft laut Verkehr, Stau in Sekunden
  progress real not null default 0,
  eta timestamptz not null,
  delay_s int not null default 0,
  checked_at timestamptz not null default now(),
  arrived_at timestamptz,
  cancelled_at timestamptz
);
create index drives_member_idx on public.drives (member);
create index drives_open_idx on public.drives (started_at) where arrived_at is null and cancelled_at is null;

alter table public.drives enable row level security;
create policy "Nur Mitglieder" on public.drives for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
alter publication supabase_realtime add table public.drives;

-- Zuhause (Ziel des Heimwegs), einstellbar in der App
update public.modules
   set config = config || '{"home": {"address": "Motterstraße 86, 90451 Nürnberg", "lat": 49.4048792, "lon": 11.0442243}}'::jsonb
 where id = 'nfc';

-- alle 2 Minuten: Fahrten weiterrechnen (Position schätzen, Verkehr neu abfragen), nur wenn eine läuft
select cron.schedule('drive-watch', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/nfc',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"update-drives"}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from public.drives where arrived_at is null and cancelled_at is null);
$$);
