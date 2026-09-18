import { Planned, Panel, Screen } from '@/components/Screen'
import { useRuns } from '@/features/dungeons/api'

export function HomeScreen() {
  const { data: runs } = useRuns()
  const active = runs?.filter((run) => !run.resolved_at) ?? []

  return (
    <Screen title="Hub" week="Built in weeks 6–9" hint="Active runs, claimable rewards, daily chest.">
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

        <Panel title="Still to build">
          <Planned
            items={[
              'Countdown per run + claim button',
              'resolve_runs() on focus — offline progress lands here',
              'Daily chest streak + web push opt-in (week 7)',
              'First-session script: free Rare chest → guided run → first rank-up',
            ]}
          />
        </Panel>
      </div>
    </Screen>
  )
}
