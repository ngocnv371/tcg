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

export function CardTile({ card, owned }: { card: Card; owned: boolean }) {
  return (
    <div
      className={cn(
        'rounded-card border-2 bg-ink-900/80 p-2 text-left',
        RANK_BORDER[card.rank],
        owned ? '' : 'opacity-45 saturate-0',
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
    </div>
  )
}

export function CardLibraryScreen() {
  const { data: cards, isPending, error } = useCardCatalog()
  const { data: collection } = useCollection()
  const ownedIds = new Set((collection ?? []).map((row) => row.card_id))

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

      {isPending ? <p className="text-sm text-ink-400">Loading catalog…</p> : null}

      <div className="grid grid-cols-3 gap-2.5">
        {(cards ?? []).map((card) => (
          <NavLink key={card.id} to={`/cards/${card.id}`}>
            <CardTile card={card} owned={ownedIds.has(card.id)} />
          </NavLink>
        ))}
      </div>
    </Screen>
  )
}
