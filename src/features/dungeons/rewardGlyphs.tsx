import {
  Coins,
  Droplets,
  Flame,
  Gem,
  Gift,
  Leaf,
  Moon,
  Mountain,
  Package,
  Snowflake,
  Sparkles,
  Sword,
  Zap,
} from 'lucide-react'

import type { RewardIcon } from '@/features/dungeons/runVictoryVisuals'
import type { CoreTag } from '@/game/formulas'

/**
 * Placeholder glyphs for the reward grid, keyed by what `rewardIcon()` names. Kept out of
 * `runVictoryVisuals.ts` so that module stays React-free and unit testable.
 *
 * Both maps are exhaustive on purpose: adding a Core tag to `CORE_TAGS` fails typecheck
 * here instead of silently rendering nothing for a new element.
 */
const CORE_GLYPHS = {
  dark: Moon,
  dragon: Sparkles,
  earth: Mountain,
  electric: Zap,
  fire: Flame,
  grass: Leaf,
  ice: Snowflake,
  physical: Sword,
  water: Droplets,
} satisfies Record<CoreTag, typeof Coins>

const OTHER_GLYPHS = {
  chest: Gift,
  gold: Coins,
  material: Package,
  shard: Gem,
} satisfies Record<Exclude<RewardIcon['kind'], 'core'>, typeof Coins>

export function RewardGlyph({ icon, size }: { icon: RewardIcon; size: number }) {
  const Glyph = icon.kind === 'core' ? CORE_GLYPHS[icon.tag] : OTHER_GLYPHS[icon.kind]
  return <Glyph size={size} strokeWidth={1.6} />
}
