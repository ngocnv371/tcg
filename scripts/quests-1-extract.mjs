#!/usr/bin/env node
/**
 * quests-1-extract — the one-way bridge from the planning doc to the authored chain.
 *
 * `docs/quest-chain.md` is where the chain is designed and written (act structure, hook lines,
 * lore, the number formulas). `data/the-long-dark.quests.json` is what the loader reads. This
 * script re-emits the encounters from one into the other, so the 100 quests never have to be
 * retyped by hand, and it can be re-run at will.
 *
 * It carries each monster's name, lore and stats straight out of the doc into
 * `data/the-long-dark.enemies.csv` — no scaling, no re-derivation: the numbers below are the
 * numbers. Only a monster's `design` (its art prompt) and `tags` are not in the doc, so those are
 * carried across from the bestiary file. Re-run it after editing any roster, stat or reward.
 *
 * It also carries each quest's Hook line across as `hook`: the one-line seed its `intro` grows from.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CORE_TAGS, CORE_VARIANT_LABELS, allCoreIds, tagCoreId, tagLabel } from '../src/game/formulas.ts'
import { parseCsv } from '../src/game/quests.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = join(root, 'docs/quest-chain.md')
const BESTIARY = join(root, 'data/enemies.csv')
const OUT = join(root, 'data/the-long-dark.quests.json')
const OUT_ENEMIES = join(root, 'data/the-long-dark.enemies.csv')
const CSV_HEADER = 'id,name,hp,atk,def,spd,lore,tags,design,type'

/** The label printed in the doc → the id the code uses. */
const GRADE_BY_LABEL = new Map(
  Object.entries(CORE_VARIANT_LABELS).map(([grade, label]) => [label, grade]),
)
const TAG_BY_LABEL = new Map(CORE_TAGS.map((tag) => [tagLabel(tag), tag]))

