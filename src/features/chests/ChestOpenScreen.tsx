import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Player, type PlayerRef } from '@remotion/player'

import { Panel, Screen } from '@/components/Screen'
import { CardUnlockAnimation } from '@/features/chests/CardUnlockAnimation'
import {
  useChestInventory,
  useClaimDailyChest,
  useGrantTestChests,
  useOpenChest,
  type ChestOpening,
} from '@/features/progression/api'
import { CHEST_ODDS } from '@/game/formulas'

const CHESTS = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const

type UnlockState = {
  inventoryId: string
  opening: ChestOpening
}

function logUnlock(event: string, details?: Record<string, unknown>) {
  if (import.meta.env.DEV) console.debug(`[chest-unlock] ${event}`, details ?? {})
}

function CardUnlockOverlay({
  unlock,
  onClose,
}: {
  unlock: UnlockState
  onClose: () => void
}) {
  const playerRef = useRef<PlayerRef>(null)

  useEffect(() => {
    logUnlock('overlay-mounted', {
      inventoryId: unlock.inventoryId,
      cardId: unlock.opening.card_id,
      cardName: unlock.opening.card_name,
    })
    const player = playerRef.current
    if (!player) {
      logUnlock('player-ref-missing', { inventoryId: unlock.inventoryId })
      return
    }

    let hasStarted = false
    const handlePlay = () => {
      hasStarted = true
      logUnlock('play', { inventoryId: unlock.inventoryId, frame: player.getCurrentFrame() })
    }
    const handleEnded = () => {
      logUnlock('ended', { inventoryId: unlock.inventoryId, frame: player.getCurrentFrame(), hasStarted })
      if (hasStarted) onClose()
    }
    const handleFrameUpdate = ({ detail }: { detail: { frame: number } }) => {
      if (detail.frame % 30 === 0) logUnlock('frame', { inventoryId: unlock.inventoryId, frame: detail.frame })
    }

    player.addEventListener('play', handlePlay)
    player.addEventListener('ended', handleEnded)
    player.addEventListener('frameupdate', handleFrameUpdate)
    logUnlock('listeners-attached', { inventoryId: unlock.inventoryId })
    player.seekTo(0)
    logUnlock('seek-zero', { inventoryId: unlock.inventoryId })
    player.play()
    logUnlock('play-requested', { inventoryId: unlock.inventoryId })

    return () => {
      logUnlock('cleanup', { inventoryId: unlock.inventoryId, frame: player.getCurrentFrame() })
      player.removeEventListener('play', handlePlay)
      player.removeEventListener('ended', handleEnded)
      player.removeEventListener('frameupdate', handleFrameUpdate)
      player.pause()
    }
  }, [onClose, unlock])

  return (
    <div
      aria-label="New card unlocked"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950"
      role="dialog"
    >
      <Player
        key={unlock.inventoryId}
        ref={playerRef}
        component={CardUnlockAnimation}
        compositionHeight={844}
        compositionWidth={390}
        durationInFrames={150}
        fps={30}
        height={844}
        inputProps={{
          cardName: unlock.opening.card_name,
          artPath: unlock.opening.art_path,
          rank: unlock.opening.rank,
          wasNew: unlock.opening.was_new,
        }}
        controls={false}
        style={{ aspectRatio: '390 / 844', height: 'min(100vh, 844px)', width: 'min(100vw, 390px)' }}
        width={390}
      />
      <button
        type="button"
        aria-label="Close unlock animation"
        className="absolute right-4 top-4 rounded-card border border-ink-600 bg-ink-900/80 px-3 py-2 text-xs text-ink-200"
        onClick={onClose}
      >
        Skip
      </button>
    </div>
  )
}

export function ChestOpenScreen() {
  const { data: inventory, isPending, error } = useChestInventory()
  const claimDailyChest = useClaimDailyChest()
  const grantTestChests = useGrantTestChests()
  const openChest = useOpenChest()
  const [opening, setOpening] = useState<ChestOpening | null>(null)
  const [unlock, setUnlock] = useState<UnlockState | null>(null)
  const unopened = inventory?.filter((chest) => !chest.opened_at) ?? []
  const closeUnlock = useCallback(() => {
    logUnlock('close-requested')
    setUnlock(null)
  }, [])

  const actionError = error ?? claimDailyChest.error ?? grantTestChests.error ?? openChest.error

  return (
    <>
      <Screen title="Chests" week="Built in week 4" hint="Claim the daily chest, then open it to grow your collection.">
      <div className="space-y-3">
        <Panel title="Vault">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-200">
              {unopened.length ? `${unopened.length} chest${unopened.length === 1 ? '' : 's'} waiting` : 'No unopened chests'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-card bg-gold-500 px-3 py-2 text-xs font-medium text-ink-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={claimDailyChest.isPending}
                onClick={() => claimDailyChest.mutate()}
              >
                {claimDailyChest.isPending ? 'Claiming...' : 'Claim daily'}
              </button>
              <button
                type="button"
                className="rounded-card border border-gold-500/60 px-3 py-2 text-xs font-medium text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={grantTestChests.isPending}
                onClick={() => grantTestChests.mutate(10)}
              >
                {grantTestChests.isPending ? 'Granting...' : 'Grant 10'}
              </button>
            </div>
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
              onClick={() =>
                openChest
                  .mutateAsync(chest.id)
                  .then((result) => {
                    logUnlock('open-result', {
                      inventoryId: chest.id,
                      cardId: result.card_id,
                      cardName: result.card_name,
                      wasNew: result.was_new,
                    })
                    setOpening(result)
                    setUnlock({ inventoryId: chest.id, opening: result })
                  })
                  .catch((error: unknown) => {
                    logUnlock('open-error', { inventoryId: chest.id, error })
                  })
              }
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
      {unlock ? <CardUnlockOverlay unlock={unlock} onClose={closeUnlock} /> : null}
    </>
  )
}
