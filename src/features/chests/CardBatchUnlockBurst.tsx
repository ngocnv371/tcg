import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { BatchGridCaption, BatchIntroCaption } from '@/features/chests/BatchCaptions'
import { UnlockCardFace, UnlockStage } from '@/features/chests/CardUnlockAnimation'
import type { BatchUnlockProps } from '@/features/chests/batchTypes'
import { gridMetrics, gridPlacement, type Placement } from '@/features/chests/unlockLayout'
import {
  BURST_LAUNCH,
  BURST_RING_STEP,
  BURST_SETTLE,
  UNLOCK_STAGE_STYLE,
  burstDuration,
  burstLandsAt,
  positionedBox,
  rankColor,
} from '@/features/chests/unlockVisuals'

/** Soft enough that the flight is still visibly travelling when the last ring leaves the pile. */
const FLIGHT_SPRING = { damping: 12, mass: 0.9, stiffness: 95 }
/** The pile is small and tilted; the cards sit on a tiny circle so it reads as a fan, not a stack. */
const PILE_SCALE = 0.34
const PILE_SPREAD = 16
const PILE_SPIN = 18
const PILE_FADE = 8
/** Above the card boxes (z-index 1..count), below the captions (100). */
const FLASH_Z = 90

/**
 * Burst: every card waits as a tilted pile at the stage centre, then the pile blows apart into the
 * grid — one ring per row, the middle rows first, so the grid assembles outwards. Cards flip
 * face-up during the flight. It is the shortest of the variants and the only one where the whole
 * batch moves at once instead of beating out one card at a time.
 */
export function CardBatchUnlockBurst({ cards }: BatchUnlockProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const metrics = gridMetrics(cards.length)
  const duration = burstDuration(cards.length)
  const color = rankColor(cards[0].rank)
  const landsAt = burstLandsAt(cards.length)
  const settleStart = duration - BURST_SETTLE
  // One hard flash as the pile breaks, then a softer glow under the finished grid.
  const ambience = Math.max(
    interpolate(frame, [BURST_LAUNCH - 8, BURST_LAUNCH, BURST_LAUNCH + 22], [0, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
    interpolate(frame, [landsAt, duration], [0, 0.5], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  )
  const flash = interpolate(frame, [BURST_LAUNCH - 6, BURST_LAUNCH, BURST_LAUNCH + 8], [0, 0.22, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={UNLOCK_STAGE_STYLE}>
      <UnlockStage color={color} frame={frame} intensity={ambience} />

      {cards.map((card, index) => {
        const slot = gridPlacement(index, cards.length)
        const row = Math.floor(index / metrics.columns)
        // Middle rows fly first, so the grid fills outwards from the centre line.
        const ring = Math.abs(row - (metrics.rows - 1) / 2)
        const start = BURST_LAUNCH + ring * BURST_RING_STEP
        const fly = spring({ config: FLIGHT_SPRING, delay: start, fps, frame })
        const spin = PILE_SPIN * (index % 2 === 0 ? -1 : 1) * (1 + (index % 3))
        // The pile is a small circle, so the cards are already scattered when the bang comes.
        const pileAngle = (index / cards.length) * Math.PI * 2
        const placement: Placement = {
          rotate: spin * (1 - fly),
          scale: PILE_SCALE + (slot.scale - PILE_SCALE) * fly,
          x: Math.cos(pileAngle) * PILE_SPREAD * (1 - fly) + slot.x * fly,
          y: Math.sin(pileAngle) * PILE_SPREAD * (1 - fly) + slot.y * fly,
        }
        return (
          <div
            key={`${card.cardName}-${index}`}
            style={{
              ...positionedBox(
                placement,
                index + 1,
                // The pile stacks up before it breaks, so the bang has something to blow apart.
                interpolate(frame, [Math.min(index, 5) * 0.8, Math.min(index, 5) * 0.8 + PILE_FADE], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              ),
              perspective: 900,
            }}
          >
            <UnlockCardFace
              cardName={card.cardName}
              artPath={card.artPath}
              rank={card.rank}
              color={rankColor(card.rank)}
              flipDeg={interpolate(fly, [0, 1], [180, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })}
            />
          </div>
        )
      })}

      <div style={{ background: '#ffffff', inset: 0, opacity: flash, position: 'absolute', zIndex: FLASH_Z }} />

      <BatchIntroCaption
        count={cards.length}
        opacity={interpolate(frame, [0, 12, settleStart - 8, settleStart], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
        y={interpolate(frame, [0, 12], [14, 0], { extrapolateRight: 'clamp' })}
      />
      <BatchGridCaption
        count={cards.length}
        opacity={interpolate(frame, [settleStart, duration], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
      />
    </AbsoluteFill>
  )
}
