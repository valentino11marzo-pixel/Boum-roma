// tests/signtokens/run.mjs — LE CHIAVI DI FIRMA FUORI DAL CONTRATTO (1/10/2026).
//
// Il difetto: contracts/{id} portava tenantSignToken e landlordSignToken in
// chiaro, e le rules fanno leggere il contratto all'inquilino E al
// proprietario. L'inquilino (/casa legge il contratto) trovava il link del
// locatore e, a lato conduttori completo, poteva firmare al suo posto; il
// proprietario leggeva il link dell'inquilino. Più tre porte HTTP che
// restituivano il link dell'altra parte a un chiamante proprietario.
//
// Handler e moduli VERI (magic-sign lookup/submit, sign/links, send-link,
// preagreement convert/send-sign, profile/link, _tokens), nodemailer mockato
// (loader di tests/notify), Firestore in memoria che fa quello che fa il vero:
// precondizioni updateTime, create 409, query EQUAL e GREATER_THAN, e la
// cancellazione dei campi nella updateMask assenti dal corpo.
//
// Uso: node tests/signtokens/run.mjs
import { register } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-signtokens';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.ANTHROPIC_API_KEY;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const mails = () => globalThis.__mails || [];
const ROOT = new URL('../../', import.meta.url).pathname;
const R = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── Firestore in memoria ────────────────────────────────────────────────
const store = new Map();
const times = new Map();
let tick = 0;
const bump = (k) => times.set(k, new Date(Date.UTC(2026, 9, 1) + (++tick)).toISOString());
const okJson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
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
const docRow = (k) => ({ name: 'projects/test-proj/databases/(default)/documents/' + k, fields: toFsFields(store.get(k)), updateTime: times.get(k) || '2026-01-01T00:00:00Z', createTime: '2026-01-01T00:00:00Z' });
// Un "guasto" programmabile: alla prossima LETTURA di questo documento, un
// altro processo lo modifica (la firma che arriva mentre la migrazione lavora).
let touchOnRead = null;

