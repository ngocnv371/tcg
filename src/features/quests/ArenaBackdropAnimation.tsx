import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'

/**
 * The loop length for the arena lights: 8s at 30fps. Every value below is built from
 * `sin`/`cos` of the loop fraction (or whole-number travel), so the seam where the Player loops
 * is invisible.
 */
export const ARENA_LOOP_FRAMES = 300

/** Which way each sweeping beam leans and how far it sways. Fixed, not randomised: Remotion
 * renders the same frame on every re-render, so a random pick would make the video jump. */
const BEAMS = [
  { color: '#7c6bff', from: -32, sway: 8, phase: 0 },
  { color: '#4aa3ff', from: 8, sway: 10, phase: Math.PI * 0.66 },
  { color: '#ffb02e', from: 34, sway: 7, phase: Math.PI * 1.33 },
] as const

/**
 * Vertical god rays hanging from the light rig. Each slowly grows and shrinks (`scale`) while it
 * drifts a few pixels sideways, on its own cycle — calm enough to sit behind a fight without
 * pulling the eye, which is why they replaced the lens flare.
 */
const GODRAYS = [
  { left: 20, width: 44, tint: '#7c6bff', phase: 0, sway: 2.5, drift: 20, opacity: 0.16 },
  { left: 37, width: 26, tint: '#4aa3ff', phase: 1.9, sway: 3.5, drift: 14, opacity: 0.13 },
  { left: 50, width: 92, tint: '#ffe9b0', phase: 1.1, sway: 1.5, drift: 10, opacity: 0.2 },
  { left: 64, width: 28, tint: '#ffb02e', phase: 3.1, sway: 3, drift: 16, opacity: 0.14 },
  { left: 81, width: 38, tint: '#7c6bff', phase: 4.4, sway: 2.5, drift: 22, opacity: 0.14 },
] as const

/** Drifting dust. Integer travel keeps the loop seamless. */
const MOTES = Array.from({ length: 22 }, (_, index) => ({
  x: ((index * 37) % 100) / 100,
  y: ((index * 53) % 100) / 100,
  size: 2 + (index % 3),
  speed: 1 + (index % 3),
}))

/** The lamps along the light rig at the top of the stage. */
const LAMPS = [20, 50, 80] as const

/** Soft shafts of light falling from the rig: growing, shrinking and drifting sideways. */
function GodRays({ turn }: { turn: number }) {
  return (
    <>
      {GODRAYS.map((ray) => {
        const cycle = turn + ray.phase
        // One slow breath per loop: the shaft lengthens and narrows, then swells back out.
        const scaleY = 0.82 + 0.36 * (0.5 + 0.5 * Math.sin(cycle))
        const scaleX = 0.88 + 0.24 * (0.5 + 0.5 * Math.cos(cycle))
        // Phased off the breath so the sideways drift reads as its own, independent motion.
        const drift = Math.sin(cycle + 0.9) * ray.drift
        const breathe = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(cycle * 2))
        return (
          <div
            key={ray.left}
            style={{
              background: `linear-gradient(180deg, ${ray.tint}80 0%, ${ray.tint}26 48%, transparent 92%)`,
              filter: 'blur(16px)',
              height: '82%',
              left: `${ray.left}%`,
              mixBlendMode: 'screen',
              opacity: ray.opacity * breathe,
              position: 'absolute',
              top: '-4%',
              transform: `translateX(-50%) translateX(${drift}px) rotate(${Math.sin(cycle) * ray.sway}deg) scale(${scaleX}, ${scaleY})`,
              transformOrigin: '50% 0%',
              width: ray.width,
            }}
          />
        )
      })}
    </>
  )
}

/**
 * The arena's backstage lighting, drawn as a looping Remotion layer over the static arena scene:
 * three colour beams sweeping across the stage, a light rig at the top whose lamps flicker, a
 * drifting lens flare, and embers rising through the light. It has no background of its own, so
 * the CSS arena underneath stays visible.
 */
export function ArenaBackdropAnimation() {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = frame / durationInFrames
  const turn = t * Math.PI * 2

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Backstage glow pulsing behind the ring. */}
      <div
        style={{
          background:
            'radial-gradient(circle, #6b5cff24 0%, #ffb02e17 42%, transparent 72%)',
          borderRadius: '50%',
          height: 620,
          left: '50%',
          mixBlendMode: 'screen',
          position: 'absolute',
          top: '46%',
          transform: `translate(-50%, -50%) scale(${1 + Math.sin(turn) * 0.06})`,
          width: 620,
        }}
      />

      {/* The light rig: a bright band with a row of flickering lamps. */}
      <div
        style={{
          background:
            'linear-gradient(180deg, #ffd76b16 0%, transparent 100%)',
          height: 120,
          left: 0,
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      />
      {LAMPS.map((left, index) => {
        const flicker = 0.32 + 0.26 * (0.5 + 0.5 * Math.sin(turn * 3 + index * 1.7))
        return (
          <div
            key={left}
            style={{
              background: 'radial-gradient(circle, #fff6d8 0%, #ffd76b66 30%, transparent 70%)',
              borderRadius: '50%',
              filter: 'blur(2px)',
              height: 52,
              left: `${left}%`,
              mixBlendMode: 'screen',
              opacity: flicker,
              position: 'absolute',
              top: 26,
              transform: 'translate(-50%, -50%)',
              width: 52,
            }}
          />
        )
      })}

      {/* Sweeping colour beams from the rig, crossing as they sway. */}
      {BEAMS.map((beam) => {
        const angle = beam.from + Math.sin(turn + beam.phase) * beam.sway
        const intensity = 0.14 + 0.18 * (0.5 + 0.5 * Math.cos(turn + beam.phase))
        return (
          <div
            key={beam.color}
            style={{
              background: `linear-gradient(180deg, ${beam.color}cc 0%, ${beam.color}33 46%, transparent 88%)`,
              filter: 'blur(12px)',
              height: '94%',
              left: '50%',
              mixBlendMode: 'screen',
              opacity: intensity,
              position: 'absolute',
              top: '-6%',
              transform: `translateX(-50%) rotate(${angle}deg)`,
              transformOrigin: '50% 0%',
              width: 150,
            }}
          />
        )
      })}

      <GodRays turn={turn} />

      {/* Embers rising through the light. */}
      {MOTES.map((mote, index) => {
        const drift = (((mote.y - t * mote.speed) % 1) + 1) % 1
        return (
          <div
            key={index}
            style={{
              background: '#ffe9b0',
              borderRadius: '50%',
              filter: 'blur(1px)',
              height: mote.size,
              left: `${mote.x * 100}%`,
              opacity: 0.07 + 0.12 * (0.5 + 0.5 * Math.sin(turn + index)),
              position: 'absolute',
              top: `${drift * 100}%`,
              width: mote.size,
            }}
          />
        )
      })}
    </AbsoluteFill>
  )
}
