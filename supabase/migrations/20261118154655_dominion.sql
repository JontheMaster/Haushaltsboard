-- Dominion-Set-Generator (docs/dominion-modul.md, Stufe 1): erstellte und gespielte Sets.
-- Einstellungen (Besitz, Sperren, Favoriten, letzte Optionen) stehen in modules.config von „dominion“.
create table public.dominion_games (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.members (id) on delete set null default auth.uid(),
  seed bigint not null,
  options jsonb not null default '{}'::jsonb,
  kingdom text[] not null,
  landscapes text[] not null default '{}',
  extras text[] not null default '{}',
  bane text,
  played boolean not null default false,
  played_on date,
  rating text check (rating in ('gut', 'naja')),
  note text check (char_length(note) <= 500)
);
create index dominion_games_created_idx on public.dominion_games (created_at desc);

alter table public.dominion_games enable row level security;
create policy "Mitglieder lesen" on public.dominion_games for select to authenticated using ((select private.is_member()));
create policy "Mitglieder legen an" on public.dominion_games for insert to authenticated with check ((select private.is_member()));
create policy "Mitglieder ändern" on public.dominion_games for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "Mitglieder löschen" on public.dominion_games for delete to authenticated using ((select private.is_member()));

alter publication supabase_realtime add table public.dominion_games;

-- Vorbelegung: Jonathans Sammlung (18.11.2026): Basisspiel 2. Edition, Seaside, Blütezeit, Alchemisten, Dark Ages
insert into public.modules (id, enabled, config)
values (
  'dominion',
  true,
  '{"owned": {"boxes": ["baseset2", "seaside", "prosperity", "alchemy", "darkages"], "promos": []}, "banned": [], "favorites": []}'::jsonb
)
on conflict (id) do nothing;
