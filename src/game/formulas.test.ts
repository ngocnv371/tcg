import { describe, expect, it } from 'vitest'

import {
  AFFINITY_MULT_MAX,
  AFFINITY_MULT_MIN,
  CARD_BASE_ATK,
  CARD_BASE_DEF,
  CHEST_GEM_PRICES,
  CHEST_ODDS,
  CORE_TAGS,
  CORE_VARIANTS,
  DEFAULT_THREAT,
  RANK_META,
  TUTORIAL_DUNGEON_ID,
  TUTORIAL_DURATION_SECONDS,
  affinityMultiplier,
  allCoreIds,
  cardAtk,
  cardDef,
  cardHp,
  cardPower,
  cardSpd,
  chestGemPrice,
  coreTagsForCard,
  coreVariantForRank,
  dupeShards,
  goldReward,
  levelUpGold,
  partyPower,
  pickRank,
  rankUpRequirement,
  rankUpValue,
  resolveCardStats,
  rewardMultiplier,
  runMultiplier,
  runSlotsForLevel,
  rushCost,
  scaleEnemyStats,
  selectRankUpFodder,
  statLevelCap,
  statLevelCost,
  statLevelGold,
  tagCoreId,
  tagLabel,
  tutorialReward,
  type CardRank,
} from './formulas'

const BASE_CARD = { base_atk: CARD_BASE_ATK, base_def: CARD_BASE_DEF, speed: 10 }
const RANK1 = { rank: 1 as CardRank, atk_level: 1, hp_level: 1, def_level: 1, spd_level: 1 }

describe('rank multipliers', () => {
  it('applies one multiplier across every stat', () => {
    // The ladder mirrors the old per-rank ATK bases for a 20-base card.
    expect(cardAtk(CARD_BASE_ATK, 1, 1)).toBe(20)
    expect(cardAtk(CARD_BASE_ATK, 2, 1)).toBe(35)
    expect(cardAtk(CARD_BASE_ATK, 3, 1)).toBe(55)
    expect(cardAtk(CARD_BASE_ATK, 5, 1)).toBe(130)
    expect(cardDef(CARD_BASE_DEF, 1, 1)).toBe(12)
    expect(cardHp(CARD_BASE_ATK, 1, 1)).toBe(80)
    expect(cardSpd(10, 1, 1)).toBe(10)
    expect(cardSpd(10, 2, 1)).toBe(18)
  })

  it('grows 8% of base per stat level, independently per stat', () => {
    expect(cardAtk(CARD_BASE_ATK, 1, 6)).toBe(28)
    expect(cardDef(CARD_BASE_DEF, 1, 6)).toBe(17)
    // Levelling ATK leaves DEF untouched.
    expect(cardAtk(CARD_BASE_ATK, 1, 6)).toBe(28)
    expect(cardDef(CARD_BASE_DEF, 1, 1)).toBe(12)
  })

  it('caps each stat level by rank', () => {
    expect(statLevelCap(1)).toBe(20)
    expect(statLevelCap(5)).toBe(100)
  })

  it('resolves a copy into atk/def/hp/spd/power', () => {
    const stats = resolveCardStats(BASE_CARD, { ...RANK1, rank: 3 })
    expect(stats).toEqual({ atk: 55, def: 33, hp: 220, spd: 28, power: 88 })
  })
})

describe('party power', () => {
  it('sums the atk+def of every member', () => {
    expect(cardPower(BASE_CARD, RANK1)).toBe(32)
    const five = Array.from({ length: 5 }, () => ({ card: BASE_CARD, copy: RANK1 }))
    expect(partyPower(five)).toBe(160)
  })

  it('a higher rank strictly outscores a lower one', () => {
    const rank3 = { ...RANK1, rank: 3 as CardRank }
    expect(cardPower(BASE_CARD, rank3)).toBeGreaterThan(cardPower(BASE_CARD, RANK1))
  })
})

