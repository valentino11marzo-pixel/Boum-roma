// tests/rete/run.mjs — LA RETE CHE NON RISPONDE NON DEVE FERMARE LA PAGINA.
//
// LA SEGNALAZIONE DEL 4 SETTEMBRE 2026: «il login da Safari ancora non va,
// caricamento infinito — era una finestra vecchia con tante altre schede».
// E in `/api/log` non c'era NIENTE: nessun errore, nessun rejection. È la
// firma di un guasto che avviene PRIMA che la pagina esista.
//
// La causa: il service worker prendeva l'impegno (`respondWith`) su ogni
// navigazione con una `fetch()` SENZA TETTO. Su Safari, in una finestra con
// molte schede, il pool di connessioni per host è esaurito e la richiesta può
// restare appesa per minuti: il browser aspetta il worker, il worker aspetta
// la rete, e la pagina non arriva mai. La shell del portale aveva il tetto dal
// giorno dello spinner infinito; /login e tutto il resto no.
//
// E c'era un secondo difetto dentro il primo: il fallback offline delle
// navigazioni (`fetch().catch(() => caches.match(...))`) NON POTEVA MAI
// scattare, perché nessuno metteva quelle risposte in cache. `caches.match`
// mancava sempre e il `.catch()` risolveva a `undefined` — cioè un errore di
// rete al posto della pagina, proprio quando la rete mancava.
//
// Qui si guida la strategia VERA estratta da sw.js, con una rete che non
// risponde mai e una cache finta.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── la funzione VERA, estratta dal file in produzione ───────────────────
const m = sw.match(/async function netFirstCapped[\s\S]*?\n}/);
ok(!!m, 'la strategia esiste in sw.js ed è una copia sola');
const pag = sw.match(/const PAGINA_RETE_FERMA = `[\s\S]*?`;/);
ok(!!pag, 'la pagina di ultima istanza vive accanto alla strategia');
const netFirstCapped = new Function('fetch', 'setTimeout', 'Response',
  pag[0] + m[0] + '; return netFirstCapped;')(
    (...a) => globalThis.__fetch(...a), globalThis.setTimeout,
    class { constructor(b, i) { this.body = b; this.status = (i || {}).status; this.headers = { get: (k) => ((i || {}).headers || {})[k] }; } });

const risposta = (body, { ok: o = true, redirected = false, cc = '' } = {}) => ({
  ok: o, redirected, body,
  headers: { get: (k) => (k.toLowerCase() === 'cache-control' ? cc : null) },
  clone() { return this; },
});
function fintaCache(iniziale = {}) {
  const store = new Map(Object.entries(iniziale));
  const key = (k) => (typeof k === 'string' ? k : k.url);
  return {
    store,
    put: async (k, v) => { store.set(key(k), v); },
    match: async (k, opt) => {
      const s = key(k);
      if (store.has(s)) return store.get(s);
      if (opt && opt.ignoreSearch) {
        const nudo = s.split('?')[0];
        for (const [kk, vv] of store) if (kk.split('?')[0] === nudo) return vv;
      }
      return undefined;
    },
  };
}

// ── 1. IL CASO VERO: la rete non risponde MAI ──────────────────────────
{
  globalThis.__fetch = () => new Promise(() => {});   // appesa per sempre
  const cache = fintaCache({ '/login': risposta('LOGIN DALLA CACHE') });
  const t0 = Date.now();
  const res = await netFirstCapped({ url: '/login' }, cache, '/login', 40, false);
  const dt = Date.now() - t0;
  ok(res && res.body === 'LOGIN DALLA CACHE',
    'rete appesa + copia in cache → la pagina di login arriva lo stesso');
  ok(dt < 400, `e arriva entro il tetto (${dt}ms), non «fra qualche minuto»`);
}

