/**
 * Quest content: the loader that joins the authored chain to the bestiary.
 *
 * Two `data/` files are the single source of truth for a quest, and neither is code:
 *
 * - `data/quest-chain.json` — the encounters: ids, order, power, enemy line-up, rewards and
 *   the visual-novel script. `data/quest-chain.schema.json` is its contract.
 * - `data/enemies.csv` — the bestiary: each opponent's base stats, tags and lore.
 *
 * A quest names an opponent by its bestiary id and never restates its numbers, so re-using a
 * monster in a later quest is one JSON line instead of a copied stat block. The encounter
 * tunes difficulty with a threat rating that scales those base stats (`scaleEnemyStats`),
 * which is also how an "elite" is expressed.
 *
 * The result is NOT seeded — like cards and dungeons, quests are catalog content and will ship
 * through their own importer (the server is what pays a clear, so the importer must write the
 * reward row `complete_quest` reads). Once imported, the client reads those rows back, so a
 * card preview and a payout can never disagree.
 *
 * This module reads files, so it is BUILD-TIME ONLY: the client uses `useQuests`, which reads
 * the seeded rows. Never import it from a screen or anything else Vite bundles.
 */
import { readFileSync } from 'node:fs'

import { DEFAULT_THREAT, scaleEnemyStats, type EnemyStats } from './formulas.ts'

export type QuestEnemy = {
  /**
   * Stable per-battle key, derived from the bestiary id: the bare id when the encounter fields
   * one copy, and `id#n` for the nth of several. `battle.ts` keys a combatant by id, so these
   * must be unique within a quest.
   */
  id: string
  /**
   * The catalog card this opponent is: its art (and its display name, when the catalog has been
   * imported) come from the `cards` row, so an opponent looks exactly like a card elsewhere.
   */
  cardId: string
  /** Fallback name for a database whose catalog has not been imported yet. */
  name: string
  /**
   * The opponent's stats, straight from its bestiary row (bar a line's own `threat` override).
   * The encounter never restates them, so a quest's difficulty cannot drift when the card
   * catalog changes.
   */
  hp: number
  atk: number
  def: number
  spd: number
}

export type QuestLine = {
  speaker: string
  text: string
}

export type Quest = {
  id: string
  name: string
  /** Display order (also `quests.sort_order`). */
  order: number
  /** Advisory only: what the card shows as "recommended power". Not enforced by the server. */
  reqPower: number
  enemies: QuestEnemy[]
  /** Repeating reward, paid on every clear. */
  gold: number
  materials: Record<string, number>
  /** One-time bonus, paid only on the first clear. */
  firstClearGold: number
  firstClearMaterials: Record<string, number>
  intro: QuestLine[]
  outro: QuestLine[]
}

/** Where the authored chain and its bestiary live, resolved from this module rather than the cwd. */
const DATA_DIR = new URL('../../data/', import.meta.url)

/** One authored enemy line: which monster, how many copies, and how hard this encounter's are. */
export type ChainEnemy = {
  cardId: string
  count?: number
  /** Sits this line off the bestiary — a difficulty spike, or an elite. */
  threat?: number
  /** The design doc's elite marker. Records intent; the loader ignores it. */
  elite?: boolean
  name?: string
}

type ChainReward = { gold: number; materials: Record<string, number> }

/** One authored encounter. Mirrors `data/quest-chain.schema.json`. */
export type ChainQuest = {
  id: string
  order: number
  name: string
  /** Id of an entry in the file's `acts`. */
  act?: string
  /** Act-finale marker. Presentation only. */
  boss?: boolean
  /** Advisory recommended power, shown on the quest card. It does not scale the enemies. */
  power: number
  /** The design doc's one-line Hook: what the `intro` grows from. The loader does not need it. */
  hook?: string
  enemies: ChainEnemy[]
  reward: ChainReward
  firstClear: ChainReward
  /** Absent while a quest's script is still a Hook line in the design doc. */
  intro?: QuestLine[]
  outro?: QuestLine[]
}

/** One act of the chain: the design doc's "acts at a glance", as data. */
export type ChainAct = {
  id: string
  name: string
  tags: string[]
  coreGrade: string
}

