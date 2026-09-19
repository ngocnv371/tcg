import { describe, expect, it } from 'vitest'

import { RANK_UP_BEATS, RANK_UP_DURATION, RANK_STAR_SLOTS, beatProgress, starIgnition, sweepOffset } from './rankUpVisuals'

describe('rank-up timeline', () => {
  it('keeps the reveal inside the 5s budget', () => {
    expect(RANK_UP_DURATION / 30).toBeLessThanOrEqual(5)
    // Every beat has to be over before the Player stops, or the ending is cut off.
    for (const [name, [start, end]] of Object.entries(RANK_UP_BEATS)) {
      expect(start, name).toBeGreaterThanOrEqual(0)
      expect(end, name).toBeLessThanOrEqual(RANK_UP_DURATION)
    }
  })

  it('holds each beat at its end value once it is over', () => {
    const { intro, caption } = RANK_UP_BEATS
    expect(beatProgress(intro[0] - 2, intro)).toBe(0)
    expect(beatProgress(intro[1] + 2, intro)).toBe(1)
    expect(beatProgress(caption[1] + 30, caption)).toBe(1)
  })

  it('never reverses inside a beat', () => {
    const series = Array.from({ length: RANK_UP_DURATION }, (_, frame) =>
      beatProgress(frame, RANK_UP_BEATS.star),
    )
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i]).toBeGreaterThanOrEqual(series[i - 1])
    }
  })

  it('sweeps the highlight across and back out of the card', () => {
    expect(sweepOffset(0)).toBeLessThan(0)
    expect(sweepOffset(RANK_UP_DURATION)).toBeGreaterThan(0)
  })

  it('lights the earned stars and ignites only the new one', () => {
    const frame = RANK_UP_DURATION
    expect(starIgnition(frame, 0, 2)).toBe(1)
    expect(starIgnition(frame, 1, 2)).toBe(1)
    expect(starIgnition(frame, 2, 2)).toBe(1)
    expect(starIgnition(frame, 3, 2)).toBe(0)
    // Slots past 5★ are never drawn, but the index maths must stay safe for a 4★ → 5★ step.
    expect(starIgnition(frame, RANK_STAR_SLOTS - 1, 4)).toBe(1)
    expect(starIgnition(0, 4, 4)).toBe(0)
  })
})
