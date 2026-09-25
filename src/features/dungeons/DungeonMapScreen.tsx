import { useState } from 'react'

import { Panel, Screen } from '@/components/Screen'
import { DungeonResourcesModal } from '@/features/dungeons/DungeonResourcesModal'
import { RunProgress } from '@/features/dungeons/RunProgress'
import { RunRewardsModal } from '@/features/dungeons/RunRewardsModal'
import { RunVictoryOverlay, type RunVictory } from '@/features/dungeons/RunVictoryOverlay'
import { StartRunModal } from '@/features/dungeons/StartRunModal'
import { useDungeons, useRuns } from '@/features/dungeons/api'
import { formatDuration } from '@/features/dungeons/format'
import { useProfile } from '@/features/profile/api'
import { useClaimRun, useRushRun } from '@/features/progression/api'
import type { RunClaim } from '@/features/progression/api'
import { tagLabel } from '@/game/formulas'
import { resolveArtSrc } from '@/lib/art'
import type { Dungeon } from '@/types/db'

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
  // The tutorial is a one-time lesson: once its run is claimed it drops off the map rather than
  // sitting there unstartable. It is still listed while live or unclaimed so it can be finished.
  const visibleDungeons = (dungeons ?? []).filter((dungeon) => {
    if (!dungeon.is_tutorial) return true
    return !(runs ?? []).some((run) => run.dungeon_id === dungeon.id && run.claimed_at)
  })

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
        {visibleDungeons.map((dungeon) => {
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
                    {dungeon.is_tutorial ? 'one-time tutorial' : `${dungeon.kind} · tier ${dungeon.tier}`}
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
