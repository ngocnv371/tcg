import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Party, PartySlot } from '@/types/db'

export type PartyLoadout = {
  party: Party
  slots: PartySlot[]
}

export function useParty() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['parties', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PartyLoadout | null> => {
      const { data: party, error: partyError } = await supabase
        .from('parties')
        .select('*')
        .eq('profile_id', userId!)
        .eq('slot_index', 1)
        .maybeSingle()
      if (partyError) throw partyError
      if (!party) return null

      const { data: slots, error: slotsError } = await supabase
        .from('party_slots')
        .select('*')
        .eq('party_id', party.id)
        .order('slot', { ascending: true })
      if (slotsError) throw slotsError

      return { party: party as Party, slots: (slots ?? []) as PartySlot[] }
    },
  })
}

export function useSaveParty() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ partyId, playerCardIds }: { partyId: string; playerCardIds: string[] }) => {
      const { data, error } = await supabase.rpc('save_party', {
        p_party_id: partyId,
        p_player_card_ids: playerCardIds,
      })
      if (error) throw error
      return data as PartySlot[]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parties'] }),
  })
}
