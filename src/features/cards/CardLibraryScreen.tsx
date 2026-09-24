import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import {
  CATALOG_SORTS,
  CardBrowserControls,
  CardBrowserEmpty,
  CardGrid,
  cardBrowserKey,
  useCardBrowser,
} from '@/features/cards/CardBrowser'
import { CardTile } from '@/features/cards/CardTile'
import type { CardBrowserItem } from '@/features/cards/CardBrowser'

export function CardLibraryScreen() {
  const { data: cards, isPending, error } = useCardCatalog()
  const { data: collection } = useCollection()
  const [ownedOnly, setOwnedOnly] = useState(true)

  const cardById = new Map((cards ?? []).map((card) => [card.id, card]))

  // One entry per OWNED COPY, not per catalog card. Copies level and rank independently,
  // so a player holding three of the same card gets three tiles, each with its own stars —
  // collapsing by card_id (the old behaviour) could only ever show one of them.
  const ownedItems: CardBrowserItem[] = (collection ?? []).flatMap((playerCard) => {
    const card = cardById.get(playerCard.card_id)
    return card ? [{ card, playerCard }] : []
  })

  // Catalog rows for cards the player has no copy of, so the library still shows what is
  // obtainable — greyed out by CardTile's `owned={false}`.
  const ownedCardIds = new Set((collection ?? []).map((row) => row.card_id))
  const unownedItems: CardBrowserItem[] = (cards ?? [])
    .filter((card) => !ownedCardIds.has(card.id))
    .map((card) => ({ card }))

  const items = ownedOnly ? ownedItems : [...ownedItems, ...unownedItems]
  const browser = useCardBrowser(items, { sorts: CATALOG_SORTS })

  return (
    <Screen title="Card Library">
      {error ? (
        <Panel>
          <p className="text-sm text-faction-ember">
            No database yet — run <code>npm run db:start</code> then <code>npm run db:reset</code>.
          </p>
        </Panel>
      ) : null}

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
          {browser.results.map((item) => (
            // The key is the player_cards id for an owned copy and the card id otherwise,
            // so copies of one card stay distinct (and links open the exact copy).
            <NavLink key={cardBrowserKey(item)} to={`/cards/${cardBrowserKey(item)}`}>
              {/* Show the owned copy's rank/level when there is one — the catalog row is only a template. */}
              <CardTile
                card={item.card}
                owned={Boolean(item.playerCard)}
                rank={item.playerCard?.rank}
                level={item.playerCard?.level ?? 1}
              />
            </NavLink>
          ))}
        </CardGrid>
      )}
    </Screen>
  )
}
