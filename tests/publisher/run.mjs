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
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
const { IDENTITY_REVISION_PATH } = await import('../../api/publisher/_adoption.js');

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };

const PIGNETO = {
  id: 'lst_pigneto', name: 'Bilocale Pigneto', price: 1250, availabilityStatus: 'available',
  address: 'Via del Pigneto 112', type: 'bilocale', sqm: 55, beds: 1, bathrooms: 1,
  furnished: true, depositMonths: 2, availableDate: '2026-09-01',
  features: ['ac', 'washing_machine', 'roof_garden'],
  images: ['https://st.example/a.jpg', 'https://st.example/b.jpg'],
  geo: { lat: 41.8891, lng: 12.5432, src: 'nominatim', q: 'Via del Pigneto 112, Roma' },
  // le lingue come le scrive il catalogo (bot, sweep di describe.js, Media
  // Studio): `description` è l'inglese, `descriptionIt` l'italiano
  description: 'Bright renovated one-bedroom', descriptionIt: 'Luminoso bilocale ristrutturato',
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

// Il riferimento adottato non è una ricevuta né un'autorizzazione. Anche
// un vecchio wasLive/hash o una modifica commerciale non riapre la coda.
const adoptedPigneto = {
  id: 'immobiliare_lst_pigneto', portal: 'immobiliare', listingId: 'lst_pigneto',
  managementMode: 'reference_only', adoptedAt: '2026-10-26T10:00:00Z',
  remoteId: '98123', remoteUrl: 'https://www.immobiliare.it/annunci/98123/',
};
for (const [name, listing, receipt] of [
  ['create', PIGNETO, adoptedPigneto],
  ['update dopo cambio prezzo', { ...PIGNETO, price: 1300 }, { ...livePigneto, ...adoptedPigneto }],
  ['remove dopo affitto', { ...PIGNETO, availabilityStatus: 'rented' }, { ...livePigneto, ...adoptedPigneto }],
  ['riattivazione dopo errore', { ...PIGNETO, price: 1300 }, { ...errored, ...adoptedPigneto }],
  ['modalità sconosciuta', PIGNETO, { ...adoptedPigneto, managementMode: 'unknown' }],
  ['marker senza modalità', PIGNETO, { ...livePigneto, adoptedAt: adoptedPigneto.adoptedAt }],
]) {
  const guarded = worklist([listing], [receipt], { portal: 'immobiliare' });
  check('riferimento adottato blocca ' + name,
    guarded.actions.length === 0 && guarded.stats.referenceOnly === 1
    && guarded.stats.toCreate + guarded.stats.toUpdate + guarded.stats.toRemove === 0);
}
const legacyAlias = { ...livePigneto, id: 'legacy_alias', remoteId: '999', hash: 'old' };
for (const receipts of [[adoptedPigneto, legacyAlias], [legacyAlias, adoptedPigneto]]) {
  const guarded = worklist([{ ...PIGNETO, price: 1300 }], receipts, { portal: 'immobiliare' });
  check('alias legacy non oscura il veto, primo documento ' + receipts[0].id,
    guarded.actions.length === 0 && guarded.stats.referenceOnly === 1);
}

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
// «Bedroom» non è «room» (15/10/2026): " Spacious 2 Bedroom flat " — il tipo
// di «Capri 2 Bed» — andava a Idealista come stanza; e una stanza che lo
// dice solo nel nome resta stanza
check('hints idealista: «2 Bedroom flat» è un appartamento',
  payloadFor({ ...PIGNETO, type: ' Spacious 2 Bedroom flat ' }, 'idealista').hints.propertyType === 'appartamento');
check('hints idealista: «…Double Room with Garden» nel nome è una stanza',
  payloadFor({ ...PIGNETO, type: 'Garden floor', name: 'Parioli Double Room with Garden' }, 'idealista').hints.propertyType === 'stanza');
// le camere del payload con la regola unica: il campo strutturato vince sul
// testo libero del bot — e il valore entra nell'hash, quindi la correzione
// rimette in coda l'update (voluto)
check('payload beds: bedrooms 2 batte il testo «Living , 1 bedroom…»',
  payloadFor({ ...PIGNETO, beds: 'Living , 1 bedroom with balcony , 1 bedroom', bedrooms: 2 }, 'immobiliare').beds === 2);
check('payload beds: il «3» del testo non batte bedrooms 1, e l\'hash lo vede',
  coreContent({ ...PIGNETO, beds: '3', bedrooms: 1 }).beds === 1
  && publishHash({ ...PIGNETO, beds: '3', bedrooms: 1 }) !== publishHash({ ...PIGNETO, beds: '3', bedrooms: 3 }));

// Le lingue delle descrizioni (15/10/2026): descriptionIt era
// `description || descriptionIt`, e nel catalogo `description` è l'INGLESE
// — il pannello riceveva come italiano il testo inglese di ogni casa
check('descriptionIt = il testo italiano del catalogo, descriptionEn = description',
  pay.descriptionIt === 'Luminoso bilocale ristrutturato' && pay.descriptionEn === 'Bright renovated one-bedroom');
check('senza descriptionIt il campo italiano è null: mai l\'inglese al suo posto',
  coreContent({ ...PIGNETO, descriptionIt: undefined }).descriptionIt === null
  && coreContent({ ...PIGNETO, descriptionIt: undefined }).descriptionEn === 'Bright renovated one-bedroom');
check('descriptionEn, se c\'è, vince per l\'inglese; un testo di soli spazi non conta',
  coreContent({ ...PIGNETO, descriptionEn: 'EN override' }).descriptionEn === 'EN override'
  && coreContent({ ...PIGNETO, descriptionEn: '   ' }).descriptionEn === 'Bright renovated one-bedroom');
// L'arredo: il catalogo scrive 'yes' / 'partial' / 'no' (bot e
// api/wizard/interpret.js); coreContent accettava solo il booleano, quindi
// ogni casa vera arrivava al pannello con furnished null
check('furnished: yes → true, no → false, partial → «partial» (né sì né no), booleani intatti, ignoto → null',
  coreContent({ ...PIGNETO, furnished: 'yes' }).furnished === true
  && coreContent({ ...PIGNETO, furnished: 'no' }).furnished === false
  && coreContent({ ...PIGNETO, furnished: 'partial' }).furnished === 'partial'
  && coreContent({ ...PIGNETO, furnished: ' YES ' }).furnished === true
  && coreContent(PIGNETO).furnished === true && coreContent({ ...PIGNETO, furnished: false }).furnished === false
  && coreContent({ ...PIGNETO, furnished: undefined }).furnished === null
  && coreContent({ ...PIGNETO, furnished: 'tbd' }).furnished === null);
// la casa vera già online con l'hash di PRIMA (arredo ignorato, inglese
// come italiano) torna in coda come update: voluto, il contenuto online
// era sbagliato
{
  const { createHash } = await import('node:crypto');
  const VERA = { ...PIGNETO, furnished: 'yes' };
  const corePrima = { ...coreContent(VERA), furnished: null, descriptionIt: VERA.description };
  const hashPrima = createHash('sha1').update(JSON.stringify(corePrima)).digest('hex');
  const w = worklist([VERA], [{ ...livePigneto, hash: hashPrima }], { portal: 'immobiliare' });
  const p = payloadFor(VERA, 'immobiliare');
  check('una casa online con l\'hash di prima torna in coda come update, col payload corretto',
    hashPrima !== publishHash(VERA) && w.actions.length === 1 && w.actions[0].op === 'update'
    && p.furnished === true && p.descriptionIt === 'Luminoso bilocale ristrutturato');
}

// ═══ Il verdetto del giro ═══
check('giro a vuoto = salute (catalogo allineato)', runVerdict({ results: [] }) === true);
check('sessione bloccata = guasto, anche senza risultati', runVerdict({ blocked: true, results: [] }) === false);
check('tutto fallito = guasto', runVerdict({ results: [{ ok: false }, { ok: false }] }) === false);
check('parziale = vivo', runVerdict({ results: [{ ok: true }, { ok: false }] }) === true);

// ═══ Il loop vero: GET → POST → GET su Firestore in memoria ═══
const versions = new Map();
let versionSequence = 0;
const store = new class extends Map {
  set(path, value) {
    versions.set(path, '2026-10-26T00:00:00.' + String(++versionSequence).padStart(9, '0') + 'Z');
    return super.set(path, value);
  }
  delete(path) { versions.delete(path); return super.delete(path); }
}(); // path dopo (default)/documents/ → oggetto JS + versione server
const writeCalls = [], commitRequests = [], notifications = [];
const readFailures = new Set(), missingVersions = new Set();
let beforeCommit = null;
store.set('listings/lst_pigneto', { ...PIGNETO });
store.set('listings/lst_out', { ...AFFITTATO });

const js2fs = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
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
const wireDoc = (path, row) => ({
  name: 'projects/test' + DOCROOT + '/' + path,
  fields: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, js2fs(v)])),
  ...(missingVersions.has(path) ? {} : { updateTime: versions.get(path) }),
});

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  if (url.includes('identitytoolkit') && url.includes('signInWithPassword')) {
    return new Response(JSON.stringify({ idToken: 't' }), { status: 200 });
  }
  if (url.startsWith('https://api.telegram.org/')) {
    notifications.push(JSON.parse(opts.body));
    return new Response('{"ok":true}', { status: 200 });
  }
  if (url.includes(DOCROOT + ':commit')) {
    const batch = JSON.parse(opts.body).writes;
    writeCalls.push({ method, url }); commitRequests.push(batch);
    const hook = beforeCommit; beforeCommit = null;
    if (hook) await hook();
    // All preconditions are checked before ANY document is changed. This
    // exercises the real fsCommit encoder, including the field mask.
    for (const write of batch) {
      const path = docPathOf(write.update?.name || write.delete);
      const pre = write.currentDocument;
      if ((pre?.exists !== undefined && pre.exists !== store.has(path))
        || (pre?.updateTime !== undefined && pre.updateTime !== versions.get(path))) {
        return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 409 });
      }
    }
    for (const write of batch) {
      const path = docPathOf(write.update?.name || write.delete);
      if (write.delete) { store.delete(path); continue; }
      const incoming = Object.fromEntries(Object.entries(write.update.fields || {}).map(([k, v]) => [k, fs2js(v)]));
      const fields = write.updateMask?.fieldPaths;
      const next = fields ? { ...(store.get(path) || {}) } : incoming;
      for (const field of fields || []) {
        if (Object.hasOwn(incoming, field)) next[field] = incoming[field];
        else delete next[field];
      }
      store.set(path, next);
    }
    return new Response(JSON.stringify({ writeResults: batch.map(write => ({ updateTime: versions.get(docPathOf(write.update?.name || write.delete)) })) }), { status: 200 });
  }
  if (url.includes(DOCROOT + ':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId;
    let rows = [...store.entries()].filter(([p]) => p.startsWith(coll + '/'));
    const ff = q.where && q.where.fieldFilter;
    if (ff && ff.op === 'EQUAL') rows = rows.filter(([, d]) => d[ff.field.fieldPath] === fs2js(ff.value));
    return new Response(JSON.stringify(rows.slice(0, q.limit || 50).map(([p, d]) => ({
      document: wireDoc(p, d),
    }))), { status: 200 });
  }
  if (url.includes(DOCROOT + '/')) {
    const path = docPathOf(url);
    if (method === 'GET') {
      if (readFailures.has(path)) return new Response('{}', { status: 503 });
      if (!store.has(path)) return new Response('{}', { status: 404 });
      const d = store.get(path);
      return new Response(JSON.stringify(wireDoc(path, d)), { status: 200 });
    }
    if (method === 'PATCH') {
      writeCalls.push({ method, path });
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

// Synthetic Telegram credentials activate the notification branch, but all
// requests terminate in the fetch stub above; silence is actually asserted.
process.env.TELEGRAM_BOT_TOKEN = 'publisher-test-token';
process.env.TELEGRAM_CHAT_ID = 'publisher-test-chat';
const handler = (await import('../../api/publisher/queue.js')).default;
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(b) { this.body = b; return this; }, end() { return this; } });
const H = { 'x-homie-secret': 'publisher-test-secret' };
const post = async (results, use = handler) => {
  const response = mkRes();
  await use({ method: 'POST', headers: H, query: {}, body: { portal: 'immobiliare', results } }, response);
  return response;
};

let r = mkRes();
await handler({ method: 'GET', headers: {}, query: { portal: 'immobiliare' } }, r);
check('senza segreto → 401', r.code === 401);

r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'facebook' } }, r);
check('portale sconosciuto → 400', r.code === 400);