const storageFiles = new Map();
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('accounts:signInWithPassword')) return okJson({ idToken: 'admin-token' });
  if (url.includes('accounts:lookup')) {
    const t = (JSON.parse(opts.body || '{}').idToken) || '';
    if (!t.startsWith('as:')) return okJson({}, 400);
    return okJson({ users: [{ localId: t.slice(3), email: t.slice(3) + '@test.it' }] });
  }
  if (url.includes('identitytoolkit')) return okJson({ users: [] });
  if (url.startsWith('https://storage.example/')) return new Response(Buffer.from('FILE'), { status: 200 });
  if (url.startsWith('https://freetsa.org/tsr')) return new Response(Buffer.alloc(300, 7), { status: 200 });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (opts.method === 'POST') { const n = new URL(url).searchParams.get('name'); if (n) storageFiles.set(n, Buffer.from(opts.body)); return okJson({ downloadTokens: 'dl' }); }
    const m = url.match(/\/o\/([^?]+)\?alt=media/);
    if (m) { const b = storageFiles.get(decodeURIComponent(m[1])); return b ? new Response(b, { status: 200 }) : new Response('nf', { status: 404 }); }
    return okJson({ downloadTokens: 'dl' });
  }
  if (url.includes('api.telegram.org')) return okJson({ ok: true, result: {} });
  if (!url.includes('firestore.googleapis.com')) throw new Error('fetch non stubbata: ' + url);

  const path = (url.split('/documents')[1] || '').replace(/^\//, '').split('?')[0];
  const qs = new URL(url).searchParams;
  if (path.startsWith(':runQuery')) {
    const sq = (JSON.parse(opts.body || '{}') || {}).structuredQuery || {};
    const col = ((sq.from || [])[0] || {}).collectionId || '';
    const ff = (sq.where || {}).fieldFilter;
    const rows = [];
    for (const [k, d] of store) {
      if (!k.startsWith(col + '/') || k.slice(col.length + 1).includes('/')) continue;
      if (ff) {
        const want = fromFs(ff.value), got = d[ff.field.fieldPath];
        if (ff.op === 'EQUAL' && got !== want) continue;
        // GREATER_THAN su stringa: solo stringhe (Firestore confronta per tipo)
        if (ff.op === 'GREATER_THAN' && !(typeof got === 'string' && typeof want === 'string' && got > want)) continue;
        if (!['EQUAL', 'GREATER_THAN'].includes(ff.op)) throw new Error('op non stubbata: ' + ff.op);
      }
      rows.push({ document: docRow(k) });
      if (sq.limit && rows.length >= sq.limit) break;
    }
    return okJson(rows.length ? rows : [{}]);
  }
  if (path.startsWith(':commit')) {
    const writes = (JSON.parse(opts.body || '{}') || {}).writes || [];
    // tutto o niente, come il vero commit
    for (const w of writes) {
      const name = (w.update && w.update.name) || w.delete;
      if (!/^projects\/[^/]+\/databases\/\(default\)\/documents\/.+/.test(String(name))) return okJson({ error: { status: 'INVALID_ARGUMENT', message: 'bad name ' + name } }, 400);
      const k = name.split('/documents/')[1];
      const cd = w.currentDocument || {};
      if (cd.updateTime && (times.get(k) || '2026-01-01T00:00:00Z') !== cd.updateTime) return okJson({ error: { status: 'FAILED_PRECONDITION', message: 'stale' } }, 400);
      if (cd.exists === true && !store.has(k)) return okJson({ error: { status: 'NOT_FOUND' } }, 404);
      if (cd.exists === false && store.has(k)) return okJson({ error: { status: 'ALREADY_EXISTS' } }, 409);
    }
    for (const w of writes) {
      if (w.delete) { store.delete(w.delete.split('/documents/')[1]); continue; }
      const k = w.update.name.split('/documents/')[1];
      const vals = fromFsFields(w.update.fields);
      const doc = { ...(store.get(k) || {}) };
      if (w.updateMask) {
        for (const f of w.updateMask.fieldPaths || []) { if (f in vals) doc[f] = vals[f]; else delete doc[f]; }
      } else Object.assign(doc, vals);
      for (const t of w.updateTransforms || []) doc[t.fieldPath] = new Date().toISOString();
      store.set(k, doc); bump(k);
    }
    return okJson({ writeResults: writes.map(() => ({})) });
  }
  if (opts.method === 'POST') {
    const id = qs.get('documentId') || 'auto_' + (++tick);
    const k = path + '/' + id;
    if (qs.get('documentId') && store.has(k)) return new Response('{"error":{"status":"ALREADY_EXISTS"}}', { status: 409 });
    store.set(k, fromFsFields(JSON.parse(opts.body).fields)); bump(k);
    return okJson({ name: 'projects/test-proj/databases/(default)/documents/' + k });
  }
  if (opts.method === 'PATCH') {
    if (qs.get('currentDocument.exists') === 'false' && store.has(path)) return new Response('exists', { status: 400 });
    const cur = { ...(store.get(path) || {}) };
    Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
    store.set(path, cur); bump(path);
    return okJson(docRow(path));
  }
  if (opts.method === 'DELETE') { store.delete(path); return okJson({}); }
  if (!store.has(path)) return new Response('not found', { status: 404 });
  if (touchOnRead === path) { touchOnRead = null; const row = docRow(path); store.get(path).touchedMeanwhile = true; bump(path); return okJson(row); }
  return okJson(docRow(path));
};

const mkRes = () => ({
  code: 0, body: null, headers: {},
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.code = c; return this; },
  json(o) { this.body = o; return this; },
  send(b) { this.body = b; return this; },
  end() { return this; },
});
let ipN = 0;
const mkReq = (body, as) => ({ method: 'POST', headers: { 'x-forwarded-for': '10.9.0.' + (++ipN % 250), ...(as ? { authorization: 'Bearer as:' + as } : {}) }, body, socket: {} });
const hasPlain = (c) => !!c && (('tenantSignToken' in c) || ('landlordSignToken' in c));

