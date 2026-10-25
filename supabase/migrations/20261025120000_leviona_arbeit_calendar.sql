-- Levionas Schichtkalender wird getrennt vom privaten Kalender geladen.
-- Die iCal-URL liegt im Secret ICAL_LEVIONA_ARBEIT.
insert into public.calendars (id, owner, label, color, hide_in_visit)
select 'leviona_arbeit', m.id, 'Arbeit, Schichten', 'forest', false
from public.members m
where m.name = 'Leviona'
on conflict (id) do update set
  owner = excluded.owner,
  label = excluded.label,
  color = excluded.color,
  hide_in_visit = excluded.hide_in_visit;
