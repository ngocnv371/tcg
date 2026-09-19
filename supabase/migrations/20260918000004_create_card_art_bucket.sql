-- Public Storage bucket for card art (uploaded by scripts/import-concept-cards.mjs).
-- Card art is public game asset data, not player progression, so a public
-- read policy is fine — writes stay service_role-only (no insert/update/delete
-- policy for anon/authenticated), same rule as every other catalog table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-art', 'card-art', true, 52428800, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "card-art public read" on storage.objects;
create policy "card-art public read"
  on storage.objects for select
  using (bucket_id = 'card-art');