// ── Seed ────────────────────────────────────────────────────────────────
store.set('users/uAdmin', { role: 'admin', name: 'Operatore', email: 'op@boom.it' });
store.set('users/uOwner', { role: 'landlord', name: 'Giulia Bianchi', email: 'giulia@owner.it' });
store.set('users/uOther', { role: 'landlord', name: 'Altro Proprietario', email: 'altro@owner.it' });
store.set('users/uTenant', { role: 'tenant', name: 'Anna Expat', email: 'anna@expat.com' });
store.set('users/uTenant2', { role: 'tenant', name: 'Bruno Altro', email: 'bruno@x.com' });
store.set('properties/p1', { ownerId: 'uOwner', name: 'Trastevere Loft', address: 'Via della Lungaretta 12' });
store.set('properties/p2', { ownerId: 'uOther', name: 'Altra casa', address: 'Via Altra 1' });
const BASE_C = {
  propertyId: 'p1', tenantId: 'uTenant', type: 'transitorio', cedolareSecca: 'si',
  rent: 1200, deposit: 2400, startDate: '2026-11-01', endDate: '2027-10-31', paymentDay: 5,
  tenantName: 'Anna Expat', tenantEmail: 'anna@expat.com', landlordName: 'Giulia Bianchi', landlordEmail: 'giulia@owner.it',
  signingOrder: 'sequential', signatureStatus: 'none', status: 'active', generatedPDF: 'https://storage.example/contract.pdf',
};

const T = await import('../../api/sign/_tokens.js');
const { findContractByToken } = await import('../../api/magic-sign/_shared.js');
const { MS_CONSENT_TEXT } = await import('../../api/magic-sign/submit.js');
const msSubmit = (await import('../../api/magic-sign/submit.js')).default;
const msLookup = (await import('../../api/magic-sign/lookup.js')).default;
const links = (await import('../../api/sign/links.js')).default;
const { scopeFor } = await import('../../api/sign/links.js');
const sendLink = (await import('../../api/sign/send-link.js')).default;
const profileLink = (await import('../../api/profile/link.js')).default;
const { withoutSignLinks } = await import('../../api/preagreement/convert.js');
const SIG = 'data:image/png;base64,' + 'C'.repeat(400);
const signBody = (token, extra = {}) => ({ token, signature: SIG, consent: { text: MS_CONSENT_TEXT, hash: '' }, identity: { cf: 'RSSMRA85T10A562S', dob: '1998-05-04' }, ...extra });

// ═══ 1. Il motore puro ═══
{
  check('signUrl: link /sign con token codificato; &delegate=1 solo se chiesto; niente link per un token assente o corto',
    T.signUrl('abc-12345678') === 'https://www.boomrome.com/sign?sign=abc-12345678'
    && T.signUrl('abc-12345678', { delegate: true }).endsWith('&delegate=1') && T.signUrl(null) === null && T.signUrl('short') === null);
  check('stripSignTokens: toglie i due campi in chiaro e nient\'altro',
    JSON.stringify(T.stripSignTokens({ a: 1, tenantSignToken: 'x', landlordSignToken: 'y', tenantSignTokenUsedAt: 'z' })) === '{"a":1,"tenantSignTokenUsedAt":"z"}');
  check('withoutSignLinks (convert/send-sign per i non-admin): via i due link, il resto resta',
    JSON.stringify(withoutSignLinks({ ok: true, contractId: 'c', tenantSignUrl: 'u1', landlordSignUrl: 'u2', delegate: null })) === '{"ok":true,"contractId":"c","delegate":null}');
  const c = { tenantId: 'uTenant' }, p = { ownerId: 'uOwner' };
  check('scopeFor: admin → entrambi; proprietario dell\'immobile → SOLO locatore; inquilino del contratto → SOLO conduttore; chiunque altro → nulla',
    scopeFor({ uid: 'uAdmin', profile: { role: 'admin' } }, c, p).roles.join() === 'tenant,landlord'
    && scopeFor({ uid: 'uOwner', profile: { role: 'landlord' } }, c, p).roles.join() === 'landlord'
    && scopeFor({ uid: 'uOwner', profile: { role: 'owner' } }, c, p).roles.join() === 'landlord'
    && scopeFor({ uid: 'uTenant', profile: { role: 'tenant' } }, c, p).roles.join() === 'tenant'
    && scopeFor({ uid: 'uOther', profile: { role: 'landlord' } }, c, p) === null
    && scopeFor({ uid: 'uTenant2', profile: { role: 'tenant' } }, c, p) === null
    && scopeFor({ uid: 'uTenant', profile: { role: 'landlord' } }, c, p) === null);
}

