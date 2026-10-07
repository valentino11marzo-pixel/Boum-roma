// tests/money/run.mjs — test dei percorsi soldi (senza rete, senza emulatore).
// 'stripe' è mockato via loader ESM; Firestore/IdentityToolkit/EmailJS via
// stub di global.fetch con uno store in-memory. Copre la NOSTRA logica:
// validazione, honeypot, prezzi server-side, idempotenza su retry Stripe,
// conversione pre-agreement idempotente.
// Uso: node tests/money/run.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./loader.mjs', import.meta.url);

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.EMAILJS_PRIVATE_KEY = 'ek';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

// ── Stub fetch: store Firestore in-memory ───────────────────────────────
const store = new Map();        // 'collection/docId' → plain fields object
const emails = [];              // template_params delle email inviate
const queries = [];             // structuredQuery dei runQuery
let failRadarCreates = 0;       // transient Firestore failure after paid client creation
globalThis.__stripeCalls = [];

const FS = 'firestore.googleapis.com';
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Serializzazione COMPLETA (array e mappe annidate incluse): il convert
// scrive coTenants[]/agencyFee{} e la lib vera li gestisce — lo stub deve
// fare altrettanto o i test mentono per difetto suo.
function toFsV(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsV) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFsV(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function toFsFieldsShallow(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj || {})) f[k] = toFsV(v);
  return f;
}
function fromFsV(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFsV);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFsV(x); return o; }
  return null;
}

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'admin1' }] });
  if (url.includes('api.emailjs.com')) {
    emails.push(JSON.parse(opts.body).template_params);
    return new Response('OK', { status: 200 });
  }
  if (url.includes(FS)) {
    const path = url.split('/documents')[1] || '';
    if (path.startsWith(':runQuery')) {
      const q = JSON.parse(opts.body).structuredQuery;
      queries.push(q);
      const coll = q.from[0].collectionId;
      const field = q.where?.fieldFilter?.field?.fieldPath;
      const val = q.where?.fieldFilter?.value?.stringValue;
      const afterId = q.startAt?.values?.[0]?.referenceValue?.split('/').at(-1) || null;
      const rows = [];
      for (const [key, fields] of [...store.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        if (!key.startsWith(coll + '/')) continue;
        if (afterId && key.slice(coll.length + 1) <= afterId) continue;
        if (field && String(fields[field]) !== String(val)) continue;
        rows.push({ document: { name: 'projects/p/databases/(default)/documents/' + key, fields: toFsFieldsShallow(fields) } });
      }
      return okJson(rows.length ? rows.slice(0, q.limit || rows.length) : [{}]);
    }
    const clean = path.replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (opts.method === 'POST') {
      if (clean === 'radarSearches' && failRadarCreates > 0) {
        failRadarCreates--;
        return new Response('temporarily unavailable', { status: 503 });
      }
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = clean + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      const fields = JSON.parse(opts.body).fields || {};
      const flat = {};
      for (const [k, v] of Object.entries(fields)) flat[k] = fromFsV(v);
      store.set(key, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      const fields = JSON.parse(opts.body).fields || {};
      const flat = store.get(clean) || {};
      for (const [k, v] of Object.entries(fields)) flat[k] = fromFsV(v);
      store.set(clean, flat);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + clean });
    }
    // GET doc
    const doc = store.get(clean);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + clean, fields: toFsFieldsShallow(doc) });
  }
  throw new Error('fetch non stubbata: ' + url);
};

// ── Helpers req/res ─────────────────────────────────────────────────────
const mkRes = () => ({
  code: 0, body: null, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; },
  send(t) { this.body = t; return this; },
  end() { return this; },
});
const mkReq = (body, headers = {}) => ({ method: 'POST', headers, body });
const mkStreamReq = (obj) => ({
  method: 'POST',
  headers: { 'stripe-signature': 'sig' },
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(obj)); },
});
const sessionEvent = (metadata, over = {}) => ({
  type: 'checkout.session.completed',
  ...(over.event_created ? { created: over.event_created } : {}),
  data: { object: { id: over.id || 'cs_live_abc123', amount_total: over.amount_total ?? 8900, currency: 'eur', customer_email: 'c@x.it', payment_intent: 'pi_1', metadata } },
});

// ═══ 1. service-checkout ═══
const svc = (await import('../../api/service-checkout.js')).default;
{
  let r = mkRes();
  await svc(mkReq({ kind: 'virtual-viewing', name: 'A', email: 'a@b.it', phone: '333', company: 'BOT' }, { 'x-forwarded-for': '1.1.1.1' }), r);
  check('service: honeypot → finto ok, Stripe NON chiamato', r.body?.url === '/' && globalThis.__stripeCalls.length === 0);

  r = mkRes();
  await svc(mkReq({ kind: 'not-a-service', name: 'A', email: 'a@b.it', phone: '333' }, { 'x-forwarded-for': '1.1.1.2' }), r);
  check('service: kind sconosciuto → 400', r.code === 400);

  r = mkRes();
  await svc(mkReq({ kind: 'contract-check-express', name: 'A', email: 'a@b.it', phone: '333' }, { 'x-forwarded-for': '1.1.1.3' }), r);
  const call = globalThis.__stripeCalls.at(-1);
  check('service: prezzo dal catalogo server (€49)', call?.line_items?.[0]?.price_data?.unit_amount === 4900);
}

// ═══ 2. create-checkout (PFS €350) ═══
const pfs = (await import('../../api/create-checkout.js')).default;
{
  let r = mkRes();
  await pfs(mkReq({ name: 'A', email: 'a@b.it', phone: '3', company: 'BOT' }, { 'x-forwarded-for': '2.2.2.1' }), r);
  check('pfs: honeypot attivo', r.body?.url === '/');

  r = mkRes();
  await pfs(mkReq({ name: 'A', email: 'niente-chiocciola', phone: '3' }, { 'x-forwarded-for': '2.2.2.2' }), r);
  check('pfs: email senza @ → 400', r.code === 400);

  const before = globalThis.__stripeCalls.length;
  r = mkRes();
  await pfs(mkReq({ name: 'A', email: 'a@b.it', phone: '3' }, { 'x-forwarded-for': '2.2.2.3' }), r);
  const c = globalThis.__stripeCalls.at(-1);
  check('pfs: €350 hardcoded server-side', globalThis.__stripeCalls.length === before + 1 && c.line_items[0].price_data.unit_amount === 35000);

  let last;
  for (let i = 0; i < 10; i++) { last = mkRes(); await pfs(mkReq({ name: 'A', email: 'a@b.it', phone: '3' }, { 'x-forwarded-for': '9.9.9.9' }), last); }
  check('pfs: rate-limit per IP → 429', last.code === 429);
}

