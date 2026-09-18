import { Panel, Screen } from '@/components/Screen'
import { useDungeons } from '@/features/dungeons/api'
import { successChance } from '@/game/formulas'

function formatDuration(seconds: number) {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${Math.round(seconds / 3600)} h`
}

export function DungeonMapScreen() {
  const { data: dungeons, error } = useDungeons()

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
            </Panel>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-600">
        Start/claim buttons land with the server functions <code>start_run</code> and{' '}
        <code>claim_run</code> (week 6).
      </p>
    </Screen>
  )
}
