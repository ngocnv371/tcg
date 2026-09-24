import type { CSSProperties } from 'react'
import { interpolate, spring } from 'remotion'

import { STAGE_FPS, STAGE_SIZE, gridMetrics, type Placement } from '@/features/chests/unlockLayout'

/**
 * Shared vocabulary for the card reveals: how long each beat lasts, the rank tint, the
 * reveal curve, the stage backdrop and the Player chrome. Kept out of the component files
 * so those only export components (which is what Fast Refresh wants).
 */

/** Frames the single-card reveal runs for; `CardUnlockAnimation` is composed at this length. */
export const UNLOCK_DURATION = 150
/**
 * Frame the fan beat opens on. It sits inside the single-card intro rather than after it, so the
 * extras take their places behind the first card *while* its caption rises — the fan and the title
 * read as one beat instead of two in sequence.
 */
export const FAN_START = 34
/** Frames the first card's caption takes to rise into place; the fan springs over the same beat. */
export const CAPTION_DURATION = 18
/** The window the extras are staggered across as they take their places in the fan. */
export const FAN_DURATION = 30
/** The grid beat: one second for every card to spread into its slot. */
export const SPREAD_DURATION = 30
/**
 * Frames between the intro caption rising and the cards having finished aligning in the grid. Half
 * of what the batch spent here before: the extras already land during the intro, so the rest of
 * that stretch was a still frame under a motionless caption.
 */
export const GRID_LEAD_IN = 73
/** Opens the grid beat so its last frame lands exactly on `FAN_START + GRID_LEAD_IN`. */
export const SPREAD_START = FAN_START + GRID_LEAD_IN - SPREAD_DURATION
/** How long the finished grid holds while the total caption rises. */
export const SETTLE_DURATION = 30
/**
 * Intro (with the fan inside it), grid beat, settle — so opening ten chests replays that same
 * intro once instead of running 5s per card.
 */
export const BATCH_DURATION = FAN_START + GRID_LEAD_IN + SETTLE_DURATION

/**
 * Cascade variant. The first card is dealt on `CASCADE_DEAL_START` and one more lands every
 * `CASCADE_DEAL_STEP` frames. The step is deliberately shorter than `CASCADE_DEAL_FRAMES`, so the
 * next card is already flying while the previous one settles — a riffle, not a queue.
 */
export const CASCADE_DEAL_START = 8
export const CASCADE_DEAL_STEP = 8
export const CASCADE_DEAL_FRAMES = 24
/** Frames the finished grid holds there; the closing caption rises across this beat. */
export const CASCADE_SETTLE = 24

/**
 * Burst variant. The pile blows apart on `BURST_LAUNCH`, the middle grid rows first and the outer
 * ones `BURST_RING_STEP` later each, so the grid assembles outwards. `BURST_FLIGHT` matches the
 * flight spring in `CardBatchUnlockBurst`: a card is in its slot by about then.
 */
export const BURST_LAUNCH = 10
/**
 * Wide enough that the rings read as a wave rather than one simultaneous move — and wide enough
 * that the last ring is still travelling when the caption starts, so the burst never sits still.
 */
export const BURST_RING_STEP = 10
/** Matches the flight spring in `CardBatchUnlockBurst`: a card is in its slot by about here. */
export const BURST_FLIGHT = 26
/** Frames the finished grid holds there; the closing caption rises across this beat. */
export const BURST_SETTLE = 20

/**
 * Frame counts for the grid variants. Unlike the fan's fixed `BATCH_DURATION` — which has a fixed
 * intro to fit — these are derived from the card count. A deal or a burst that kept the ten-card
 * length would leave still faces on screen for a two-card open, which is the one thing the batch
 * timeline must never do.
 */
export function cascadeLandsAt(count: number) {
  return CASCADE_DEAL_START + (Math.max(1, count) - 1) * CASCADE_DEAL_STEP + CASCADE_DEAL_FRAMES
}

export function cascadeDuration(count: number) {
  return cascadeLandsAt(count) + CASCADE_SETTLE
}

export function burstLandsAt(count: number) {
  const rings = gridMetrics(Math.max(1, count)).rows
  return BURST_LAUNCH + (rings - 1) * BURST_RING_STEP + BURST_FLIGHT
}

export function burstDuration(count: number) {
  return burstLandsAt(count) + BURST_SETTLE
}

/** Gap between the grid block and the closing caption hung underneath it. */
export const CAPTION_GAP = 26

/**
 * Centre-anchored absolute box for one card face at a placement. Shared by every batch variant, so
 * a card is positioned and scaled the same way whatever the reveal does around it.
 */
export function positionedBox(placement: Placement, zIndex: number, opacity: number): CSSProperties {
  return {
    left: '50%',
    opacity,
    position: 'absolute',
    top: '50%',
    transform: `translate(-50%, -50%) translate(${placement.x}px, ${placement.y}px) rotate(${placement.rotate}deg) scale(${placement.scale})`,
    zIndex,
  }
}

/** Backdrop both reveals render in, so a multi open never jumps to a different stage. */
export const UNLOCK_STAGE_STYLE: CSSProperties = {
  alignItems: 'center',
  background: 'radial-gradient(circle at 50% 43%, #302248 0%, #100d1c 48%, #07060d 100%)',
  color: '#f2f0f8',
  fontFamily: 'Georgia, serif',
  justifyContent: 'center',
  overflow: 'hidden',
}

/**
 * Player chrome shared by every reveal, so an opening and a rank-up play on the same stage.
 * Spread onto `<Player {...REVEAL_PLAYER_STAGE} />`; the caller only adds `component`,
 * `durationInFrames` and `inputProps`.
 */
export const REVEAL_PLAYER_STAGE = {
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

const RANK_COLORS = ['#8b93a7', '#57c98a', '#4aa3ff', '#b06bff', '#ffb02e']
const REVEAL_SPRING = { damping: 13, mass: 0.8, stiffness: 120 }

/** Rank tint, shared so a card looks the same in the single and the batch reveal. */
export function rankColor(rank: number) {
  return RANK_COLORS[Math.max(0, Math.min(rank - 1, RANK_COLORS.length - 1))]
}

/**
 * Reveal curve for one card face. The batch reveal calls this for its first card, so a single
 * opening and the start of a multi opening are the same animation. Every value settles to its
 * end state, which is what lets the batch blend that card into its grid slot afterwards.
 */
export function cardReveal(frame: number, fps: number) {
  const reveal = spring({ config: REVEAL_SPRING, fps, frame })
  return {
    flip: interpolate(reveal, [0, 1], [180, 0]),
    opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' }),
    rotate: interpolate(reveal, [0, 0.65, 1], [-18, 8, 0]),
    scale: interpolate(reveal, [0, 1], [0.45, 1]),
  }
}
