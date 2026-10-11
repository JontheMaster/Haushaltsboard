-- Essen-Karte oben (Wand-Kopfzeile, Handy-Start) wegnehmen, wenn gekocht: das Essen bleibt im Plan, nur die Karte verschwindet
alter table public.meals add column if not exists dismissed_at timestamptz;
