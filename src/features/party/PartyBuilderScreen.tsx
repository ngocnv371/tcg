import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'

import { Panel, Planned, Screen } from '@/components/Screen'
import { PartyCard } from '@/features/party/PartyCard'
import { useCreateParty, useParties } from '@/features/party/api'
import { useProfile } from '@/features/profile/api'
import { RANK_META, runSlotsForLevel } from '@/game/formulas'
import type { CardRank } from '@/types/db'

const NAME_MAX_LENGTH = 40

export function PartyBuilderScreen() {
  const { data: loadouts, error } = useParties()
  const createParty = useCreateParty()
  const { data: profile } = useProfile()
  const slots = runSlotsForLevel(profile?.player_level ?? 1)
  const parties = loadouts ?? []
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  function submitCreate() {
    createParty.mutate(newName.trim() || undefined, {
      onSuccess: () => {
        setCreating(false)
        setNewName('')
      },
    })
  }

  function cancelCreate() {
    setCreating(false)
    setNewName('')
  }

  return (
    <Screen
      title="Party Builder"
      hint={`${slots} concurrent runs unlocked at level ${profile?.player_level ?? 1}`}
    >
      <div className="space-y-3">
        {error ? (
          <Panel>
            <p className="text-sm text-faction-ember">Could not load your parties: {error.message}</p>
          </Panel>
        ) : null}

        {parties.map((loadout) => (
          <PartyCard key={loadout.party.id} loadout={loadout} canDelete={parties.length > 1} />
        ))}

        {creating ? (
          <Panel>
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newName}
                maxLength={NAME_MAX_LENGTH}
                placeholder={`Party ${parties.length + 1}`}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitCreate()
                  if (event.key === 'Escape') cancelCreate()
                }}
                aria-label="New party name"
                className="min-w-0 flex-1 rounded-card border border-ink-700 bg-ink-850 px-2.5 py-2 text-sm text-ink-50 placeholder:text-ink-600"
              />
              <button
                type="button"
                onClick={submitCreate}
                disabled={createParty.isPending}
                aria-label="Create party"
                title="Create"
                className="grid size-8 shrink-0 place-items-center rounded-card text-ink-300 hover:text-faction-verdant disabled:opacity-40"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                onClick={cancelCreate}
                aria-label="Cancel new party"
                title="Cancel"
                className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-ink-50"
              >
                <X className="size-4" />
              </button>
            </div>
          </Panel>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-ink-700 px-3 py-3 text-sm text-ink-300 hover:border-gold-500 hover:text-gold-300"
          >
            <Plus className="size-4" />
            New party
          </button>
        )}

        {createParty.error ? (
          <p className="text-xs text-faction-ember">{createParty.error.message}</p>
        ) : null}

        <Panel title="Party rules">
          <Planned
            items={[
              'Five unique cards per party',
              'Unlimited parties — add another whenever you need one',
              `Level caps in play: ${[1, 2, 3, 4, 5].map((r) => RANK_META[r as CardRank].levelCap).join('/')}`,
            ]}
          />
        </Panel>
      </div>
    </Screen>
  )
}
