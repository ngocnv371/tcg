/**
 * Timing, layout and vocabulary for the dungeon victory animation. Deliberately pure — no
 * React, no composition — so the beats, both layouts, the reward rows and the placeholder
 * glyph choice can be unit tested without mounting a Player, the same way `unlockLayout`
 * backs the chest reveals.
 */
import { Easing, interpolate } from 'remotion'

import { STAGE_SIZE } from '@/features/chests/unlockLayout'
import { CHEST_ODDS, CORE_TAGS, type CoreTag } from '@/game/formulas'
import type { RunRewards } from '@/types/db'

/**
 * Frames the victory animation runs for. 205 at 30fps ≈ 6.8s: the chest batch reveal is
 * 4.6s and a claim can now happen every few minutes, so the celebration gets a little more
 * room than a reveal — enough for the loot grid and the yield caption to be readable — 
 * without outstaying it.
 */
export const RUN_VICTORY_DURATION = 205

/**
 * Beat boundaries in frames. Each beat runs to its end value and holds, so the party, the
 * grid and every caption have settled by the time the Player stops on its last frame.
 */
export const VICTORY_BEATS = {
  /** Every card in the party drops onto the stage, staggered left to right. */
  intro: [4, 44],
  /** Each card hops once and pops its congratulation bubble, in the same order. */
  cheer: [34, 76],
  /** The party shrinks into a strip under the title and hands the stage to the loot. */
  handoff: [78, 94],
  /** Reward tiles spring in one after another. */
  grid: [96, 156],
  /** Yield multiplier and the closing caption settle, then hold for the rest of the run. */
  total: [156, 178],
} as const satisfies Record<string, readonly [number, number]>

/** Frames between two neighbouring cards landing / cheering / popping in. */
export const CARD_STAGGER = 5
export const CHEER_STAGGER = 4
export const TILE_STAGGER = 6

/**
 * One line per party slot. Fixed by index rather than randomised, because Remotion renders
 * the same frame on every re-render and a random pick would make the video jump.
 */
export const VICTORY_CHEERS = [
  'Nicely done!',
  'Victory!',
  'Well fought!',
  'For the vault!',
  'Good run!',
] as const

export function victoryCheer(index: number): string {
  return VICTORY_CHEERS[index % VICTORY_CHEERS.length]
}

/** Clamped 0..1 progress across a beat, eased so no beat starts or stops abruptly. */
export function beatProgress(frame: number, beat: readonly [number, number]): number {
  const [start, end] = beat
  if (end <= start) return frame >= start ? 1 : 0
  return interpolate(frame, [start, end], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

/** Offsets from the centre of whichever block is being placed. */
export type Offset = { x: number; y: number }

/**
 * Party faces are authored small here: five of them have to read on a 390px-wide stage,
 * which the chest reveal's 220px face cannot do.
 */
export const PARTY_CARD_SIZE = { height: 148, width: 108 } as const
const PARTY_PER_ROW = 3
const PARTY_GAP = 10

/** Reward tiles, sized to fit three columns inside the stage padding. */
export const REWARD_TILE_SIZE = { height: 112, width: 106 } as const
const REWARD_GAP = 12
const REWARD_SIDE_PADDING = 16

/** Two columns while the tiles are still wide, three once a second row would be cramped. */
function rewardColumns(count: number) {
  return count <= 4 ? 2 : 3
}

/**
 * Party slots in reading order, at most three per row with the short last row centred under
 * the one above it. A five-card party is the widest case and still clears the stage edges.
 */
export function partyPlacements(count: number): Offset[] {
  if (count <= 0) return []
  const rows = Math.ceil(count / PARTY_PER_ROW)
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / PARTY_PER_ROW)
    const column = index % PARTY_PER_ROW
    const inRow = Math.min(PARTY_PER_ROW, count - row * PARTY_PER_ROW)
    return {
      x: (column - (inRow - 1) / 2) * (PARTY_CARD_SIZE.width + PARTY_GAP),
      y: (row - (rows - 1) / 2) * (PARTY_CARD_SIZE.height + PARTY_GAP),
    }
  })
}

