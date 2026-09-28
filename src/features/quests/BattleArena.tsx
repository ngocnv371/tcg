import { Player } from '@remotion/player'

import { STAGE_FPS, STAGE_SIZE } from '@/features/chests/unlockLayout'
import {
  ARENA_LOOP_FRAMES,
  ArenaBackdropAnimation,
} from '@/features/quests/ArenaBackdropAnimation'

/**
 * The arena a quest fight happens in: a CSS-only scene so the board reads as a place instead of a
 * void. No art asset is involved — there is no arena art pipeline, and the card art is the only
 * real texture the game ships for a battle — so the scene is built from gradients: a hazy sky,
 * a colonnade wall, a floor with the ring the parties stand in, two torch glows at the edges and
 * a vignette that keeps the eye on the cards.
 *
 * The backstage lighting is a looping Remotion layer on top of those gradients (see
 * `ArenaBackdropAnimation`): sweeping beams, a flickering lamp rig, a drifting lens flare and
 * rising embers. The vignette stays above it, so the frame keeps its focus on the middle.
 */
export function BattleArena() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sky: a violet haze that is brightest behind the enemy line. */}
      <div
        className="absolute inset-x-0 top-0 h-[62%]"
        style={{
          background:
            'radial-gradient(ellipse 130% 85% at 50% 0%, #2b2149 0%, #161022 52%, transparent 100%)',
        }}
      />

      {/* Far wall: faint stone pillars, fading out where the floor begins. */}
      <div
        className="absolute inset-x-0 top-[8%] bottom-[40%]"
        style={{
          background:
            'repeating-linear-gradient(90deg, #1c1631 0 44px, #241d3d 44px 47px, #191430 47px 92px)',
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 45%, #000 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 45%, #000 100%)',
          opacity: 0.55,
        }}
      />

      {/* Floor. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[42%]"
        style={{
          background: 'linear-gradient(180deg, #1a1430 0%, #0d0a16 62%, #07060d 100%)',
        }}
      />

      {/* The ring the parties stand in, seen in perspective. */}
      <div
        className="absolute left-1/2 top-[54%] size-[135%] -translate-x-1/2 rounded-[50%]"
        style={{
          background: 'radial-gradient(ellipse at 50% 32%, #2c2248 0%, transparent 66%)',
          border: '1px solid #4a3f6d59',
        }}
      />

      {/* Torch glows, one per edge. */}
      <div
        className="absolute left-[-60px] top-[26%] size-44 rounded-full"
        style={{ background: 'radial-gradient(circle, #ffb02e4d 0%, transparent 70%)' }}
      />
      <div
        className="absolute right-[-60px] top-[26%] size-44 rounded-full"
        style={{ background: 'radial-gradient(circle, #ffb02e4d 0%, transparent 70%)' }}
      />

      {/* Backstage lighting: a looping Remotion layer, transparent so the scene above shows through. */}
      <div className="absolute inset-0 grid place-items-center">
        <Player
          component={ArenaBackdropAnimation}
          durationInFrames={ARENA_LOOP_FRAMES}
          fps={STAGE_FPS}
          compositionWidth={STAGE_SIZE.width}
          compositionHeight={STAGE_SIZE.height}
          autoPlay
          loop
          controls={false}
          clickToPlay={false}
          style={{ height: '100%', width: '100%' }}
        />
      </div>

      {/* Vignette: keeps the middle of the stage the brightest part of the screen. */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 88% 72% at 50% 46%, transparent 38%, #07060d 100%)',
        }}
      />
    </div>
  )
}
