-- Neue Kalenderfarbe Koralle (cal-coral) für Levionas Schichtkalender; Waldgrün gehört zu Jonathans Arbeit (26.10.2026)
alter table public.calendars drop constraint calendars_color_check;
alter table public.calendars add constraint calendars_color_check
  check (color in ('blue', 'berry', 'orange', 'yellow', 'lilac', 'purple', 'forest', 'lime', 'coral'));
update public.calendars set color = 'coral' where id = 'leviona_arbeit';
