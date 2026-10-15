// tests/efficienza/run.mjs — la macchina smette di rileggere l'archivio per
// rispondere alla stessa domanda.
//
// LA MISURA DEL 4/10/2026 (log di Vercel, 24 ore): il Mac di Homie chiama
// agent/state.snapshot 741 volte e agent/risk.scan 719 volte al giorno — una
// ogni due minuti — e ogni risk.scan rilegge fino a ~2.280 documenti; e
// segretaria/scan-replies leggeva ~190 conversazioni UNA PER UNA ogni 10
// minuti (la raffica di login a token scaduto, i timeout a 60s).
// Qui: la fotografia si calcola una volta e si riusa per 10 minuti (memoria
// calda → zero letture, istanza fredda → UNA lettura, `fresh:true` → il dato
// di adesso, scaduta → ricalcolo), e le letture in blocco a pezzi da 100 con
// un ripiego che non è mai peggio di prima.
// Uso: node tests/efficienza/run.mjs
import { readFileSync } from 'node:fs';

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'homie-efficienza';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ── Firestore in memoria con contatori per tipo di richiesta ────────────
const store = new Map();
const calls = { query: 0, get: 0, batchGet: 0, patch: 0 };
let batchGetEnabled = true, inFlightGets = 0, maxInFlightGets = 0;
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const toFsFields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };
const docName = (k) => 'projects/test-proj/databases/(default)/documents/' + k;

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', localId: 'svc' });
  if (url.includes('firestore.googleapis.com')) {
    const path = url.slice(url.indexOf('/documents') + 10).replace(/^\//, '').split('?')[0];
    if (path.startsWith(':batchGet')) {
      calls.batchGet++;
      if (!batchGetEnabled) return new Response('not found', { status: 404 });
      const docs = (JSON.parse(opts.body || '{}').documents || []);
      return okJson(docs.map(n => { const k = n.split('/documents/')[1]; return store.has(k) ? { found: { name: n, fields: toFsFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z' } } : { missing: n }; }));
    }
    if (path.startsWith(':runQuery')) {
      calls.query++;
      const sq = (JSON.parse(opts.body || '{}') || {}).structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const ff = (sq.where || {}).fieldFilter;
      const rows = [];
      for (const [k] of store) {
        if (!k.startsWith(col + '/') || k.slice(col.length + 1).includes('/')) continue;
        if (ff && (store.get(k) || {})[ff.field.fieldPath] !== fromFs(ff.value)) continue;
        rows.push({ document: { name: docName(k), fields: toFsFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z' } });
        if (sq.limit && rows.length >= sq.limit) break;
      }
      return okJson(rows.length ? rows : [{}]);
    }
    if (opts.method === 'PATCH') {
      calls.patch++;
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      return okJson({ name: docName(path) });
    }
    calls.get++;
    inFlightGets++; maxInFlightGets = Math.max(maxInFlightGets, inFlightGets);
    await new Promise(r => setTimeout(r, 2));
    inFlightGets--;
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: docName(path), fields: toFsFields(doc), updateTime: '2026-01-01T00:00:00Z' });
  }
  throw new Error('fetch non stubbata: ' + url);
};
const reset = () => { for (const k of Object.keys(calls)) calls[k] = 0; };
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const mkReq = (body) => ({ method: 'POST', headers: { 'x-homie-secret': 'homie-efficienza' }, body });

// Archivio di prova: abbastanza da vedere che la seconda chiamata non rilegge
for (let i = 0; i < 30; i++) store.set('contracts/c' + i, { status: i % 3 ? 'active' : 'draft', endDate: '2026-12-01', propertyId: 'p' + i, tenantId: 'u' + i });
for (let i = 0; i < 40; i++) store.set('payments/pay' + i, { status: 'pending', dueDate: '2026-01-0' + (1 + (i % 9)), amount: 1000 });
for (let i = 0; i < 20; i++) store.set('leads/l' + i, { status: 'new', createdAt: '2026-10-0' + (1 + (i % 4)) + 'T10:00:00Z', name: 'L' + i });
for (let i = 0; i < 30; i++) store.set('properties/p' + i, { name: 'Casa ' + i, ownerId: 'o' + i });

const MEMO = await import('../../api/agent/_memo.js');
const { default: snapshotH } = await import('../../api/agent/state.snapshot.js');
const { default: riskH } = await import('../../api/agent/risk.scan.js');

// ═══ 1. LA FOTOGRAFIA RIUSATA ═════════════════════════════════════════════
{
  MEMO._resetMemoForTests();
  reset();
  let r = mkRes(); await snapshotH(mkReq({ scope: 'all' }), r);
  const q1 = calls.query;
  check('snapshot: la prima chiamata calcola (letture vere) e lo dice — cached:false',
    r.code === 200 && r.body.cached === false && r.body.cachedAt === null && q1 >= 5 && r.body.contracts && r.body.payments.pending === 40);
  check('snapshot: la fotografia si scrive UNA volta nel suo documento (stringa JSON, mai una mappa lossy)',
    calls.patch === 1 && typeof (store.get('heartbeat/agent-memo-snapshot-all') || {}).json === 'string');

  reset();
  r = mkRes(); await snapshotH(mkReq({ scope: 'all' }), r);
  check('snapshot: la chiamata dopo (istanza calda) non legge NIENTE e dichiara l\'età della fotografia',
    r.code === 200 && r.body.cached === true && !!r.body.cachedAt && calls.query === 0 && calls.get === 0 && r.body.payments.pending === 40);

  MEMO._resetMemoForTests();   // istanza fredda: la memoria è vuota, il documento c'è
  reset();
  r = mkRes(); await snapshotH(mkReq({ scope: 'all' }), r);
  check('snapshot: istanza fredda → UNA lettura del documento, nessuna query sull\'archivio',
    r.code === 200 && r.body.cached === true && calls.get === 1 && calls.query === 0 && r.body.payments.pending === 40);

  reset();
  store.set('payments/pay_new', { status: 'pending', dueDate: '2026-01-01', amount: 500 });
  r = mkRes(); await snapshotH(mkReq({ scope: 'all', fresh: true }), r);
  check('snapshot: fresh:true dà il dato di ADESSO (ricalcola, vede la rata nuova) e rinnova la fotografia',
    r.code === 200 && r.body.cached === false && r.body.payments.pending === 41 && calls.query >= 5 && calls.patch === 1);

  reset();
  r = mkRes(); await snapshotH(mkReq({ scope: 'leads' }), r);
  check('snapshot: ogni scope ha la sua fotografia (leads non riusa all)',
    r.code === 200 && r.body.cached === false && r.body.leads && !r.body.contracts && calls.query === 1);
  r = mkRes(); await snapshotH(mkReq({ scope: '../../users' }), r);
  check('snapshot: uno scope inventato non apre una chiave nuova (ricade su all, già in memoria)',
    r.code === 200 && r.body.cached === true && ![...store.keys()].some(k => k.includes('users') && k.startsWith('heartbeat/')));

  // risk.scan: la porta più cara
  MEMO._resetMemoForTests();
  reset();
  r = mkRes(); await riskH(mkReq({}), r);
  const rq = calls.query;
  check('risk: la prima scansione legge l\'archivio (6 query) e risponde coi conteggi', r.code === 200 && r.body.cached === false && rq === 6 && r.body.counts && Array.isArray(r.body.items));
  reset();
  r = mkRes(); await riskH(mkReq({}), r);
  check('risk: la seconda (entro 10 minuti) non rilegge NIENTE — prima: ~2.280 documenti ogni 2 minuti',
    r.code === 200 && r.body.cached === true && calls.query === 0 && calls.get === 0);
  reset();
  r = mkRes(); await riskH(mkReq({ window: 30 }), r);
  check('risk: un orizzonte diverso è un\'altra fotografia', r.code === 200 && r.body.cached === false && calls.query === 6);

  // la scadenza, sul motore: dopo 10 minuti si ricalcola
  MEMO._resetMemoForTests();
  let computed = 0, clock = 1_000_000_000_000;
  const now = () => clock;
  const compute = async () => { computed++; return { n: computed }; };
  await MEMO.memoized('t-ttl', compute, { now });
  clock += 9 * 60_000;
  const a = await MEMO.memoized('t-ttl', compute, { now });
  clock += 2 * 60_000;
  const b = await MEMO.memoized('t-ttl', compute, { now });
  check('memo: entro 10 minuti la stessa fotografia, oltre si ricalcola', a.value.n === 1 && a.source === 'memory' && b.value.n === 2 && b.source === 'fresh');
  // due chiamate insieme a fotografia scaduta = UN calcolo
  MEMO._resetMemoForTests();
  computed = 0;
  const slow = async () => { computed++; await new Promise(r2 => setTimeout(r2, 10)); return { n: computed }; };
  const [x, y] = await Promise.all([MEMO.memoized('t-pair', slow, { now }), MEMO.memoized('t-pair', slow, { now })]);
  check('memo: due chiamate nello stesso istante = UN calcolo condiviso', computed === 1 && x.value.n === 1 && y.value.n === 1);
  // un guasto della memoria non ferma la risposta
  MEMO._resetMemoForTests();
  const ok = await MEMO.memoized('t-broken/../x', async () => ({ fine: true }), { now });
  check('memo: una chiave strana si normalizza nel nome del documento (mai fuori da heartbeat/)',
    ok.value.fine === true && [...store.keys()].some(k => /^heartbeat\/agent-memo-t-broken_\.\._x$/.test(k)));
}

// ═══ 2. LE LETTURE IN BLOCCO ═══════════════════════════════════════════
{
  const L = await import('../../api/homie/_lib.js');
  for (let i = 0; i < 250; i++) store.set('conversations/k' + i, { name: 'K' + i });
  const paths = Array.from({ length: 260 }, (_, i) => 'conversations/k' + i);   // 10 non esistono
  reset(); batchGetEnabled = true;
  const got = await L.fsGetMany(paths);
  check('blocco: 260 documenti = 3 richieste batchGet (100+100+60), nessuna lettura singola',
    calls.batchGet === 3 && calls.get === 0 && got.size === 260);
  check('blocco: i presenti tornano coi loro campi, gli assenti come null (mai un buco)',
    got.get('conversations/k7').name === 'K7' && got.get('conversations/k255') === null);
  reset(); batchGetEnabled = false; maxInFlightGets = 0;
  const got2 = await L.fsGetMany(paths.slice(0, 40));
  check('blocco: se il batch non risponde si ricade sulle letture singole, al massimo 8 in volo (mai la raffica di prima)',
    got2.size === 40 && got2.get('conversations/k3').name === 'K3' && calls.get === 40 && maxInFlightGets <= 8);
  batchGetEnabled = true;
  reset();
  const got3 = await L.fsGetMany(['conversations/k1', 'conversations/k1', '../users/x', 'conversations/k2']);
  check('blocco: doppioni e percorsi non validi esclusi alla porta', got3.size === 2 && calls.batchGet === 1);

  const sr = src('api/segretaria/scan-replies.js');
  check('scan-replies: le conversazioni seguite si leggono in blocco, non più una per una in Promise.all',
    /fsGetMany\(valid\.map\(cid => 'conversations\/' \+ cid\)\)/.test(sr) && !/Promise\.all\(trackedIds[^]*?fsGet\('conversations\/'/.test(sr));
}

console.log('\n────────────────────────────────────────────────');
console.log(`Efficienza: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI:\n - ' + bad.join('\n - ')); process.exit(1); }
console.log('La stessa domanda non rilegge l\'archivio; 190 letture diventano due.');
