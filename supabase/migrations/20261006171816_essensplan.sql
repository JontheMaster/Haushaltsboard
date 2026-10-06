-- Phase 4: Essensplaner. Rezeptbibliothek, Kategorien, geplante Essen.

create table public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_path text,                       -- full/<id>.jpg im Bucket recipes (ca. 1600 px)
  thumb_path text,                       -- thumb/<id>.jpg (ca. 480 px)
  duration_min int,                      -- Gesamtdauer in Minuten
  servings int not null default 2,
  category_ids uuid[] not null default '{}',
  -- [{ amount: number | null, unit: string, name: string }]
  ingredients jsonb not null default '[]',
  -- [{ text: string }]
  steps jsonb not null default '[]',
  source_url text,
  created_by uuid references public.members on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_created_by_idx on public.recipes (created_by);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes on delete set null,
  title text not null,                   -- Kopie, bleibt auch ohne Rezept lesbar
  day date not null,
  start_time time,                       -- null = irgendwann am Tag
  duration_min int,                      -- Kochzeit, blockt den Zeitplan
  servings int not null default 2,
  created_by uuid references public.members on delete set null,
  created_at timestamptz not null default now()
);
create index meals_day_idx on public.meals (day);
create index meals_recipe_idx on public.meals (recipe_id);
create index meals_created_by_idx on public.meals (created_by);

alter table public.recipe_categories enable row level security;
alter table public.recipes enable row level security;
alter table public.meals enable row level security;
revoke all on public.recipe_categories, public.recipes, public.meals from anon;
create policy "Nur Mitglieder" on public.recipe_categories for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Nur Mitglieder" on public.recipes for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Nur Mitglieder" on public.meals for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

alter publication supabase_realtime add table public.recipes, public.recipe_categories, public.meals;

-- Startkategorien aus Jonathans Skizze
insert into public.recipe_categories (name, sort) values
  ('Schnell', 1), ('Aufwendig', 2), ('Suppen', 3), ('Nudeln', 4), ('Fleisch', 5), ('Kartoffeln', 6), ('Backen', 7)
on conflict (name) do nothing;

-- Bilder: privater Speicher wie bei den Fotos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipes', 'recipes', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
create policy "Rezepte: Mitglieder lesen" on storage.objects for select to authenticated
  using (bucket_id = 'recipes' and (select private.is_member()));
create policy "Rezepte: Mitglieder hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipes' and (select private.is_member()));
create policy "Rezepte: Mitglieder löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'recipes' and (select private.is_member()));

-- Modul; Vorräte landen beim Einplanen nicht automatisch auf der Einkaufsliste
insert into public.modules (id, config)
values ('essensplan', '{"pantry": ["Salz", "Pfeffer", "Zucker", "Öl", "Olivenöl", "Wasser", "Mehl", "Essig", "Paprikapulver", "Gemüsebrühe"]}')
on conflict (id) do nothing;
