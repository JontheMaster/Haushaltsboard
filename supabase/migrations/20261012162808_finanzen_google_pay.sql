-- Finanzen: Google Pay live (Android, MacroDroid liest die Google-Wallet-Mitteilung), 12.10.2026.
-- Neue Quelle 'googlepay'; das tägliche Aufräumen gilt für beide Live-Quellen.
alter table public.fin_transactions drop constraint if exists fin_transactions_source_check;
alter table public.fin_transactions add constraint fin_transactions_source_check check (source = any (array['csv', 'applepay', 'googlepay']));

create or replace function private.fin_daily_cleanup()
returns void language sql security definer set search_path to '' as $$
  update public.fin_transactions
     set needs_review = true, review_reason = 'Nicht in der Bankbuchung gefunden'
   where source in ('applepay', 'googlepay') and status = 'pending' and review_reason is null
     and booked_on < (now() at time zone 'Europe/Berlin')::date - 14;
  delete from public.fin_hints where created_at < now() - interval '1 day';
$$;
