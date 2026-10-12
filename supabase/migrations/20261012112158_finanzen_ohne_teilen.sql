-- „Wer schuldet wem“ entfällt (Entscheidung Jonathan 12.10.2026: alles wird gemeinsam vom Gemeinschaftskonto bezahlt).
drop function if exists public.fin_balance();
drop table if exists public.fin_settlements;
alter table public.fin_categories drop column if exists owner_share;
comment on column public.fin_transactions.split is null;
