import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { BatchGridCaption, BatchIntroCaption } from '@/features/chests/BatchCaptions'
import { UnlockCardFace, UnlockStage } from '@/features/chests/CardUnlockAnimation'
import type { BatchUnlockProps } from '@/features/chests/batchTypes'
import { STAGE_SIZE, gridPlacement, type Placement } from '@/features/chests/unlockLayout'
import {
  CASCADE_DEAL_START,
  CASCADE_DEAL_STEP,
  CASCADE_SETTLE,
  UNLOCK_STAGE_STYLE,
  cascadeDuration,
  cascadeLandsAt,
  positionedBox,
  rankColor,
} from '@/features/chests/unlockVisuals'

/** Landing spring: enough overshoot that a dealt card visibly clicks into its slot. */
const DEAL_SPRING = { damping: 15, mass: 0.7, stiffness: 150 }
/** Cards are dealt from just off-stage, alternating sides, tilted as they fly. */
const DEAL_X = STAGE_SIZE.width / 2 + 150
const DEAL_Y = -(STAGE_SIZE.height / 2) - 90
const DEAL_ROTATE = 24
const DEAL_START_SCALE = 0.72
const DEAL_FADE = 6
/** Above the card boxes (z-index 1..count), below the captions (100). */
const SHINE_Z = 90

/**
 * Cascade: every card is dealt in from off-stage and flips face-up as it lands, straight into its
 * grid slot — one beat per card, each deal overlapping the previous landing. There is no fan and
 * no separate spread beat: the grid is what the cards are dealt to, so the reveal reads as a
 * riffle. `cascadeDuration` grows with the count, so two cards never leave still faces on screen.
 */
export function CardBatchUnlockCascade({ cards }: BatchUnlockProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const duration = cascadeDuration(cards.length)
  const color = rankColor(cards[0].rank)
  const landsAt = cascadeLandsAt(cards.length)
  const settleStart = duration - CASCADE_SETTLE
  // The intro burst would die out mid-deal; hold a softer glow under the grid afterwards.
  const ambience = Math.max(
    interpolate(frame, [0, 12, 44], [0, 1, 0], { extrapolateRight: 'clamp' }),
    interpolate(frame, [CASCADE_DEAL_START, landsAt, duration], [0, 0.45, 0.5], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  )
  // A light band crosses the finished grid so the settle beat still moves.
  const shine = interpolate(frame, [settleStart, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={UNLOCK_STAGE_STYLE}>
      <UnlockStage color={color} frame={frame} intensity={ambience} />

      {cards.map((card, index) => {
        const slot = gridPlacement(index, cards.length)
        const start = CASCADE_DEAL_START + index * CASCADE_DEAL_STEP
        const enter = spring({ config: DEAL_SPRING, delay: start, fps, frame })
        const side = index % 2 === 0 ? -1 : 1
        const placement: Placement = {
          rotate: DEAL_ROTATE * side * (1 - enter),
          scale: DEAL_START_SCALE + (slot.scale - DEAL_START_SCALE) * enter,
          x: DEAL_X * side * (1 - enter) + slot.x * enter,
          y: DEAL_Y * (1 - enter) + slot.y * enter,
        }
        return (
          <div
            key={`${card.cardName}-${index}`}
            style={{
              ...positionedBox(
                placement,
                index + 1,
                interpolate(frame, [start, start + DEAL_FADE], [0, 1], {
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
              flipDeg={interpolate(enter, [0, 1], [180, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })}
            />
          </div>
        )
      })}

      <div style={{ inset: 0, overflow: 'hidden', pointerEvents: 'none', position: 'absolute' }}>
        <div
          style={{
            background: 'linear-gradient(100deg, transparent 32%, #ffffff26 50%, transparent 68%)',
            height: '170%',
            left: `${-70 + shine * 140}%`,
            position: 'absolute',
            top: '-35%',
            transform: 'rotate(9deg)',
            width: '72%',
            zIndex: SHINE_Z,
          }}
        />
      </div>

      <BatchIntroCaption
        count={cards.length}
        opacity={interpolate(frame, [4, 18, settleStart - 10, settleStart], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
        y={interpolate(frame, [4, 18], [18, 0], { extrapolateRight: 'clamp' })}
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
