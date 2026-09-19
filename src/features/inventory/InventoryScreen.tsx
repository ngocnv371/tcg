import { Panel, Screen } from '@/components/Screen'
import { useInventory } from '@/features/inventory/api'

export function InventoryScreen() {
  const { data: inventory, error } = useInventory()

  return (
    <Screen title="Vault" week="Built in week 8" hint="Materials, shards and run rewards.">
      {error ? (
        <Panel>
          <p className="text-sm text-faction-ember">
            No database yet — run <code>npm run db:start</code> then <code>npm run db:reset</code>.
          </p>
        </Panel>
      ) : null}

      {inventory?.length ? (
        <ul className="space-y-2">
          {inventory.map((row) => (
            <li
              key={row.material_id}
              className="flex items-center justify-between rounded-card border border-ink-800 bg-ink-900/70 px-3 py-2 text-sm"
            >
              <span className="text-ink-100">{row.material?.name ?? row.material_id}</span>
              <span className="tabular-nums text-ink-400">
                {row.qty}
                {row.material ? ` · t${row.material.tier}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Panel>
          <p className="text-sm text-ink-400">
            Empty. Materials arrive with the first dungeon clear (week 6).
          </p>
        </Panel>
      )}
    </Screen>
  )
}
