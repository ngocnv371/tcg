import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { Panel, Screen } from '@/components/Screen'
import { RunRewardsModal } from '@/features/dungeons/RunRewardsModal'
import { useDungeons, useRuns } from '@/features/dungeons/api'
import { useParties } from '@/features/party/api'
import { useClaimRun, useStartRun } from '@/features/progression/api'
import type { RunClaim } from '@/features/progression/api'
import { successChance } from '@/game/formulas'

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} sec`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${Math.round(seconds / 3600)} h`
}

export function DungeonMapScreen() {
  const { data: dungeons, error } = useDungeons()
  const { data: runs } = useRuns()
  const { data: parties } = useParties()
  const startRun = useStartRun()
  const claimRun = useClaimRun()
  const [toast, setToast] = useState<string | null>(null)
  const [claim, setClaim] = useState<RunClaim | null>(null)
  const [partyId, setPartyId] = useState<string | null>(null)
  const teams = parties ?? []
  /** No explicit pick yet → the player's first team, matching `start_run`'s default. */
  const sendPartyId = partyId ?? teams[0]?.party.id ?? null
  const activeRuns = runs?.filter((run) => !run.resolved_at) ?? []
  const claimableRuns = runs?.filter((run) => run.resolved_at && !run.claimed_at) ?? []
  const dungeonNames = new Map((dungeons ?? []).map((dungeon) => [dungeon.id, dungeon.name]))

  useEffect(() => {
    if (!toast) return

    const timeout = window.setTimeout(() => setToast(null), 5_000)
    return () => window.clearTimeout(timeout)
  }, [toast])

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

      <div className="space-y-3">
        {teams.length > 1 ? (
          <Panel title="Team to send">
            <select
              value={sendPartyId ?? ''}
              onChange={(event) => setPartyId(event.target.value)}
              aria-label="Team to send"
              className="w-full rounded-card border border-ink-700 bg-ink-850 px-2.5 py-2 text-sm text-ink-50"
            >
              {teams.map(({ party, slots }) => (
                <option key={party.id} value={party.id}>
                  {party.name} · {slots.length} card{slots.length === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </Panel>
        ) : null}

        {startRun.isSuccess ? (
          <p className="text-xs text-faction-verdant">
            Run started. It ends at {new Date(startRun.data.ends_at).toLocaleString()}.
          </p>
        ) : null}

        {activeRuns.length > 0 || claimableRuns.length > 0 ? (
          <Panel title="Your runs">
            <ul className="space-y-2.5">
              {activeRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="text-ink-200">{dungeonNames.get(run.dungeon_id) ?? run.dungeon_id}</p>
                    <p className="text-xs text-ink-400">Ends at {new Date(run.ends_at).toLocaleString()}</p>
                  </div>
                  <span className="text-xs text-gold-300">Running</span>
                </li>
              ))}
              {claimableRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-200">{dungeonNames.get(run.dungeon_id) ?? run.dungeon_id}</span>
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
          </Panel>
        ) : null}

        <ul className="space-y-2.5">
        {(dungeons ?? []).map((dungeon) => (
          <li key={dungeon.id}>
            <Panel>
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
                <dd className="text-right text-ink-600">
                  {/* Preview only — the server rolls the real chance. */}
                  p≈{Math.round(successChance(dungeon.req_power, dungeon.req_power) * 100)}%
                </dd>
              </dl>
              <button
                type="button"
                className="mt-3 w-full rounded-card border border-gold-600 px-3 py-2 text-xs text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={startRun.isPending}
                onClick={() =>
                  startRun.mutate(
                    { dungeonId: dungeon.id, partyId: sendPartyId ?? undefined },
                    { onError: (runError) => setToast(runError.message) },
                  )
                }
              >
                {startRun.isPending ? 'Starting...' : 'Start run'}
              </button>
            </Panel>
          </li>
        ))}
        </ul>
      </div>

      {claimRun.error ? <p className="mt-3 text-xs text-faction-ember">{claimRun.error.message}</p> : null}
      {toast ? (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-md items-start justify-between gap-3 rounded-card border border-faction-ember/60 bg-ink-900 px-3 py-3 text-sm text-ink-100 shadow-lg"
        >
          <p>{toast}</p>
          <button
            type="button"
            aria-label="Dismiss notification"
            title="Dismiss"
            onClick={() => setToast(null)}
            className="shrink-0 text-ink-400 hover:text-ink-50"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      {claim ? <RunRewardsModal claim={claim} onClose={() => setClaim(null)} /> : null}
    </Screen>
  )
}
