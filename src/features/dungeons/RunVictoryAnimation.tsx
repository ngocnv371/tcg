import { useState } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { STAGE_SIZE } from '@/features/chests/unlockLayout'
import { UNLOCK_STAGE_STYLE, rankColor } from '@/features/chests/unlockVisuals'
import { RewardGlyph } from '@/features/dungeons/rewardGlyphs'
import {
  CARD_STAGGER,
  CHEER_STAGGER,
  PARTY_CARD_SIZE,
  REWARD_TILE_SIZE,
  TILE_STAGGER,
  VICTORY_BEATS,
  VICTORY_LAYOUT,
  beatProgress,
  partyPlacements,
  rewardGridPlacements,
  rewardIcon,
  victoryCheer,
  type VictoryReward,
} from '@/features/dungeons/runVictoryVisuals'
import { resolveArtSrc } from '@/lib/art'

export type VictoryPartyCard = {
  cardName: string
  artPath: string | null
  rank: number
}

export type RunVictoryAnimationProps = {
  dungeonName: string
  /** The lineup's name, or null when the run's party has since been deleted. */
  partyName: string | null
  multiplier: number | null
  party: VictoryPartyCard[]
  /** One row per thing the clear paid, already formatted by the caller. */
  rewards: VictoryReward[]
}

const PARTY_SPRING = { damping: 13, mass: 0.7, stiffness: 140 }
const CHEER_DURATION = 26
/** How high a card hops while congratulating. */
const HOP_HEIGHT = 12

const TITLE_SPRING = { damping: 16, mass: 0.8, stiffness: 90 }
const TILE_SPRING = { damping: 14, mass: 0.6, stiffness: 160 }

/** Deterministic confetti: 26 pieces spread over the stage, each on its own fall. */
const CONFETTI = Array.from({ length: 26 }, (_, index) => ({
  color: index % 3 === 0 ? '#fff4b0' : index % 3 === 1 ? '#ffb02e' : '#b06bff',
  delay: 14 + ((index * 9) % 56),
  duration: 120 + ((index * 17) % 60),
  size: 5 + (index % 3) * 2,
  spin: (index % 2 === 0 ? 1 : -1) * (140 + (index % 5) * 60),
  x: ((index * 53) % 100) / 100,
}))