r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'immobiliare' } }, r);
check('configurazione assente → coda spenta e nessun create',
  r.code === 200 && r.body.enabled === false && r.body.actions.length === 0);

store.set('settings/publisher', { enabled: true, portals: { immobiliare: { enabled: true } } });
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
const firstCommit = commitRequests.at(-1);
check('rapporto registra ricevuta e revisione nello stesso commit condizionale',
  firstCommit.length === 2 && docPathOf(firstCommit[0].update.name) === IDENTITY_REVISION_PATH
  && docPathOf(firstCommit[1].update.name) === 'portalPubs/immobiliare_lst_pigneto'
  && firstCommit.every(write => write.currentDocument.exists === false && Array.isArray(write.updateMask.fieldPaths))
  && store.get(IDENTITY_REVISION_PATH).revision === 1);
check('rapporto normale invia il recap simulato', notifications.length === 1);

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
store.set('settings/publisher', { enabled: true, portals: { immobiliare: { enabled: false } } });
r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'immobiliare' } }, r);
check('kill switch per portale → coda vuota, enabled:false', r.code === 200 && r.body.enabled === false && r.body.actions.length === 0);

// ═══ Adozione: veto sull'handler vero, compresi rapporti tardivi ═══
const receiptPath = 'portalPubs/immobiliare_lst_pigneto';
store.set(receiptPath, { ...adoptedPigneto });
store.set('settings/publisher', { enabled: true, portals: { immobiliare: { enabled: true } } });
r = mkRes();
await handler({ method: 'GET', headers: H, query: { portal: 'immobiliare' } }, r);
check('GET attivo conserva il veto del riferimento adottato',
  r.code === 200 && r.body.enabled === true && r.body.actions.length === 0 && r.body.stats.referenceOnly === 1);

