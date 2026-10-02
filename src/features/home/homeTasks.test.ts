import { describe, expect, it } from 'vitest'

import { buildOnboardingSteps, dailyChestReady, rankUpReadyCopies } from './homeTasks'
import type { CardRank, ChestInventoryRow, DungeonRun, PlayerCard } from '@/types/db'

function playerCard(
  id: string,
  rank: CardRank = 1,
  cardId = 'c1',
  atkLevel = 1,
): PlayerCard {
  return {
    id,
    profile_id: 'p1',
    card_id: cardId,
    rank,
    atk_level: atkLevel,
    hp_level: 1,
    def_level: 1,
    spd_level: 1,
    locked: false,
    obtained_at: '2026-01-01T00:00:00Z',
  }
}

function chest(opened: boolean): ChestInventoryRow {
  return {
    id: 'ch1',
    profile_id: 'p1',
    chest_id: 'common',
    source: 'daily login',
    granted_at: '2026-01-01T00:00:00Z',
    opened_at: opened ? '2026-01-01T00:05:00Z' : null,
  }
}

function run(claimed: boolean): DungeonRun {
  return {
    id: 'r1',
    profile_id: 'p1',
    dungeon_id: 'd1',
    party_id: 'party1',
    power_snapshot: 100,
    affinity_mult: 1,
    started_at: '2026-01-01T00:00:00Z',
    ends_at: '2026-01-01T00:05:00Z',
    resolved_at: '2026-01-01T00:05:00Z',
    success: true,
    rewards: null,
    claimed_at: claimed ? '2026-01-01T00:06:00Z' : null,
  }
}

describe('dailyChestReady', () => {
  const now = new Date('2026-09-25T12:00:00')

  it('is ready when never claimed', () => {
    expect(dailyChestReady(null, now)).toBe(true)
  })

  it('is spent once claimed earlier the same day', () => {
    expect(dailyChestReady('2026-09-25T08:00:00', now)).toBe(false)
  })

  it('is ready again the next day', () => {
    expect(dailyChestReady('2026-09-24T23:00:00', now)).toBe(true)
  })
})

describe('rankUpReadyCopies', () => {
  it('offers a copy when two rank-1 duplicates are held', () => {
    const collection = [playerCard('pc1'), playerCard('pc2'), playerCard('pc3')]
    const ready = rankUpReadyCopies(collection)
    expect(ready.map((row) => row.playerCardId).sort()).toEqual(['pc1', 'pc2', 'pc3'])
    expect(ready[0]).toMatchObject({ cardId: 'c1', fromRank: 1, toRank: 2 })
  })

  it('holds back when there is only one duplicate', () => {
    expect(rankUpReadyCopies([playerCard('pc1'), playerCard('pc2')])).toEqual([])
  })

  it('excludes duplicates that are equipped in a party', () => {
    const collection = [playerCard('pc1'), playerCard('pc2'), playerCard('pc3')]
    expect(rankUpReadyCopies(collection, new Set(['pc2', 'pc3']))).toEqual([])
  })

  it('offers nothing at the top of the ladder', () => {
    expect(rankUpReadyCopies([playerCard('pc5', 5), playerCard('pc6', 5)])).toEqual([])
  })
})

describe('buildOnboardingSteps', () => {
  const filledParty = { slots: [{}] }

  it('starts every step open for a brand-new player', () => {
    const steps = buildOnboardingSteps({ chests: [], runs: [], collection: [], parties: [] })
    expect(steps.map((step) => step.done)).toEqual([false, false, false, false, false])
  })

  it('clears every step from live state', () => {
    const steps = buildOnboardingSteps({
      chests: [chest(true)],
      runs: [run(true)],
      collection: [playerCard('pc1', 2, 'c1', 2)],
      parties: [filledParty],
    })
    expect(steps.every((step) => step.done)).toBe(true)
  })

  it('wants a party before a run', () => {
    const empty = buildOnboardingSteps({
      chests: [chest(true)],
      runs: [],
      collection: [playerCard('pc1')],
      parties: [{ slots: [] }],
    })
    const byId = new Map(empty.map((step) => [step.id, step.done]))
    expect(byId.get('open-chest')).toBe(true)
    expect(byId.get('build-party')).toBe(false)
    expect(byId.get('first-run')).toBe(false)
  })

  it('keeps a started-but-unclaimed run incomplete', () => {
    const steps = buildOnboardingSteps({
      chests: [],
      runs: [run(false)],
      collection: [],
      parties: [filledParty],
    })
    const byId = new Map(steps.map((step) => [step.id, step.done]))
    expect(byId.get('first-run')).toBe(true)
    expect(byId.get('claim-run')).toBe(false)
  })
})
