-- Ast im Wohnzimmer (Tapo-Steckdose): Zustand kommt per Alexa-Routine („der Ast ist an/aus“), Wand und Handy zeichnen ihn
insert into public.modules (id, enabled, config) values ('ast', true, '{"on": false}') on conflict (id) do nothing;
