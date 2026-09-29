import { describe, expect, it } from 'vitest'

import { STAGE_SIZE } from '@/features/chests/unlockLayout'
import {
  ATTACK_FIGURE_SIZE,
  ATTACK_LAYOUT,
  attackerOffset,
  combatantPlacements,
  combatArtScale,
  defenderOffset,
  INTRO_TILE_SIZE,
  lungeOffset,
} from './questBattleVisuals'

describe('combat art scale', () => {
  it('is 1 on the authored stage and grows with the screen', () => {
    expect(combatArtScale(STAGE_SIZE.width, STAGE_SIZE.height)).toBe(1)
    expect(combatArtScale(780, 1688)).toBe(2)
    expect(combatArtScale(195, STAGE_SIZE.height)).toBe(0.5)
  })

  it('is bounded by height, so a wide window cannot overflow the scene', () => {
    expect(combatArtScale(780, STAGE_SIZE.height)).toBe(1)
    expect(combatArtScale(2000, 600)).toBeCloseTo(600 / STAGE_SIZE.height)
  })
})

describe('combatant placements', () => {
  it('is empty for an empty side and centred for one member', () => {
    expect(combatantPlacements(0)).toEqual([])
    expect(combatantPlacements(1)).toEqual([{ x: 0, y: 0 }])
  })

  it('fits a full 5-member party inside the stage', () => {
    const spots = combatantPlacements(5)
    expect(spots).toHaveLength(5)
    expect(new Set(spots.map((spot) => spot.y)).size).toBe(2)
    const half = STAGE_SIZE.width / 2
    for (const spot of spots) {
      expect(Math.abs(spot.x) + INTRO_TILE_SIZE.width / 2).toBeLessThanOrEqual(half)
    }
  })

  it('keeps three members on one centred row that spans most of the stage width', () => {
    const spots = combatantPlacements(3)
    expect(spots.every((spot) => spot.y === 0)).toBe(true)
    const span = spots[spots.length - 1].x - spots[0].x + INTRO_TILE_SIZE.width
    // A three-card row fills at least three quarters of the width instead of sitting small in the
    // middle — the whole point of scaling the block with the composition.
    expect(span).toBeGreaterThanOrEqual(STAGE_SIZE.width * 0.75)
  })

  it('scales every offset with the art scale passed in', () => {
    const base = combatantPlacements(3)
    const doubled = combatantPlacements(3, 2)
    expect(doubled.map((spot) => spot.x)).toEqual(base.map((spot) => spot.x * 2))
    expect(doubled.map((spot) => spot.y)).toEqual(base.map((spot) => spot.y * 2))
  })
})

describe('attack geometry', () => {
  it('stands the player below the centre and the enemy above it', () => {
    expect(attackerOffset('player').y).toBeGreaterThan(0)
    expect(defenderOffset('player').y).toBeLessThan(0)
    expect(attackerOffset('enemy').y).toBeLessThan(0)
    expect(defenderOffset('enemy').y).toBeGreaterThan(0)
  })

  it('lunges each side toward the other', () => {
    expect(lungeOffset('player')).toBeLessThan(0)
    expect(lungeOffset('enemy')).toBeGreaterThan(0)
  })

  it('sizes the figures to fill a large share of the stage', () => {
    // Two figures plus the gap have to read across the screen, not as tiny avatars in its middle.
    expect(ATTACK_FIGURE_SIZE.width).toBeGreaterThan(STAGE_SIZE.width * 0.3)
    expect(ATTACK_FIGURE_SIZE.height * 2).toBeGreaterThan(STAGE_SIZE.height * 0.5)
    expect(ATTACK_FIGURE_SIZE.height).toBeGreaterThan(ATTACK_FIGURE_SIZE.width)
    // The pair must not overlap at rest, or the lunge would have nowhere to travel.
    expect(ATTACK_LAYOUT.reach * 2).toBeGreaterThan(ATTACK_FIGURE_SIZE.height)
  })
})
