import { describe, expect, it } from 'vitest'

import { STAGE_SIZE } from '@/features/chests/unlockLayout'
import { CORE_TAGS, tagCoreId } from '@/game/formulas'
import type { RunRewards } from '@/types/db'

import {
  PARTY_CARD_SIZE,
  REWARD_TILE_SIZE,
  RUN_VICTORY_DURATION,
  VICTORY_BEATS,
  VICTORY_CHEERS,
  VICTORY_LAYOUT,
  beatProgress,
  partyPlacements,
  rewardGridHeight,
  rewardGridPlacements,
  rewardIcon,
  victoryCheer,
  victoryRewards,
} from './runVictoryVisuals'

const PARTY_COUNTS = [1, 2, 3, 4, 5]
const REWARD_COUNTS = [1, 2, 3, 4, 5, 6]

describe('victory timeline', () => {
  it('ends every beat before the Player stops', () => {
    for (const [name, [start, end]] of Object.entries(VICTORY_BEATS)) {
      expect(start, name).toBeGreaterThanOrEqual(0)
      expect(end, name).toBeLessThanOrEqual(RUN_VICTORY_DURATION)
    }
    // The loot is the payoff: it has to be fully dealt before the closing caption rises.
    expect(VICTORY_BEATS.grid[1]).toBeLessThanOrEqual(VICTORY_BEATS.total[0])
    // The party has to have shrunk out of the way before the grid starts.
    expect(VICTORY_BEATS.handoff[1]).toBeLessThanOrEqual(VICTORY_BEATS.grid[0])
  })

  it('holds each beat at its end value once it is over', () => {
    const { intro, total } = VICTORY_BEATS
    expect(beatProgress(intro[0] - 2, intro)).toBe(0)
    expect(beatProgress(intro[1] + 2, intro)).toBe(1)
    expect(beatProgress(total[1] + 30, total)).toBe(1)
  })

  it('never reverses inside a beat', () => {
    const series = Array.from({ length: RUN_VICTORY_DURATION }, (_, frame) =>
      beatProgress(frame, VICTORY_BEATS.grid),
    )
    for (let index = 1; index < series.length; index += 1) {
      expect(series[index]).toBeGreaterThanOrEqual(series[index - 1])
    }
  })

  it('gives every party slot a line without ever running out', () => {
    expect(victoryCheer(0)).toBe(VICTORY_CHEERS[0])
    expect(victoryCheer(VICTORY_CHEERS.length)).toBe(VICTORY_CHEERS[0])
    expect(victoryCheer(4)).toBe(VICTORY_CHEERS[4])
  })
})

describe('party placement', () => {
  it('has nothing to place when the party could not be resolved', () => {
    expect(partyPlacements(0)).toEqual([])
  })

  it('stays inside the stage on the intro and on the handoff strip', () => {
    for (const count of PARTY_COUNTS) {
      const spots = partyPlacements(count)
      expect(spots).toHaveLength(count)
      for (const spot of spots) {
        const x = VICTORY_LAYOUT.partyCenter.x + spot.x
        expect(x - PARTY_CARD_SIZE.width / 2).toBeGreaterThanOrEqual(0)
        expect(x + PARTY_CARD_SIZE.width / 2).toBeLessThanOrEqual(STAGE_SIZE.width)

        // The strip sits above the loot, so its own extent is what has to clear the title.
        const resting = VICTORY_LAYOUT.partyResting
        const restingY = resting.y + spot.y * resting.scale
        expect(restingY - (PARTY_CARD_SIZE.height * resting.scale) / 2).toBeGreaterThan(
          VICTORY_LAYOUT.titleTop + 60,
        )
      }
    }
  })

  it('centres a lone tile and its rows on the stage', () => {
    // 5 cards over 3 per row: the two of row 2 straddle the centre line.
    const spots = partyPlacements(5)
    expect(spots[3].y).toBe(spots[4].y)
    expect(spots[3].x).toBeCloseTo(-spots[4].x)
    expect(spots[0].y).toBeLessThan(spots[3].y)
    // 3 cards fit on one row, so nothing is offset vertically.
    expect(partyPlacements(3).every((spot) => spot.y === 0)).toBe(true)
    // A one-card party — or a party whose other copies could not be resolved — sits centred.
    expect(partyPlacements(1)[0]).toEqual({ x: 0, y: 0 })
  })
})

