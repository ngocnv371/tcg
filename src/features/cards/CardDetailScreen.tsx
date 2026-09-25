import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog, useCollection, useRankCosts, useRankUpCard } from '@/features/cards/api'
import { RankUpOverlay, type RankUpReveal } from '@/features/cards/RankUpOverlay'
import { useDungeons } from '@/features/dungeons/api'
import { dungeonsDropping } from '@/features/dungeons/farmRoutes'
import { useInventory, useMaterialCatalog } from '@/features/inventory/api'
import { MaterialIcon } from '@/features/inventory/MaterialIcon'
import { useProfile } from '@/features/profile/api'
import { RANK_META, cardAtk, cardDef, cardPower, levelUpGold, tagLabel } from '@/game/formulas'
import { resolveArtSrc } from '@/lib/art'
import { cn } from '@/lib/utils'

/** `greater_fire_core` → `Greater Fire Core`, for materials missing from the catalog query. */
function materialLabel(id: string) {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
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

  // Copies rank and level independently, so "the card" is whichever instance the route names
  // (falling back to the strongest one when the link pointed at a catalog id).
  const owned =
    copyByRef ??
    (collection ?? [])
      .filter((row) => row.card_id === cardId)
      .sort((a, b) => cardPower(b.rank, b.level) - cardPower(a.rank, a.level))[0]

  const { data: costs } = useRankCosts(cardId)
  const { data: inventory } = useInventory()
  const { data: materials } = useMaterialCatalog()
  const { data: dungeons } = useDungeons()
  const { data: profile } = useProfile()
  const rankUp = useRankUpCard()
  const [reveal, setReveal] = useState<RankUpReveal | null>(null)

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

  // The next step on this card's ladder, and what the player already holds against it. The
  // client only ever *previews* this: `rank_up_card` re-reads `card_rank_costs` and rejects
  // the call if the balance moved, so the button can be optimistic without being authoritative.
  const step = (costs ?? []).find((cost) => cost.from_rank === rank)
  const ownedQty = new Map((inventory ?? []).map((row) => [row.material_id, row.qty]))
  const materialById = new Map((materials ?? []).map((material) => [material.id, material]))
  const gold = profile?.gold ?? 0
  const requirements = step
    ? [
        { have: gold, id: 'gold', label: 'Gold', need: step.gold },
        ...Object.entries(step.materials).map(([id, need]) => ({
          have: ownedQty.get(id) ?? 0,
          id,
          label: materials?.find((material) => material.id === id)?.name ?? materialLabel(id),
          need,
        })),
      ]
    : []
  const short = requirements.filter((requirement) => requirement.have < requirement.need)
  const canRankUp = Boolean(owned) && Boolean(step) && short.length === 0 && !rankUp.isPending

  const handleRankUp = () => {
    if (!owned || !step) return
    const fromRank = rank
    rankUp
      .mutateAsync(owned.id)
      .then(() => {
        setReveal({
          artPath: card.art_path,
          cardName: card.name,
          fromRank,
          key: `${owned.id}-${step.to_rank}-${Date.now()}`,
          toRank: step.to_rank,
        })
      })
      // The server owns the real check; a rejection (a spend somewhere else, a stale screen)
      // just leaves the panel showing the new numbers.
      .catch(() => undefined)
  }

  return (
    <Screen title={card.name} hint={`${rank}★ · ${card.faction} · ${card.role}`}>
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
                {tagLabel(tag)}
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
            <p className="mt-3 text-xs text-ink-400">Not in your collection yet — open a chest to find one.</p>
          )}
        </Panel>

        <Panel title="Passive">
          <p className="text-sm text-ink-100">{card.passive_name}</p>
          <p className="mt-1 text-sm text-ink-400">{card.passive_text}</p>
          <p className="mt-2 text-xs text-ink-600 italic">{card.lore}</p>
        </Panel>

        <Panel title="Rank up">
          {!owned ? (
            <p className="text-sm text-ink-400">Not in your collection yet — open a chest first.</p>
          ) : !step ? (
            <p className="text-sm text-ink-400">
              Already at 5★, the top of the ladder. No further rank-up path.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-400">
                {step.from_rank}★ → <span className="text-ink-100">{step.to_rank}★</span> · level cap{' '}
                {RANK_META[step.to_rank].levelCap}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {requirements.map((requirement) => {
                  const met = requirement.have >= requirement.need
                  return (
                    <li key={requirement.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className={met ? 'text-rank-2' : 'text-ink-600'}>
                          {met ? '✓' : '✗'}
                        </span>
                        {requirement.id === 'gold' ? null : (
                          <MaterialIcon material={materialById.get(requirement.id)} size={20} />
                        )}
                        <span className={met ? 'truncate text-ink-300' : 'truncate text-ink-400'}>
                          {requirement.label}
                        </span>
                      </span>
                      <span
                        className={cn('tabular-nums', met ? 'text-ink-200' : 'text-faction-ember')}
                      >
                        {requirement.have.toLocaleString('en-US')} /{' '}
                        {requirement.need.toLocaleString('en-US')}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                className="mt-3 w-full rounded-card bg-gold-500 px-3 py-2 text-sm font-medium text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canRankUp}
                onClick={handleRankUp}
              >
                {rankUp.isPending ? 'Ranking up…' : `Rank up to ${step.to_rank}★`}
              </button>
              {short.length ? (
                <div className="mt-3 space-y-2 border-t border-ink-800 pt-3">
                  <p className="text-xs text-ink-500">Still needed:</p>
                  {short.map((requirement) => {
                    // Turn a shortfall into a destination: the dungeons that list this drop,
                    // easiest first. Gold is the exception — every dungeon pays it.
                    const farms =
                      requirement.id === 'gold'
                        ? []
                        : dungeonsDropping(requirement.id, dungeons ?? [])
                    const more = requirement.need - requirement.have
                    return (
                      <div key={requirement.id} className="text-xs">
                        <p className="text-faction-ember">
                          {more.toLocaleString('en-US')} more {requirement.label}
                        </p>
                        {requirement.id === 'gold' ? (
                          <p className="mt-0.5 text-ink-600">
                            Gold drops from every dungeon —{' '}
                            <Link to="/dungeons" className="text-gold-300 underline">
                              go farming
                            </Link>
                            .
                          </p>
                        ) : farms.length ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {farms.slice(0, 4).map((dungeon) => (
                              <Link
                                key={dungeon.id}
                                to={`/dungeons?focus=${dungeon.id}`}
                                className="rounded-card border border-gold-600 px-2 py-1 text-[11px] text-gold-300 hover:bg-ink-850"
                              >
                                Farm {dungeon.name}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-0.5 text-ink-600">No dungeon lists this drop yet.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {rankUp.error ? (
                <p className="mt-2 text-xs text-faction-ember">{rankUp.error.message}</p>
              ) : null}
            </>
          )}
        </Panel>
      </div>
      {reveal ? <RankUpOverlay onClose={() => setReveal(null)} reveal={reveal} /> : null}
    </Screen>
  )
}
