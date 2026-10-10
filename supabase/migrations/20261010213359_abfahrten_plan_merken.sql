-- Nächster Weg pro Person, jede Minute von transit (Cron transit-watch) geschrieben; das Handy-Widget liest ihn.
create table public.transit_plans (
  member_id uuid primary key references public.members on delete cascade,
  plan jsonb,
  updated_at timestamptz not null default now()
);
alter table public.transit_plans enable row level security;
-- keine Policies: nur Edge Functions (Service-Rolle) lesen und schreiben
