import { useEffect, useState } from 'react'
import { Check, Lock, Pencil, Trash2, X } from 'lucide-react'

import { Panel } from '@/components/Screen'
import {
  CardBrowserControls,
  CardBrowserEmpty,
  CardGrid,
  useCardBrowser,
} from '@/features/cards/CardBrowser'
import { CardTile } from '@/features/cards/CardTile'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { useDeleteParty, useParties, useRenameParty, useSaveParty } from '@/features/party/api'
import { partyPower } from '@/game/formulas'
import type { CardBrowserItem } from '@/features/cards/CardBrowser'
import type { PartyLoadout } from '@/features/party/api'
import type { CardRank } from '@/types/db'

const SLOT_COUNT = 5
const NAME_MAX_LENGTH = 40

/**
 * Slots are a fixed-length array of `string | undefined` so a cleared slot stays empty
 * instead of shifting the cards on its right. `undefined` entries are stripped before saving.
 */
type Slots = Array<string | undefined>

function padSlots(ids: readonly string[]): Slots {
  return Array.from({ length: SLOT_COUNT }, (_, index) => ids[index])
}

function stripEmpty(ids: Slots): string[] {
  return ids.filter((id): id is string => Boolean(id))
}

/**
 * One party, editable in place — slots, name, save and delete all live on the card so
 * every party is on screen at once and lineups can be compared by eye.
 */
export function PartyCard({ loadout, canDelete }: { loadout: PartyLoadout; canDelete: boolean }) {
  const { data: catalog } = useCardCatalog()
  const { data: collection } = useCollection()
  const { data: loadouts } = useParties()
  const saveParty = useSaveParty()
  const renameParty = useRenameParty()
  const deleteParty = useDeleteParty()
  const [draft, setDraft] = useState<Slots | null>(null)
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const savedIds = loadout.slots.map((partySlot) => partySlot.player_card_id)
  const selectedIds = draft ?? padSlots(savedIds)
  const isDirty = draft !== null && stripEmpty(draft).join(',') !== savedIds.join(',')
  const error = saveParty.error ?? renameParty.error ?? deleteParty.error
  const busy = saveParty.isPending || renameParty.isPending || deleteParty.isPending

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

  /**
   * Owned copies parked in another party, mapped to that party's name. A card is one
   * physical copy, so it can only ever be equipped in one place — these are not offerable.
   */
  const otherPartyByCardId = new Map(
    (loadouts ?? [])
      .filter((other) => other.party.id !== loadout.party.id)
      .flatMap((other) =>
        other.slots.map((slot) => [slot.player_card_id, other.party.name] as const),
      ),
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
    // The picker disables these, but a stale render should not slip a shared copy through.
    if (otherPartyByCardId.has(playerCardId)) return

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

  const partyCards = stripEmpty(selectedIds)
    .map((playerCardId) => playerCardById.get(playerCardId))
    .filter((card): card is NonNullable<typeof card> => Boolean(card))

  const previewPower = partyPower(
    partyCards.map((row) => ({ rank: row.rank as CardRank, level: row.level })),
  )

  const emptySlots = SLOT_COUNT - stripEmpty(selectedIds).length
  const pickerTitleId = `party-card-picker-title-${loadout.party.id}`

  return (
    <Panel>
      <div className="mb-2 flex items-center gap-1.5">
        {renaming ? (
          <>
            <input
              autoFocus
              value={renameValue}
              maxLength={NAME_MAX_LENGTH}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setRenaming(false)
                if (event.key === 'Enter' && renameValue.trim()) {
                  renameParty.mutate(
                    { partyId: loadout.party.id, name: renameValue.trim() },
                    { onSuccess: () => setRenaming(false) },
                  )
                }
              }}
              aria-label="Party name"
              className="min-w-0 flex-1 rounded-card border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-sm text-ink-50"
            />
            <button
              type="button"
              disabled={busy || renameValue.trim().length === 0}
              onClick={() =>
                renameParty.mutate(
                  { partyId: loadout.party.id, name: renameValue.trim() },
                  { onSuccess: () => setRenaming(false) },
                )
              }
              aria-label="Save party name"
              title="Save"
              className="grid size-8 shrink-0 place-items-center rounded-card text-ink-300 hover:text-faction-verdant disabled:opacity-40"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              aria-label="Cancel rename"
              title="Cancel"
              className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-ink-50"
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink-200">
              {loadout.party.name}
            </h2>
            {isDirty ? (
              <span
                title="Unsaved changes"
                aria-label="Unsaved changes"
                className="size-1.5 shrink-0 rounded-full bg-gold-400"
              />
            ) : null}
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false)
                setRenaming(true)
                setRenameValue(loadout.party.name)
              }}
              disabled={busy}
              aria-label={`Rename ${loadout.party.name}`}
              title="Rename"
              className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-ink-50 disabled:opacity-40"
            >
              <Pencil className="size-4" />
            </button>
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => deleteParty.mutate(loadout.party.id)}
                  disabled={busy}
                  className="shrink-0 rounded-card px-2 py-1.5 text-xs text-faction-ember hover:bg-ink-800 disabled:opacity-40"
                >
                  Delete?
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  aria-label="Cancel delete"
                  title="Cancel"
                  className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-ink-50"
                >
                  <X className="size-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy || !canDelete}
                aria-label={`Delete ${loadout.party.name}`}
                title={canDelete ? 'Delete' : 'You need at least one party'}
                className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-faction-ember disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </>
        )}
      </div>

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

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || !isDirty}
          onClick={() =>
            saveParty.mutate(
              { partyId: loadout.party.id, playerCardIds: stripEmpty(selectedIds) },
              { onSuccess: () => setDraft(null) },
            )
          }
          className="flex-1 rounded-card bg-gold-500 px-3 py-2.5 text-sm font-medium text-ink-950 disabled:opacity-50"
        >
          {saveParty.isPending ? 'Saving...' : 'Save party'}
        </button>
        {isDirty ? (
          <button
            type="button"
            onClick={() => setDraft(null)}
            disabled={busy}
            className="rounded-card border border-ink-700 px-3 py-2.5 text-sm text-ink-300 hover:text-ink-50 disabled:opacity-50"
          >
            Revert
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-faction-ember">{error.message}</p> : null}
      {saveParty.isSuccess && !isDirty ? (
        <p className="mt-2 text-xs text-faction-verdant">Party saved.</p>
      ) : null}

      {editingSlot !== null ? (
        <div
          className="fixed inset-0 z-30 overflow-y-auto bg-ink-950/90 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={pickerTitleId}
        >
          <div className="mx-auto w-full max-w-md">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 id={pickerTitleId} className="font-display text-lg text-ink-50">
                  {loadout.party.name}
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
                {picker.results.map(({ card, playerCard }) => {
                  if (!playerCard) return null
                  const otherParty = otherPartyByCardId.get(playerCard.id)
                  const isEquippedHere = selectedIds[editingSlot] === playerCard.id
                  return (
                    <CardTile
                      key={playerCard.id}
                      card={card}
                      owned
                      level={playerCard.level}
                      rank={playerCard.rank}
                      selected={isEquippedHere}
                      disabled={Boolean(otherParty)}
                      title={otherParty ? `Already equipped in ${otherParty}` : undefined}
                      badge={
                        otherParty ??
                        (!isEquippedHere && equippedCardIds.has(card.id) ? 'In party' : undefined)
                      }
                      onClick={otherParty ? undefined : () => chooseCard(playerCard.id)}
                    />
                  )
                })}
              </CardGrid>
            )}
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
