import { useEffect, useMemo, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'

import { useCardCatalog, useCollection } from '@/features/cards/api'
import { REVEAL_PLAYER_STAGE } from '@/features/chests/unlockVisuals'
import { RunVictoryAnimation, type VictoryPartyCard } from '@/features/dungeons/RunVictoryAnimation'
import { materialLabel } from '@/features/dungeons/format'
import { RUN_VICTORY_DURATION, victoryRewards } from '@/features/dungeons/runVictoryVisuals'
import { useMaterialCatalog } from '@/features/inventory/api'
import { useChestCatalog } from '@/features/marketplace/api'
import { useParties } from '@/features/party/api'
import type { RunClaim } from '@/features/progression/api'
import { resolveArtSrc } from '@/lib/art'
import type { Dungeon, DungeonRun } from '@/types/db'

export type RunVictory = {
  /** Unique per claim, so the Player remounts instead of resuming a finished animation. */
  key: string
  run: DungeonRun
  dungeon: Dungeon
  claim: RunClaim
}

/** The stage backdrop, shown for the frame or two before the party query answers. */
const STAGE_BACKDROP_STYLE = { background: 'radial-gradient(circle at 50% 43%, #302248 0%, #100d1c 48%, #07060d 100%)' }

/**
 * Celebration played between tapping Claim and the settlement panel. It runs once and closes
 * itself, so the only state the screen owns is which run is being celebrated — the same shape
 * as the chest reveal and the rank-up overlays.
 *
 * The party is resolved here rather than on the dungeons screen: it is only ever needed in the
 * instant after a claim, and the three queries it reads are already cached by the rest of the
 * app, so the screen does not pay for them on every visit.
 */
export function RunVictoryOverlay({ victory, onClose }: { victory: RunVictory; onClose: () => void }) {
  const playerRef = useRef<PlayerRef>(null)
  const { data: parties } = useParties()
  const { data: collection } = useCollection()
  const { data: catalog } = useCardCatalog()
  const { data: materials } = useMaterialCatalog()
  const { data: chests } = useChestCatalog()

  const loadout = useMemo(
    () => (parties ?? []).find((option) => option.party.id === victory.run.party_id) ?? null,
    [parties, victory.run.party_id],
  )

  const party = useMemo<VictoryPartyCard[]>(() => {
    if (!loadout) return []
    const playerCardById = new Map((collection ?? []).map((row) => [row.id, row]))
    const cardById = new Map((catalog ?? []).map((card) => [card.id, card]))
    return loadout.slots.flatMap((slot) => {
      const playerCard = playerCardById.get(slot.player_card_id)
      const card = playerCard ? cardById.get(playerCard.card_id) : undefined
      return card && playerCard
        ? [{ artPath: card.art_path, cardName: card.name, rank: playerCard.rank }]
        : []
    })
  }, [catalog, collection, loadout])

  // The reward labels and icons need the material catalog, but a missing entry only falls back
  // to the humanised id and the placeholder glyph — waiting for it before starting the video
  // would be a stutter for nothing.
  const rewards = useMemo(() => {
    const materialById = new Map((materials ?? []).map((material) => [material.id, material]))
    const chestById = new Map((chests ?? []).map((chest) => [chest.id, chest]))
    return victoryRewards(
      victory.claim.rewards,
      (id) => materialById.get(id)?.name ?? materialLabel(id),
      (id) => resolveArtSrc(materialById.get(id)?.icon ?? null),
      (id) => resolveArtSrc(chestById.get(id)?.icon ?? null),
    )
  }, [materials, chests, victory.claim.rewards])

  // Starting the Player before the party resolves would animate an empty stage: the animation
  // is driven by its own frame number, so late-arriving cards never get their entrance.
  const partyReady = Boolean(parties && collection && catalog)

  useEffect(() => {
    if (!partyReady) return
    const player = playerRef.current
    if (!player) return

    let hasStarted = false
    const handlePlay = () => {
      hasStarted = true
    }
    // Only close on an animation that actually ran, so a stalled Player can't dismiss itself.
    const handleEnded = () => {
      if (hasStarted) onClose()
    }

    player.addEventListener('play', handlePlay)
    player.addEventListener('ended', handleEnded)
    player.seekTo(0)
    player.play()

    return () => {
      player.removeEventListener('play', handlePlay)
      player.removeEventListener('ended', handleEnded)
      player.pause()
    }
  }, [onClose, partyReady])

  return (
    <div
      aria-label={`${victory.dungeon.name} cleared`}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950"
      role="dialog"
    >
      {partyReady ? (
        <Player
          key={victory.key}
          ref={playerRef}
          component={RunVictoryAnimation}
          durationInFrames={RUN_VICTORY_DURATION}
          inputProps={{
            dungeonName: victory.dungeon.name,
            multiplier: victory.claim.rewards?.multiplier ?? null,
            party,
            partyName: loadout?.party.name ?? null,
            rewards,
          }}
          {...REVEAL_PLAYER_STAGE}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{ ...STAGE_BACKDROP_STYLE, ...REVEAL_PLAYER_STAGE.style }}
        />
      )}
      <button
        type="button"
        aria-label="Skip victory animation"
        className="absolute right-4 top-4 rounded-card border border-ink-600 bg-ink-900/80 px-3 py-2 text-xs text-ink-200"
        onClick={onClose}
      >
        Skip
      </button>
    </div>
  )
}
