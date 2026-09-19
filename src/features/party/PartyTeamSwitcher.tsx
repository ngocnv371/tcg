import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'

import { Panel } from '@/components/Screen'
import { useCreateParty, useDeleteParty, useRenameParty } from '@/features/party/api'
import { cn } from '@/lib/utils'
import type { Party } from '@/types/db'

const NAME_MAX_LENGTH = 40

/**
 * Team list plus the create/rename/delete affordances. Parties have no client
 * write path, so every action here is an RPC-backed mutation — the server decides
 * names, order and whether a delete is allowed at all.
 */
export function PartyTeamSwitcher({
  parties,
  activeId,
  onSelect,
  onCreated,
}: {
  parties: Party[]
  activeId: string | null
  onSelect: (partyId: string) => void
  onCreated: (partyId: string) => void
}) {
  const createParty = useCreateParty()
  const renameParty = useRenameParty()
  const deleteParty = useDeleteParty()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const busy = createParty.isPending || renameParty.isPending || deleteParty.isPending
  const error = createParty.error ?? renameParty.error ?? deleteParty.error
  const lastTeam = parties.length <= 1

  function submitCreate() {
    createParty.mutate(newName.trim() || undefined, {
      onSuccess: (party) => {
        setCreating(false)
        setNewName('')
        onCreated(party.id)
      },
    })
  }

  function submitRename() {
    if (renamingId === null) return
    renameParty.mutate(
      { partyId: renamingId, name: renameValue.trim() },
      { onSuccess: () => setRenamingId(null) },
    )
  }

  return (
    <Panel title={`Teams (${parties.length})`}>
      <ul className="space-y-1.5">
        {parties.map((party) =>
          renamingId === party.id ? (
            <li key={party.id} className="flex items-center gap-1.5">
              <input
                autoFocus
                value={renameValue}
                maxLength={NAME_MAX_LENGTH}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitRename()
                  if (event.key === 'Escape') setRenamingId(null)
                }}
                aria-label={`New name for ${party.name}`}
                className="min-w-0 flex-1 rounded-card border border-ink-700 bg-ink-850 px-2.5 py-2 text-sm text-ink-50"
              />
              <button
                type="button"
                onClick={submitRename}
                disabled={busy || renameValue.trim().length === 0}
                aria-label="Save team name"
                title="Save"
                className="grid size-8 shrink-0 place-items-center rounded-card text-ink-300 hover:text-faction-verdant disabled:opacity-40"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setRenamingId(null)}
                aria-label="Cancel rename"
                title="Cancel"
                className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-ink-50"
              >
                <X className="size-4" />
              </button>
            </li>
          ) : (
            <li key={party.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelect(party.id)}
                aria-current={party.id === activeId ? 'true' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-card border px-3 py-2 text-left text-sm',
                  party.id === activeId
                    ? 'border-gold-600 bg-ink-850 text-ink-50'
                    : 'border-ink-800 text-ink-300 hover:border-ink-700',
                )}
              >
                <span className="truncate">{party.name}</span>
                {party.id === activeId ? (
                  <span className="ml-auto shrink-0 text-xs text-gold-400">Editing</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingId(null)
                  setRenamingId(party.id)
                  setRenameValue(party.name)
                }}
                disabled={busy}
                aria-label={`Rename ${party.name}`}
                title="Rename"
                className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-ink-50 disabled:opacity-40"
              >
                <Pencil className="size-4" />
              </button>
              {confirmingId === party.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      deleteParty.mutate(party.id)
                      setConfirmingId(null)
                    }}
                    disabled={busy}
                    className="shrink-0 rounded-card px-2 py-1.5 text-xs text-faction-ember hover:bg-ink-800 disabled:opacity-40"
                  >
                    Delete?
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
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
                  onClick={() => setConfirmingId(party.id)}
                  disabled={busy || lastTeam}
                  aria-label={`Delete ${party.name}`}
                  title={lastTeam ? 'You need at least one team' : 'Delete'}
                  className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-faction-ember disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ),
        )}
      </ul>

      {creating ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            autoFocus
            value={newName}
            maxLength={NAME_MAX_LENGTH}
            placeholder={`Team ${parties.length + 1}`}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCreate()
              if (event.key === 'Escape') {
                setCreating(false)
                setNewName('')
              }
            }}
            aria-label="New team name"
            className="min-w-0 flex-1 rounded-card border border-ink-700 bg-ink-850 px-2.5 py-2 text-sm text-ink-50 placeholder:text-ink-600"
          />
          <button
            type="button"
            onClick={submitCreate}
            disabled={busy}
            aria-label="Create team"
            title="Create"
            className="grid size-8 shrink-0 place-items-center rounded-card text-ink-300 hover:text-faction-verdant disabled:opacity-40"
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false)
              setNewName('')
            }}
            aria-label="Cancel new team"
            title="Cancel"
            className="grid size-8 shrink-0 place-items-center rounded-card text-ink-400 hover:text-ink-50"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-ink-700 px-3 py-2 text-sm text-ink-300 hover:border-gold-500 hover:text-gold-300"
        >
          <Plus className="size-4" />
          New team
        </button>
      )}

      {error ? <p className="mt-2 text-xs text-faction-ember">{error.message}</p> : null}
      <p className="mt-2 text-xs text-ink-600">
        Add as many teams as you like — each one is a separate loadout.
      </p>
    </Panel>
  )
}
