import { useQuery } from '@tanstack/react-query'

import { Panel, Screen } from '@/components/Screen'
import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Material, PlayerMaterial } from '@/types/db'

function useInventory() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['inventory', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Array<PlayerMaterial & { material: Material | null }>> => {
      const { data, error } = await supabase
        .from('player_materials')
        .select('profile_id, material_id, qty, material:materials(*)')
        .order('material_id')
      if (error) throw error

      // PostgREST types an embedded to-one relation as an array even when the
      // foreign key is singular, so normalise it here.
      type Row = {
        profile_id: string
        material_id: string
        qty: number
        material: Material | Material[] | null
      }
      return ((data ?? []) as unknown as Row[]).map((row) => ({
        profile_id: row.profile_id,
        material_id: row.material_id,
        qty: row.qty,
        material: Array.isArray(row.material) ? (row.material[0] ?? null) : row.material,
      }))
    },
  })
}

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
