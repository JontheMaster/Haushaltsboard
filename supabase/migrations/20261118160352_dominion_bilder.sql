-- Dominion: Kartenbilder und Illustrationen privat (Bucket dominion, nur Mitglieder lesen). Hochladen nur die Edge Function
-- dominion-images (Service-Rolle), Quelle KingdomCreator auf GitHub. Nie ins öffentliche Repo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dominion', 'dominion', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "Dominion-Bilder: Mitglieder lesen" on storage.objects for select to authenticated
  using (bucket_id = 'dominion' and (select private.is_member()));
