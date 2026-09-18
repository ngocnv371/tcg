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

export function useRuns() {
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
