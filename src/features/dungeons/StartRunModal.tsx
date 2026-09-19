import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

import { CardTile } from '@/features/cards/CardTile'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { formatDuration } from '@/features/dungeons/format'
import { useParties } from '@/features/party/api'
import { useStartRun } from '@/features/progression/api'
import { partyPower, successChance } from '@/game/formulas'
import { cn } from '@/lib/utils'
import type { PartyLoadout } from '@/features/party/api'
import type { Card, CardRank, Dungeon, DungeonRun, PlayerCard } from '@/types/db'

type PartyOption = {
  loadout: PartyLoadout
  members: Array<{ card: Card; playerCard: PlayerCard }>
  power: number
  /** A party already out on a run cannot be sent again. */
  busy: boolean
  /** An empty lineup fails server-side ("party has no cards"), so it is never confirmable. */
  empty: boolean
}

/**
 * Party picker for one dungeon. Everything here is a preview: the server decides the
 * power snapshot, the roll and the end time when `start_run` is called.
 */
export function StartRunModal({
  dungeon,
  activeRuns,
  pendingClaims,
  onClose,
}: {
  dungeon: Dungeon
  activeRuns: DungeonRun[]
  /** A run can finish while this picker is open, so the gate is re-checked here too. */
  pendingClaims: number
  onClose: () => void
}) {
  const { data: parties, isPending: partiesPending } = useParties()
  const { data: collection } = useCollection()
  const { data: catalog } = useCardCatalog()
  const startRun = useStartRun()
  const [pickedId, setPickedId] = useState<string | null>(null)

  // Escape closes; lock page scroll while the picker is up.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const options = useMemo<PartyOption[]>(() => {
    const busyPartyIds = new Set(activeRuns.map((run) => run.party_id))
    const playerCardById = new Map((collection ?? []).map((row) => [row.id, row]))
    const cardById = new Map((catalog ?? []).map((card) => [card.id, card]))

    return (parties ?? []).map((loadout) => {
      const members = loadout.slots.flatMap((slot) => {
        const playerCard = playerCardById.get(slot.player_card_id)
        const card = playerCard ? cardById.get(playerCard.card_id) : undefined
        return card && playerCard ? [{ card, playerCard }] : []
      })

      return {
        loadout,
        members,
        power: partyPower(
          members.map(({ playerCard }) => ({
            rank: playerCard.rank as CardRank,
            level: playerCard.level,
          })),
        ),
        busy: busyPartyIds.has(loadout.party.id),
        empty: members.length === 0,
      }
    })
  }, [activeRuns, catalog, collection, parties])

  // Best default is a party that can actually go, so the common case is one tap.
  const firstUsable = options.find((option) => !option.busy && !option.empty)
  const selectedId = pickedId ?? firstUsable?.loadout.party.id ?? null
  const selected = options.find((option) => option.loadout.party.id === selectedId)
  const canConfirm =
    Boolean(selected) && !selected?.busy && !selected?.empty && pendingClaims === 0 && !startRun.isPending

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end bg-ink-950/90 px-4 py-3 backdrop-blur-sm sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-run-title"
    >
      <section className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-card border border-ink-700 bg-ink-900 shadow-lg">
        <header className="flex items-start justify-between gap-3 border-b border-ink-800 p-4">
          <div className="min-w-0">
            <h2 id="start-run-title" className="font-display text-lg text-ink-50">
              Send a party
            </h2>
            <p className="mt-0.5 truncate text-sm text-ink-400">{dungeon.name}</p>
          </div>
          <button
            type="button"
            aria-label="Close party picker"
            title="Close"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-50"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {options.length === 0 ? (
            <p className="text-sm text-ink-400">
              {partiesPending
                ? 'Loading parties...'
                : 'You have no parties yet — build one on the Teams screen first.'}
            </p>
          ) : null}

          {options.map((option) => {
            const isSelected = option.loadout.party.id === selectedId
            const unavailable = option.busy || option.empty

            return (
              <button
                key={option.loadout.party.id}
                type="button"
                disabled={unavailable}
                aria-pressed={isSelected}
                onClick={() => setPickedId(option.loadout.party.id)}
                className={cn(
                  'block w-full rounded-card border p-3 text-left',
                  isSelected && !unavailable
                    ? 'border-gold-500 bg-ink-850'
                    : 'border-ink-800 bg-ink-850/60',
                  unavailable
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:border-ink-600',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-100">
                    {option.loadout.party.name}
                  </span>
                  {option.busy ? (
                    <span className="shrink-0 rounded-card bg-ink-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold-300">
                      Running
                    </span>
                  ) : option.empty ? (
                    <span className="shrink-0 rounded-card bg-ink-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-400">
                      Empty
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-faction-verdant">
                      Ready
                    </span>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 5 }, (_, slot) => {
                    const member = option.members[slot]
                    return member ? (
                      <CardTile
                        key={member.playerCard.id}
                        card={member.card}
                        owned
                        compact
                        rank={member.playerCard.rank}
                        level={member.playerCard.level}
                      />
                    ) : (
                      <span
                        key={slot}
                        aria-hidden
                        className="grid aspect-[2/3] place-items-center rounded-[10px] border border-dashed border-ink-700 text-[10px] text-ink-600"
                      >
                        ·
                      </span>
                    )
                  })}
                </div>

                <dl className="mt-2 flex items-baseline justify-between gap-2 text-xs">
                  <div className="flex gap-1.5">
                    <dt className="text-ink-400">Power</dt>
                    <dd className="tabular-nums text-ink-100">
                      {option.power.toLocaleString('en-US')}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink-400">Odds</dt>
                    {/* Preview only — the server rolls the real chance at resolve time. */}
                    <dd className="tabular-nums text-ink-200">
                      p≈{Math.round(successChance(option.power, dungeon.req_power) * 100)}%
                    </dd>
                  </div>
                </dl>
              </button>
            )
          })}
        </div>

        <footer className="border-t border-ink-800 p-4">
          <p className="mb-2 text-xs text-ink-400">
            Needs {dungeon.req_power.toLocaleString('en-US')} power ·{' '}
            {formatDuration(dungeon.duration_seconds)}
            {pendingClaims > 0
              ? ' · claim your finished runs first'
              : options.length > 0 && !firstUsable
                ? ' · every party is already out'
                : ''}
          </p>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!selected) return
              startRun.mutate(
                { dungeonId: dungeon.id, partyId: selected.loadout.party.id },
                { onSuccess: onClose },
              )
            }}
            className="w-full rounded-card bg-gold-500 px-3 py-2.5 text-sm font-medium text-ink-950 disabled:opacity-50"
          >
            {startRun.isPending ? 'Starting...' : 'Start run'}
          </button>
          {startRun.error ? (
            <p className="mt-2 text-xs text-faction-ember">{startRun.error.message}</p>
          ) : null}
        </footer>
      </section>
    </div>
  )
}
