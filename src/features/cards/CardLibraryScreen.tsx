import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { cardAtk, cardDef } from '@/game/formulas'
import { cn } from '@/lib/utils'
import type { Card } from '@/types/db'

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
  onClick,
}: {
  card: Card
  owned: boolean
  selected?: boolean
  /** Drops stats and tags for quarter-size tiles (party slots). */
  compact?: boolean
  onClick?: () => void
}) {
  const tags = card.tags ?? []
  const artSrc = resolveArtSrc(card.art_path)

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
        RANK_BORDER[card.rank],
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

      {tags.length && !compact ? (
        <div className="absolute left-1 top-1 flex max-w-[68%] flex-wrap gap-0.5">
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

      <span
        className={cn(
          'absolute right-1 top-1 rounded-md bg-ink-950/75 px-1.5 py-px font-display text-[10px] leading-tight backdrop-blur-sm',
          RANK_TEXT[card.rank],
        )}
      >
        {card.rank}★
      </span>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/75 to-transparent px-1.5 pb-1.5 pt-5">
        <p className="truncate text-[11px] leading-tight text-ink-50">{card.name}</p>
        {compact ? null : (
          <p className="text-[9px] tabular-nums text-ink-400">
            {cardAtk(card.rank, 1)} ATK · {cardDef(card.rank, 1)} DEF
          </p>
        )}
      </div>
    </div>
  )
}

export function CardLibraryScreen() {
  const { data: cards, isPending, error } = useCardCatalog()
  const { data: collection } = useCollection()
  const [nameFilter, setNameFilter] = useState('')
  const [rankFilter, setRankFilter] = useState<number | null>(null)
  const [ownedOnly, setOwnedOnly] = useState(false)
  const ownedIds = new Set((collection ?? []).map((row) => row.card_id))

  const filteredCards = (cards ?? []).filter((card) => {
    const matchesName = card.name.toLowerCase().includes(nameFilter.trim().toLowerCase())
    const matchesRank = rankFilter === null || card.rank === rankFilter
    return matchesName && matchesRank && (!ownedOnly || ownedIds.has(card.id))
  })

  const byRank = (cards ?? []).reduce<Record<number, number>>((acc, card) => {
    acc[card.rank] = (acc[card.rank] ?? 0) + 1
    return acc
  }, {})

  return (
    <Screen
      title="Card Library"
      week="Built in week 3"
      hint={`${cards?.length ?? 0} in catalog · ${collection?.length ?? 0} owned`}
    >
      {error ? (
        <Panel>
          <p className="text-sm text-faction-ember">
            No database yet — run <code>npm run db:start</code> then <code>npm run db:reset</code>.
          </p>
        </Panel>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1.5 text-[11px] text-ink-400">
        {[1, 2, 3, 4, 5].map((rank) => (
          <span key={rank} className="rounded-full bg-ink-850 px-2 py-0.5">
            {rank}★ {byRank[rank] ?? 0}
          </span>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
        <input
          type="search"
          value={nameFilter}
          onChange={(event) => setNameFilter(event.target.value)}
          placeholder="Search cards"
          aria-label="Filter cards by name"
          className="min-w-0 rounded-card border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        />
        <label className="flex items-center gap-2 rounded-card border border-ink-700 bg-ink-900 px-3 text-xs text-ink-200">
          <input
            type="checkbox"
            checked={ownedOnly}
            onChange={(event) => setOwnedOnly(event.target.checked)}
          />
          Owned
        </label>
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setRankFilter(null)}
          className={`rounded-card px-2 py-1 text-xs ${rankFilter === null ? 'bg-gold-500 text-ink-950' : 'bg-ink-850 text-ink-300'}`}
        >
          All stars
        </button>
        {[1, 2, 3, 4, 5].map((rank) => (
          <button
            key={rank}
            type="button"
            onClick={() => setRankFilter(rank)}
            className={`shrink-0 rounded-card px-2 py-1 text-xs ${rankFilter === rank ? 'bg-gold-500 text-ink-950' : 'bg-ink-850 text-ink-300'}`}
          >
            {rank}★
          </button>
        ))}
      </div>

      {isPending ? <p className="text-sm text-ink-400">Loading catalog…</p> : null}

      <div className="grid grid-cols-3 gap-2">
        {filteredCards.map((card) => (
          <NavLink key={card.id} to={`/cards/${card.id}`}>
            <CardTile card={card} owned={ownedIds.has(card.id)} />
          </NavLink>
        ))}
      </div>
    </Screen>
  )
}
