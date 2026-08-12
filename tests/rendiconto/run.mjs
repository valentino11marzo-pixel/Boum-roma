// tests/rendiconto/run.mjs — il rendiconto proprietario, blindato.
// Handler REALE (api/owners/rendiconto.js), pdf-lib REALE, nodemailer
// mockato (loader della suite notify), Firestore/Storage/Telegram su stub.
// LE REGOLE: solo il mese giusto entra nei numeri, il PDF vero viaggia in
// allegato al proprietario, un rerun NON rispedisce (idempotenza per
// proprietario+mese), dry non scrive né spedisce, chi non ha email viene
// segnalato e mai perso in silenzio.
// Uso: node tests/rendiconto/run.mjs
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.TELEGRAM_BOT_TOKEN; // tgNotify si spegne da solo

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mails = () => globalThis.__mails || [];

// ── Stub in-memory: Firestore (get/patch/create/runQuery) + Storage ─────
const store = new Map(); const storageFiles = new Map();
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
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) {
    // signInWithPassword = login admin del server (sempre ok); accounts:lookup
    // = verifica di un ID token del chiamante — un bearer inventato è INVALIDO,
    // come nel vero Identity Toolkit.
    if (url.includes('signInWithPassword')) return okJson({ idToken: 'tok', localId: 'srv' });
    return new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 });
  }
  if (url.includes('api.telegram.org')) return okJson({ ok: true });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (opts.method === 'POST') {
      const name = new URL(url).searchParams.get('name');
      if (name) storageFiles.set(name, Buffer.from(opts.body));
      return okJson({ downloadTokens: 'dltok' });
    }
    return okJson({ downloadTokens: 'dltok' });
  }
  if (url.includes('firestore.googleapis.com')) {
    const path = (url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    const row = (k) => ({ name: 'projects/p/databases/(default)/documents/' + k, fields: toFsFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z', createTime: '2026-01-01T00:00:00Z' });
    if (path.startsWith(':runQuery')) {
      const sq = (JSON.parse(opts.body || '{}') || {}).structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const ff = (sq.where || {}).fieldFilter;
      const rows = [];
      for (const k of store.keys()) {
        if (!k.startsWith(col + '/')) continue;
        if (ff && (store.get(k) || {})[ff.field.fieldPath] !== fromFs(ff.value)) continue;
        rows.push({ document: row(k) });
        if (sq.limit && rows.length >= sq.limit) break;
      }
      return okJson(rows.length ? rows : [{}]);
    }
    if (opts.method === 'POST' && !path.startsWith(':')) {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response(JSON.stringify({ error: { code: 409, status: 'ALREADY_EXISTS', message: 'Document already exists' } }), { status: 409 });
      store.set(key, fromFsFields(JSON.parse(opts.body).fields));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      store.set(path, Object.assign(store.get(path) || {}, fromFsFields(JSON.parse(opts.body).fields)));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    if (!store.has(path)) return new Response('not found', { status: 404 });
    return okJson(row(path));
  }
  throw new Error('fetch non stubbata: ' + url);
};

// ── Dati: un proprietario, due immobili, un mese vero di movimenti ──────
const MONTH = '2026-07';
function seed() {
  store.clear(); storageFiles.clear(); globalThis.__mails = [];
  store.set('users/own1', { role: 'landlord', name: 'Stefano Compierchio', email: 'stefano@own.it' });
  store.set('properties/p1', { ownerId: 'own1', address: 'Via Squarcialupo 36', name: 'Squarcialupo' });
  store.set('properties/p2', { ownerId: 'own1', address: 'Via Levico 7', name: 'Levico' });
  store.set('properties/px', { ownerId: 'own2', address: 'Via Vuota 1', name: 'SenzaMovimenti' });
  store.set('users/own2', { role: 'landlord', name: 'Vuoto', email: 'vuoto@own.it' });
  store.set('contracts/c1', { propertyId: 'p1', tenantName: 'Julie Verbrugghe', landlordName: 'Stefano Compierchio', rent: 1400, status: 'active' });
  store.set('contracts/c2', { propertyId: 'p2', tenantName: 'Marco Rossi', landlordName: 'Stefano Compierchio', rent: 900, status: 'active' });
  // pagata NEL mese (conta), pagata in ALTRO mese (non conta), aperta del mese, arretrato vecchio
  store.set('payments/pay_c1_2026-07', { contractId: 'c1', propertyId: 'p1', amount: 1400, month: '2026-07', dueDate: '2026-07-01', status: 'paid', paidDate: '2026-07-03', paidVia: 'bank' });
  store.set('payments/pay_c1_2026-06', { contractId: 'c1', propertyId: 'p1', amount: 1400, month: '2026-06', dueDate: '2026-06-01', status: 'paid', paidDate: '2026-06-02', paidVia: 'stripe' });
  store.set('payments/pay_c2_2026-07', { contractId: 'c2', propertyId: 'p2', amount: 900, month: '2026-07', dueDate: '2026-07-05', status: 'pending' });
  store.set('payments/pay_c2_2026-05', { contractId: 'c2', propertyId: 'p2', amount: 900, month: '2026-05', dueDate: '2026-05-05', status: 'pending' });
  store.set('maintenance/m1', { propertyId: 'p1', title: 'Caldaia rumorosa', status: 'resolved', createdAt: '2026-07-10T09:00:00Z', resolvedAt: '2026-07-12T09:00:00Z' });
}
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const handler = (await import('../../api/owners/rendiconto.js')).default;
const drive = async (query = {}, authz = 'Bearer cron-test-secret') => {
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: authz }, query, body: {} }, res);
  return res;
};

