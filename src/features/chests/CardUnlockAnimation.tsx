import { useState } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

import { CARD_SIZE } from '@/features/chests/unlockLayout'
import { UNLOCK_STAGE_STYLE, cardReveal, rankColor } from '@/features/chests/unlockVisuals'
import { resolveArtSrc } from '@/lib/art'

export type CardUnlockAnimationProps = {
  cardName: string
  artPath: string | null
  rank: number
  wasNew: boolean
}

const PARTICLES = Array.from({ length: 22 }, (_, index) => ({
  angle: (index / 22) * Math.PI * 2,
  distance: 110 + ((index * 37) % 90),
  size: 2 + (index % 4),
  delay: index % 7,
}))
const GOD_RAYS = [
  { angle: -62, length: 360, width: 34, delay: 0 },
  { angle: -35, length: 300, width: 22, delay: 8 },
  { angle: -12, length: 390, width: 28, delay: 15 },
  { angle: 18, length: 330, width: 24, delay: 4 },
  { angle: 44, length: 370, width: 30, delay: 11 },
  { angle: 70, length: 290, width: 20, delay: 19 },
]

/** Backdrop layers: rank-tinted glow, burst particles, a shockwave ring and drifting god rays. */
export function UnlockStage({
  color,
  frame,
  intensity,
}: {
  color: string
  frame: number
  /** 0..1 drive for the burst; each caller decides how it settles over its own timeline. */
  intensity: number
}) {
  return (
    <>
      <div
        style={{
          background: color,
          borderRadius: '50%',
          filter: 'blur(28px)',
          height: 190,
          opacity: 0.3 + intensity * 0.5,
          position: 'absolute',
          transform: `scale(${1 + intensity * 1.2})`,
          width: 190,
        }}
      />

      {PARTICLES.map((particle, index) => {
        const progress = interpolate(frame, [particle.delay, 42 + particle.delay], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        const x = Math.cos(particle.angle) * particle.distance * progress
        const y = Math.sin(particle.angle) * particle.distance * progress
        return (
          <div
            key={index}
            style={{
              background: index % 3 === 0 ? '#fff4b0' : color,
              borderRadius: '50%',
              boxShadow: `0 0 10px ${color}`,
              height: particle.size,
              opacity: 1 - progress,
              position: 'absolute',
              transform: `translate(${x}px, ${y}px)`,
              width: particle.size,
            }}
          />
        )
      })}

      <div
        style={{
          border: `1px solid ${color}`,
          borderRadius: '50%',
          height: 220,
          opacity: intensity * 0.8,
          position: 'absolute',
          transform: `scale(${0.7 + intensity * 1.5})`,
          width: 220,
        }}
      />

      {GOD_RAYS.map((ray, index) => {
        const pulse = interpolate(frame, [ray.delay, ray.delay + 16, ray.delay + 44], [0, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        const rotation = ray.angle + frame * (index % 2 === 0 ? 0.08 : -0.06)
        return (
          <div
            key={ray.angle}
            style={{
              background: `linear-gradient(180deg, ${color}aa 0%, ${color}18 72%, transparent 100%)`,
              filter: 'blur(5px)',
              height: ray.length,
              opacity: intensity * (0.12 + pulse * 0.3),
              position: 'absolute',
              transform: `rotate(${rotation}deg) scaleY(${0.75 + pulse * 0.35})`,
              transformOrigin: '50% 100%',
              width: ray.width,
            }}
          />
        )
      })}
    </>
  )
}

/**
 * One card face at its authored size: art, name plate and rank badge. It carries no timing of
 * its own — callers place it, scale it and drive `flipDeg` for the flip-in.
 */
export function UnlockCardFace({
  cardName,
  artPath,
  rank,
  color,
  flipDeg = 0,
}: {
  cardName: string
  artPath: string | null
  rank: number
  color: string
  /** Y rotation in degrees, used for the flip-in on the card being revealed. */
  flipDeg?: number
}) {
  const [artFailed, setArtFailed] = useState(false)
  const artSrc = artFailed ? null : resolveArtSrc(artPath)

  return (
    <div
      style={{
        background: `linear-gradient(145deg, ${color} 0%, #141020 38%, #090811 100%)`,
        border: `3px solid ${color}`,
        borderRadius: 20,
        boxShadow: `0 0 24px ${color}, 0 22px 50px #00000099`,
        height: CARD_SIZE.height,
        overflow: 'hidden',
        position: 'relative',
        transform: `rotateY(${flipDeg}deg)`,
        transformStyle: 'preserve-3d',
        width: CARD_SIZE.width,
      }}
    >
      {/* Art fills the frame; rank and name sit on top as overlays. */}
      <div
        style={{
          alignItems: 'center',
          background: '#ffffff10',
          display: 'flex',
          fontSize: 64,
          height: '100%',
          justifyContent: 'center',
          overflow: 'hidden',
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

      <div
        style={{
          backdropFilter: 'blur(6px)',
          background: '#07060dcc',
          border: `1px solid ${color}`,
          borderRadius: 12,
          color: '#fff4b0',
          fontSize: 18,
          padding: '3px 10px',
          position: 'absolute',
          right: 10,
          top: 10,
        }}
      >
        {rank}★
      </div>
    </div>
  )
}

export function CardUnlockAnimation({ cardName, artPath, rank, wasNew }: CardUnlockAnimationProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const color = rankColor(rank)
  const burst = interpolate(frame, [0, 14, 46], [0, 1, 0], { extrapolateRight: 'clamp' })
  const card = cardReveal(frame, fps)
  const titleOpacity = interpolate(frame, [34, 52], [0, 1], { extrapolateRight: 'clamp' })
  const titleY = interpolate(frame, [34, 52], [18, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={UNLOCK_STAGE_STYLE}>
      <UnlockStage color={color} frame={frame} intensity={burst} />

      <div
        style={{
          opacity: card.opacity,
          perspective: 900,
          transform: `scale(${card.scale}) rotate(${card.rotate}deg)`,
        }}
      >
        <UnlockCardFace
          cardName={cardName}
          artPath={artPath}
          rank={rank}
          color={color}
          flipDeg={card.flip}
        />
      </div>

      <div
        style={{
          bottom: 28,
          opacity: titleOpacity,
          position: 'absolute',
          textAlign: 'center',
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div style={{ color: '#ffe08a', fontSize: 13, letterSpacing: 2 }}>
          {wasNew ? 'NEW CARD UNLOCKED' : 'CARD REVEALED'}
        </div>
        <div style={{ color: '#ffffff', fontSize: 20, marginTop: 5 }}>{cardName}</div>
      </div>
    </AbsoluteFill>
  )
}
