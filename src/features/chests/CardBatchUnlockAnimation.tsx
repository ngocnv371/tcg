import type { CSSProperties } from 'react'
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { UnlockCardFace, UnlockStage } from '@/features/chests/CardUnlockAnimation'
import {
  BATCH_DURATION,
  CAPTION_DURATION,
  FAN_DURATION,
  FAN_START,
  SETTLE_DURATION,
  SPREAD_DURATION,
  SPREAD_START,
  UNLOCK_STAGE_STYLE,
  cardReveal,
  rankColor,
} from '@/features/chests/unlockVisuals'
import {
  STAGE_SIZE,
  fanPlacements,
  gridMetrics,
  gridPlacement,
  type Placement,
} from '@/features/chests/unlockLayout'

export type BatchUnlockCard = {
  cardName: string
  artPath: string | null
  rank: number
}

export type CardBatchUnlockAnimationProps = {
  /** Two or more reveals; the first one keeps the single-card intro. */
  cards: BatchUnlockCard[]
}

/** Cost of the extra cards: quick pop as they land, staggered across the fan beat. */
const EXTRA_SPRING = { damping: 14, mass: 0.7, stiffness: 170 }
const EXTRA_STAGGER_MAX = 6
const EXTRA_START_SCALE = 0.55
/** Gap between the grid block and the caption hung underneath it. */
const CAPTION_GAP = 26

function positionedBox(placement: Placement, zIndex: number, opacity: number): CSSProperties {
  return {
    left: '50%',
    opacity,
    position: 'absolute',
    top: '50%',
    transform: `translate(-50%, -50%) translate(${placement.x}px, ${placement.y}px) rotate(${placement.rotate}deg) scale(${placement.scale})`,
    zIndex,
  }
}

/**
 * The multi-chest reveal: the first card plays the single-card intro while the rest pop into a fan
 * behind it — the fan opens on the same frame the `UNLOCK N CARDS` caption rises, so the two beats
 * run together rather than one after the other — then every card spreads into a grid. Positions come
 * from `unlockLayout` so the whole path is deterministic from the frame number alone.
 */
export function CardBatchUnlockAnimation({ cards }: CardBatchUnlockAnimationProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const [first, ...extras] = cards
  const color = rankColor(first.rank)
  const burst = interpolate(frame, [0, 14, 46], [0, 1, 0], { extrapolateRight: 'clamp' })
  const reveal = cardReveal(frame, fps)
  // The intro burst would die out mid-reveal; ease a softer glow in so the grid keeps a backdrop.
  const ambience = Math.max(
    burst,
    interpolate(frame, [SPREAD_START, BATCH_DURATION], [0, 0.5], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  )
  const spread = interpolate(frame, [SPREAD_START, SPREAD_START + SPREAD_DURATION], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const fan = fanPlacements(extras.length)
  const metrics = gridMetrics(cards.length)
  const firstSlot = gridPlacement(0, cards.length)
  // The first card holds the stage centre until the spread beat, so the intro is untouched.
  const firstPlacement: Placement = {
    rotate: reveal.rotate * (1 - spread),
    scale: reveal.scale + (firstSlot.scale - reveal.scale) * spread,
    x: firstSlot.x * spread,
    y: firstSlot.y * spread,
  }
  const stagger = Math.min(EXTRA_STAGGER_MAX, FAN_DURATION / (extras.length + 1))
  // The fan opens on this same frame, so the caption rises onto cards that are already landing.
  const introOpacity =
    interpolate(frame, [FAN_START, FAN_START + CAPTION_DURATION], [0, 1], { extrapolateRight: 'clamp' }) *
    interpolate(frame, [SPREAD_START - 10, SPREAD_START], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  const introY = interpolate(frame, [FAN_START, FAN_START + CAPTION_DURATION], [18, 0], {
    extrapolateRight: 'clamp',
  })
  const totalOpacity = interpolate(frame, [BATCH_DURATION - SETTLE_DURATION, BATCH_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={UNLOCK_STAGE_STYLE}>
      <UnlockStage color={color} frame={frame} intensity={ambience} />

      {extras.map((card, index) => {
        const fanSpot = fan[index]
        const slot = gridPlacement(index + 1, cards.length)
        const appear = spring({
          config: EXTRA_SPRING,
          delay: FAN_START + stagger * index,
          fps,
          frame,
        })
        const fanScale = interpolate(appear, [0, 1], [EXTRA_START_SCALE, 1])
        return (
          <div
            key={`${card.cardName}-${index}`}
            style={positionedBox(
              {
                rotate: fanSpot.rotate * (1 - spread),
                scale: fanScale + (slot.scale - fanScale) * spread,
                x: fanSpot.x + (slot.x - fanSpot.x) * spread,
                y: fanSpot.y + (slot.y - fanSpot.y) * spread,
              },
              cards.length - index,
              appear,
            )}
          >
            <UnlockCardFace
              cardName={card.cardName}
              artPath={card.artPath}
              rank={card.rank}
              color={rankColor(card.rank)}
            />
          </div>
        )
      })}

      <div style={{ ...positionedBox(firstPlacement, cards.length + 1, reveal.opacity), perspective: 900 }}>
        <UnlockCardFace
          cardName={first.cardName}
          artPath={first.artPath}
          rank={first.rank}
          color={color}
          flipDeg={reveal.flip}
        />
      </div>

      <div
        style={{
          bottom: 28,
          left: 0,
          opacity: introOpacity,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          transform: `translateY(${introY}px)`,
        }}
      >
        <div style={{ color: '#ffe08a', fontSize: 13, letterSpacing: 2 }}>
          UNLOCK {cards.length} CARDS
        </div>
      </div>

      <div
        style={{
          left: 0,
          opacity: totalOpacity,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          // Hung under the grid block, which is centred on the stage.
          top: STAGE_SIZE.height / 2 + metrics.height / 2 + CAPTION_GAP,
        }}
      >
        <div style={{ color: '#ffe08a', fontSize: 13, letterSpacing: 2 }}>
          {cards.length} CARDS REVEALED
        </div>
      </div>
    </AbsoluteFill>
  )
}
