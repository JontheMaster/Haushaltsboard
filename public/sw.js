// Service Worker: zeigt Erinnerungen vom Haushaltsboard an (Web Push). Sonst nichts – kein Offline-Cache.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { title: 'Haushaltsboard', body: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Haushaltsboard', {
      body: data.body || '',
      tag: data.tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: data.url || './' },
    }),
  )
})

// Antippen öffnet die App (oder holt das offene Fenster nach vorn).
// Wochenrückblick (?rueckblick): das offene Fenster bekommt Bescheid und öffnet ihn.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || './'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if (url.includes('rueckblick')) c.postMessage({ open: 'rueckblick' })
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
