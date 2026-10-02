import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Quest, QuestCompletion } from '@/types/db'

/** The payload `complete_quest` returns: what was paid, and whether it was the first clear. */
export type QuestClear = {
  quest_id: string
  first_clear: boolean
  clears: number
  rewards: { gold: number; materials: Record<string, number> }
  /** The enemy card this clear dropped, if the server roll hit. */
  card: { card_id: string; player_card_id: string } | null
}

/** The quest catalog. Seeded content, identical for every player, so it never goes stale. */
export function useQuests() {
  return useQuery({
    queryKey: ['quests'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Quest[]> => {
      const { data, error } = await supabase.from('quests').select('*').order('sort_order')
      if (error) throw error
      return (data ?? []) as Quest[]
    },
  })
}

/** How often the player has cleared each quest (one row per cleared quest). */
export function useQuestCompletions() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['quest_completions', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<QuestCompletion[]> => {
      const { data, error } = await supabase.from('quest_completions').select('*')
      if (error) throw error
      return (data ?? []) as QuestCompletion[]
    },
  })
}

/**
 * Claims a clear. The client only names the quest and the party it fought with — the reward
 * is re-read server-side from `quests`, so a win is never a client-authored payout. Called
 * after the battle is won; a loss never reaches the server.
 */
export function useCompleteQuest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ questId, partyId }: { questId: string; partyId: string }) => {
      const { data, error } = await supabase.rpc('complete_quest', {
        p_quest_id: questId,
        p_party_id: partyId,
      })
      if (error) throw error
      return data as QuestClear
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quest_completions'] })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      // A clear can drop a card, so the collection may have grown.
      void queryClient.invalidateQueries({ queryKey: ['player_cards'] })
    },
  })
}
