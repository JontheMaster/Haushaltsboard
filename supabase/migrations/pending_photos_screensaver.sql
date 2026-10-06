-- Bildschirmschoner mit eigener Fotobibliothek (vorgezogen aus Phase 6)

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,            -- full/<id>.jpg im Bucket photos (ca. 1920 px)
  thumb_path text not null,             -- thumb/<id>.jpg (ca. 400 px, für die Bibliothek am Handy)
  width int,
  height int,
  uploaded_by uuid references public.members on delete set null,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  show_in_visit boolean not null default false,  -- im Besuchsmodus zeigen
  active boolean not null default true           -- ausgeblendet = false
);
create index photos_uploaded_by_idx on public.photos (uploaded_by);

alter table public.photos enable row level security;
revoke all on public.photos from anon;
create policy "Nur Mitglieder" on public.photos for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

-- Privater Speicher: nur angemeldete Mitglieder, nur JPEG, max. 5 MB pro Datei
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Fotos: Mitglieder lesen" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (select private.is_member()));
create policy "Fotos: Mitglieder hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (select private.is_member()));
create policy "Fotos: Mitglieder löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select private.is_member()));

-- Modul mit Einstellungen (Minuten bis Start, Sekunden pro Foto)
insert into public.modules (id, config)
values ('bildschirmschoner', '{"idle_minutes": 5, "interval_seconds": 60}')
on conflict (id) do nothing;
