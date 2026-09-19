import { useEffect, useState } from 'react'
import { Lock, Trash2, X } from 'lucide-react'

import { Panel, Planned, Screen } from '@/components/Screen'
import {
  CardBrowserControls,
  CardBrowserEmpty,
  CardGrid,
  useCardBrowser,
} from '@/features/cards/CardBrowser'
import { CardTile } from '@/features/cards/CardTile'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { useDungeons } from '@/features/dungeons/api'
import { useParty, useSaveParty } from '@/features/party/api'
import { useProfile } from '@/features/profile/api'
import { RANK_META, goldReward, partyPower, runSlotsForLevel, successChance } from '@/game/formulas'
import { cn } from '@/lib/utils'
import type { CardBrowserItem } from '@/features/cards/CardBrowser'
import type { CardRank } from '@/types/db'

/**
 * Slots are a fixed-length array of `string | undefined` so a cleared slot stays empty
 * instead of shifting the cards on its right. `undefined` entries are stripped before saving.
 */
type Slots = Array<string | undefined>

const SLOT_COUNT = 5

function padSlots(ids: readonly string[]): Slots {
  return Array.from({ length: SLOT_COUNT }, (_, index) => ids[index])
}

function stripEmpty(ids: Slots): string[] {
  return ids.filter((id): id is string => Boolean(id))
}