// ── 2. Senza copia in cache si aspetta, come prima (nessuna regressione) ─
{
  let risolvi;
  globalThis.__fetch = () => new Promise((r) => { risolvi = r; });
  const cache = fintaCache();
  const p = netFirstCapped({ url: '/mai-vista' }, cache, '/mai-vista', 30, false);
  await new Promise((r) => setTimeout(r, 80));   // il tetto è già scaduto
  let finita = false; p.then(() => { finita = true; });
  await new Promise((r) => setTimeout(r, 10));
  ok(!finita, 'pagina mai vista: si continua ad aspettare la rete invece di dare errore');
  risolvi(risposta('ARRIVATA TARDI'));
  ok((await p).body === 'ARRIVATA TARDI', 'e quando la rete risponde, è quella a vincere');
}

// ── 2b. Ma non si aspetta PER SEMPRE: oltre il limite duro si PARLA ─────
// Stessa dottrina della scialuppa del portale: mai una rotella eterna. Una
// pagina che dice cosa sta succedendo e offre Riprova batte lo schermo vuoto.
{
  globalThis.__fetch = () => new Promise(() => {});
  const cache = fintaCache();
  const t0 = Date.now();
  const res = await netFirstCapped({ url: '/login', mode: 'navigate' }, cache, '/login', 20, false, 60);
  const dt = Date.now() - t0;
  ok(res && res.status === 503 && /Riprova/.test(res.body),
    'rete morta e nessuna copia → una pagina che spiega e offre Riprova, non il vuoto');
  ok(dt < 400, `e si presenta al limite duro (${dt}ms), non «mai»`);
  ok(/La rete non risponde/.test(res.body) && !/https?:\/\//.test(res.body.replace(/w3\.org/g, '')),
    'la pagina non dipende da nulla: nessun font, nessuna immagine, nessuna rete');
}
{
  // e la rete che risponde DENTRO il limite duro vince comunque
  globalThis.__fetch = () => new Promise((r) => setTimeout(() => r(risposta('ARRIVATA')), 40));
  const res = await netFirstCapped({ url: '/x', mode: 'navigate' }, fintaCache(), '/x', 20, false, 300);
  ok(res.body === 'ARRIVATA', 'una connessione lenta ma viva non viene sfrattata dal limite duro');
}

// ── 3. La rete veloce vince sempre (il tetto non rallenta niente) ───────
{
  globalThis.__fetch = async () => risposta('FRESCA');
  const cache = fintaCache({ '/login': risposta('VECCHIA') });
  const res = await netFirstCapped({ url: '/login' }, cache, '/login', 5000, false);
  ok(res.body === 'FRESCA', 'con la rete sana si serve sempre la risposta fresca, mai la cache');
  ok((await cache.match('/login')).body === 'FRESCA', 'e la copia si aggiorna per la volta dopo');
}

// ── 4. Il tetto NON annulla la rete: la cache si aggiorna comunque ──────
{
  let risolvi;
  globalThis.__fetch = () => new Promise((r) => { risolvi = r; });
  const cache = fintaCache({ '/login': risposta('VECCHIA') });
  const res = await netFirstCapped({ url: '/login' }, cache, '/login', 30, false);
  ok(res.body === 'VECCHIA', 'lenta → si parte dalla copia');
  risolvi(risposta('NUOVA'));
  await new Promise((r) => setTimeout(r, 10));
  ok((await cache.match('/login')).body === 'NUOVA',
    'ma la risposta lenta, quando arriva, aggiorna la cache: la prossima apertura è fresca');
}

// ── 5. Una risposta `no-store` non si salva MAI ─────────────────────────
// È l'istruzione del server sulle superfici autenticate: una shell privata
// in cache è una fuga di dati e il rischio di servire uno stato vecchio.
{
  globalThis.__fetch = async () => risposta('PRIVATA', { cc: 'private, no-store, max-age=0' });
  const cache = fintaCache();
  await netFirstCapped({ url: '/casa' }, cache, '/casa', 5000, false);
  ok((await cache.match('/casa')) === undefined,
    'una pagina autenticata (no-store) non finisce in cache');
  // ma la shell del portale è l'eccezione DICHIARATA (alwaysCache)
  const c2 = fintaCache();
  await netFirstCapped({ url: '/portal.html' }, c2, '/portal.html', 5000, true);
  ok((await c2.match('/portal.html')) !== undefined,
    'la shell del portale resta l\'eccezione dichiarata: è il suo fallback offline');
}