// ═══ 3. reserve-checkout (clamp importo) ═══
const rsv = (await import('../../api/reserve-checkout.js')).default;
{
  let r = mkRes();
  await rsv(mkReq({ name: 'A', email: 'a@b.it', phone: '3', amount: 50 }, { 'x-forwarded-for': '3.3.3.1' }), r);
  check('reserve: importo sotto soglia → default €300', globalThis.__stripeCalls.at(-1).line_items[0].price_data.unit_amount === 30000);

  r = mkRes();
  await rsv(mkReq({ name: 'A', email: 'a@b.it', phone: '3', amount: 99999 }, { 'x-forwarded-for': '3.3.3.2' }), r);
  check('reserve: clamp massimo €2000', globalThis.__stripeCalls.at(-1).line_items[0].price_data.unit_amount === 200000);
}

// ═══ 4. stripe-webhook: idempotenza SERVICE ═══
const webhook = (await import('../../api/stripe-webhook.js')).default;
{
  const ev = sessionEvent({ service: 'SERVICE', kind: 'virtual-viewing', name: 'Ada B', email: 'ada@x.it', phone: '333' });
  let r = mkRes();
  const emailsBefore = emails.length;
  await webhook(mkStreamReq(ev), r);
  check('webhook SERVICE: 1° evento → lead scritto', r.code === 200 && [...store.keys()].some(k => k.startsWith('leads/svc_')));
  check('webhook SERVICE: 1° evento → 2 email (admin+cliente)', emails.length === emailsBefore + 2);

  r = mkRes();
  await webhook(mkStreamReq(ev), r);
  check('webhook SERVICE: retry stessa sessione → duplicate, ZERO nuove email', r.body?.duplicate === true && emails.length === emailsBefore + 2);
}

// ═══ 4b. PFS pagato: kickoff interno, retry e vecchi clienti ═══
{
  delete process.env.PFS_KICKOFF_V1;
  const legacyEvent = sessionEvent({ service: 'PFS', name: 'Cliente storico', email: 'old@x.it', budget: '1500' },
    { id: 'cs_pfs_legacy_1', amount_total: 35000 });
  const legacy = mkRes();
  await webhook(mkStreamReq(legacyEvent), legacy);
  const legacyDoc = store.get('pfsClients/cspfslegacy1');
  check('PFS flag spenta: il nuovo record conserva il flusso precedente',
    legacy.code === 200 && legacyDoc?.reviewRequired === undefined && legacyDoc?.pfsKickoffStatus === undefined);

  process.env.PFS_KICKOFF_V1 = '1';
  const paidEvent = sessionEvent({ service: 'PFS', name: 'Nuova Cliente', email: 'new@x.it',
    budget: '1500', bedrooms: '2', preferred_areas: 'Prati' },
  { id: 'cs_pfs_review_1', amount_total: 35000,
    event_created: Date.parse('2026-10-05T10:30:00.000Z') / 1000 });
  const emailsBefore = emails.length;
  let r = mkRes();
  await webhook(mkStreamReq(paidEvent), r);
  const clientId = 'cspfsreview1';
  const client = store.get('pfsClients/' + clientId);
  const searches = [...store.entries()].filter(([key]) => key.startsWith('radarSearches/pfs_' + clientId + '_'));
  const tasks = [...store.entries()].filter(([key, value]) => key.startsWith('operatorTasks/') && value.source === 'pfs-kickoff');
  check('PFS flag accesa: scadenza interna UTC esattamente +48h e reviewRequired',
    r.code === 200 && client?.reviewRequired === true
      && client.paid_at === '2026-10-05T10:30:00.000Z'
      && client.firstShortlistDueAt === '2026-10-07T10:30:00.000Z'
      && new Date(client.firstShortlistDueAt).getTime() - new Date(client.paid_at).getTime() === 48 * 3600_000
      && /Z$/.test(client.firstShortlistDueAt));
  check('PFS pagato: due ricerche BOOM, revisione copertura Casafari e reminder shortlist una volta',
    client?.pfsKickoffStatus === 'searches_ready' && client?.casafariAlertStatus === 'needs_review'
      && searches.length === 2 && tasks.length === 2
      && tasks.some(([, t]) => t.title.startsWith('Verifica copertura Casafari')
        && t.note.includes('alert Casafari esistenti')
        && t.note.includes('nuova ricerca solo se manca copertura')
        && t.note.includes('ricerca iniziale nello stock')
        && t.note.includes('non prova che le email Casafari siano attive'))
      && tasks.some(([, t]) => t.title.startsWith('Rivedi prima shortlist PFS')
        && t.due === '2026-10-07' && t.dueTime === '12:30'));
  check('PFS pagato: email cliente ancora a 72h',
    emails.length === emailsBefore + 2 && emails.slice(emailsBefore).some(e => e.r2_value === 'Within 72 hours'));
  const pfsCommand = readFileSync(new URL('../../pfs-command.html', import.meta.url), 'utf8');
  check('PFS command: mostra copertura da verificare e stock iniziale, non alert presunto attivo',
    pfsCommand.includes("c.casafariAlertStatus === 'needs_review'")
      && pfsCommand.includes('da verificare sugli alert esistenti')
      && pfsCommand.includes('verificare anche lo stock iniziale')
      && pfsCommand.includes('Il task non prova l’arrivo delle email'));

  r = mkRes();
  await webhook(mkStreamReq(paidEvent), r);
  check('PFS retry Stripe: zero nuovi task/ricerche/email e stesso codice portale',
    r.body?.duplicate === true && emails.length === emailsBefore + 2
      && [...store.keys()].filter(k => k.startsWith('radarSearches/pfs_' + clientId + '_')).length === 2
      && [...store.keys()].filter(k => k.startsWith('operatorTasks/') && store.get(k).source === 'pfs-kickoff').length === 2
      && store.get('pfsClients/' + clientId).portalAccessCode === client.portalAccessCode);

  failRadarCreates = 1;
  const partialEvent = sessionEvent({ service: 'PFS', name: 'Retry Cliente', email: 'retry@x.it',
    budget: '1300', preferred_areas: 'Prati' },
  { id: 'cs_pfs_retry_2', amount_total: 35000 });
  r = mkRes();
  await webhook(mkStreamReq(partialEvent), r);
  const partialId = 'cspfsretry2';
  const partial = store.get('pfsClients/' + partialId);
  const existingSearchKey = [...store.keys()].find(k => k.startsWith('radarSearches/pfs_' + partialId + '_'));
  check('PFS errore parziale: cliente resta pending, non finge alert pronto',
    r.code === 200 && partial?.pfsKickoffStatus === 'pending'
      && partial?.casafariAlertStatus === 'needs_review' && !!existingSearchKey);
  store.get(existingSearchKey).enabled = false;
  store.get(existingSearchKey).urlOverride = 'https://www.idealista.it/override-operatore/';
  const partialEmailCount = emails.length;
  process.env.CRON_SECRET = 'test-cron-secret';
  const { default: syncSearches, dailySyncDue, dailyMarkerEligible } = await import('../../api/pfs/sync-searches.js');
  const delayed = new Date('2026-10-07T04:03:00.000Z');
  check('PFS sync giornaliero: il cron in ritardo alle 04:03 non perde il giro',
    dailySyncDue(delayed, { lastFullSyncDay: '2026-10-06' }) === true);
  check('PFS sync giornaliero: un tentativo fallito è limitato a uno ogni ora',
    dailySyncDue(delayed, { lastFullSyncAttemptAt: '2026-10-07T04:01:00.000Z' }) === false
      && dailySyncDue(new Date('2026-10-07T05:04:00.000Z'), {
        lastFullSyncAttemptAt: '2026-10-07T04:01:00.000Z',
      }) === true
      && dailySyncDue(delayed, { lastFullSyncDay: '2026-10-07' }) === false);
  check('PFS sync manuale prima delle 04:00 non sposta il giro giornaliero',
    dailyMarkerEligible(new Date('2026-10-07T03:59:00.000Z')) === false
      && dailyMarkerEligible(delayed) === true
      && dailySyncDue(delayed, { lastFullSyncDay: '2026-10-06' }) === true);
  r = mkRes();
  await syncSearches({ method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } }, r);
  check('PFS worker: recupera il pending dopo errore webhook',
    r.code === 200 && r.body?.ok === true
      && store.get('pfsClients/' + partialId)?.pfsKickoffStatus === 'searches_ready'
      && [...store.keys()].filter(k => k.startsWith('radarSearches/pfs_' + partialId + '_')).length === 2);
  check('PFS worker: mantiene ricerche spente e URL rifinito a mano',
    store.get(existingSearchKey).enabled === false
      && store.get(existingSearchKey).urlOverride === 'https://www.idealista.it/override-operatore/');
  check('PFS worker: non manda email e non duplica task Casafari',
    emails.length === partialEmailCount
      && [...store.keys()].filter(k => k.startsWith('operatorTasks/') && store.get(k).source === 'pfs-kickoff').length === 4);
  delete process.env.PFS_KICKOFF_V1;
}

