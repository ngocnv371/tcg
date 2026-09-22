import { useCallback, useState } from 'react'

import { ACTIVE_BATCH_VARIANT, BATCH_VARIANTS, type BatchVariantId } from '@/features/chests/batchVariants'

const STORAGE_KEY = 'dev.batchVariant'

function isVariantId(value: string | null): value is BatchVariantId {
  return BATCH_VARIANTS.some((variant) => variant.id === value)
}

/**
 * Which batch reveal plays. Production is always `ACTIVE_BATCH_VARIANT`; in dev the picker on the
 * Chests screen wins and survives a reload, so the alternatives can be opened one after another
 * without editing the constant between runs.
 */
export function useBatchVariant() {
  const [id, setId] = useState<BatchVariantId>(() => {
    if (!import.meta.env.DEV) return ACTIVE_BATCH_VARIANT
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isVariantId(stored) ? stored : ACTIVE_BATCH_VARIANT
  })

  const select = useCallback((next: BatchVariantId) => {
    window.localStorage.setItem(STORAGE_KEY, next)
    setId(next)
  }, [])

  return { id, select }
}
