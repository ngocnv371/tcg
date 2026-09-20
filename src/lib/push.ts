import { supabase } from '@/lib/supabase'

/**
 * Web push for "your run finished".
 *
 * The browser can only ever register or drop an endpoint here. Whether a run is worth
 * notifying about is decided in the database, on the same transition that resolves the run
 * (`20260915000003_notifications.sql`), so a client cannot announce a run that never
 * happened. Sending needs the VAPID private key, which is why it lives in
 * `supabase/functions/notify-runs` and never in this bundle.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** Push needs a service worker, a PushManager, permission support and a compiled-in key. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  )
}

/**
 * The VAPID key is base64url; `subscribe` wants the raw bytes. Typed explicitly as
 * `Uint8Array<ArrayBuffer>` because `applicationServerKey` rejects a view over a
 * SharedArrayBuffer, which is what a bare `Uint8Array` widens to.
 */
function decodeVapidKey(key: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (key.length % 4)) % 4)
  const base64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

/**
 * Hand the endpoint to the server. Exported because a subscription outlives a sign-out: on
 * load we re-register whatever the browser already holds, which re-homes a shared phone's
 * endpoint to the account signed in now.
 */
export async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const keys = subscription.toJSON().keys ?? {}
  const { error } = await supabase.rpc('register_notification_token', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh ?? '',
    p_auth: keys.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

export async function enableRunNotifications(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser cannot receive notifications.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for this app.')

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(VAPID_PUBLIC_KEY ?? ''),
    }))

  await registerSubscription(subscription)
}

export async function disableRunNotifications(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return

  const { error } = await supabase.rpc('unregister_notification_token', {
    p_endpoint: subscription.endpoint,
  })
  if (error) throw error

  // Drop the browser side too, so the next enable starts from the permission prompt
  // rather than silently reusing an endpoint the server has already retired.
  await subscription.unsubscribe()
}
