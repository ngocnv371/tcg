/**
 * Generates supabase/seed.sql from data/*.csv plus the balance constants in
 * src/game/formulas.ts. Cards, dungeons and odds are content: edit the CSV (or
 * the constants) and re-run `npm run seed:build` — never hand-edit seed.sql.
 *
 * Usage: node scripts/build-seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ATK_GROWTH_PER_LEVEL,
  CHEST_ODDS,
  LEVELUP_GOLD_BASE,
  LEVELUP_GOLD_EXP,
  RANK_META,
  RUN_SLOT_UNLOCKS,
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

const MATERIALS = [
  { id: 'common_shard', name: 'Common Shard', kind: 'shard', rarity: 1, tier: 1 },
  { id: 'uncommon_shard', name: 'Uncommon Shard', kind: 'shard', rarity: 2, tier: 2 },
  { id: 'rare_shard', name: 'Rare Shard', kind: 'shard', rarity: 3, tier: 3 },
  { id: 'epic_shard', name: 'Epic Shard', kind: 'shard', rarity: 4, tier: 4 },
  { id: 'mythic_shard', name: 'Mythic Shard', kind: 'shard', rarity: 5, tier: 5 },
  { id: 'iron_ore', name: 'Iron Ore', kind: 'ore', rarity: null, tier: 1 },
  { id: 'crystal', name: 'Crystal', kind: 'crystal', rarity: null, tier: 3 },
  { id: 'beast_fang', name: 'Beast Fang', kind: 'essence', rarity: null, tier: 3 },
  { id: 'boss_core', name: 'Boss Core', kind: 'core', rarity: null, tier: 5 },
  { id: 'ember_essence', name: 'Ember Essence', kind: 'essence', rarity: null, tier: 2 },
  { id: 'tide_essence', name: 'Tide Essence', kind: 'essence', rarity: null, tier: 2 },
  { id: 'verdant_essence', name: 'Verdant Essence', kind: 'essence', rarity: null, tier: 2 },
  { id: 'umbral_essence', name: 'Umbral Essence', kind: 'essence', rarity: null, tier: 2 },
  { id: 'radiant_essence', name: 'Radiant Essence', kind: 'essence', rarity: null, tier: 2 },
]
const MATERIAL_IDS = new Set(MATERIALS.map((material) => material.id))

/**
 * Rank-up ladder keyed by the card's CURRENT rank (plan §6.3). `essence` is the
 * placeholder that gets replaced by the card's faction essence, which is what
 * gives every card its own farming route.
 */
const LADDER = {
  1: { gold: 1000, common_shard: 10, iron_ore: 5, essence: 3 },
  2: { gold: 5000, uncommon_shard: 25, iron_ore: 15, beast_fang: 5, essence: 8 },
  3: { gold: 20000, rare_shard: 50, crystal: 20, beast_fang: 10, essence: 15 },
  4: { gold: 80000, epic_shard: 100, crystal: 40, boss_core: 1, essence: 25 },
}

const CHESTS = [
  { id: 'common', name: 'Common Chest', tier: 1, source: 'daily login, T1 clears' },
  { id: 'rare', name: 'Rare Chest', tier: 2, source: 'T2 clears, login streak' },
  { id: 'epic', name: 'Epic Chest', tier: 3, source: 'T3 clears, achievements' },
  { id: 'legendary', name: 'Legendary Chest', tier: 4, source: 'boss clears, events (v1.1)' },
  { id: 'mythic', name: 'Mythic Chest', tier: 5, source: 'boss clears' },
]