// ═══ 1. Auth ════════════════════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: MONTH }, 'Bearer sbagliato');
  check('auth: secret sbagliato → 401', r.code === 401);
}

// ═══ 2. Happy path ══════════════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: MONTH });
  check('cron: 200 con counts', r.code === 200 && r.body.ok === true && r.body.month === MONTH);
  check('1 rendiconto inviato, 1 proprietario senza movimenti saltato', r.body.counts.sent === 1 && r.body.counts.skippedNoActivity === 1);

  const own = r.body.results.find(x => x.ownerId === 'own1');
  check('numeri del mese giusti: incassato 1400 (NON 2800), atteso 2300, arretrati 900',
    own && own.collected === 1400 && own.expected === 2300 && own.arrears === 900);

  const stored = storageFiles.get(`rendiconti/own1/rendiconto_${MONTH}.pdf`);
  check('PDF su Storage (magic %PDF)', !!stored && stored.slice(0, 4).toString() === '%PDF' && stored.length > 1500);

  const m = mails().find(x => x.to === 'stefano@own.it');
  check('email al proprietario (IT) con PDF identico allo Storage',
    !!m && /Rendiconto Luglio 2026/.test(m.subject) && m.attachments && Buffer.compare(m.attachments[0].content, stored) === 0);
  check('idempotenza scritta (rendiconti/own1_2026-07)', store.has(`rendiconti/own1_${MONTH}`));
  check('nessuna email al proprietario senza movimenti', !mails().some(x => x.to === 'vuoto@own.it'));

  // ═══ 3. Rerun = nessun doppio invio ═══
  const before = mails().length;
  const r2 = await drive({ month: MONTH });
  check('rerun: already_sent, zero nuove email', r2.body.counts.alreadySent === 1 && r2.body.counts.sent === 0 && mails().length === before);
}

// ═══ 4. Dry run ═════════════════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: MONTH, dry: '1' });
  check('dry: calcola i numeri ma non scrive né spedisce',
    r.code === 200 && r.body.results[0].collected === 1400 && mails().length === 0 && storageFiles.size === 0 && !store.has(`rendiconti/own1_${MONTH}`));
}

// ═══ 5. Proprietario senza email ════════════════════════════════════════
{
  seed();
  store.set('users/own1', { role: 'landlord', name: 'Stefano' }); // niente email, niente landlords/
  store.set('contracts/c1', { propertyId: 'p1', tenantName: 'Julie', rent: 1400, status: 'active' }); // niente landlordEmail
  store.set('contracts/c2', { propertyId: 'p2', tenantName: 'Marco', rent: 900, status: 'active' });
  const r = await drive({ month: MONTH });
  check('senza email: segnalato nel recap, mai perso in silenzio',
    r.body.counts.skippedNoEmail === 1 && r.body.results.some(x => x.skipped === 'no_email') && mails().length === 0);
}

console.log(`\nRendiconto: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
