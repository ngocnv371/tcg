/**
 * Timing and colour vocabulary for the rank-up reveal, kept out of the component file so
 * that file only exports components (what Fast Refresh wants) and the frame maths stays
 * testable without mounting a composition.
 *
 * The chest reveals and this animation deliberately share one stage (`unlockLayout` /
 * `unlockVisuals`), so a rank-up plays in the same frame as the opening that granted
 * the card.
 */
import { Easing, interpolate } from 'remotion'

/**
 * Frames the rank-up reveal runs for. 140 at 30fps ≈ 4.7s — inside the 5s budget the
 * upgrade is allowed, with the last beats reserved for the caption to be readable.
 */
export const RANK_UP_DURATION = 140

/**
 * Beat boundaries in frames. Each beat runs to its end value and stays there, so the
 * card, the colour shift and the caption all settle before the Player stops.
 */
export const RANK_UP_BEATS = {
  /** The card scales and fades in, still lit by the OLD rank colour. */
  intro: [0, 24],
  /** A highlight band sweeps the art while the glow shifts to the NEW rank colour. */
  sweep: [20, 58],
  /** The newly earned star ignites, then the rest of the row pops in behind it. */
  star: [58, 100],
  /** Caption rises under the card and holds. */
  caption: [88, 116],
} as const satisfies Record<string, readonly [number, number]>

/** Star slots drawn under the card — one per `rank_meta` row. */
export const RANK_STAR_SLOTS = 5

/** How much of the sweep band sits outside the card at each end, as a share of its width. */
const SWEEP_TRAVEL = 1.5

/** Clamped 0..1 progress across a beat, eased so a beat never starts or stops abruptly. */
export function beatProgress(frame: number, beat: readonly [number, number]): number {
  const [start, end] = beat
  if (end <= start) return frame >= start ? 1 : 0
  return interpolate(frame, [start, end], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

/** Translate for the sweeping highlight, in percentages of the card width. */
export function sweepOffset(frame: number): number {
  const t = beatProgress(frame, RANK_UP_BEATS.sweep)
  return interpolate(t, [0, 1], [-SWEEP_TRAVEL, SWEEP_TRAVEL])
}

/**
 * 0..1 for one star slot: already-earned ranks stay lit, the newly earned star is the one
 * that animates, and every slot past the new rank stays an empty outline.
 */
export function starIgnition(frame: number, slot: number, fromRank: number): number {
  if (slot < fromRank) return 1
  if (slot > fromRank) return 0
  return beatProgress(frame, RANK_UP_BEATS.star)
}