// ═══ 2. Il deposito: conia, sposta, non duplica, non tocca il contratto ═══
{
  store.set('contracts/cNew', { ...BASE_C });
  const t1 = await T.ensureSignTokens('cNew', store.get('contracts/cNew'));
  const st = store.get('signTokens/cNew') || {};
  check('ensure: conia i due token nel DEPOSITO signTokens/cNew (UUID diversi), il contratto resta senza',
    /^[0-9a-f-]{36}$/.test(t1.tenant) && /^[0-9a-f-]{36}$/.test(t1.landlord) && t1.tenant !== t1.landlord
    && st.tenant === t1.tenant && st.landlord === t1.landlord && st.contractId === 'cNew' && !hasPlain(store.get('contracts/cNew')));
  const t2 = await T.ensureSignTokens('cNew', store.get('contracts/cNew'));
  check('ensure idempotente: la seconda chiamata restituisce GLI STESSI token (un link spedito non muore)', t2.tenant === t1.tenant && t2.landlord === t1.landlord);

  store.set('contracts/cRace', { ...BASE_C });
  const many = await Promise.all(Array.from({ length: 6 }, () => T.ensureSignTokens('cRace', store.get('contracts/cRace'))));
  check('ensure concorrente (6 chiamate insieme): UN solo token per parte — nessuno sovrascrive il link coniato da un altro',
    new Set(many.map(x => x.tenant)).size === 1 && new Set(many.map(x => x.landlord)).size === 1 && store.get('signTokens/cRace').tenant === many[0].tenant);

  store.set('contracts/cSigned', { ...BASE_C, tenantSignature: SIG });
  const t3 = await T.ensureSignTokens('cSigned', store.get('contracts/cSigned'));
  check('ensure: niente token nuovo per chi HA GIÀ firmato (solo per il locatore)', t3.tenant === null && !!t3.landlord);
  store.set('contracts/cNone', { ...BASE_C });
  const t4 = await T.ensureSignTokens('cNone', store.get('contracts/cNone'), { mint: ['landlord'] });
  check('ensure { mint: [landlord] }: conia SOLO il locatore', t4.tenant === null && !!t4.landlord && !('tenant' in store.get('signTokens/cNone')));

  store.set('contracts/cOld', { ...BASE_C, tenantSignToken: 'legacy-tenant-0001', landlordSignToken: 'legacy-landlord-01' });
  const t5 = await T.ensureSignTokens('cOld', store.get('contracts/cOld'));
  check('ensure su un contratto LEGACY: sposta i token in chiaro col LORO valore (i link nelle email restano validi)',
    t5.tenant === 'legacy-tenant-0001' && t5.landlord === 'legacy-landlord-01' && store.get('signTokens/cOld').landlord === 'legacy-landlord-01');
  const r6 = await T.readSignTokens('cGhost', null);
  check('readSignTokens senza deposito né contratto: null, nessun conio', r6.tenant === null && r6.landlord === null && !store.has('signTokens/cGhost'));
}

