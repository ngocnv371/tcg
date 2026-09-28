/**
 * Timing, geometry and vocabulary for the quest battle's Remotion interludes: the combat intro
 * and the attack clash. Deliberately pure — no React, no Remotion — so the placements can be
 * unit tested without mounting a Player, exactly like `runVictoryVisuals`.
 */
import { STAGE_FPS, STAGE_SIZE } from '@/features/chests/unlockLayout'

export const COMBAT_STAGE_FPS = STAGE_FPS

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
 * Both sides' card faces plus the name plate under them, sized so three fit on one row and a
 * five-card party fits in two.
 */
export const INTRO_TILE_SIZE = { height: 142, width: 84 } as const
const INTRO_PER_ROW = 3
const INTRO_GAP = 10

export type Offset = { x: number; y: number }

/** Cards in reading order: at most three per row, the short last row centred. */
export function combatantPlacements(count: number): Offset[] {
  if (count <= 0) return []
  const rows = Math.ceil(count / INTRO_PER_ROW)
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / INTRO_PER_ROW)
    const column = index % INTRO_PER_ROW
    const inRow = Math.min(INTRO_PER_ROW, count - row * INTRO_PER_ROW)
    return {
      x: (column - (inRow - 1) / 2) * (INTRO_TILE_SIZE.width + INTRO_GAP),
      y: (row - (rows - 1) / 2) * (INTRO_TILE_SIZE.height + INTRO_GAP),
    }
  })
}

/**
 * Vertical anchors on the stage, as the `top` of each zero-size placement block: the two parties
 * face each other across the VS stamp, the enemy above and the player's own cards below.
 */
export const INTRO_LAYOUT = {
  titleTop: 116,
  enemyTop: 320,
  versusTop: 500,
  partyTop: 650,
} as const

/**
 * The attack clash: the player's figure stands below the centre and swings up, the enemy's
 * stands above and swings down — matching the battle screen, where the party is at the bottom.
 */
export const ATTACK_LAYOUT = {
  center: { x: STAGE_SIZE.width / 2, y: STAGE_SIZE.height / 2 },
  /** Distance from the centre to each figure's resting spot. */
  reach: 190,
  /** How far the attacker travels toward the defender at the peak of the lunge. */
  lunge: 176,
  /** Frame the clash lands on. */
  impactFrame: 12,
} as const

export function attackerHome(side: 'player' | 'enemy'): Offset {
  return {
    x: ATTACK_LAYOUT.center.x,
    y: ATTACK_LAYOUT.center.y + (side === 'player' ? ATTACK_LAYOUT.reach : -ATTACK_LAYOUT.reach),
  }
}

export function defenderHome(side: 'player' | 'enemy'): Offset {
  return {
    x: ATTACK_LAYOUT.center.x,
    y: ATTACK_LAYOUT.center.y + (side === 'player' ? -ATTACK_LAYOUT.reach : ATTACK_LAYOUT.reach),
  }
}

/** Signed travel toward the defender at full lunge. */
export function lungeOffset(side: 'player' | 'enemy'): number {
  return side === 'player' ? -ATTACK_LAYOUT.lunge : ATTACK_LAYOUT.lunge
}
