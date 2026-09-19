import { useState } from 'react'
import {
  AbsoluteFill,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

import {
  RANK_STAR_SLOTS,
  RANK_UP_BEATS,
  beatProgress,
  starIgnition,
  sweepOffset,
} from '@/features/cards/rankUpVisuals'
import { UnlockStage } from '@/features/chests/CardUnlockAnimation'
import { CARD_SIZE } from '@/features/chests/unlockLayout'
import { UNLOCK_STAGE_STYLE, rankColor } from '@/features/chests/unlockVisuals'
import { RANK_META, type CardRank } from '@/game/formulas'
import { resolveArtSrc } from '@/lib/art'

export type RankUpAnimationProps = {
  cardName: string
  artPath: string | null
  fromRank: number
  toRank: number
}

const CARD_SPRING = { damping: 14, mass: 0.85, stiffness: 110 }
/** The star row sits on the stage floor under the card, so the caption can flow beneath it. */
const STAR_SIZE = 30

/**
 * The rank-up reveal: the copy you already own rises into frame under its OLD rank colour, a
 * highlight sweeps the art while the glow shifts to the NEW rank colour, then the newly
 * earned star ignites and the caption confirms the new ceiling. Reuses the chest stage so an
 * upgrade reads as the same family of event as the pull that granted the card.
 */
export function RankUpAnimation({ cardName, artPath, fromRank, toRank }: RankUpAnimationProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const [artFailed, setArtFailed] = useState(false)
  const [sweepStart, sweepEnd] = RANK_UP_BEATS.sweep
  const artSrc = artFailed ? null : resolveArtSrc(artPath)

  const toColor = rankColor(toRank)
  const color = interpolateColors(frame, [sweepStart, sweepEnd], [rankColor(fromRank), toColor])
  const intro = spring({ config: CARD_SPRING, fps, frame })
  const opacity = interpolate(frame, [...RANK_UP_BEATS.intro], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(intro, [0, 1], [0.72, 1])
  const rotate = interpolate(intro, [0, 1], [-9, 0])
  // The sweep is the loudest beat; the glow eases back to an ambience so the stars read clearly.
  const glow = interpolate(frame, [sweepStart, sweepEnd, RANK_UP_BEATS.star[1]], [0, 1, 0.42], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const caption = beatProgress(frame, RANK_UP_BEATS.caption)
  const captionY = interpolate(caption, [0, 1], [16, 0])

  return (
    <AbsoluteFill style={UNLOCK_STAGE_STYLE}>
      <UnlockStage color={color} frame={frame} intensity={glow} />

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          opacity,
          perspective: 900,
          transform: `scale(${scale}) rotate(${rotate}deg)`,
        }}
      >
        <div
          style={{
            background: `linear-gradient(145deg, ${color} 0%, #141020 38%, #090811 100%)`,
            border: `3px solid ${color}`,
            borderRadius: 20,
            boxShadow: `0 0 26px ${color}, 0 22px 50px #00000099`,
            height: CARD_SIZE.height,
            overflow: 'hidden',
            position: 'relative',
            width: CARD_SIZE.width,
          }}
        >
          <div
            style={{
              alignItems: 'center',
              background: '#ffffff10',
              display: 'flex',
              fontSize: 64,
              height: '100%',
              justifyContent: 'center',
              width: '100%',
            }}
          >
            {artSrc ? (
              <img
                src={artSrc}
                alt={cardName}
                onError={() => setArtFailed(true)}
                style={{ height: '100%', objectFit: 'cover', width: '100%' }}
              />
            ) : (
              '✦'
            )}
          </div>

          {/* The highlight band travels across the art during the sweep, tinted by the new rank. */}
          <div
            style={{
              background: `linear-gradient(105deg, transparent 0%, ${toColor}00 28%, ${toColor}cc 50%, ${toColor}00 72%, transparent 100%)`,
              bottom: -40,
              filter: 'blur(6px)',
              opacity: 0.85 * glow,
              position: 'absolute',
              top: -40,
              transform: `translateX(${sweepOffset(frame) * 100}%) skewX(-14deg)`,
              width: 90,
            }}
          />

          <div
            style={{
              background: 'linear-gradient(180deg, #00000000 0%, #07060dbb 62%, #07060df2 100%)',
              bottom: 0,
              left: 0,
              padding: '30px 12px 12px',
              position: 'absolute',
              right: 0,
            }}
          >
            <div style={{ fontSize: 17, textAlign: 'center' }}>{cardName}</div>
          </div>
        </div>

        <div aria-hidden style={{ display: 'flex', gap: 10 }}>
          {Array.from({ length: RANK_STAR_SLOTS }, (_, slot) => {
            const ignition = starIgnition(frame, slot, fromRank)
            return (
              <span
                key={slot}
                style={{
                  color: ignition >= 1 ? toColor : ignition > 0 ? color : '#ffffff26',
                  fontSize: STAR_SIZE,
                  lineHeight: 1,
                  textShadow: ignition > 0 ? `0 0 14px ${toColor}` : 'none',
                  transform: `scale(${interpolate(ignition, [0, 1], [0.8, slot === fromRank ? 1.25 : 1])})`,
                }}
              >
                ★
              </span>
            )
          })}
        </div>

        {/* Always rendered so its space is reserved — the fade-in must not shift the card. */}
        <div style={{ opacity: caption, transform: `translateY(${captionY}px)`, textAlign: 'center' }}>
          <div style={{ color: '#ffe08a', fontSize: 13, letterSpacing: 3 }}>RANK UP</div>
          <div style={{ fontSize: 24, marginTop: 6 }}>
            {fromRank}★ → {toRank}★
          </div>
          <div style={{ color: '#ffffffaa', fontSize: 13, marginTop: 5 }}>
            Level cap now {RANK_META[toRank as CardRank].levelCap}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