// ═══ 4c. Proposta manuale a un cliente con reviewRequired ═══
{
  const { stableIdFromUrl } = await import('../../api/pfs/_ingest.js');
  const importCasafari = (await import('../../api/casafari/import.js')).default;
  const clientId = 'cspfsreview1';
  const listing = { sourceUrl: 'https://www.casafari.com/listing/verified-1',
    source: 'casafari', price: 1200, title: 'Bilocale Prati', zone: 'Prati', advertiser: 'private' };
  const propertyId = stableIdFromUrl(listing.sourceUrl);
  store.set('pfsProperties/' + propertyId, { matchSummary: {
    at: '2026-10-05T09:00:00.000Z',
    pendingReview: [{ clientId, name: 'Nuova Cliente', score: 80 }], pushedTo: [],
  } });
  process.env.HOMIE_SECRET = 'homie-test';

  store.set('users/admin1', { role: 'landlord' });
  let r = mkRes();
  await importCasafari(mkReq({ clientId, listing, reviewConfirmed: true }, { authorization: 'Bearer firebase-token' }), r);
  check('PFS review manuale: landlord non può sbloccare il mazzo di un cliente',
    r.code === 403 && (store.get('pfsClients/' + clientId).portalProperties || []).length === 0);

  store.set('users/admin1', { role: 'admin' });
  r = mkRes();
  await importCasafari(mkReq({ clientId, listing, reviewConfirmed: true }, { 'x-homie-secret': 'homie-test' }), r);
  check('PFS review manuale: Homie non può attestare una verifica umana',
    r.code === 403 && (store.get('pfsClients/' + clientId).portalProperties || []).length === 0);

  r = mkRes();
  await importCasafari(mkReq({ clientId, listing }, { authorization: 'Bearer firebase-token' }), r);
  check('PFS review manuale: senza conferma esplicita non parte nessuna proposta',
    r.code === 400 && r.body?.error === 'review_confirmation_required'
      && (store.get('pfsClients/' + clientId).portalProperties || []).length === 0);

  r = mkRes();
  await importCasafari(mkReq({ clientId, listing, reviewConfirmed: true }, { authorization: 'Bearer firebase-token' }), r);
  check('PFS review manuale: admin conferma, un solo immobile nel mazzo e audit operatore',
    r.code === 200 && r.body?.pushedCount === 1
      && store.get('pfsClients/' + clientId).portalProperties.length === 1
      && store.get('pfsClients/' + clientId).portalActivity.at(-1)?.reviewConfirmedBy === 'admin:admin1');
  const summary = store.get('pfsProperties/' + propertyId)?.matchSummary;
  check('PFS review manuale: il candidato lascia la coda interna dopo la proposta',
    summary?.pendingReview?.length === 0 && summary?.pushedTo?.some(m => m.clientId === clientId));
  check('PFS review manuale: non avanza l’epoch del punteggio per tutti i clienti',
    summary?.at === '2026-10-05T09:00:00.000Z' && !!summary?.reviewedAt);

  const unknownListing = { sourceUrl: 'https://www.casafari.com/listing/unknown-advertiser',
    source: 'casafari', price: 1250, title: 'Bilocale senza inserzionista', zone: 'Prati' };
  r = mkRes();
  await importCasafari(mkReq({ clientId, listing: unknownListing, reviewConfirmed: true },
    { authorization: 'Bearer firebase-token' }), r);
  check('PFS review manuale: inserzionista assente resta unknown, non privato presunto',
    r.code === 200 && store.get('pfsProperties/' + stableIdFromUrl(unknownListing.sourceUrl))?.advertiser === 'unknown');
}

