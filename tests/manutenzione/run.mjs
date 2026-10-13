// tests/manutenzione/run.mjs — la porta dei guasti (api/maintenance/guasto.js).
// Il handler VERO su un Firestore in memoria; si fingono solo la rete
// (Identity Toolkit, Firestore REST con runQuery, Storage). Le regole: il
// link apre UN interno e solo finché il contratto per cui è nato è vivo (al
// cambio di inquilino il vecchio link risponde 404), la proprietaria segnala
// e ottiene link solo per i suoi, il guasto si scrive PRIMA del ping, una
// foto che non sale si DICE, e /casa non chiama più una porta che gli
// risponde 401 e manda il suo contratto.
// Uso: node tests/manutenzione/run.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'segreto-di-prova';

let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log('✓ ' + name); };

const store = new Map(), uploads = [];
let auto = 0, storageDown = false, queryDown = false, queries = 0;
const okJson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const fromFs = v => v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue !== undefined ? v.doubleValue
  : v.booleanValue !== undefined ? v.booleanValue : v.timestampValue !== undefined ? v.timestampValue : v.nullValue !== undefined ? null
  : v.arrayValue ? (v.arrayValue.values || []).map(fromFs) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)])) : null;
const toFields = o => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
const docName = k => 'projects/test-proj/databases/(default)/documents/' + k;
const SESSIONS = { 'tok-admin': 'admin1', 'tok-owner': 'owner1', 'tok-other': 'owner2', 'tok-tenant': 't1', 'tok-tenant2': 't2' };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('accounts:lookup')) {
    const uid = SESSIONS[JSON.parse(opts.body || '{}').idToken];
    return uid ? okJson({ users: [{ localId: uid, email: uid + '@example.invalid' }] }) : okJson({ error: 'INVALID' }, 400);
  }
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return okJson({ idToken: 'svc', localId: 'svc', expiresIn: '3600' });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (storageDown) return okJson({ error: { code: 403, message: 'Permission denied' } }, 403);
    const name = decodeURIComponent(url.split('name=')[1] || '');
    uploads.push({ name, type: opts.headers['Content-Type'], size: opts.body.length });
    return okJson({ name, downloadTokens: 'dl' });
  }
  if (url.includes('firestore.googleapis.com')) {
    const after = url.slice(url.indexOf('/documents') + 10);
    if (after.startsWith(':runQuery')) {
      queries++;
      if (queryDown) return okJson({ error: { code: 503 } }, 503);
      const q = JSON.parse(opts.body).structuredQuery, coll = q.from[0].collectionId, ff = q.where && q.where.fieldFilter;
      const val = ff ? fromFs(ff.value) : null;
      const rows = [...store.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2).filter(([, d]) => {
        if (!ff) return true;
        const x = d[ff.field.fieldPath];
        return ff.op === 'IN' ? val.includes(x) : x === val;
      });
      return okJson(rows.map(([k, d]) => ({ document: { name: docName(k), fields: toFields(d) } })));
    }
    if (after.startsWith(':batchGet')) {
      const docs = JSON.parse(opts.body || '{}').documents || [];
      return okJson(docs.map(n => { const k = n.split('/documents/')[1]; return store.has(k) ? { found: { name: n, fields: toFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z' } } : { missing: n }; }));
    }
    const [path, qs] = after.replace(/^\//, '').split('?');
    if (opts.method === 'POST') {
      const id = (qs && new URLSearchParams(qs).get('documentId')) || 'auto' + (++auto);
      const key = path + '/' + id;
      if (store.has(key)) return okJson({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
      const data = Object.fromEntries(Object.entries(JSON.parse(opts.body).fields || {}).map(([k, v]) => [k, fromFs(v)]));
      store.set(key, data);
      return okJson({ name: docName(key), fields: toFields(data) });
    }
    if (opts.method && opts.method !== 'GET') throw new Error('scrittura inattesa: ' + opts.method + ' ' + path);
    return store.has(path) ? okJson({ name: docName(path), fields: toFields(store.get(path)), updateTime: '2026-01-01T00:00:00Z' }) : okJson({}, 404);
  }
  throw new Error('rete inattesa: ' + url);
};

const mod = await import('../../api/maintenance/guasto.js');
const { default: handler, guastoToken, legacyToken, guastoLink, parseToken, liveSeats, primarySeat, matchSeat, romeToday, buildReport, LEGACY_CUTOFF } = mod;
const TODAY = romeToday();
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const put = (k, v) => store.set(k, v);
put('users/admin1', { role: 'admin', name: 'Operatore' });
put('users/owner1', { role: 'landlord', name: 'Proprietaria' });
put('users/owner2', { role: 'landlord', name: 'Altro' });
put('users/t1', { role: 'tenant', name: 'Inquilina' });
put('users/t2', { role: 'tenant', name: 'Altro inquilino' });
put('properties/p1', { ownerId: 'owner1', address: 'Piazza Esempio 42, Roma', interno: '7', name: 'Piazza Esempio 42 int. 7' });
put('properties/p2', { ownerId: 'owner1', address: 'Piazza Esempio 42, Roma', interno: '8' });
put('properties/p3', { ownerId: 'owner1', address: 'Piazza Esempio 42, Roma', interno: '9' });
put('properties/p9', { ownerId: 'owner2', address: 'Via Altra 3', interno: '1' });
// p1: contratto in corso (nato prima del cutoff); p2: libero; p3: un
// segnaposto «contratto da caricare» (nessuna data); p9: di un altro.
put('contracts/cA', { propertyId: 'p1', tenantId: 't1', status: 'active', startDate: '2025-09-01', endDate: addDays(TODAY, 300), createdAt: '2025-08-20T10:00:00Z' });
put('contracts/cOld', { propertyId: 'p1', status: 'expired', startDate: '2023-09-01', endDate: '2025-08-31', createdAt: '2023-08-20T10:00:00Z' });
put('contracts/c_p3_da-caricare', { propertyId: 'p3', status: 'active', contractMissing: true, createdAt: '2026-10-01T10:00:00Z' });
put('contracts/c9', { propertyId: 'p9', status: 'active', startDate: '2026-01-01', endDate: addDays(TODAY, 100), createdAt: '2025-12-01T10:00:00Z' });
put('maintenance/casa1', { userId: 't1', propertyId: 'p1', category: 'idraulica', priority: 'high', description: 'Perde il lavandino', status: 'pending', tenantName: 'Inquilina' });

let ipN = 0;
async function call(body, token, ip) {
  const res = { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
  const headers = { 'x-forwarded-for': ip || '10.0.0.' + (++ipN) };
  if (token) headers.authorization = 'Bearer ' + token;
  await handler({ method: 'POST', headers, body }, res);
  return res;
}
const t1 = 'p1.' + guastoToken('p1', 'cA');
const notifs = () => [...store.keys()].filter(k => k.startsWith('agentNotifications/'));
const maints = () => [...store.keys()].filter(k => k.startsWith('maintenance/')).map(k => ({ id: k.split('/')[1], ...store.get(k) }));

await check('il link è DERIVATO per interno E contratto: un token di p1 non vale per p2, uno storpiato non vale, quello di un altro contratto nemmeno', async () => {
  assert.deepEqual(parseToken(t1), { pid: 'p1', tok: guastoToken('p1', 'cA') });
  assert.equal(parseToken('p1'), null);
  const seats = liveSeats([store.get('contracts/cA') && { id: 'cA', ...store.get('contracts/cA') }], TODAY);
  assert.deepEqual(matchSeat('p1', guastoToken('p1', 'cA'), seats, TODAY), { seat: 'cA' });
  assert.equal(matchSeat('p2', guastoToken('p1', 'cA'), seats, TODAY), null);
  assert.equal(matchSeat('p1', guastoToken('p1', 'cZ'), seats, TODAY), null);
  const bad = guastoToken('p1', 'cA'); assert.equal(matchSeat('p1', bad.slice(0, -1) + (bad.endsWith('A') ? 'B' : 'A'), seats, TODAY), null);
  assert.notEqual(guastoToken('p1', 'cA'), legacyToken('p1'));
  assert.ok(guastoLink('p1', 'cA').startsWith('https://www.boomrome.com/guasto?t=p1.'));
});
await check('liveSeats: finito per data o per terminatedAt = morto; annullato/bozza = morto; futuro e segnaposto = vivi', async () => {
  const s = liveSeats([
    { id: 'a', status: 'active', startDate: '2025-01-01', endDate: addDays(TODAY, -1) },
    { id: 'b', status: 'active', startDate: '2025-01-01', endDate: addDays(TODAY, 30), terminatedAt: addDays(TODAY, -2) },
    { id: 'c', status: 'cancelled', startDate: '2025-01-01', endDate: addDays(TODAY, 30) },
    { id: 'd', status: 'draft' },
    { id: 'e', status: 'expired' },
    { id: 'f', status: 'active', startDate: addDays(TODAY, 20), endDate: addDays(TODAY, 400) },
    { id: 'g', status: 'active', contractMissing: true },
    { id: 'h', status: 'active', startDate: '2025-01-01', endDate: TODAY },
  ], TODAY).map(x => x.id);
  assert.deepEqual(s, ['f', 'g', 'h']);
  assert.equal(primarySeat(liveSeats([{ id: 'out', status: 'active', startDate: '2025-01-01', endDate: addDays(TODAY, 5) },
    { id: 'in', status: 'active', startDate: addDays(TODAY, 6), endDate: addDays(TODAY, 400) }], TODAY), TODAY), 'out', 'il link di adesso è di chi abita lì oggi');
  assert.equal(primarySeat([], TODAY), 'vacant');
});
await check('lookup: palazzo e interno, mai chi ci abita; link sbagliato = 404', async () => {
  const r = await call({ op: 'lookup', t: t1 });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.unit, { building: 'Piazza Esempio 42', interno: '7', label: 'Int. 7' });
  assert.equal(r.headers['cache-control'], 'private, no-store');
  assert.ok(!JSON.stringify(r.body).includes('t1') && !JSON.stringify(r.body).includes('cA'), 'la risposta non dice chi abita lì');
  assert.equal((await call({ op: 'lookup', t: 'p1.xxxxxxxxxxxxxxxxxxxxxx' })).statusCode, 404);
  assert.equal((await call({ op: 'lookup', t: 'p1.' + guastoToken('p1', 'cOld') })).statusCode, 404, 'il link del contratto finito è morto');
});
await check('lookup con l\'archivio contratti giù: 503 (mai «link non valido» per un guasto vero)', async () => {
  queryDown = true;
  try { assert.equal((await call({ op: 'lookup', t: t1 })).statusCode, 503); }
  finally { queryDown = false; }
});
await check('report dal link: il guasto si scrive col contratto del link, poi la card per l\'operatore (priorità alta → Telegram)', async () => {
  const before = maints().length;
  const r = await call({ op: 'report', t: t1, category: 'heating', priority: 'urgent', description: 'La caldaia non parte da stamattina, display E01', name: 'Giulia', phone: '+39 000 000 0001' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.photo, null, 'nessuna foto mandata: null, non false');
  assert.equal(maints().length, before + 1);
  const m = store.get('maintenance/' + r.body.id);
  assert.equal(m.propertyId, 'p1'); assert.equal(m.status, 'open'); assert.equal(m.priority, 'urgent'); assert.equal(m.category, 'heating');
  assert.equal(m.contractId, 'cA');
  assert.deepEqual(m.reporter, { role: 'tenant', name: 'Giulia', phone: '+390000000001', via: 'link' });
  assert.ok(m.title.startsWith('Riscaldamento / caldaia — La caldaia non parte'), m.title);
  const n = store.get('agentNotifications/maint_' + r.body.id);
  assert.ok(n && n.type === 'maintenance.opened' && n.priority === 'urgent' && n.status === 'pending', JSON.stringify(n));
  assert.ok(n.summary.includes('Piazza Esempio 42 · Int. 7') && n.summary.includes('Giulia'), n.summary);
  assert.equal(n.ownerId, 'owner1');
});
await check('anche un guasto «normale» suona sul telefono (high), e la foto va sotto maintenance/guasto-<interno>/', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
  const r = await call({ op: 'report', t: t1, category: 'plumbing', priority: 'medium', description: 'Gocciola il rubinetto della cucina', photo: { base64: 'data:image/jpeg;base64,' + jpeg, type: 'image/jpeg' } });
  assert.equal(r.statusCode, 200); assert.equal(r.body.photo, true);
  assert.equal(store.get('agentNotifications/maint_' + r.body.id).priority, 'high');
  assert.ok(uploads.at(-1).name.startsWith('maintenance/guasto-p1/') && uploads.at(-1).type === 'image/jpeg', JSON.stringify(uploads.at(-1)));
  assert.ok(store.get('maintenance/' + r.body.id).photoUrl.includes('firebasestorage'));
});
await check('la foto che non sale: il guasto si scrive comunque e la risposta dice photo:false (la pagina lo dice all\'inquilino)', async () => {
  storageDown = true;
  try {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]).toString('base64');
    const r = await call({ op: 'report', t: t1, category: 'leaks', description: 'Macchia di umidità sul soffitto', photo: { base64: jpeg, type: 'image/jpeg' } });
    assert.equal(r.statusCode, 200); assert.equal(r.body.photo, false);
    assert.equal(store.get('maintenance/' + r.body.id).photoUrl, '');
  } finally { storageDown = false; }
});
await check('rifiuti che non scrivono niente: descrizione corta, foto non immagine, link falso; honeypot muto', async () => {
  const n0 = maints().length;
  assert.equal((await call({ op: 'report', t: t1, description: 'rotto' })).body.error, 'description_short');
  assert.equal((await call({ op: 'report', t: t1, description: 'Si è rotta la porta di casa', photo: { base64: 'AAAA', type: 'application/pdf' } })).body.error, 'bad_photo');
  assert.equal((await call({ op: 'report', t: 'p9.' + guastoToken('p1', 'cA'), description: 'Si è rotta la porta di casa' })).statusCode, 404);
  const hp = await call({ op: 'report', t: t1, description: 'Si è rotta la porta di casa', company: 'bot srl' });
  assert.equal(hp.statusCode, 200); assert.equal(hp.body.id, null);
  assert.equal(maints().length, n0);
});
await check('dal link, troppe segnalazioni dallo stesso IP: 429', async () => {
  let last;
  for (let i = 0; i < 8; i++) last = await call({ op: 'report', t: t1, description: 'Segnalazione ripetuta numero ' + i }, null, '9.9.9.9');
  assert.equal(last.statusCode, 429);
});
await check('lookup: un token senza la forma giusta (22 caratteri base64url) è 404 SENZA leggere un contratto', async () => {
  assert.equal(parseToken('p1.corto'), null);
  assert.equal(parseToken('p1.' + 'x'.repeat(23)), null);
  assert.equal(parseToken('p1.' + 'x'.repeat(21) + '!'), null);
  const q0 = queries;
  for (const t of ['p1.corto', 'plz_esempio_7.' + 'x'.repeat(40), 'p1.' + 'x'.repeat(21) + '/', 'p1.'])
    assert.equal((await call({ op: 'lookup', t })).statusCode, 404, t);
  assert.equal(queries, q0, 'nessuna lettura dei contratti per un token malformato');
});
await check('lookup: dallo stesso IP oltre 30 aperture in 10 minuti → 429, e le letture si fermano', async () => {
  let last, q = 0;
  for (let i = 0; i < 30; i++) { last = await call({ op: 'lookup', t: 'p1.' + 'y'.repeat(22) }, null, '7.7.7.7'); }
  assert.equal(last.statusCode, 404, 'le prime 30 passano (qui: link falso)');
  q = queries;
  last = await call({ op: 'lookup', t: t1 }, null, '7.7.7.7');
  assert.equal(last.statusCode, 429); assert.equal(last.body.error, 'rate_limited');
  assert.equal(queries, q, 'oltre il tetto nessuna lettura');
  assert.equal((await call({ op: 'lookup', t: t1 }, null, '7.7.7.8')).statusCode, 200, 'un altro indirizzo non paga per questo');
  // il tetto di lookup non mangia quello di report (chiavi diverse)
  assert.equal((await call({ op: 'report', t: t1, description: 'Perde il rubinetto del bagno' }, null, '7.7.7.7')).statusCode, 200);
});
await check('/guasto dice «troppe aperture» su un 429, non «controlla la connessione»', async () => {
  const page = readFileSync(new URL('../../guasto.html', import.meta.url), 'utf8');
  assert.ok(/offKey = j\.status === 429 \? 'rate' : 'fail'/.test(page) && /esc\(t\(offKey\)\)/.test(page));
});
await check('la proprietaria segnala dalla scheda: sui suoi interni sì, su quello di un altro 403 (niente scritto)', async () => {
  const ok = await call({ op: 'report', propertyId: 'p2', category: 'leaks', priority: 'high', description: 'Macchia di umidità sul soffitto del bagno' }, 'tok-owner');
  assert.equal(ok.statusCode, 200);
  const m = store.get('maintenance/' + ok.body.id);
  assert.equal(m.userId, 'owner1'); assert.equal(m.reporter.role, 'owner'); assert.equal(m.source, 'palazzo');
  const n0 = maints().length;
  const no = await call({ op: 'report', propertyId: 'p9', description: 'Macchia di umidità sul soffitto del bagno' }, 'tok-owner');
  assert.equal(no.statusCode, 403); assert.equal(maints().length, n0);
  assert.equal((await call({ op: 'report', propertyId: 'p1', description: 'Macchia di umidità sul soffitto' }, 'tok-tenant')).statusCode, 403, 'un inquilino usa /casa o il link');
  assert.equal((await call({ op: 'report', propertyId: 'p1', description: 'Macchia di umidità sul soffitto' })).statusCode, 401);
});
await check('links: l\'admin per tutti, la proprietaria SOLO per i suoi; il link è quello del contratto vivo (libero = vacant, segnaposto = il suo)', async () => {
  const a = await call({ op: 'links', propertyIds: ['p1', 'p9', 'nope'] }, 'tok-admin');
  assert.deepEqual(Object.keys(a.body.links).sort(), ['p1', 'p9']);
  const o = await call({ op: 'links', propertyIds: ['p1', 'p2', 'p3', 'p9'] }, 'tok-owner');
  assert.deepEqual(Object.keys(o.body.links).sort(), ['p1', 'p2', 'p3']);
  assert.equal(o.body.links.p1, guastoLink('p1', 'cA'));
  assert.equal(o.body.links.p2, guastoLink('p2', 'vacant'));
  assert.equal(o.body.links.p3, guastoLink('p3', 'c_p3_da-caricare'));
  assert.deepEqual(o.body.seats, { p1: 'cA', p2: null, p3: 'c_p3_da-caricare' });
  assert.equal((await call({ op: 'links', propertyIds: ['p1'] }, 'tok-tenant')).statusCode, 403);
  // il link che la porta dà funziona davvero
  const t2 = decodeURIComponent(o.body.links.p2.split('t=')[1]);
  assert.equal((await call({ op: 'lookup', t: t2 })).statusCode, 200);
});
await check('i link già spediti (formula di prima) valgono finché i contratti vivi sono nati prima del cutoff', async () => {
  const legacy = 'p1.' + legacyToken('p1');
  assert.equal((await call({ op: 'lookup', t: legacy })).statusCode, 200);
  // p3: segnaposto nato prima del cutoff → vale; p2 libero → il link di prima NON vale (nessun inquilino da proteggere)
  assert.ok(LEGACY_CUTOFF > '2026-10-01');
  assert.equal((await call({ op: 'lookup', t: 'p3.' + legacyToken('p3') })).statusCode, 200);
  assert.equal((await call({ op: 'lookup', t: 'p2.' + legacyToken('p2') })).statusCode, 404);
  const r = await call({ op: 'report', t: legacy, description: 'Il citofono non funziona più' });
  assert.equal(r.statusCode, 200); assert.equal(store.get('maintenance/' + r.body.id).contractId, 'cA');
});
await check('AL CAMBIO DI INQUILINO il link del contratto finito risponde 404, il nuovo funziona, e anche il link di prima muore', async () => {
  // cA finisce ieri, entra un inquilino nuovo (contratto nato dopo il cutoff)
  store.get('contracts/cA').endDate = addDays(TODAY, -1);
  put('contracts/cB', { propertyId: 'p1', tenantId: 't2', status: 'active', startDate: TODAY, endDate: addDays(TODAY, 365), createdAt: TODAY > LEGACY_CUTOFF ? TODAY + 'T09:00:00Z' : LEGACY_CUTOFF + 'T09:00:00Z' });
  const n0 = maints().length;
  assert.equal((await call({ op: 'lookup', t: t1 })).statusCode, 404);
  assert.equal((await call({ op: 'report', t: t1, description: 'Ancora io, l\'inquilino uscito' })).statusCode, 404);
  assert.equal((await call({ op: 'lookup', t: 'p1.' + legacyToken('p1') })).statusCode, 404, 'il link di prima muore col primo contratto nuovo');
  assert.equal(maints().length, n0, 'nessun guasto scritto dal vecchio link');
  const o = await call({ op: 'links', propertyIds: ['p1'] }, 'tok-owner');
  assert.equal(o.body.seats.p1, 'cB');
  const tB = decodeURIComponent(o.body.links.p1.split('t=')[1]);
  const r = await call({ op: 'report', t: tB, description: 'La lavatrice non scarica l\'acqua' });
  assert.equal(r.statusCode, 200); assert.equal(store.get('maintenance/' + r.body.id).contractId, 'cB');
});
await check('il link dell\'interno libero smette di valere quando arriva un contratto', async () => {
  const tv = 'p2.' + guastoToken('p2', 'vacant');
  assert.equal((await call({ op: 'lookup', t: tv })).statusCode, 200);
  put('contracts/cP2', { propertyId: 'p2', status: 'active', startDate: TODAY, endDate: addDays(TODAY, 365), createdAt: TODAY + 'T09:00:00Z' });
  assert.equal((await call({ op: 'lookup', t: tv })).statusCode, 404);
  assert.equal((await call({ op: 'lookup', t: 'p2.' + guastoToken('p2', 'cP2') })).statusCode, 200);
});
await check('due contratti vivi sullo stesso interno: un link per ciascuno (byContract), entrambi aprono', async () => {
  put('contracts/cP2b', { propertyId: 'p2', status: 'active', startDate: addDays(TODAY, 40), endDate: addDays(TODAY, 400), createdAt: TODAY + 'T10:00:00Z' });
  const o = await call({ op: 'links', propertyIds: ['p2'] }, 'tok-owner');
  assert.equal(o.body.seats.p2, 'cP2', 'il link principale è di chi abita lì oggi');
  assert.deepEqual(Object.keys(o.body.byContract.p2).sort(), ['cP2', 'cP2b']);
  for (const l of Object.values(o.body.byContract.p2)) assert.equal((await call({ op: 'lookup', t: decodeURIComponent(l.split('t=')[1]) })).statusCode, 200);
});
await check('notify (il ping di /casa): chi ha scritto sì, un altro inquilino no, due volte = una card sola', async () => {
  assert.equal((await call({ op: 'notify', id: 'casa1' }, 'tok-tenant2')).statusCode, 403);
  const r = await call({ op: 'notify', id: 'casa1' }, 'tok-tenant');
  assert.equal(r.statusCode, 200);
  const n = store.get('agentNotifications/maint_casa1');
  assert.ok(n && n.priority === 'high' && n.summary.includes('Int. 7'), JSON.stringify(n));
  const again = await call({ op: 'notify', id: 'casa1' }, 'tok-tenant');
  assert.equal(again.body.already, true);
  assert.equal(notifs().filter(k => k === 'agentNotifications/maint_casa1').length, 1);
});
await check('buildReport: vocabolario chiuso, «emergency» di /casa diventa urgent, telefono ripulito', async () => {
  const r = buildReport({ category: 'boh', priority: 'emergency', description: 'Acqua dal soffitto in cucina!', phone: 'chiamare dopo le 18' });
  assert.deepEqual([r.category, r.priority, r.phone], ['other', 'urgent', '']);
});
await check('giunzioni: /casa manda il SUO contratto e non chiama più /api/agent/notify senza credenziale; /guasto non indicizzata e no-store', async () => {
  const casa = readFileSync(new URL('../../tenant.html', import.meta.url), 'utf8');
  assert.ok(!/fetch\('\/api\/agent\/notify'/.test(casa), 'la vecchia chiamata da 401 è tornata');
  assert.ok(/fetch\('\/api\/maintenance\/guasto'[\s\S]{0,200}Authorization[\s\S]{0,120}op:'notify',id:ref\.id/.test(casa));
  assert.ok(/var doc=\{userId:mUid[\s\S]{0,400}contractId:/.test(casa), 'la segnalazione di /casa porta il contractId (le rules lo esigono)');
  const page = readFileSync(new URL('../../guasto.html', import.meta.url), 'utf8');
  assert.ok(page.includes('noindex') && page.includes("fetch('/api/maintenance/guasto'") && !/firebase/i.test(page.replace(/Firebase/g, '')), 'la pagina parla solo con la porta');
  const v = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const h = v.headers.find(x => /\|guasto\|guasto\.html[|)]/.test(x.source));
  assert.ok(h && h.headers.some(x => x.key === 'Cache-Control' && /no-store/.test(x.value)) && h.headers.some(x => x.key === 'X-Robots-Tag'));
  assert.ok(Object.keys(v.functions || {}).length <= 50);
});

console.log(`\n${count} check — la porta dei guasti, handler vero su Firestore in memoria.`);
