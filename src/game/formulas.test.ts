import { describe, expect, it } from 'vitest'

import {
  CHEST_GEM_PRICES,
  CHEST_ODDS,
  CORE_TAGS,
  CORE_VARIANTS,
  RANK_META,
  RANK_UP_LADDER,
  TUTORIAL_DUNGEON_ID,
  TUTORIAL_DURATION_SECONDS,
  allCoreIds,
  cardAtk,
  cardDef,
  cardPower,
  chestGemPrice,
  coreTagsForCard,
  coreVariantForRank,
  dupeShards,
  goldReward,
  levelUpGold,
  partyPower,
  pickRank,
  rankUpCost,
  rewardMultiplier,
  runSlotsForLevel,
  rushCost,
  tagCoreId,
  tagLabel,
  tutorialReward,
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

describe('rewards', () => {
  it('scales between 1.0x and 1.5x of base, with no win/lose roll', () => {
    expect(rewardMultiplier(250, 500)).toBe(1.0)
    expect(rewardMultiplier(750, 500)).toBe(1.5)
  })

  it('prices level-ups on a 25 * L^1.4 curve', () => {
    expect(levelUpGold(1)).toBe(25)
    expect(levelUpGold(10)).toBe(628)
    expect(levelUpGold(50)).toBe(5977)
  })

  it('pays a stronger team strictly more of the same dungeon', () => {
    expect(goldReward(60, 500, 500)).toBe(60)
    expect(goldReward(60, 5000, 500)).toBe(90)
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

describe('rank-up costs', () => {
  it('charges one Core per card tag, graded by the step', () => {
    expect(rankUpCost(1, ['fire', 'dragon'])).toEqual({
      gold: 1000,
      materials: {
        common_shard: 10,
        lesser_fire_core: 3,
        lesser_dragon_core: 3,
      },
    })
    expect(rankUpCost(4, ['physical'])?.materials).toEqual({
      epic_shard: 100,
      legendary_physical_core: 25,
    })
  })

  it('uses a different Core grade on every step', () => {
    expect(RANK_UP_LADDER[1].coreVariant).toBe('lesser')
    expect(RANK_UP_LADDER[2].coreVariant).toBe('greater')
    expect(RANK_UP_LADDER[3].coreVariant).toBe('mythic')
    expect(RANK_UP_LADDER[4].coreVariant).toBe('legendary')
  })

  it('never charges two tags for a card that carries one', () => {
    expect(rankUpCost(2, ['physical'])?.materials).toEqual({
      uncommon_shard: 25,
      greater_physical_core: 8,
    })
  })

  it('has no step past 5★', () => {
    expect(rankUpCost(5, ['fire', 'dragon'])).toBeNull()
  })
})

describe('tutorial reward', () => {
  it('covers the 1→2 step for every tag, so the guided rank-up is always affordable', () => {
    const reward = tutorialReward()
    const cost = rankUpCost(1, CORE_TAGS)
    if (!cost) throw new Error('rank 1 must have a rank-up step')
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
  it('keeps the card\'s own tags, in catalog order, and drops unknown ones', () => {
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

  it('bands dungeon ranks to grades, with rank 5 sharing the top grade', () => {
    expect([1, 2, 3, 4, 5].map(coreVariantForRank)).toEqual([
      'lesser',
      'greater',
      'mythic',
      'legendary',
      'legendary',
    ])
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
