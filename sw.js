// BOOM Service Worker — minimal
// Network-first for HTML/API (always fresh).
// Cache-first for static assets (icons, manifest).
// Skips Firebase / EmailJS / 3rd-party traffic entirely.

const CACHE_VERSION = 'boom-v10';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
// NB: portal.html NON è nel precache — il sito pubblico registra questo SW e
// non deve scaricare 2.5MB di shell in background. Il portale entra in cache
// a runtime (stale-while-revalidate sotto) alla prima visita autenticata,
// oppure viene pre-scaldato dalla pagina /login mentre l'utente digita.
const STATIC_ASSETS = [
    '/manifest.json',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png',
    '/assets/icons/icon-512-maskable.png',
    '/assets/icons/apple-touch-icon-180.png',
    '/assets/icons/apple-touch-icon-152.png',
    '/assets/icons/apple-touch-icon-120.png',
    '/assets/icons/favicon-16.png',
    '/assets/icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => null))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Skip 3rd-party (Firebase, EmailJS, fonts, CDN)
    const skipHosts = ['firebaseio.com', 'firestore.googleapis.com', 'googleapis.com',
                       'gstatic.com', 'firebasestorage.app', 'emailjs.com',
                       'fonts.googleapis.com', 'fonts.gstatic.com',
                       'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
    if (skipHosts.some(h => url.hostname.includes(h))) return;

    // portal.html (2.28 MB shell) — NETWORK-FIRST, cache solo come fallback
    // offline. Mai servire la shell dalla cache quando la rete c'è: una copia
    // stantia della logica di auth può restare intrappolata (un redirect loop
    // abortisce l'aggiornamento in background prima che i 2.28MB arrivino) e
    // il browser non riceverebbe mai il codice corretto. Il costo è il
    // download a ogni apertura del portale — lo stesso che il browser farebbe
    // comunque (il server manda Cache-Control: no-store) — mitigato dal
    // pre-warm della pagina /login che riempie il fallback offline.
    if (url.pathname === '/portal.html' || url.pathname === '/portal') {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async (cache) => {
                try {
                    const res = await fetch(event.request);
                    if (res && res.ok && !res.redirected) {
                        cache.put('/portal.html', res.clone()).catch(() => null);
                    }
                    return res;
                } catch (e) {
                    const cached = await cache.match('/portal.html');
                    if (cached) return cached;
                    throw e;
                }
            })
        );
        return;
    }

    // Network-first for OTHER page navigations and HTML/API (always fresh).
    // request.mode === 'navigate' covers clean URLs (/apartments, /listing/x,
    // /) that don't end in .html, so a new deploy is reflected immediately;
    // the cache is used only as an offline fallback.
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for declared static assets
    if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/assets/icons/')) {
        event.respondWith(
            caches.match(event.request).then((cached) => cached || fetch(event.request))
        );
        return;
    }

    // Default: network only (let browser handle). Don't intercept.
});

// Push notifications (optional, kept for future)
self.addEventListener('push', (event) => {
    if (!event.data) return;
    let data;
    try { data = event.data.json(); }
    catch (_) { data = { title: 'BOOM', body: event.data.text() }; }
    event.waitUntil(
        self.registration.showNotification(data.title || 'BOOM', {
            body: data.body || '',
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/icon-192.png',
            data: data.url || '/portal.html'
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wcs) => {
            for (const c of wcs) {
                if (c.url.includes('portal.html') && 'focus' in c) return c.focus();
            }
            return clients.openWindow(event.notification.data || '/portal.html');
        })
    );
});
