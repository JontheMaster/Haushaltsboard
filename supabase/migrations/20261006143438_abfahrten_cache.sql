-- Fahrplan-Antworten der VGN-Auskunft merken (sie ist langsam; der Fahrplan ändert sich nicht, Echtzeit kommt extra)
create table public.transit_tripcache (
  key text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.transit_tripcache enable row level security;
revoke all on public.transit_tripcache from anon, authenticated;

-- Jede Minute die Wege vorrechnen (damit Board und Handy nie warten) und Mitteilungen verschicken
select cron.unschedule('transit-watch');
select cron.schedule('transit-watch', '* * * * *', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/transit',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"watch"}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.modules where id = 'abfahrten' and enabled);
$$);
