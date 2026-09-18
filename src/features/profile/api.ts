import { useQuery } from '@tanstack/react-query'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/db'

export const profileKey = (userId: string | undefined) => ['profile', userId] as const

/** The signed-in player's row. Forced by the `handle_new_user` trigger. */
export function useProfile() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: profileKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })
}
