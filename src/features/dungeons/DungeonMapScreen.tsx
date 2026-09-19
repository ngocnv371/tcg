import { useState, type CSSProperties } from 'react'

import { Panel, Screen } from '@/components/Screen'
import { RunRewardsModal } from '@/features/dungeons/RunRewardsModal'
import { StartRunModal } from '@/features/dungeons/StartRunModal'
import { useDungeons, useRuns } from '@/features/dungeons/api'
import { formatDuration } from '@/features/dungeons/format'
import { useClaimRun } from '@/features/progression/api'
import type { RunClaim } from '@/features/progression/api'
import { resolveArtSrc } from '@/lib/art'
import type { Dungeon, DungeonRun } from '@/types/db'

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
 */
function RunProgress({ run }: { run: DungeonRun }) {
  const { totalSeconds, elapsedSeconds, remainingSeconds } = runTimeline(run)

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
    </div>
  )
}

export function DungeonMapScreen() {
  const { data: dungeons, error } = useDungeons()
  const { data: runs } = useRuns()
  const claimRun = useClaimRun()
  const [claim, setClaim] = useState<RunClaim | null>(null)
  /** The dungeon whose party picker is open — at most one at a time. */
  const [picking, setPicking] = useState<Dungeon | null>(null)
  const activeRuns = runs?.filter((run) => !run.resolved_at) ?? []
  const claimableRuns = runs?.filter((run) => run.resolved_at && !run.claimed_at) ?? []
  /** `start_run` refuses account-wide while a finished run is uncollected, so the buttons do too. */
  const pendingClaims = claimableRuns.length > 0

  return (
    <Screen
      title="Dungeons"
      week="Built in weeks 6–7"
      hint="Start a run, close the app, get paid on return."
    >
      {error ? (
        <Panel>
          <p className="text-sm text-faction-ember">
            No database yet — run <code>npm run db:start</code> then <code>npm run db:reset</code>.
          </p>
        </Panel>
      ) : null}

      {pendingClaims ? (
        <p className="mb-2.5 text-xs text-gold-300">
          Claim your finished runs before sending another party.
        </p>
      ) : null}

      <ul className="space-y-2.5">
        {(dungeons ?? []).map((dungeon) => {
          const artSrc = resolveArtSrc(dungeon.art_path)
          const running = activeRuns.filter((run) => run.dungeon_id === dungeon.id)
          const claimable = claimableRuns.filter((run) => run.dungeon_id === dungeon.id)

          return (
            <li key={dungeon.id}>
              <Panel>
                {artSrc ? (
                  <div className="mb-2.5 aspect-video w-full overflow-hidden rounded-card bg-ink-850">
                    <img src={artSrc} alt={dungeon.name} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm text-ink-100">{dungeon.name}</h2>
                  <span className="text-xs text-ink-400">
                    {dungeon.kind} · tier {dungeon.tier}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-y-1 text-xs">
                  <dt className="text-ink-400">Req power</dt>
                  <dd className="tabular-nums">{dungeon.req_power.toLocaleString('en-US')}</dd>
                  <dd />
                  <dt className="text-ink-400">Timer</dt>
                  <dd className="tabular-nums">{formatDuration(dungeon.duration_seconds)}</dd>
                  <dd />
                  <dt className="text-ink-400">Base gold</dt>
                  <dd className="tabular-nums">{dungeon.gold_base.toLocaleString('en-US')}</dd>
                  <dd />
                </dl>

                {running.length > 0 || claimable.length > 0 ? (
                  <div className="mt-3 space-y-2.5 border-t border-ink-800 pt-3">
                    {running.map((run) => (
                      <RunProgress key={run.id} run={run} />
                    ))}
                    {claimable.map((run) => (
                      <div key={run.id}>
                        {/* A failure has no outcome to announce — the Claim button says it all. */}
                        {run.success ? (
                          <p className="text-xs text-faction-verdant">Cleared — rewards ready</p>
                        ) : null}
                        <button
                          type="button"
                          className="mt-2 w-full rounded-card bg-gold-500 px-3 py-2 text-xs font-medium text-ink-950 disabled:opacity-50"
                          disabled={claimRun.isPending}
                          onClick={() => claimRun.mutate(run.id, { onSuccess: setClaim })}
                        >
                          Claim
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-3 w-full rounded-card border border-gold-600 px-3 py-2 text-xs text-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={pendingClaims}
                    title={pendingClaims ? 'Claim your finished runs first' : undefined}
                    onClick={() => setPicking(dungeon)}
                  >
                    Start run
                  </button>
                )}
              </Panel>
            </li>
          )
        })}
      </ul>

      {claimRun.error ? <p className="mt-3 text-xs text-faction-ember">{claimRun.error.message}</p> : null}
      {picking ? (
        <StartRunModal
          dungeon={picking}
          activeRuns={activeRuns}
          pendingClaims={claimableRuns.length}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {claim ? <RunRewardsModal claim={claim} onClose={() => setClaim(null)} /> : null}
    </Screen>
  )
}