/** Backdrop layers: a warm glow that pulses on the intro and again on the loot, plus confetti. */
function VictoryBackdrop({ frame }: { frame: number }) {
  const burst = interpolate(frame, [0, 12, 44], [0, 1, 0.3], { extrapolateRight: 'clamp' })
  const loot = interpolate(frame, [VICTORY_BEATS.grid[0], VICTORY_BEATS.grid[0] + 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const intensity = Math.max(burst, loot * 0.65)

  return (
    <>
      {/* The two glows carry no offsets: the stage centres its absolute children for them. */}
      <div
        style={{
          background: 'radial-gradient(circle, #ffb02e55 0%, transparent 70%)',
          borderRadius: '50%',
          height: 420,
          opacity: 0.25 + intensity * 0.45,
          position: 'absolute',
          transform: `scale(${0.8 + intensity * 0.7})`,
          width: 420,
        }}
      />
      <div
        style={{
          background: 'radial-gradient(circle, #4aa3ff44 0%, transparent 70%)',
          borderRadius: '50%',
          height: 520,
          opacity: loot * 0.3,
          position: 'absolute',
          width: 520,
        }}
      />
      {CONFETTI.map((piece, index) => {
        const progress = interpolate(frame, [piece.delay, piece.delay + piece.duration], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        return (
          <div
            key={index}
            style={{
              background: piece.color,
              borderRadius: 2,
              height: piece.size * 1.6,
              left: piece.x * STAGE_SIZE.width,
              opacity: interpolate(progress, [0, 0.85, 1], [0, 1, 0]),
              position: 'absolute',
              top: -40 + progress * (STAGE_SIZE.height + 80),
              transform: `rotate(${piece.spin * progress}deg)`,
              width: piece.size,
            }}
          />
        )
      })}
    </>
  )
}

/**
 * One party member: the card face, a rank-tinted frame and a name plate. It carries no timing of
 * its own — the caller owns the hop and the handoff and hands it the resulting `tilt`.
 */
function PartyCardFace({
  card,
  appear,
  tilt,
}: {
  card: VictoryPartyCard
  appear: number
  tilt: number
}) {
  const [artFailed, setArtFailed] = useState(false)
  const artSrc = artFailed ? null : resolveArtSrc(card.artPath)
  const color = rankColor(card.rank)

  return (
    <div
      style={{
        background: `linear-gradient(150deg, ${color} 0%, #141020 40%, #090811 100%)`,
        border: `2px solid ${color}`,
        borderRadius: 12,
        boxShadow: `0 0 16px ${color}aa, 0 14px 28px #00000099`,
        height: PARTY_CARD_SIZE.height,
        overflow: 'hidden',
        position: 'relative',
        transform: `rotate(${tilt}deg) scale(${0.6 + appear * 0.4})`,
        width: PARTY_CARD_SIZE.width,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: '#ffffff10',
          display: 'flex',
          fontSize: 34,
          height: 108,
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {artSrc ? (
          <img
            src={artSrc}
            alt={card.cardName}
            onError={() => setArtFailed(true)}
            style={{ height: '100%', objectFit: 'cover', width: '100%' }}
          />
        ) : (
          '✦'
        )}
      </div>

      <div
        style={{
          bottom: 0,
          color: '#f2f0f8',
          fontSize: 10.5,
          left: 0,
          lineHeight: 1.2,
          padding: '14px 6px 6px',
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          background: 'linear-gradient(180deg, #07060d00 0%, #07060dee 70%)',
        }}
      >
        {card.cardName}
      </div>

      <div
        style={{
          background: '#07060dcc',
          border: `1px solid ${color}`,
          borderRadius: 8,
          color: '#fff4b0',
          fontSize: 10,
          padding: '1px 5px',
          position: 'absolute',
          right: 4,
          top: 4,
        }}
      >
        {card.rank}★
      </div>
    </div>
  )
}

/** One payoff tile: the material's uploaded icon (or a placeholder glyph), label and quantity. */
function RewardTile({ reward, appear }: { reward: VictoryReward; appear: number }) {
  const [iconFailed, setIconFailed] = useState(false)
  const iconSrc = reward.icon && !iconFailed ? reward.icon : null
  const icon = rewardIcon(reward.id)

  return (
    <div
      style={{
        alignItems: 'center',
        background: 'linear-gradient(165deg, #241b3a 0%, #100d1c 60%, #090811 100%)',
        border: '1px solid #4a3f6d',
        borderRadius: 16,
        boxShadow: '0 10px 24px #00000088',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        height: REWARD_TILE_SIZE.height,
        justifyContent: 'center',
        opacity: appear,
        padding: '8px 6px',
        transform: `translateY(${(1 - appear) * 16}px) scale(${0.7 + appear * 0.3})`,
        width: REWARD_TILE_SIZE.width,
      }}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={reward.label}
          onError={() => setIconFailed(true)}
          style={{ height: 40, objectFit: 'contain', width: 40 }}
        />
      ) : (
        <div style={{ color: '#ffd76a' }}>
          <RewardGlyph icon={icon} size={34} />
        </div>
      )}
      <div
        style={{
          color: '#cfc9e4',
          display: '-webkit-box',
          fontSize: 10.5,
          lineHeight: 1.25,
          overflow: 'hidden',
          textAlign: 'center',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
        }}
      >
        {reward.label}
      </div>
      <div style={{ color: '#fff4b0', fontSize: 13, fontWeight: 600 }}>+{reward.qty}</div>
    </div>
  )
}

/**
 * The claim celebration: the party lands on stage, every card hops and congratulates, the
 * lineup then shrinks into a strip under the title and the loot is dealt out as a grid of
 * icons. Banked on the same stage as the chest reveals (`REVEAL_PLAYER_STAGE`), so a clear
 * and a pull feel like one game. Every position comes from `runVictoryVisuals`, which is
 * unit tested, so the whole path is determined by the frame number alone.
 */
export function RunVictoryAnimation({
  dungeonName,
  partyName,
  multiplier,
  party,
  rewards,
}: RunVictoryAnimationProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const handoff = beatProgress(frame, VICTORY_BEATS.handoff)
  const total = beatProgress(frame, VICTORY_BEATS.total)
  const titleIn = spring({ config: TITLE_SPRING, fps, frame })
  const spots = partyPlacements(party.length)
  const gridSpots = rewardGridPlacements(rewards.length)
  // The party starts centre stage and ends as a compact strip under the title, which is what
  // frees the lower half for the loot.
  const partyTop = interpolate(handoff, [0, 1], [VICTORY_LAYOUT.partyCenter.y, VICTORY_LAYOUT.partyResting.y])
  const partyScale = interpolate(handoff, [0, 1], [1, VICTORY_LAYOUT.partyResting.scale])

  return (
    <AbsoluteFill style={UNLOCK_STAGE_STYLE}>
      <VictoryBackdrop frame={frame} />

      <div
        style={{
          left: 0,
          opacity: titleIn,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          top: VICTORY_LAYOUT.titleTop,
          transform: `translateY(${(1 - titleIn) * -14}px)`,
        }}
      >
        <div
          style={{
            color: '#fff4b0',
            fontSize: 26,
            letterSpacing: 3,
            textShadow: '0 0 22px #ffb02e99',
          }}
        >
          DUNGEON CLEARED
        </div>
        <div style={{ color: '#a9a4c2', fontSize: 12, marginTop: 8 }}>
          {partyName ? `${partyName} · ${dungeonName}` : dungeonName}
        </div>
      </div>

      {/* Both blocks are zero-size and absolutely positioned, so their top-left corner IS
          the point every placement is measured from — the children centre themselves on it. */}
      <div
        style={{
          left: VICTORY_LAYOUT.partyCenter.x,
          position: 'absolute',
          top: partyTop,
          transform: `scale(${partyScale})`,
        }}
      >
        {party.map((card, index) => {
          const spot = spots[index]
          const appear = spring({
            config: PARTY_SPRING,
            delay: VICTORY_BEATS.intro[0] + index * CARD_STAGGER,
            fps,
            frame,
          })
          // Two small hops that both land back on the baseline, so the card never drifts.
          const cheerStart = VICTORY_BEATS.cheer[0] + index * CHEER_STAGGER
          const cheer = beatProgress(frame, [cheerStart, cheerStart + CHEER_DURATION])
          const hop = -Math.abs(Math.sin(cheer * Math.PI * 2)) * HOP_HEIGHT
          const tilt = Math.sin(cheer * Math.PI * 2) * 3
          // The bubbles have to be gone before the party shrinks, or they would scale into noise.
          const bubble =
            interpolate(frame, [cheerStart + 4, cheerStart + 14], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }) *
            interpolate(frame, [VICTORY_BEATS.handoff[0] - 8, VICTORY_BEATS.handoff[0] + 4], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })

          return (
            <div
              key={index}
              style={{
                left: 0,
                position: 'absolute',
                top: 0,
                transform: `translate(-50%, -50%) translate(${spot.x}px, ${spot.y + hop}px)`,
                zIndex: party.length - index,
              }}
            >
              {bubble > 0 ? (
                <div
                  style={{
                    background: '#f7f5ff',
                    borderRadius: 10,
                    color: '#1a1526',
                    fontSize: 10,
                    left: '50%',
                    // `max-content` keeps the pill hugging the line: the wrapper is a
                    // shrink-to-fit box inside a zero-width block, which is not a size the
                    // pill can measure itself against.
                    width: 'max-content',
                    opacity: bubble,
                    padding: '3px 7px',
                    position: 'absolute',
                    // Just clear of the card's own box, measured from the wrapper. Row two
                    // speaks downwards: its bubble would otherwise sit on the name plate of
                    // the card directly above it.
                    top: spot.y > 0 ? PARTY_CARD_SIZE.height + 8 : -28,
                    transform: `translateX(-50%) scale(${0.85 + bubble * 0.15})`,
                  }}
                >
                  {victoryCheer(index)}
                </div>
              ) : null}
              <div style={{ opacity: appear }}>
                <PartyCardFace card={card} appear={appear} tilt={tilt} />
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          left: VICTORY_LAYOUT.gridCenter.x,
          position: 'absolute',
          top: VICTORY_LAYOUT.gridCenter.y,
        }}
      >
        {rewards.map((reward, index) => {
          const appear = spring({
            config: TILE_SPRING,
            delay: VICTORY_BEATS.grid[0] + index * TILE_STAGGER,
            fps,
            frame,
          })
          const spot = gridSpots[index]
          return (
            <div
              key={reward.id}
              style={{
                left: 0,
                position: 'absolute',
                top: 0,
                transform: `translate(-50%, -50%) translate(${spot.x}px, ${spot.y}px)`,
                zIndex: rewards.length - index,
              }}
            >
              <RewardTile reward={reward} appear={appear} />
            </div>
          )
        })}
      </div>

      <div
        style={{
          bottom: VICTORY_LAYOUT.captionBottom,
          left: 0,
          opacity: total,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          transform: `translateY(${(1 - total) * 12}px)`,
        }}
      >
        {multiplier !== null ? (
          <div style={{ color: '#ffd76a', fontSize: 18, letterSpacing: 1 }}>
            YIELD ×{multiplier.toFixed(2)}
          </div>
        ) : null}
        <div style={{ color: '#a9a4c2', fontSize: 12, letterSpacing: 2, marginTop: 6 }}>
          ALL LOOT SECURED
        </div>
      </div>
    </AbsoluteFill>
  )
}