for (const result of [
  { op: 'create', ok: true }, { op: 'update', ok: true },
  { op: 'remove', ok: true }, { op: 'update', ok: false, error: 'late failure' },
]) {
  const before = JSON.stringify([...store]), writesBefore = writeCalls.length, noticesBefore = notifications.length;
  r = await post([{ id: 'lst_pigneto', hash: 'old-content', remoteId: 'different-id', ...result }]);
  check('POST adottato ' + result.op + '/' + result.ok + ' ignorato senza scritture, heartbeat o recap',
    r.code === 200 && r.body.skipped[0]?.reason === 'reference_only'
    && Object.values(r.body.recorded).every(n => n === 0)
    && JSON.stringify([...store]) === before && writeCalls.length === writesBefore
    && notifications.length === noticesBefore);
}
store.set(receiptPath, { ...adoptedPigneto, managementMode: 'unknown' });
{
  const writesBefore = writeCalls.length, noticesBefore = notifications.length;
  r = await post([{ id: 'lst_pigneto', op: 'create', ok: true }]);
  check('POST modalità sconosciuta resta chiuso', r.body.skipped[0]?.reason === 'reference_only'
    && writeCalls.length === writesBefore && notifications.length === noticesBefore);
}

// An adoption completed BEFORE the report starts must also protect the
// external identity. A new revision alone cannot detect this serial case.
store.set(receiptPath, { ...adoptedPigneto });
store.set('listings/lst_second', { ...PIGNETO, id: 'lst_second' });
for (const op of ['create', 'update']) {
  const before = JSON.stringify([...store]), writesBefore = writeCalls.length, noticesBefore = notifications.length;
  r = await post([{ id: 'lst_second', op, ok: true, hash: h,
    remoteId: adoptedPigneto.remoteId, remoteUrl: adoptedPigneto.remoteUrl }]);
  check('POST ' + op + ' su altra casa non riusa un riferimento già adottato',
    r.code === 409 && r.body.recorded.published === 0
    && !store.has('portalPubs/immobiliare_lst_second') && JSON.stringify([...store]) === before
    && writeCalls.length === writesBefore && notifications.length === noticesBefore);
}
store.set('listings/lst_distinct', { ...PIGNETO, id: 'lst_distinct' });
{
  const noticesBefore = notifications.length;
  r = await post([{ id: 'lst_distinct', op: 'create', ok: true, hash: h,
    remoteId: '98124', remoteUrl: 'https://www.immobiliare.it/annunci/98124/' }]);
  check('POST codice distinto conserva il normale rapporto e recap',
    r.code === 200 && r.body.recorded.published === 1
    && store.get('portalPubs/immobiliare_lst_distinct')?.remoteId === '98124'
    && store.get(receiptPath).managementMode === 'reference_only'
    && notifications.length > noticesBefore);
}
r = await post([
  { id: 'lst_pigneto', op: 'create', ok: true },
  { id: 'lst_distinct', op: 'update', ok: false, hash: h, error: 'synthetic managed failure' },
]);
check('successo adottato ignorato non rende verde il solo rapporto gestito fallito',
  r.code === 200 && r.body.skipped[0]?.reason === 'reference_only'
  && r.body.recorded.published === 0 && r.body.recorded.failed === 1
  && store.get('pfsRadarHealth/publisher-immobiliare').ok === false
  && store.get('pfsRadarHealth/publisher-immobiliare').stats.failed === 1
  && store.get(receiptPath).managementMode === 'reference_only');

