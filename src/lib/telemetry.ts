import { supabase } from '@/lib/supabase'

/**
 * Client-side telemetry.
 *
 * The server accepts only the names listed here (`track_event` raises on anything else).
 * Every progression metric the tuning pass needs — pulls, runs started/resolved/claimed,
 * card grants, rank-ups — is logged by database triggers instead, because a client that
 * can name its own events can also name `card_ranked_up`. These are the lifecycle events
 * no table can observe on its own, and they are the only rows the client can write.
 *
 * Sends are fire-and-forget: telemetry must never be the reason a tap does nothing.
 */
export const CLIENT_EVENTS = ['app_open', 'screen_view'] as const
export type ClientEvent = (typeof CLIENT_EVENTS)[number]

export function track(name: ClientEvent, props: Record<string, unknown> = {}): void {
  try {
    void supabase.rpc('track_event', { p_name: name, p_props: props }).then(undefined, () => {})
  } catch {
    // An unreachable database is a telemetry gap, not a broken session.
  }
}
