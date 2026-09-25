import { describe, expect, it } from 'vitest'

import { buildOnboardingSteps, dailyChestReady, rankUpReadyCopies } from './homeTasks'
import { tagCoreId } from '@/game/formulas'
import type {
  Card,
  CardRank,
  ChestInventoryRow,
  DungeonRun,
  PlayerCard,
  PlayerMaterial,
} from '@/types/db'

function card(overrides: Partial<Card> & { id: string }): Card {
  return {
    name: 'Test Card',
    rank: 1,
    faction: 'ember',
    role: 'dps',
    base_atk: 1,
    base_def: 1,
    passive_name: '',
    passive_text: '',
    lore: '',
    tags: [],
    art_path: null,
    ...overrides,
  }
}

function playerCard(id: string, rank: CardRank = 1, cardId = 'c1'): PlayerCard {
  return {
    id,
    profile_id: 'p1',
    card_id: cardId,
    level: 1,
    rank,
    locked: false,
    obtained_at: '2026-01-01T00:00:00Z',
  }
}

function material(materialId: string, qty: number): PlayerMaterial {
  return { profile_id: 'p1', material_id: materialId, qty }
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
  const cards = [card({ id: 'c1', tags: ['fire'] })]

  it('offers a copy whose gold and every material are covered', () => {
    const materials = [material('common_shard', 10), material(tagCoreId('fire', 'lesser'), 3)]
    expect(rankUpReadyCopies([playerCard('pc1')], cards, materials, 1000)).toEqual([
      { playerCardId: 'pc1', cardId: 'c1', fromRank: 1, toRank: 2 },
    ])
  })

  it('holds back when the gold is one short', () => {
    const materials = [material('common_shard', 10), material(tagCoreId('fire', 'lesser'), 3)]
    expect(rankUpReadyCopies([playerCard('pc1')], cards, materials, 999)).toEqual([])
  })

  it('holds back when a tag Core is missing', () => {
    const materials = [material('common_shard', 10)]
    expect(rankUpReadyCopies([playerCard('pc1')], cards, materials, 1000)).toEqual([])
  })

  it('offers nothing at the top of the ladder', () => {
    expect(rankUpReadyCopies([playerCard('pc5', 5)], cards, [], 1_000_000)).toEqual([])
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
      collection: [playerCard('pc1', 2)],
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