// ═══ 3. Il giro VERO: link dal deposito → firma inquilino → «tocca a Lei» → firma locatore ═══
{
  store.set('contracts/cE2E', { ...BASE_C });
  // l'admin chiede i link (Firma ora / Share Hub)
  let r = mkRes();
  await links(mkReq({ contractId: 'cE2E' }, 'uAdmin'), r);
  const st = store.get('signTokens/cE2E') || {};
  check('/api/sign/links admin: 200, entrambi i link (dal deposito), il contratto non cambia',
    r.code === 200 && r.body.scope === 'admin' && r.body.tenant === 'https://www.boomrome.com/sign?sign=' + st.tenant
    && r.body.landlord === 'https://www.boomrome.com/sign?sign=' + st.landlord && !hasPlain(store.get('contracts/cE2E')));

  // L'ATTACCO di prima: l'inquilino legge il SUO contratto (le rules glielo
  // lasciano) e cerca il link del locatore. Non c'è più.
  const asTenantReads = store.get('contracts/cE2E');
  check('il contratto come lo legge l\'inquilino: nessun landlordSignToken, nessun valore del token del locatore da nessuna parte',
    !('landlordSignToken' in asTenantReads) && !JSON.stringify(asTenantReads).includes(st.landlord));

  r = mkRes();
  await msLookup(mkReq({ token: st.tenant }), r);
  check('lookup col token del deposito → role tenant, contratto giusto, nessun token nella risposta',
    r.code === 200 && r.body.role === 'tenant' && r.body.contract.id === 'cE2E' && !JSON.stringify(r.body).includes(st.landlord));
  r = mkRes();
  await msSubmit(mkReq(signBody(st.landlord)), r);
  check('il token del locatore PRIMA della firma dell\'inquilino → 409 awaiting_tenant (sequenza intatta)', r.code === 409 && r.body.error === 'awaiting_tenant');

  const b0 = mails().length;
  r = mkRes();
  await msSubmit(mkReq(signBody(st.tenant)), r);
  const after = store.get('contracts/cE2E');
  check('firma dell\'inquilino col token del deposito → 200 partial, firma sul contratto, nessun token ricomparso sul contratto',
    r.code === 200 && r.body.signatureStatus === 'partial' && !!after.tenantSignature && !!after.tenantSignTokenUsedAt && !hasPlain(after));
  const tocca = mails().slice(b0).find(m => m.to === 'giulia@owner.it' && /Tocca a Lei/.test(m.subject || ''));
  check('«Tocca a Lei» al locatore porta il SUO link, preso dal deposito', !!tocca && (tocca.html || '').includes('/sign?sign=' + encodeURIComponent(st.landlord)));

  r = mkRes();
  await msSubmit(mkReq(signBody(st.landlord, { identity: {} })), r);
  const done = store.get('contracts/cE2E');
  check('firma del locatore col SUO token → 200 complete; il contratto firmato non porta token',
    r.code === 200 && r.body.signatureStatus === 'complete' && !!done.landlordSignature && !hasPlain(done));
  r = mkRes();
  await msLookup(mkReq({ token: st.tenant }), r);
  check('dopo la firma il link resta VIVO (410 already_signed, non «link non valido»)', r.code === 410 && r.body.error === 'already_signed');
  check('un token che non esiste → null; un token corto → null (mai una query su spazzatura)',
    (await findContractByToken('nope-nope-nope-0000')) === null && (await findContractByToken('abc')) === null);
}

