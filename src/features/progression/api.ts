import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { ChestInventoryRow, DungeonRun } from '@/types/db'

export type ChestOpening = {
  card_id: string
  card_name: string
  rank: number
  was_new: boolean
  shard_material: string | null
  shard_qty: number
}

export type RunClaim = {
  success: boolean
  rewards: DungeonRun['rewards']
}

function usePlayerId() {
  return useSession().session?.user.id
}

export function useChestInventory() {
  const userId = usePlayerId()

  return useQuery({
    queryKey: ['chest_inventory', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ChestInventoryRow[]> => {
      const { data, error } = await supabase
        .from('chest_inventory')
        .select('*')
        .order('granted_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ChestInventoryRow[]
    },
  })
}

export function useClaimDailyChest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('claim_daily_chest')
      if (error) throw error
      return data as ChestInventoryRow
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chest_inventory'] }),
  })
}

export function useOpenChest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inventoryId: string) => {
      const { data, error } = await supabase.rpc('open_chest', { p_inventory_id: inventoryId })
      if (error) throw error
      return data as ChestOpening
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chest_inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['player_cards'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useStartRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ dungeonId, partyId }: { dungeonId: string; partyId?: string }) => {
      const { data, error } = await supabase.rpc('start_run', {
        p_dungeon_id: dungeonId,
        p_party_id: partyId ?? null,
      })
      if (error) throw error
      return data as DungeonRun
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dungeon_runs'] }),
  })
}

export function useClaimRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await supabase.rpc('claim_run', { p_run_id: runId })
      if (error) throw error
      return data as RunClaim
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dungeon_runs'] })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['chest_inventory'] })
    },
  })
}