/** Same rule the other importers use, so `The Dragon's Spine` becomes `the_dragons_spine`. */
function slug(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const ACT_HEADING = /^## Act ([IVX]+) — (.+)$/
const ACT_SUBTITLE = /^\*Element tags: (.+?) · Core grade: (.+?) · Quests (\d+)–(\d+)\*$/
const QUEST_HEADING = /^### (\d+)\. (.+?)\s*$/
const QUEST_META = /^- \*\*id:\*\* `([a-z0-9_]+)` · \*\*power:\*\* ([\d,]+)( · \*\*act boss\*\*)?$/
const HOOK_LINE = /^- \*\*Hook \(intro seed\):\*\* (.+)$/
const ENEMY_LINE =
  /^  - (?:(\d+)x )?\*\*(.+?)\*\* `([a-z0-9_]+)`( \*\(elite\)\*)? — hp (\d+) \/ atk (\d+) \/ def (\d+) \/ spd (\d+)$/
const REWARD_LINE = /^- \*\*Reward \(per clear\):\*\* (.+)$/
const FIRST_CLEAR_LINE = /^- \*\*First clear:\*\* (.+)$/
const LORE_LINE = /^    - \*(.+)\*$/
const CORE_IN_REWARD = /([A-Z][a-z]+) ([A-Z][a-z]+) Core ×(\d+)/g

/** `150 gold · Lesser Grass Core ×1` → `{ gold, materials }`, read the same way for both rewards. */
function parseReward(text, where, label) {
  const gold = /^\+?([\d,]+) gold/.exec(text)
  if (!gold) throw new Error(`${where}: ${label} has no gold amount — "${text}"`)

  const materials = {}
  for (const [, gradeLabel, tagName, qty] of text.matchAll(CORE_IN_REWARD)) {
    const grade = GRADE_BY_LABEL.get(gradeLabel)
    const tag = TAG_BY_LABEL.get(tagName)
    if (!grade || !tag) throw new Error(`${where}: ${label} names an unknown Core — "${gradeLabel} ${tagName}"`)
    materials[tagCoreId(tag, grade)] = Number(qty)
  }
  if (!Object.keys(materials).length) {
    throw new Error(`${where}: ${label} pays no Core — "${text}"`)
  }

  return { gold: Number(gold[1].replace(/,/g, '')), materials }
}

const acts = []
const quests = []
/** Every monster the chain fields, keyed by id, holding the FIRST quest's numbers for it. */
const monsters = new Map()
let act = null
let quest = null
let pendingLore = null

for (const line of readFileSync(DOC, 'utf8').split('\n')) {
  const actHeading = ACT_HEADING.exec(line)
  if (actHeading) {
    act = { id: slug(actHeading[2]), name: actHeading[2], tags: [], coreGrade: '' }
    acts.push(act)
    continue
  }

  const actSubtitle = ACT_SUBTITLE.exec(line)
  if (actSubtitle) {
    if (!act) throw new Error(`an act subtitle appears before any act heading — "${line}"`)
    act.tags = actSubtitle[1].split(' / ').map((name) => {
      const tag = TAG_BY_LABEL.get(name)
      if (!tag) throw new Error(`act ${act.id}: unknown element tag "${name}"`)
      return tag
    })
    act.coreGrade = GRADE_BY_LABEL.get(actSubtitle[2]) ?? ''
    if (!act.coreGrade) throw new Error(`act ${act.id}: unknown Core grade "${actSubtitle[2]}"`)
    continue
  }

  const questHeading = QUEST_HEADING.exec(line)
  if (questHeading) {
    if (!act) throw new Error(`quest ${questHeading[1]} appears before any act heading`)
    quest = { id: '', order: Number(questHeading[1]), name: questHeading[2], act: act.id }
    quests.push(quest)
    continue
  }

  if (!quest) continue

  const meta = QUEST_META.exec(line)
  if (meta) {
    quest.id = meta[1]
    quest.power = Number(meta[2].replace(/,/g, ''))
    if (meta[3]) quest.boss = true
    // Filled by the Hook line that follows, and seeded here so the key sits above the roster.
    quest.hook = ''
    quest.enemies = []
    continue
  }

  const hook = HOOK_LINE.exec(line)
  if (hook) {
    quest.hook = hook[1]
    continue
  }

  const enemy = ENEMY_LINE.exec(line)
  if (enemy) {
    const line_ = { cardId: enemy[3] }
    if (enemy[1]) line_.count = Number(enemy[1])
    if (enemy[4]) line_.elite = true
    quest.enemies.push(line_)

    // A monster is authored once: the first quest that fields it is the one whose numbers its
    // bestiary row keeps, so re-using it later needs no second stat line.
    if (!monsters.has(enemy[3])) {
      monsters.set(enemy[3], {
        id: enemy[3],
        name: enemy[2],
        hp: Number(enemy[5]),
        atk: Number(enemy[6]),
        def: Number(enemy[7]),
        spd: Number(enemy[8]),
        lore: '',
      })
    }
    pendingLore = enemy[3]
    continue
  }

  const lore = LORE_LINE.exec(line)
  if (lore) {
    const monster = pendingLore ? monsters.get(pendingLore) : undefined
    if (monster && !monster.lore) monster.lore = lore[1]
    pendingLore = null
    continue
  }

  const reward = REWARD_LINE.exec(line)
  if (reward) {
    quest.reward = parseReward(reward[1], `quest ${quest.order}`, 'reward')
    continue
  }

  const firstClear = FIRST_CLEAR_LINE.exec(line)
  if (firstClear) {
    quest.firstClear = parseReward(firstClear[1], `quest ${quest.order}`, 'first clear')
  }
}

// --- checks ---------------------------------------------------------------------------------
// Everything below is a hard stop: the JSON is what the loader and the content test read, so a
// half-parsed doc must never reach it.

const bestiary = new Set(monsters.keys())
const cores = new Set(allCoreIds())

if (quests.length !== 100) throw new Error(`expected 100 quests, parsed ${quests.length}`)
if (new Set(quests.map((q) => q.id)).size !== quests.length) throw new Error('duplicate quest ids')
if (new Set(quests.map((q) => q.order)).size !== quests.length) throw new Error('duplicate quest orders')
if (acts.length !== 10) throw new Error(`expected 10 acts, parsed ${acts.length}`)
if (new Set(acts.map((a) => a.id)).size !== acts.length) throw new Error('duplicate act ids')

const actIds = new Set(acts.map((a) => a.id))
let lines = 0
let copies = 0
let elites = 0

for (const quest of quests) {
  const where = `quest ${quest.order} (${quest.id})`
  if (!quest.id) throw new Error(`${where}: no id line`)
  if (!actIds.has(quest.act)) throw new Error(`${where}: unknown act "${quest.act}"`)
  if (!Number.isInteger(quest.power) || quest.power < 1) throw new Error(`${where}: bad power`)
  if (!quest.hook) throw new Error(`${where}: no Hook line`)
  if (!quest.enemies?.length) throw new Error(`${where}: no enemies`)
  if (!quest.reward || !quest.firstClear) throw new Error(`${where}: a reward is missing`)

  for (const [name, reward] of [['reward', quest.reward], ['first clear', quest.firstClear]]) {
    if (reward.gold < 1) throw new Error(`${where}: ${name} pays no gold`)
    for (const id of Object.keys(reward.materials)) {
      if (!cores.has(id)) throw new Error(`${where}: ${name} pays a non-Core "${id}"`)
    }
  }

  const combatants = quest.enemies.reduce((total, enemy) => total + (enemy.count ?? 1), 0)
  if (combatants < 1 || combatants > 5) {
    throw new Error(`${where}: ${combatants} combatants, and a quest fields 1..5`)
  }

  for (const enemy of quest.enemies) {
    if (!bestiary.has(enemy.cardId)) {
      throw new Error(`${where}: "${enemy.cardId}" appears in no enemy list`)
    }
    lines += 1
    copies += enemy.count ?? 1
    if (enemy.elite) elites += 1
  }
}

// --- the chain's own bestiary -----------------------------------------------------------------
// The doc is the source for every monster's name, lore and stats. `design` (the art prompt) is not
// in the doc, so it is carried across from the chain's own file once that exists — and read from
// the shared bestiary on the very first run, to bootstrap.
const metaSource = [OUT_ENEMIES, BESTIARY].find((file) => existsSync(file))
const meta = new Map(
  parseCsv(readFileSync(metaSource, 'utf8'))
    .slice(1)
    .map((cells) => [
      cells[0],
      { tags: cells[7] ?? '', design: cells[8] ?? '', type: cells[9] || 'card' },
    ]),
)

for (const monster of monsters.values()) {
  if (!monster.lore) throw new Error(`${monster.id} has no lore line in the doc`)
  if (!meta.get(monster.id)?.design) {
    throw new Error(`${monster.id} has no design prompt in ${metaSource}`)
  }
}

// --- the quest scripts ------------------------------------------------------------------------
// The visual-novel dialogue is authored in the chain's own file, not in the doc, so it is carried
// across by quest id — the same way each monster's `design`/`tags` are. A doc edit rewrites the
// encounters; it must not wipe 100 quests of `intro`/`outro`. The script is what the importer
// requires before it will ship a quest, so losing it silently would empty the catalog.
if (existsSync(OUT)) {
  const previous = new Map(
    JSON.parse(readFileSync(OUT, 'utf8')).quests.map((quest) => [quest.id, quest]),
  )
  for (const quest of quests) {
    const prior = previous.get(quest.id)
    if (prior?.intro) quest.intro = prior.intro
    if (prior?.outro) quest.outro = prior.outro
  }
}

/** Quote a cell only when it has to be, which is how the other bestiaries read. */
const cell = (value) => (/[",\n]/.test(value) ? `"${String(value).replace(/"/g, '""')}"` : String(value))

writeFileSync(
  OUT_ENEMIES,
  `${[
    CSV_HEADER,
    ...[...monsters.values()].map((monster) => {
      const extra = meta.get(monster.id)
      return [
        monster.id,
        monster.name,
        monster.hp,
        monster.atk,
        monster.def,
        monster.spd,
        monster.lore,
        extra.tags,
        extra.design,
        extra.type,
      ]
        .map(cell)
        .join(',')
    }),
  ].join('\n')}\n`,
)

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      $schema: './quest-chain.schema.json',
      version: 1,
      bestiary: 'the-long-dark.enemies.csv',
      acts,
      quests,
    },
    null,
    2,
  )}\n`,
)

console.log(
  `the-long-dark.quests.json written — ${acts.length} acts, ${quests.length} quests, ` +
    `${lines} enemy lines (${copies} combatants, ${elites} elites)`,
)
console.log(
  `the-long-dark.enemies.csv written — ${monsters.size} monsters, ` +
    `hp/atk/def/spd exactly as the doc writes them`,
)
console.log(
  `kept: ids, order, names, acts, power, the Hook line, rosters (count/elite), rewards, and every\n` +
    `      enemy's name, lore and stats. Carried over: each monster's \`design\` and \`tags\` (from ${metaSource}),\n` +
    `      and each quest's \`intro\`/\`outro\` dialogue (from ${existsSync(OUT) ? OUT : 'n/a'}).`,
)
