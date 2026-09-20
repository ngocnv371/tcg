// Run-finished push sender.
//
// The browser can register an endpoint, but only a server can hold the VAPID private key
// and reach the push service. The database has already decided *whether* to notify: the
// moment a run resolves, 20260915000003_notifications.sql queues an outbox row, keyed by
// run id so `resolve_runs()` looking at the run again cannot queue a second one. This
// function only drains that queue.
//
// Deploy:
//   supabase functions deploy notify-runs --no-verify-jwt
// Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:you@example.com,
//   NOTIFY_CRON_SECRET
// Schedule: invoke every minute (Supabase scheduled functions, or pg_cron + pg_net).
//   Generate the key pair with: npx web-push generate-vapid-keys
//
// Failure handling: a row is marked sent only after the push service accepts it, so a
// crash mid-run leaves it pending and it is retried. A row whose attempts hit the cap
// (see `pending_notifications`) parks with its last error instead of retrying forever.
// Endpoints answering 404/410 are retired, because a push service only says that for a
// subscription the browser has already thrown away.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com'
const CRON_SECRET = Deno.env.get('NOTIFY_CRON_SECRET')

const BATCH_SIZE = 50

type PushToken = { endpoint: string; p256dh: string; auth: string }

type PendingNotification = {
  id: number
  profile_id: string
  title: string
  body: string
  url: string
  endpoints: PushToken[]
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (CRON_SECRET && request.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set' }, 500)
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('pending_notifications', { p_limit: BATCH_SIZE })
  if (error) return json({ error: error.message }, 500)

  const pending = (data ?? []) as PendingNotification[]
  const retired = new Set<string>()
  let delivered = 0

  for (const notification of pending) {
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: notification.url,
      tag: `run-finished-${notification.id}`,
    })

    const failures: string[] = []

    for (const token of notification.endpoints) {
      try {
        await webpush.sendNotification(
          { endpoint: token.endpoint, keys: { p256dh: token.p256dh, auth: token.auth } },
          payload,
        )
        delivered += 1
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) retired.add(token.endpoint)
        failures.push(`${status ?? 'error'}: ${(cause as Error).message}`)
      }
    }

    // One device accepting the message is enough to stop retrying: the player has been
    // told. Only an all-endpoints failure leaves the row pending.
    const allFailed = notification.endpoints.length > 0 && failures.length === notification.endpoints.length
    await supabase.rpc('mark_notification_sent', {
      p_id: notification.id,
      p_error: allFailed ? failures.join(' | ') : null,
    })
  }

  if (retired.size > 0) {
    await supabase.rpc('disable_notification_tokens', { p_endpoints: [...retired] })
  }

  return json({ pending: pending.length, delivered, retired: retired.size })
})