// ── 6. Errori e redirect non avvelenano la cache ────────────────────────
{
  globalThis.__fetch = async () => risposta('404', { ok: false });
  const cache = fintaCache({ '/x': risposta('BUONA') });
  const res = await netFirstCapped({ url: '/x' }, cache, '/x', 5000, false);
  ok(res.body === '404' && (await cache.match('/x')).body === 'BUONA',
    'un 404 si consegna ma non sostituisce la copia buona');
  globalThis.__fetch = async () => risposta('REDIR', { redirected: true });
  const c2 = fintaCache();
  await netFirstCapped({ url: '/y' }, c2, '/y', 5000, false);
  ok((await c2.match('/y')) === undefined, 'una risposta redirezionata non si salva');
}

// ── 7. La rete caduta usa la copia ──────────────────────────────────────
{
  globalThis.__fetch = async () => { throw new Error('offline'); };
  const cache = fintaCache({ '/login': risposta('DALLA CACHE') });
  const res = await netFirstCapped({ url: '/login' }, cache, '/login', 5000, false);
  ok(res.body === 'DALLA CACHE', 'offline → la copia salvata (il fallback che prima non esisteva)');
}

// ── 8. `/login?next=…` si serve dalla copia di `/login` ─────────────────
{
  globalThis.__fetch = () => new Promise(() => {});
  const cache = fintaCache({ '/login': risposta('LOGIN') });
  const req = { url: '/login?next=%2Fportal&b=1' };
  const res = await netFirstCapped(req, cache, req, 30, false);
  ok(res && res.body === 'LOGIN',
    'il link con ?next= riusa la copia di /login (la pagina legge il parametro da sola)');
}

// ── 9. Le giunzioni in sw.js ────────────────────────────────────────────
ok(/if \(url\.pathname\.startsWith\('\/api\/'\)\) return;/.test(sw),
  'le API restano fuori: nessun tetto e nessuna cache (un ingest dura 45s legittimi)');
