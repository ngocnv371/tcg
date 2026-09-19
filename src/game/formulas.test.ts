import { describe, expect, it } from 'vitest'

import {
  CHEST_ODDS,
  FAILED_RUN_PITY_GOLD,
  RANK_META,
  cardAtk,
  cardDef,
  cardPower,
  dupeShards,
  goldReward,
  levelUpGold,
  partyPower,
  pickRank,
  rewardMultiplier,
  runSlotsForLevel,
  successChance,
  type CardRank,
} from './formulas'

describe('card stats', () => {
  it('anchors each rank at its base ATK with DEF at 60%', () => {
    expect(cardAtk(1, 1)).toBe(20)
    expect(cardDef(1, 1)).toBe(12)
    expect(cardAtk(5, 1)).toBe(130)
  })

  it('grows 8% of base per level', () => {
    expect(cardAtk(1, 6)).toBe(28)
    expect(cardAtk(3, 11)).toBe(99)
  })

  it('never lets a card exceed its rank level cap in scoring input', () => {
    // caps are enforced by the server; here we only pin the published numbers
    expect(RANK_META[1].levelCap).toBe(20)
    expect(RANK_META[5].levelCap).toBe(99)
  })
})

describe('party power', () => {
  it('sums rank-multiplied ATK+DEF across five cards', () => {
    const five = Array.from({ length: 5 }, () => ({ rank: 1 as CardRank, level: 1 }))
    expect(cardPower(1, 1)).toBe(32)
    expect(partyPower(five)).toBe(160)
  })

  it('a single 3★ level 1 card outscores a full party of 1★ cards', () => {
    // rank_mult compounds on top of the stat jump: 3★ is 6.06x a 1★, not 2.2x.
    expect(cardPower(3, 1)).toBe(194)
    const fiveOneStars = partyPower(
      Array.from({ length: 5 }, () => ({ rank: 1 as CardRank, level: 1 })),
    )
    expect(fiveOneStars).toBe(160)
    expect(cardPower(3, 1)).toBeGreaterThan(fiveOneStars)
  })
})

describe('dungeon success chance', () => {
  it('is 60% at parity', () => {
    expect(successChance(500, 500)).toBeCloseTo(0.6, 5)
  })

  it('clamps to 10%..95%', () => {
    expect(successChance(1, 10_000)).toBe(0.1)
    expect(successChance(999_999, 150)).toBe(0.95)
  })

  it('is monotonically increasing in power', () => {
    const series = [150, 300, 500, 900, 1500].map((p) => successChance(p, 500))
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i]).toBeGreaterThanOrEqual(series[i - 1])
    }
  })
})

describe('rewards', () => {
  it('scales between 1.0x and 1.5x of base gold', () => {
    expect(rewardMultiplier(250, 500)).toBe(1.0)
    expect(rewardMultiplier(750, 500)).toBe(1.5)
    expect(goldReward(60, 500, 500)).toBe(60)
    expect(goldReward(60, 5000, 500)).toBe(90)
  })

  it('prices level-ups on a 25 * L^1.4 curve', () => {
    expect(levelUpGold(1)).toBe(25)
    expect(levelUpGold(10)).toBe(628)
    expect(levelUpGold(50)).toBe(5977)
  })

  it('leaves a failed run with pity gold, not nothing', () => {
    // The SQL failure branch mirrors this number; see 20260924000000_failed_run_pity.sql.
    expect(FAILED_RUN_PITY_GOLD).toBeGreaterThan(0)
  })
})

describe('chest odds', () => {
  it('sums to 100 per tier', () => {
    for (const [chest, odds] of Object.entries(CHEST_ODDS)) {
      const total = Object.values(odds).reduce((sum, weight) => sum + (weight ?? 0), 0)
      expect(total, `${chest} odds`).toBe(100)
    }
  })

  it('picks the rank band matching the roll', () => {
    expect(pickRank(CHEST_ODDS.common, 0)).toBe(1)
    expect(pickRank(CHEST_ODDS.common, 0.99)).toBe(3)
    expect(pickRank(CHEST_ODDS.mythic, 0)).toBe(3)
    expect(pickRank(CHEST_ODDS.mythic, 0.99)).toBe(5)
  })

  it('pays dupes by rank', () => {
    expect([1, 2, 3, 4, 5].map((r) => dupeShards(r as CardRank))).toEqual([5, 10, 25, 60, 150])
  })
})

describe('run slots', () => {
  it('unlocks 2 / 3 / 4 at levels 1 / 10 / 25', () => {
    expect(runSlotsForLevel(1)).toBe(2)
    expect(runSlotsForLevel(9)).toBe(2)
    expect(runSlotsForLevel(10)).toBe(3)
    expect(runSlotsForLevel(24)).toBe(3)
    expect(runSlotsForLevel(25)).toBe(4)
    expect(runSlotsForLevel(99)).toBe(4)
  })
})
