import { describe, expect, it } from 'vitest'

import { ACTIVE_BATCH_VARIANT, BATCH_VARIANTS, batchVariant } from './batchVariants'
import { BATCH_DURATION, burstDuration, cascadeDuration } from './unlockVisuals'

const COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10]

describe('batch variants', () => {
  it('ships a variant the picker can resolve', () => {
    expect(BATCH_VARIANTS.map((variant) => variant.id)).toContain(ACTIVE_BATCH_VARIANT)
    expect(batchVariant(ACTIVE_BATCH_VARIANT).id).toBe(ACTIVE_BATCH_VARIANT)
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