// Il vecchio harness admin aveva un secondo push automatico che bypassava
// `_ingest`: anche da lì i clienti reviewRequired devono restare interni.
{
  const matchTest = (await import('../../api/admin/match-test.js')).default;
  const sourceUrl = 'https://www.immobiliare.it/annunci/45678901/';
  const body = { dryRun: true, sourceUrl, price: 1200, zone: 'Prati', title: 'Bilocale Prati' };
  store.set('users/admin1', { role: 'landlord' });
  let r = mkRes();
  await matchTest(mkReq(body, { authorization: 'Bearer firebase-token' }), r);
  check('match-test: landlord non legge criteri e candidati di tutti i PFS',
    r.code === 403 && r.body?.error === 'admin_required' && !r.body?.results);
  r = mkRes();
  await matchTest(mkReq({ ...body, dryRun: false }, { authorization: 'Bearer firebase-token' }), r);
  check('match-test live: landlord non può creare o distribuire candidati PFS',
    r.code === 403 && !store.has('pfsProperties/' + (await import('../../api/pfs/_ingest.js')).stableIdFromUrl(sourceUrl)));

  const brief = (await import('../../api/pfs/brief.js')).default;
  r = mkRes();
  await brief({ method: 'GET', headers: { authorization: 'Bearer firebase-token' } }, r);
  check('brief: landlord non legge il riepilogo di tutti i clienti PFS',
    r.code === 403 && r.body?.error === 'admin_required');

  const { requireCronOrAdmin } = await import('../../api/pfs/_guard.js');
  r = mkRes();
  const deniedActor = await requireCronOrAdmin(
    { method: 'POST', headers: { authorization: 'Bearer firebase-token' } }, r);
  check('guard PFS: landlord non può invocare scan inbox, mercato o sync',
    deniedActor === null && r.code === 403 && r.body?.error === 'admin_required');

  store.set('users/admin1', { role: 'admin' });
  r = mkRes();
  const adminActor = await requireCronOrAdmin(
    { method: 'POST', headers: { authorization: 'Bearer firebase-token' } }, r);
  check('guard PFS: admin conserva l’accesso operativo', adminActor === 'admin:admin1' && r.code === 0);
  r = mkRes();
  await matchTest(mkReq(body, { authorization: 'Bearer firebase-token' }), r);
  const reviewedDry = r.body?.results?.find(x => x.clientId === 'cspfsretry2');
  check('match-test dry run: cliente reviewed è da rivedere, non da spingere',
    r.code === 200 && reviewedDry?.pendingReview === true && reviewedDry?.wouldPush === false);
  const deckBefore = (store.get('pfsClients/cspfsretry2').portalProperties || []).length;
  r = mkRes();
  await matchTest(mkReq({ ...body, dryRun: false }, { authorization: 'Bearer firebase-token' }), r);
  const { stableIdFromUrl } = await import('../../api/pfs/_ingest.js');
  const summary = store.get('pfsProperties/' + stableIdFromUrl(sourceUrl))?.matchSummary;
  check('match-test live: admin non espone candidati reviewed; li lascia nel feed interno',
    r.code === 200 && (store.get('pfsClients/cspfsretry2').portalProperties || []).length === deckBefore
      && r.body?.pendingReview?.some(x => x.clientId === 'cspfsretry2')
      && summary?.pendingReview?.some(x => x.clientId === 'cspfsretry2'));
  check('match-test live: cliente storico conserva il push automatico',
    r.body?.pushedTo?.some(x => x.clientId === 'cspfslegacy1'));
}

// ═══ 5. stripe-webhook: idempotenza DEPOSIT ═══
{
  store.set('contracts/ctr1', { tenantId: 't1', propertyId: 'p1', tenantEmail: 't@x.it' });
  const ev = sessionEvent({ service: 'DEPOSIT', contractId: 'ctr1' }, { id: 'cs_dep_1', amount_total: 120000 });
  let r = mkRes();
  const eb = emails.length;
  await webhook(mkStreamReq(ev), r);
  check('webhook DEPOSIT: 1° evento → payment dep_ scritto + contratto marcato', store.has('payments/dep_ctr1') && store.get('contracts/ctr1').depositPaid === true);
  const firstEmails = emails.length - eb;

  r = mkRes();
  await webhook(mkStreamReq(ev), r);
  check('webhook DEPOSIT: retry → duplicate, niente nuove email', r.body?.duplicate === true && emails.length === eb + firstEmails);
}

// ═══ 6. stripe-webhook: PREAGREEMENT pagato + duplicate ═══
{
  const token = 'a'.repeat(32);
  store.set('preAgreements/pa1', { token, ref: 'BOOM-X', status: 'accepted' });
  const ev = sessionEvent({ service: 'PREAGREEMENT', token }, { id: 'cs_pa_1', amount_total: 50000 });
  let r = mkRes();
  await webhook(mkStreamReq(ev), r);
  const pa = store.get('preAgreements/pa1');
  check('webhook PA: pagamento → status paid + paidSessionId', pa.status === 'paid' && pa.paidSessionId === 'cs_pa_1');

  const eb = emails.length;
  r = mkRes();
  await webhook(mkStreamReq(ev), r);
  check('webhook PA: retry → duplicate, niente nuove email', r.body?.duplicate === true && emails.length === eb);
}

// ═══ 7. convertPaToContract: idempotente su ID deterministico ═══
{
  const { convertPaToContract } = await import('../../api/preagreement/convert.js');
  store.set('properties/prop9', { ownerId: 'll9', name: 'Casa', ownerName: 'Rossi' });
  store.set('users/u9', { email: 'ten@x.it', role: 'tenant' });
  const pa = {
    status: 'accepted', propertyId: 'prop9', autoConvert: true, ref: 'BOOM-Y',
    tenant: { fullName: 'Teo Neri', email: 'ten@x.it', phone: '333' },
    money: { rent: 1200, deposit: 2400, depositMonths: 2 }, lease: { months: 12, startDate: '2026-09-01' },
  };
  const out1 = await convertPaToContract({ pa, paId: 'pa9' });
  check('convert: 1ª chiamata crea contracts/pa_pa9', out1.ok && out1.contractId === 'pa_pa9' && store.has('contracts/pa_pa9'));
  const out2 = await convertPaToContract({ pa, paId: 'pa9' });   // race/retry: back-link stantio, stesso PA
  check('convert: 2ª chiamata → already, STESSO contratto (niente duplicati)', out2.ok && out2.already === true && out2.contractId === 'pa_pa9');
  const contractDocs = [...store.keys()].filter(k => k.startsWith('contracts/') && store.get(k).preAgreementId === 'pa9');
  check('convert: un solo contratto per il PA', contractDocs.length === 1);
}

