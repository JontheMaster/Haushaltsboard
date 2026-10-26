-- Filme: Vorschläge (26.10.2026, Go Jonathan). Die Function `movies` rechnet sie einmal pro Woche (und auf Wunsch der App)
-- aus euren Sternen, Merkliste-Stimmen und euren Diensten; Daten von TMDB (Zwischenspeicher < 6 Monate, wird wöchentlich ersetzt).
create table public.movie_suggestions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('movie', 'tv')),
  tmdb_id int not null,
  -- neu = neu bei euren Diensten / bald im Kino; passt = passend zu euren Lieblingsfilmen
  section text not null check (section in ('neu', 'passt')),
  title text not null,
  year int,
  poster_path text,
  overview text,
  genre_ids int[] not null default '{}',
  rating_tmdb numeric,
  -- kurzer Grund, z. B. „Weil ihr Dune mochtet“, „Neu bei Netflix“, „Kinostart 6. Nov.“
  reason text,
  score numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, tmdb_id)
);
alter table public.movie_suggestions enable row level security;
create policy "Nur Mitglieder" on public.movie_suggestions for all to authenticated using (private.is_member()) with check (private.is_member());

-- „Kein Interesse“: kommt nicht wieder (für beide)
create table public.movie_dismissed (
  kind text not null check (kind in ('movie', 'tv')),
  tmdb_id int not null,
  member uuid references public.members on delete set null,
  at timestamptz not null default now(),
  primary key (kind, tmdb_id)
);
alter table public.movie_dismissed enable row level security;
create policy "Nur Mitglieder" on public.movie_dismissed for all to authenticated using (private.is_member()) with check (private.is_member());
