import { useQuery } from '@tanstack/react-query'

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
