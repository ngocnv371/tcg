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
insert into public.cards (id, name, rank, faction, role, base_atk, base_def, passive_name, passive_text, lore, art_path, sort_order) values
  ('cinder_squire', 'Cinder Squire', 1, 'ember', 'dps', 20, 12, 'Ember Strike', '+15% ATK against 1★ and 2★ enemies.', 'A page who never lets the forge go cold.', 'art/cards/cinder_squire.webp', 0),
  ('ash_hound', 'Ash Hound', 1, 'ember', 'dps', 21, 11, 'Cinder Trail', '+5% party power for each other Ember card in the party.', 'It sleeps in the cooling slag and wakes at the smell of iron.', 'art/cards/ash_hound.webp', 1),
  ('tidepool_sprite', 'Tidepool Sprite', 1, 'tide', 'support', 17, 14, 'Tidal Mend', 'Heals the party for 4% of its power after each successful run.', 'Small enough to hide in a seashell, loud enough to wake a harbour.', 'art/cards/tidepool_sprite.webp', 2),
  ('drowned_deckhand', 'Drowned Deckhand', 1, 'tide', 'tank', 18, 16, 'Brine Hide', 'Reduces dungeon power requirement by 3% while in the party.', 'Still punching the clock, four fathoms down.', 'art/cards/drowned_deckhand.webp', 3),
  ('thornling', 'Thornling', 1, 'verdant', 'tank', 16, 17, 'Bramble Guard', 'The first failed run each day costs no party fatigue.', 'Grows a new thorn every time it hears a lie.', 'art/cards/thornling.webp', 4),
  ('mossback_boar', 'Mossback Boar', 1, 'verdant', 'dps', 22, 10, 'Charge', '+10% gold from the first run of each session.', 'Its tusks are prized and its temper is not.', 'art/cards/mossback_boar.webp', 5),
  ('shade_rat', 'Shade Rat', 1, 'umbral', 'dps', 19, 11, 'Gnaw', 'Ignores 10% of enemy DEF.', 'It eats the light before it eats the grain.', 'art/cards/shade_rat.webp', 6),
  ('grave_lantern', 'Grave Lantern', 1, 'umbral', 'support', 15, 15, 'Wisp Ward', '+2% success chance on any run it joins.', 'Someone lit it to walk a friend home. Nobody has blown it out since.', 'art/cards/grave_lantern.webp', 7),
  ('dawn_acolyte', 'Dawn Acolyte', 1, 'radiant', 'support', 16, 15, 'First Light', '+5% gold on runs shorter than 30 minutes.', 'Prays at the hour when the sky cannot decide what colour to be.', 'art/cards/dawn_acolyte.webp', 8),
  ('forge_apprentice', 'Forge Apprentice', 2, 'ember', 'dps', 35, 21, 'Hammerfall', '+12% ATK for each 4★+ material stack in your vault.', 'Took the apprenticeship for the sparks and stayed for the scars.', 'art/cards/forge_apprentice.webp', 9),
  ('scorchrunner', 'Scorchrunner', 2, 'ember', 'dps', 38, 19, 'Trailblaze', 'Cuts 5% off dungeon timers.', 'Burns a path so the party behind it can move faster.', 'art/cards/scorchrunner.webp', 10),
  ('reef_sentinel', 'Reef Sentinel', 2, 'tide', 'tank', 30, 27, 'Coral Wall', 'Absorbs the first failure penalty of each day.', 'It has stood in the same current for a century and sees no reason to move.', 'art/cards/reef_sentinel.webp', 11),
  ('salt_warden', 'Salt Warden', 2, 'tide', 'support', 29, 25, 'Preserve', '+10% material drops from resource dungeons.', 'Salt keeps its promises: nothing spoils on its watch.', 'art/cards/salt_warden.webp', 12),
  ('grove_warden', 'Grove Warden', 2, 'verdant', 'tank', 28, 28, 'Root Network', '+8% party power when three or more factions are present.', 'Speaks to every tree in the valley by name including the dead ones.', 'art/cards/grove_warden.webp', 13),
  ('nightblade_acolyte', 'Nightblade Acolyte', 2, 'umbral', 'dps', 39, 18, 'Backstab', '+25% power in the first 10 seconds of a run.', 'Learned patience first and knives second.', 'art/cards/nightblade_acolyte.webp', 14),
  ('bone_harvester', 'Bone Harvester', 2, 'umbral', 'support', 27, 24, 'Grave Tithe', 'Converts 5% of gold earned into shards for your lowest-rank card.', 'Counts every rib it has ever collected. The count is not finished.', 'art/cards/bone_harvester.webp', 15),
  ('halo_smith', 'Halo Smith', 2, 'radiant', 'support', 26, 26, 'Gild', '+8% gold on every run.', 'Forges rings for those who earn them and for those who do not.', 'art/cards/halo_smith.webp', 16),
  ('magma_brute', 'Magma Brute', 3, 'ember', 'tank', 55, 33, 'Molten Core', 'Refunds 10% of a failed run as bonus gold.', 'Anger is a fossil fuel and it has reserves.', 'art/cards/magma_brute.webp', 17),
  ('kraken_spawn', 'Kraken Spawn', 3, 'tide', 'dps', 63, 29, 'Eight Arms', '+20% reward scaling on boss dungeons.', 'Eight arms, one idea, and the idea is more food.', 'art/cards/kraken_spawn.webp', 18),
  ('bramble_tyrant', 'Bramble Tyrant', 3, 'verdant', 'tank', 54, 34, 'Thicket', 'Failed runs still return 50% of their materials.', 'Nobody has found the middle of the thicket. Several have found the edges.', 'art/cards/bramble_tyrant.webp', 19),
  ('rootmother', 'Rootmother', 3, 'verdant', 'support', 49, 30, 'Deep Water', '+15% party power for every card under 3★.', 'She remembers when the valley was a seed.', 'art/cards/rootmother.webp', 20),
  ('hollow_knight', 'Hollow Knight', 3, 'umbral', 'dps', 68, 26, 'Void Step', 'Ignores 20% of enemy DEF on runs longer than two hours.', 'The armour is empty and the armour is the only thing still fighting.', 'art/cards/hollow_knight.webp', 21),
  ('dawnbreaker', 'Dawnbreaker', 3, 'radiant', 'dps', 60, 30, 'Daybreak', '+15% power against boss dungeons.', 'Rated for one sunrise per battle. It has been known to break the rule.', 'art/cards/dawnbreaker.webp', 22),
  ('pyre_warden', 'Pyre Warden', 4, 'ember', 'tank', 85, 51, 'Funeral Pyre', '+20% party power but dungeon timers run 15% longer.', 'Tends the fire that keeps the dead company.', 'art/cards/pyre_warden.webp', 23),
  ('abyss_oracle', 'Abyss Oracle', 4, 'tide', 'support', 78, 47, 'Foresight', '+12% success chance in dungeons you have not cleared yet.', 'Reads the tide''s handwriting without turning the page.', 'art/cards/abyss_oracle.webp', 24),
  ('verdant_colossus', 'Verdant Colossus', 4, 'verdant', 'tank', 82, 54, 'Canopy', 'The first failed run each week refunds every material spent on it.', 'A mountain that agreed to take a walk.', 'art/cards/verdant_colossus.webp', 25),
  ('umbral_regent', 'Umbral Regent', 4, 'umbral', 'support', 80, 48, 'Crown of Ash', '+10% to every drop table while a 5★ card is in the party.', 'Rules a kingdom that appears only on maps drawn in the dark.', 'art/cards/umbral_regent.webp', 26),
  ('radiant_seraph', 'Radiant Seraph', 4, 'radiant', 'support', 84, 46, 'Benediction', 'Converts one boss core into three crystal on demand.', 'It has six wings and no opinion about your schedule.', 'art/cards/radiant_seraph.webp', 27),
  ('ashen_sovereign', 'Ashen Sovereign', 5, 'ember', 'dps', 130, 68, 'Crownfire', '+30% power on boss dungeons and boss cores are guaranteed on a clear.', 'The first forge was lit to crown it, not to warm anyone.', 'art/cards/ashen_sovereign.webp', 28),
  ('worldseed_avatar', 'Worldseed Avatar', 5, 'verdant', 'support', 118, 74, 'Worldseed', 'Every card in the party earns 25% more XP.', 'Everything you have ever planted was practice for this.', 'art/cards/worldseed_avatar.webp', 29)
