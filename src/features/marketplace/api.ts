import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Chest, MarketTransaction } from '@/types/db'

/** The chest catalog with its marketplace prices; readable by anyone. */
export function useChestCatalog() {
  return useQuery({
    queryKey: ['chests'],
    queryFn: async (): Promise<Chest[]> => {
      const { data, error } = await supabase.from('chests').select('*').order('tier')
      if (error) throw error
      return (data ?? []) as Chest[]
    },
  })
}

/** The signed-in player's purchase ledger, newest first. */
export function useMarketTransactions() {
  const userId = useSession().session?.user.id

  return useQuery({
    queryKey: ['market_transactions', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<MarketTransaction[]> => {
      const { data, error } = await supabase
        .from('market_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as MarketTransaction[]
    },
  })
}

/**
 * Buy chests with gems. The server prices the order from `chests.gem_price`; the client only
 * names the chest and quantity. Returns the ledger row it wrote.
 */
export function useBuyChest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ chestId, qty }: { chestId: string; qty: number }) => {
      const { data, error } = await supabase.rpc('buy_chest', {
        p_chest_id: chestId,
        p_qty: qty,
      })
      if (error) throw error
      return data as MarketTransaction
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['chest_inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['market_transactions'] })
    },
  })
}
