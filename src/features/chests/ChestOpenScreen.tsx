import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useChestInventory, useClaimDailyChest, useOpenChest, type ChestOpening } from '@/features/progression/api'
import { CHEST_ODDS } from '@/game/formulas'

const CHESTS = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const

export function ChestOpenScreen() {
  const { data: inventory, isPending, error } = useChestInventory()
  const claimDailyChest = useClaimDailyChest()
  const openChest = useOpenChest()
  const [opening, setOpening] = useState<ChestOpening | null>(null)
  const unopened = inventory?.filter((chest) => !chest.opened_at) ?? []

  const actionError = error ?? claimDailyChest.error ?? openChest.error

  return (
    <Screen title="Chests" week="Built in week 4" hint="Claim the daily chest, then open it to grow your collection.">
      <div className="space-y-3">
        <Panel title="Vault">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-200">
              {unopened.length ? `${unopened.length} chest${unopened.length === 1 ? '' : 's'} waiting` : 'No unopened chests'}
            </p>
            <button
              type="button"
              className="rounded-card bg-gold-500 px-3 py-2 text-xs font-medium text-ink-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={claimDailyChest.isPending}
              onClick={() => claimDailyChest.mutate()}
            >
              {claimDailyChest.isPending ? 'Claiming...' : 'Claim daily'}
            </button>
          </div>
          {isPending ? <p className="mt-3 text-sm text-ink-400">Loading chests...</p> : null}
          {!isPending && !unopened.length && !error ? (
            <p className="mt-3 text-sm text-ink-400">Claim today&apos;s chest to start an opening.</p>
          ) : null}
          {unopened.map((chest) => (
            <button
              key={chest.id}
              type="button"
              className="mt-3 flex w-full items-center justify-between rounded-card border border-ink-700 bg-ink-850 px-3 py-2 text-left text-sm"
              disabled={openChest.isPending}
              onClick={() => openChest.mutateAsync(chest.id).then(setOpening).catch(() => undefined)}
            >
              <span className="capitalize text-ink-100">{chest.chest_id} chest</span>
              <span className="text-xs text-gold-400">{openChest.isPending ? 'Opening...' : 'Open'}</span>
            </button>
          ))}
          {opening ? (
            <div className="mt-3 border-t border-ink-800 pt-3 text-sm">
              <NavLink
                to={`/cards/${opening.card_id}`}
                className="text-gold-300 underline decoration-gold-500/50 underline-offset-2"
              >
                {opening.card_name} · {opening.rank}★
              </NavLink>
              <p className="mt-1 text-xs text-ink-400">
                {opening.was_new ? 'New card added to your collection.' : `Duplicate converted to ${opening.shard_qty} ${opening.shard_material}.`}
              </p>
            </div>
          ) : null}
          {actionError ? <p className="mt-3 text-xs text-faction-ember">{actionError.message}</p> : null}
        </Panel>

        <Panel title="Published odds">
          <ul className="space-y-1.5 text-xs">
            {CHESTS.map((chest) => (
              <li key={chest} className="flex items-baseline justify-between gap-2">
                <span className="capitalize text-ink-100">{chest}</span>
                <span className="tabular-nums text-ink-400">
                  {Object.entries(CHEST_ODDS[chest])
                    .map(([rank, weight]) => `${rank}★ ${weight}%`)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-600">
            The client never rolls. Opening calls the <code>open_chest</code> function and writes the
            result to <code>pull_history</code>.
          </p>
        </Panel>

      </div>
    </Screen>
  )
}
