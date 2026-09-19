-- Dungeon key art — the same treatment cards got in
-- 20260918000004_create_card_art_bucket.sql: a nullable column pointing at a
-- public Storage URL, plus its own public bucket.
--
-- Kept in a separate bucket from `card-art` so the two content pipelines never
-- collide on object names and access rules can diverge later. Dungeon art, like
-- card art, is public catalog data (not player progression), so a public read
-- policy is fine — writes stay service_role-only (no insert/update/delete
-- policy for anon/authenticated), matching every other catalog table.
--
-- Populated by scripts/import-concept-dungeons.mjs; seeded dungeons keep a null
-- art_path until their own art is uploaded.

alter table public.dungeons add column if not exists art_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dungeon-art', 'dungeon-art', true, 52428800, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dungeon-art public read" on storage.objects;
create policy "dungeon-art public read"
  on storage.objects for select
  using (bucket_id = 'dungeon-art');
