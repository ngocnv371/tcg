import { useQuery } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Material, PlayerMaterial } from '@/types/db'

export type InventoryRow = PlayerMaterial & { material: Material | null }

/** The player's own materials, oldest ids first so the vault list is stable. */
export function useInventory() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['inventory', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<InventoryRow[]> => {
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

/** Catalog: material names and tiers. Seeded, read-only, same for every player. */
export function useMaterialCatalog() {
  return useQuery({
    queryKey: ['materials'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase.from('materials').select('*').order('tier')
      if (error) throw error
      return (data ?? []) as Material[]
    },
  })
}