// ═══ 8. Link di pagamento (token derivato + ramo INVOICE) ═══
{
  const { payToken, verifyPayToken, payLink, collectionFor } = await import('../../api/payments/_token.js');

  check('token: stesso documento → stesso token (link stabile nel tempo)',
    payToken('pay', 'p1') === payToken('pay', 'p1'));
  check('token: documenti diversi → token diversi',
    payToken('pay', 'p1') !== payToken('pay', 'p2'));
  check('token: stesso id ma tipo diverso → token diverso (una fattura non apre una rata)',
    payToken('pay', 'x1') !== payToken('inv', 'x1'));
  check('token: verifica corretta', verifyPayToken('pay', 'p1', payToken('pay', 'p1')));
  check('token: token altrui rifiutato', !verifyPayToken('pay', 'p1', payToken('pay', 'p2')));
  check('token: token vuoto rifiutato', !verifyPayToken('pay', 'p1', ''));
  check('token: tipo sconosciuto → nessuna collezione', collectionFor('utenti') === null);
  check('link: contiene tipo, id e token', /k=pay&id=p1&t=[0-9a-f]{24}$/.test(payLink('pay', 'p1')));

  // link-for: solo admin per le fatture, e mai per un documento già pagato
  const linkFor = (await import('../../api/payments/link-for.js')).default;
  store.set('invoices/inv1', { number: '2026/001', amount: 500, status: 'pending' });
  store.set('invoices/inv2', { number: '2026/002', amount: 500, status: 'paid' });
  store.set('users/admin1', { role: 'admin', email: 'a@b.c' });

  let r = mkRes();
  await linkFor(mkReq({ kind: 'inv', id: 'inv1' }, { authorization: 'Bearer t' }), r);
  check('link-for: admin ottiene il link della fattura', r.code === 200 && /k=inv&id=inv1/.test(r.body?.url || ''));

  r = mkRes();
  await linkFor(mkReq({ kind: 'inv', id: 'inv2' }, { authorization: 'Bearer t' }), r);
  check('link-for: documento già pagato → 409, nessun link', r.code === 409);

  r = mkRes();
  await linkFor(mkReq({ kind: 'inv', id: 'non-esiste' }, { authorization: 'Bearer t' }), r);
  check('link-for: documento inesistente → 404', r.code === 404);

  r = mkRes();
  await linkFor(mkReq({ kind: 'utenti', id: 'x' }, { authorization: 'Bearer t' }), r);
  check('link-for: tipo non consentito → 400 (non si generano link su altre collezioni)', r.code === 400);

  // webhook INVOICE: incassa, è idempotente, e non sovrascrive mai un già pagato
  const eb = emails.length;
  let ev = sessionEvent({ service: 'INVOICE', invoiceId: 'inv1', number: '2026/001', amount: '500' }, { id: 'cs_inv_1', amount_total: 50000 });
  r = mkRes();
  await webhook(mkStreamReq(ev), r);
  const inv = store.get('invoices/inv1');
  check('webhook INVOICE: fattura segnata pagata via stripe',
    inv?.status === 'paid' && inv?.paidVia === 'stripe' && inv?.stripeSessionId === 'cs_inv_1');
  // NB: le email di questo ramo escono via nodemailer (non EmailJS), che qui
  // non è stubbato — si verifica quindi ciò che tiene insieme il portale:
  // la notifica operativa scritta su agentNotifications.
  check('webhook INVOICE: incasso notificato nel portale',
    [...store.keys()].some(k => k.startsWith('agentNotifications/inv-') && !k.includes('double')));

  const eb2 = emails.length;
  r = mkRes();
  await webhook(mkStreamReq(ev), r);
  check('webhook INVOICE: retry stessa sessione → duplicate, zero nuove email',
    r.body?.duplicate === true && emails.length === eb2);

  // Una SECONDA sessione su una fattura già pagata non deve sovrascrivere
  // nulla: è un probabile doppio incasso e va segnalato, non nascosto.
  r = mkRes();
  await webhook(mkStreamReq(sessionEvent(
    { service: 'INVOICE', invoiceId: 'inv1', amount: '500' }, { id: 'cs_inv_2', amount_total: 50000 })), r);
  check('webhook INVOICE: seconda sessione → allarme doppio incasso, dato non sovrascritto',
    r.body?.doublePayment === true && store.get('invoices/inv1').stripeSessionId === 'cs_inv_1');
  check('webhook INVOICE: doppio incasso notificato all\'operatore',
    [...store.keys()].some(k => k.startsWith('agentNotifications/inv-double-')));
}

// ═══ 9. convert: verità sul deposito + co-conduttori + provvigione ═══
{
  const { convertPaToContract } = await import('../../api/preagreement/convert.js');
  store.set('properties/prop10', { ownerId: 'll10', name: 'Casa10', ownerName: 'Verdi' });
  const pa = {
    status: 'paid', paidEur: 3449.6, paidAt: '2026-07-10', propertyId: 'prop10', ref: 'BOOM-Z',
    tenant: { fullName: 'Julie V', email: 'julie@x.fr', phone: '333', cf: 'VRBJLU06M44Z110V' },
    tenants: [
      { fullName: 'Julie V', email: 'julie@x.fr', phone: '333', cf: 'VRBJLU06M44Z110V' },
      { fullName: 'Anouk G', email: 'anouk@x.fr', cf: 'grtnka06l65z110o', dob: '2006-07-25', birthPlace: 'Bouliac' },
    ],
    money: { rent: 1400, deposit: 2800, depositMonths: 2, depositAtSigning: 1400, depositAtMoveIn: 1400,
             fee: 1680, feeVatPct: 22, feeVat: 369.6, feeTotal: 2049.6, feeDue: 'move-in', feeMode: 'pct' },
    lease: { months: 12, startDate: '2026-09-01', endDate: '2027-08-31' },
  };
  const out = await convertPaToContract({ pa, paId: 'pa10' });
  const c = store.get('contracts/pa_pa10');
  check('convert PAID: depositAlreadyPaidEur = acconto incassato, non depositPaid (resta saldo)',
    out.ok && c && c.depositAlreadyPaidEur === 1400 && c.depositPaid === false);
  check('convert: rata saldo depbal_ creata per la parte al move-in',
    store.has('payments/depbal_pa_pa10') && store.get('payments/depbal_pa_pa10').amount === 1400);
  check('convert: co-conduttore con IDENTITÀ COMPLETA (non solo il nome)',
    Array.isArray(c.coTenants) && c.coTenants.length === 1 && c.coTenants[0].cf === 'GRTNKA06L65Z110O'
    && c.coTenants[0].birthPlace === 'Bouliac' && c.cohabitants.includes('C.F. GRTNKA06L65Z110O'));
  check('convert: clausola di solidarietà dei co-conduttori nelle altre clausole',
    /si obbligano in solido/.test(c.otherClauses) && c.otherClauses.includes('Anouk G'));
  check('convert: la provvigione VIAGGIA sul contratto (prima spariva)',
    c.agencyFee && c.agencyFee.totalEur === 2049.6 && c.agencyFee.due === 'move-in');
  check('convert: scheda cliente creata anche per il co-conduttore',
    [...store.keys()].some(k => k.startsWith('users/') && (store.get(k) || {}).name === 'Anouk G'));
}

