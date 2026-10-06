-- Abfahrtskachel pro Person: übliche Zeit, zu der man aus dem Haus geht, und an welchen Tagen (1 = Mo … 7 = So)
alter table public.transit_prefs
  add column leave_time time,
  add column leave_days int[] not null default '{1,2,3,4,5}';

-- das gemeinsame Morgen-Fenster entfällt
update public.modules set config = config - 'morning_from' - 'morning_to' where id = 'abfahrten';

-- Kachel erscheint sofort auf dem Board, wenn jemand seine Zeit ändert
alter publication supabase_realtime add table public.transit_prefs;
