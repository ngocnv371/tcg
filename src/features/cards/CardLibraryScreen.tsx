import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import {
  CATALOG_SORTS,
  CardBrowserControls,
  CardBrowserEmpty,
  CardGrid,
  useCardBrowser,
} from '@/features/cards/CardBrowser'
import { CardTile } from '@/features/cards/CardTile'
import type { CardBrowserItem } from '@/features/cards/CardBrowser'

export function CardLibraryScreen() {
  const { data: cards, isPending, error } = useCardCatalog()
  const { data: collection } = useCollection()
  const [ownedOnly, setOwnedOnly] = useState(false)

  const ownedByCardId = new Map((collection ?? []).map((row) => [row.card_id, row]))
  const allItems: CardBrowserItem[] = (cards ?? []).map((card) => ({
    card,
    playerCard: ownedByCardId.get(card.id),
  }))
  const items = ownedOnly ? allItems.filter((item) => item.playerCard) : allItems
  const browser = useCardBrowser(items, { sorts: CATALOG_SORTS })

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

      <CardBrowserControls
        browser={browser}
        placeholder="Search cards"
        searchTrailing={
          <label className="flex items-center gap-2 rounded-card border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs text-ink-200">
            <input
              type="checkbox"
              checked={ownedOnly}
              onChange={(event) => setOwnedOnly(event.target.checked)}
            />
            Owned only
          </label>
        }
      />

      {isPending ? <p className="text-sm text-ink-400">Loading catalog…</p> : null}

      {browser.results.length === 0 ? (
        <CardBrowserEmpty
          totalCount={items.length}
          filtersActive={browser.filtersActive}
          onReset={browser.reset}
          emptyMessage={
            ownedOnly
              ? 'You own no cards yet — open a chest to start your collection.'
              : 'The card catalog is empty.'
          }
        />
      ) : (
        <CardGrid>
          {browser.results.map(({ card, playerCard }) => (
            <NavLink key={card.id} to={`/cards/${card.id}`}>
              {/* Show the owned copy's rank/level when there is one — the catalog row is only a template. */}
              <CardTile
                card={card}
                owned={Boolean(playerCard)}
                rank={playerCard?.rank}
                level={playerCard?.level ?? 1}
              />
            </NavLink>
          ))}
        </CardGrid>
      )}
    </Screen>
  )
}
