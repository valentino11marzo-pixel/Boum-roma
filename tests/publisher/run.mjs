// tests/publisher/run.mjs — Il Pubblicista, blindato.
//
// LE REGOLE: l'hash cambia solo col CONTENUTO pubblicabile (mai coi campi
// volatili), la worklist toglie prima di aggiungere (una casa affittata
// online è la prima cosa da spegnere), un fallimento ripetuto parcheggia
// invece di girare a vuoto — e si sblocca da solo quando l'operatore edita
// il listing; il payload non inventa MAI un campo e non fa mai uscire un
// codice feature grezzo; un giro a vuoto è salute ma un pannello che sbatte
// fuori è guasto (la lezione degli occhi di Homie). Poi il loop VERO:
// GET → POST rapporto → GET di nuovo, su un Firestore in memoria.
// Uso: node tests/publisher/run.mjs
process.env.HOMIE_SECRET = 'publisher-test-secret';
process.env.FEED_AGENCY_EMAIL = 'agenzia@boomrome.com';
process.env.FIREBASE_API_KEY = 'k'; process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p'; process.env.FIREBASE_PROJECT_ID = 'test';
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;
delete process.env.CRON_SECRET;

const {
  publishHash, coreContent, worklist, payloadFor, runVerdict, MAX_ATTEMPTS,
} = await import('../../api/publisher/_state.js');
const { feedKey } = await import('../../api/feed/immobiliare.js');

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };

const PIGNETO = {
  id: 'lst_pigneto', name: 'Bilocale Pigneto', price: 1250, availabilityStatus: 'available',
  address: 'Via del Pigneto 112', type: 'bilocale', sqm: 55, beds: 1, bathrooms: 1,
  furnished: true, depositMonths: 2, availableDate: '2026-09-01',
  features: ['ac', 'washing_machine', 'roof_garden'],
  images: ['https://st.example/a.jpg', 'https://st.example/b.jpg'],
  geo: { lat: 41.8891, lng: 12.5432, src: 'nominatim', q: 'Via del Pigneto 112, Roma' },
  description: 'Luminoso bilocale ristrutturato', descriptionEn: 'Bright renovated one-bedroom',
  updatedAt: '2026-08-01T10:20:30.000Z',
};
const CENTRO = {
  id: 'lst_centro', name: 'Studio Centro', price: 900, availabilityStatus: 'available',
  type: 'stanza', geo: { lat: 41.8986, lng: 12.4735, src: 'zone' },
};
const AFFITTATO = { id: 'lst_out', name: 'Trilocale Cavour', price: 1400, availabilityStatus: 'rented' };

// ═══ L'hash: contenuto sì, rumore no ═══
check('hash stabile su due letture', publishHash(PIGNETO) === publishHash({ ...PIGNETO }));
check('hash identico anche con chiavi in ordine diverso', publishHash(PIGNETO) === publishHash(JSON.parse(JSON.stringify(PIGNETO, Object.keys(PIGNETO).sort()))));
check('il prezzo cambia l\'hash', publishHash(PIGNETO) !== publishHash({ ...PIGNETO, price: 1300 }));
check('l\'ordine delle foto cambia l\'hash (la prima è la copertina)', publishHash(PIGNETO) !== publishHash({ ...PIGNETO, images: [...PIGNETO.images].reverse() }));
check('i campi volatili NON cambiano l\'hash', publishHash(PIGNETO) === publishHash({ ...PIGNETO, updatedAt: '2026-08-05T00:00:00Z', views: 99, photosEnhancedAt: 'x' }));
check('coreContent non inventa: piano assente = null', coreContent(PIGNETO).floor === null);

// ═══ La worklist ═══
const h = publishHash(PIGNETO);
let wl = worklist([PIGNETO, CENTRO, AFFITTATO], []);
check('mai pubblicato + pubblicabile → create (e l\'affittato mai visto non genera nulla)',
  wl.actions.filter(a => a.op === 'create').length === 2 && !wl.actions.some(a => a.id === 'lst_out'));

const livePigneto = { id: 'immobiliare_lst_pigneto', portal: 'immobiliare', listingId: 'lst_pigneto', status: 'live', wasLive: true, hash: h };
wl = worklist([PIGNETO], [livePigneto], { portal: 'immobiliare' });
check('pubblicato con lo stesso hash → niente da fare', wl.actions.length === 0);

wl = worklist([{ ...PIGNETO, price: 1300 }], [livePigneto], { portal: 'immobiliare' });
check('contenuto cambiato → update (con remoteId se noto)', wl.actions.length === 1 && wl.actions[0].op === 'update');

