import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Card, PlayerCard } from '@/types/db'

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

/**
 * Rank one owned copy up by feeding it duplicate copies of the same card. The cost is never
 * sent from here: `rank_up_card` computes the required value from the rank and re-validates
 * the fodder server-side, so a stale screen can't buy a rank it can't afford. An empty
 * `fodderIds` makes the server pick the cheapest covering set.
 */
export function useRankUpCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      playerCardId,
      fodderIds = [],
    }: {
      playerCardId: string
      fodderIds?: string[]
    }) => {
      const { data, error } = await supabase.rpc('rank_up_card', {
        p_player_card_id: playerCardId,
        p_fodder_ids: fodderIds,
      })
      if (error) throw error
      return data as PlayerCard
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['player_cards'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}

export type CardStat = 'atk' | 'hp' | 'def' | 'spd'

/**
 * Buy one stat level on one owned copy with gold + the card's tag Cores. `level_up_stat`
 * re-reads the price and the Core list inside the transaction, so the client never sends a
 * cost — only which copy and which stat.
 */
export function useLevelUpStat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ playerCardId, stat }: { playerCardId: string; stat: CardStat }) => {
      const { data, error } = await supabase.rpc('level_up_stat', {
        p_player_card_id: playerCardId,
        p_stat: stat,
      })
      if (error) throw error
      return data as PlayerCard
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['player_cards'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}
