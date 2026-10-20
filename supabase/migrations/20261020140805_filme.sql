-- Modul Filme (docs/filme-modul.md, Entscheidungen Jonathan 20.10.2026):
-- gemeinsame Merkliste für Filme und Serien (Daten von TMDB, Streaming von JustWatch), Stimmen pro Person,
-- Filmabende mit Bewertung (1–5 Sterne pro Person), Hinweise „jetzt bei …“.

create table public.movies (
  id uuid primary key default gen_random_uuid(),
  tmdb_id int,
  kind text not null default 'movie' check (kind in ('movie', 'tv')),
  title text not null check (length(title) between 1 and 200),
  original_title text,
  year int,
  -- Filme: Länge in Minuten; Serien: typische Folgenlänge
  runtime int,
  genres text[] not null default '{}',
  genre_ids int[] not null default '{}',
  poster_path text,
  backdrop_path text,
  overview text,
  rating_tmdb numeric(3, 1),
  -- Streaming in DE: { flatrate: [{id, name, logo}], rent: [...], buy: [...], link }
  providers jsonb not null default '{}',
  providers_checked_at timestamptz,
  -- wann die TMDB-Daten geholt wurden (TMDB erlaubt höchstens 6 Monate Zwischenspeicher)
  details_at timestamptz,
  source_url text,
  added_by uuid references public.members on delete set null,
  added_at timestamptz not null default now(),
  -- pruefen = Link nicht eindeutig, `candidates` hat bis zu 3 Vorschläge
  status text not null default 'merkliste' check (status in ('merkliste', 'gesehen', 'verworfen', 'pruefen')),
  candidates jsonb
);
create unique index movies_tmdb_idx on public.movies (kind, tmdb_id) where tmdb_id is not null;
create index movies_added_by_idx on public.movies (added_by);
create index movies_status_idx on public.movies (status);

create table public.movie_votes (
  movie_id uuid not null references public.movies on delete cascade,
  member uuid not null references public.members on delete cascade,
  want text not null check (want in ('unbedingt', 'gerne', 'egal', 'lieber_nicht')),
  updated_at timestamptz not null default now(),
  primary key (movie_id, member)
);
create index movie_votes_member_idx on public.movie_votes (member);

-- Filmabend: „Den schauen wir“ legt eine Zeile an; ratings = { Mitglied: 1–5, 0 = nicht mitgeschaut }
create table public.movie_watched (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies on delete cascade,
  watched_on date not null default (now() at time zone 'Europe/Berlin')::date,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  -- Dienst, auf dem geschaut wird (Name), falls bekannt
  service text,
  ratings jsonb not null default '{}',
  note text,
  created_by uuid references public.members on delete set null,
  created_at timestamptz not null default now()
);
create index movie_watched_movie_idx on public.movie_watched (movie_id);
create index movie_watched_created_by_idx on public.movie_watched (created_by);
create index movie_watched_day_idx on public.movie_watched (watched_on);

-- Hinweise am Board („Oppenheimer jetzt bei Prime“), Realtime-Toast, räumt der wöchentliche Lauf auf
create table public.movie_hints (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid references public.movies on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index movie_hints_movie_idx on public.movie_hints (movie_id);

alter table public.movies enable row level security;
alter table public.movie_votes enable row level security;
alter table public.movie_watched enable row level security;
alter table public.movie_hints enable row level security;
create policy "Nur Mitglieder" on public.movies for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Nur Mitglieder" on public.movie_votes for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Nur Mitglieder" on public.movie_watched for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "Nur Mitglieder lesen" on public.movie_hints for select to authenticated
  using ((select private.is_member()));

alter publication supabase_realtime add table public.movies;
alter publication supabase_realtime add table public.movie_votes;
alter publication supabase_realtime add table public.movie_watched;
alter publication supabase_realtime add table public.movie_hints;

-- Bewerten ohne sich gegenseitig zu überschreiben (beide können gleichzeitig tippen)
create function public.movie_rate(p_watched uuid, p_member uuid, p_stars int)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.movie_watched
     set ratings = ratings || jsonb_build_object(p_member::text, greatest(0, least(5, p_stars)))
   where id = p_watched;
$$;

insert into public.modules (id, enabled, config)
values ('filme', true, '{"services": ["Netflix", "Amazon Prime Video", "Disney Plus", "Joyn", "ARD Mediathek", "ZDF"], "push": []}')
on conflict (id) do nothing;

-- einmal pro Woche (Montag 5:00 UTC): Streaming-Anbieter prüfen, alte TMDB-Daten auffrischen
select cron.schedule('movies-weekly', '0 5 * * 1', $$
  select net.http_post(
    url := 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/movies',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.push_config where id = 1)),
    body := '{"action":"weekly"}'::jsonb
  );
$$);