describe('rank-up fodder', () => {
  it('values a rank-r copy at 2^(r-1) base copies', () => {
    expect([1, 2, 3, 4, 5].map((r) => rankUpValue(r as CardRank))).toEqual([1, 2, 4, 8, 16])
  })

  it('requires 2, 4, 8, 16 copies to climb each step, and stops at 5★', () => {
    expect([1, 2, 3, 4].map((r) => rankUpRequirement(r as CardRank))).toEqual([2, 4, 8, 16])
    expect(rankUpRequirement(5)).toBe(0)
  })

  it('picks the cheapest covering set, skipping locked and equipped copies', () => {
    const target = { id: 't', card_id: 'a', rank: 1 as CardRank }
    const copies = [
      target,
      { id: 'f1', card_id: 'a', rank: 1 as CardRank },
      { id: 'f2', card_id: 'a', rank: 1 as CardRank, locked: true },
      { id: 'f3', card_id: 'a', rank: 1 as CardRank, inParty: true },
      { id: 'f4', card_id: 'a', rank: 2 as CardRank },
      { id: 'other', card_id: 'b', rank: 1 as CardRank },
    ]
    // One 2★ duplicate alone covers the 1→2 step.
    expect(selectRankUpFodder(target, copies)).toEqual(['f4'])
  })

  it('returns null when the collection is short', () => {
    const target = { id: 't', card_id: 'a', rank: 1 as CardRank }
    expect(selectRankUpFodder(target, [target, { id: 'f1', card_id: 'a', rank: 1 as CardRank }])).toBeNull()
  })
})

describe('stat levelling costs', () => {
  it('charges a fixed gold price plus one Core per tag, graded by rank', () => {
    expect(statLevelCost(1, ['fire'], 2)).toEqual({
      gold: levelUpGold(2),
      materials: { lesser_fire_core: 1 },
    })
    expect(statLevelCost(4, ['fire', 'dragon'], 5).materials).toEqual({
      legendary_fire_core: 1,
      legendary_dragon_core: 1,
    })
    expect(statLevelGold(2)).toBe(levelUpGold(2))
  })

  it('ships one Core grade per rank step', () => {
    expect(coreVariantForRank(1)).toBe('lesser')
    expect(coreVariantForRank(2)).toBe('greater')
    expect(coreVariantForRank(3)).toBe('mythic')
    expect(coreVariantForRank(4)).toBe('legendary')
    expect(coreVariantForRank(5)).toBe('legendary')
  })
})

describe('rewards', () => {
  it('scales between 1.0x and 1.5x of base, with no win/lose roll', () => {
    expect(rewardMultiplier(250, 500)).toBe(1.0)
    expect(rewardMultiplier(750, 500)).toBe(1.5)
  })

  it('prices stat levels on a 25 * L^1.4 curve', () => {
    expect(levelUpGold(1)).toBe(25)
    expect(levelUpGold(10)).toBe(628)
    expect(levelUpGold(50)).toBe(5977)
  })

  it('pays a stronger team strictly more of the same dungeon', () => {
    expect(goldReward(60, 500, 500)).toBe(60)
    expect(goldReward(60, 5000, 500)).toBe(90)
  })
})

