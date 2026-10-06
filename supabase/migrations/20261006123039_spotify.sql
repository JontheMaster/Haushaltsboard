-- Spotify „Läuft gerade“: Anmeldungen pro Mitglied. Tokens sind geheim: RLS an, keine Policies,
-- nur die Edge Function `spotify` (Service-Rolle) liest und schreibt.
create table public.spotify_accounts (
  member_id uuid primary key references public.members(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  connected_at timestamptz not null default now()
);
alter table public.spotify_accounts enable row level security;

-- Einmal-Schlüssel für die Anmeldung (state), 10 Minuten gültig
create table public.spotify_auth_states (
  state text primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now()
);
alter table public.spotify_auth_states enable row level security;

revoke all on public.spotify_accounts, public.spotify_auth_states from anon, authenticated;

insert into public.modules (id, enabled, config) values ('spotify', true, '{}'::jsonb)
on conflict (id) do nothing;
