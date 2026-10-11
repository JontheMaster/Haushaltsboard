-- Sparziele (11.10.2026): Der Kontostand wird nie gespeichert (Datenschutz-Regel des Finanz-Moduls).
-- Für Ziele mit Quelle „konto“ oder „beides“ trägt man deshalb selbst ein, wie viel auf dem Konto dafür liegt.
alter table public.fin_goals add column if not exists manual_amount numeric(12, 2) not null default 0;
alter table public.fin_goals add column if not exists sort int not null default 0;
alter publication supabase_realtime add table public.fin_goals;