wl = worklist([{ ...PIGNETO, availabilityStatus: 'rented' }, CENTRO], [livePigneto], { portal: 'immobiliare' });
check('affittato ma ancora online → remove, e viene PRIMA del create', wl.actions[0].op === 'remove' && wl.actions[0].id === 'lst_pigneto' && wl.actions[1].op === 'create');

// Il parcheggio: 3 fallimenti sullo stesso contenuto → fermo, non a vuoto.
const errored = { ...livePigneto, status: 'error', wasLive: false, attempts: MAX_ATTEMPTS, failedHash: h };
wl = worklist([PIGNETO], [errored], { portal: 'immobiliare' });
check('3 fallimenti sullo stesso hash → parcheggiato', wl.actions.length === 0 && wl.stats.parked === 1);
wl = worklist([{ ...PIGNETO, price: 1111 }], [errored], { portal: 'immobiliare' });
check('l\'edit dell\'operatore (hash nuovo) sblocca il parcheggio', wl.actions.length === 1 && wl.stats.parked === 0);

// ═══ Il payload: onesto e umanizzato ═══
const pay = payloadFor(PIGNETO, 'immobiliare');
check('feature umanizzate IT/EN, mai il codice grezzo',
  pay.featuresLabels.it.includes('aria condizionata') && pay.featuresLabels.en.includes('washing machine')
  && !pay.featuresLabels.en.some(s => s.includes('_')) && pay.featuresLabels.en.includes('roof garden'));
check('pin vero (via+civico) → showExactAddress', pay.showExactAddress === true && pay.geo.precision === 'exact');
check('hints immobiliare: tipologia + nodo XML con la chiave derivata',
  pay.hints.typologyId === 14 && pay.hints.xmlNodePath.includes(feedKey()) && pay.hints.xmlNodePath.includes('lst_pigneto'));
const payZone = payloadFor(CENTRO, 'idealista');
check('pin di zona → showExactAddress false', payZone.showExactAddress === false && payZone.geo.precision !== 'exact');
check('hints idealista: stanza riconosciuta', payZone.hints.propertyType === 'stanza' && payZone.hints.operation === 'rent');

// ═══ Il verdetto del giro ═══
check('giro a vuoto = salute (catalogo allineato)', runVerdict({ results: [] }) === true);
check('sessione bloccata = guasto, anche senza risultati', runVerdict({ blocked: true, results: [] }) === false);
check('tutto fallito = guasto', runVerdict({ results: [{ ok: false }, { ok: false }] }) === false);
check('parziale = vivo', runVerdict({ results: [{ ok: true }, { ok: false }] }) === true);

// ═══ Il loop vero: GET → POST → GET su Firestore in memoria ═══
const store = new Map(); // path dopo (default)/documents/ → oggetto JS
store.set('listings/lst_pigneto', { ...PIGNETO });
store.set('listings/lst_out', { ...AFFITTATO });

const js2fs = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(js2fs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = js2fs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
};
const fs2js = (v) => {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fs2js);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fs2js(x); return o; }
  return null;
};
const DOCROOT = '/databases/(default)/documents'; // ancora robusta: mai split su "/documents" nudo
const docPathOf = (url) => decodeURIComponent(String(url).split(DOCROOT + '/')[1] || '').split('?')[0];

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  if (url.includes('identitytoolkit') && url.includes('signInWithPassword')) {
    return new Response(JSON.stringify({ idToken: 't' }), { status: 200 });
  }
  if (url.includes(DOCROOT + ':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId;
    let rows = [...store.entries()].filter(([p]) => p.startsWith(coll + '/'));
    const ff = q.where && q.where.fieldFilter;
    if (ff && ff.op === 'EQUAL') rows = rows.filter(([, d]) => d[ff.field.fieldPath] === fs2js(ff.value));
    return new Response(JSON.stringify(rows.slice(0, q.limit || 50).map(([p, d]) => ({
      document: { name: 'projects/test' + DOCROOT + '/' + p, fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, js2fs(v)])) },
    }))), { status: 200 });
  }
  if (url.includes(DOCROOT + '/')) {
    const path = docPathOf(url);
    if (method === 'GET') {
      if (!store.has(path)) return new Response('{}', { status: 404 });
      const d = store.get(path);
      return new Response(JSON.stringify({ name: 'projects/test' + DOCROOT + '/' + path, fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, js2fs(v)])) }), { status: 200 });
    }
    if (method === 'PATCH') {
      // fsPatch prova prima currentDocument.exists=false (solo-crea): su un
      // doc esistente DEVE fallire, come il Firestore vero, o l'idempotenza
      // dei rapporti non è testata affatto.
      if (url.includes('currentDocument.exists=false') && store.has(path)) return new Response('exists', { status: 409 });
      const incoming = {}; for (const [k, v] of Object.entries(JSON.parse(opts.body).fields || {})) incoming[k] = fs2js(v);
      store.set(path, { ...(store.get(path) || {}), ...incoming });
      return new Response(JSON.stringify({ name: path }), { status: 200 });
    }
  }
  throw new Error('unstubbed ' + method + ' ' + url);
};

