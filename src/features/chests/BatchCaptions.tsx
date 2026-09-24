import { STAGE_SIZE, gridMetrics } from '@/features/chests/unlockLayout'
import { CAPTION_GAP } from '@/features/chests/unlockVisuals'

/**
 * Captions sit above every card face (card boxes are stacked with z-indexes from 1 up), so a
 * crowded grid can never paint over them.
 */
const CAPTION_Z = 100

/**
 * The `UNLOCK N CARDS` title at the foot of the stage. Shared by every batch variant so a multi
 * open always announces itself the same way, whatever the cards do underneath, and so the single
 * opening's caption and the start of a multi opening stay the same beat.
 */
export function BatchIntroCaption({ count, opacity, y }: { count: number; opacity: number; y: number }) {
  return (
    <div
      style={{
        bottom: 28,
        left: 0,
        opacity,
        position: 'absolute',
        right: 0,
        textAlign: 'center',
        transform: `translateY(${y}px)`,
        zIndex: CAPTION_Z,
      }}
    >
      <div style={{ color: '#ffe08a', fontSize: 13, letterSpacing: 2 }}>UNLOCK {count} CARDS</div>
    </div>
  )
}

/**
 * The closing caption, hung under the grid block. Every variant ends on this line *and* on the same
 * grid, so the alternatives differ in the journey rather than in where they land.
 */
export function BatchGridCaption({ count, opacity }: { count: number; opacity: number }) {
  const { height } = gridMetrics(count)

  return (
    <div
      style={{
        left: 0,
        opacity,
        position: 'absolute',
        right: 0,
        textAlign: 'center',
        top: STAGE_SIZE.height / 2 + height / 2 + CAPTION_GAP,
        zIndex: CAPTION_Z,
      }}
    >
      <div style={{ color: '#ffe08a', fontSize: 13, letterSpacing: 2 }}>{count} CARDS REVEALED</div>
    </div>
  )
}
