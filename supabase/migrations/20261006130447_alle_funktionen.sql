-- Alle Funktionen: Nachtmodus und Putzplan lassen sich wie die anderen Module an- und ausschalten
insert into public.modules (id, enabled, config) values
  ('nachtmodus', true, '{}'::jsonb),
  ('putzplan', true, '{}'::jsonb)
on conflict (id) do nothing;

-- Kalenderfarbe oder Besuchsmodus-Einstellung geändert → Board lädt die Termine sofort neu
alter publication supabase_realtime add table public.calendars;
