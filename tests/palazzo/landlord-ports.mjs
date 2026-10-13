// tests/palazzo/landlord-ports.mjs — LE PORTE CHE L'ACCOUNT DELLA PROPRIETARIA APRE.
//
// Creare l'account di una proprietaria esterna accende il ruolo 'landlord'
// su TUTTA la superficie API, non solo sul Palazzo. Diverse porte
// controllavano il ruolo e non a chi appartiene la cosa. Qui gli handler
// VERI su un Firestore in memoria (si fingono solo Identity Toolkit,
// Firestore REST, Storage e nodemailer), con un token di proprietaria
// sintetico:
//   - notify/send: email col marchio BOOM solo a BOOM, a sé stessa o agli
//     inquilini dei SUOI immobili, e bottone solo verso boomrome.com;
//   - preagreement/create · convert · notify: solo sui SUOI immobili (403);
//   - photos/enhance: solo i SUOI annunci, mai lo sweep;
//   - portal/ingest: solo admin.
// E la porta d'ingresso: /login in italiano quando la destinazione è il
// Palazzo, col reset della password che riporta lì (Chromium, se c'è).
// Dati sintetici: nomi inventati, +39 000…, @example.invalid.
// Uso: node tests/palazzo/landlord-ports.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.GMAIL_USER = 'boom-mailbox@example.invalid';
process.env.GMAIL_APP_PASS = 'x';
process.env.HOMIE_SECRET = 'segreto-di-prova';
delete process.env.ANTHROPIC_API_KEY;

let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log('✓ ' + name); };

// ── Firestore in memoria (GET, batchGet, runQuery EQUAL/IN, create, patch) ──
const store = new Map(), writes = [];
let auto = 0;
const okJson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const fromFs = v => v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue !== undefined ? v.doubleValue
  : v.booleanValue !== undefined ? v.booleanValue : v.timestampValue !== undefined ? v.timestampValue : v.nullValue !== undefined ? null
  : v.arrayValue ? (v.arrayValue.values || []).map(fromFs) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)])) : null;
const toFields = o => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
const docName = k => 'projects/test-proj/databases/(default)/documents/' + k;
const SESSIONS = { 'tok-admin': 'admin1', 'tok-chiara': 'owner1', 'tok-other': 'owner2', 'tok-tenant': 't1' };
const EMAILS = { admin1: 'operatore@example.invalid', owner1: 'chiara.sintetica@example.invalid', owner2: 'altro@example.invalid', t1: 'inquilina@example.invalid' };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('accounts:lookup')) {
    const uid = SESSIONS[JSON.parse(opts.body || '{}').idToken];
    return uid ? okJson({ users: [{ localId: uid, email: EMAILS[uid] }] }) : okJson({ error: 'INVALID' }, 400);
  }
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return okJson({ idToken: 'svc', localId: 'svc', expiresIn: '3600' });
  if (url.includes('firebasestorage.googleapis.com')) { writes.push('storage:' + url); return okJson({ name: 'x', downloadTokens: 'dl' }); }
  if (url.includes('api.anthropic.com')) throw new Error('nessuna chiamata al modello attesa');
  if (url.includes('firestore.googleapis.com')) {
    const after = url.slice(url.indexOf('/documents') + 10);
    if (after.startsWith(':runQuery')) {
      const q = JSON.parse(opts.body).structuredQuery, coll = q.from[0].collectionId, ff = q.where && q.where.fieldFilter;
      const val = ff ? fromFs(ff.value) : null;
      const rows = [...store.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2)
        .filter(([, d]) => !ff || (ff.op === 'IN' ? val.includes(d[ff.field.fieldPath]) : d[ff.field.fieldPath] === val));
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
      store.set(key, data); writes.push('create:' + key);
      return okJson({ name: docName(key), fields: toFields(data) });
    }
    if (opts.method === 'PATCH') {
      const data = Object.fromEntries(Object.entries(JSON.parse(opts.body).fields || {}).map(([k, v]) => [k, fromFs(v)]));
      store.set(path, { ...(store.get(path) || {}), ...data }); writes.push('patch:' + path);
      return okJson({ name: docName(path), fields: toFields(store.get(path)) });
    }
    if (opts.method && opts.method !== 'GET') throw new Error('scrittura inattesa: ' + opts.method + ' ' + path);
    return store.has(path) ? okJson({ name: docName(path), fields: toFields(store.get(path)), updateTime: '2026-01-01T00:00:00Z' }) : okJson({}, 404);
  }
  throw new Error('rete inattesa: ' + url);
};

