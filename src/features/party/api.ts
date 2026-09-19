import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Party, PartySlot } from '@/types/db'

export type PartyLoadout = {
  party: Party
  slots: PartySlot[]
}

/**
 * Every party the player owns, in `slot_index` order. RLS scopes both tables to
 * `auth.uid()`, so no profile filter is needed here.
 */
export function useParties() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['parties', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PartyLoadout[]> => {
      const { data: parties, error: partiesError } = await supabase
        .from('parties')
        .select('*')
        .order('slot_index', { ascending: true })
      if (partiesError) throw partiesError

      const rows = (parties ?? []) as Party[]
      if (rows.length === 0) return []

      const { data: slots, error: slotsError } = await supabase
        .from('party_slots')
        .select('*')
        .in(
          'party_id',
          rows.map((party) => party.id),
        )
        .order('slot', { ascending: true })
      if (slotsError) throw slotsError

      const slotsByParty = new Map<string, PartySlot[]>()
      for (const slot of (slots ?? []) as PartySlot[]) {
        const bucket = slotsByParty.get(slot.party_id)
        if (bucket) bucket.push(slot)
        else slotsByParty.set(slot.party_id, [slot])
      }

      return rows.map((party) => ({ party, slots: slotsByParty.get(party.id) ?? [] }))
    },
  })
}

function useInvalidateParties() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['parties'] })
}

export function useSaveParty() {
  const invalidate = useInvalidateParties()

  return useMutation({
    mutationFn: async ({ partyId, playerCardIds }: { partyId: string; playerCardIds: string[] }) => {
      const { data, error } = await supabase.rpc('save_party', {
        p_party_id: partyId,
        p_player_card_ids: playerCardIds,
      })
      if (error) throw error
      return data as PartySlot[]
    },
    onSuccess: invalidate,
  })
}

/** Teams are unlimited, so there is no cap to check before calling this. */
export function useCreateParty() {
  const invalidate = useInvalidateParties()

  return useMutation({
    mutationFn: async (name?: string) => {
      const { data, error } = await supabase.rpc('create_party', { p_name: name ?? null })
      if (error) throw error
      return data as Party
    },
    onSuccess: invalidate,
  })
}

export function useRenameParty() {
  const invalidate = useInvalidateParties()

  return useMutation({
    mutationFn: async ({ partyId, name }: { partyId: string; name: string }) => {
      const { data, error } = await supabase.rpc('rename_party', {
        p_party_id: partyId,
        p_name: name,
      })
      if (error) throw error
      return data as Party
    },
    onSuccess: invalidate,
  })
}

export function useDeleteParty() {
  const invalidate = useInvalidateParties()

  return useMutation({
    mutationFn: async (partyId: string) => {
      const { error } = await supabase.rpc('delete_party', { p_party_id: partyId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
