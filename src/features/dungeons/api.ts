import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useSession } from '@/features/auth/useSession'
import { supabase } from '@/lib/supabase'
import type { Dungeon, DungeonRun } from '@/types/db'

export function useDungeons() {
  return useQuery({
    queryKey: ['dungeons'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Dungeon[]> => {
      const { data, error } = await supabase.from('dungeons').select('*').order('req_power')
      if (error) throw error
      return (data ?? []) as Dungeon[]
    },
  })
}

/** Query only. The shell owns the one realtime channel and the on-load resolve (useRunSync). */
export function useRuns() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['dungeon_runs', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DungeonRun[]> => {
      const { data, error } = await supabase
        .from('dungeon_runs')
        .select('*')
        .order('ends_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as DungeonRun[]
    },
  })
}

/**
 * Mounted exactly once, by the shell. Supabase throws if a second `postgres_changes` listener
 * is added to a channel that already subscribed, so the subscription cannot live in `useRuns`:
 * the wizard, Home and the dungeon map all read runs at the same time. One channel per session
 * also means one `resolve_runs()` on load, not one per screen.
 */
export function useRunSync() {
  const { session } = useSession()
  const userId = session?.user.id
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`dungeon-runs:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dungeon_runs', filter: `profile_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['dungeon_runs', userId] })
        },
      )
      .subscribe()

    void supabase.rpc('resolve_runs')

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, userId])
}