// ═══ 9b. Sprint 1 — l'immobile DALLA proposta, la guardia sovrapposizioni, il preflight ═══
{
  const { convertPaToContract, overlapConflict, propertyFromPa, propertyIdForPa } = await import('../../api/preagreement/convert.js');
  const convert = (await import('../../api/preagreement/convert.js')).default;

  // ── la regola pura, verificata per mutazione ──
  const live = { id: 'c1', status: 'active', startDate: '2026-09-01', endDate: '2027-08-31', tenantName: 'Marco', unit: '' };
  const q = { paId: 'paX', unit: '', startDate: '2026-10-01', endDate: '2027-03-31' };
  check('overlap: stesso immobile, entrambi attivi, date che si toccano → conflitto col nome', (overlapConflict([live], q) || {}).tenantName === 'Marco');
  check('overlap: date disgiunte → nessun conflitto', overlapConflict([live], { ...q, startDate: '2027-09-01', endDate: '2028-08-31' }) === null);
  check('overlap: contratto non attivo → ignorato', overlapConflict([{ ...live, status: 'ended' }], q) === null);
  check('overlap: interni dichiarati e DIVERSI → due stanze, legittimo', overlapConflict([{ ...live, unit: 'A' }], { ...q, unit: 'B' }) === null);
  check('overlap: stesso interno (anche scritto «int. A» / «a») → conflitto', !!overlapConflict([{ ...live, unit: 'int. A' }], { ...q, unit: 'a' }));
  check('overlap: un interno vuoto NON esclude (vuoto ≠ diverso)', !!overlapConflict([{ ...live, unit: 'A' }], { ...q, unit: '' }) && !!overlapConflict([live], { ...q, unit: 'B' }));
  check('overlap: il contratto della STESSA proposta (retry) non conta mai', overlapConflict([{ ...live, id: 'pa_paX' }], q) === null && overlapConflict([{ ...live, preAgreementId: 'paX' }], q) === null);
  check('overlap: contratto vivo senza endDate = aperto → conflitto', !!overlapConflict([{ ...live, endDate: null }], { ...q, startDate: '2030-01-01', endDate: '2030-06-30' }));
  check('overlap: senza data d\'inizio della proposta niente verdetto (mai un falso conflitto)', overlapConflict([live], { ...q, startDate: null }) === null);

  // ── l'immobile che manca nasce dalla proposta ──
  const paN = { status: 'paid', paidEur: 2000, paidAt: '2026-08-20', ref: 'BOOM-N',
    property: { address: 'Via Simeto 12, Roma', floor: '2', unit: '7', condition: 'Furnished' },
    landlord: { name: 'Ada Rossi', email: 'ada@x.it', phone: '+39 333' },
    tenant: { fullName: 'Nina Test', email: 'nina@x.it', phone: '333' },
    money: { rent: 900, deposit: 1800, depositMonths: 2 }, lease: { months: 12, startDate: '2026-10-01', endDate: '2027-09-30' } };
  const sizeN = store.size;
  const r0 = await convertPaToContract({ pa: paN, paId: 'paN' });
  check('senza immobile: no_property + canCreate:true (l\'indirizzo c\'è), NIENTE scritto', !r0.ok && r0.error === 'no_property' && r0.canCreate === true && store.size === sizeN);
  const r1 = await convertPaToContract({ pa: paN, paId: 'paN', createProperty: true, actor: 'op@x' });
  const prop = store.get('properties/' + propertyIdForPa('paN'));
  check('createProperty: l\'immobile nasce DALLA proposta — id deterministico, indirizzo, interno, locatore, canone, provenienza',
    r1.ok && r1.propertyCreated === true && r1.propertyId === 'prop_pa_paN' && !!prop && prop.address === 'Via Simeto 12, Roma' && prop.unit === '7' && prop.interno === '7'
    && prop.ownerName === 'Ada Rossi' && prop.rent === 900 && prop.source === 'preagreement' && prop.preAgreementId === 'paN' && prop.availabilityStatus === 'rented');
  check('createProperty: il contratto porta quell\'immobile e l\'interno; la proposta riceve propertyId col back-link',
    store.get('contracts/pa_paN').propertyId === 'prop_pa_paN' && store.get('contracts/pa_paN').unit === '7' && store.get('preAgreements/paN').propertyId === 'prop_pa_paN');
  const nProps = () => [...store.keys()].filter(k => k.startsWith('properties/prop_pa_paN')).length;
  const r2 = await convertPaToContract({ pa: { ...paN, contractId: 'pa_paN' }, paId: 'paN', createProperty: true });
  check('createProperty ripetuto: already, UN immobile (mai due)', r2.ok && r2.already === true && nProps() === 1);
  const pf = propertyFromPa({ pa: paN, paId: 'paN' });
  check('propertyFromPa: nome dalla via + interno, arredato letto dallo stato, MAI mq/zona/catasto inventati',
    pf.name === 'Via Simeto 12 int. 7' && pf.furnished === true && !('sqm' in pf) && !('zone' in pf) && !('cadastralData' in pf));

  // ── la guardia nella conversione vera ──
  store.set('properties/propO', { ownerId: 'llO', name: 'Duplex', ownerName: 'Bianchi' });
  store.set('contracts/cLive', { propertyId: 'propO', status: 'active', startDate: '2026-09-01', endDate: '2027-08-31', tenantName: 'Marco Primo', signatureStatus: 'complete' });
  const paO = { status: 'paid', paidAt: '2026-09-01', ref: 'BOOM-O', propertyId: 'propO', property: { address: 'Via Duplex 1' }, landlord: { name: 'Bianchi' },
    tenant: { fullName: 'Secondo Inquilino', email: 'sec@x.it' }, money: { rent: 1000, deposit: 2000, depositMonths: 2 }, lease: { months: 12, startDate: '2026-11-01', endDate: '2027-10-31' } };
  const rO = await convertPaToContract({ pa: paO, paId: 'paO' });
  check('conversione su casa GIÀ affittata (date sovrapposte) → overlap col nome, NESSUN contratto scritto',
    !rO.ok && rO.error === 'overlap' && rO.overlap.tenantName === 'Marco Primo' && rO.overlap.contractId === 'cLive' && !store.has('contracts/pa_paO'));
  const rO2 = await convertPaToContract({ pa: paO, paId: 'paO', force: true, actor: 'op@x' });
  check('force:true → creato comunque, e la scelta resta scritta nella risposta (overlapForced)',
    rO2.ok && store.has('contracts/pa_paO') && rO2.overlapForced && rO2.overlapForced.contractId === 'cLive');
  store.set('properties/propR', { ownerId: 'llR', name: 'Stanze', ownerName: 'Neri' });
  store.set('contracts/cRoomA', { propertyId: 'propR', status: 'active', startDate: '2026-09-01', endDate: '2027-08-31', tenantName: 'Stanza A', unit: 'A' });
  const paR = { ...paO, propertyId: 'propR', property: { address: 'Via Stanze 1', unit: 'B' }, tenant: { fullName: 'Terzo Inquilino', email: 'ter@x.it' } };
  const rR = await convertPaToContract({ pa: paR, paId: 'paR' });
  check('stanza B accanto alla stanza A (interni dichiarati): nessuna guardia, contratto creato con unit', rR.ok && !rR.overlapForced && store.get('contracts/pa_paR').unit === 'B');

  // ── la porta HTTP: i codici che la console legge ──
  store.set('users/admin1', { role: 'admin', email: 'a@b.c' });
  store.set('preAgreements/paH', { ...paO });
  let rh = mkRes();
  await convert(mkReq({ id: 'paH' }, { authorization: 'Bearer t' }), rh);
  check('HTTP convert: sovrapposizione → 409 overlap col dettaglio nel body', rh.code === 409 && rh.body.error === 'overlap' && rh.body.overlap.tenantName === 'Marco Primo');
  store.set('preAgreements/paI', { ...paN });
  rh = mkRes();
  await convert(mkReq({ id: 'paI' }, { authorization: 'Bearer t' }), rh);
  check('HTTP convert: senza immobile → 400 no_property con canCreate:true (la console offre «crea dalla proposta»)', rh.code === 400 && rh.body.error === 'no_property' && rh.body.canCreate === true);
  rh = mkRes();
  await convert(mkReq({ id: 'paI', createProperty: true }, { authorization: 'Bearer t' }), rh);
  check('HTTP convert: createProperty:true → 200, propertyCreated, immobile e contratto nati', rh.code === 200 && rh.body.propertyCreated === true && store.has('properties/prop_pa_paI') && store.has('contracts/pa_paI'));

  // ── il preflight: nessuna scrittura, i puntini per parte, la sovrapposizione riportata ──
  const sizeD = store.size;
  const rD = await convertPaToContract({ pa: { ...paR, tenant: { fullName: 'Dry Run', email: 'dry@x.it' } }, paId: 'paD', dryRun: true });
  check('dryRun: NESSUNA scrittura (né profilo, né immobile, né contratto), contractId annunciato, exists:false',
    rD.ok && rD.dryRun === true && rD.contractId === 'pa_paD' && rD.exists === false && store.size === sizeD && !store.has('contracts/pa_paD') && !store.has('users/auto_' + (sizeD + 1)));
  check('dryRun: la completezza per parte — il CF del conduttore manca e sta sotto tenant (etichetta EN); il PDF stamperebbe puntini',
    rD.completeness && rD.completeness.dots.length > 0 && rD.completeness.byOwner.tenant.some(x => x.key === 'tenantCF' && /fiscal|tax|codice/i.test(x.label)) && rD.completeness.ready.contract === false);
  const rD2 = await convertPaToContract({ pa: { ...paO }, paId: 'paD2', dryRun: true });
  check('dryRun su casa occupata: la sovrapposizione si RIPORTA (in preflight non è un errore), niente scritto', rD2.ok && rD2.overlap && rD2.overlap.tenantName === 'Marco Primo' && !store.has('contracts/pa_paD2'));
  const rD3 = await convertPaToContract({ pa: paN, paId: 'paD3', createProperty: true, dryRun: true });
  check('dryRun + createProperty: si valuta sull\'immobile CHE NASCEREBBE, senza crearlo', rD3.ok && rD3.propertyId === 'prop_pa_paD3' && !store.has('properties/prop_pa_paD3') && !!rD3.completeness);
  rh = mkRes();
  await convert(mkReq({ id: 'paH', dryRun: true }, { authorization: 'Bearer t' }), rh);
  check('HTTP dryRun: 200 con overlap + completeness, contratto non scritto', rh.code === 200 && rh.body.dryRun === true && rh.body.overlap && !!rh.body.completeness && !store.has('contracts/pa_paH'));

  // ── i puntini che il DATO chiude: tipo di documento e attestazione dalla proposta ──
  const paT = { ...paN, tenant: { ...paN.tenant, email: 'tania@x.it', idDocType: 'passport' }, uploads: [{ url: 'https://s/esigenza.pdf', name: 'esigenza.pdf', kind: 'extra' }], extraDoc: 'Lettera del datore di lavoro' };
  const rT = await convertPaToContract({ pa: paT, paId: 'paT', createProperty: true });
  const uT = [...store.keys()].map(k => store.get(k)).find(d => d && d.email === 'tania@x.it');
  check('convert: il TIPO di documento della proposta arriva al profilo (docType) — il contratto non stampa più «identificato/a mediante ………»',
    rT.ok && !!uT && uT.docType === 'passport' && uT.idDocType === 'passport');
  check('convert: l\'attestazione caricata sulla proposta NOMINA il documento (transitionalDocs), invece dei puntini',
    store.get('contracts/pa_paT').transitionalDocs === 'Lettera del datore di lavoro' && store.get('contracts/pa_paN').transitionalDocs === '');
}

