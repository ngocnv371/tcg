import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { resolveArtSrc } from '@/features/cards/CardTile'
import { RANK_META, cardAtk, cardDef, cardPower, levelUpGold } from '@/game/formulas'
import { supabase } from '@/lib/supabase'
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
  const { playerCardId } = useParams()
  const { data: cards } = useCardCatalog()
  const { data: collection } = useCollection()
  const card = cards?.find((row) => row.id === playerCardId)
  const owned = collection?.find((row) => row.card_id === playerCardId)
  const { data: costs } = useRankCosts(playerCardId)

  if (!card) {
    return (
      <Screen title="Card">
        <Panel>
          <p className="text-sm text-ink-400">
            Unknown card. <Link to="/cards" className="underline">Back to library</Link>
          </p>
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
