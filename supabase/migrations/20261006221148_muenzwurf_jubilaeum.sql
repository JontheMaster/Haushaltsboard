-- Münzwurf (Streit-Schlichter) und Jubiläen (config.since = Zusammen-seit-Datum)
insert into public.modules (id, enabled, config) values
  ('muenzwurf', true, '{}'::jsonb),
  ('jubilaeum', true, '{"since": ""}'::jsonb)
on conflict (id) do nothing;
