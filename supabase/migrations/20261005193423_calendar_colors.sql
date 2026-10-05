-- Jeder Kalender bekommt eine eigene Farbe (Token-Name ohne Präfix), Entscheidung Jonathan 5.10.2026
alter table public.calendars
  add column color text not null default 'blue'
  check (color in ('blue', 'berry', 'orange', 'yellow', 'lilac', 'purple', 'forest', 'lime'));

update public.calendars set color = case id
  when 'leviona_privat' then 'berry'
  when 'jonathan_privat' then 'blue'
  when 'jonathan_ej' then 'orange'
  when 'jonathan_kirchenvorstand' then 'yellow'
  when 'jonathan_focus' then 'lilac'
  when 'jonathan_uni' then 'purple'
  when 'jonathan_arbeit_termine' then 'forest'
  when 'jonathan_arbeit_trainings' then 'lime'
  else color end;
