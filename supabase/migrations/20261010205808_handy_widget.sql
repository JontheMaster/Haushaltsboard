-- Handy-Widget (Scriptable/KWGT): pro Person ein geheimer Lese-Link. Die Edge Function `widget` liest mit Service-Rolle.
create table public.widget_tokens (
  member_id uuid primary key references public.members on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.widget_tokens enable row level security;
-- jede Person sieht und erneuert nur ihren eigenen Link
create policy "Eigener Widget-Link" on public.widget_tokens for all
  using (member_id = (select auth.uid()) and (select private.is_member()))
  with check (member_id = (select auth.uid()) and (select private.is_member()));

-- Modul für „Alle Funktionen“ (Einrichtung, kein Schalter)
insert into public.modules (id, enabled, config) values ('widget', true, '{}'::jsonb) on conflict (id) do nothing;