// A failed read or missing server version never becomes permission to create.
for (const [name, target] of [['lettura fallita', readFailures], ['versione assente', missingVersions]]) {
  target.add(receiptPath);
  const before = JSON.stringify([...store]), writesBefore = writeCalls.length, noticesBefore = notifications.length;
  r = await post([{ id: 'lst_pigneto', op: 'create', ok: true }]);
  target.delete(receiptPath);
  check('POST ' + name + ' non scrive né dichiara successo',
    r.code === 409 && r.body.recorded.published === 0 && JSON.stringify([...store]) === before
    && writeCalls.length === writesBefore && notifications.length === noticesBefore);
}

// The receipt CAS protects the same identity even if an older writer does
// not advance the common revision. The revision also catches an insertion
// for a DIFFERENT listing between the report's read and commit.
async function raceAdoption({ differentTarget = false, use = handler } = {}) {
  store.delete('portalPubs/immobiliare_other');
  store.set(receiptPath, { ...livePigneto, remoteId: '98123', untouched: 'preserve' });
  const revisionBefore = store.get(IDENTITY_REVISION_PATH).revision;
  const noticesBefore = notifications.length, writesBefore = writeCalls.length;
  let adoptedState;
  beforeCommit = () => {
    if (differentTarget) {
      store.set('portalPubs/immobiliare_other', { ...adoptedPigneto, id: 'immobiliare_other', listingId: 'other' });
      store.set(IDENTITY_REVISION_PATH, { revision: revisionBefore + 1 });
    } else store.set(receiptPath, { ...adoptedPigneto });
    adoptedState = JSON.stringify([...store]);
  };
  const response = await post([{ id: 'lst_pigneto', op: 'update', ok: true, hash: 'stale-report', remoteId: '98123' }], use);
  return { response, preserved: JSON.stringify([...store]) === adoptedState,
    silent: notifications.length === noticesBefore, writes: writeCalls.length - writesBefore };
}
for (const differentTarget of [false, true]) {
  const race = await raceAdoption({ differentTarget });
  check('adozione concorrente ' + (differentTarget ? 'su altra casa' : 'sulla stessa casa') + ' respinge atomicamente il rapporto',
    race.response.code === 409 && race.response.body.conflicts[0]?.reason === 'changed_since_read'
    && Object.values(race.response.body.recorded).every(n => n === 0)
    && race.preserved && race.silent && race.writes === 1);
}
check('wire dei rapporti usa sempre maschere e precondizioni su entrambe le scritture',
  commitRequests.every(batch => batch.length === 2 && batch.every(write => Array.isArray(write.updateMask?.fieldPaths)
    && (typeof write.currentDocument?.exists === 'boolean' || typeof write.currentDocument?.updateTime === 'string'))));

