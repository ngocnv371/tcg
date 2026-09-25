/**
 * Generates supabase/seed.sql from the balance constants in src/game/formulas.ts.
 *
 * The seed owns the *economy scaffolding* and nothing else: rank metadata, the material
 * catalog, chests, chest odds and run-slot pacing. It deliberately seeds NO cards and NO
 * dungeons — those are catalog content, and they ship through the importers
 * (`npm run cards:4:import` reads data/assets.csv `type=card` rows + data/cards/<id>.png; dungeons:1:import reads
 * its own source folder). Two writers of the same rows would only disagree about art paths
 * and rank-up costs.
 *
 * Edit src/game/formulas.ts (or the content tables below) and re-run `npm run seed:build` —
 * never hand-edit seed.sql.
 *
 * Usage: node scripts/build-seed.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ATK_GROWTH_PER_LEVEL,
  CHEST_GEM_PRICES,
  CHEST_ODDS,
  CORE_TAGS,
  CORE_VARIANT_LABELS,
  CORE_VARIANTS,
  LEVELUP_GOLD_BASE,
  LEVELUP_GOLD_EXP,
  RANK_META,
  RUN_SLOT_UNLOCKS,
  TUTORIAL_DUNGEON_ID,
  TUTORIAL_DUNGEON_NAME,
  TUTORIAL_DURATION_SECONDS,
  tagCoreId,
  tagLabel,
  tutorialReward,
} from '../src/game/formulas.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// --- constants that are content, not formulas ---------------------------------
const ATK_GROWTH = ATK_GROWTH_PER_LEVEL
const LEVELUP_BASE = LEVELUP_GOLD_BASE
const LEVELUP_EXP = LEVELUP_GOLD_EXP

const SHARD_BY_RANK = {
  1: 'common_shard',
  2: 'uncommon_shard',
  3: 'rare_shard',
  4: 'epic_shard',
  5: 'mythic_shard',
}

/** Shards are the dupe payout AND a rank-up ingredient, so they stay in the catalog. */
const SHARD_MATERIALS = [
  { id: 'common_shard', name: 'Common Shard', kind: 'shard', rarity: 1, tier: 1 },
  { id: 'uncommon_shard', name: 'Uncommon Shard', kind: 'shard', rarity: 2, tier: 2 },
  { id: 'rare_shard', name: 'Rare Shard', kind: 'shard', rarity: 3, tier: 3 },
  { id: 'epic_shard', name: 'Epic Shard', kind: 'shard', rarity: 4, tier: 4 },
  { id: 'mythic_shard', name: 'Mythic Shard', kind: 'shard', rarity: 5, tier: 5 },
]

/**
 * One Core per card tag per grade — the rank-up currency. Derived from CORE_TAGS /
 * CORE_VARIANTS so the catalog can never drift from `tagCoreId()` in formulas.ts.
 * `tier` carries the grade (1 lesser … 4 legendary) so the vault can order them.
 */
const CORE_MATERIALS = CORE_TAGS.flatMap((tag) =>
  CORE_VARIANTS.map((variant, index) => ({
    id: tagCoreId(tag, variant),
    name: `${CORE_VARIANT_LABELS[variant]} ${tagLabel(tag)} Core`,
    kind: 'core',
    rarity: index + 1,
    tier: index + 1,
  })),
)

const MATERIALS = [...SHARD_MATERIALS, ...CORE_MATERIALS]

// `gemPrice` is the marketplace sink, sourced from CHEST_GEM_PRICES in formulas.ts —
// never a second balance table.
const CHESTS = [
  { id: 'common', name: 'Common Chest', tier: 1, source: 'daily login, T1 clears', gemPrice: CHEST_GEM_PRICES.common },
  { id: 'rare', name: 'Rare Chest', tier: 2, source: 'T2 clears, login streak', gemPrice: CHEST_GEM_PRICES.rare },
  { id: 'epic', name: 'Epic Chest', tier: 3, source: 'T3 clears, achievements', gemPrice: CHEST_GEM_PRICES.epic },
  { id: 'legendary', name: 'Legendary Chest', tier: 4, source: 'boss clears, events (v1.1)', gemPrice: CHEST_GEM_PRICES.legendary },
  { id: 'mythic', name: 'Mythic Chest', tier: 5, source: 'boss clears', gemPrice: CHEST_GEM_PRICES.mythic },
]

