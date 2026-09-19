import { useEffect, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'

import { RankUpAnimation } from '@/features/cards/RankUpAnimation'
import { RANK_UP_DURATION } from '@/features/cards/rankUpVisuals'
import { REVEAL_PLAYER_STAGE } from '@/features/chests/unlockVisuals'

export type RankUpReveal = {
  /** Unique per rank-up, so the Player remounts if the same copy is upgraded again. */
  key: string
  cardName: string
  artPath: string | null
  fromRank: number
  toRank: number
}

/**
 * Full-screen rank-up celebration. It plays once and closes itself, so the only state the
 * screen owns is which upgrade to show — the same shape as the chest reveal overlay.
 */
export function RankUpOverlay({ reveal, onClose }: { reveal: RankUpReveal; onClose: () => void }) {
  const playerRef = useRef<PlayerRef>(null)

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
      aria-label={`Rank up to ${reveal.toRank} stars`}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950"
      role="dialog"
    >
      <Player
        key={reveal.key}
        ref={playerRef}
        component={RankUpAnimation}
        durationInFrames={RANK_UP_DURATION}
        inputProps={{
          artPath: reveal.artPath,
          cardName: reveal.cardName,
          fromRank: reveal.fromRank,
          toRank: reveal.toRank,
        }}
        {...REVEAL_PLAYER_STAGE}
      />
      <button
        type="button"
        aria-label="Close rank-up animation"
        className="absolute right-4 top-4 rounded-card border border-ink-600 bg-ink-900/80 px-3 py-2 text-xs text-ink-200"
        onClick={onClose}
      >
        Skip
      </button>
    </div>
  )
}
