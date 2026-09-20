import { useEffect, useState } from 'react'

import { Panel } from '@/components/Screen'
import {
  currentSubscription,
  disableRunNotifications,
  enableRunNotifications,
  pushSupported,
  registerSubscription,
} from '@/lib/push'

type NotificationState = 'loading' | 'unsupported' | 'on' | 'off'

/**
 * Run-finished push toggle.
 *
 * The switch reflects the browser's real PushManager state rather than a server flag, so
 * it can never claim notifications are on when the device has no endpoint behind it.
 */
export function RunNotifications() {
  // Derived at mount rather than in the effect: support cannot change while the screen is
  // open, and setting it synchronously from an effect would render twice.
  const [state, setState] = useState<NotificationState>(() =>
    pushSupported() ? 'loading' : 'unsupported',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pushSupported()) return

    let cancelled = false
    void (async () => {
      try {
        const subscription = await currentSubscription()
        if (cancelled) return
        if (!subscription) {
          setState('off')
          return
        }
        // A subscription outlives a sign-out, so it may still be pointing at whoever was
        // signed in last. Re-registering re-homes it before we claim to be on.
        await registerSubscription(subscription)
        if (!cancelled) setState('on')
      } catch {
        if (!cancelled) setState('off')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (state === 'on') {
        await disableRunNotifications()
        setState('off')
      } else {
        await enableRunNotifications()
        setState('on')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change notification settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Notifications">
      <p className="text-sm text-ink-400">
        {state === 'loading' && 'Checking this device…'}
        {state === 'unsupported' &&
          'This browser cannot receive push. Install the app to your home screen on a phone to get run alerts.'}
        {state === 'on' && 'We will ping you when a run finishes.'}
        {state === 'off' &&
          'Get a notification the moment a run resolves, even with the app closed.'}
      </p>

      {state === 'on' || state === 'off' ? (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="mt-3 rounded-card bg-gold-500 px-3 py-2 text-xs font-medium text-ink-950 disabled:opacity-50"
        >
          {state === 'on' ? 'Turn off notifications' : 'Turn on notifications'}
        </button>
      ) : null}

      {error ? <p className="mt-3 text-xs text-faction-ember">{error}</p> : null}
    </Panel>
  )
}