const put = (k, v) => store.set(k, v);
put('users/admin1', { role: 'admin', name: 'Operatore', email: EMAILS.admin1 });
put('users/owner1', { role: 'landlord', name: 'Chiara Sintetica', email: EMAILS.owner1 });
put('users/owner2', { role: 'landlord', name: 'Altro Proprietario', email: EMAILS.owner2 });
put('users/t1', { role: 'tenant', name: 'Inquilina Uno', email: 'profilo.uno@example.invalid' });
put('properties/plz_esempio_7', { ownerId: 'owner1', address: 'Piazza Esempio 42', interno: '7', listingId: 'lst_mine' });
put('properties/plz_esempio_8', { ownerId: 'owner1', address: 'Piazza Esempio 42', interno: '8' });
put('properties/p_altrui', { ownerId: 'owner2', address: 'Via Altra 3' });
put('contracts/c7', { propertyId: 'plz_esempio_7', tenantId: 't1', tenantEmail: 'contratto.uno@example.invalid',
  coTenants: [{ name: 'Coinquilino Sintetico', email: 'co.uno@example.invalid' }] });
put('contracts/c_altrui', { propertyId: 'p_altrui', tenantEmail: 'inquilino.altrui@example.invalid' });
put('preAgreements/pa_mine', { token: 'a'.repeat(32), status: 'sent', propertyId: 'plz_esempio_7', tenant: { fullName: 'Cliente Sintetico', email: 'cliente@example.invalid' } });
put('preAgreements/pa_altrui', { token: 'b'.repeat(32), status: 'accepted', propertyId: 'p_altrui', tenant: { fullName: 'Altro Cliente', email: 'altro.cliente@example.invalid' } });
put('preAgreements/pa_orfana', { token: 'c'.repeat(32), status: 'accepted', tenant: { fullName: 'Senza Immobile', email: 'orfana@example.invalid' } });
put('listings/lst_mine', { name: 'Int. 7', status: 'available' });
put('listings/lst_owned_field', { name: 'Int. 8', ownerId: 'owner1', status: 'available' });
put('listings/lst_altrui', { name: 'Casa di un altro', status: 'available', image: 'https://example.invalid/a.jpg' });

function mkRes() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
}
async function call(handler, token, body, extra = {}) {
  const res = mkRes();
  await handler({ method: extra.method || 'POST', query: extra.query || {}, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'x-forwarded-for': '10.0.0.' + (++auto) }, body }, res);
  return res;
}
const mails = () => globalThis.__mails || [];

const notifySend = (await import('../../api/notify/send.js'));
const create = (await import('../../api/preagreement/create.js')).default;
const convertMod = await import('../../api/preagreement/convert.js');
const convert = convertMod.default;
const sendSign = (await import('../../api/preagreement/send-sign.js')).default;
const resolvePa = (await import('../../api/preagreement/resolve.js')).default;
const paNotify = (await import('../../api/preagreement/notify.js')).default;
const enhance = (await import('../../api/photos/enhance.js'));
const ingest = (await import('../../api/portal/ingest.js')).default;

