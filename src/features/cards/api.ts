import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Card, PlayerCard, RankCost } from '@/types/db'

/** Catalog: seeded, read-only, identical for every player. */
export function useCardCatalog() {
  return useQuery({
    queryKey: ['cards'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase.from('cards').select('*').order('rank', { ascending: true })
      if (error) throw error
      return (data ?? []) as Card[]
    },
  })
}

/** The player's own collection. */
export function useCollection() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['player_cards', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PlayerCard[]> => {
      const { data, error } = await supabase
        .from('player_cards')
        .select('*')
        .order('obtained_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PlayerCard[]
    },
  })
}

/** The rank-up ladder for one catalog card — public data, so it loads without a session. */
export function useRankCosts(cardId: string | undefined) {
  return useQuery({
    queryKey: ['card_rank_costs', cardId],
    enabled: Boolean(cardId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RankCost[]> => {
      const { data, error } = await supabase
        .from('card_rank_costs')
        .select('*')
        .eq('card_id', cardId!)
        .order('to_rank')
      if (error) throw error
      return (data ?? []) as RankCost[]
    },
  })
}

/**
 * Spends gold and materials to move one owned copy up a rank. The cost is never sent
 * from here: `rank_up_card` re-reads `card_rank_costs` and rejects the call when the
 * balance is short, so a stale screen can't buy a rank it can't afford.
 */
export function useRankUpCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (playerCardId: string) => {
      const { data, error } = await supabase.rpc('rank_up_card', { p_player_card_id: playerCardId })
      if (error) throw error
      return data as PlayerCard
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['player_cards'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
