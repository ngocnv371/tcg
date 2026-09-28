import { Player, type PlayerRef } from '@remotion/player'
import { useEffect, useMemo, useRef } from 'react'

import { REVEAL_PLAYER_STAGE } from '@/features/chests/unlockVisuals'
import { materialLabel } from '@/features/dungeons/format'
import { RunVictoryAnimation, type VictoryPartyCard } from '@/features/dungeons/RunVictoryAnimation'
import { RUN_VICTORY_DURATION, victoryRewards } from '@/features/dungeons/runVictoryVisuals'
import { useMaterialCatalog } from '@/features/inventory/api'
import type { QuestClear } from '@/features/quests/api'
import { resolveArtSrc } from '@/lib/art'
import type { Quest } from '@/types/db'

/**
 * The celebration after a quest is won — the SAME Remotion piece the dungeon claim plays, so a
 * cleared quest feels like every other payout in the game. It runs once and closes itself; the
 * settlement panel opens behind it, exactly like `RunVictoryOverlay` on the dungeons screen.
 */
export function QuestVictoryOverlay({
  quest,
  party,
  partyName,
  clear,
  onClose,
}: {
  quest: Quest
  party: VictoryPartyCard[]
  partyName: string | null
  clear: QuestClear
  onClose: () => void
}) {
  const playerRef = useRef<PlayerRef>(null)
  const { data: materials } = useMaterialCatalog()

  // The reward rows are the only thing here that needs the catalog; a missing entry just falls
  // back to the humanised id, so it never blocks the video from starting.
  const rewards = useMemo(() => {
    const materialById = new Map((materials ?? []).map((material) => [material.id, material]))
    return victoryRewards(
      {
        gold: clear.rewards.gold,
        materials: Object.entries(clear.rewards.materials).map(([material_id, qty]) => ({
          material_id,
          qty,
        })),
      },
      (id) => materialById.get(id)?.name ?? materialLabel(id),
      (id) => resolveArtSrc(materialById.get(id)?.icon ?? null),
    )
  }, [clear.rewards, materials])

  useEffect(() => {
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
  }, [onClose])

  return (
    <div
      aria-label={`${quest.name} cleared`}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950"
      role="dialog"
    >
      <Player
        ref={playerRef}
        component={RunVictoryAnimation}
        durationInFrames={RUN_VICTORY_DURATION}
        inputProps={{
          dungeonName: quest.name,
          title: 'QUEST CLEARED',
          multiplier: null,
          party,
          partyName,
          rewards,
        }}
        {...REVEAL_PLAYER_STAGE}
      />
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
