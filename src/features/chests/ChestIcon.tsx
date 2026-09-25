import { Gift } from 'lucide-react'

import { resolveArtSrc } from '@/lib/art'
import { cn } from '@/lib/utils'
import type { Chest } from '@/types/db'

/**
 * A chest's uploaded art, or a neutral gift glyph when the catalog has no art for it yet.
 * Mirrors MaterialIcon: the fallback is deliberately bland so a missing asset reads as
 * "not rendered" rather than as a specific chest.
 */
export function ChestIcon({
  chest,
  size = 28,
  className,
}: {
  chest?: Chest | null
  size?: number
  className?: string
}) {
  const src = resolveArtSrc(chest?.icon ?? null)
  if (chest && src) {
    return (
      <img
        src={src}
        alt={chest.name}
        width={size}
        height={size}
        loading="lazy"
        className={cn('shrink-0 rounded-card object-contain', className)}
      />
    )
  }
  return <Gift aria-hidden size={size} strokeWidth={1.5} className={cn('shrink-0 text-ink-600', className)} />
}