/** Minimal RFC-4180-ish CSV reader: quoted fields, doubled quotes, CRLF. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  const populated = rows.filter((line) => line.some((cell) => cell !== ''))
  const [header, ...body] = populated
  return body.map((line) =>
    Object.fromEntries(header.map((key, index) => [key.trim(), (line[index] ?? '').trim()])),
  )
}

const sql = (value) => `'${String(value).replace(/'/g, "''")}'`
const sqlNullable = (value) => (value === '' || value === undefined ? 'null' : sql(value))
const json = (value) => `${sql(JSON.stringify(value))}::jsonb`

const cards = parseCsv(readFileSync(join(root, 'data/cards.csv'), 'utf8'))
const dungeons = parseCsv(readFileSync(join(root, 'data/dungeons.csv'), 'utf8'))

// --- integrity checks: fail the build instead of seeding a broken economy -----
const errors = []
const knownFactions = ['ember', 'tide', 'verdant', 'umbral', 'radiant']
for (const card of cards) {
  if (!RANK_META[Number(card.rank)]) errors.push(`card ${card.id}: unknown rank ${card.rank}`)
  if (!knownFactions.includes(card.faction)) errors.push(`card ${card.id}: unknown faction ${card.faction}`)
  if (!['tank', 'dps', 'support'].includes(card.role)) errors.push(`card ${card.id}: unknown role ${card.role}`)
}
const ids = cards.map((card) => card.id)
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
if (duplicates.length) errors.push(`duplicate card ids: ${duplicates.join(', ')}`)
const byRank = cards.reduce((acc, card) => {
  acc[card.rank] = (acc[card.rank] ?? 0) + 1
  return acc
}, {})
// Cards ship via scripts/import-concept-cards.mjs now; data/cards.csv is deliberately empty.
const dungeonsIds = dungeons.map((dungeon) => dungeon.id)
for (const dungeon of dungeons) {
  if (dungeon.card_id && !ids.includes(dungeon.card_id))
    errors.push(`dungeon ${dungeon.id}: unknown card_id ${dungeon.card_id}`)
  if (!CHESTS.some((chest) => chest.id === dungeon.chest_on_clear))
    errors.push(`dungeon ${dungeon.id}: unknown chest ${dungeon.chest_on_clear}`)
  for (const drop of dungeon.drops.split(';').filter(Boolean)) {
    const [materialId] = drop.split(':')
    if (!MATERIAL_IDS.has(materialId)) errors.push(`dungeon ${dungeon.id}: unknown material ${materialId}`)
  }
}
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
  '-- Sources: data/cards.csv, data/dungeons.csv, src/game/formulas.ts',
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
  '-- cards',
)
if (cards.length) {
  push(
    'insert into public.cards (id, name, rank, faction, role, base_atk, base_def, passive_name, passive_text, lore, tags, art_path, sort_order) values',
    cards
      .map(
        (card, index) =>
          `  (${sql(card.id)}, ${sql(card.name)}, ${card.rank}, ${sql(card.faction)}, ${sql(card.role)}, ${card.base_atk}, ${card.base_def}, ${sql(card.passive_name)}, ${sql(card.passive_text)}, ${sql(card.lore)}, ${sql(`{${(card.tags ?? '').split(';').filter(Boolean).join(',')}}`)}, ${sql(`art/cards/${card.id}.webp`)}, ${index})`,
      )
      .join(',\n'),
    'on conflict (id) do update set',
    '  name = excluded.name, rank = excluded.rank, faction = excluded.faction, role = excluded.role,',
    '  base_atk = excluded.base_atk, base_def = excluded.base_def,',
    '  passive_name = excluded.passive_name, passive_text = excluded.passive_text,',
    '  lore = excluded.lore, tags = excluded.tags, art_path = excluded.art_path, sort_order = excluded.sort_order;',
    '',
  )
}

push('-- card_rank_costs (ladder by current rank + the card faction essence)')
const costRows = []
for (const card of cards) {
  for (let from = Number(card.rank); from < 5; from += 1) {
    const ladderStep = LADDER[from]
    const { essence, gold, ...base } = ladderStep
    const materials = { ...base, [`${card.faction}_essence`]: essence }
    costRows.push(`  (${sql(card.id)}, ${from}, ${from + 1}, ${gold}, ${json(materials)})`)
  }
}
if (costRows.length) {
  push(
    'insert into public.card_rank_costs (card_id, from_rank, to_rank, gold, materials) values',
    costRows.join(',\n'),
    'on conflict (card_id, to_rank) do update set',
    '  from_rank = excluded.from_rank, gold = excluded.gold, materials = excluded.materials;',
    '',
  )
}

push('-- dungeons')
// dungeons.csv is deliberately empty now; dungeon content ships via scripts/import-concept-dungeons.mjs.
if (dungeons.length) {
  push(
    'insert into public.dungeons (id, name, kind, tier, req_power, duration_seconds, gold_base, materials, card_id, unlocks_at_level, chest_on_clear) values',
    dungeons
      .map((dungeon) => {
        const materials = dungeon.drops
          .split(';')
          .filter(Boolean)
          .map((drop) => {
            const [material_id, weight, min, max] = drop.split(':')
            return { material_id, weight: Number(weight), min: Number(min), max: Number(max) }
          })
        return `  (${sql(dungeon.id)}, ${sql(dungeon.name)}, ${sql(dungeon.kind)}, ${dungeon.tier}, ${dungeon.req_power}, ${dungeon.duration_seconds}, ${dungeon.gold_base}, ${json(materials)}, ${sqlNullable(dungeon.card_id)}, ${dungeon.unlocks_at_level}, ${sqlNullable(dungeon.chest_on_clear)})`
      })
      .join(',\n'),
    'on conflict (id) do update set',
    '  name = excluded.name, kind = excluded.kind, tier = excluded.tier,',
    '  req_power = excluded.req_power, duration_seconds = excluded.duration_seconds,',
    '  gold_base = excluded.gold_base, materials = excluded.materials, card_id = excluded.card_id,',
    '  unlocks_at_level = excluded.unlocks_at_level, chest_on_clear = excluded.chest_on_clear;',
    '',
  )
}

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
  `-- summary: ${cards.length} cards (${Object.entries(byRank)
    .map(([rank, count]) => `${rank}star:${count}`)
    .join(' ')}), ${dungeons.length} dungeons, ${CHESTS.length} chests, ${MATERIALS.length} materials`,
  dungeons.length
    ? `-- dungeons: ${dungeonsIds.join(', ')}`
    : '-- dungeons: none seeded — shipped via scripts/import-concept-dungeons.mjs',
  `-- rank-up cost rows: ${costRows.length}, chest odds rows: ${oddRows.length}`,
)

writeFileSync(join(root, 'supabase/seed.sql'), `${lines.join('\n')}\n`)
console.log(
  `seed.sql written — ${cards.length} cards, ${dungeons.length} dungeons, ${MATERIALS.length} materials, ${oddRows.length} odds rows, ${costRows.length} rank-up rows`,
)