// ── notify/send ──────────────────────────────────────────────────────────
await check('notify/send: linkAllowed — la proprietaria solo https verso boomrome.com, l\'admin http(s) qualunque, mai javascript:', async () => {
  const { linkAllowed } = notifySend;
  assert.equal(linkAllowed('https://www.boomrome.com/portal#palazzo', false), true);
  assert.equal(linkAllowed('https://boomrome.com/portal', false), true);
  assert.equal(linkAllowed('https://evil.example.invalid/login', false), false);
  assert.equal(linkAllowed('https://www.boomrome.com.evil.example.invalid/', false), false);
  assert.equal(linkAllowed('https://user:pw@www.boomrome.com/', false), false);
  assert.equal(linkAllowed('http://www.boomrome.com/', false), false);
  assert.equal(linkAllowed('javascript:alert(1)', false), false);
  assert.equal(linkAllowed('https://preview-x.vercel.app/portal', true), true);
  assert.equal(linkAllowed('javascript:alert(1)', true), false);
});
await check('notify/send: la proprietaria NON manda un\'email BOOM a un indirizzo qualunque (403, nessuna email)', async () => {
  const n0 = mails().length;
  const r = await call(notifySend.default, 'tok-chiara', { to: 'vittima@example.invalid', params: { heading: 'Verifica il tuo conto', intro: 'Clicca qui' } });
  assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'recipient_not_allowed');
  assert.equal(mails().length, n0);
});
await check('notify/send: …né all\'inquilino di un ALTRO proprietario', async () => {
  const r = await call(notifySend.default, 'tok-chiara', { to: 'inquilino.altrui@example.invalid', params: { heading: 'x' } });
  assert.equal(r.statusCode, 403);
});
await check('notify/send: la proprietaria scrive ai SUOI inquilini (dal contratto, dal profilo, i co-intestatari), a BOOM e a sé stessa', async () => {
  for (const to of ['contratto.uno@example.invalid', 'PROFILO.UNO@example.invalid', 'co.uno@example.invalid', 'valentino@boom-rome.com', 'valentino@boomrome.com', EMAILS.owner1]) {
    const n0 = mails().length;
    const r = await call(notifySend.default, 'tok-chiara', { to, params: { heading: 'Promemoria canone', intro: 'Ciao', cta_text: 'Apri', portal_link: 'https://www.boomrome.com/portal' } });
    assert.equal(r.statusCode, 200, to + ' → ' + JSON.stringify(r.body));
    assert.equal(mails().length, n0 + 1);
    assert.equal(mails().at(-1).to, to);
  }
});
await check('notify/send: il bottone della proprietaria verso un sito esterno = 400, nessuna email; l\'admin scrive a chiunque', async () => {
  const n0 = mails().length;
  const r = await call(notifySend.default, 'tok-chiara', { to: 'contratto.uno@example.invalid', params: { heading: 'x', cta_text: 'Paga qui', portal_link: 'https://evil.example.invalid/pay' } });
  assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'bad_link'); assert.equal(mails().length, n0);
  const a = await call(notifySend.default, 'tok-admin', { to: 'chiunque@example.invalid', params: { heading: 'Notifica', cta_text: 'Apri', portal_link: 'https://preview-x.vercel.app/portal' } });
  assert.equal(a.statusCode, 200); assert.equal(mails().length, n0 + 1);
  assert.equal((await call(notifySend.default, 'tok-tenant', { to: 'x@example.invalid', params: {} })).statusCode, 403, 'gli inquilini non passano di qui');
});

// ── preagreement/create ──────────────────────────────────────────────────
const PA_BODY = (propertyId) => ({ propertyId, property: { address: 'Piazza Esempio 42, int. 7' }, landlord: { name: 'Locatrice Sintetica S.r.l.' },
  lease: { startDate: '2026-11-01', months: 12 }, money: { rent: 1200, dueAtSigning: 2400 }, tenant: { fullName: 'Cliente Sintetico', email: 'cliente@example.invalid' } });
const paCount = () => [...store.keys()].filter(k => k.startsWith('preAgreements/')).length;
await check('preagreement/create: la proprietaria SENZA immobile, o con l\'immobile di un altro, riceve 403 e non nasce nessuna proposta', async () => {
  const n0 = paCount();
  assert.equal((await call(create, 'tok-chiara', PA_BODY(''))).statusCode, 403);
  const r = await call(create, 'tok-chiara', PA_BODY('p_altrui'));
  assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'forbidden_property');
  assert.equal((await call(create, 'tok-chiara', PA_BODY('non_esiste'))).statusCode, 403);
  assert.equal(paCount(), n0);
});
await check('preagreement/create: sul SUO immobile sì; l\'admin come prima (anche senza immobile)', async () => {
  const n0 = paCount();
  const r = await call(create, 'tok-chiara', PA_BODY('plz_esempio_7'));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(paCount(), n0 + 1);
  const a = await call(create, 'tok-admin', PA_BODY(''));
  assert.equal(a.statusCode, 200); assert.equal(paCount(), n0 + 2);
});

