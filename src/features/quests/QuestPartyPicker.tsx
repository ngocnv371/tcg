import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { partyMembers } from '@/features/quests/combat'
import type { PartyLoadout } from '@/features/party/api'
import { partyPower } from '@/game/formulas'
import { cn } from '@/lib/utils'
import type { Card, PlayerCard, Quest } from '@/types/db'

type Option = {
  loadout: PartyLoadout
  power: number
  cardCount: number
  empty: boolean
}

/**
 * Picks the party that fights a quest. Unlike the dungeon picker there is no busy/claim
 * state — a quest is a one-sitting fight, not a timed run — so the only blocks are an empty
 * lineup (the server refuses one) and the recommended-power hint.
 */
export function QuestPartyPicker({
  quest,
  parties,
  collection,
  catalog,
  onPick,
  onClose,
}: {
  quest: Quest
  parties: PartyLoadout[] | undefined
  collection: PlayerCard[]
  catalog: Card[]
  onPick: (loadout: PartyLoadout) => void
  onClose: () => void
}) {
  const [pickedId, setPickedId] = useState<string | null>(null)

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

  const options = useMemo<Option[]>(() => {
    return (parties ?? []).map((loadout) => {
      const members = partyMembers(loadout, collection, catalog)
      return {
        loadout,
        power: partyPower(
          members.map(({ card, playerCard }) => ({
            card,
            copy: {
              rank: playerCard.rank,
              atk_level: playerCard.atk_level,
              hp_level: playerCard.hp_level,
              def_level: playerCard.def_level,
              spd_level: playerCard.spd_level,
            },
          })),
        ),
        cardCount: members.length,
        empty: members.length === 0,
      }
    })
  }, [parties, collection, catalog])

  const firstUsable = options.find((option) => !option.empty)
  const selectedId = pickedId ?? firstUsable?.loadout.party.id ?? null
  const selected = options.find((option) => option.loadout.party.id === selectedId)

  return (
    <div className="fixed inset-0 z-30 grid items-end justify-items-center bg-ink-950/90 px-4 py-3 backdrop-blur-sm sm:place-items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quest-party-title"
        className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-card border border-ink-700 bg-ink-900 shadow-lg"
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink-800 p-4">
          <div className="min-w-0">
            <h2 id="quest-party-title" className="font-display text-lg text-ink-50">
              Choose your party
            </h2>
            <p className="mt-0.5 truncate text-sm text-ink-400">
              {quest.enemies.map((enemy) => enemy.name).join(', ')} · recommended{' '}
              {quest.req_power.toLocaleString('en-US')} power
            </p>
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

        <div className="scrollbar-slim min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {options.length === 0 ? (
            <p className="text-sm text-ink-400">
              {parties ? 'Build a party on the Party screen first.' : 'Loading parties...'}
            </p>
          ) : null}

          {options.map((option) => {
            const isSelected = option.loadout.party.id === selectedId
            const members = partyMembers(option.loadout, collection, catalog)
            return (
              <button
                key={option.loadout.party.id}
                type="button"
                disabled={option.empty}
                aria-pressed={isSelected}
                onClick={() => setPickedId(option.loadout.party.id)}
                className={cn(
                  'block w-full rounded-card border p-3 text-left',
                  isSelected && !option.empty
                    ? 'border-gold-500 bg-ink-850'
                    : 'border-ink-800 bg-ink-850/60',
                  option.empty ? 'cursor-not-allowed opacity-50' : 'hover:border-ink-600',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-100">
                    {option.loadout.party.name}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-400">
                    {option.empty ? 'Empty' : `Power ${option.power.toLocaleString('en-US')}`}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {members.map(({ card }) => (
                    <span
                      key={card.id}
                      className="rounded-card bg-ink-800 px-2 py-0.5 text-[11px] text-ink-300"
                    >
                      {card.name}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        <footer className="border-t border-ink-800 p-4">
          <button
            type="button"
            disabled={!selected || selected.empty}
            onClick={() => selected && onPick(selected.loadout)}
            className="w-full rounded-card bg-gold-500 px-3 py-2.5 text-sm font-medium text-ink-950 disabled:opacity-40"
          >
            Fight!
          </button>
        </footer>
      </section>
    </div>
  )
}
