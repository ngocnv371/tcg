import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Player, type PlayerRef } from '@remotion/player'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog } from '@/features/cards/api'
import { CardGrid } from '@/features/cards/CardBrowser'
import { CardTile } from '@/features/cards/CardTile'
import { CardUnlockAnimation } from '@/features/chests/CardUnlockAnimation'
import {
  useChestInventory,
  useClaimDailyChest,
  useGrantTestChests,
  useOpenChests,
  type ChestOpening,
} from '@/features/progression/api'
import { CHEST_ODDS } from '@/game/formulas'

const CHESTS = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const

/** Bulk-open steps offered per stacked chest type. 1 is the default action. */
const OPEN_QUANTITIES = [1, 2, 5, 10] as const

/** Best tiers first — the vault is read top-down. */
const VAULT_ORDER: readonly string[] = [...CHESTS].reverse()

type UnlockState = {
  /** Unique per reveal, so the Player remounts between stacked openings. */
  key: string
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
      key: unlock.key,
      cardId: unlock.opening.card_id,
      cardName: unlock.opening.card_name,
    })
    const player = playerRef.current
    if (!player) {
      logUnlock('player-ref-missing', { key: unlock.key })
      return
    }

    let hasStarted = false
    const handlePlay = () => {
      hasStarted = true
      logUnlock('play', { key: unlock.key, frame: player.getCurrentFrame() })
    }
    const handleEnded = () => {
      logUnlock('ended', { key: unlock.key, frame: player.getCurrentFrame(), hasStarted })
      if (hasStarted) onClose()
    }
    const handleFrameUpdate = ({ detail }: { detail: { frame: number } }) => {
      if (detail.frame % 30 === 0) logUnlock('frame', { key: unlock.key, frame: detail.frame })
    }

    player.addEventListener('play', handlePlay)
    player.addEventListener('ended', handleEnded)
    player.addEventListener('frameupdate', handleFrameUpdate)
    logUnlock('listeners-attached', { key: unlock.key })
    player.seekTo(0)
    logUnlock('seek-zero', { key: unlock.key })
    player.play()
    logUnlock('play-requested', { key: unlock.key })

    return () => {
      logUnlock('cleanup', { key: unlock.key, frame: player.getCurrentFrame() })
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
        key={unlock.key}
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
  const { data: catalog } = useCardCatalog()
  const claimDailyChest = useClaimDailyChest()
  const grantTestChests = useGrantTestChests()
  const openChests = useOpenChests()
  const [batch, setBatch] = useState<ChestOpening[]>([])
  const [unlocks, setUnlocks] = useState<UnlockState[]>([])
  const unopened = inventory?.filter((chest) => !chest.opened_at) ?? []

  // Stacked chests collapse to one row per type; anything not in the catalog
  // order still shows up, just after the known tiers.
  const groups = [...VAULT_ORDER, ...[...new Set(unopened.map((chest) => chest.chest_id))].filter(
    (chestId) => !VAULT_ORDER.includes(chestId),
  )]
    .map((chestId) => ({ chestId, count: unopened.filter((chest) => chest.chest_id === chestId).length }))
    .filter((group) => group.count > 0)

  // Reveals play one after another: closing the overlay drops the head of the queue.
  const activeUnlock = unlocks[0] ?? null
  const closeUnlock = useCallback(() => {
    logUnlock('close-requested')
    setUnlocks((queue) => queue.slice(1))
  }, [])

  const handleOpen = (chestId: string, qty: number) => {
    openChests
      .mutateAsync({ chestId, qty })
      .then((openings) => {
        logUnlock('open-result', { chestId, qty, cardIds: openings.map((opening) => opening.card_id) })
        setBatch(openings)
        setUnlocks(openings.map((opening, index) => ({ key: `${chestId}-${Date.now()}-${index}`, opening })))
      })
      .catch((error: unknown) => {
        logUnlock('open-error', { chestId, qty, error })
      })
  }

  const actionError = error ?? claimDailyChest.error ?? grantTestChests.error ?? openChests.error

  // Reveals render as library tiles, so they need the catalog rows (already cached by `['cards']`).
  const cardById = new Map((catalog ?? []).map((card) => [card.id, card]))

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
          {groups.map(({ chestId, count }) => {
            const isOpening = openChests.isPending && openChests.variables?.chestId === chestId
            return (
              <div
                key={chestId}
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-ink-700 bg-ink-850 px-3 py-2"
              >
                <span className="text-sm text-ink-100">
                  <span className="capitalize">{chestId} chest</span>
                  <span className="ml-2 rounded-full bg-ink-700 px-2 py-0.5 text-xs tabular-nums text-ink-200">
                    ×{count}
                  </span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {OPEN_QUANTITIES.map((qty, index) => (
                    <button
                      key={qty}
                      type="button"
                      aria-label={`Open ${qty} ${chestId} chest${qty === 1 ? '' : 's'}`}
                      className={
                        index === 0
                          ? 'rounded-card bg-gold-500 px-2.5 py-1.5 text-xs font-medium text-ink-950 disabled:cursor-not-allowed disabled:opacity-40'
                          : 'rounded-card border border-ink-600 px-2.5 py-1.5 text-xs font-medium text-ink-200 disabled:cursor-not-allowed disabled:opacity-40'
                      }
                      disabled={openChests.isPending || qty > count}
                      onClick={() => handleOpen(chestId, qty)}
                    >
                      {isOpening ? '...' : `Open ${qty}`}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {batch.length ? (
            <div className="mt-3 border-t border-ink-800 pt-3">
              <p className="mb-2 tabular-nums text-[11px] text-ink-500">
                Opened {batch.length} chest{batch.length === 1 ? '' : 's'}
              </p>
              <CardGrid>
                {batch.map((opening, index) => {
                  const card = cardById.get(opening.card_id)
                  if (!card) return null
                  return (
                    <div key={`${opening.card_id}-${index}`} className="space-y-1">
                      <NavLink to={`/cards/${card.id}`}>
                        <CardTile
                          card={card}
                          owned
                          rank={opening.rank}
                          badge={opening.was_new ? 'New' : undefined}
                        />
                      </NavLink>
                      {opening.was_new ? null : (
                        <p className="truncate text-[9px] text-ink-500">
                          +{opening.shard_qty} {opening.shard_material}
                        </p>
                      )}
                    </div>
                  )
                })}
              </CardGrid>
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
      {activeUnlock ? <CardUnlockOverlay unlock={activeUnlock} onClose={closeUnlock} /> : null}
    </>
  )
}