// ═══ 10. convert: lo STUDENTE riceve l'Allegato C anche quando nessuno
// dice il tipo — è la strada di _auto.js (immobile collegato: il contratto
// nasce da solo) e del tasto 🖊 Magic Sign. Prima uscivano tutti Allegato B.
{
  const { convertPaToContract } = await import('../../api/preagreement/convert.js');
  store.set('properties/prop11', { ownerId: 'll11', name: 'Casa Studenti', ownerName: 'Bianchi' });
  const paStud = {
    status: 'accepted', propertyId: 'prop11', ref: 'BOOM-S',
    tenant: { fullName: 'Marta Neri', email: 'marta@x.it', phone: '333' },
    money: { rent: 700, deposit: 1400, depositMonths: 2 },
    lease: {
      months: 10, startDate: '2026-09-01', type: 'Student Housing (Allegato C)',
      studenti: { corsoStudi: 'Laurea Magistrale in Economia', universita: 'LUISS Guido Carli',
                  universitaIndirizzo: 'Viale Romania 32, Roma', tipoIscrizione: 'Laurea Magistrale',
                  annoAccademico: '2026/2027' },
    },
  };
  // NOTA: nessun `type` passato — esattamente come fa _auto.js
  const outS = await convertPaToContract({ pa: paStud, paId: 'pa11' });
  const cs = store.get('contracts/pa_pa11');
  check('convert AUTO: un deal studenti nasce type=studenti senza che nessuno lo dica',
    outS.ok && cs && cs.type === 'studenti');
  check('convert: corso e università finiscono sul contratto (l\'Allegato C li nomina)',
    cs && cs.studenti && cs.studenti.corsoStudi === 'Laurea Magistrale in Economia'
    && cs.studenti.universita === 'LUISS Guido Carli' && cs.studenti.annoAccademico === '2026/2027');
  check('convert: anche i campi legacy letti dal generatore sono pieni',
    cs && cs.courseName === 'Laurea Magistrale in Economia' && cs.universityName === 'LUISS Guido Carli');

  // e il contrario: un transitorio non diventa mai studenti, e non porta
  // dati universitari addosso
  store.set('properties/prop12', { ownerId: 'll12', name: 'Casa Lavoro', ownerName: 'Neri' });
  const paTr = {
    status: 'accepted', propertyId: 'prop12', ref: 'BOOM-T',
    tenant: { fullName: 'Luca Blu', email: 'luca@x.it' },
    money: { rent: 1100, deposit: 1100, depositMonths: 1 },
    lease: { months: 12, startDate: '2026-09-01', type: 'Transitional Lease' },
  };
  await convertPaToContract({ pa: paTr, paId: 'pa12' });
  const ct = store.get('contracts/pa_pa12');
  check('convert: un transitorio resta transitorio, senza dati universitari',
    ct && ct.type === 'transitorio' && ct.studenti === null && ct.courseName === '' && ct.universityName === '');

  // il generatore, letto lo stesso contratto, sceglie davvero l'altro modello
  const disp = readFileSync(new URL('../../js/contract-pdf.js', import.meta.url), 'utf8');
  check('e il generatore, su quel type, sceglie l\'Allegato C',
    /\(env\.contract\.type === 'studenti'\) \? buildAllegatoC\(env\) : is32\(env\.contract\) \? buildAllegatoA\(env\) : buildAllegatoB\(env\)/.test(disp));
}

