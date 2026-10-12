-- Finanzen: neuester Kontostand pro Konto als Anker für den Kontoverlauf (12.10.2026, Entscheidung Jonathan).
-- Nur ein Wert pro Konto (der Saldo der neuesten Buchung im CSV), nur der Server schreibt (finance-import).
-- Lesen: Besitzer, beim Gemeinschaftskonto (household) beide; das Tablet nie.
create table if not exists public.fin_balances (
  owner uuid not null references public.members(id) on delete cascade,
  account text not null,
  amount numeric not null,
  as_of date not null,
  household boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner, account)
);
alter table public.fin_balances enable row level security;
create policy "Kontostand lesen" on public.fin_balances for select to authenticated
  using ((select private.is_member()) and not (select private.is_board()) and (owner = (select auth.uid()) or household));