export function PartyBuilderScreen() {
  const { data: catalog } = useCardCatalog()
  const { data: collection } = useCollection()
  const { data: loadout, error } = useParty()
  const { data: dungeons } = useDungeons()
  const saveParty = useSaveParty()
  const { data: profile } = useProfile()
  const slots = runSlotsForLevel(profile?.player_level ?? 1)
  const [draft, setDraft] = useState<Slots | null>(null)
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const savedIds = loadout?.slots.map((partySlot) => partySlot.player_card_id) ?? []
  const selectedIds = draft ?? padSlots(savedIds)
  const isDirty = draft !== null && stripEmpty(draft).join(',') !== savedIds.join(',')

  const playerCardById = new Map((collection ?? []).map((playerCard) => [playerCard.id, playerCard]))
  const cardByPlayerCardId = new Map(
    (collection ?? []).flatMap((playerCard) => {
      const card = catalog?.find((catalogCard) => catalogCard.id === playerCard.card_id)
      return card ? [[playerCard.id, card] as const] : []
    }),
  )
  /** Catalog ids currently equipped — used to flag duplicates in the picker. */
  const equippedCardIds = new Set(
    stripEmpty(selectedIds).map((playerCardId) => playerCardById.get(playerCardId)?.card_id),
  )

  /** Owned copies paired with their catalog rows — the picker's browsable set. */
  const pickerItems: CardBrowserItem[] = (collection ?? []).flatMap((playerCard) => {
    const card = cardByPlayerCardId.get(playerCard.id)
    return card ? [{ card, playerCard }] : []
  })
  const picker = useCardBrowser(pickerItems)

  /** Writes a card into a slot, swapping rather than duplicating the same catalog card. */
  function chooseCard(playerCardId: string) {
    if (editingSlot === null) return

    const next = [...selectedIds]
    while (next.length < SLOT_COUNT) next.push(undefined)
    const displaced = next[editingSlot]
    const chosenCardId = playerCardById.get(playerCardId)?.card_id
    const clashSlot = next.findIndex(
      (id, index) =>
        index !== editingSlot &&
        id !== undefined &&
        playerCardById.get(id)?.card_id === chosenCardId,
    )

    next[editingSlot] = playerCardId
    if (clashSlot >= 0) next[clashSlot] = displaced
    setDraft(next)
    setEditingSlot(null)
  }

  function clearSlot(slot: number) {
    const next = [...selectedIds]
    while (next.length < SLOT_COUNT) next.push(undefined)
    next[slot] = undefined
    setDraft(next)
  }

  const partyCards = stripEmpty(selectedIds)
    .map((playerCardId) => playerCardById.get(playerCardId))
    .filter((card): card is NonNullable<typeof card> => Boolean(card))

  const previewPower = partyPower(
    partyCards.map((row) => ({ rank: row.rank as CardRank, level: row.level })),
  )

  // Escape closes the picker; lock page scroll while it is up.
  useEffect(() => {
    if (editingSlot === null) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setEditingSlot(null)
    }

    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [editingSlot])

  const emptySlots = SLOT_COUNT - stripEmpty(selectedIds).length

  return (
    <Screen
      title="Party Builder"
      week="Built in week 5"
      hint={`${slots} concurrent runs unlocked at level ${profile?.player_level ?? 1}`}
    >
      <div className="space-y-3">
        <Panel title={loadout?.party.name ?? 'First Expedition'}>
          {isDirty ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-gold-300">
              <span aria-hidden className="size-1.5 rounded-full bg-gold-400" />
              Unsaved changes
            </p>
          ) : null}
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: SLOT_COUNT }, (_, slot) => {
              const playerCardId = selectedIds[slot]
              const card = playerCardId ? playerCardById.get(playerCardId) : undefined
              const cardInfo = playerCardId ? cardByPlayerCardId.get(playerCardId) : undefined
              return card && cardInfo ? (
                <div key={slot} className="relative">
                  <button
                    type="button"
                    onClick={() => setEditingSlot(slot)}
                    aria-label={`Slot ${slot + 1}: ${cardInfo.name}. Change card.`}
                    className="block w-full text-left"
                  >
                    <CardTile card={cardInfo} owned compact />
                  </button>
                  {card.locked ? (
                    <span
                      title="Locked — excluded from bulk card actions"
                      className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-ink-950/80 text-ink-300"
                    >
                      <Lock className="size-3" />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => clearSlot(slot)}
                    aria-label={`Remove ${cardInfo.name} from slot ${slot + 1}`}
                    title="Clear slot"
                    className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-ink-950/90 text-ink-300 hover:text-faction-ember"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setEditingSlot(slot)}
                  aria-label={`Choose card for slot ${slot + 1}`}
                  className="grid aspect-[2/3] place-items-center rounded-[10px] border border-dashed border-ink-700 bg-ink-850 text-center text-[10px] text-ink-400 hover:border-gold-500 hover:text-gold-300"
                >
                  +
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="text-sm text-ink-200 tabular-nums">
              Power ≈ {previewPower.toLocaleString('en-US')}
            </p>
            <p className="text-xs text-ink-500 tabular-nums">
              {SLOT_COUNT - emptySlots}/{SLOT_COUNT} slots filled
            </p>
          </div>
          {emptySlots > 0 ? (
            <p className="mt-1 text-xs text-gold-300">
              {emptySlots} empty {emptySlots === 1 ? 'slot' : 'slots'} — an under-filled party still
              starts runs, but scores lower.
            </p>
          ) : null}
          <p className="text-xs text-ink-600">
            The server's <code>party_power()</code> is authoritative.
          </p>
          {error ? <p className="mt-2 text-xs text-faction-ember">Could not load your party: {error.message}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!loadout?.party || saveParty.isPending || !isDirty}
              onClick={() => {
                if (loadout?.party) {
                  saveParty.mutate(
                    { partyId: loadout.party.id, playerCardIds: stripEmpty(selectedIds) },
                    { onSuccess: () => setDraft(null) },
                  )
                }
              }}
              className="flex-1 rounded-card bg-gold-500 px-3 py-2.5 text-sm font-medium text-ink-950 disabled:opacity-50"
            >
              {saveParty.isPending ? 'Saving...' : 'Save party'}
            </button>
            {isDirty ? (
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={saveParty.isPending}
                className="rounded-card border border-ink-700 px-3 py-2.5 text-sm text-ink-300 hover:text-ink-50 disabled:opacity-50"
              >
                Revert
              </button>
            ) : null}
          </div>
          {saveParty.error ? <p className="mt-2 text-xs text-faction-ember">{saveParty.error.message}</p> : null}
          {saveParty.isSuccess && !isDirty ? (
            <p className="mt-2 text-xs text-faction-verdant">Party saved.</p>
          ) : null}
        </Panel>

        {dungeons?.length ? (
          <Panel title="Dungeon readiness">
            <ul className="space-y-2">
              {[...dungeons]
                .sort((a, b) => a.req_power - b.req_power)
                .map((dungeon) => {
                  const chance = successChance(previewPower, dungeon.req_power)
                  const ready = chance >= 0.5
                  return (
                    <li key={dungeon.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-ink-200">{dungeon.name}</p>
                        <p className="text-xs text-ink-500 tabular-nums">
                          needs {dungeon.req_power.toLocaleString('en-US')} power
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'tabular-nums',
                            ready ? 'text-faction-verdant' : 'text-faction-ember',
                          )}
                        >
                          p≈{Math.round(chance * 100)}%
                        </p>
                        <p className="text-xs text-ink-500 tabular-nums">
                          ≈{goldReward(dungeon.gold_base, previewPower, dungeon.req_power).toLocaleString('en-US')} g
                        </p>
                      </div>
                    </li>
                  )
                })}
            </ul>
            <p className="mt-2 text-xs text-ink-600">
              Preview only — the server rolls the real chance at resolve time.
            </p>
          </Panel>
        ) : null}

        <Panel title="Party rules">
          <Planned
            items={[
              'Five unique cards per party',
              `Level caps in play: ${[1, 2, 3, 4, 5].map((r) => RANK_META[r as CardRank].levelCap).join('/')}`,
            ]}
          />
        </Panel>
      </div>

      {editingSlot !== null ? (
        <div
          className="fixed inset-0 z-30 overflow-y-auto bg-ink-950/90 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="party-card-picker-title"
        >
          <div className="mx-auto w-full max-w-md">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 id="party-card-picker-title" className="font-display text-lg text-ink-50">
                  Choose card
                </h2>
                <p className="text-xs text-ink-400">
                  Slot {editingSlot + 1} ·{' '}
                  {picker.sortOptions.find((option) => option.value === picker.sort)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSlot(null)}
                aria-label="Close card picker"
                title="Close"
                className="grid size-9 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-50"
              >
                <X className="size-5" />
              </button>
            </div>
            <CardBrowserControls
              browser={picker}
              placeholder="Search owned cards"
              autoFocusSearch
              rankTrailing={
                selectedIds[editingSlot] ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearSlot(editingSlot)
                      setEditingSlot(null)
                    }}
                    className="flex items-center gap-1 rounded-card px-2 py-1 text-xs text-ink-400 hover:text-faction-ember"
                  >
                    <Trash2 className="size-3.5" />
                    Clear slot
                  </button>
                ) : undefined
              }
            />

            {picker.results.length === 0 ? (
              <CardBrowserEmpty
                totalCount={pickerItems.length}
                filtersActive={picker.filtersActive}
                onReset={picker.reset}
                emptyMessage="No cards yet — open a chest to start your collection."
              />
            ) : (
              <CardGrid>
                {picker.results.map(({ card, playerCard }) =>
                  playerCard ? (
                    <CardTile
                      key={playerCard.id}
                      card={card}
                      owned
                      level={playerCard.level}
                      rank={playerCard.rank}
                      selected={selectedIds[editingSlot] === playerCard.id}
                      badge={
                        playerCard.id !== selectedIds[editingSlot] && equippedCardIds.has(card.id)
                          ? 'In party'
                          : undefined
                      }
                      onClick={() => chooseCard(playerCard.id)}
                    />
                  ) : null,
                )}
              </CardGrid>
            )}
          </div>
        </div>
      ) : null}
    </Screen>
  )
}