on conflict (id) do update set
  name = excluded.name, rank = excluded.rank, faction = excluded.faction, role = excluded.role,
  base_atk = excluded.base_atk, base_def = excluded.base_def,
  passive_name = excluded.passive_name, passive_text = excluded.passive_text,
  lore = excluded.lore, art_path = excluded.art_path, sort_order = excluded.sort_order;

-- card_rank_costs (ladder by current rank + the card faction essence)
insert into public.card_rank_costs (card_id, from_rank, to_rank, gold, materials) values
  ('cinder_squire', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"ember_essence":3}'::jsonb),
  ('cinder_squire', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"ember_essence":8}'::jsonb),
  ('cinder_squire', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"ember_essence":15}'::jsonb),
  ('cinder_squire', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"ember_essence":25}'::jsonb),
  ('ash_hound', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"ember_essence":3}'::jsonb),
  ('ash_hound', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"ember_essence":8}'::jsonb),
  ('ash_hound', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"ember_essence":15}'::jsonb),
  ('ash_hound', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"ember_essence":25}'::jsonb),
  ('tidepool_sprite', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"tide_essence":3}'::jsonb),
  ('tidepool_sprite', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"tide_essence":8}'::jsonb),
  ('tidepool_sprite', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"tide_essence":15}'::jsonb),
  ('tidepool_sprite', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"tide_essence":25}'::jsonb),
  ('drowned_deckhand', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"tide_essence":3}'::jsonb),
  ('drowned_deckhand', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"tide_essence":8}'::jsonb),
  ('drowned_deckhand', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"tide_essence":15}'::jsonb),
  ('drowned_deckhand', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"tide_essence":25}'::jsonb),
  ('thornling', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"verdant_essence":3}'::jsonb),
  ('thornling', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"verdant_essence":8}'::jsonb),
  ('thornling', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"verdant_essence":15}'::jsonb),
  ('thornling', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"verdant_essence":25}'::jsonb),
  ('mossback_boar', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"verdant_essence":3}'::jsonb),
  ('mossback_boar', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"verdant_essence":8}'::jsonb),
  ('mossback_boar', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"verdant_essence":15}'::jsonb),
  ('mossback_boar', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"verdant_essence":25}'::jsonb),
  ('shade_rat', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"umbral_essence":3}'::jsonb),
  ('shade_rat', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"umbral_essence":8}'::jsonb),
  ('shade_rat', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"umbral_essence":15}'::jsonb),
  ('shade_rat', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"umbral_essence":25}'::jsonb),
  ('grave_lantern', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"umbral_essence":3}'::jsonb),
  ('grave_lantern', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"umbral_essence":8}'::jsonb),
  ('grave_lantern', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"umbral_essence":15}'::jsonb),
  ('grave_lantern', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"umbral_essence":25}'::jsonb),
  ('dawn_acolyte', 1, 2, 1000, '{"common_shard":10,"iron_ore":5,"radiant_essence":3}'::jsonb),
  ('dawn_acolyte', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"radiant_essence":8}'::jsonb),
  ('dawn_acolyte', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"radiant_essence":15}'::jsonb),
  ('dawn_acolyte', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"radiant_essence":25}'::jsonb),
  ('forge_apprentice', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"ember_essence":8}'::jsonb),
  ('forge_apprentice', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"ember_essence":15}'::jsonb),
  ('forge_apprentice', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"ember_essence":25}'::jsonb),
  ('scorchrunner', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"ember_essence":8}'::jsonb),
  ('scorchrunner', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"ember_essence":15}'::jsonb),
  ('scorchrunner', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"ember_essence":25}'::jsonb),
  ('reef_sentinel', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"tide_essence":8}'::jsonb),
  ('reef_sentinel', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"tide_essence":15}'::jsonb),
  ('reef_sentinel', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"tide_essence":25}'::jsonb),
  ('salt_warden', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"tide_essence":8}'::jsonb),
  ('salt_warden', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"tide_essence":15}'::jsonb),
  ('salt_warden', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"tide_essence":25}'::jsonb),
  ('grove_warden', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"verdant_essence":8}'::jsonb),
  ('grove_warden', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"verdant_essence":15}'::jsonb),
  ('grove_warden', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"verdant_essence":25}'::jsonb),
  ('nightblade_acolyte', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"umbral_essence":8}'::jsonb),
  ('nightblade_acolyte', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"umbral_essence":15}'::jsonb),
  ('nightblade_acolyte', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"umbral_essence":25}'::jsonb),
  ('bone_harvester', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"umbral_essence":8}'::jsonb),
  ('bone_harvester', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"umbral_essence":15}'::jsonb),
  ('bone_harvester', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"umbral_essence":25}'::jsonb),
  ('halo_smith', 2, 3, 5000, '{"uncommon_shard":25,"iron_ore":15,"beast_fang":5,"radiant_essence":8}'::jsonb),
  ('halo_smith', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"radiant_essence":15}'::jsonb),
  ('halo_smith', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"radiant_essence":25}'::jsonb),
  ('magma_brute', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"ember_essence":15}'::jsonb),
  ('magma_brute', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"ember_essence":25}'::jsonb),
  ('kraken_spawn', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"tide_essence":15}'::jsonb),
  ('kraken_spawn', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"tide_essence":25}'::jsonb),
  ('bramble_tyrant', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"verdant_essence":15}'::jsonb),
  ('bramble_tyrant', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"verdant_essence":25}'::jsonb),
  ('rootmother', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"verdant_essence":15}'::jsonb),
  ('rootmother', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"verdant_essence":25}'::jsonb),
  ('hollow_knight', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"umbral_essence":15}'::jsonb),
  ('hollow_knight', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"umbral_essence":25}'::jsonb),
  ('dawnbreaker', 3, 4, 20000, '{"rare_shard":50,"crystal":20,"beast_fang":10,"radiant_essence":15}'::jsonb),
  ('dawnbreaker', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"radiant_essence":25}'::jsonb),
  ('pyre_warden', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"ember_essence":25}'::jsonb),
  ('abyss_oracle', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"tide_essence":25}'::jsonb),
  ('verdant_colossus', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"verdant_essence":25}'::jsonb),
  ('umbral_regent', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"umbral_essence":25}'::jsonb),
  ('radiant_seraph', 4, 5, 80000, '{"epic_shard":100,"crystal":40,"boss_core":1,"radiant_essence":25}'::jsonb)
