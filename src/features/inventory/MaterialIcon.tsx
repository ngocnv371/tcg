import { Package } from 'lucide-react'

import { resolveArtSrc } from '@/lib/art'
import { cn } from '@/lib/utils'
import type { Material } from '@/types/db'

/**
 * A material's uploaded icon, or a neutral crate when the catalog has no art for it yet.
 * Cards and dungeons both fall back to a glyph this way; the crate is deliberately bland so a
 * missing asset reads as "not rendered" rather than as a specific material.
 */
export function MaterialIcon({
  material,
  size = 28,
  className,
}: {
  material?: Material | null
  size?: number
  className?: string
}) {
  const src = resolveArtSrc(material?.icon ?? null)
  if (material && src) {
    return (
      <img
        src={src}
        alt={material.name}
        width={size}
        height={size}
        loading="lazy"
        className={cn('shrink-0 rounded-card object-contain', className)}
      />
    )
  }
  return <Package aria-hidden size={size} strokeWidth={1.5} className={cn('shrink-0 text-ink-600', className)} />
}