/** A quest file — `data/quest-chain.json`, or the chain's `data/the-long-dark.quests.json`. */
export type ChainFile = {
  version: number
  /** The bestiary in `data/` this file's opponents come from. Defaults to `enemies.csv`. */
  bestiary?: string
  acts?: ChainAct[]
  quests: ChainQuest[]
}

/** A bestiary row: a monster's stat line, exactly as its CSV authors it. */
export type BestiaryRow = EnemyStats & { id: string; name: string; tags: string[] }

/**
 * Minimal RFC-4180 reader, exported because the quest extractor reads the same files. A bestiary is
 * a spreadsheet first: its lore and design columns are quoted and contain commas, so splitting on
 * ',' would shred the row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char !== '"') field += char
      else if (text[index + 1] === '"') {
        field += '"'
        index += 1
      } else quoted = false
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }

  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** One bestiary file in `data/`, keyed by monster id. */
export function loadBestiary(file: string): Map<string, BestiaryRow> {
  const [header, ...rows] = parseCsv(readFileSync(new URL(file, DATA_DIR), 'utf8'))
  const column = (cells: string[], name: string) => cells[header.indexOf(name)] ?? ''

  return new Map(
    rows.map((cells) => {
      const row: BestiaryRow = {
        id: column(cells, 'id'),
        name: column(cells, 'name'),
        hp: Number(column(cells, 'hp')),
        atk: Number(column(cells, 'atk')),
        def: Number(column(cells, 'def')),
        spd: Number(column(cells, 'spd')),
        tags: column(cells, 'tags').split(';').filter(Boolean),
      }
      return [row.id, row]
    }),
  )
}

/**
 * `count` identical copies become that many combatants, because `battle.ts` keys a combatant by
 * id and the content test requires those ids to be unique within a quest.
 */
export function toEnemies(quest: ChainQuest, bestiary: Map<string, BestiaryRow>): QuestEnemy[] {
  const enemies: QuestEnemy[] = []

  for (const line of quest.enemies) {
    const monster = bestiary.get(line.cardId)
    // Fail loudly rather than skip: a quest that seeded a fight it does not describe is worse
    // than a build that stops.
    if (!monster) throw new Error(`quest ${quest.id}: no bestiary row for "${line.cardId}"`)

    const stats = scaleEnemyStats(monster, line.threat ?? DEFAULT_THREAT)
    const count = Math.max(1, Math.trunc(line.count ?? 1))

    for (let copy = 1; copy <= count; copy += 1) {
      enemies.push({
        id: count === 1 ? monster.id : `${monster.id}#${copy}`,
        cardId: monster.id,
        name: line.name ?? monster.name,
        ...stats,
      })
    }
  }

  return enemies
}

function toQuest(quest: ChainQuest, bestiary: Map<string, BestiaryRow>): Quest {
  return {
    id: quest.id,
    name: quest.name,
    order: quest.order,
    reqPower: quest.power,
    enemies: toEnemies(quest, bestiary),
    gold: quest.reward.gold,
    materials: quest.reward.materials,
    firstClearGold: quest.firstClear.gold,
    firstClearMaterials: quest.firstClear.materials,
    intro: quest.intro ?? [],
    outro: quest.outro ?? [],
  }
}

/** The bestiary a quest file uses when it does not name one. */
const DEFAULT_BESTIARY = 'enemies.csv'

/** Load one authored quest file, in `order`, with every opponent resolved against its bestiary. */
export function loadQuests(file: string): Quest[] {
  const chain = JSON.parse(readFileSync(new URL(file, DATA_DIR), 'utf8')) as ChainFile
  const bestiary = loadBestiary(chain.bestiary ?? DEFAULT_BESTIARY)

  return [...chain.quests].sort((a, b) => a.order - b.order).map((quest) => toQuest(quest, bestiary))
}

/**
 * The file `QUESTS` loads: the three starter quests, fought against the six starter opponents in
 * `data/enemies.csv`. The 100-quest chain is a pair of its own files —
 * `data/the-long-dark.quests.json` + `data/the-long-dark.enemies.csv` — and is checked by the
 * content test, but not loaded here yet: it ships through its own importer, and its
 * `intro`/`outro` scripts are authored in the JSON (the extractor carries them across).
 */
const STARTER_QUEST_FILE = 'quest-chain.json'

/** The authored starter chain, in `order`, with every opponent resolved against the bestiary. */
export const QUESTS: Quest[] = loadQuests(STARTER_QUEST_FILE)
