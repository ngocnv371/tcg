import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

import { UNLOCK_STAGE_STYLE } from '@/features/chests/unlockVisuals'
import {
  ATTACK_LAYOUT,
  attackerHome,
  defenderHome,
  lungeOffset,
} from '@/features/quests/questBattleVisuals'
import { resolveArtSrc } from '@/lib/art'

export type AttackAnimationProps = {
  attackerIcon: string
  attackerArtPath: string | null
  defenderIcon: string
  defenderArtPath: string | null
  /** Which side is swinging — decides the direction of the lunge. */
  side: 'player' | 'enemy'
  /** A miss shows the whiff and the MISS tag instead of an impact. */
  hit: boolean
}

/** Big enough to fill the stage: the clash owns the whole screen now, so the cards behind it are
 * hidden and the figures can be the size they deserve. */
const FIGURE_WIDTH = 120
const FIGURE_HEIGHT = 180

/** A combatant's figure: the card art when there is any, else the emoji avatar. */
function Figure({ icon, artPath }: { icon: string; artPath: string | null }) {
  const src = resolveArtSrc(artPath)
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{
          border: '3px solid #6b6288',
          borderRadius: 14,
          boxShadow: '0 16px 36px #000000aa',
          height: FIGURE_HEIGHT,
          objectFit: 'cover',
          width: FIGURE_WIDTH,
        }}
      />
    )
  }
  return <span style={{ fontSize: FIGURE_WIDTH * 0.8, lineHeight: 1 }}>{icon}</span>
}

/**
 * The ~1s clash that plays on every attack: the attacker lunges across the gap, and either an
 * impact burst lands on the defender (a hit) or the swing whiffs and a MISS tag floats up.
 *
 * It runs on the shared reveal stage and takes over the whole screen, fading in and out, so the
 * battlefield underneath is hidden for the beat of the attack and the figures can be large.
 */
export function AttackAnimation({
  attackerIcon,
  attackerArtPath,
  defenderIcon,
  defenderArtPath,
  side,
  hit,
}: AttackAnimationProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const home = attackerHome(side)
  const defend = defenderHome(side)
  const travel = lungeOffset(side)
  const rotate = side === 'player' ? -18 : 18

  // Out fast, back to rest: peaks on the impact frame, home again a few frames later.
  const lunge = interpolate(
    frame,
    [0, ATTACK_LAYOUT.impactFrame, ATTACK_LAYOUT.impactFrame + 10],
    [0, 1, 0],
    { easing: Easing.inOut(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const flash = hit
    ? interpolate(
        frame,
        [ATTACK_LAYOUT.impactFrame - 2, ATTACK_LAYOUT.impactFrame + 2, ATTACK_LAYOUT.impactFrame + 15],
        [0, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0
  // The defender recoils on a hit; the shake decays with the flash.
  const shake = hit ? Math.sin(frame * 1.7) * 9 * flash : 0
  const miss = hit
    ? 0
    : interpolate(
        frame,
        [ATTACK_LAYOUT.impactFrame - 4, ATTACK_LAYOUT.impactFrame + 2, ATTACK_LAYOUT.impactFrame + 16],
        [0, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )

  // Fade the whole stage in and out so the takeover does not pop.
  const appear = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: 'clamp' })
  const exit = interpolate(frame, [durationInFrames - 7, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const stageOpacity = Math.min(appear, exit)

  return (
    <AbsoluteFill style={{ ...UNLOCK_STAGE_STYLE, opacity: stageOpacity }}>
      {/* The clash glow, swelling with the impact. */}
      <div
        style={{
          background: `radial-gradient(circle, ${hit ? '#ff6b4a55' : '#6b628833'} 0%, transparent 70%)`,
          borderRadius: '50%',
          height: 560,
          position: 'absolute',
          transform: `scale(${0.75 + flash * 0.5})`,
          width: 560,
        }}
      />

      <div
        style={{
          left: defend.x,
          position: 'absolute',
          top: defend.y,
          transform: `translate(-50%, -50%) translateY(${shake}px)`,
        }}
      >
        <div style={{ filter: flash > 0 ? `drop-shadow(0 0 ${30 * flash}px #ff6b4a)` : 'none' }}>
          <Figure icon={defenderIcon} artPath={defenderArtPath} />
        </div>
      </div>

      {flash > 0 ? (
        <div
          style={{
            left: ATTACK_LAYOUT.center.x,
            opacity: flash,
            position: 'absolute',
            top: ATTACK_LAYOUT.center.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            style={{
              background: 'radial-gradient(circle, #fff4b0dd 0%, #ff6b4a88 42%, transparent 72%)',
              borderRadius: '50%',
              height: 300 * flash,
              left: '50%',
              position: 'absolute',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 300 * flash,
            }}
          />
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              style={{
                background: '#fff4b0',
                borderRadius: 5,
                height: 9,
                left: '50%',
                opacity: flash * 0.9,
                position: 'absolute',
                top: '50%',
                transform: `translate(-50%, -50%) rotate(${index * 60}deg) scaleX(${flash})`,
                transformOrigin: 'center',
                width: 240,
              }}
            />
          ))}
        </div>
      ) : null}

      <div
        style={{
          left: home.x,
          position: 'absolute',
          top: home.y,
          transform: `translate(-50%, -50%) translateY(${travel * lunge}px) rotate(${rotate * lunge}deg)`,
        }}
      >
        <Figure icon={attackerIcon} artPath={attackerArtPath} />
      </div>

      {miss > 0 ? (
        <div
          style={{
            left: ATTACK_LAYOUT.center.x,
            opacity: miss,
            position: 'absolute',
            top: ATTACK_LAYOUT.center.y,
            transform: `translate(-50%, -50%) scale(${0.85 + miss * 0.15})`,
          }}
        >
          <span
            style={{
              color: '#ff6b4a',
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: 4,
              textShadow: '0 0 22px #000',
            }}
          >
            MISS
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  )
}
