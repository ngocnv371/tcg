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

export function CardTile({
  card,
  owned,
  selected = false,
  onClick,
}: {
  card: Card
  owned: boolean
  selected?: boolean
  onClick?: () => void
}) {
  const tags = card.tags ?? []

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
        'rounded-card border-2 bg-ink-900/80 p-2 text-left',
        RANK_BORDER[card.rank],
        selected ? 'ring-2 ring-gold-400 ring-offset-2 ring-offset-ink-950' : '',
        owned ? '' : 'opacity-45 saturate-0',
        onClick ? 'cursor-pointer' : '',
      )}
    >
      <div className="aspect-3/4 w-full rounded-[8px] bg-ink-850">
        <span className="grid h-full place-items-center font-display text-2xl text-ink-600">
          {card.rank}★
        </span>
      </div>
      <p className="mt-1.5 truncate text-xs text-ink-100">{card.name}</p>
      <p className="text-[10px] text-ink-400">
        {cardAtk(card.rank, 1)} ATK · {cardDef(card.rank, 1)} DEF
      </p>
      {tags.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="rounded bg-ink-800 px-1 py-0.5 text-[9px] text-ink-300">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
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

      <div className="grid grid-cols-3 gap-2.5">
        {filteredCards.map((card) => (
          <NavLink key={card.id} to={`/cards/${card.id}`}>
            <CardTile card={card} owned={ownedIds.has(card.id)} />
          </NavLink>
        ))}
      </div>
    </Screen>
  )
}
