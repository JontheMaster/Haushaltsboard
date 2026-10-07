-- Morgen-Briefing: Uhrzeiten und Spruch des Tages (Entscheidung Jonathan 7.10.2026)
insert into public.modules (id, config)
values ('morgen', '{"times": ["06:00", "07:30"], "saying": "wechsel"}')
on conflict (id) do nothing;