// ═══ 4. Le porte: il link dell'ALTRA parte non esce mai ═══
{
  store.set('contracts/cScope', { ...BASE_C, coTenants: [{ name: 'Carla Co', email: 'carla@x.com' }] });
  let r = mkRes();
  await links(mkReq({ contractId: 'cScope' }, 'uTenant'), r);
  check('/api/sign/links inquilino del contratto: SOLO il suo link; il locatore null; il token del locatore NON coniato',
    r.code === 200 && r.body.scope === 'tenant' && /\/sign\?sign=/.test(r.body.tenant || '') && r.body.landlord === null && !r.body.cosign
    && !('landlord' in (store.get('signTokens/cScope') || {})));
  r = mkRes();
  await links(mkReq({ contractId: 'cScope' }, 'uOwner'), r);
  const st = store.get('signTokens/cScope');
  check('/api/sign/links proprietario dell\'immobile: SOLO il suo link; il conduttore null; niente co-conduttori',
    r.code === 200 && r.body.scope === 'landlord' && r.body.landlord === 'https://www.boomrome.com/sign?sign=' + st.landlord
    && r.body.tenant === null && !r.body.cosign && !JSON.stringify(r.body).includes(st.tenant));
  r = mkRes();
  await links(mkReq({ contractId: 'cScope' }, 'uOther'), r);
  check('/api/sign/links proprietario di un ALTRO immobile → 403', r.code === 403 && r.body.error === 'not_your_contract');
  r = mkRes();
  await links(mkReq({ contractId: 'cScope' }, 'uTenant2'), r);
  check('/api/sign/links inquilino di un altro contratto → 403', r.code === 403);
  r = mkRes();
  await links(mkReq({ contractId: 'cScope' }), r);
  check('/api/sign/links senza credenziale → 401', r.code === 401);
  r = mkRes();
  await links(mkReq({ contractId: 'cScope' }, 'uAdmin'), r);
  check('/api/sign/links admin: entrambi + i link dei co-conduttori', r.code === 200 && !!r.body.tenant && !!r.body.landlord && r.body.cosign && r.body.cosign.length === 1 && /\.c0\./.test(r.body.cosign[0].url));

  r = mkRes();
  await profileLink(mkReq({ contractId: 'cScope' }, 'uOwner'), r);
  check('/api/profile/link al PROPRIETARIO: i co-conduttori senza il loro link di FIRMA (restano Scheda e stato)',
    r.code === 200 && Array.isArray(r.body.cosign) && r.body.cosign.length === 1 && !('url' in r.body.cosign[0]) && !!r.body.cosign[0].schedaUrl);
  r = mkRes();
  await profileLink(mkReq({ contractId: 'cScope' }, 'uAdmin'), r);
  check('/api/profile/link all\'admin: il link di firma del co-conduttore c\'è', r.code === 200 && /\/sign\?sign=/.test((r.body.cosign || [])[0].url || ''));

  // La pagina pubblica della proposta (token PA = il cliente): il SUO link sì
  // (a soldi ricevuti), mai quello del locatore — né dal contratto né dagli
  // URL che la proposta (admin-only) conserva per la console.
  const paLookup = (await import('../../api/preagreement/lookup.js')).default;
  const PAT = 'ab'.repeat(16);
  store.set('preAgreements/paS', { token: PAT, status: 'paid', paidAt: '2026-10-01T09:00:00Z', contractId: 'cScope',
    tenant: { fullName: 'Anna Expat', email: 'anna@expat.com' }, landlord: { name: 'Giulia Bianchi' }, property: { address: 'Via della Lungaretta 12' },
    lease: { startDate: '2026-11-01', months: 12 }, money: { rent: 1200, deposit: 2400, dueAtSigning: 0 },
    tenantSignUrl: 'https://www.boomrome.com/sign?sign=' + st.tenant, landlordSignUrl: 'https://www.boomrome.com/sign?sign=' + st.landlord });
  r = mkRes();
  await paLookup(mkReq({ token: PAT }), r);
  check('lookup pubblico della proposta: il link del CLIENTE c\'è, il token del locatore in nessun punto della risposta',
    r.code === 200 && r.body.pa.contract && r.body.pa.contract.tenantSignUrl === 'https://www.boomrome.com/sign?sign=' + st.tenant
    && !JSON.stringify(r.body).includes(st.landlord));

  r = mkRes();
  await sendLink(mkReq({ contractId: 'cScope', role: 'tenant' }, 'uOwner'), r);
  check('send-link chiamato dal proprietario per l\'inquilino: l\'invito parte, il link dell\'inquilino NON torna',
    r.code === 200 && r.body.sent === true && !('url' in r.body) && !JSON.stringify(r.body).includes(st.tenant));
}

