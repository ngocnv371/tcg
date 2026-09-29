-- GENERATED FILE — do not edit by hand.
-- Rebuild with: npm run seed:build
-- Sources: src/game/formulas.ts
-- Cards and dungeons are deliberately NOT seeded — they ship via the importers.
-- The one exception is the tutorial dungeon, which is onboarding scaffolding, not content.

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
insert into public.chests (id, name, tier, source, gem_price) values
  ('common', 'Common Chest', 1, 'daily login, T1 clears', 20),
  ('rare', 'Rare Chest', 2, 'T2 clears, login streak', 60),
  ('epic', 'Epic Chest', 3, 'T3 clears, achievements', 150),
  ('legendary', 'Legendary Chest', 4, 'boss clears, events (v1.1)', 400),
  ('mythic', 'Mythic Chest', 5, 'boss clears', 900)
on conflict (id) do update set name = excluded.name, tier = excluded.tier, source = excluded.source, gem_price = excluded.gem_price;

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

-- the one-time tutorial run (onboarding scaffolding, not catalog content)
-- its fixed payout is the ladder's 1→2 step for every Core family, so the guided rank-up is affordable
insert into public.dungeons (id, name, kind, tier, rank, tags, req_power, duration_seconds, gold_base, materials, unlocks_at_level, chest_on_clear, is_tutorial) values
  ('training_grounds', 'Training Grounds', 'resource', 1, 1, array['physical', 'fire', 'water', 'electric', 'grass', 'earth', 'ice', 'dragon', 'dark'], 1, 10, 1000, '[{"material_id":"common_shard","weight":0,"min":10,"max":10},{"material_id":"lesser_physical_core","weight":0,"min":3,"max":3},{"material_id":"lesser_fire_core","weight":0,"min":3,"max":3},{"material_id":"lesser_water_core","weight":0,"min":3,"max":3},{"material_id":"lesser_electric_core","weight":0,"min":3,"max":3},{"material_id":"lesser_grass_core","weight":0,"min":3,"max":3},{"material_id":"lesser_earth_core","weight":0,"min":3,"max":3},{"material_id":"lesser_ice_core","weight":0,"min":3,"max":3},{"material_id":"lesser_dragon_core","weight":0,"min":3,"max":3},{"material_id":"lesser_dark_core","weight":0,"min":3,"max":3}]'::jsonb, 1, null, true)
on conflict (id) do update set
  tags = excluded.tags, duration_seconds = excluded.duration_seconds,
  gold_base = excluded.gold_base, materials = excluded.materials, is_tutorial = excluded.is_tutorial;

-- quests (manual combat; content authored in src/game/quests.ts)
insert into public.quests (id, name, sort_order, req_power, enemies, gold, materials, first_clear_gold, first_clear_materials, intro, outro) values
  ('the_kidnapped_chicken', 'The Kidnapped Chicken', 1, 80, '[{"id":"scruffy_wolf","cardId":"thunder-wolf","name":"Scruffy Wolf","icon":"🐺","hp":60,"atk":10,"def":2,"spd":12}]'::jsonb, 250, '{"lesser_physical_core":1}'::jsonb, 150, '{"lesser_earth_core":1}'::jsonb, '[{"speaker":"Pip the Farmer","avatar":"🧑‍🌾","text":"Oh no, a wolf has kidnapped my pet chicken!"},{"speaker":"Pip the Farmer","avatar":"🧑‍🌾","text":"Please — face it in battle and bring her home!"}]'::jsonb, '[{"speaker":"Pip the Farmer","avatar":"🧑‍🌾","text":"You did it! Cluckers is safe and sound. Thank you!"}]'::jsonb),
  ('mushroom_menace', 'Mushroom Menace', 2, 150, '[{"id":"spore_cap","cardId":"mushroom-back-turtle","name":"Spore Cap","icon":"🍄","hp":45,"atk":12,"def":4,"spd":8},{"id":"razor_vine","cardId":"razor-leaf","name":"Razor Vine","icon":"🌿","hp":45,"atk":12,"def":4,"spd":8}]'::jsonb, 400, '{"lesser_grass_core":2}'::jsonb, 200, '{"greater_grass_core":1}'::jsonb, '[{"speaker":"Grimble the Guide","avatar":"🧙","text":"The old cellar has been overgrown for years — mushrooms and worse."},{"speaker":"Grimble the Guide","avatar":"🧙","text":"Two of them guard the grain. Clear them out — carefully!"}]'::jsonb, '[{"speaker":"Grimble the Guide","avatar":"🧙","text":"Not a single spore left. The harvest is saved!"}]'::jsonb),
  ('bandits_at_the_bridge', 'Brutes at the Bridge', 3, 240, '[{"id":"bridge_troll","cardId":"rock-troll","name":"Bridge Troll","icon":"🧌","hp":50,"atk":14,"def":5,"spd":14},{"id":"brawler","cardId":"knuckle-monkey","name":"Brawler","icon":"🐒","hp":50,"atk":14,"def":5,"spd":14},{"id":"gnawer","cardId":"horned-beaver","name":"Gnawer","icon":"🦫","hp":50,"atk":14,"def":5,"spd":14}]'::jsonb, 700, '{"lesser_dark_core":2}'::jsonb, 300, '{"greater_dark_core":1}'::jsonb, '[{"speaker":"Captain Rook","avatar":"🛡️","text":"A troll and its cronies have barred the only bridge out of the valley."},{"speaker":"Captain Rook","avatar":"🛡️","text":"Three of them. Scatter them and the road is ours again."}]'::jsonb, '[{"speaker":"Captain Rook","avatar":"🛡️","text":"The bridge is open. The valley owes you a debt, champion."}]'::jsonb)
on conflict (id) do update set
  name = excluded.name, sort_order = excluded.sort_order, req_power = excluded.req_power,
  enemies = excluded.enemies, gold = excluded.gold, materials = excluded.materials,
  first_clear_gold = excluded.first_clear_gold, first_clear_materials = excluded.first_clear_materials,
  intro = excluded.intro, outro = excluded.outro;

commit;

-- local development account's starter cards and party
select public.provision_starter_loadout('00000000-0000-0000-0000-000000000002'::uuid);

-- summary: 41 materials, 5 chests, 19 chest odds rows, 3 run-slot rows, 1 tutorial dungeon, 3 quests
-- no cards and no catalog dungeons: content ships via npm run cards:4:import / dungeons:1:import