// ── preagreement/convert · notify ───────────────────────────────────────
await check('preagreement/convert: la proposta di un altro, una senza immobile o «crea l\'immobile» → 403 alla proprietaria, nessuna scrittura', async () => {
  const w0 = writes.length;
  assert.equal((await call(convert, 'tok-chiara', { id: 'pa_altrui' })).statusCode, 403);
  assert.equal((await call(convert, 'tok-chiara', { id: 'pa_orfana' })).statusCode, 403);
  assert.equal((await call(convert, 'tok-chiara', { id: 'pa_orfana', propertyId: 'p_altrui' })).statusCode, 403);
  assert.equal((await call(convert, 'tok-chiara', { id: 'pa_mine', propertyId: 'p_altrui' })).statusCode, 403, 'verso un immobile non suo');
  assert.equal((await call(convert, 'tok-chiara', { id: 'pa_orfana', createProperty: true })).statusCode, 403);
  assert.deepEqual(writes.slice(w0), []);
});
await check('preagreement/convert: la SUA proposta passa il cancello (qui: 409 non ancora accettata); l\'admin passa anche su quella altrui', async () => {
  const r = await call(convert, 'tok-chiara', { id: 'pa_mine' });
  assert.equal(r.statusCode, 409); assert.equal(r.body.error, 'not_accepted_yet');
  const a = await call(convert, 'tok-admin', { id: 'pa_mine' });
  assert.equal(a.statusCode, 409);
});
await check('preagreement/notify: «Reinvia copia» sulla proposta di un altro → 403 e nessuna email; sulla sua passa il cancello', async () => {
  const n0 = mails().length;
  const r = await call(paNotify, 'tok-chiara', { id: 'pa_altrui' });
  assert.equal(r.statusCode, 403); assert.equal(mails().length, n0);
  assert.equal((await call(paNotify, 'tok-chiara', { id: 'pa_orfana' })).statusCode, 403);
  const mine = await call(paNotify, 'tok-chiara', { id: 'pa_mine' });
  assert.equal(mine.statusCode, 409, 'passato il cancello: non ancora accettata');
});

await check('paOwnerGuard (una copia sola, la importano send-sign e resolve): la proprietaria solo sulle SUE proposte e verso i SUOI immobili; l\'admin sempre', async () => {
  const { paOwnerGuard } = convertMod;
  const chiara = { uid: 'owner1', profile: { role: 'landlord' } }, adm = { uid: 'admin1', profile: { role: 'admin' } };
  const pa = id => store.get('preAgreements/' + id);
  assert.equal(await paOwnerGuard(chiara, pa('pa_mine'), {}), null);
  assert.equal(await paOwnerGuard(chiara, pa('pa_altrui'), {}), 'forbidden_property');
  assert.equal(await paOwnerGuard(chiara, pa('pa_orfana'), {}), 'forbidden_property', 'senza immobile');
  assert.equal(await paOwnerGuard(chiara, pa('pa_mine'), { propertyId: 'p_altrui' }), 'forbidden_property', 'verso un immobile non suo');
  assert.equal(await paOwnerGuard(chiara, pa('pa_mine'), { propertyId: '../users/owner1' }), 'forbidden_property', 'un id che non è un id');
  assert.equal(await paOwnerGuard(chiara, pa('pa_mine'), { createProperty: true }), 'forbidden_property');
  assert.equal(await paOwnerGuard({ uid: 'owner2', profile: { role: 'landlord' } }, pa('pa_mine'), {}), 'forbidden_property');
  assert.equal(await paOwnerGuard(adm, pa('pa_altrui'), { createProperty: true }), null);
  assert.equal(await paOwnerGuard(adm, pa('pa_orfana'), {}), null);
});

// ── photos/enhance ──────────────────────────────────────────────────────
await check('photos/enhance: la proprietaria non riscrive le foto di un annuncio altrui (403, nessuna scrittura) e non lancia lo sweep', async () => {
  const w0 = writes.length;
  const r = await call(enhance.default, 'tok-chiara', { listingId: 'lst_altrui', mode: 'apply' });
  assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'forbidden_listing');
  assert.equal((await call(enhance.default, 'tok-chiara', { listingId: 'lst_altrui', mode: 'audit', urls: ['https://example.invalid/x.jpg'] })).statusCode, 403);
  assert.equal((await call(enhance.default, 'tok-chiara', { mode: 'sweep' })).statusCode, 403);
  assert.deepEqual(writes.slice(w0), []);
});
await check('photos/enhance: i SUOI annunci (ownerId sull\'annuncio, o agganciato a un suo immobile) passano; l\'admin come prima', async () => {
  assert.equal(await enhance.ownsListing('owner1', 'lst_mine'), true, 'property.listingId');
  assert.equal(await enhance.ownsListing('owner1', 'lst_owned_field'), true, 'listing.ownerId');
  assert.equal(await enhance.ownsListing('owner1', 'lst_altrui'), false);
  assert.equal(await enhance.ownsListing('owner2', 'lst_mine'), false);
  const r = await call(enhance.default, 'tok-chiara', { listingId: 'lst_mine', mode: 'audit' });
  assert.equal(r.statusCode, 200); assert.equal(r.body.note, 'no_photos');
  const a = await call(enhance.default, 'tok-admin', { listingId: 'lst_mine', mode: 'audit' });
  assert.equal(a.statusCode, 200);
});