on conflict (card_id, to_rank) do update set
  from_rank = excluded.from_rank, gold = excluded.gold, materials = excluded.materials;

-- dungeons
insert into public.dungeons (id, name, kind, tier, req_power, duration_seconds, gold_base, materials, card_id, unlocks_at_level, chest_on_clear) values
  ('ore_mine', 'Ore Mine', 'resource', 1, 150, 5, 60, '[{"material_id":"iron_ore","weight":70,"min":2,"max":5},{"material_id":"common_shard","weight":30,"min":1,"max":2}]'::jsonb, null, 1, 'common'),
  ('shard_grotto', 'Shard Grotto', 'resource', 2, 500, 5, 300, '[{"material_id":"uncommon_shard","weight":55,"min":1,"max":3},{"material_id":"iron_ore","weight":30,"min":2,"max":6},{"material_id":"crystal","weight":15,"min":1,"max":1}]'::jsonb, null, 1, 'rare'),
  ('ember_forge', 'Ember Forge', 'card', 2, 500, 5, 300, '[{"material_id":"ember_essence","weight":45,"min":1,"max":3},{"material_id":"iron_ore","weight":35,"min":2,"max":5},{"material_id":"common_shard","weight":20,"min":1,"max":3}]'::jsonb, 'magma_brute', 3, 'rare'),
  ('crystal_cavern', 'Crystal Cavern', 'resource', 3, 1500, 5, 1200, '[{"material_id":"crystal","weight":50,"min":1,"max":4},{"material_id":"rare_shard","weight":30,"min":1,"max":2},{"material_id":"iron_ore","weight":20,"min":3,"max":8}]'::jsonb, null, 6, 'epic'),
  ('fang_hunt', 'Fang Hunt', 'card', 3, 1500, 5, 1200, '[{"material_id":"beast_fang","weight":45,"min":1,"max":3},{"material_id":"rare_shard","weight":35,"min":1,"max":2},{"material_id":"ember_essence","weight":20,"min":2,"max":5}]'::jsonb, 'pyre_warden', 8, 'epic'),
  ('obsidian_gate', 'Obsidian Gate', 'boss', 5, 9000, 5, 9000, '[{"material_id":"boss_core","weight":35,"min":1,"max":1},{"material_id":"epic_shard","weight":40,"min":1,"max":3},{"material_id":"crystal","weight":25,"min":3,"max":9}]'::jsonb, 'ashen_sovereign', 12, 'mythic')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, tier = excluded.tier,
  req_power = excluded.req_power, duration_seconds = excluded.duration_seconds,
  gold_base = excluded.gold_base, materials = excluded.materials, card_id = excluded.card_id,
  unlocks_at_level = excluded.unlocks_at_level, chest_on_clear = excluded.chest_on_clear;

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

-- summary: 30 cards (1star:9 2star:8 3star:6 4star:5 5star:2), 6 dungeons, 5 chests, 14 materials
-- dungeons: ore_mine, shard_grotto, ember_forge, crystal_cavern, fang_hunt, obsidian_gate
-- rank-up cost rows: 77, chest odds rows: 19
