/*
 * Run-finished push handling.
 *
 * Imported into the Workbox-generated service worker (see vite.config.ts →
 * `workbox.importScripts`) rather than replacing it. The generated worker owns precaching
 * of the app shell; this file only adds the two events Workbox knows nothing about.
 *
 * Classic script, not a module: `importScripts` cannot load ES modules.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // A push service will not tell us what it sent; fall back to the raw text.
    payload = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'TCG 2', {
      body: payload.body || 'A run has finished.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Collapses a run's messages into one if the queue ever duplicates, and gives the
      // click handler somewhere to go.
      tag: payload.tag || 'run-finished',
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin,
  ).href

  event.waitUntil(
    (async () => {
      // Focus a tab that is already on the hub rather than stacking a second one; an
      // installed PWA usually has one window and opening another looks like a bug.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (client.url === target && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    })(),
  )
})
