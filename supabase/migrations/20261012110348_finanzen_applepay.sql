-- Finanzen Stufe 2 „Apple Pay live“ (12.10.2026): Grund für „Zuordnen“, dezente Hinweise am Board, Aufräum-Cron.

-- warum eine Buchung in „Zuordnen“ steht (z. B. Apple Pay ohne Gegenstück in der Bankbuchung)
alter table public.fin_transactions add column if not exists review_reason text;

-- dezente Hinweise am Board („Einkauf REWE · 23,47 €“), nur für Haushaltsbuchungen und nur wenn eingeschaltet.
-- Enthält nur den fertigen Text, keine Buchung; das Tablet darf ihn lesen.
create table public.fin_hints (
  id uuid primary key default gen_random_uuid(),
  text text not null check (length(text) <= 80),
  created_at timestamptz not null default now()
);
alter table public.fin_hints enable row level security;
create policy "Hinweise lesen" on public.fin_hints for select to authenticated using ((select private.is_member()));
alter publication supabase_realtime add table public.fin_hints;

-- täglich: Apple-Pay-Einträge ohne Bankbuchung nach 14 Tagen in „Zuordnen“, alte Hinweise löschen
create or replace function private.fin_daily_cleanup()
returns void language sql security definer set search_path = '' as $$
  update public.fin_transactions
     set needs_review = true, review_reason = 'Nicht in der Bankbuchung gefunden'
   where source = 'applepay' and status = 'pending' and review_reason is null
     and booked_on < (now() at time zone 'Europe/Berlin')::date - 14;
  delete from public.fin_hints where created_at < now() - interval '1 day';
$$;
select cron.schedule('finance-daily-cleanup', '15 3 * * *', $$ select private.fin_daily_cleanup(); $$);
