import type { ComponentType } from 'react'

import { CardBatchUnlockAnimation } from '@/features/chests/CardBatchUnlockAnimation'
import { CardBatchUnlockBurst } from '@/features/chests/CardBatchUnlockBurst'
import { CardBatchUnlockCascade } from '@/features/chests/CardBatchUnlockCascade'
import type { BatchUnlockProps } from '@/features/chests/batchTypes'
import { BATCH_DURATION, burstDuration, cascadeDuration } from '@/features/chests/unlockVisuals'

/**
 * The multi-chest reveal is swappable: a variant is just a frame-driven component plus its length,
 * and `CardBatchUnlockAnimation` holds no privileged place in the app. `pickBatchVariant` draws one
 * per open, so a bulk opening keeps changing shape instead of replaying the same reveal. Adding a
 * fourth variant is a new file and one entry in `BATCH_VARIANTS`.
 */
export type BatchVariantId = 'fan' | 'cascade' | 'burst'

export type BatchVariant = {
  id: BatchVariantId
  /** Shown in the dev console log of an opening. */
  label: string
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
    component: CardBatchUnlockAnimation,
    durationInFrames: () => BATCH_DURATION,
  },
  {
    id: 'cascade',
    label: 'Cascade',
    component: CardBatchUnlockCascade,
    durationInFrames: cascadeDuration,
  },
  {
    id: 'burst',
    label: 'Burst',
    component: CardBatchUnlockBurst,
    durationInFrames: burstDuration,
  },
]

/**
 * Draws the variant for one open. Only the presentation varies — unlike a drop roll nothing of
 * value rides on it, so it is allowed to be client-side and non-deterministic. Draw it once when
 * the reveal is created and keep it: the Player's `component` must not change between renders of
 * the same animation.
 */
export function pickBatchVariant() {
  return BATCH_VARIANTS[Math.floor(Math.random() * BATCH_VARIANTS.length)]
}

export function batchVariant(id: BatchVariantId) {
  return BATCH_VARIANTS.find((variant) => variant.id === id) ?? BATCH_VARIANTS[0]
}
