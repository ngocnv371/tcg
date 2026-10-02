import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import {
  useCardCatalog,
  useCollection,
  useLevelUpStat,
  useRankUpCard,
  type CardStat,
} from '@/features/cards/api'
import { RankUpOverlay, type RankUpReveal } from '@/features/cards/RankUpOverlay'
import { useDungeons } from '@/features/dungeons/api'
import { dungeonsDropping } from '@/features/dungeons/farmRoutes'
import { useInventory, useMaterialCatalog } from '@/features/inventory/api'
import { useParties } from '@/features/party/api'
import { useProfile } from '@/features/profile/api'
import {
  RANK_META,
  cardAtk,
  cardDef,
  cardHp,
  cardSpd,
  rankUpRequirement,
  rankUpValue,
  selectRankUpFodder,
  statLevelCost,
  tagLabel,
  type CardRank,
} from '@/game/formulas'
import { resolveArtSrc } from '@/lib/art'
import { cn } from '@/lib/utils'

/** `greater_fire_core` → `Greater Fire Core`, for materials missing from the catalog query. */
function materialLabel(id: string) {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const STAT_ROWS: ReadonlyArray<{ key: CardStat; label: string }> = [
  { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' },
  { key: 'hp', label: 'HP' },
  { key: 'spd', label: 'SPD' },
]

export function CardDetailScreen() {
  const { cardRefId } = useParams()
  const { data: cards, isPending: catalogPending } = useCardCatalog()
  const { data: collection, isPending: collectionPending } = useCollection()

  // The route carries either an owned copy's id (library tiles, chest reveals) or a catalog
  // card id (a card you do not own yet). Resolve the copy first: only it knows the rank and
  // the four stat levels to show.
  const copyByRef = collection?.find((row) => row.id === cardRefId)
  const cardId = copyByRef?.card_id ?? cardRefId
  const card = cards?.find((row) => row.id === cardId)

  // Copies progress independently, so "the card" is whichever instance the route names
  // (falling back to the strongest one when the link pointed at a catalog id).
  const owned =
    copyByRef ??
    (collection ?? [])
      .filter((row) => row.card_id === cardId)
      .sort((a, b) => b.rank - a.rank)[0]

  const { data: inventory } = useInventory()
  const { data: materials } = useMaterialCatalog()
  const { data: dungeons } = useDungeons()
  const { data: profile } = useProfile()
  const { data: parties } = useParties()
  const rankUp = useRankUpCard()
  const levelUp = useLevelUpStat()
  const [reveal, setReveal] = useState<RankUpReveal | null>(null)
  const [levelError, setLevelError] = useState<CardStat | null>(null)

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

  const rank = (owned?.rank ?? card.rank) as CardRank
  const atkLevel = owned?.atk_level ?? 1
  const defLevel = owned?.def_level ?? 1
  const hpLevel = owned?.hp_level ?? 1
  const spdLevel = owned?.spd_level ?? 1
  const tags = card.tags ?? []
  const artSrc = resolveArtSrc(card.art_path)
  const cap = RANK_META[rank].levelCap
  const gold = profile?.gold ?? 0
  const ownedQty = new Map((inventory ?? []).map((row) => [row.material_id, row.qty]))
  const materialById = new Map((materials ?? []).map((material) => [material.id, material]))

  const statValue: Record<CardStat, number> = {
    atk: cardAtk(card.base_atk, rank, atkLevel),
    def: cardDef(card.base_def, rank, defLevel),
    hp: cardHp(card.base_atk, rank, hpLevel),
    spd: cardSpd(card.speed, rank, spdLevel),
  }
  const statLevel: Record<CardStat, number> = {
    atk: atkLevel,
    def: defLevel,
    hp: hpLevel,
    spd: spdLevel,
  }
  const power = statValue.atk + statValue.def

  // The Cores a next stat level still needs, so a shortfall becomes a farm destination.
  const missingCoreIds = new Set<string>()
  for (const { key } of STAT_ROWS) {
    if (statLevel[key] >= cap) continue
    const cost = statLevelCost(rank, tags, statLevel[key] + 1)
    for (const [id, need] of Object.entries(cost.materials)) {
      if ((ownedQty.get(id) ?? 0) < need) missingCoreIds.add(id)
    }
  }

  // --- Rank-up: consume duplicate copies of this same card -------------------
  const equippedIds = new Set(
    (parties ?? []).flatMap((loadout) => loadout.slots.map((slot) => slot.player_card_id)),
  )
  const fodderCandidates = (collection ?? []).map((row) => ({
    id: row.id,
    card_id: row.card_id,
    rank: row.rank,
    locked: row.locked,
    inParty: equippedIds.has(row.id),
  }))
  const requiredValue = rankUpRequirement(rank)
  const fodderIds = owned ? selectRankUpFodder(owned, fodderCandidates) : null
  const availableValue = fodderCandidates
    .filter((row) => row.card_id === cardId && row.id !== owned?.id && !row.locked && !row.inParty)
    .reduce((sum, row) => sum + rankUpValue(row.rank), 0)
  const canRankUp =
    Boolean(owned) && requiredValue > 0 && Boolean(fodderIds) && !rankUp.isPending

  const handleRankUp = () => {
    if (!owned || !fodderIds || requiredValue === 0) return
    const fromRank = rank
    rankUp
      .mutateAsync({ playerCardId: owned.id, fodderIds })
      .then(() => {
        setReveal({
          artPath: card.art_path,
          cardName: card.name,
          fromRank,
          key: `${owned.id}-${rank + 1}-${Date.now()}`,
          toRank: (rank + 1) as CardRank,
        })
      })
      // The server owns the real check; a rejection (a stale screen) just leaves the numbers.
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
          <dl className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-ink-400">Power</dt>
            <dd className="col-span-2 tabular-nums">{power}</dd>
            {STAT_ROWS.map(({ key, label }) => (
              <StatRow
                key={key}
                label={label}
                level={statLevel[key]}
                cap={cap}
                value={statValue[key]}
                cost={statLevelCost(rank, tags, statLevel[key] + 1)}
                gold={gold}
                ownedQty={ownedQty}
                materialById={materialById}
                disabled={!owned || statLevel[key] >= cap || levelUp.isPending}
                pending={levelUp.isPending && levelUp.variables?.stat === key}
                onLevelUp={() => {
                  if (!owned) return
                  setLevelError(null)
                  levelUp
                    .mutateAsync({ playerCardId: owned.id, stat: key })
                    .catch(() => setLevelError(key))
                }}
              />
            ))}
          </dl>
          {missingCoreIds.size ? (
            <div className="mt-3 space-y-1.5 border-t border-ink-800 pt-3">
              <p className="text-xs text-ink-500">Farm the Cores this card still needs:</p>
              <div className="flex flex-wrap gap-1.5">
                {[...missingCoreIds].flatMap((id) =>
                  dungeonsDropping(id, dungeons ?? [])
                    .slice(0, 2)
                    .map((dungeon) => (
                      <Link
                        key={`${id}-${dungeon.id}`}
                        to={`/dungeons?focus=${dungeon.id}`}
                        className="rounded-card border border-gold-600 px-2 py-1 text-[11px] text-gold-300 hover:bg-ink-850"
                      >
                        {materialById.get(id)?.name ?? materialLabel(id)} · {dungeon.name}
                      </Link>
                    )),
                )}
              </div>
            </div>
          ) : null}
          {owned ? null : (
            <p className="mt-3 text-xs text-ink-400">
              Not in your collection yet — open a chest to find one.
            </p>
          )}
          {levelUp.error ? (
            <p className="mt-2 text-xs text-faction-ember">{levelUp.error.message}</p>
          ) : null}
        </Panel>

        <Panel title="Passive">
          <p className="text-sm text-ink-100">{card.passive_name}</p>
          <p className="mt-1 text-sm text-ink-400">{card.passive_text}</p>
          <p className="mt-2 text-xs text-ink-600 italic">{card.lore}</p>
        </Panel>

        <Panel title="Rank up">
          {!owned ? (
            <p className="text-sm text-ink-400">Not in your collection yet — open a chest first.</p>
          ) : requiredValue === 0 ? (
            <p className="text-sm text-ink-400">
              Already at 5★, the top of the ladder. No further rank-up path.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-400">
                {rank}★ → <span className="text-ink-100">{rank + 1}★</span> · feed it duplicate
                copies of this card
              </p>
              <p className="mt-2 text-sm text-ink-300">
                Needs{' '}
                <span className="tabular-nums text-ink-100">{requiredValue}</span> copies' worth ·{' '}
                you hold <span className="tabular-nums text-ink-100">{availableValue}</span>
              </p>
              <p className="mt-1 text-xs text-ink-500">
                A 2★ copy is worth 2, a 3★ worth 4, a 4★ worth 8, a 5★ worth 16.
              </p>
              <button
                type="button"
                className="mt-3 w-full rounded-card bg-gold-500 px-3 py-2 text-sm font-medium text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canRankUp}
                onClick={handleRankUp}
              >
                {rankUp.isPending
                  ? 'Ranking up…'
                  : fodderIds
                    ? `Rank up to ${rank + 1}★ (spend ${fodderIds.length} copies)`
                    : `Need ${requiredValue - availableValue} more copies`}
              </button>
              {!fodderIds && requiredValue > 0 ? (
                <p className="mt-2 text-xs text-ink-500">
                  Farm duplicates from chests, or from quests that fight this card's family.
                </p>
              ) : null}
              {rankUp.error ? (
                <p className="mt-2 text-xs text-faction-ember">{rankUp.error.message}</p>
              ) : null}
              {levelError ? (
                <p className="mt-2 text-xs text-faction-ember">Could not level that stat.</p>
              ) : null}
            </>
          )}
        </Panel>
      </div>
      {reveal ? <RankUpOverlay onClose={() => setReveal(null)} reveal={reveal} /> : null}
    </Screen>
  )
}

/** One stat line with its level, current value and the fixed price of the next level. */
function StatRow({
  label,
  level,
  cap,
  value,
  cost,
  gold,
  ownedQty,
  materialById,
  disabled,
  pending,
  onLevelUp,
}: {
  label: string
  level: number
  cap: number
  value: number
  cost: { gold: number; materials: Record<string, number> }
  gold: number
  ownedQty: Map<string, number>
  materialById: Map<string, { id: string; name: string }>
  disabled: boolean
  pending: boolean
  onLevelUp: () => void
}) {
  const atCap = level >= cap
  const short = gold < cost.gold || Object.entries(cost.materials).some(
    ([id, need]) => (ownedQty.get(id) ?? 0) < need,
  )
  const costLabel = [
    `${cost.gold.toLocaleString('en-US')}g`,
    ...Object.entries(cost.materials).map(([id]) => materialById.get(id)?.name ?? materialLabel(id)),
  ].join(' + ')

  return (
    <>
      <dt className="text-ink-400">{label}</dt>
      <dd className="tabular-nums text-ink-100">
        {value}
        <span className="ml-1.5 text-xs text-ink-500">
          Lv {level}/{cap}
        </span>
      </dd>
      <dd className="justify-self-end">
        {atCap ? (
          <span className="text-xs text-ink-600">Max</span>
        ) : (
          <button
            type="button"
            disabled={disabled || short}
            onClick={onLevelUp}
            title={short ? `Needs ${costLabel}` : `Level up · ${costLabel}`}
            className={cn(
              'rounded-card border px-2 py-1 text-[11px]',
              short || disabled
                ? 'border-ink-700 text-ink-500'
                : 'border-gold-600 text-gold-300 hover:bg-ink-850',
            )}
          >
            {pending ? '…' : `↑ ${costLabel}`}
          </button>
        )}
      </dd>
    </>
  )
}
