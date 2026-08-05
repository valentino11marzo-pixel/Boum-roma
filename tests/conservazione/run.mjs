// tests/conservazione/run.mjs — l'archivio fuori piattaforma, blindato.
// Handler REALE (api/ops/conservazione.js), nodemailer mockato, Firestore/
// Storage su stub. LE REGOLE: entra SOLO il mese giusto, lo ZIP allegato
// contiene i byte VERI dei PDF (riletto con un parser ZIP minimale), un
// file irraggiungibile viene contato e scritto nell'INDICE ma non ferma
// l'archivio, un rerun non rispedisce, dry non tocca nulla.
// Uso: node tests/conservazione/run.mjs
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.ADMIN_NOTIFY_EMAIL;

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mails = () => globalThis.__mails || [];

// ── ZIP reader minimale (formato STORE di api/_zip.js) ──────────────────
function readZip(buf) {
  const out = {}; let o = 0;
  while (o + 4 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const nameLen = buf.readUInt16LE(o + 26), extraLen = buf.readUInt16LE(o + 28), size = buf.readUInt32LE(o + 22);
    const name = buf.slice(o + 30, o + 30 + nameLen).toString('utf8');
    out[name] = buf.slice(o + 30 + nameLen + extraLen, o + 30 + nameLen + extraLen + size);
    o = o + 30 + nameLen + extraLen + size;
  }
  return out;
}

// ── Stub ────────────────────────────────────────────────────────────────
const store = new Map();
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
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
  if ('integerValue' in v) return +v.integerValue;
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFs(x); return o; }
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  return v.booleanValue ?? v.doubleValue ?? null;
}
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };

const PDF_A = Buffer.from('%PDF-1.4 CONTRATTO-JULIE ' + 'x'.repeat(400));
const PDF_B = Buffer.from('%PDF-1.4 CERT-JULIE ' + 'y'.repeat(300));
const PDF_C = Buffer.from('%PDF-1.4 CONTRATTO-MARCO ' + 'z'.repeat(500));

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) {
    if (url.includes('signInWithPassword')) return okJson({ idToken: 'tok', localId: 'srv' });
    return new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 });
  }
  if (url.includes('api.telegram.org')) return okJson({ ok: true });
  if (url === 'https://storage.example/julie-signed.pdf') return new Response(PDF_A, { status: 200 });
  if (url === 'https://storage.example/julie-cert.pdf') return new Response(PDF_B, { status: 200 });
  if (url === 'https://storage.example/marco-signed.pdf') return new Response(PDF_C, { status: 200 });
  if (url === 'https://storage.example/sparito.pdf') return new Response('nf', { status: 404 });
  if (url.includes('firestore.googleapis.com')) {
    const path = (url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    const row = (k) => ({ name: 'projects/p/databases/(default)/documents/' + k, fields: toFsFields(store.get(k)) });
    if (path.startsWith(':runQuery')) {
      const sq = (JSON.parse(opts.body || '{}') || {}).structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const rows = [];
      for (const k of store.keys()) { if (k.startsWith(col + '/')) rows.push({ document: row(k) }); if (sq.limit && rows.length >= sq.limit) break; }
      return okJson(rows.length ? rows : [{}]);
    }
    if (opts.method === 'POST' && !path.startsWith(':')) {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response(JSON.stringify({ error: { code: 409, status: 'ALREADY_EXISTS', message: 'exists' } }), { status: 409 });
      store.set(key, fromFsFields(JSON.parse(opts.body).fields));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') { store.set(path, Object.assign(store.get(path) || {}, fromFsFields(JSON.parse(opts.body).fields))); return okJson({ name: 'x' }); }
    if (!store.has(path)) return new Response('nf', { status: 404 });
    return okJson(row(path));
  }
  throw new Error('fetch non stubbata: ' + url);
};

const MONTH = '2026-07';
function seed() {
  store.clear(); globalThis.__mails = [];
  store.set('contracts/cJulie', { tenantName: 'Julie Verbrugghe', propertyAddress: 'Via Squarcialupo 36', finalizedAt: '2026-07-20T10:00:00.000Z', signedPdfUrl: 'https://storage.example/julie-signed.pdf', signingCertificateUrl: 'https://storage.example/julie-cert.pdf', timestampTsrUrl: 'https://storage.example/sparito.pdf' });
  store.set('contracts/cMarco', { tenantName: 'Marco Rossi', propertyAddress: 'Via Levico 7', finalizedAt: '2026-07-05T08:00:00.000Z', signedPdfUrl: 'https://storage.example/marco-signed.pdf' });
  store.set('contracts/cVecchio', { tenantName: 'Fuori Mese', finalizedAt: '2026-06-11T08:00:00.000Z', signedPdfUrl: 'https://storage.example/julie-signed.pdf' });
  store.set('contracts/cCarta', { tenantName: 'Firmato su carta' }); // mai finalizzato: fuori
}
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const handler = (await import('../../api/ops/conservazione.js')).default;
const drive = async (query = {}) => { const r = mkRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer cron-test-secret' }, query, body: {} }, r); return r; };

// ═══ 1. Archivio del mese ═══════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: MONTH });
  check('cron 200: 2 contratti del mese (non giugno, non firmato-su-carta)', r.code === 200 && r.body.counts.contracts === 2);
  check('3 file scaricati, 1 mancante contato', r.body.counts.files === 3 && r.body.counts.missing === 1);

  const m = mails().find(x => x.to === 'valentino@boom-rome.com');
  check('email allegata a valentino@boom-rome.com', !!m && /Conservazione 2026-07/.test(m.subject) && m.attachments?.length === 1);

  const zip = readZip(m.attachments[0].content);
  const names = Object.keys(zip);
  check('ZIP: INDICE + 3 PDF con percorsi parlanti', names.length === 4 && names.some(n => n.endsWith('00_INDICE.txt')) && names.some(n => /Julie_Verbrugghe.*contratto-firmato\.pdf/.test(n)) && names.some(n => /Marco_Rossi.*contratto-firmato\.pdf/.test(n)));
  const julie = zip[names.find(n => /Julie.*contratto-firmato/.test(n))];
  check('i byte nello ZIP sono i PDF veri', Buffer.compare(julie, PDF_A) === 0);
  const indice = zip[names.find(n => n.endsWith('00_INDICE.txt'))].toString();
  check('INDICE dice cosa manca (marca temporale irraggiungibile)', indice.includes('✗ marca-temporale.tsr'));

  // ═══ 2. Rerun = già archiviato ═══
  const before = mails().length;
  const r2 = await drive({ month: MONTH });
  check('rerun: already_archived, zero nuove email', r2.body.skipped === 'already_archived' && mails().length === before);
}

// ═══ 3. Dry ═════════════════════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: MONTH, dry: '1' });
  check('dry: elenca i contratti, zero email, zero memoria', r.code === 200 && r.body.contracts.length === 2 && mails().length === 0 && !store.has('heartbeat/conservazione-' + MONTH));
}

// ═══ 4. Mese vuoto ══════════════════════════════════════════════════════
{
  seed();
  const r = await drive({ month: '2026-01' });
  check('mese senza firme: nota esplicita, niente email', r.body.note && mails().length === 0);
}

console.log(`\nConservazione: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
