/**
 * Generates supabase/seed.sql from the balance constants in src/game/formulas.ts.
 *
 * The seed owns the *economy scaffolding* and nothing else: rank metadata, the material
 * catalog, chests, chest odds and run-slot pacing. It deliberately seeds NO cards and NO
 * dungeons — those are catalog content, and they ship through the importers
 * (`npm run cards:4:import` reads data/cards.csv + data/cards/<id>.png; dungeons:1:import reads
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
  CHEST_ODDS,
  CORE_TAGS,
  CORE_VARIANT_LABELS,
  CORE_VARIANTS,
  LEVELUP_GOLD_BASE,
  LEVELUP_GOLD_EXP,
  RANK_META,
  RUN_SLOT_UNLOCKS,
  tagCoreId,
  tagLabel,
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

const CHESTS = [
  { id: 'common', name: 'Common Chest', tier: 1, source: 'daily login, T1 clears' },
  { id: 'rare', name: 'Rare Chest', tier: 2, source: 'T2 clears, login streak' },
  { id: 'epic', name: 'Epic Chest', tier: 3, source: 'T3 clears, achievements' },
  { id: 'legendary', name: 'Legendary Chest', tier: 4, source: 'boss clears, events (v1.1)' },
  { id: 'mythic', name: 'Mythic Chest', tier: 5, source: 'boss clears' },
]

const sql = (value) => `'${String(value).replace(/'/g, "''")}'`

// --- integrity checks: fail the build instead of seeding a broken economy -----
const errors = []
for (const [chestId, odds] of Object.entries(CHEST_ODDS)) {
  if (!CHESTS.some((chest) => chest.id === chestId)) errors.push(`odds for unknown chest ${chestId}`)
  const total = Object.values(odds).reduce((sum, weight) => sum + weight, 0)
  if (total !== 100) errors.push(`chest ${chestId}: odds sum to ${total}, expected 100`)
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
  'insert into public.chests (id, name, tier, source) values',
  CHESTS.map((chest) => `  (${sql(chest.id)}, ${sql(chest.name)}, ${chest.tier}, ${sql(chest.source)})`).join(
    ',\n',
  ),
  'on conflict (id) do update set name = excluded.name, tier = excluded.tier, source = excluded.source;',
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

push('commit;', '')
push(
  "-- local development account's starter cards and party",
  "select public.provision_starter_loadout('00000000-0000-0000-0000-000000000002'::uuid);",
  '',
  `-- summary: ${MATERIALS.length} materials, ${CHESTS.length} chests, ${oddRows.length} chest odds rows, ${RUN_SLOT_UNLOCKS.length} run-slot rows`,
  '-- no cards and no dungeons: catalog content ships via npm run cards:4:import / dungeons:1:import',
)

writeFileSync(join(root, 'supabase/seed.sql'), `${lines.join('\n')}\n`)
console.log(
  `seed.sql written — ${MATERIALS.length} materials, ${CHESTS.length} chests, ${oddRows.length} odds rows (no cards, no dungeons)`,
)
