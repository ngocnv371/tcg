import { useState, type CSSProperties } from 'react'
import { Gem } from 'lucide-react'

import { Panel, Screen } from '@/components/Screen'
import { DungeonResourcesModal } from '@/features/dungeons/DungeonResourcesModal'
import { RunRewardsModal } from '@/features/dungeons/RunRewardsModal'
import { RunVictoryOverlay, type RunVictory } from '@/features/dungeons/RunVictoryOverlay'
import { StartRunModal } from '@/features/dungeons/StartRunModal'
import { useDungeons, useRuns } from '@/features/dungeons/api'
import { formatDuration } from '@/features/dungeons/format'
import { useProfile } from '@/features/profile/api'
import { useClaimRun, useRushRun } from '@/features/progression/api'
import type { RunClaim } from '@/features/progression/api'
import { rushCost, tagLabel } from '@/game/formulas'
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
function RunProgress({
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

export function DungeonMapScreen() {
  const { data: dungeons, error } = useDungeons()
  const { data: runs } = useRuns()
  const { data: profile } = useProfile()
  const claimRun = useClaimRun()
  const rushRun = useRushRun()
  const [claim, setClaim] = useState<RunClaim | null>(null)
  /** The claim celebration, played once before the settlement panel. */
  const [victory, setVictory] = useState<RunVictory | null>(null)
  /** The dungeon whose party picker is open — at most one at a time. */
  const [picking, setPicking] = useState<Dungeon | null>(null)
  /** The dungeon whose resource yield is on screen — also one at a time. */
  const [resources, setResources] = useState<Dungeon | null>(null)
  const activeRuns = runs?.filter((run) => !run.resolved_at) ?? []
  const claimableRuns = runs?.filter((run) => run.resolved_at && !run.claimed_at) ?? []
  /** `start_run` refuses account-wide while a finished run is uncollected, so the buttons do too. */
  const pendingClaims = claimableRuns.length > 0

  return (
    <Screen
      title="Dungeons"
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

                {/* The tags are what the dungeon farms, so they belong on the card: this is
                    how a player spots where a card's Cores come from. */}
                {dungeon.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {dungeon.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-card bg-ink-850 px-2 py-0.5 text-[11px] text-ink-300"
                      >
                        {tagLabel(tag)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {running.length > 0 || claimable.length > 0 ? (
                  <div className="mt-3 space-y-2.5 border-t border-ink-800 pt-3">
                    {running.map((run) => (
                      <RunProgress
                        key={run.id}
                        run={run}
                        gems={profile?.gems}
                        rushPending={rushRun.isPending && rushRun.variables === run.id}
                        onRush={() => rushRun.mutate(run.id)}
                      />
                    ))}
                    {claimable.map((run) => (
                      <div key={run.id}>
                        <p className="text-xs text-faction-verdant">Cleared — rewards ready</p>
                        <button
                          type="button"
                          className="mt-2 w-full rounded-card bg-gold-500 px-3 py-2 text-xs font-medium text-ink-950 disabled:opacity-50"
                          disabled={claimRun.isPending}
                          onClick={() =>
                            claimRun.mutate(run.id, {
                              // Celebrate first, settle second: the panel opens once the
                              // victory animation has been dismissed.
                              onSuccess: (result) => {
                                setClaim(result)
                                setVictory({ claim: result, dungeon, key: run.id, run })
                              },
                            })
                          }
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

                <button
                  type="button"
                  className="mt-2 w-full rounded-card border border-ink-700 px-3 py-2 text-xs text-ink-300 hover:border-ink-600"
                  onClick={() => setResources(dungeon)}
                >
                  Resources
                </button>
              </Panel>
            </li>
          )
        })}
      </ul>

      {claimRun.error ? <p className="mt-3 text-xs text-faction-ember">{claimRun.error.message}</p> : null}
      {rushRun.error ? <p className="mt-3 text-xs text-faction-ember">{rushRun.error.message}</p> : null}
      {picking ? (
        <StartRunModal
          dungeon={picking}
          activeRuns={activeRuns}
          pendingClaims={claimableRuns.length}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {resources ? (
        <DungeonResourcesModal dungeon={resources} onClose={() => setResources(null)} />
      ) : null}
      {victory ? (
        <RunVictoryOverlay victory={victory} onClose={() => setVictory(null)} />
      ) : null}
      {/* Held back until the celebration is over, so the two never stack. */}
      {claim && !victory ? <RunRewardsModal claim={claim} onClose={() => setClaim(null)} /> : null}
    </Screen>
  )
}
