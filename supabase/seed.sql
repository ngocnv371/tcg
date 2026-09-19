-- GENERATED FILE — do not edit by hand.
-- Rebuild with: npm run seed:build
-- Sources: data/cards.csv, data/dungeons.csv, src/game/formulas.ts

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
  ('iron_ore', 'Iron Ore', 'ore', null, 1, null),
  ('crystal', 'Crystal', 'crystal', null, 3, null),
  ('beast_fang', 'Beast Fang', 'essence', null, 3, null),
  ('boss_core', 'Boss Core', 'core', null, 5, null),
  ('ember_essence', 'Ember Essence', 'essence', null, 2, null),
  ('tide_essence', 'Tide Essence', 'essence', null, 2, null),
  ('verdant_essence', 'Verdant Essence', 'essence', null, 2, null),
  ('umbral_essence', 'Umbral Essence', 'essence', null, 2, null),
  ('radiant_essence', 'Radiant Essence', 'essence', null, 2, null)
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, rarity = excluded.rarity, tier = excluded.tier;

-- cards
-- card_rank_costs (ladder by current rank + the card faction essence)
-- dungeons
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

-- summary: 0 cards (), 0 dungeons, 5 chests, 14 materials
-- dungeons: none seeded — shipped via scripts/import-concept-dungeons.mjs
-- rank-up cost rows: 0, chest odds rows: 19