describe('reward grid', () => {
  it('switches from two columns to three', () => {
    // 4 tiles: 2 × 2, the widest a tile ever gets.
    const twoUp = rewardGridPlacements(4)
    expect(twoUp[0].y).toBe(twoUp[1].y)
    expect(twoUp[0].x).toBeCloseTo(-twoUp[1].x)
    expect(twoUp[2].y).toBeGreaterThan(twoUp[0].y)
    expect(twoUp[2].x).toBeCloseTo(twoUp[0].x)
    expect(rewardGridHeight(4)).toBe(REWARD_TILE_SIZE.height * 2 + 12)
    // 5 tiles: 3 + 2, so the last row is shorter and its tiles move inwards.
    const threeUp = rewardGridPlacements(5)
    expect(threeUp[0].y).toBe(threeUp[1].y)
    expect(threeUp[1].x).toBeCloseTo(0)
    expect(threeUp[3].y).toBe(threeUp[4].y)
    expect(threeUp[3].x).toBeCloseTo(-threeUp[4].x)
    expect(Math.abs(threeUp[4].x)).toBeLessThan(Math.abs(threeUp[2].x))
  })

  it('keeps every tile inside the stage and clear of the caption', () => {
    for (const count of REWARD_COUNTS) {
      const spots = rewardGridPlacements(count)
      expect(spots).toHaveLength(count)
      for (const spot of spots) {
        const x = VICTORY_LAYOUT.gridCenter.x + spot.x
        expect(x - REWARD_TILE_SIZE.width / 2).toBeGreaterThanOrEqual(0)
        expect(x + REWARD_TILE_SIZE.width / 2).toBeLessThanOrEqual(STAGE_SIZE.width)
      }
      const bottom = VICTORY_LAYOUT.gridCenter.y + rewardGridHeight(count) / 2
      expect(bottom).toBeLessThan(STAGE_SIZE.height - VICTORY_LAYOUT.captionBottom - 40)
    }
  })

  it('centres a lone tile in the last row and returns nothing for an empty payout', () => {
    // 7 tiles over 3 columns leaves one tile on row 3.
    expect(rewardGridPlacements(7)[6].x).toBeCloseTo(0)
    expect(rewardGridPlacements(0)).toEqual([])
    expect(rewardGridHeight(0)).toBe(0)
  })
})

describe('reward rows', () => {
  const label = (id: string) => `name:${id}`

  it('reads gold, then materials, then the chest', () => {
    const rewards: RunRewards = {
      chest_id: 'epic',
      gold: 1200,
      materials: [
        { material_id: 'rare_shard', qty: 4 },
        { material_id: 'lesser_fire_core', qty: 3 },
      ],
      multiplier: 1.32,
    }
    expect(victoryRewards(rewards, label)).toEqual([
      { id: 'gold', label: 'Gold', qty: 1200 },
      { id: 'rare_shard', label: 'name:rare_shard', qty: 4 },
      { id: 'lesser_fire_core', label: 'name:lesser_fire_core', qty: 3 },
      { id: 'epic', label: 'Epic', qty: 1 },
    ])
  })

  it('drops gold the settlement panel drops, and survives a missing payout', () => {
    expect(victoryRewards({ gold: 0, materials: [] }, label)).toEqual([])
    expect(victoryRewards(null, label)).toEqual([])
  })
})

describe('placeholder glyphs', () => {
  it('gives every Core family its own element', () => {
    for (const tag of CORE_TAGS) {
      expect(rewardIcon(tagCoreId(tag, 'legendary'))).toEqual({ kind: 'core', tag })
    }
  })

  it('falls back to the generic symbols for everything else', () => {
    expect(rewardIcon('gold')).toEqual({ kind: 'gold' })
    expect(rewardIcon('common_shard')).toEqual({ kind: 'shard' })
    expect(rewardIcon('mythic')).toEqual({ kind: 'chest' })
    expect(rewardIcon('ancient_relic')).toEqual({ kind: 'material' })
  })
})
