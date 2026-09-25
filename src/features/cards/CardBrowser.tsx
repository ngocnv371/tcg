import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'
import { cardPower } from '@/game/formulas'
import type { Card, CardRank, PlayerCard } from '@/types/db'

/**
 * One row in a browsable card list. `playerCard` is present when browsing an owned
 * copy (the party picker, and owned entries in the library) and absent when browsing a
 * catalog card the player does not own — everything downstream falls back to the
 * catalog values when it is missing.
 *
 * A card the player owns several copies of produces one item PER COPY: each copy has
 * its own rank/level, so they cannot share a row.
 */
export type CardBrowserItem = {
  card: Card
  playerCard?: PlayerCard
}

export type CardSort =
  | 'power-desc'
  | 'power-asc'
  | 'level-desc'
  | 'rank-desc'
  | 'recent'
  | 'name-asc'

const CARD_SORTS: ReadonlyArray<{ value: CardSort; label: string }> = [
  { value: 'power-desc', label: 'Power ↓' },
  { value: 'power-asc', label: 'Power ↑' },
  { value: 'level-desc', label: 'Level ↓' },
  { value: 'rank-desc', label: 'Stars ↓' },
  { value: 'recent', label: 'New ↓' },
  { value: 'name-asc', label: 'Name A → Z' },
]

/**
 * Sorts offered by the library. 'recent' belongs here now that the library lists owned
 * copies (there is an `obtained_at` to sort on) instead of only catalog rows.
 */
export const CATALOG_SORTS: readonly CardSort[] = CARD_SORTS.map((option) => option.value)

/** Sorts that only make sense when browsing owned copies. */
export const OWNED_SORTS: readonly CardSort[] = CARD_SORTS.map((option) => option.value)

/**
 * React key for a browsable row. Owned copies key off the player_cards row, so two
 * copies of the same card are distinct entries rather than a duplicate React key.
 */
export function cardBrowserKey(item: CardBrowserItem): string {
  return item.playerCard?.id ?? item.card.id
}

export function cardRank(item: CardBrowserItem): CardRank {
  return item.playerCard?.rank ?? item.card.rank
}

export function cardLevel(item: CardBrowserItem): number {
  return item.playerCard?.level ?? 1
}

function primaryCompare(a: CardBrowserItem, b: CardBrowserItem, sort: CardSort): number {
  switch (sort) {
    case 'power-asc':
      return cardPower(cardRank(a), cardLevel(a)) - cardPower(cardRank(b), cardLevel(b))
    case 'level-desc':
      return cardLevel(b) - cardLevel(a)
    case 'rank-desc':
      return cardRank(b) - cardRank(a) || cardLevel(b) - cardLevel(a)
    case 'recent':
      return (b.playerCard?.obtained_at ?? '').localeCompare(a.playerCard?.obtained_at ?? '')
    case 'name-asc':
      return a.card.name.localeCompare(b.card.name)
    case 'power-desc':
    default:
      return cardPower(cardRank(b), cardLevel(b)) - cardPower(cardRank(a), cardLevel(a))
  }
}

/**
 * Sorts by the chosen key, then by name and row id. The tiebreakers keep copies of one
 * card next to each other instead of scattering them wherever the sort happened to land.
 */
function compare(a: CardBrowserItem, b: CardBrowserItem, sort: CardSort): number {
  const primary = primaryCompare(a, b, sort)
  if (primary !== 0) return primary
  return a.card.name.localeCompare(b.card.name) || cardBrowserKey(a).localeCompare(cardBrowserKey(b))
}

export function useCardBrowser(
  items: readonly CardBrowserItem[],
  options?: { sorts?: readonly CardSort[]; initialSort?: CardSort },
) {
  const sorts = options?.sorts ?? OWNED_SORTS
  const sortOptions = CARD_SORTS.filter((option) => sorts.includes(option.value))
  const [nameFilter, setNameFilter] = useState('')
  const [rankFilter, setRankFilter] = useState<CardRank | null>(null)
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [sort, setSort] = useState<CardSort>(options?.initialSort ?? sorts[0] ?? 'power-desc')

  /**
   * Tag chips come from the browsed items, not the whole catalog, so tags that only
   * exist on cards outside the current context never show up as dead filters.
   */
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const { card } of items) {
      for (const tag of card.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }))
  }, [items])

  const results = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase()
    return items
      .filter((item) => {
        const matchesName = needle === '' || item.card.name.toLowerCase().includes(needle)
        // Stars filter on the copy the player sees, not the catalog template: a
        // ranked-up 3★ copy must show up under 3★, not under the card's seed rank.
        return matchesName && (rankFilter === null || cardRank(item) === rankFilter)
      })
      .filter((item) => {
        // Tags match on any (OR) — requiring every tag would usually empty the grid.
        if (tagFilters.length === 0) return true
        const tags = item.card.tags ?? []
        return tagFilters.some((tag) => tags.includes(tag))
      })
      .sort((a, b) => compare(a, b, sort))
  }, [items, nameFilter, rankFilter, tagFilters, sort])

  const filtersActive =
    nameFilter.trim() !== '' || rankFilter !== null || tagFilters.length > 0

  function toggleTag(tag: string) {
    setTagFilters((current) =>
      current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag],
    )
  }

  function reset() {
    setNameFilter('')
    setRankFilter(null)
    setTagFilters([])
  }

  return {
    nameFilter,
    setNameFilter,
    rankFilter,
    setRankFilter,
    tagFilters,
    toggleTag,
    sort,
    setSort,
    sortOptions,
    tags,
    results,
    filtersActive,
    reset,
  }
}