// Put back each actual defect in an isolated module, never in repository
// source. The same assertions must reject a missing veto and missing CAS.
async function mutatedModule(relative, from, to) {
  const url = new URL(relative, import.meta.url);
  let source = readFileSync(url, 'utf8');
  assert(source.includes(from), 'mutation target exists: ' + from);
  source = source.replaceAll(from, to).replace(/from '([^']+)'/g, (_, path) => 'from ' + JSON.stringify(new URL(path, url).href));
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const stateMutant = await mutatedModule('../../api/publisher/_state.js', 'if (blockedListings.has(l.id))', 'if (false)');
assert.throws(() => assert.equal(stateMutant.worklist([PIGNETO], [adoptedPigneto], { portal: 'immobiliare' }).actions.length, 0));
check('mutazione senza veto nella worklist intercettata', true);
const queueVetoMutant = (await mutatedModule('../../api/publisher/queue.js', 'publicationBlocked(', 'Boolean(false && ')).default;
store.delete('portalPubs/immobiliare_other');
store.set(receiptPath, { ...adoptedPigneto });
const priorWrites = writeCalls.length;
await post([{ id: 'lst_pigneto', op: 'create', ok: true }], queueVetoMutant);
assert.throws(() => assert.equal(writeCalls.length, priorWrites));
check('mutazione senza veto sui rapporti intercettata', true);
const queueRevisionMutant = (await mutatedModule('../../api/publisher/queue.js', 'identityRevisionWrite(revision), ', '')).default;
const unsafeRace = await raceAdoption({ differentTarget: true, use: queueRevisionMutant });
assert.throws(() => assert.equal(unsafeRace.response.code, 409));
check('mutazione senza revisione comune intercettata dalla corsa fra case diverse', true);

console.log(`\nPubblicista: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