const handler = (await import('../../api/publisher/queue.js')).default;
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(b) { this.body = b; return this; }, end() { return this; } });
const H = { 'x-homie-secret': 'publisher-test-secret' };

let r = mkRes();
await handler({ method: 'GET', headers: {}, query: { portal: 'immobiliare' } }, r);
check('senza segreto → 401', r.code === 401);

r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'facebook' } }, r);
check('portale sconosciuto → 400', r.code === 400);

r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'immobiliare' } }, r);
const act = (r.body.actions || [])[0];
check('GET → il pubblicabile in coda come create, con payload e hash',
  r.code === 200 && r.body.enabled === true && r.body.actions.length === 1
  && act.op === 'create' && act.id === 'lst_pigneto' && act.hash === publishHash(PIGNETO)
  && act.payload && act.payload.price === 1250 && act.payload.hints.typologyId === 14);

// il rapporto: pubblicato → lo stato si aggiorna, il giro dopo è vuoto
r = mkRes();
await handler({ method: 'POST', headers: H, query: {}, body: { portal: 'immobiliare', results: [{ id: 'lst_pigneto', op: 'create', hash: act.hash, ok: true, remoteId: '98123', remoteUrl: 'https://www.immobiliare.it/annunci/98123/', name: 'Bilocale Pigneto' }] } }, r);
const pubDoc = store.get('portalPubs/immobiliare_lst_pigneto');
check('POST ok → portalPubs live con hash, remoteId e attempts azzerati',
  r.code === 200 && r.body.recorded.published === 1 && pubDoc && pubDoc.status === 'live'
  && pubDoc.wasLive === true && pubDoc.hash === act.hash && pubDoc.remoteId === '98123');
const hb = store.get('pfsRadarHealth/publisher-immobiliare');
check('heartbeat publisher-immobiliare scritto e verde', hb && hb.ok === true && hb.consecutiveErrors === 0);

r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'immobiliare' } }, r);
check('giro dopo → coda vuota (lo stato comanda il diff)', r.code === 200 && r.body.actions.length === 0 && r.body.stats.live === 1);

// l'operatore affitta la casa → il giro dopo la toglie
store.set('listings/lst_pigneto', { ...PIGNETO, availabilityStatus: 'rented' });
r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'immobiliare' } }, r);
check('affittato → remove in coda, senza payload ma con remoteId', r.body.actions.length === 1 && r.body.actions[0].op === 'remove' && r.body.actions[0].payload === null && r.body.actions[0].remoteId === '98123');
r = mkRes();
await handler({ method: 'POST', headers: H, query: {}, body: { portal: 'immobiliare', results: [{ id: 'lst_pigneto', op: 'remove', ok: true, name: 'Bilocale Pigneto' }] } }, r);
check('remove riferito → stato removed', store.get('portalPubs/immobiliare_lst_pigneto').status === 'removed');

// il fallimento ripetuto parcheggia (e il blocked scala l'heartbeat)
store.set('listings/lst_pigneto', { ...PIGNETO });
const h2 = publishHash(PIGNETO);
for (let i = 0; i < MAX_ATTEMPTS; i++) {
  r = mkRes();
  await handler({ method: 'POST', headers: H, query: {}, body: { portal: 'immobiliare', results: [{ id: 'lst_pigneto', op: 'create', hash: h2, ok: false, error: 'campo mq rifiutato' }] } }, r);
}
check('3 rapporti falliti → attempts=3 e failedHash registrato',
  store.get('portalPubs/immobiliare_lst_pigneto').attempts === MAX_ATTEMPTS
  && store.get('portalPubs/immobiliare_lst_pigneto').failedHash === h2);
r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'immobiliare' } }, r);
check('parcheggiato: fuori dalla coda, dentro le stats', r.body.actions.length === 0 && r.body.stats.parked === 1);

r = mkRes();
await handler({ method: 'POST', headers: H, query: {}, body: { portal: 'idealista', blocked: true, error: 'login richiesto', results: [] } }, r);
const hbIdea = store.get('pfsRadarHealth/publisher-idealista');
check('blocked → heartbeat rosso (un pannello chiuso non è un catalogo allineato)', hbIdea && hbIdea.ok === false && hbIdea.consecutiveErrors === 1);

// kill switch
store.set('settings/publisher', { portals: { immobiliare: { enabled: false } } });
r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'immobiliare' } }, r);
check('kill switch per portale → coda vuota, enabled:false', r.code === 200 && r.body.enabled === false && r.body.actions.length === 0);

console.log(`\nPubblicista: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
