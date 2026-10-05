-- Phase 2, Teil 1: Kalender-Modul
insert into public.modules (id) values ('kalender') on conflict (id) do nothing;
