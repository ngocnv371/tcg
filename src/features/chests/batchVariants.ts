import type { ComponentType } from 'react'

import { CardBatchUnlockAnimation } from '@/features/chests/CardBatchUnlockAnimation'
import { CardBatchUnlockBurst } from '@/features/chests/CardBatchUnlockBurst'
import { CardBatchUnlockCascade } from '@/features/chests/CardBatchUnlockCascade'
import type { BatchUnlockProps } from '@/features/chests/batchTypes'
import { BATCH_DURATION, burstDuration, cascadeDuration } from '@/features/chests/unlockVisuals'

/**
 * The multi-chest reveal is swappable: a variant is just a frame-driven component plus its length,
 * and `CardBatchUnlockAnimation` holds no privileged place in the app. Adding a fourth one is a new
 * file and one entry in `BATCH_VARIANTS`; picking a different one is `ACTIVE_BATCH_VARIANT`.
 */
export type BatchVariantId = 'fan' | 'cascade' | 'burst'

export type BatchVariant = {
  id: BatchVariantId
  /** Shown in the dev picker. */
  label: string
  /** One line on how the reveal moves, for the dev picker's tooltip. */
  note: string
  component: ComponentType<BatchUnlockProps>
  /**
   * Frames the composition runs for. Takes the reveal count because the grid variants are paced
   * per card; a fixed length would hold their cards still.
   */
  durationInFrames: (cardCount: number) => number
}

export const BATCH_VARIANTS: readonly BatchVariant[] = [
  {
    id: 'fan',
    label: 'Fan',
    note: 'Single-card intro; the extras fan in behind it, then everything spreads into the grid.',
    component: CardBatchUnlockAnimation,
    durationInFrames: () => BATCH_DURATION,
  },
  {
    id: 'cascade',
    label: 'Cascade',
    note: 'Cards dealt in one per beat, flipping face-up as they land in their grid slot.',
    component: CardBatchUnlockCascade,
    durationInFrames: cascadeDuration,
  },
  {
    id: 'burst',
    label: 'Burst',
    note: 'A tilted pile at the centre blows apart into the grid, middle rows first.',
    component: CardBatchUnlockBurst,
    durationInFrames: burstDuration,
  },
]

/** The variant the app ships. Change this id to swap the multi-chest reveal everywhere. */
export const ACTIVE_BATCH_VARIANT: BatchVariantId = 'fan'

export function batchVariant(id: BatchVariantId) {
  return BATCH_VARIANTS.find((variant) => variant.id === id) ?? BATCH_VARIANTS[0]
}
