import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { rankColor, UNLOCK_STAGE_STYLE } from '@/features/chests/unlockVisuals'
import { beatProgress } from '@/features/dungeons/runVictoryVisuals'
import {
  COMBAT_INTRO_DURATION,
  combatantPlacements,
  INTRO_BEATS,
  INTRO_ENEMY_STAGGER,
  INTRO_LAYOUT,
  INTRO_PARTY_STAGGER,
  INTRO_TILE_SIZE,
} from '@/features/quests/questBattleVisuals'
import { resolveArtSrc } from '@/lib/art'

/** One card in the curtain — a quest opponent or a member of the player's own party. */
export type CombatIntroCombatant = {
  id: string
  name: string
  icon: string
  artPath: string | null
  rank: number
}

export type CombatIntroAnimationProps = {
  questName: string
  enemies: CombatIntroCombatant[]
  party: CombatIntroCombatant[]
}

const TITLE_SPRING = { damping: 16, mass: 0.8, stiffness: 90 }
const CARD_SPRING = { damping: 12, mass: 0.7, stiffness: 150 }

const CARD_WIDTH = INTRO_TILE_SIZE.width
const CARD_HEIGHT = 120

/** One card face: the art in a rank frame with its name and star, same as the library tile. */
function CardFace({ combatant }: { combatant: CombatIntroCombatant }) {
  const color = rankColor(combatant.rank)
  const artSrc = resolveArtSrc(combatant.artPath)

  return (
    <div style={{ textAlign: 'center', width: INTRO_TILE_SIZE.width }}>
      <div
        style={{
          background: `linear-gradient(150deg, ${color} 0%, #141020 40%, #090811 100%)`,
          border: `2px solid ${color}`,
          borderRadius: 10,
          boxShadow: `0 0 16px ${color}aa, 0 12px 24px #00000099`,
          height: CARD_HEIGHT,
          margin: '0 auto',
          overflow: 'hidden',
          position: 'relative',
          width: CARD_WIDTH,
        }}
      >
        {artSrc ? (
          <img
            src={artSrc}
            alt={combatant.name}
            style={{ height: '100%', objectFit: 'cover', width: '100%' }}
          />
        ) : (
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              fontSize: 40,
              height: '100%',
              justifyContent: 'center',
            }}
          >
            {combatant.icon}
          </div>
        )}
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
          {combatant.rank}★
        </div>
      </div>
      <div
        style={{
          color: '#f2f0f8',
          fontSize: 10.5,
          marginTop: 6,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textShadow: '0 2px 8px #000',
          whiteSpace: 'nowrap',
        }}
      >
        {combatant.name}
      </div>
    </div>
  )
}

/**
 * One side of the curtain: its cards slam in one after another, staggered left to right. The
 * block is zero-size, so its top-left corner is the origin every placement measures from.
 */
function CombatantRow({
  combatants,
  top,
  startFrame,
  stagger,
}: {
  combatants: CombatIntroCombatant[]
  top: number
  startFrame: number
  stagger: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const spots = combatantPlacements(combatants.length)

  return (
    <div style={{ left: '50%', position: 'absolute', top }}>
      {combatants.map((combatant, index) => {
        const spot = spots[index]
        const appear = spring({
          config: CARD_SPRING,
          delay: startFrame + index * stagger,
          fps,
          frame,
        })
        return (
          <div
            key={combatant.id}
            style={{
              left: 0,
              opacity: appear,
              position: 'absolute',
              top: 0,
              transform: `translate(-50%, -50%) translate(${spot.x}px, ${spot.y}px) scale(${0.55 + appear * 0.45})`,
            }}
          >
            <CardFace combatant={combatant} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * The 2s curtain before the first turn: "ENEMY APPROACHES", the opponent party slamming in from
 * the top, a VS stamp, then the player's own party answering from the bottom. Plays on the shared
 * reveal stage so a battle opens on the same backdrop as a pull or a clear.
 */
export function CombatIntroAnimation({ questName, enemies, party }: CombatIntroAnimationProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const titleIn = spring({ config: TITLE_SPRING, fps, frame })
  const versus = beatProgress(frame, INTRO_BEATS.versus)
  const fadeOut = interpolate(frame, [COMBAT_INTRO_DURATION - 8, COMBAT_INTRO_DURATION], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ ...UNLOCK_STAGE_STYLE, opacity: fadeOut }}>
      {/* Warm threat glow behind the enemy side; the stage centres its absolute children on it. */}
      <div
        style={{
          background: 'radial-gradient(circle, #ff6b4a33 0%, transparent 68%)',
          borderRadius: '50%',
          height: 460,
          position: 'absolute',
          transform: `scale(${0.85 + versus * 0.25})`,
          width: 460,
        }}
      />

      <div
        style={{
          left: 0,
          opacity: titleIn,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          top: INTRO_LAYOUT.titleTop,
          transform: `translateY(${(1 - titleIn) * -14}px)`,
        }}
      >
        <div
          style={{
            color: '#ffb4a2',
            fontSize: 22,
            letterSpacing: 4,
            textShadow: '0 0 22px #ff6b4a99',
          }}
        >
          ENEMY APPROACHES
        </div>
        <div style={{ color: '#a9a4c2', fontSize: 12, marginTop: 8 }}>{questName}</div>
      </div>

      <CombatantRow
        combatants={enemies}
        top={INTRO_LAYOUT.enemyTop}
        startFrame={INTRO_BEATS.enemies[0]}
        stagger={INTRO_ENEMY_STAGGER}
      />

      <div
        style={{
          left: 0,
          opacity: versus,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          top: INTRO_LAYOUT.versusTop,
          transform: `translateY(-50%) scale(${0.7 + versus * 0.3})`,
        }}
      >
        <span
          style={{
            color: '#ff6b4a',
            fontSize: 44,
            letterSpacing: 4,
            textShadow: '0 0 28px #ff6b4aaa',
          }}
        >
          VS
        </span>
      </div>

      <CombatantRow
        combatants={party}
        top={INTRO_LAYOUT.partyTop}
        startFrame={INTRO_BEATS.party[0]}
        stagger={INTRO_PARTY_STAGGER}
      />

      <div
        style={{
          bottom: 28,
          left: 0,
          opacity: versus,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
        }}
      >
        <span style={{ color: '#a9a4c2', fontSize: 11, letterSpacing: 3 }}>YOUR PARTY</span>
      </div>
    </AbsoluteFill>
  )
}
