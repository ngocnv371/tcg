import { describe, expect, it } from 'vitest'

import { allCoreIds } from './formulas'
import { QUESTS } from './quests'

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
})