describe('elemental affinity', () => {
  it('interpolates between the band ends by share of matching cards', () => {
    expect(affinityMultiplier([['fire'], ['dragon']], ['fire', 'dragon'])).toBeCloseTo(
      AFFINITY_MULT_MAX,
    )
    expect(affinityMultiplier([['water'], ['ice']], ['fire'])).toBeCloseTo(AFFINITY_MULT_MIN)
    expect(
      affinityMultiplier([['fire'], ['water'], ['physical']], ['fire']),
    ).toBeCloseTo(AFFINITY_MULT_MIN + (AFFINITY_MULT_MAX - AFFINITY_MULT_MIN) / 3)
  })

  it('counts a multi-tag card once and matches case-insensitively', () => {
    expect(affinityMultiplier([['Fire', 'dragon']], ['fire'])).toBeCloseTo(AFFINITY_MULT_MAX)
  })

  it('is neutral with no dungeon tags or no party', () => {
    expect(affinityMultiplier([['fire']], [])).toBe(1)
    expect(affinityMultiplier([], ['fire'])).toBe(1)
  })

  it('composes with the power band into one yield', () => {
    expect(runMultiplier(500, 500, [['fire']], ['fire'])).toBeCloseTo(AFFINITY_MULT_MAX)
    expect(runMultiplier(750, 500, [['water']], ['fire'])).toBeCloseTo(1.5 * AFFINITY_MULT_MIN)
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

describe('marketplace prices', () => {
  it('prices every chest tier that has odds', () => {
    for (const chestId of Object.keys(CHEST_ODDS)) {
      expect(chestGemPrice(chestId), `${chestId} price`).toBe(CHEST_GEM_PRICES[chestId])
      expect(chestGemPrice(chestId)).toBeGreaterThan(0)
    }
  })

  it('prices higher tiers strictly higher', () => {
    const ladder = ['common', 'rare', 'epic', 'legendary', 'mythic']
    const prices = ladder.map((chestId) => chestGemPrice(chestId)!)
    for (let index = 1; index < prices.length; index += 1) {
      expect(prices[index]).toBeGreaterThan(prices[index - 1])
    }
  })

  it('returns null for a chest that is not sold', () => {
    expect(chestGemPrice('unknown')).toBeNull()
  })
})

describe('tutorial reward', () => {
  it('covers a stat level for every tag, so the guided step is always affordable', () => {
    const reward = tutorialReward()
    const cost = statLevelCost(1, CORE_TAGS, 2)
    expect(reward.gold).toBeGreaterThanOrEqual(cost.gold)
    for (const [id, qty] of Object.entries(cost.materials)) {
      expect(reward.materials[id] ?? 0).toBeGreaterThanOrEqual(qty)
    }
  })

  it('names the seeded tutorial dungeon and pins its short timer', () => {
    expect(TUTORIAL_DUNGEON_ID).toBe('training_grounds')
    expect(TUTORIAL_DURATION_SECONDS).toBe(10)
  })
})

describe('core catalog', () => {
  it("keeps the card's own tags, in catalog order, and drops unknown ones", () => {
    expect(coreTagsForCard(['fire', 'physical', 'robot'])).toEqual(['physical', 'fire'])
    expect(coreTagsForCard(['Dragon', 'Dark'])).toEqual(['dragon', 'dark'])
    expect(coreTagsForCard([])).toEqual([])
  })

  it('names Core ids the way the seeded materials rows do', () => {
    expect(tagCoreId('fire', 'lesser')).toBe('lesser_fire_core')
    expect(tagCoreId('physical', 'legendary')).toBe('legendary_physical_core')
  })

  it('labels tags for display without changing the stored id', () => {
    expect(tagLabel('physical')).toBe('Physical')
    expect(tagLabel('electric')).toBe('Electric')
  })

  it('ships one Core material per tag per grade', () => {
    expect(allCoreIds()).toHaveLength(CORE_TAGS.length * CORE_VARIANTS.length)
    expect(allCoreIds()).toHaveLength(36)
    expect(new Set(allCoreIds()).size).toBe(allCoreIds().length)
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

describe('rush cost', () => {
  it('charges per started minute remaining, floored at one gem', () => {
    expect(rushCost(3600)).toBe(120)
    expect(rushCost(61)).toBe(4)
    expect(rushCost(60)).toBe(2)
    expect(rushCost(1)).toBe(2)
    expect(rushCost(0)).toBe(1)
    expect(rushCost(-5)).toBe(1)
  })
})

describe('enemy threat scaling', () => {
  // the Capfather, as the bestiary authors it
  const base = { hp: 216, atk: 52, def: 20, spd: 7 }

  it('leaves the bestiary numbers alone at the default threat', () => {
    expect(scaleEnemyStats(base)).toEqual(base)
    expect(scaleEnemyStats(base, DEFAULT_THREAT)).toEqual(base)
  })

  it('scales every stat but SPD, which is a turn rate, not a size', () => {
    expect(scaleEnemyStats(base, 2)).toEqual({ hp: 432, atk: 104, def: 40, spd: 7 })
    expect(scaleEnemyStats(base, 1.8)).toEqual({ hp: 389, atk: 94, def: 36, spd: 7 })
  })

  it('never rounds a live enemy down to nothing', () => {
    expect(scaleEnemyStats({ hp: 1, atk: 1, def: 0, spd: 5 }, 0.1)).toEqual({
      hp: 1,
      atk: 1,
      def: 0,
      spd: 5,
    })
  })
})

describe('rank metadata', () => {
  it('keeps an increasing all-stat multiplier', () => {
    const mults = [1, 2, 3, 4, 5].map((r) => RANK_META[r as CardRank].statMult)
    for (let index = 1; index < mults.length; index += 1) {
      expect(mults[index]).toBeGreaterThan(mults[index - 1])
    }
  })
})
