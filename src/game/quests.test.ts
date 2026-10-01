import { describe, expect, it } from 'vitest'

import { readFileSync } from 'node:fs'

import { allCoreIds } from './formulas'
import {
  QUESTS,
  loadBestiary,
  loadQuests,
  toEnemies,
  type ChainFile,
  type ChainQuest,
} from './quests'

/** The bestiary the starter quests fight against, and the one these loader tests poke at. */
const STARTER_BESTIARY = loadBestiary('enemies.csv')

/** A minimal authored quest, so the loader's per-line handling can be exercised on its own. */
function chainQuest(over: Partial<ChainQuest>): ChainQuest {
  return {
    id: 'test_quest',
    order: 99,
    name: 'Test Quest',
    power: 80,
    enemies: [{ cardId: 'thunder-wolf' }],
    reward: { gold: 1, materials: { lesser_grass_core: 1 } },
    firstClear: { gold: 1, materials: { lesser_grass_core: 1 } },
    intro: [{ speaker: 'Tester', text: 'Ready?' }],
    outro: [{ speaker: 'Tester', text: 'Done.' }],
    ...over,
  }
}

describe('quest content', () => {
  it('has unique ids and orders', () => {
    expect(new Set(QUESTS.map((quest) => quest.id)).size).toBe(QUESTS.length)
    expect(new Set(QUESTS.map((quest) => quest.order)).size).toBe(QUESTS.length)
  })

  it('gives every quest a 1..5 enemy party with sane stats', () => {
    for (const quest of QUESTS) {
      expect(quest.enemies.length, quest.id).toBeGreaterThanOrEqual(1)
      expect(quest.enemies.length, quest.id).toBeLessThanOrEqual(5)
      expect(new Set(quest.enemies.map((enemy) => enemy.id)).size, quest.id).toBe(
        quest.enemies.length,
      )
      for (const enemy of quest.enemies) {
        // an opponent is a real catalog card (for its art), with its own authored stats
        expect(enemy.cardId, `${quest.id}/${enemy.id}`).toBeTruthy()
        expect(enemy.hp, `${quest.id}/${enemy.id}`).toBeGreaterThan(0)
        expect(enemy.atk, `${quest.id}/${enemy.id}`).toBeGreaterThan(0)
        expect(enemy.def, `${quest.id}/${enemy.id}`).toBeGreaterThanOrEqual(0)
        expect(enemy.spd, `${quest.id}/${enemy.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('pays a reward, and a first-clear bonus, from the real material catalog', () => {
    const known = new Set(allCoreIds())
    for (const quest of QUESTS) {
      expect(quest.gold, quest.id).toBeGreaterThan(0)
      expect(quest.firstClearGold, quest.id).toBeGreaterThan(0)
      for (const materials of [quest.materials, quest.firstClearMaterials]) {
        for (const [materialId, qty] of Object.entries(materials)) {
          expect(known.has(materialId), `${quest.id} → ${materialId}`).toBe(true)
          expect(qty).toBeGreaterThan(0)
        }
      }
    }
  })

  it('scripts an intro and an outro for the visual-novel beats', () => {
    for (const quest of QUESTS) {
      expect(quest.intro.length, quest.id).toBeGreaterThan(0)
      expect(quest.outro.length, quest.id).toBeGreaterThan(0)
    }
  })

  it('takes an opponent\'s stats from the bestiary, not from the encounter', () => {
    expect(QUESTS[0].enemies[0]).toMatchObject({
      cardId: 'thunder-wolf',
      hp: 60,
      atk: 10,
      def: 2,
      spd: 12,
    })
  })

  it('expands a `count` into identical combatants with unique keys', () => {
    const enemies = toEnemies(
      chainQuest({ enemies: [{ cardId: 'thunder-wolf', count: 3 }] }),
      STARTER_BESTIARY,
    )

    expect(enemies.map((enemy) => enemy.id)).toEqual([
      'thunder-wolf#1',
      'thunder-wolf#2',
      'thunder-wolf#3',
    ])
    for (const enemy of enemies) {
      expect(enemy).toMatchObject({ cardId: 'thunder-wolf', hp: 60, atk: 10, def: 2, spd: 12 })
    }
  })

  it('lets a line sit off its bestiary row when an encounter wants it to', () => {
    const [elite] = toEnemies(
      chainQuest({ enemies: [{ cardId: 'thunder-wolf', threat: 2 }] }),
      STARTER_BESTIARY,
    )

    // every stat doubles but SPD, which is a turn rate rather than a size
    expect(elite).toMatchObject({ id: 'thunder-wolf', hp: 120, atk: 20, def: 4, spd: 12 })
  })

  it('fails loudly when an enemy names a monster the bestiary does not have', () => {
    expect(() =>
      toEnemies(chainQuest({ enemies: [{ cardId: 'not_a_monster' }] }), STARTER_BESTIARY),
    ).toThrow(/no bestiary row/)
  })
})

/**
 * The 100-quest chain: `data/the-long-dark.quests.json` plus its own `data/the-long-dark.enemies.csv`,
 * both written from `docs/quest-chain.md` by `npm run quests:1:extract`. It is not loaded by the
 * importer yet, so it gets its own test rather than riding on `QUESTS` — but it has to satisfy
 * every invariant the importer will impose the day it is wired up.
 */
describe('the long dark quest chain', () => {
  const file = JSON.parse(
    readFileSync(new URL('../../data/the-long-dark.quests.json', import.meta.url), 'utf8'),
  ) as ChainFile
  const chain = loadQuests('the-long-dark.quests.json')

  it('is ten acts of ten quests, in a unique order', () => {
    expect(file.acts).toHaveLength(10)
    expect(chain).toHaveLength(100)
    expect(new Set(chain.map((quest) => quest.order)).size).toBe(100)
    expect(new Set(chain.map((quest) => quest.id)).size).toBe(100)
  })

  it('files every quest under an act of the file, and uses every act', () => {
    const acts = new Set((file.acts ?? []).map((act) => act.id))
    for (const quest of file.quests) {
      expect(acts.has(quest.act ?? ''), quest.id).toBe(true)
    }
    expect(new Set(file.quests.map((quest) => quest.act)).size).toBe(acts.size)
  })

  it('fields 1..5 combatants, every one a monster its own bestiary has', () => {
    // `loadQuests` throws on an unknown cardId, so the file resolving IS the referential check;
    // here we only pin the shape of each fight.
    for (const quest of chain) {
      expect(quest.enemies.length, quest.id).toBeGreaterThanOrEqual(1)
      expect(quest.enemies.length, quest.id).toBeLessThanOrEqual(5)
      expect(new Set(quest.enemies.map((enemy) => enemy.id)).size, quest.id).toBe(
        quest.enemies.length,
      )
      for (const enemy of quest.enemies) {
        expect(enemy.hp, `${quest.id}/${enemy.id}`).toBeGreaterThan(0)
        expect(enemy.atk, `${quest.id}/${enemy.id}`).toBeGreaterThan(0)
        expect(enemy.spd, `${quest.id}/${enemy.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('takes its monster stats from its own bestiary', () => {
    // quest 1's Sporeling, exactly as the doc writes it
    expect(chain[0].enemies[0]).toMatchObject({
      cardId: 'sporeling',
      hp: 24,
      atk: 4,
      def: 2,
      spd: 14,
    })
  })

  it("carries the doc's Hook for every quest, as the seed for its intro", () => {
    for (const quest of file.quests) {
      expect(quest.hook, quest.id).toBeTruthy()
    }
    expect(file.quests[0].hook).toBe(
      'Gather a basket of mushrooms from the cave mouth before supper. What could possibly go wrong?',
    )
  })

  it('pays gold and Cores from the real catalog, on every clear and on the first', () => {
    const known = new Set(allCoreIds())
    for (const quest of chain) {
      expect(quest.reqPower, quest.id).toBeGreaterThan(0)
      expect(quest.gold, quest.id).toBeGreaterThan(0)
      expect(quest.firstClearGold, quest.id).toBeGreaterThan(0)
      for (const materials of [quest.materials, quest.firstClearMaterials]) {
        for (const [materialId, qty] of Object.entries(materials)) {
          expect(known.has(materialId), `${quest.id} → ${materialId}`).toBe(true)
          expect(qty).toBeGreaterThan(0)
        }
      }
    }
  })

  it('scripts an intro and an outro for every quest', () => {
    // The chain ships through its own importer (`npm run quests:2:import`), which skips a quest
    // with either side empty — a bare Hook line would silently drop that quest from the catalog.
    for (const quest of chain) {
      expect(quest.intro.length, quest.id).toBeGreaterThan(0)
      expect(quest.outro.length, quest.id).toBeGreaterThan(0)
      for (const line of [...quest.intro, ...quest.outro]) {
        expect(line.speaker.trim(), quest.id).not.toBe('')
        expect(line.text.trim(), quest.id).not.toBe('')
      }
    }
  })
})