// ═══ 5. LA MIGRAZIONE: i token in chiaro lasciano i contratti, i link restano validi ═══
{
  store.set('contracts/mA', { ...BASE_C, tenantSignToken: 'mig-tenant-A-0001', landlordSignToken: 'mig-landlord-A-01' });
  store.set('contracts/mB', { ...BASE_C, tenantSignToken: 'mig-tenant-B-0001' });
  store.set('contracts/mRot', { ...BASE_C, landlordSignToken: 'mig-landlord-OLD-1' });
  store.set('signTokens/mRot', { contractId: 'mRot', landlord: 'mig-landlord-NEW-1' });   // ruotato prima
  store.set('contracts/mNull', { ...BASE_C, tenantSignToken: null });
  store.set('contracts/mRace', { ...BASE_C, tenantSignToken: 'mig-tenant-RACE-01' });

  // Prima della migrazione: il link in chiaro funziona (transizione), quello ruotato NO.
  let hit = await findContractByToken('mig-landlord-A-01');
  check('prima della migrazione: un token ancora in chiaro risolve (i link spediti non muoiono al deploy)', !!hit && hit.contract.id === 'mA' && hit.role === 'landlord');
  check('un token in chiaro RUOTATO nel deposito non vale più (vince il deposito)',
    (await findContractByToken('mig-landlord-OLD-1')) === null && (await findContractByToken('mig-landlord-NEW-1'))?.contract.id === 'mRot');

  const dry = await T.migrateLegacySignTokens({ dryRun: true });
  check('dryRun: conta i contratti col token in chiaro (null escluso: non è un segreto) e non scrive nulla',
    dry.dryRun === true && dry.found >= 4 && (dry.pending || []).includes('mA') && !(dry.pending || []).includes('mNull')
    && store.get('contracts/mA').tenantSignToken === 'mig-tenant-A-0001');

  touchOnRead = 'contracts/mRace';   // una firma arriva mentre la migrazione lavora
  const rep = await T.migrateLegacySignTokens({ concurrency: 1 });
  check('migrazione: i campi in chiaro SPARISCONO dai contratti (cancellati, non messi a null)',
    !hasPlain(store.get('contracts/mA')) && !hasPlain(store.get('contracts/mB')) && !hasPlain(store.get('contracts/mRot')));
  check('…e i valori stanno nel deposito, identici (mA entrambi, mB solo conduttore)',
    store.get('signTokens/mA').tenant === 'mig-tenant-A-0001' && store.get('signTokens/mA').landlord === 'mig-landlord-A-01'
    && store.get('signTokens/mB').tenant === 'mig-tenant-B-0001' && !('landlord' in store.get('signTokens/mB')));
  check('…un token già ruotato: vince il deposito, il conflitto è contato', store.get('signTokens/mRot').landlord === 'mig-landlord-NEW-1' && rep.conflicts >= 1);
  check('…il contratto cambiato nel mezzo NON si tocca (precondizione): resta in chiaro e si riprova al giro dopo',
    store.get('contracts/mRace').tenantSignToken === 'mig-tenant-RACE-01' && store.get('contracts/mRace').touchedMeanwhile === true && rep.skipped >= 1);
  hit = await findContractByToken('mig-landlord-A-01');
  check('DOPO la migrazione il link spedito prima funziona ancora (stesso token, ora dal deposito)', !!hit && hit.contract.id === 'mA' && hit.role === 'landlord');
  const rep2 = await T.migrateLegacySignTokens();
  check('secondo giro: prende il contratto rimasto indietro e poi non trova più niente da spostare',
    rep2.migrated >= 1 && !hasPlain(store.get('contracts/mRace')) && store.get('signTokens/mRace').tenant === 'mig-tenant-RACE-01');
  const rep3 = await T.migrateLegacySignTokens();
  check('terzo giro: zero (idempotente)', rep3.found === 0 && rep3.migrated === 0);
  let r = mkRes();
  await links(mkReq({ op: 'migrate', dryRun: true }, 'uOwner'), r);
  check('/api/sign/links op:migrate solo admin (403 al proprietario)', r.code === 403);
  r = mkRes();
  await links(mkReq({ op: 'migrate' }, 'uAdmin'), r);
  check('/api/sign/links op:migrate admin → 200 col rapporto', r.code === 200 && r.body.ok === true && r.body.found === 0);
}

