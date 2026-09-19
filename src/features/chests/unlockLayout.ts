/**
 * Geometry shared by the chest reveals. Deliberately pure — no Remotion, no React — so the
 * fan and grid placements can be unit tested without mounting a composition. The render code
 * in `CardUnlockAnimation` / `CardBatchUnlockAnimation` imports the sizes from here, so the
 * two reveals always play on the same stage.
 */

/** Card faces are authored at this size; every placement scales it. */
export const CARD_SIZE = { height: 320, width: 220 } as const

/** Portrait stage both reveals render in. */
export const STAGE_SIZE = { height: 844, width: 390 } as const

export const STAGE_FPS = 30

/** Grid breathing room; the widest block is 390 - 2 * 24. */
const GRID_PADDING = 24
const GRID_GAP = 12

/**
 * Extras fan out on an arc whose pivot sits below the deck, so outer cards drop slightly and
 * rotate outwards like a hand of cards. Radius and max angle are tuned so the outermost card
 * stays inside the stage (`x + half card <= 195`).
 */
const FAN_RADIUS = 170
const FAN_MAX_ANGLE = 30
const FAN_ANGLE_PER_SLOT = 12
/** Angle share grows outwards, so the innermost extras still clear the card in front of them. */
const FAN_ANGLE_BIAS = 0.6

/** Offsets from the centre of the stage, plus the scale and rotation applied to the card face. */
export type Placement = {
  x: number
  y: number
  scale: number
  rotate: number
}

export type GridMetrics = {
  columns: number
  /** Rows needed to fit `count` cards. */
  rows: number
  /** Size of one scaled-down card face. */
  cellWidth: number
  cellHeight: number
  /** Height of the whole block, so a caption can be hung underneath it. */
  height: number
}

/** Two columns while the cards are still large, three once a second row would overflow. */
function gridColumns(count: number) {
  return count <= 4 ? 2 : 3
}

export function gridMetrics(count: number): GridMetrics {
  const columns = gridColumns(count)
  const cellWidth = (STAGE_SIZE.width - 2 * GRID_PADDING - (columns - 1) * GRID_GAP) / columns
  const cellHeight = (cellWidth * CARD_SIZE.height) / CARD_SIZE.width
  const rows = Math.ceil(count / columns)
  return {
    cellHeight,
    cellWidth,
    columns,
    height: rows * cellHeight + (rows - 1) * GRID_GAP,
    rows,
  }
}

/** Row-major slots, with the short last row centred under the ones above it. */
export function gridPlacement(index: number, count: number): Placement {
  const { cellHeight, cellWidth, columns, rows } = gridMetrics(count)
  const row = Math.floor(index / columns)
  const column = index % columns
  const inRow = Math.min(columns, count - row * columns)
  return {
    rotate: 0,
    scale: cellWidth / CARD_SIZE.width,
    x: (column - (inRow - 1) / 2) * (cellWidth + GRID_GAP),
    y: (row - (rows - 1) / 2) * (cellHeight + GRID_GAP),
  }
}

/**
 * Fan slots for the cards that sit behind the first one, in order. An odd count uses one slot
 * more than it needs and skips the first: a card at exactly 0deg would hide completely behind
 * the card in front of it, and the fan is the only place it is seen before the grid.
 */
export function fanPlacements(extraCount: number): Placement[] {
  if (extraCount <= 0) return []
  const slots = extraCount % 2 === 0 ? extraCount : extraCount + 1
  const outer = Math.min(FAN_MAX_ANGLE, FAN_ANGLE_PER_SLOT * slots)
  const skipped = slots - extraCount
  return Array.from({ length: extraCount }, (_, index) => {
    const unit = (2 * (index + skipped)) / (slots - 1) - 1
    const angle = Math.sign(unit) * outer * Math.abs(unit) ** FAN_ANGLE_BIAS
    const radians = (angle * Math.PI) / 180
    return {
      rotate: angle,
      scale: 1,
      x: FAN_RADIUS * Math.sin(radians),
      y: FAN_RADIUS * (1 - Math.cos(radians)),
    }
  })
}
