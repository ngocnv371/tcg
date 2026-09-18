import { useState } from 'react'
import { X } from 'lucide-react'

import { Panel, Planned, Screen } from '@/components/Screen'
import { CardTile } from '@/features/cards/CardLibraryScreen'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { useParty, useSaveParty } from '@/features/party/api'
import { useProfile } from '@/features/profile/api'
import { RANK_META, partyPower, runSlotsForLevel } from '@/game/formulas'
import type { CardRank } from '@/types/db'

export function PartyBuilderScreen() {
  const { data: catalog } = useCardCatalog()
  const { data: collection } = useCollection()
  const { data: loadout, error } = useParty()
  const saveParty = useSaveParty()
  const { data: profile } = useProfile()
  const slots = runSlotsForLevel(profile?.player_level ?? 1)
  const [draftIds, setDraftIds] = useState<string[] | null>(null)
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const savedIds = loadout?.slots.map((partySlot) => partySlot.player_card_id) ?? []
  const selectedIds = draftIds ?? savedIds

  function chooseCard(playerCardId: string) {
    if (editingSlot === null) return

    setDraftIds((current) => {
      const next = [...(current ?? savedIds)]
      const existingSlot = next.indexOf(playerCardId)
      const replacedCardId = next[editingSlot]

      if (existingSlot >= 0 && existingSlot !== editingSlot) {
        if (editingSlot >= next.length) return current
        next[existingSlot] = replacedCardId
      }
      if (editingSlot > next.length) return current
      next[editingSlot] = playerCardId
      return next
    })
    setEditingSlot(null)
  }

  const partyCards = selectedIds
    .map((playerCardId) => collection?.find((playerCard) => playerCard.id === playerCardId))
    .filter((card): card is NonNullable<typeof card> => Boolean(card))

  const previewPower = partyPower(
    partyCards.map((row) => ({ rank: row.rank as CardRank, level: row.level })),
  )

  return (
    <Screen
      title="Party Builder"
      week="Built in week 5"
      hint={`${slots} concurrent runs unlocked at level ${profile?.player_level ?? 1}`}
    >
      <div className="space-y-3">
        <Panel title={loadout?.party.name ?? 'First Expedition'}>
          <div className="grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((slot) => {
              const playerCardId = selectedIds[slot]
              const card = collection?.find((playerCard) => playerCard.id === playerCardId)
              const cardInfo = catalog?.find((catalogCard) => catalogCard.id === card?.card_id)
              return card && cardInfo ? (
                <button key={slot} type="button" onClick={() => setEditingSlot(slot)} className="text-left">
                  <CardTile card={cardInfo} owned />
                </button>
              ) : (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setEditingSlot(slot)}
                  aria-label={`Choose card for slot ${slot + 1}`}
                  className="grid aspect-3/4 place-items-center rounded-[8px] border border-dashed border-ink-700 bg-ink-850 text-center text-[10px] text-ink-400 hover:border-gold-500 hover:text-gold-300"
                >
                  +
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-sm text-ink-200 tabular-nums">Power ≈ {previewPower}</p>
          <p className="text-xs text-ink-600">
            The server's <code>party_power()</code> is authoritative.
          </p>
          {error ? <p className="mt-2 text-xs text-faction-ember">Could not load your party: {error.message}</p> : null}
          <button
            type="button"
            disabled={!loadout?.party || saveParty.isPending}
            onClick={() => {
              if (loadout?.party) {
                saveParty.mutate(
                  { partyId: loadout.party.id, playerCardIds: selectedIds },
                  { onSuccess: () => setDraftIds(null) },
                )
              }
            }}
            className="mt-3 w-full rounded-card bg-gold-500 px-3 py-2.5 text-sm font-medium text-ink-950 disabled:opacity-50"
          >
            {saveParty.isPending ? 'Saving...' : 'Save party'}
          </button>
          {saveParty.error ? <p className="mt-2 text-xs text-faction-ember">{saveParty.error.message}</p> : null}
          {saveParty.isSuccess ? <p className="mt-2 text-xs text-faction-verdant">Party saved.</p> : null}
        </Panel>

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
                <p className="text-xs text-ink-400">Slot {editingSlot + 1} · select a replacement</p>
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
            <div className="grid grid-cols-3 gap-2.5">
              {(collection ?? []).map((playerCard) => {
                const cardInfo = catalog?.find((catalogCard) => catalogCard.id === playerCard.card_id)
                if (!cardInfo) return null
                return (
                  <CardTile
                    key={playerCard.id}
                    card={cardInfo}
                    owned
                    selected={selectedIds[editingSlot] === playerCard.id}
                    onClick={() => chooseCard(playerCard.id)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </Screen>
  )
}
