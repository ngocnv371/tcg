import { useState } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { resolveArtSrc } from '@/features/cards/CardLibraryScreen'

export type CardUnlockAnimationProps = {
  cardName: string
  artPath: string | null
  rank: number
  wasNew: boolean
}

const RANK_COLORS = ['#8b93a7', '#57c98a', '#4aa3ff', '#b06bff', '#ffb02e']
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

export function CardUnlockAnimation({ cardName, artPath, rank, wasNew }: CardUnlockAnimationProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const [artFailed, setArtFailed] = useState(false)
  const artSrc = artFailed ? null : resolveArtSrc(artPath)
  const color = RANK_COLORS[Math.max(0, Math.min(rank - 1, RANK_COLORS.length - 1))]
  const reveal = spring({ frame, fps, config: { damping: 13, stiffness: 120, mass: 0.8 } })
  const burst = interpolate(frame, [0, 14, 46], [0, 1, 0], { extrapolateRight: 'clamp' })
  const cardScale = interpolate(reveal, [0, 1], [0.45, 1])
  const cardRotation = interpolate(reveal, [0, 0.65, 1], [-18, 8, 0])
  const cardOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' })
  const titleOpacity = interpolate(frame, [34, 52], [0, 1], { extrapolateRight: 'clamp' })
  const titleY = interpolate(frame, [34, 52], [18, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        background: 'radial-gradient(circle at 50% 43%, #302248 0%, #100d1c 48%, #07060d 100%)',
        color: '#f2f0f8',
        fontFamily: 'Georgia, serif',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: color,
          borderRadius: '50%',
          filter: 'blur(28px)',
          height: 190,
          opacity: 0.3 + burst * 0.5,
          position: 'absolute',
          transform: `scale(${1 + burst * 1.2})`,
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
          opacity: burst * 0.8,
          position: 'absolute',
          transform: `scale(${0.7 + burst * 1.5})`,
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
              opacity: burst * (0.12 + pulse * 0.3),
              position: 'absolute',
              transform: `rotate(${rotation}deg) scaleY(${0.75 + pulse * 0.35})`,
              transformOrigin: '50% 100%',
              width: ray.width,
            }}
          />
        )
      })}

      <div
        style={{
          opacity: cardOpacity,
          perspective: 900,
          transform: `scale(${cardScale}) rotate(${cardRotation}deg)`,
        }}
      >
        <div
          style={{
            background: `linear-gradient(145deg, ${color} 0%, #141020 38%, #090811 100%)`,
            border: `3px solid ${color}`,
            borderRadius: 20,
            boxShadow: `0 0 24px ${color}, 0 22px 50px #00000099`,
            height: 320,
            overflow: 'hidden',
            position: 'relative',
            transform: `rotateY(${interpolate(reveal, [0, 1], [180, 0])}deg)`,
            transformStyle: 'preserve-3d',
            width: 220,
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
