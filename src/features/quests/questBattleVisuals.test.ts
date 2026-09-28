import { describe, expect, it } from 'vitest'

import { STAGE_SIZE } from '@/features/chests/unlockLayout'
import {
  ATTACK_LAYOUT,
  attackerHome,
  combatantPlacements,
  defenderHome,
  INTRO_TILE_SIZE,
  lungeOffset,
} from './questBattleVisuals'

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

  it('keeps three members on one centred row', () => {
    const spots = combatantPlacements(3)
    expect(spots.every((spot) => spot.y === 0)).toBe(true)
    expect(spots.map((spot) => spot.x)).toEqual([-94, 0, 94])
  })
})

describe('attack geometry', () => {
  it('stands the player below the centre and the enemy above it', () => {
    expect(attackerHome('player').y).toBeGreaterThan(ATTACK_LAYOUT.center.y)
    expect(defenderHome('player').y).toBeLessThan(ATTACK_LAYOUT.center.y)
    expect(attackerHome('enemy').y).toBeLessThan(ATTACK_LAYOUT.center.y)
    expect(defenderHome('enemy').y).toBeGreaterThan(ATTACK_LAYOUT.center.y)
  })

  it('lunges each side toward the other', () => {
    expect(lungeOffset('player')).toBeLessThan(0)
    expect(lungeOffset('enemy')).toBeGreaterThan(0)
  })
})