// ── portal/ingest ───────────────────────────────────────────────────────
await check('portal/ingest: la proprietaria (e l\'inquilino) ricevono 403 prima di qualunque lettura; l\'admin passa il cancello', async () => {
  const r = await call(ingest, 'tok-chiara', { text: 'Contratto di locazione fra le parti…' });
  assert.equal(r.statusCode, 403);
  assert.equal((await call(ingest, 'tok-tenant', { text: 'x' })).statusCode, 403);
  const a = await call(ingest, 'tok-admin', { text: 'Contratto di locazione fra le parti…' });
  assert.equal(a.statusCode, 500); assert.equal(a.body.error, 'server_missing_anthropic_key', 'oltre il cancello (qui senza chiave: nessuna chiamata al modello)');
});

// ── send-sign · resolve: il cancello del proprietario (ora vincolante) ─────
// Le due porte accettano ancora qualunque proprietario su qualunque paId: un
// 🖊 Magic Sign sulla proposta di un ALTRO crea contratto, token e PDF e
// manda le email al suo cliente e al suo locatore. La guardia è pronta
// (paOwnerGuard, qui sopra) e va messa nei due file dal filone che li
// possiede. Finché una porta risponde altro che 403 il controllo NON fa
// fallire la suite ma lo dice; quando la guardia c'è, si toglie il nome da
// PENDING_OTHERS e il controllo diventa vincolante. Gira per ULTIMO fra gli
// handler: se la porta è aperta scrive davvero (contratto, token, email).
// Chiuse il 13/10/2026 (filone S9): send-sign e resolve usano paOwnerGuard.
const PENDING_OTHERS = new Set([]);
const pending = [];
for (const [name, h] of [['send-sign', sendSign], ['resolve', resolvePa]]) {
  await check(name + ': la proprietaria sulla proposta di un ALTRO → 403, nessuna scrittura né email' + (PENDING_OTHERS.has(name) ? ' (in attesa del filone preagreement)' : ''), async () => {
    const w0 = writes.length, m0 = mails().length;
    const r = await call(h, 'tok-chiara', { id: 'pa_altrui' });
    if (r.statusCode === 403) {
      assert.equal(r.body.error, 'forbidden_property');
      assert.deepEqual(writes.slice(w0), []); assert.equal(mails().length, m0);
      if (PENDING_OTHERS.has(name)) console.log('  (chiusa: togliere «' + name + '» da PENDING_OTHERS)');
      return;
    }
    if (!PENDING_OTHERS.has(name)) assert.fail(name + ' → ' + r.statusCode + ' ' + JSON.stringify(r.body));
    pending.push(name + ' → ' + r.statusCode + ', scritture ' + (writes.length - w0) + ', email ' + (mails().length - m0));
    console.log('  ⚠ APERTA: ' + pending.at(-1));
  });
}

