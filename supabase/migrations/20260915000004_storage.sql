-- Public Storage buckets for catalog art.
--
-- Card, dungeon, material and chest art is public game-asset data, not player progression, so a
-- public read policy is fine — writes stay service_role-only (there is no insert/update/
-- delete policy for anon/authenticated), the same rule as every other catalog table. One
-- bucket per content pipeline so they never collide on object names and access rules can
-- diverge later; chests and materials are the same flat icon pipeline, so they share
-- `material-art` rather than getting a bucket of their own. Populated by
-- scripts/cards-4-import.mjs, scripts/dungeons-1-import.mjs, scripts/materials-4-import.mjs
-- and scripts/chests-4-import.mjs; a row keeps a null art_path (or null icon) until its art
-- lands.
--
-- Guarded: `storage` only exists on the real Supabase stack, so scripts/verify-db.sh can
-- apply every migration to a bare Postgres and still reach the schema assertions.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present — skipping art buckets';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('card-art', 'card-art', true, 52428800, array['image/png', 'image/webp', 'image/jpeg'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('dungeon-art', 'dungeon-art', true, 52428800, array['image/png', 'image/webp', 'image/jpeg'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('material-art', 'material-art', true, 52428800, array['image/png', 'image/webp', 'image/jpeg'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $ddl$drop policy if exists "card-art public read" on storage.objects$ddl$;
  execute $ddl$create policy "card-art public read" on storage.objects
    for select using (bucket_id = 'card-art')$ddl$;

  execute $ddl$drop policy if exists "dungeon-art public read" on storage.objects$ddl$;
  execute $ddl$create policy "dungeon-art public read" on storage.objects
    for select using (bucket_id = 'dungeon-art')$ddl$;

  execute $ddl$drop policy if exists "material-art public read" on storage.objects$ddl$;
  execute $ddl$create policy "material-art public read" on storage.objects
    for select using (bucket_id = 'material-art')$ddl$;
end;
$$;
