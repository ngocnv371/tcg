-- GENERATED FILE — do not edit by hand.
-- Rebuild with: npm run seed:build
-- Sources: src/game/formulas.ts
-- Cards and dungeons are deliberately NOT seeded — they ship via the importers.

begin;

-- rank_meta
insert into public.rank_meta (rank, atk_base, def_ratio, rank_mult, level_cap, atk_growth, levelup_gold_base, levelup_gold_exp, dupe_shard_material, dupe_shard_qty) values
  (1, 20, 0.600, 1.00, 20, 0.0800, 25.00, 1.40, 'common_shard', 5),
  (2, 35, 0.600, 1.50, 40, 0.0800, 25.00, 1.40, 'uncommon_shard', 10),
  (3, 55, 0.600, 2.20, 60, 0.0800, 25.00, 1.40, 'rare_shard', 25),
  (4, 85, 0.600, 3.20, 80, 0.0800, 25.00, 1.40, 'epic_shard', 60),
  (5, 130, 0.600, 4.50, 99, 0.0800, 25.00, 1.40, 'mythic_shard', 150)
on conflict (rank) do update set
  atk_base = excluded.atk_base,
  def_ratio = excluded.def_ratio,
  rank_mult = excluded.rank_mult,
  level_cap = excluded.level_cap,
  atk_growth = excluded.atk_growth,
  levelup_gold_base = excluded.levelup_gold_base,
  levelup_gold_exp = excluded.levelup_gold_exp,
  dupe_shard_material = excluded.dupe_shard_material,
  dupe_shard_qty = excluded.dupe_shard_qty;

-- materials
insert into public.materials (id, name, kind, rarity, tier, icon) values
  ('common_shard', 'Common Shard', 'shard', 1, 1, null),
  ('uncommon_shard', 'Uncommon Shard', 'shard', 2, 2, null),
  ('rare_shard', 'Rare Shard', 'shard', 3, 3, null),
  ('epic_shard', 'Epic Shard', 'shard', 4, 4, null),
  ('mythic_shard', 'Mythic Shard', 'shard', 5, 5, null),
  ('lesser_physical_core', 'Lesser Physical Core', 'core', 1, 1, null),
  ('greater_physical_core', 'Greater Physical Core', 'core', 2, 2, null),
  ('mythic_physical_core', 'Mythic Physical Core', 'core', 3, 3, null),
  ('legendary_physical_core', 'Legendary Physical Core', 'core', 4, 4, null),
  ('lesser_fire_core', 'Lesser Fire Core', 'core', 1, 1, null),
  ('greater_fire_core', 'Greater Fire Core', 'core', 2, 2, null),
  ('mythic_fire_core', 'Mythic Fire Core', 'core', 3, 3, null),
  ('legendary_fire_core', 'Legendary Fire Core', 'core', 4, 4, null),
  ('lesser_water_core', 'Lesser Water Core', 'core', 1, 1, null),
  ('greater_water_core', 'Greater Water Core', 'core', 2, 2, null),
  ('mythic_water_core', 'Mythic Water Core', 'core', 3, 3, null),
  ('legendary_water_core', 'Legendary Water Core', 'core', 4, 4, null),
  ('lesser_electric_core', 'Lesser Electric Core', 'core', 1, 1, null),
  ('greater_electric_core', 'Greater Electric Core', 'core', 2, 2, null),
  ('mythic_electric_core', 'Mythic Electric Core', 'core', 3, 3, null),
  ('legendary_electric_core', 'Legendary Electric Core', 'core', 4, 4, null),
  ('lesser_grass_core', 'Lesser Grass Core', 'core', 1, 1, null),
  ('greater_grass_core', 'Greater Grass Core', 'core', 2, 2, null),
  ('mythic_grass_core', 'Mythic Grass Core', 'core', 3, 3, null),
  ('legendary_grass_core', 'Legendary Grass Core', 'core', 4, 4, null),
  ('lesser_earth_core', 'Lesser Earth Core', 'core', 1, 1, null),
  ('greater_earth_core', 'Greater Earth Core', 'core', 2, 2, null),
  ('mythic_earth_core', 'Mythic Earth Core', 'core', 3, 3, null),
  ('legendary_earth_core', 'Legendary Earth Core', 'core', 4, 4, null),
  ('lesser_ice_core', 'Lesser Ice Core', 'core', 1, 1, null),
  ('greater_ice_core', 'Greater Ice Core', 'core', 2, 2, null),
  ('mythic_ice_core', 'Mythic Ice Core', 'core', 3, 3, null),
  ('legendary_ice_core', 'Legendary Ice Core', 'core', 4, 4, null),
  ('lesser_dragon_core', 'Lesser Dragon Core', 'core', 1, 1, null),
  ('greater_dragon_core', 'Greater Dragon Core', 'core', 2, 2, null),
  ('mythic_dragon_core', 'Mythic Dragon Core', 'core', 3, 3, null),
  ('legendary_dragon_core', 'Legendary Dragon Core', 'core', 4, 4, null),
  ('lesser_dark_core', 'Lesser Dark Core', 'core', 1, 1, null),
  ('greater_dark_core', 'Greater Dark Core', 'core', 2, 2, null),
  ('mythic_dark_core', 'Mythic Dark Core', 'core', 3, 3, null),
  ('legendary_dark_core', 'Legendary Dark Core', 'core', 4, 4, null)
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, rarity = excluded.rarity, tier = excluded.tier;

-- chests
insert into public.chests (id, name, tier, source) values
  ('common', 'Common Chest', 1, 'daily login, T1 clears'),
  ('rare', 'Rare Chest', 2, 'T2 clears, login streak'),
  ('epic', 'Epic Chest', 3, 'T3 clears, achievements'),
  ('legendary', 'Legendary Chest', 4, 'boss clears, events (v1.1)'),
  ('mythic', 'Mythic Chest', 5, 'boss clears')
on conflict (id) do update set name = excluded.name, tier = excluded.tier, source = excluded.source;

-- chest_odds (percent weights, summing to 100 per chest)
insert into public.chest_odds (chest_id, rank, weight) values
  ('common', 1, 70),
  ('common', 2, 25),
  ('common', 3, 5),
  ('rare', 1, 35),
  ('rare', 2, 45),
  ('rare', 3, 18),
  ('rare', 4, 2),
  ('epic', 1, 10),
  ('epic', 2, 30),
  ('epic', 3, 45),
  ('epic', 4, 14),
  ('epic', 5, 1),
  ('legendary', 2, 10),
  ('legendary', 3, 40),
  ('legendary', 4, 40),
  ('legendary', 5, 10),
  ('mythic', 3, 20),
  ('mythic', 4, 50),
  ('mythic', 5, 30)
on conflict (chest_id, rank) do update set weight = excluded.weight;

-- run slot unlocks (the pacing lever)
insert into public.run_slot_unlocks (player_level, slots) values
  (1, 2),
  (10, 3),
  (25, 4)
on conflict (player_level) do update set slots = excluded.slots;

commit;

-- local development account's starter cards and party
select public.provision_starter_loadout('00000000-0000-0000-0000-000000000002'::uuid);

-- summary: 41 materials, 5 chests, 19 chest odds rows, 3 run-slot rows
-- no cards and no dungeons: catalog content ships via npm run import:cards / import:dungeons
