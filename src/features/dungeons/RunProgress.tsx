import type { CSSProperties } from 'react'
import { Gem } from 'lucide-react'

import { formatDuration } from '@/features/dungeons/format'
import { rushCost } from '@/game/formulas'
import type { DungeonRun } from '@/types/db'

/**
 * Reads the wall clock once to turn a run into a progress snapshot. Deliberately not a
 * live timer: the animation carries the bar from here to 100% on its own.
 */
function runTimeline(run: DungeonRun) {
  const startedAt = new Date(run.started_at).getTime()
  const endsAt = new Date(run.ends_at).getTime()
  const totalSeconds = Math.max(1, Math.round((endsAt - startedAt) / 1000))
  const elapsedSeconds = Math.min(
    totalSeconds,
    Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
  )

  return { totalSeconds, elapsedSeconds, remainingSeconds: totalSeconds - elapsedSeconds }
}

/**
 * The bar is painted once and handed to CSS: `run-progress` scales the fill from 0 to 1
 * over the run's full length and the negative delay skips it forward to where the run
 * already is. No interval, no per-second re-render — `ends_at` is the clock.
 *
 * Shared by the dungeon map and the Home hub so a run looks the same wherever it is shown.
 */
export function RunProgress({
  run,
  gems,
  onRush,
  rushPending,
}: {
  run: DungeonRun
  gems: number | undefined
  onRush: () => void
  rushPending: boolean
}) {
  const { totalSeconds, elapsedSeconds, remainingSeconds } = runTimeline(run)
  // Preview only: `rush_run` recomputes the price from the stored `ends_at`.
  const cost = rushCost(remainingSeconds)
  const affordable = (gems ?? 0) >= cost

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-gold-300">Running</span>
        <span className="tabular-nums text-ink-400">
          {remainingSeconds > 0 ? `~${formatDuration(remainingSeconds)} left` : 'Finishing...'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Run progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((elapsedSeconds / totalSeconds) * 100)}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-800"
      >
        <div
          className="run-progress-fill h-full w-full origin-left rounded-full bg-gold-500"
          style={
            {
              // Static fraction for prefers-reduced-motion; otherwise the animation below wins.
              '--run-progress': elapsedSeconds / totalSeconds,
              animationName: 'run-progress',
              animationDuration: `${totalSeconds}s`,
              animationDelay: `-${elapsedSeconds}s`,
              animationTimingFunction: 'linear',
              animationFillMode: 'both',
            } as CSSProperties
          }
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-600">
        Ends {new Date(run.ends_at).toLocaleTimeString()}
      </p>
      <button
        type="button"
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-card border border-faction-tide/60 px-3 py-1.5 text-xs text-faction-tide disabled:cursor-not-allowed disabled:opacity-40"
        disabled={rushPending || !affordable}
        title={affordable ? undefined : 'Not enough gems'}
        onClick={onRush}
      >
        <Gem className="size-3.5" />
        {rushPending ? 'Finishing...' : `Finish now · ${cost} gems`}
      </button>
    </div>
  )
}
