import { cardAtk, cardDef } from '@/game/formulas'
import { cn } from '@/lib/utils'
import type { Card, CardRank } from '@/types/db'

const RANK_BORDER: Record<number, string> = {
  1: 'border-rank-1',
  2: 'border-rank-2',
  3: 'border-rank-3',
  4: 'border-rank-4',
  5: 'border-rank-5',
}

const RANK_TEXT: Record<number, string> = {
  1: 'text-rank-1',
  2: 'text-rank-2',
  3: 'text-rank-3',
  4: 'text-rank-4',
  5: 'text-rank-5',
}

/** Only http(s) art_path values are real assets today; local `art/cards/*` paths are placeholders. */
export function resolveArtSrc(artPath: string | null): string | null {
  return artPath?.startsWith('http') ? artPath : null
}

export function CardTile({
  card,
  owned,
  selected = false,
  compact = false,
  level = 1,
  rank,
  badge,
  onClick,
}: {
  card: Card
  owned: boolean
  selected?: boolean
  /** Drops stats and tags for quarter-size tiles (party slots). */
  compact?: boolean
  /** Shows stats at this level instead of level 1 (pass the owned copy's level). */
  level?: number
  /**
   * The player's copy may be ranked above the catalog card, so callers that show an
   * owned copy must pass its rank — otherwise the tile displays a stale star count.
   */
  rank?: CardRank
  /** Short pill in the corner — used to flag e.g. "In party". */
  badge?: string
  onClick?: () => void
}) {
  const tags = card.tags ?? []
  const artSrc = resolveArtSrc(card.art_path)
  const displayRank = rank ?? card.rank

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? selected : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'relative aspect-[2/3] w-full overflow-hidden rounded-[10px] border-2 bg-ink-900 text-left',
        RANK_BORDER[displayRank],
        selected ? 'ring-2 ring-gold-400 ring-offset-2 ring-offset-ink-950' : '',
        owned ? '' : 'opacity-45 saturate-0',
        onClick ? 'cursor-pointer' : '',
      )}
    >
      {artSrc ? (
        <img
          src={artSrc}
          alt={card.name}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center font-display text-3xl text-ink-600"
        >
          ✦
        </span>
      )}

      {/* Tags and badge share one top-left column so the badge drops below the tags instead of overlapping. */}
      {tags.length > 0 || badge ? (
        <div className="absolute left-1 top-1 flex max-w-[68%] flex-col items-start gap-0.5">
          {tags.length && !compact ? (
            <div className="flex flex-wrap gap-0.5">
              {tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-ink-950/70 px-1 text-[8px] uppercase tracking-wide text-ink-300 backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {badge ? (
            <span className="rounded bg-gold-500/90 px-1 py-px text-[8px] font-medium uppercase tracking-wide text-ink-950">
              {badge}
            </span>
          ) : null}
        </div>
      ) : null}

      <span
        className={cn(
          'absolute right-1 top-1 rounded-md bg-ink-950/75 px-1.5 py-px font-display text-[10px] leading-tight backdrop-blur-sm',
          RANK_TEXT[displayRank],
        )}
      >
        {displayRank}★
      </span>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/75 to-transparent px-1.5 pb-1.5 pt-5">
        <p className="truncate text-[11px] leading-tight text-ink-50">{card.name}</p>
        {compact ? null : (
          <p className="text-[9px] tabular-nums text-ink-400">
            {cardAtk(displayRank, level)} ATK · {cardDef(displayRank, level)} DEF
          </p>
        )}
      </div>
    </div>
  )
}
