// BOOM Portal Service Worker v1
const CACHE_NAME = 'boom-v1';
const PRECACHE_URLS = ['/portal.html'];

// Install - precache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate - cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - network-first for API, cache-first for static
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  // Skip Firebase/API requests
  const url = event.request.url;
  if (url.includes('firestore') || url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) {
    return;
  }
  
  // Network-first strategy with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notifications
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'BOOM', body: 'New notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'https://www.boomrome.com/BOOMlogogoldicon512.png',
      badge: 'https://www.boomrome.com/BOOMlogogoldicon512.png',
      vibrate: [200, 100, 200],
      data: data.url || '/portal.html'
    })
  );
});

// Notification click - open portal
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes('portal.html') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(event.notification.data || '/portal.html');
    })
  );
});
