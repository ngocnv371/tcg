/**
 * Timing, geometry and vocabulary for the quest battle's Remotion interludes: the combat intro
 * and the attack clash. Deliberately pure — no React, no Remotion — so the placements can be
 * unit tested without mounting a Player, exactly like `runVictoryVisuals`.
 */
import { STAGE_FPS, STAGE_SIZE } from '@/features/chests/unlockLayout'

export const COMBAT_STAGE_FPS = STAGE_FPS

/**
 * How much a combat scene's art grows with the composition. Every size here is authored against
 * the 390x844 stage, so the smaller of the two ratios is what stretches a row of cards across the
 * whole screen on a phone without letting it overflow on a wide or short window — the scenes stay
 * phone-proportioned and centred rather than bursting out of the frame.
 */
export function combatArtScale(width: number, height: number) {
  return Math.min(width / STAGE_SIZE.width, height / STAGE_SIZE.height)
}

/** 2s at 30fps: enough for the opponent party to be introduced before the first turn. */
export const COMBAT_INTRO_DURATION = 60
/** The attack clash: 1s on a hit, a touch shorter on a whiff. */
export const ATTACK_HIT_DURATION = 30
export const ATTACK_MISS_DURATION = 22

/** Beat boundaries (frames) of the combat intro. Each holds at its end value. */
export const INTRO_BEATS = {
  title: [0, 12],
  enemies: [8, 38],
  versus: [32, 48],
  party: [36, 58],
} as const satisfies Record<string, readonly [number, number]>

/** Frames between two neighbouring cards slamming in. */
export const INTRO_ENEMY_STAGGER = 6
export const INTRO_PARTY_STAGGER = 4

/**
 * Both sides' card faces plus the name plate under them, sized so three fill most of the stage
 * width on one row and a five-card party fits in two.
 */
export const INTRO_TILE_SIZE = { height: 164, width: 106 } as const
const INTRO_PER_ROW = 3
const INTRO_GAP = 10

export type Offset = { x: number; y: number }

/**
 * Cards in reading order: at most three per row, the short last row centred. Offsets are stage
 * pixels, so a scene multiplies the whole block by `combatArtScale` — one number is what keeps the
 * rows filling the real screen width at any phone size.
 */
export function combatantPlacements(count: number, scale = 1): Offset[] {
  if (count <= 0) return []
  const rows = Math.ceil(count / INTRO_PER_ROW)
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / INTRO_PER_ROW)
    const column = index % INTRO_PER_ROW
    const inRow = Math.min(INTRO_PER_ROW, count - row * INTRO_PER_ROW)
    return {
      x: (column - (inRow - 1) / 2) * (INTRO_TILE_SIZE.width + INTRO_GAP) * scale,
      y: (row - (rows - 1) / 2) * (INTRO_TILE_SIZE.height + INTRO_GAP) * scale,
    }
  })
}

/**
 * Vertical anchors on the 390x844 stage, as the `top` of each zero-size placement block: the two
 * parties face each other across the VS stamp, the enemy above and the player's own cards below,
 * spread from the top of the screen to its bottom instead of clustered in the middle.
 */
export const INTRO_LAYOUT = {
  titleTop: 96,
  enemyTop: 258,
  versusTop: 412,
  partyTop: 612,
  partyLabelBottom: 40,
} as const

/**
 * The attack clash: the figures fill the screen — the player's below the centre swinging up, the
 * enemy's above and swinging down — matching the battle board, where the party is at the bottom.
 * The reach and lunge are measured on the stage and scaled by `combatArtScale` at render time, so
 * the figures grow with the screen and the clash reads at any phone size.
 */
export const ATTACK_LAYOUT = {
  center: { x: STAGE_SIZE.width / 2, y: STAGE_SIZE.height / 2 },
  /** Distance from the centre to each figure's resting spot. */
  reach: 196,
  /** How far the attacker travels toward the defender at the peak of the lunge. */
  lunge: 172,
  /** Frame the clash lands on. */
  impactFrame: 12,
} as const

/** Figure size on the stage, before `combatArtScale` stretches it onto the real screen. */
export const ATTACK_FIGURE_SIZE = { height: 320, width: 204 } as const

/** Where each side rests, as an offset from the stage centre (the player sits below it). */
export function attackerOffset(side: 'player' | 'enemy'): Offset {
  return { x: 0, y: side === 'player' ? ATTACK_LAYOUT.reach : -ATTACK_LAYOUT.reach }
}

export function defenderOffset(side: 'player' | 'enemy'): Offset {
  return { x: 0, y: side === 'player' ? -ATTACK_LAYOUT.reach : ATTACK_LAYOUT.reach }
}

/** Signed travel toward the defender at full lunge. */
export function lungeOffset(side: 'player' | 'enemy'): number {
  return side === 'player' ? -ATTACK_LAYOUT.lunge : ATTACK_LAYOUT.lunge
}
