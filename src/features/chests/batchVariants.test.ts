import { describe, expect, it } from 'vitest'

import { BATCH_VARIANTS, batchVariant, pickBatchVariant } from './batchVariants'
import { BATCH_DURATION, burstDuration, cascadeDuration } from './unlockVisuals'

const COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10]

describe('batch variants', () => {
  it('draws a registered variant', () => {
    for (let draw = 0; draw < 50; draw += 1) {
      const variant = pickBatchVariant()
      expect(BATCH_VARIANTS).toContain(variant)
      expect(batchVariant(variant.id)).toBe(variant)
    }
  })

  it('can serve every variant, so no reveal is dead code', () => {
    const drawn = new Set(Array.from({ length: 200 }, () => pickBatchVariant().id))
    expect([...drawn].sort()).toEqual(BATCH_VARIANTS.map((variant) => variant.id).sort())
  })

  it('gives every variant a length that fits the reveal budget', () => {
    for (const variant of BATCH_VARIANTS) {
      for (const count of COUNTS) {
        const frames = variant.durationInFrames(count)
        expect(frames, `${variant.id} x${count}`).toBeGreaterThan(30)
        expect(frames, `${variant.id} x${count}`).toBeLessThanOrEqual(300)
      }
    }
  })

  it('paces the grid variants by card count instead of holding still', () => {
    // The fan has a fixed intro to fit, so only the dealt/burst variants may scale.
    expect(BATCH_VARIANTS.find((variant) => variant.id === 'fan')?.durationInFrames(10)).toBe(BATCH_DURATION)
    expect(cascadeDuration(10)).toBeGreaterThan(cascadeDuration(2))
    expect(cascadeDuration(10)).toBeGreaterThan(BATCH_DURATION / 2)
    // A two-card burst has a single row, so it is the shortest reveal of the three.
    expect(burstDuration(2)).toBeLessThan(cascadeDuration(2))
    expect(burstDuration(10)).toBeGreaterThan(burstDuration(2))
  })
})