const sql = (value) => `'${String(value).replace(/'/g, "''")}'`
const sqlArray = (values) => `array[${values.map(sql).join(', ')}]`
const sqlJson = (value) => `${sql(JSON.stringify(value))}::jsonb`

// The tutorial is the ONE dungeon the seed owns: it is onboarding scaffolding, not catalog
// content, and its fixed payout is derived from the rank-up ladder so the guided rank-up can
// never be priced out. Every other dungeon still ships via scripts/dungeons-1-import.mjs.
const tutorial = tutorialReward()
const TUTORIAL_DUNGEON = {
  id: TUTORIAL_DUNGEON_ID,
  name: TUTORIAL_DUNGEON_NAME,
  duration: TUTORIAL_DURATION_SECONDS,
  rank: 1,
  tags: [...CORE_TAGS],
  gold: tutorial.gold,
  materials: Object.entries(tutorial.materials).map(([material_id, qty]) => ({
    material_id,
    weight: 0,
    min: qty,
    max: qty,
  })),
}

// --- integrity checks: fail the build instead of seeding a broken economy -----
const errors = []
for (const [chestId, odds] of Object.entries(CHEST_ODDS)) {
  if (!CHESTS.some((chest) => chest.id === chestId)) errors.push(`odds for unknown chest ${chestId}`)
  const total = Object.values(odds).reduce((sum, weight) => sum + weight, 0)
  if (total !== 100) errors.push(`chest ${chestId}: odds sum to ${total}, expected 100`)
}
for (const chest of CHESTS) {
  if (!Number.isInteger(chest.gemPrice) || chest.gemPrice <= 0) {
    errors.push(`chest ${chest.id}: gem price must be a positive integer`)
  }
}
if (errors.length) {
  console.error(`seed build failed:\n - ${errors.join('\n - ')}`)
  process.exit(1)
}

// --- render -------------------------------------------------------------------
const lines = []
const push = (...rows) => lines.push(...rows)

push(
  '-- GENERATED FILE — do not edit by hand.',
  '-- Rebuild with: npm run seed:build',
  '-- Sources: src/game/formulas.ts',
  '-- Cards and dungeons are deliberately NOT seeded — they ship via the importers.',
  '-- The one exception is the tutorial dungeon, which is onboarding scaffolding, not content.',
  '',
  'begin;',
  '',
)

push(
  '-- rank_meta',
  'insert into public.rank_meta (rank, atk_base, def_ratio, rank_mult, level_cap, atk_growth, levelup_gold_base, levelup_gold_exp, dupe_shard_material, dupe_shard_qty) values',
  Object.entries(RANK_META)
    .map(([rank, meta]) => {
      return `  (${rank}, ${meta.atkBase}, ${meta.defRatio.toFixed(3)}, ${meta.rankMult.toFixed(2)}, ${meta.levelCap}, ${ATK_GROWTH.toFixed(4)}, ${LEVELUP_BASE.toFixed(2)}, ${LEVELUP_EXP.toFixed(2)}, ${sql(SHARD_BY_RANK[rank])}, ${meta.dupeShards})`
    })
    .join(',\n'),
  'on conflict (rank) do update set',
  '  atk_base = excluded.atk_base,',
  '  def_ratio = excluded.def_ratio,',
  '  rank_mult = excluded.rank_mult,',
  '  level_cap = excluded.level_cap,',
  '  atk_growth = excluded.atk_growth,',
  '  levelup_gold_base = excluded.levelup_gold_base,',
  '  levelup_gold_exp = excluded.levelup_gold_exp,',
  '  dupe_shard_material = excluded.dupe_shard_material,',
  '  dupe_shard_qty = excluded.dupe_shard_qty;',
  '',
)