// ═══ Scalabilità: clienti e ricerche oltre la prima pagina ═══
{
  for (let i = 0; i < 205; i++) store.set('pfsClients/bulk_' + i, {
    name: 'Bulk ' + i, stage: 'placed', budget: 1500, portalEnabled: true,
    pfsKickoffStatus: 'pending',
  });
  const paidAt = new Date().toISOString();
  store.set('pfsClients/outside_page', { name: 'Cliente oltre pagina', stage: 'searching',
    budget: 1300, portalEnabled: true, reviewRequired: true,
    pfsKickoffStatus: 'pending', paid_at: paidAt,
    firstShortlistDueAt: new Date(Date.parse(paidAt) + 48 * 3600_000).toISOString() });
  for (let i = 0; i < 205; i++) store.set('radarSearches/a_dummy_' + i, {
    auto: false, enabled: false, portal: 'idealista', searchUrl: 'https://www.idealista.it/' });
  store.set('radarSearches/pfs_outside_page_idealista', { auto: true, enabled: true,
    clientId: 'outside_page', portal: 'idealista', searchUrl: 'https://www.idealista.it/affitto-case/roma-roma/' });
  store.set('radarSearches/pfs_missing_idealista', { auto: true, enabled: true,
    clientId: 'missing', portal: 'idealista', searchUrl: 'https://www.idealista.it/affitto-case/roma-roma/' });
  store.set('pfsRadarHealth/sync', { lastFullSyncDay: new Date().toISOString().slice(0, 10) });
  const syncSearches = (await import('../../api/pfs/sync-searches.js')).default;
  let r = mkRes();
  await syncSearches({ method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } }, r);
  check('sync pending: cliente pagato oltre 200 riceve il kickoff dal worker',
    r.code === 200 && r.body?.mode === 'pending'
      && store.get('pfsClients/outside_page')?.pfsKickoffStatus === 'searches_ready'
      && [...store.keys()].filter(k => k.startsWith('radarSearches/pfs_outside_page_')).length === 2);

  const { ingestProperty, stableIdFromUrl } = await import('../../api/pfs/_ingest.js');
  const sourceUrl = 'https://www.immobiliare.it/annunci/99999991/';
  const ingest = await ingestProperty({ sourceUrl, source: 'immobiliare', price: 1200,
    title: 'Bilocale oltre pagina', advertiser: 'private' }, { threshold: 0 });
  const summary = store.get('pfsProperties/' + stableIdFromUrl(sourceUrl))?.matchSummary;
  check('ingest vero: cliente reviewed oltre 200 viene valutato e resta interno',
    ingest.ok === true && summary?.pendingReview?.some(m => m.clientId === 'outside_page')
      && !(store.get('pfsClients/outside_page')?.portalProperties || []).some(p => p.id === stableIdFromUrl(sourceUrl)));

  store.set('users/admin1', { role: 'admin' });
  const matchTest = (await import('../../api/admin/match-test.js')).default;
  r = mkRes();
  await matchTest(mkReq({ dryRun: true, sourceUrl: 'https://www.immobiliare.it/annunci/99999992/',
    price: 1200, title: 'Bilocale oltre pagina' }, { authorization: 'Bearer firebase-token' }), r);
  check('match-test: include il cliente attivo oltre 200 senza perdere i criteri',
    r.code === 200 && r.body?.results?.some(x => x.clientId === 'outside_page'));

  r = mkRes();
  await syncSearches({ method: 'GET', headers: { authorization: 'Bearer firebase-token' } }, r);
  check('sync completa: cliente attivo oltre 200 verificato, ricerca non spenta',
    r.code === 200 && r.body?.mode === 'full'
      && store.get('radarSearches/pfs_outside_page_idealista')?.enabled === true);
  check('sync completa: ricerca oltre 200 di cliente davvero mancante viene spenta',
    store.get('radarSearches/pfs_missing_idealista')?.enabled === false);

  const { listPfsDocs } = await import('../../api/pfs/_pages.js');
  let overflow = null;
  try { await listPfsDocs('pfsClients', { maxDocs: 2 }); }
  catch (e) { overflow = e; }
  check('paginazione oltre il limite: fallisce esplicitamente, senza lista parziale',
    overflow?.message === 'pfsClients_scan_limit_exceeded');
}

console.log('\n' + '─'.repeat(48));
console.log(`Money paths: ${passed} passed, ${failed} failed`);
if (failed) { console.error('FAILED: ' + bad.join(' | ')); process.exit(1); }
console.log('Tutti i percorsi soldi si comportano come previsto.');