// ═══ 6. Le giunzioni, lette sulla sorgente ═══
{
  // Regola di CLASSE: nessun codice che il browser o il server eseguono
  // SCRIVE più un token in chiaro su un oggetto (chiave o assegnazione).
  const files = [];
  const walk = (dir) => { for (const n of readdirSync(join(ROOT, dir))) { const p = join(dir, n); if (n === 'node_modules') continue; const st = statSync(join(ROOT, p)); if (st.isDirectory()) walk(p); else if (/\.(m?js)$/.test(n)) files.push(p); } };
  walk('api'); walk('js');
  for (const n of readdirSync(ROOT)) if (n.endsWith('.html')) files.push(n);
  const writers = [];
  for (const f of files) {
    const src = R(f).replace(/\/\/[^\n]*/g, '');
    // chiave di un oggetto letterale ({ … tenantSignToken: x }) o assegnazione
    if (/[{,]\s*['"]?(tenant|landlord)SignToken['"]?\s*:/.test(src) || /\.(tenant|landlord)SignToken\s*=[^=]/.test(src)) writers.push(f);
  }
  check('nessun file api/, js/ o pagina scrive tenantSignToken/landlordSignToken su un oggetto' + (writers.length ? ' — ' + writers.join(', ') : ''), writers.length === 0);
  const sh = R('api/magic-sign/_shared.js');
  check('findContractByToken passa dal deposito (findSignTokenHolder), niente più query dirette sui campi del contratto',
    /findSignTokenHolder\(token\)/.test(sh) && !/field: 'tenantSignToken'/.test(sh));
  const rules = R('firestore.rules');
  check('firestore.rules: signTokens admin-only; contratti che non possono più acquisire i campi in chiaro; l\'inquilino non scrive il token',
    /match \/signTokens\/\{x\} \{ allow read, write: if isAdmin\(\); \}/.test(rules)
    && /allow create: if isAdmin\(\) && noPlainSignTokens\(\);/.test(rules) && /allow update: if keepsPlainSignTokensOut\(\)/.test(rules)
    && !/'tenantSignUA','tenantSignToken'/.test(rules));
  const cron = R('api/reminder-cron.js');
  check('reminder-cron: la migrazione gira ogni ora e i solleciti leggono i token dal deposito',
    /migrateLegacySignTokens\(\{ limit: 100, maxMs: Math\.min\(8000, left\) \}\)/.test(cron) && !/c\.(tenant|landlord)SignToken/.test(cron) && /readSignTokens\(c\.id, c\)/.test(cron));
  const app = R('js/portal-app.js');
  check('portal: i link arrivano da /api/sign/links (Firma ora, Share Hub, firma in prima persona, wizard)',
    /fetch\('\/api\/sign\/links'/.test(app) && /async function openFirmaOra/.test(app) && /signLinks = await fetchSignLinks\(contractId\)/.test(app)
    && /tenantLink = \(await fetchSignLinks\(contractId\)\)\.tenant/.test(app));
  check('portal: la firma in prima persona non ricade MAI in silenzio sul modale legacy (che scrive la firma lato client)',
    /if \(mode !== 'legacy'\) \{/.test(app));
  for (const [f, re] of [['api/preagreement/convert.js', /auth\.profile\.role === 'admin' \? out : withoutSignLinks\(out\)/],
    ['api/preagreement/send-sign.js', /const echoLinks = auth\.profile\.role === 'admin' \? \{ tenantSignUrl, landlordSignUrl \} : \{\};/],
    ['api/sign/send-link.js', /const mayEchoUrl = auth\.profile\.role === 'admin' \|\| role === 'landlord';/],
    ['api/profile/link.js', /\.\.\.\(isAdmin \? \{ url: /]]) {
    check(f + ': i link di firma in risposta solo a chi spettano', re.test(R(f)));
  }
}

console.log(`\nChiavi di firma: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED: ' + bad.join(' | ')); process.exit(1); }
