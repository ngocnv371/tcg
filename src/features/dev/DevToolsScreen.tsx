import { Panel, Screen } from '@/components/Screen'
import { useProfile } from '@/features/profile/api'
import { useGrantTestChests, useGrantTestGems } from '@/features/progression/api'

/**
 * Dev-only faucets for currencies that have no earn path in v1. The RPCs are granted to
 * `authenticated` in every build, so this screen is a convenience, not a security boundary.
 */
export function DevToolsScreen() {
  const { data: profile } = useProfile()
  const grantTestGems = useGrantTestGems()
  const grantTestChests = useGrantTestChests()
  const error = grantTestGems.error ?? grantTestChests.error

  return (
    <Screen title="Testing" hint="Faucets for currencies with no earn path in v1.">
      <div className="space-y-3">
        <Panel title="Account">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-400">Gold</dt>
            <dd className="tabular-nums">{profile?.gold?.toLocaleString('en-US') ?? '—'}</dd>
            <dt className="text-ink-400">Gems</dt>
            <dd className="tabular-nums">{profile?.gems?.toLocaleString('en-US') ?? '—'}</dd>
            <dt className="text-ink-400">Run slots</dt>
            <dd className="tabular-nums">{profile?.run_slots ?? '—'}</dd>
          </dl>
        </Panel>

        <Panel title="Faucets">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-card border border-gold-500/60 px-3 py-2 text-xs font-medium text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={grantTestGems.isPending}
              onClick={() => grantTestGems.mutate(100)}
            >
              {grantTestGems.isPending ? 'Granting...' : 'Grant 100 gems'}
            </button>
            <button
              type="button"
              className="rounded-card border border-gold-500/60 px-3 py-2 text-xs font-medium text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={grantTestChests.isPending}
              onClick={() => grantTestChests.mutate(10)}
            >
              {grantTestChests.isPending ? 'Granting...' : 'Grant 10 chests'}
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Gems buy the wait back on a running dungeon; chests open in the Vault.
          </p>
          {error ? <p className="mt-3 text-xs text-faction-ember">{error.message}</p> : null}
        </Panel>
      </div>
    </Screen>
  )
}
