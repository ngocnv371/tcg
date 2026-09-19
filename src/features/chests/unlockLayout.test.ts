import { describe, expect, it } from 'vitest'

import { CARD_SIZE, STAGE_SIZE, fanPlacements, gridMetrics, gridPlacement } from './unlockLayout'

const COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10]

describe('grid placement', () => {
  it('stays 2-up while the cards are large and switches to 3-up after', () => {
    expect(gridMetrics(2).columns).toBe(2)
    expect(gridMetrics(4).rows).toBe(2)
    expect(gridMetrics(5).columns).toBe(3)
    expect(gridMetrics(10).columns).toBe(3)
    expect(gridMetrics(10).rows).toBe(4)
  })

  it('keeps every card inside the stage', () => {
    for (const count of COUNTS) {
      const metrics = gridMetrics(count)
      for (let index = 0; index < count; index += 1) {
        const spot = gridPlacement(index, count)
        expect(Math.abs(spot.x) + metrics.cellWidth / 2).toBeLessThanOrEqual(STAGE_SIZE.width / 2)
        expect(Math.abs(spot.y) + metrics.cellHeight / 2).toBeLessThanOrEqual(STAGE_SIZE.height / 2)
      }
    }
  })

  it('centres the short last row and trims the card to the cell', () => {
    // 3 cards over 2 columns: the odd one out lands on the centre line
    expect(gridPlacement(2, 3).x).toBeCloseTo(0)
    // 10 cards over 3 columns: the single card of row 4 is centred as well
    expect(gridPlacement(9, 10).x).toBeCloseTo(0)
    expect(gridPlacement(9, 10).y).toBeGreaterThan(0)
    expect(gridPlacement(0, 6).scale).toBeCloseTo(gridMetrics(6).cellWidth / CARD_SIZE.width)
  })
})

describe('fan placement', () => {
  it('never leaves an extra card dead-centre behind the first one', () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      for (const spot of fanPlacements(count)) {
        expect(Math.abs(spot.x)).toBeGreaterThan(20)
      }
    }
  })

  it('rotates further with every slot and stays inside the stage', () => {
    const fan = fanPlacements(9)
    expect(fan).toHaveLength(9)
    const angles = fan.map((spot) => spot.rotate)
    expect([...angles].sort((a, b) => a - b)).toEqual(angles)
    expect(fan[0].rotate).toBeLessThan(0)
    expect(fan[fan.length - 1].rotate).toBeGreaterThan(0)
    for (const spot of fan) {
      expect(Math.abs(spot.rotate)).toBeLessThanOrEqual(30)
      expect(Math.abs(spot.x) + CARD_SIZE.width / 2).toBeLessThanOrEqual(STAGE_SIZE.width / 2)
      expect(Math.abs(spot.y) + CARD_SIZE.height / 2).toBeLessThanOrEqual(STAGE_SIZE.height / 2)
    }
  })

  it('has nothing to place when only one card was opened', () => {
    expect(fanPlacements(0)).toEqual([])
  })
})