push(
  '-- materials',
  'insert into public.materials (id, name, kind, rarity, tier, icon) values',
  MATERIALS.map(
    (material) =>
      `  (${sql(material.id)}, ${sql(material.name)}, ${sql(material.kind)}, ${
        material.rarity === null ? 'null' : material.rarity
      }, ${material.tier}, null)`,
  ).join(',\n'),
  'on conflict (id) do update set',
  '  name = excluded.name, kind = excluded.kind, rarity = excluded.rarity, tier = excluded.tier;',
  '',
)

push(
  '-- chests',
  'insert into public.chests (id, name, tier, source, gem_price) values',
  CHESTS.map(
    (chest) =>
      `  (${sql(chest.id)}, ${sql(chest.name)}, ${chest.tier}, ${sql(chest.source)}, ${chest.gemPrice})`,
  ).join(',\n'),
  'on conflict (id) do update set name = excluded.name, tier = excluded.tier, source = excluded.source, gem_price = excluded.gem_price;',
  '',
)

push('-- chest_odds (percent weights, summing to 100 per chest)')
push('insert into public.chest_odds (chest_id, rank, weight) values')
const oddRows = []
for (const [chestId, odds] of Object.entries(CHEST_ODDS)) {
  for (const [rank, weight] of Object.entries(odds)) {
    oddRows.push(`  (${sql(chestId)}, ${rank}, ${weight})`)
  }
}
push(oddRows.join(',\n'), 'on conflict (chest_id, rank) do update set weight = excluded.weight;', '')

push(
  '-- run slot unlocks (the pacing lever)',
  'insert into public.run_slot_unlocks (player_level, slots) values',
  RUN_SLOT_UNLOCKS.map((unlock) => `  (${unlock.playerLevel}, ${unlock.slots})`).join(',\n'),
  'on conflict (player_level) do update set slots = excluded.slots;',
  '',
)

push(
  '-- the one-time tutorial run (onboarding scaffolding, not catalog content)',
  '-- its fixed payout is the ladder\'s 1→2 step for every Core family, so the guided rank-up is affordable',
  'insert into public.dungeons (id, name, kind, tier, rank, tags, req_power, duration_seconds, gold_base, materials, unlocks_at_level, chest_on_clear, is_tutorial) values',
  `  (${sql(TUTORIAL_DUNGEON.id)}, ${sql(TUTORIAL_DUNGEON.name)}, 'resource', 1, ` +
    `${TUTORIAL_DUNGEON.rank}, ${sqlArray(TUTORIAL_DUNGEON.tags)}, 1, ${TUTORIAL_DUNGEON.duration}, ` +
    `${TUTORIAL_DUNGEON.gold}, ${sqlJson(TUTORIAL_DUNGEON.materials)}, 1, null, true)`,
  'on conflict (id) do update set',
  '  tags = excluded.tags, duration_seconds = excluded.duration_seconds,',
  '  gold_base = excluded.gold_base, materials = excluded.materials, is_tutorial = excluded.is_tutorial;',
  '',
)

push('commit;', '')
push(
  "-- local development account's starter cards and party",
  "select public.provision_starter_loadout('00000000-0000-0000-0000-000000000002'::uuid);",
  '',
  `-- summary: ${MATERIALS.length} materials, ${CHESTS.length} chests, ${oddRows.length} chest odds rows, ${RUN_SLOT_UNLOCKS.length} run-slot rows, 1 tutorial dungeon`,
  '-- no cards and no catalog dungeons: content ships via npm run cards:4:import / dungeons:1:import',
)

writeFileSync(join(root, 'supabase/seed.sql'), `${lines.join('\n')}\n`)
console.log(
  `seed.sql written — ${MATERIALS.length} materials, ${CHESTS.length} chests, ${oddRows.length} odds rows, 1 tutorial dungeon (no cards, no catalog dungeons)`,
)
