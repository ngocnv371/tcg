-- Chest art.
--
-- Chests are the same kind of catalog data as materials — a fixed, seeded set of rows with one
-- flat icon — so the art is authored in data/assets.csv (`type=chest`) and uploaded by
-- scripts/chests-4-import.mjs to the same public `material-art` bucket materials use. The
-- column lives here rather than in init.sql because the schema was squashed before chest art
-- existed; a fresh reset applies init then this, and an
-- existing database picks the column up with `supabase migration up`. A row keeps a null icon
-- until its art lands, which the client renders as a placeholder glyph.

alter table public.chests add column if not exists icon text;

comment on column public.chests.icon is
  'Public Storage URL of the chest art once scripts/chests-4-import.mjs has run; null until then.';
