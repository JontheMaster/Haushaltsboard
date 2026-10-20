-- Wöchentlicher Lauf prüft jetzt auch Leihpreise: mehr Zeit geben (Standard von pg_net sind 5 s)
select cron.schedule('movies-weekly', '0 5 * * 1', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/movies',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"weekly"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
