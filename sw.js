// BOOM Service Worker — minimal
// Network-first for HTML/API (always fresh).
// Cache-first for static assets (icons, manifest).
// Skips Firebase / EmailJS / 3rd-party traffic entirely.

const CACHE_VERSION = 'boom-v19';
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

// ── IL TETTO SULLA RETE, IN UNA COPIA SOLA ──────────────────────────────
// LA LEZIONE DEL 4 SETTEMBRE 2026. La shell del portale aveva questo tetto
// dal giorno dello spinner infinito; TUTTE LE ALTRE navigazioni no — /login
// compreso. Su Safari, in una finestra vecchia con molte schede, una fetch
// può restare appesa per minuti (il pool di connessioni per host è esaurito
// e la richiesta non parte nemmeno): il service worker aveva già preso
// l'impegno con respondWith, quindi il browser aspetta LUI, e la pagina non
// arriva mai. Nessun errore, nessun log, nessun JS: solo caricamento — che è
// esattamente quello che l'operatore descriveva, e il motivo per cui in
// /api/log non c'era niente da leggere.
//
// Tre regole, tutte scritte perché non si perdano:
//  1. IL TETTO NON ANNULLA LA RETE, smette solo di aspettarla. La risposta,
//     quando arriva, aggiorna comunque la cache per la volta dopo.
//  2. SENZA UNA COPIA IN CACHE SI CONTINUA AD ASPETTARE — identico a prima.
//     Per una pagina mai vista, aspettare batte un errore.
//  3. UNA RISPOSTA `no-store` NON SI SALVA MAI. È l'istruzione del server
//     sulle superfici autenticate, e una shell privata in cache è sia una
//     fuga di dati sia il rischio di servire uno stato vecchio. (portal.html
//     resta l'eccezione dichiarata: la sua copia è il fallback offline,
//     scelta presa il giorno dello spinner e documentata qui sopra.)
const NET_CAP_MS = 6000;
const NET_HARD_MS = 20000;   // oltre questo, su una navigazione, si parla

async function netFirstCapped(request, cache, key, capMs, alwaysCache, hardMs) {
    const net = fetch(request).then((res) => {
        const noStore = res && res.headers && /no-store/i.test(res.headers.get('cache-control') || '');
        if (res && res.ok && !res.redirected && (alwaysCache || !noStore)) {
            cache.put(key, res.clone()).catch(() => null);
        }
        return res;
    });
    // la rete continua anche dopo il tetto: la cache si aggiorna lo stesso
    const winner = await Promise.race([
        net.catch(() => 'NET_FAIL'),
        new Promise((r) => setTimeout(() => r('NET_SLOW'), capMs))
    ]);
    if (winner !== 'NET_FAIL' && winner !== 'NET_SLOW') return winner;
    const cached = (await cache.match(key)) || (await cache.match(key, { ignoreSearch: true }));
    if (cached) return cached;
    // Mai vista prima: si aspetta la rete — ma non per sempre. Su una
    // navigazione, oltre il limite duro si consegna una pagina che DICE cosa
    // sta succedendo e offre il tasto Riprova: è la stessa dottrina della
    // scialuppa del portale, mai una rotella eterna senza uscita. Se la rete
    // risponde prima, vince lei; se risponde dopo, ha comunque aggiornato la
    // cache e il Riprova parte dalla copia.
    if (!hardMs) return net;
    const finale = await Promise.race([
        net.catch(() => null),
        new Promise((r) => setTimeout(() => r('GIVE_UP'), Math.max(0, hardMs - capMs)))
    ]);
    if (finale && finale !== 'GIVE_UP') return finale;
    return new Response(PAGINA_RETE_FERMA, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

// La pagina di ultima istanza: nessuna dipendenza, nessun font, nessuna
// immagine — deve poter comparire proprio quando la rete non consegna niente.
const PAGINA_RETE_FERMA = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Rete lenta — BOOM</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08080A;color:#fff;font-family:-apple-system,system-ui,sans-serif">
<div style="max-width:330px;text-align:center;padding:24px">
<div style="font-size:34px;margin-bottom:14px">&#128246;</div>
<div style="font-size:15px;margin-bottom:8px">La rete non risponde</div>
<div style="color:#999;font-size:13px;line-height:1.55;margin-bottom:20px">La pagina non &egrave; arrivata in tempo. Succede su una finestra rimasta aperta a lungo con molte schede: prova a ricaricare, oppure chiudi la scheda e riaprila.</div>
<button onclick="location.reload()" style="width:100%;padding:13px;background:#D4AF37;color:#08080A;border:0;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer">Riprova</button>
</div></body></html>`;

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
    const portalAsset = (url.pathname === '/portal.html' || url.pathname === '/portal')
        ? '/portal.html'
        : ((url.pathname === '/js/portal-app.js' || url.pathname === '/css/portal.css'
            // la regola della disponibilità è logica del portale, non un asset:
            // una copia stantia mostrerebbe finestre orarie che non sono più quelle
            || url.pathname === '/js/viewing-availability.js'
            // M2/D1: i layer mobile e desktop sono logica del portale come
            // portal-app.js — una copia stantia disegnerebbe una shell
            // vecchia sopra un'app nuova
            || url.pathname === '/js/portal-mobile.js'
            || url.pathname === '/css/portal-mobile.css'
            || url.pathname === '/js/portal-actions.js'
            || url.pathname === '/js/oggi-engine.js'
            // il motore dell'Innesto/Bonifica è logica del portale: una copia
            // stantia farebbe divergere merge/validazioni dalla pagina che le usa
            || url.pathname === '/js/dataops-engine.js'
            || url.pathname === '/js/portal-desktop.js'
            || url.pathname === '/css/portal-desktop.css'
            || url.pathname === '/css/portal-finish.css') ? url.pathname : null);
    if (portalAsset) {
        // alwaysCache: la shell del portale si salva ANCHE se no-store —
        // è l'eccezione dichiarata, la sua copia è il fallback offline.
        event.respondWith(
            caches.open(STATIC_CACHE).then((cache) =>
                netFirstCapped(event.request, cache, portalAsset, NET_CAP_MS, true))
        );
        return;
    }

    // Le API non si toccano: nessun tetto, nessuna cache. Una chiamata come
    // /api/portal/ingest dura legittimamente 45 secondi, e servire una
    // risposta vecchia a una API sarebbe peggio dell'attesa.
    if (url.pathname.startsWith('/api/')) return;

    // OGNI ALTRA navigazione (clean URL compresi: /login, /apartments,
    // /listing/x) — rete preferita col tetto condiviso. Prima era
    // `fetch(...).catch(...)`: senza tetto, e per giunta con un fallback che
    // NON POTEVA MAI SCATTARE, perché nessuno metteva in cache queste
    // risposte — `caches.match` mancava sempre e il .catch() risolveva a
    // undefined, cioè un errore di rete al posto della pagina.
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
        event.respondWith(
            caches.open(STATIC_CACHE).then((cache) =>
                netFirstCapped(event.request, cache, event.request, NET_CAP_MS, false, NET_HARD_MS))
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