ok(!/respondWith\(\s*\n?\s*fetch\(event\.request\)\.catch/.test(sw),
  'nessuna navigazione resta con la fetch nuda senza tetto');
const navBlock = sw.slice(sw.indexOf("event.request.mode === 'navigate'"), sw.indexOf("event.request.mode === 'navigate'") + 400);
ok(/netFirstCapped\(/.test(navBlock), 'le navigazioni usano la STESSA strategia della shell del portale');
ok(/NET_HARD_MS/.test(navBlock) || /NET_HARD_MS\)/.test(sw),
  'il limite duro è cablato sulle navigazioni (non sugli asset: lì un errore non aiuta nessuno)');
const cacheVersion = /^const CACHE_VERSION = 'boom-v(\d+)';$/m.exec(sw);
ok(cacheVersion && Number(cacheVersion[1]) >= 22,
  'la versione della cache è salita: senza, i browser terrebbero il worker vecchio');

// ── 10. Il handler INTERO: /portal precede il ramo delle navigazioni ─────
// Guidare solo netFirstCapped non basta: il ramo portalAsset può dimenticare
// il limite duro pur lasciando verdi le prove della funzione e di /login.
// Timer e fetch sono sintetici. Non attendiamo mai la risposta direttamente:
// anche rimettendo il difetto, le prove arrivano all'esito invece di bloccarsi.
const scaricaMicrotask = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
class RispostaSW {
  constructor(body, { status = 200, headers = {} } = {}) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.redirected = false;
    this.headerValues = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    this.headers = { get: (k) => this.headerValues[k.toLowerCase()] || null };
  }
  clone() { return new RispostaSW(this.body, { status: this.status, headers: this.headerValues }); }
}
function workerFinto(iniziale = {}) {
  const cache = fintaCache(iniziale), handlers = new Map(), timers = new Map(), rete = [];
  let ora = 0, prossimoTimer = 0, apertureCache = 0;
  const context = createContext({
    URL, Response: RispostaSW,
    self: { addEventListener: (tipo, handler) => handlers.set(tipo, handler) },
    caches: { open: async () => { apertureCache++; return cache; } },
    setTimeout: (callback, delay) => {
      const id = ++prossimoTimer;
      timers.set(id, { callback, scadenza: ora + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: (request) => new Promise((resolve) => {
      const chiamata = { request, finita: false, rispondi: (response) => {
        chiamata.finita = true;
        resolve(response);
      } };
      rete.push(chiamata);
    })
  });
  runInContext(sw, context, { filename: 'sw.js' });
  return {
    cache, rete,
    get apertureCache() { return apertureCache; },
    async chiedi(path, { method = 'GET', mode = 'navigate' } = {}) {
      const stato = { intercettata: false, conclusa: false, risposta: null, errore: null };
      handlers.get('fetch')({
        request: { url: 'https://www.boomrome.com' + path, method, mode },
        respondWith: (promise) => {
          stato.intercettata = true;
          Promise.resolve(promise).then(
            (response) => { stato.conclusa = true; stato.risposta = response; },
            (error) => { stato.conclusa = true; stato.errore = error; }
          );
        }
      });
      await scaricaMicrotask();
      return stato;
    },
    async avanza(ms) {
      const fine = ora + ms;
      await scaricaMicrotask();
      while (true) {
        const prossimo = [...timers].filter(([, t]) => t.scadenza <= fine)
          .sort((a, b) => a[1].scadenza - b[1].scadenza)[0];
        if (!prossimo) break;
        const [id, timer] = prossimo;
        timers.delete(id);
        ora = timer.scadenza;
        timer.callback();
        await scaricaMicrotask();
      }
      ora = fine;
      await scaricaMicrotask();
    },
    async chiudi() {
      // Nessuna fetch/timer resta pendente, nemmeno quando lo SW è regressivo.
      for (const chiamata of rete) if (!chiamata.finita) chiamata.rispondi(new RispostaSW('FINE PROVA', { status: 499 }));
      await scaricaMicrotask();
      timers.clear();
    }
  };
}
for (const path of ['/portal', '/portal.html']) {
  const w = workerFinto(), stato = await w.chiedi(path);
  await w.avanza(19999);
  ok(stato.intercettata && !stato.conclusa, `handler ${path} freddo: concede alla rete tutti i 20 secondi`);
  await w.avanza(1);
  ok(stato.risposta?.status === 503 && /Riprova/.test(stato.risposta.body)
    && /text\/html/.test(stato.risposta.headers.get('content-type')),
    `handler ${path} freddo: a 20 secondi arriva la pagina Riprova`);
  ok(stato.risposta?.headers.get('cache-control') === 'no-store' && w.cache.store.size === 0,
    `handler ${path}: la pagina di recupero non diventa una copia del portale`);
  await w.chiudi();
}
for (const path of ['/portal', '/portal.html']) {
  const w = workerFinto({ '/portal.html': new RispostaSW('PORTALE SALVATO') });
  const stato = await w.chiedi(path);
  await w.avanza(5999);
  const primaDelTetto = !stato.conclusa;
  await w.avanza(1);
  ok(primaDelTetto && stato.risposta?.body === 'PORTALE SALVATO',
    `handler ${path}: la copia disponibile arriva a 6 secondi, senza aspettarne 20`);
  await w.chiudi();
}
{
  const w = workerFinto(), stato = await w.chiedi('/portal');
  await w.avanza(9000);
  w.rete[0].rispondi(new RispostaSW('PORTALE DALLA RETE'));
  await scaricaMicrotask();
  ok(stato.risposta?.body === 'PORTALE DALLA RETE'
    && (await w.cache.match('/portal.html'))?.body === 'PORTALE DALLA RETE',
    'handler /portal: la rete arrivata dopo 6 ma prima di 20 secondi vince e aggiorna la copia');
  await w.chiudi();
}
{
  const w = workerFinto({ '/portal.html': new RispostaSW('PORTALE VECCHIO') });
  const stato = await w.chiedi('/portal.html');
  w.rete[0].rispondi(new RispostaSW('PORTALE FRESCO'));
  await scaricaMicrotask();
  ok(stato.risposta?.body === 'PORTALE FRESCO',
    'handler /portal.html: la rete pronta prevale sulla copia vecchia');
  await w.chiudi();
}
{
  const w = workerFinto(), primo = await w.chiedi('/portal');
  await w.avanza(20000);
  ok(primo.risposta?.status === 503, 'handler /portal: il primo tentativo offre Riprova mentre la rete continua');
  await w.avanza(1000);
  w.rete[0].rispondi(new RispostaSW('PORTALE TARDIVO', { headers: { 'Cache-Control': 'no-store' } }));
  await scaricaMicrotask();
  ok((await w.cache.match('/portal.html'))?.body === 'PORTALE TARDIVO' && primo.risposta?.status === 503,
    'handler /portal: la risposta dopo 20 secondi riempie la cache senza cambiare quella già consegnata');
  const secondo = await w.chiedi('/portal.html');
  await w.avanza(6000);
  ok(secondo.risposta?.body === 'PORTALE TARDIVO',
    'handler /portal.html: Riprova riusa a 6 secondi la risposta tardiva del tentativo precedente');
  await w.chiudi();
}
for (const path of ['/js/portal-app.js', '/css/portal-mobile.css']) {
  for (const mode of ['cors', 'navigate']) {
    const w = workerFinto(), stato = await w.chiedi(path, { mode });
    await w.avanza(60000);
    const nessunFallbackHTML = stato.intercettata && !stato.conclusa;
    w.rete[0].rispondi(new RispostaSW('ASSET ORIGINALE'));
    await scaricaMicrotask();
    ok(nessunFallbackHTML && stato.risposta?.body === 'ASSET ORIGINALE',
      `handler ${path} (${mode}): nessun HTML di recupero sostituisce JS/CSS, anche aperto direttamente`);
    await w.chiudi();
  }
}
{
  const w = workerFinto(), stato = await w.chiedi('/portal', { mode: 'cors' });
  await w.avanza(60000);
  const nessunaPaginaSostitutiva = stato.intercettata && !stato.conclusa;
  w.rete[0].rispondi(new RispostaSW('PORTALE PRE-RISCALDATO'));
  await scaricaMicrotask();
  ok(nessunaPaginaSostitutiva && stato.risposta?.body === 'PORTALE PRE-RISCALDATO'
    && (await w.cache.match('/portal.html'))?.body === 'PORTALE PRE-RISCALDATO',
    'handler pre-warm /portal: una fetch ordinaria attende il documento reale, senza pagina 503');
  await w.chiudi();
}
for (const method of ['GET', 'POST']) {
  const w = workerFinto(), stato = await w.chiedi('/api/portal/ingest', { method });
  await w.avanza(60000);
  ok(!stato.intercettata && w.rete.length === 0 && w.apertureCache === 0,
    `handler API ${method}: lascia interamente la richiesta al browser, senza timer o cache`);
  await w.chiudi();
}
{
  const w = workerFinto(), stato = await w.chiedi('/login');
  await w.avanza(20000);
  ok(stato.risposta?.status === 503 && /Riprova/.test(stato.risposta.body),
    'handler /login: il recupero delle altre navigazioni resta a 20 secondi');
  await w.chiudi();
}

console.log(`\n${fail ? '✗' : '✓'} rete: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