// ── La porta d'ingresso: /login in italiano per il Palazzo (Chromium) ────
const { loadChromium, launchOptions } = await import('../_browser.mjs');
const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP (browser): playwright non disponibile — /login in italiano non provato');
} else {
  const ROOT = new URL('../../', import.meta.url);
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/login') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(new URL('login.html', ROOT))); return; }
    if (u.pathname === '/js/boom-err.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('js/boom-err.js', ROOT))); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  // Firebase finto: registra le richieste di reset (email, continueUrl, lingua).
  const STUB = `window.__reset=[];var A={languageCode:null,setPersistence:async function(){},onAuthStateChanged:function(){},
    signInWithEmailAndPassword:async function(){var e=new Error('x');e.code='auth/wrong-password';throw e;},
    sendPasswordResetEmail:async function(email,s){window.__reset.push({email:email,url:s&&s.url||null,lang:A.languageCode});
      if(window.__rejectContinue&&s){var e=new Error('x');e.code='auth/unauthorized-continue-uri';throw e;}}};
    window.firebase={initializeApp:function(){},auth:Object.assign(function(){return A;},{Auth:{Persistence:{LOCAL:'l',SESSION:'s'}}})};`;
  const browser = await chromium.launch(launchOptions());
  async function open(qs) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', serviceWorkers: 'block' });
    await ctx.route(/gstatic\.com/, r => r.request().url().includes('app-compat') ? r.fulfill({ contentType: 'text/javascript', body: STUB }) : r.fulfill({ contentType: 'text/javascript', body: '' }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base + '/login' + qs);
    await page.waitForFunction(() => window.__reset !== undefined);
    return { page, ctx, errors };
  }
  try {
    await check('/login?next=/portal#palazzo parla ITALIANO: titolo, «Password dimenticata?», «Accedi», la riga «Prima volta?»', async () => {
      const { page, ctx, errors } = await open('?next=%2Fportal%23palazzo');
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'it');
      assert.equal(await page.title(), 'Accedi — BOOM Roma');
      assert.equal((await page.textContent('#forgotBtn')).trim(), 'Password dimenticata?');
      assert.equal((await page.textContent('#submitBtn .t')).trim(), 'Accedi');
      assert.match(await page.textContent('.a-first'), /Prima volta\?/);
      await page.click('#forgotBtn');
      assert.match(await page.textContent('#message'), /Scrivi la tua email/);
      await page.fill('#email', 'chiara.sintetica@example.invalid'); await page.fill('#password', 'sbagliata');
      await page.click('#submitBtn');
      await page.waitForSelector('#message.show.error');
      assert.match(await page.textContent('#message'), /Email o password non corretti/);
      assert.deepEqual(errors, []);
      await ctx.close();
    });
    await check('il reset della password esce in italiano e RIPORTA al Palazzo (continueUrl /login?next=/portal#palazzo)', async () => {
      const { page, ctx } = await open('?next=%2Fportal%23palazzo');
      await page.fill('#email', 'chiara.sintetica@example.invalid');
      await page.click('#forgotBtn');
      await page.waitForSelector('#message.show.success');
      const r = await page.evaluate(() => window.__reset);
      assert.equal(r.length, 1);
      assert.equal(r[0].lang, 'it');
      assert.equal(r[0].url, base + '/login?next=%2Fportal%23palazzo');
      assert.match(await page.textContent('#message'), /link per impostare la password/);
      await ctx.close();
    });
    await check('se Firebase rifiuta il continueUrl (dominio non autorizzato) l\'email parte comunque, senza ritorno', async () => {
      const { page, ctx } = await open('?next=%2Fportal%23palazzo');
      await page.evaluate(() => { window.__rejectContinue = true; });
      await page.fill('#email', 'chiara.sintetica@example.invalid');
      await page.click('#forgotBtn');
      await page.waitForSelector('#message.show.success');
      const r = await page.evaluate(() => window.__reset);
      assert.equal(r.length, 2); assert.equal(r[1].url, null);
      await ctx.close();
    });
    await check('/login senza Palazzo resta in inglese (nessuna riga in più), e anche lì il reset riporta a /login', async () => {
      const { page, ctx } = await open('');
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
      assert.equal((await page.textContent('#forgotBtn')).trim(), 'Forgot?');
      assert.equal(await page.$('.a-first'), null);
      await page.fill('#email', 'someone@example.invalid'); await page.click('#forgotBtn');
      await page.waitForSelector('#message.show.success');
      const r = await page.evaluate(() => window.__reset);
      assert.equal(r[0].lang, null); assert.equal(r[0].url, base + '/login?next=%2Fportal');
      await ctx.close();
    });
    await check('a 390px «BOOM» e la freccia per tornare al sito non si accavallano (la freccia ha un nome)', async () => {
      const { page, ctx } = await open('?next=%2Fportal%23palazzo');
      const [a, b] = await page.evaluate(() => [document.querySelector('.marchio').getBoundingClientRect().right, document.querySelector('.home').getBoundingClientRect().left]);
      assert.ok(a <= b, a + ' > ' + b);
      assert.equal((await page.textContent('.home')).trim(), 'Torna al sito');
      await ctx.close();
    });
  } finally { await browser.close(); server.close(); }
}

console.log(`\n${count} check — le porte del ruolo landlord, handler veri su Firestore in memoria.`);
if (pending.length) console.log('⚠ ' + pending.length + ' porte ancora aperte, fuori da questo filone: ' + pending.join(' · '));
