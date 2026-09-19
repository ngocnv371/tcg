import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { RANK_META, cardAtk, cardDef, cardPower, levelUpGold } from '@/game/formulas'
import { resolveArtSrc } from '@/lib/art'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { RankCost } from '@/types/db'

function useRankCosts(cardId: string | undefined) {
  return useQuery({
    queryKey: ['card_rank_costs', cardId],
    enabled: Boolean(cardId),
    queryFn: async (): Promise<RankCost[]> => {
      const { data, error } = await supabase
        .from('card_rank_costs')
        .select('*')
        .eq('card_id', cardId!)
        .order('to_rank')
      if (error) throw error
      return (data ?? []) as RankCost[]
    },
  })
}

export function CardDetailScreen() {
  const { cardRefId } = useParams()
  const { data: cards, isPending: catalogPending } = useCardCatalog()
  const { data: collection, isPending: collectionPending } = useCollection()

  // The route carries either an owned copy's id (library tiles, chest reveals) or a catalog
  // card id (a card you do not own yet, and links made before copies existed). Resolve the
  // copy first: only it knows which instance's rank and level to show.
  const copyByRef = collection?.find((row) => row.id === cardRefId)
  const cardId = copyByRef?.card_id ?? cardRefId
  const card = cards?.find((row) => row.id === cardId)

  // Every copy of this card, strongest first. They level and rank independently, so the
  // list is how a player moves between, say, their 1★ and their 3★ of the same card.
  const copies = (collection ?? [])
    .filter((row) => row.card_id === cardId)
    .sort((a, b) => cardPower(b.rank, b.level) - cardPower(a.rank, a.level))
  const owned = copyByRef ?? copies[0]
  const { data: costs } = useRankCosts(cardId)

  if (!card) {
    const loading = catalogPending || collectionPending
    return (
      <Screen title="Card">
        <Panel>
          {loading ? (
            <p className="text-sm text-ink-400">Loading card…</p>
          ) : (
            <p className="text-sm text-ink-400">
              Unknown card. <Link to="/cards" className="underline">Back to library</Link>
            </p>
          )}
        </Panel>
      </Screen>
    )
  }

  const level = owned?.level ?? 1
  const rank = owned?.rank ?? card.rank
  const tags = card.tags ?? []
  const artSrc = resolveArtSrc(card.art_path)

  return (
    <Screen title={card.name} week="Built in weeks 3 + 8" hint={`${rank}★ · ${card.faction} · ${card.role}`}>
      <div className="space-y-3">
        {artSrc ? (
          <div className="aspect-3/4 w-full overflow-hidden rounded-card bg-ink-850">
            <img src={artSrc} alt={card.name} className="h-full w-full object-cover" />
          </div>
        ) : null}
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="rounded-card bg-ink-850 px-2 py-1 text-xs text-ink-200">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <Panel title="Stats">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-400">Level</dt>
            <dd className="tabular-nums">
              {level} / {RANK_META[rank].levelCap}
            </dd>
            <dt className="text-ink-400">ATK</dt>
            <dd className="tabular-nums">{cardAtk(rank, level)}</dd>
            <dt className="text-ink-400">DEF</dt>
            <dd className="tabular-nums">{cardDef(rank, level)}</dd>
            <dt className="text-ink-400">Power</dt>
            <dd className="tabular-nums">{cardPower(rank, level)}</dd>
            <dt className="text-ink-400">Next level</dt>
            <dd className="tabular-nums">{levelUpGold(level)} gold</dd>
          </dl>
          {owned ? null : (
            <p className="mt-3 text-xs text-ink-400">Not in your collection yet — open a chest (week 4).</p>
          )}
        </Panel>

        {copies.length > 1 ? (
          <Panel title={`Your copies (${copies.length})`}>
            <ul className="space-y-1.5">
              {copies.map((copy) => {
                const isViewing = copy.id === owned?.id
                return (
                  <li key={copy.id}>
                    <Link
                      to={`/cards/${copy.id}`}
                      aria-current={isViewing ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-card border px-3 py-2 text-sm',
                        isViewing
                          ? 'border-gold-500/60 bg-gold-500/10 text-ink-100'
                          : 'border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100',
                      )}
                    >
                      <span className="tabular-nums">
                        {copy.rank}★ · Lv {copy.level}
                      </span>
                      <span className="tabular-nums text-xs text-ink-400">
                        {cardPower(copy.rank, copy.level)} power
                        {isViewing ? ' · viewing' : ''}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Panel>
        ) : null}

        <Panel title="Passive">
          <p className="text-sm text-ink-100">{card.passive_name}</p>
          <p className="mt-1 text-sm text-ink-400">{card.passive_text}</p>
          <p className="mt-2 text-xs text-ink-600 italic">{card.lore}</p>
        </Panel>

        <Panel title="Rank-up requirements">
          <ul className="space-y-1.5 text-sm text-ink-400">
            {(costs ?? []).map((cost) => (
              <li key={cost.to_rank} className="flex justify-between gap-3">
                <span>
                  {cost.from_rank}★ → {cost.to_rank}★
                </span>
                <span className="tabular-nums text-right text-ink-200">
                  {cost.gold.toLocaleString('en-US')}g
                  {Object.entries(cost.materials).length
                    ? ` · ${Object.entries(cost.materials)
                        .map(([id, qty]) => `${qty}× ${id}`)
                        .join(', ')}`
                    : ''}
                </span>
              </li>
            ))}
            {(costs ?? []).length === 0 ? <li>No rank-up path (already 5★).</li> : null}
          </ul>
        </Panel>
      </div>
    </Screen>
  )
}
