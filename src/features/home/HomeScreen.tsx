import { useState } from 'react'

import { Panel, Screen } from '@/components/Screen'
import { RunRewardsModal } from '@/features/dungeons/RunRewardsModal'
import { useClaimRun } from '@/features/progression/api'
import type { RunClaim } from '@/features/progression/api'
import { useRuns } from '@/features/dungeons/api'

export function HomeScreen() {
  const { data: runs } = useRuns()
  const claimRun = useClaimRun()
  const [claim, setClaim] = useState<RunClaim | null>(null)
  const active = runs?.filter((run) => !run.resolved_at) ?? []
  const claimable = runs?.filter((run) => run.resolved_at && !run.claimed_at) ?? []

  return (
    <Screen title="Hub" hint="Active runs and rewards return here when you come back.">
      <div className="space-y-3">
        <Panel title={`Active runs (${active.length})`}>
          {active.length === 0 ? (
            <p className="text-sm text-ink-400">Nothing running. Every session should start here.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {active.map((run) => (
                <li key={run.id} className="flex justify-between">
                  <span>{run.dungeon_id}</span>
                  <span className="tabular-nums text-ink-400">{run.ends_at}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Rewards ready (${claimable.length})`}>
          {claimable.length === 0 ? <p className="text-sm text-ink-400">No completed runs to claim.</p> : null}
          <ul className="space-y-2">
            {claimable.map((run) => (
              <li key={run.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-200">{run.dungeon_id}</span>
                <button
                  type="button"
                  className="rounded-card bg-gold-500 px-3 py-2 text-xs font-medium text-ink-950 disabled:opacity-50"
                  disabled={claimRun.isPending}
                  onClick={() => claimRun.mutate(run.id, { onSuccess: setClaim })}
                >
                  Claim
                </button>
              </li>
            ))}
          </ul>
          {claimRun.error ? <p className="mt-3 text-xs text-faction-ember">{claimRun.error.message}</p> : null}
        </Panel>
      </div>
      {claim ? <RunRewardsModal claim={claim} onClose={() => setClaim(null)} /> : null}
    </Screen>
  )
}
