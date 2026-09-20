import type { CSSProperties } from 'react'
import { interpolate, spring } from 'remotion'

import { STAGE_FPS, STAGE_SIZE } from '@/features/chests/unlockLayout'

/**
 * Shared vocabulary for the card reveals: how long each beat lasts, the rank tint, the
 * reveal curve, the stage backdrop and the Player chrome. Kept out of the component files
 * so those only export components (which is what Fast Refresh wants).
 */

/** Frames the single-card reveal runs for. The batch reveal replays it as its first phase. */
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
/** The grid beat opens as the intro caption hands off, so the fan beat no longer delays it. */
export const SPREAD_START = UNLOCK_DURATION
/** The grid beat: one second for every card to spread into its slot. */
export const SPREAD_DURATION = 30
/** How long the finished grid holds while the total caption rises. */
export const SETTLE_DURATION = 30
/**
 * Intro (with the fan inside it), grid beat, settle — so opening ten chests replays that same 5s
 * intro once instead of running 5s per card.
 */
export const BATCH_DURATION = SPREAD_START + SPREAD_DURATION + SETTLE_DURATION

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
