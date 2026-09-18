import { Planned, Panel, Screen } from '@/components/Screen'
import { useProfile } from '@/features/profile/api'

export function ProfileScreen() {
  const { data: profile, error } = useProfile()

  return (
    <Screen title="Profile" week="Built in week 2 · achievements in v1.1">
      <div className="space-y-3">
        <Panel title="Account">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-400">Player level</dt>
            <dd className="tabular-nums">{profile?.player_level ?? '—'}</dd>
            <dt className="text-ink-400">Gold</dt>
            <dd className="tabular-nums">{profile?.gold?.toLocaleString('en-US') ?? '—'}</dd>
            <dt className="text-ink-400">Run slots</dt>
            <dd className="tabular-nums">{profile?.run_slots ?? '—'}</dd>
          </dl>
          {error ? (
            <p className="mt-3 text-xs text-faction-ember">
              No database yet — run <code>npm run db:start</code> then <code>npm run db:reset</code>.
            </p>
          ) : null}
        </Panel>

        <Panel title="Not in v1">
          <Planned
            items={[
              'Achievements & milestones',
              'Whale tier / spend stats (needs payments)',
              'Card trading (deferred: complex)',
            ]}
          />
        </Panel>
      </div>
    </Screen>
  )
}