export type CardBrowser = ReturnType<typeof useCardBrowser>

/**
 * Search + sort + rank/tag filters shared by the library and the party picker.
 * `searchTrailing` and `rankTrailing` are the hook points for screen-specific controls
 * (the library's "Owned only" toggle, the picker's "Clear slot" action).
 */
export function CardBrowserControls({
  browser,
  placeholder = 'Search cards',
  autoFocusSearch = false,
  searchTrailing,
  rankTrailing,
}: {
  browser: CardBrowser
  placeholder?: string
  /** Modal pickers focus the search box; the library leaves focus alone. */
  autoFocusSearch?: boolean
  searchTrailing?: React.ReactNode
  rankTrailing?: React.ReactNode
}) {
  return (
    <>
      <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
        <input
          type="search"
          value={browser.nameFilter}
          onChange={(event) => browser.setNameFilter(event.target.value)}
          placeholder={placeholder}
          aria-label="Search cards by name"
          autoFocus={autoFocusSearch}
          className="min-w-0 rounded-card border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        />
        <select
          value={browser.sort}
          onChange={(event) => browser.setSort(event.target.value as CardSort)}
          aria-label="Sort cards"
          className="max-w-[9.5rem] rounded-card border border-ink-700 bg-ink-900 px-2 py-2 text-xs text-ink-100"
        >
          {browser.sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {searchTrailing ? <div className="mb-2 flex flex-wrap gap-2">{searchTrailing}</div> : null}

      <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => browser.setRankFilter(null)}
          className={cn(
            'shrink-0 rounded-card px-2 py-1 text-xs',
            browser.rankFilter === null ? 'bg-gold-500 text-ink-950' : 'bg-ink-850 text-ink-300',
          )}
        >
          All stars
        </button>
        {([1, 2, 3, 4, 5] as const).map((rank) => (
          <button
            key={rank}
            type="button"
            onClick={() => browser.setRankFilter(rank)}
            className={cn(
              'shrink-0 rounded-card px-2 py-1 text-xs',
              browser.rankFilter === rank ? 'bg-gold-500 text-ink-950' : 'bg-ink-850 text-ink-300',
            )}
          >
            {rank}★
          </button>
        ))}
        {rankTrailing ? <div className="ml-auto shrink-0">{rankTrailing}</div> : null}
      </div>

      {browser.tags.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {browser.tags.map(({ tag, count }) => {
            const active = browser.tagFilters.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => browser.toggleTag(tag)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px]',
                  active
                    ? 'border-gold-400 bg-gold-500/15 text-gold-200'
                    : 'border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200',
                )}
              >
                {tag}
                <span className="ml-1 text-ink-500 tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-ink-500">
        <span className="tabular-nums">
          {browser.results.length} {browser.results.length === 1 ? 'card' : 'cards'}
          {browser.tagFilters.length > 1 ? ' · any tag' : ''}
        </span>
        {browser.filtersActive ? (
          <button
            type="button"
            onClick={browser.reset}
            className="text-ink-400 underline-offset-2 hover:text-ink-100 hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </>
  )
}

/** Shared 3-up card grid. Children are tiles; wrappers differ per screen. */
export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>
}

export function CardBrowserEmpty({
  totalCount,
  filtersActive,
  onReset,
  emptyMessage,
}: {
  totalCount: number
  filtersActive: boolean
  onReset: () => void
  emptyMessage: string
}) {
  return (
    <div className="rounded-card border border-dashed border-ink-700 bg-ink-900/60 px-4 py-8 text-center text-sm text-ink-400">
      <p>{totalCount === 0 ? emptyMessage : 'No cards match these filters.'}</p>
      {totalCount > 0 && filtersActive ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 text-xs text-gold-300 underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}
