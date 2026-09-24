import { Panel, Screen } from '@/components/Screen'
import { useInventory, type InventoryRow } from '@/features/inventory/api'
import { MaterialIcon } from '@/features/inventory/MaterialIcon'
import { CORE_VARIANT_LABELS, CORE_VARIANTS } from '@/game/formulas'
import type { MaterialKind } from '@/types/db'

/** Cores are what a rank-up actually spends, so they lead the vault. */
const KIND_ORDER: MaterialKind[] = ['core', 'shard', 'essence', 'ore', 'crystal']

const KIND_LABELS: Record<MaterialKind, string> = {
  core: 'Cores',
  shard: 'Shards',
  essence: 'Essences',
  ore: 'Ores',
  crystal: 'Crystals',
}

/**
 * Cores carry their grade in `tier` (1 lesser … 4 legendary), so the vault can label
 * them without a second lookup. Null for any other material kind.
 */
function coreGradeLabel(row: InventoryRow): string | null {
  if (row.material?.kind !== 'core') return null
  const variant = CORE_VARIANTS[row.material.tier - 1]
  return variant ? CORE_VARIANT_LABELS[variant] : null
}

export function InventoryScreen() {
  const { data: inventory, error } = useInventory()

  // Cheapest grade first inside a group, so the one a player is short of sits at the top.
  const rows = [...(inventory ?? [])].sort((a, b) => {
    const byTier = (a.material?.tier ?? 0) - (b.material?.tier ?? 0)
    if (byTier !== 0) return byTier
    return (a.material?.name ?? a.material_id).localeCompare(b.material?.name ?? b.material_id)
  })

  const groups = new Map<MaterialKind, InventoryRow[]>()
  for (const row of rows) {
    const kind = row.material?.kind
    if (!kind) continue
    groups.set(kind, [...(groups.get(kind) ?? []), row])
  }

  return (
    <Screen
      title="Vault"
      hint="Cores come from dungeons — farm the ones a card's tags need to rank it up."
    >
      {error ? (
        <Panel>
          <p className="text-sm text-faction-ember">
            No database yet — run <code>npm run db:start</code> then <code>npm run db:reset</code>.
          </p>
        </Panel>
      ) : null}

      {rows.length ? (
        <div className="space-y-3">
          {KIND_ORDER.filter((kind) => groups.has(kind)).map((kind) => (
            <Panel key={kind} title={`${KIND_LABELS[kind]} (${groups.get(kind)?.length ?? 0})`}>
              <ul className="space-y-2">
                {groups.get(kind)?.map((row) => {
                  const grade = coreGradeLabel(row)
                  return (
                    <li
                      key={row.material_id}
                      className="flex items-center justify-between gap-3 rounded-card border border-ink-800 bg-ink-900/70 px-3 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <MaterialIcon material={row.material} size={28} />
                        <span className="truncate text-ink-100">
                          {row.material?.name ?? row.material_id}
                        </span>
                        {grade ? (
                          <span className="shrink-0 rounded-card bg-ink-850 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gold-300">
                            {grade}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-400">{row.qty}</span>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <p className="text-sm text-ink-400">
            Empty. Clear a dungeon to start filling the vault — open the dungeons screen and tap{' '}
            <span className="text-ink-200">Resources</span> to see what each one yields.
          </p>
        </Panel>
      )}
    </Screen>
  )
}
