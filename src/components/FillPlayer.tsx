import { Player, type PlayerRef } from '@remotion/player'
import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react'

import { STAGE_FPS } from '@/features/chests/unlockLayout'

/**
 * A Remotion Player that fills its container by matching the composition size to the measured box.
 * The reveal stage is authored at 390x844, so a fixed composition letterboxes itself into a strip
 * on anything that is not that exact shape — this keeps the stage edge-to-edge instead, and the
 * compositions scale their layout anchors against `useVideoConfig()`.
 */
export function FillPlayer<Props extends Record<string, unknown>>({
  component,
  inputProps,
  durationInFrames,
  playerKey,
  playerRef,
  autoPlay = true,
  loop = false,
  onReady,
}: {
  component: ComponentType<Props>
  inputProps: Props
  durationInFrames: number
  /** Change to remount the underlying Player (e.g. one clash per id) without re-measuring. */
  playerKey?: string | number
  playerRef?: RefObject<PlayerRef | null>
  autoPlay?: boolean
  loop?: boolean
  /** Called once, the first time the box is measured and the Player actually exists. */
  onReady?: () => void
}) {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const measured = size !== null && size.width > 0 && size.height > 0
  const readyFired = useRef(false)

  useEffect(() => {
    if (!node) return
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  // Fire once: the measured box renders the Player a commit later, and callers use this to know
  // the PlayerRef is finally attached before they play() / listen for 'ended'.
  useEffect(() => {
    if (!measured || readyFired.current) return
    readyFired.current = true
    onReady?.()
  }, [measured, onReady])

  return (
    <div ref={setNode} className="absolute inset-0">
      {measured ? (
        <Player
          key={playerKey}
          ref={playerRef}
          component={component}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={STAGE_FPS}
          compositionWidth={size.width}
          compositionHeight={size.height}
          autoPlay={autoPlay}
          loop={loop}
          controls={false}
          clickToPlay={false}
          style={{ height: '100%', width: '100%' }}
        />
      ) : null}
    </div>
  )
}
