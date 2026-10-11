-- Depot-Kurse: alle 15 Min werktags (06–21 UTC deckt Xetra 9–17:30 und 22 Uhr Berlin in Sommer- und Winterzeit);
-- die Function entscheidet selbst, ob gerade Börsenzeit oder der Abendlauf ist. Nur wenn es Positionen mit Kürzel gibt.
select cron.schedule('depot-quotes', '*/15 6-21 * * 1-5', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/depot-quotes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.fin_holdings where active and symbol is not null);
$$);