/** Reward slots, row-major with the short last row centred, as a grid of tile centres. */
export function rewardGridPlacements(count: number): Offset[] {
  if (count <= 0) return []
  const columns = rewardColumns(count)
  const rows = Math.ceil(count / columns)
  const cellWidth =
    (STAGE_SIZE.width - 2 * REWARD_SIDE_PADDING - (columns - 1) * REWARD_GAP) / columns
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const inRow = Math.min(columns, count - row * columns)
    return {
      x: (column - (inRow - 1) / 2) * (cellWidth + REWARD_GAP),
      y: (row - (rows - 1) / 2) * (REWARD_TILE_SIZE.height + REWARD_GAP),
    }
  })
}

/** Height of the reward block, so the caption under it can be hung at a fixed offset. */
export function rewardGridHeight(count: number): number {
  if (count <= 0) return 0
  const rows = Math.ceil(count / rewardColumns(count))
  return rows * REWARD_TILE_SIZE.height + (rows - 1) * REWARD_GAP
}

/**
 * Where each block sits on the stage. The party starts centre-stage and ends as a small
 * strip under the title, which is what frees the lower half for the loot grid.
 */
export const VICTORY_LAYOUT = {
  partyCenter: { x: STAGE_SIZE.width / 2, y: 400 },
  partyResting: { scale: 0.34, x: STAGE_SIZE.width / 2, y: 238 },
  gridCenter: { x: STAGE_SIZE.width / 2, y: 540 },
  titleTop: 76,
  captionBottom: 44,
} as const

/**
 * One row of the payoff grid: the id it was built from, its label and how many were paid.
 * `icon` is the uploaded icon URL from the matching catalog when there is one; a row without
 * it makes the tile fall back to the placeholder glyph.
 */
export type VictoryReward = { id: string; label: string; qty: number; icon?: string | null }

/**
 * The claim's payout as grid rows — gold, then every material, then the chest. Gold is
 * dropped at 0 the same way the settlement panel drops it, since runs resolved before the
 * yield multiplier existed carry `gold: 0`.
 *
 * `iconOf` is optional so the row shape stays testable without a material catalog; a row is
 * only given an `icon` when one actually resolves, never a null placeholder. `chestIconOf`
 * mirrors it for the chest row, whose art lives in the chest catalog rather than the material one.
 */
export function victoryRewards(
  rewards: RunRewards | null,
  materialLabel: (materialId: string) => string,
  iconOf?: (materialId: string) => string | null,
  chestIconOf?: (chestId: string) => string | null,
): VictoryReward[] {
  if (!rewards) return []
  const rows: VictoryReward[] = []
  if (rewards.gold > 0) rows.push({ id: 'gold', label: 'Gold', qty: rewards.gold })
  for (const material of rewards.materials) {
    const row: VictoryReward = {
      id: material.material_id,
      label: materialLabel(material.material_id),
      qty: material.qty,
    }
    const icon = iconOf?.(material.material_id)
    if (icon) row.icon = icon
    rows.push(row)
  }
  if (rewards.chest_id) {
    const row: VictoryReward = {
      id: rewards.chest_id,
      label: rewards.chest_id.charAt(0).toUpperCase() + rewards.chest_id.slice(1),
      qty: 1,
    }
    const icon = chestIconOf?.(rewards.chest_id)
    if (icon) row.icon = icon
    rows.push(row)
  }
  return rows
}

/** Which glyph a tile draws. */
export type RewardIcon =
  | { kind: 'gold' }
  | { kind: 'chest' }
  | { kind: 'shard' }
  | { kind: 'material' }
  | { kind: 'core'; tag: CoreTag }

/**
 * PLACEHOLDER glyph choice: nothing in the catalog carries an icon yet, so it is derived
 * from the id — a Core tile gets its element, a shard a gem, a chest tier a gift, and
 * anything unrecognised a generic crate. Replace with a `materials.icon` lookup once the
 * catalog owns glyphs; every caller goes through here.
 */
export function rewardIcon(id: string): RewardIcon {
  if (id === 'gold') return { kind: 'gold' }
  if (id.endsWith('_shard')) return { kind: 'shard' }
  const tag = CORE_TAGS.find((candidate) => id.endsWith(`_${candidate}_core`))
  if (tag) return { kind: 'core', tag }
  if (id in CHEST_ODDS) return { kind: 'chest' }
  return { kind: 'material' }
}
