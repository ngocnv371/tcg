import { Panel, Planned, Screen } from '@/components/Screen'
import { CHEST_ODDS } from '@/game/formulas'

const CHESTS = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const

export function ChestOpenScreen() {
  return (
    <Screen title="Chests" week="Built in week 4" hint="One free Common per day; the rest drop from runs.">
      <div className="space-y-3">
        <Panel title="Published odds">
          <ul className="space-y-1.5 text-xs">
            {CHESTS.map((chest) => (
              <li key={chest} className="flex items-baseline justify-between gap-2">
                <span className="capitalize text-ink-100">{chest}</span>
                <span className="tabular-nums text-ink-400">
                  {Object.entries(CHEST_ODDS[chest])
                    .map(([rank, weight]) => `${rank}★ ${weight}%`)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-600">
            The client never rolls. Opening calls the <code>open_chest</code> function and writes the
            result to <code>pull_history</code>.
          </p>
        </Panel>

        <Panel title="Still to build">
          <Planned
            items={[
              'Chest reveal animation + haptics + particle burst on 4★/5★',
              'Duplicate → shard conversion with a clear "worth" readout',
              'Pity counter on the vault header (code hook ships in v1)',
            ]}
          />
        </Panel>
      </div>
    </Screen>
  )
}
