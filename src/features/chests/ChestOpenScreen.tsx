import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import { Player, type PlayerRef } from '@remotion/player'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog } from '@/features/cards/api'
import { CardGrid } from '@/features/cards/CardBrowser'
import { CardTile } from '@/features/cards/CardTile'
import { CardBatchUnlockAnimation } from '@/features/chests/CardBatchUnlockAnimation'
import { CardUnlockAnimation } from '@/features/chests/CardUnlockAnimation'
import { STAGE_FPS, STAGE_SIZE } from '@/features/chests/unlockLayout'
import { BATCH_DURATION, UNLOCK_DURATION } from '@/features/chests/unlockVisuals'
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

function logUnlock(event: string, details?: Record<string, unknown>) {
  if (import.meta.env.DEV) console.debug(`[chest-unlock] ${event}`, details ?? {})
}

type RevealState = {
  /** Unique per reveal, so the Player remounts between openings. */
  key: string
  /** A single chest reveals one card; a bulk open reveals every card in one animation. */
  openings: ChestOpening[]
}

/** Player chrome, shared by both reveals — they play on the same stage. */
const PLAYER_STAGE = {
  compositionHeight: STAGE_SIZE.height,
  compositionWidth: STAGE_SIZE.width,
  controls: false,
  fps: STAGE_FPS,
  height: STAGE_SIZE.height,
  style: {
    aspectRatio: `${STAGE_SIZE.width} / ${STAGE_SIZE.height}`,
    height: `min(100vh, ${STAGE_SIZE.height}px)`,
    width: `min(100vw, ${STAGE_SIZE.width}px)`,
  } satisfies CSSProperties,
  width: STAGE_SIZE.width,
}

function RevealOverlay({ reveal, onClose }: { reveal: RevealState; onClose: () => void }) {
  const playerRef = useRef<PlayerRef>(null)
  const [first] = reveal.openings
  const isBatch = reveal.openings.length > 1

  useEffect(() => {
    logUnlock('overlay-mounted', {
      key: reveal.key,
      cardId: first.card_id,
      cardName: first.card_name,
      cards: reveal.openings.length,
    })
    const player = playerRef.current
    if (!player) {
      logUnlock('player-ref-missing', { key: reveal.key })
      return
    }

    let hasStarted = false
    const handlePlay = () => {
      hasStarted = true
      logUnlock('play', { key: reveal.key, frame: player.getCurrentFrame() })
    }
    const handleEnded = () => {
      logUnlock('ended', { key: reveal.key, frame: player.getCurrentFrame(), hasStarted })
      if (hasStarted) onClose()
    }
    const handleFrameUpdate = ({ detail }: { detail: { frame: number } }) => {
      if (detail.frame % 30 === 0) logUnlock('frame', { key: reveal.key, frame: detail.frame })
    }

    player.addEventListener('play', handlePlay)
    player.addEventListener('ended', handleEnded)
    player.addEventListener('frameupdate', handleFrameUpdate)
    logUnlock('listeners-attached', { key: reveal.key })
    player.seekTo(0)
    logUnlock('seek-zero', { key: reveal.key })
    player.play()
    logUnlock('play-requested', { key: reveal.key })

    return () => {
      logUnlock('cleanup', { key: reveal.key, frame: player.getCurrentFrame() })
      player.removeEventListener('play', handlePlay)
      player.removeEventListener('ended', handleEnded)
      player.removeEventListener('frameupdate', handleFrameUpdate)
      player.pause()
    }
  }, [first.card_id, first.card_name, onClose, reveal])

  return (
    <div
      aria-label={isBatch ? 'New cards unlocked' : 'New card unlocked'}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950"
      role="dialog"
    >
      {isBatch ? (
        <Player
          key={reveal.key}
          ref={playerRef}
          component={CardBatchUnlockAnimation}
          durationInFrames={BATCH_DURATION}
          inputProps={{
            cards: reveal.openings.map((opening) => ({
              artPath: opening.art_path,
              cardName: opening.card_name,
              rank: opening.rank,
              wasNew: opening.was_new,
            })),
          }}
          {...PLAYER_STAGE}
        />
      ) : (
        <Player
          key={reveal.key}
          ref={playerRef}
          component={CardUnlockAnimation}
          durationInFrames={UNLOCK_DURATION}
          inputProps={{
            artPath: first.art_path,
            cardName: first.card_name,
            rank: first.rank,
            wasNew: first.was_new,
          }}
          {...PLAYER_STAGE}
        />
      )}
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
  const [reveal, setReveal] = useState<RevealState | null>(null)
  const unopened = inventory?.filter((chest) => !chest.opened_at) ?? []

  // Stacked chests collapse to one row per type; anything not in the catalog
  // order still shows up, just after the known tiers.
  const groups = [...VAULT_ORDER, ...[...new Set(unopened.map((chest) => chest.chest_id))].filter(
    (chestId) => !VAULT_ORDER.includes(chestId),
  )]
    .map((chestId) => ({ chestId, count: unopened.filter((chest) => chest.chest_id === chestId).length }))
    .filter((group) => group.count > 0)

  // Closing the overlay is the only way out: the reveal always ends in the vault grid behind it.
  const closeReveal = useCallback(() => {
    logUnlock('close-requested')
    setReveal(null)
  }, [])

  const handleOpen = (chestId: string, qty: number) => {
    openChests
      .mutateAsync({ chestId, qty })
      .then((openings) => {
        logUnlock('open-result', { chestId, qty, cardIds: openings.map((opening) => opening.card_id) })
        if (!openings.length) return
        setBatch(openings)
        // One reveal for the whole open: a bulk open fans its extra cards itself instead of
        // replaying the single-card animation once per chest.
        setReveal({ key: `${chestId}-${Date.now()}`, openings })
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
                {batch.map((opening) => {
                  const card = cardById.get(opening.card_id)
                  if (!card) return null
                  return (
                    <div key={opening.player_card_id} className="space-y-1">
                      {/* Open the copy that was just granted, not the catalog card — the
                          player may already own other copies at different ranks. */}
                      <NavLink to={`/cards/${opening.player_card_id}`}>
                        <CardTile
                          card={card}
                          owned
                          rank={opening.rank}
                          badge={opening.was_new ? 'New' : 'Copy'}
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
      {reveal ? <RevealOverlay onClose={closeReveal} reveal={reveal} /> : null}
    </>
  )
}
