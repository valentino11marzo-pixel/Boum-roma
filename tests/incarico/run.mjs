// tests/incarico/run.mjs — l'incarico del proprietario: motore, porta, firma.
//
// Cinque promesse, in ordine di costo se si rompono.
//
// 1. UN TESTO SOLO, MAI UN VALORE DEDOTTO. Le condizioni passano da
//    normalize (rifiuta, non aggiusta): esclusiva non dichiarata, IVA non
//    scelta, penale a zero, penale senza preavviso → errore. Le clausole
//    escono dal motore: esclusiva e recesso sono `specific`.
// 2. IL LINK È LA CREDENZIALE, E NIENT'ALTRO. Token sbagliato e incarico
//    inesistente danno lo stesso 404; la risposta pubblica non porta il token.
// 3. LA FIRMA COPRE CIÒ CHE È STATO LETTO. accept esplicito, clausole
//    approvate una per una, nome dell'intestatario, firma PNG vera, impronta
//    uguale a quella del server (409 se le condizioni sono cambiate).
// 4. UNA FIRMA SOLA. Due tap insieme = una firma, una email al proprietario;
//    il secondo risponde `already`. Annullato → 410.
// 5. IL RESTO È BEST-EFFORT E SI DICE. Storage giù: la firma resta, il
//    documento porta `pending`. L'area proprietario si apre da sola solo
//    senza ambiguità; altrimenti `manual` con la ragione, e niente si tocca.
//
// Handler VERO, pdf-lib VERO, nodemailer mockato, Firestore in memoria con
// versioni e precondizioni. Tre guardie provate per mutazione.
// Run: node tests/incarico/run.mjs
import { register } from 'node:module';
import fs from 'node:fs';
import zlib from 'node:zlib';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
process.env.ADMIN_NOTIFY_EMAIL = 'operatore@test.it';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond, detail) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 300) : '')); };

// ── Firestore in memoria (versioni + precondizioni), Storage, Identity ──
const DB = new Map();           // path → { data, ut }
const FILES = new Map();
const SIGNUPS = [];
let utSeq = 0, autoId = 0;
const FAIL = { storage: false };
const nextUT = () => new Date(1700000000000 + (++utSeq)).toISOString();
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
const unfields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const docOut = (path) => ({ name: 'projects/p/databases/(default)/documents/' + path, fields: fields(DB.get(path).data), updateTime: DB.get(path).ut });
const put = (path, data) => DB.set(path, { data, ut: nextUT() });
const get = (path) => (DB.get(path) || {}).data || null;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = opts.method || 'GET';
  const body = opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
  if (u.includes('accounts:lookup')) return body.idToken === 'admin-token' ? J({ users: [{ localId: 'admin1', email: 'valentino@test.it' }] }) : J({ error: {} }, 400);
  if (u.includes('accounts:signUp')) { SIGNUPS.push(body.email); return J({ localId: 'uid_' + SIGNUPS.length }); }
  if (u.includes('identitytoolkit') || u.includes('securetoken')) return J({ idToken: 'srv', localId: 'srv', expiresIn: '3600' });
  if (u.includes('firebasestorage.googleapis.com')) {
    if (FAIL.storage) return J({ error: 'denied' }, 403);
    const name = decodeURIComponent(new URL(u).searchParams.get('name'));
    FILES.set(name, Buffer.from(opts.body));
    return J({ downloadTokens: 'tok' });
  }
  if (!u.includes('firestore.googleapis.com')) return J({});
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery, coll = q.from[0].collectionId, f = q.where && q.where.fieldFilter;
    let rows = [...DB.keys()].filter((k) => k.startsWith(coll + '/') && k.split('/').length === 2);
    if (f) rows = rows.filter((k) => JSON.stringify(toFs(get(k)[f.field.fieldPath])) === JSON.stringify(f.value));
    rows = rows.slice(0, q.limit || 100);
    return J(rows.length ? rows.map((k) => ({ document: docOut(k) })) : [{ readTime: 'x' }]);
  }
  if (u.includes(':commit')) {
    for (const w of body.writes) {
      const p = w.update.name.split('/documents/')[1], c = w.currentDocument || {};
      if ((c.exists === true && !DB.has(p)) || (c.exists === false && DB.has(p)) || (c.updateTime && (!DB.has(p) || DB.get(p).ut !== c.updateTime))) return J({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    }
    for (const w of body.writes) {
      const p = w.update.name.split('/documents/')[1];
      put(p, { ...(get(p) || {}), ...unfields(w.update.fields) });
    }
    return J({ writeResults: [] });
  }
  const path = decodeURIComponent(new URL(u).pathname.split('/documents/')[1] || '');
  if (method === 'GET') return DB.has(path) ? J(docOut(path)) : J({ error: { code: 404 } }, 404);
  if (method === 'POST') {
    const id = new URL(u).searchParams.get('documentId') || 'auto' + (++autoId), key = path + '/' + id;
    if (DB.has(key)) return J({ error: { status: 'ALREADY_EXISTS' } }, 409);
    put(key, unfields(body.fields));
    return J(docOut(key));
  }
  if (method === 'PATCH') { put(path, { ...(get(path) || {}), ...unfields(body.fields) }); return J(docOut(path)); }
  return J({});
};

const INC = (await import('../../js/incarico-engine.js')).default;
const MOD = await import('../../api/owners/incarico.js');
const handler = MOD.default;

let ipSeq = 0;
const call = async (h, { method = 'POST', body, query, token, ip } = {}) => {
  const res = { statusCode: 200, body: null, headers: {}, sent: null,
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, send(b) { this.sent = b; return this; }, end() { return this; } };
  await h({ method, body, query: query || {}, headers: { 'x-forwarded-for': ip || '10.0.0.' + (++ipSeq), 'user-agent': 'TestUA', ...(token ? { authorization: 'Bearer ' + token } : {}) } }, res);
  return res;
};

// Un PNG vero, 1×1.
const PNG = (() => {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(40, 0); ihdr.writeUInt32BE(20, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(20 * (1 + 40 * 4)); for (let i = 0; i < raw.length; i++) raw[i] = (i * 7) & 255; for (let y = 0; y < 20; y++) raw[y * 161] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
})();
const SIG = 'data:image/png;base64,' + PNG.toString('base64');

const RAW = () => ({
  owner: { kind: 'persona', name: 'Maria Rossi', cf: 'rssmra80a41h501x', birthPlace: 'Roma', birthDate: '1980-01-01', address: 'Via Prova 1, Roma', email: 'Maria@Example.com', phone: '3330000000' },
  property: { id: '', address: 'Roma, Via delle Prove 36', detail: 'scala I, piano 6, interno 28', cadastre: 'foglio 1, particella 2, sub. 3' },
  start: '2026-09-01', end: '2028-08-31', fee: '1.000', vat: 'inclusa', feePaidOn: '2026-11-12',
  exclusive: true, noticeMonths: '6', penalty: '500', currentLease: { start: '2026-09-01', end: '2027-02-28' }, expenses: true, place: 'distanza',
});

// ── 1. il motore ────────────────────────────────────────────────────────
console.log('\n— motore —');
{
  const n = INC.normalize(RAW());
  check('normalize: condizioni complete passano', n.ok === true, n.errors);
  const t = n.terms;
  check('importi in centesimi interi («1.000» = 100000)', t.feeCents === 100000 && t.penaltyCents === 50000);
  check('cents: «1000,50» · «2.500» · 1000 · «abc» · «» ', INC.cents('1000,50') === 100050 && INC.cents('2.500') === 250000 && INC.cents(1000) === 100000 && INC.cents('abc') === null && INC.cents('') === null);
  check('euro deterministico', INC.euro(100000) === '€ 1.000,00' && INC.euro(123456789) === '€ 1.234.567,89' && INC.euro(5) === '€ 0,05');
  check('date in italiano, col 1°', INC.dateIt('2026-09-01') === '1° settembre 2026' && INC.dateIt('2028-08-31') === '31 agosto 2028' && INC.dateIt('2026-02-30') === '');
  check('email e CF normalizzati', t.owner.email === 'maria@example.com' && t.owner.cf === 'RSSMRA80A41H501X');
  const err = (patch) => (INC.normalize({ ...RAW(), ...patch }).errors || []);
  check('esclusiva non dichiarata → rifiutata (mai dedotta)', err({ exclusive: undefined }).includes('exclusive') && err({ exclusive: 'si' }).includes('exclusive'));
  check('IVA fuori lista → rifiutata', err({ vat: '' }).includes('vat') && err({ vat: '22%' }).includes('vat'));
  check('penale a zero → rifiutata (non è una condizione)', err({ penalty: '0' }).includes('penalty') && err({ penalty: 0 }).includes('penalty'));
  check('penale senza preavviso → rifiutata', err({ noticeMonths: '' }).includes('penalty_without_notice'));
  check('preavviso fuori scala → rifiutato', err({ noticeMonths: '0' }).includes('notice_months') && err({ noticeMonths: '2.5' }).includes('notice_months') && err({ noticeMonths: '40' }).includes('notice_months'));
  check('fine prima dell’inizio → rifiutata', err({ end: '2026-08-31' }).includes('end_before_start'));
  check('compenso assente o zero → rifiutato', err({ fee: '' }).includes('fee') && err({ fee: '0' }).includes('fee'));
  check('dove si firma è obbligatorio', err({ place: '' }).includes('place'));
  const cl = INC.clauses(t), by = Object.fromEntries(cl.map((c) => [c.id, c]));
  check('clausole numerate di seguito', cl.every((c, i) => c.n === i + 1));
  check('esclusiva e recesso si approvano a parte', JSON.stringify(INC.specificIds(t)) === JSON.stringify(['esclusiva', 'recesso']));
  check('recesso: preavviso e penale come dichiarati', /preavviso scritto di 6 mesi/.test(by.recesso.text) && /penale di € 500,00/.test(by.recesso.text));
  check('compenso: cifra, IVA e «nessun’altra somma»', /€ 1\.000,00, IVA inclusa/.test(by.compenso.text) && /Nessun’altra somma/.test(by.compenso.text));
  check('quietanza solo se pagato', !!by.quietanza && !by.pagamento && !!INC.clauses(INC.normalize({ ...RAW(), feePaidOn: '' }).terms).find((c) => c.id === 'pagamento'));
  check('recesso di legge: solo a distanza e persona fisica', !!by.recesso_legge
    && !INC.clauses(INC.normalize({ ...RAW(), place: 'sede' }).terms).find((c) => c.id === 'recesso_legge')
    && !INC.clauses(INC.normalize({ ...RAW(), owner: { ...RAW().owner, kind: 'societa' } }).terms).find((c) => c.id === 'recesso_legge'));
  const noEx = INC.normalize({ ...RAW(), exclusive: false, noticeMonths: '', penalty: '' }).terms;
  check('senza esclusiva né recesso: nessuna clausola da approvare a parte', INC.specificIds(noEx).length === 0 && !INC.clauses(noEx).find((c) => c.id === 'recesso'));
  check('senza penale: solo il preavviso', !/penale/.test(INC.clauses(INC.normalize({ ...RAW(), penalty: '' }).terms).find((c) => c.id === 'recesso').text));
  check('l’impronta cambia se cambia una condizione', INC.canonical(t) !== INC.canonical(INC.normalize({ ...RAW(), fee: '1.200' }).terms) && INC.canonical(t) === INC.canonical(INC.normalize(RAW()).terms));
  check('le parti: REA e sedi di BOOM, dati del proprietario', /REA RM-1710623/.test(INC.parties(t).boom) && /Maria Rossi/.test(INC.parties(t).owner) && /1° gennaio 1980/.test(INC.parties(t).owner));
}

// ── 2. le porte ─────────────────────────────────────────────────────────
console.log('\n— porte —');
put('users/admin1', { role: 'admin', email: 'valentino@test.it' });
const create = async (patch = {}) => (await call(handler, { body: { op: 'create', terms: { ...RAW(), ...patch } }, token: 'admin-token' })).body;
const tOf = (url) => new URL(url).searchParams.get('t');
const signBody = (t, hash, patch = {}) => ({ op: 'sign', t, accept: true, specific: ['esclusiva', 'recesso'], name: 'maria  ROSSI', signature: SIG, hash, ...patch });

{
  check('create senza token → 401', (await call(handler, { body: { op: 'create', terms: RAW() } })).statusCode === 401);
  put('users/tenant1', { role: 'tenant' });
  const bad1 = await call(handler, { body: { op: 'create', terms: { ...RAW(), vat: '' } }, token: 'admin-token' });
  check('create con condizioni incomplete → 400 coi campi, niente scritto', bad1.statusCode === 400 && bad1.body.fields.includes('vat') && ![...DB.keys()].some((k) => k.startsWith('ownerMandates/')));
  const c = await create();
  const t = tOf(c.url), id = t.split('.')[0];
  check('create: nasce inviato, con riferimento e link', c.ok && /^INC-\d{4}-[A-F0-9]{6}$/.test(c.ref) && /\/incarico\?t=inc_[a-f0-9]{12}\.[a-f0-9]{32}$/.test(c.url) && get('ownerMandates/' + id).status === 'sent');
  const g = await call(handler, { method: 'GET', query: { t } });
  check('lookup: scheda, parti, clausole, impronta', g.statusCode === 200 && g.body.clauses.length >= 8 && g.body.summary.length >= 5 && g.body.hash === MOD.hashOf(get('ownerMandates/' + id).terms));
  check('lookup: il token non esce mai', !JSON.stringify(g.body).includes(t.split('.')[1]));
  const wrong = await call(handler, { method: 'GET', query: { t: id + '.' + 'f'.repeat(32) } });
  const unknown = await call(handler, { method: 'GET', query: { t: 'inc_000000000000.' + 'f'.repeat(32) } });
  check('token sbagliato e incarico inesistente: lo stesso 404', wrong.statusCode === 404 && unknown.statusCode === 404 && JSON.stringify(wrong.body) === JSON.stringify(unknown.body));
  check('link malformato → 404', (await call(handler, { method: 'GET', query: { t: 'x' } })).statusCode === 404);
  const pdf = await call(handler, { method: 'GET', query: { t, pdf: '1' } });
  check('anteprima PDF «da firmare» generata al volo', pdf.statusCode === 200 && Buffer.isBuffer(pdf.sent) && pdf.sent.subarray(0, 5).toString() === '%PDF-' && pdf.sent.length > 3000);
  if (process.env.INCARICO_DUMP) fs.writeFileSync('/tmp/incarico-anteprima.pdf', pdf.sent);

  // ── 3. la firma copre ciò che è stato letto ──
  console.log('\n— firma —');
  const h = g.body.hash;
  const s = (patch) => call(handler, { body: signBody(t, h, patch) });
  check('senza accept → 400', (await s({ accept: 'true' })).body.error === 'accept_required');
  const sp = await s({ specific: ['esclusiva'] });
  check('una clausola non approvata → 400 e dice quale', sp.body.error === 'specific_required' && sp.body.missing[0] === 'recesso');
  check('nome di un altro → 400', (await s({ name: 'Mario Bianchi' })).body.error === 'name_mismatch');
  check('firma assente o non PNG → 400', (await s({ signature: '' })).body.error === 'signature_required' && (await s({ signature: 'data:image/png;base64,' + Buffer.from('x'.repeat(600)).toString('base64') })).body.error === 'signature_required');
  check('impronta diversa → 409 terms_changed', (await s({ hash: 'a'.repeat(64) })).statusCode === 409);
  check('nessun tentativo rifiutato ha firmato', get('ownerMandates/' + id).status === 'sent' && !(globalThis.__mails || []).length);

  // due tap insieme
  globalThis.__mails = [];
  const [a, b] = await Promise.all([s({}), s({})]);
  const d = get('ownerMandates/' + id);
  check('due tap insieme: entrambi 200, uno solo ha firmato', a.statusCode === 200 && b.statusCode === 200 && [a, b].filter((x) => x.body.already).length === 1, [a.body, b.body]);
  check('firma registrata: nome, IP, dispositivo, impronta, clausole', d.status === 'signed' && d.signature.name === 'maria ROSSI' && d.signature.ua === 'TestUA' && d.signature.hash === h && d.signature.specific.length === 2 && d.signature.immediateStart === false);
  const mails = globalThis.__mails;
  check('una email al proprietario, una all’operatore', mails.filter((m) => m.to === 'maria@example.com').length === 1 && mails.filter((m) => m.to === 'operatore@test.it').length === 1, mails.map((m) => m.to));
  const om = mails.find((m) => m.to === 'maria@example.com');
  check('email al proprietario: col Lei, sintesi, copia, area', /Gentile Maria/.test(om.html) && /€ 1\.000,00/.test(om.html) && /incarico-firmato\.pdf/.test(om.html) && /\/login/.test(om.html) && om.replyTo === 'operatore@test.it');
  const pdfKey = `ownerMandates/${id}/incarico-firmato.pdf`;
  check('PDF firmato e firma archiviati', FILES.has(pdfKey) && FILES.get(pdfKey).subarray(0, 5).toString() === '%PDF-' && FILES.has(`ownerMandates/${id}/firma.png`) && /incarico-firmato\.pdf/.test(d.docUrl));
  if (process.env.INCARICO_DUMP) fs.writeFileSync('/tmp/incarico-firmato.pdf', FILES.get(pdfKey));
  check('card per l’operatore, una', [...DB.keys()].filter((k) => k.startsWith('agentNotifications/incarico_signed_')).length === 1 && /FIRMATO/.test(get('agentNotifications/incarico_signed_' + id).summary));
  check('area proprietario creata: account vero, profilo landlord', d.area.state === 'created' && SIGNUPS.length === 1 && SIGNUPS[0] === 'maria@example.com' && get('users/uid_1').role === 'landlord' && get('users/uid_1').createdBy === 'incarico');
  check('niente in sospeso', Array.isArray(d.pending) && d.pending.length === 0, d.pending);
  globalThis.__mails = [];
  const again = await s({});
  check('terzo tap: already, nessuna email, nessun secondo account', again.body.already === true && !globalThis.__mails.length && SIGNUPS.length === 1);
  const g2 = await call(handler, { method: 'GET', query: { t } });
  check('lookup dopo la firma: firmato, col documento', g2.body.status === 'signed' && !!g2.body.docUrl && g2.body.area.state === 'created');
  const redirect = await call(handler, { method: 'GET', query: { t, pdf: '1' } });
  check('PDF dopo la firma → il firmato archiviato', redirect.statusCode === 302 && /incarico-firmato\.pdf/.test(redirect.headers.Location));
  check('annullare un firmato → 409', (await call(handler, { body: { op: 'void', id }, token: 'admin-token' })).statusCode === 409);
}

// ── 4. annullato, in sede, società ──────────────────────────────────────
console.log('\n— stati —');
{
  const c = await create({ owner: { ...RAW().owner, email: 'altro@example.com' } });
  const t = tOf(c.url), id = t.split('.')[0], h = MOD.hashOf(get('ownerMandates/' + id).terms);
  check('void senza admin → 401', (await call(handler, { body: { op: 'void', id } })).statusCode === 401);
  check('void → annullato', (await call(handler, { body: { op: 'void', id }, token: 'admin-token' })).body.ok === true && get('ownerMandates/' + id).status === 'void');
  check('firmare un annullato → 410', (await call(handler, { body: signBody(t, h) })).statusCode === 410);
  check('PDF di un annullato → 410', (await call(handler, { method: 'GET', query: { t, pdf: '1' } })).statusCode === 410);

  const soc = await create({ owner: { kind: 'societa', name: 'Prova S.r.l.', cf: '01234567890', address: 'Via Uno 1, Roma', email: '', phone: '' }, place: 'sede' });
  const ts = tOf(soc.url), ids = ts.split('.')[0];
  globalThis.__mails = [];
  const r = await call(handler, { body: signBody(ts, MOD.hashOf(get('ownerMandates/' + ids).terms), { name: 'Luca Verdi' }) });
  const d = get('ownerMandates/' + ids);
  check('società: firma il legale rappresentante col suo nome', r.statusCode === 200 && d.signature.name === 'Luca Verdi' && !('immediateStart' in d.signature));
  check('senza email: area a mano con la ragione, e detto', d.area.state === 'manual' && d.area.reason === 'no_email' && d.pending.includes('owner_email') && /DA APRIRE A MANO/.test(get('agentNotifications/incarico_signed_' + ids).summary));
  const list = await call(handler, { body: { op: 'list' }, token: 'admin-token' });
  check('list: tutti, col link solo per l’admin', list.body.ok && list.body.items.length === 3 && list.body.items.every((x) => /\/incarico\?t=/.test(x.url)));
  check('list senza admin → 401', (await call(handler, { body: { op: 'list' } })).statusCode === 401);
}

// ── 5. area proprietario: solo senza ambiguità ──────────────────────────
console.log('\n— area proprietario —');
{
  put('properties/p1', { address: 'Via A 1', ownerId: null });
  put('properties/p2', { address: 'Via B 2', ownerId: 'someone_else' });
  put('users/t9', { role: 'tenant', email: 'inquilino@example.com' });
  put('users/l9', { role: 'landlord', email: 'gia@example.com' });
  const T = (email, pid) => INC.normalize({ ...RAW(), owner: { ...RAW().owner, email }, property: { ...RAW().property, id: pid } }).terms;
  const n0 = SIGNUPS.length;
  const a1 = await MOD.ensureOwnerAccess(T('nuovo@example.com', 'p1'));
  check('nuovo proprietario + immobile libero: creato e collegato', a1.state === 'created' && a1.linked === true && get('properties/p1').ownerId === a1.uid && SIGNUPS.length === n0 + 1);
  const a2 = await MOD.ensureOwnerAccess(T('gia@example.com', ''));
  check('profilo landlord esistente: riusato, nessun account nuovo', a2.state === 'existing' && a2.uid === 'l9' && SIGNUPS.length === n0 + 1);
  const a3 = await MOD.ensureOwnerAccess(T('inquilino@example.com', 'p1'));
  check('email di un inquilino: a mano, niente toccato', a3.state === 'manual' && a3.reason === 'email_has_other_role' && get('users/t9').role === 'tenant');
  const a4 = await MOD.ensureOwnerAccess(T('gia@example.com', 'p2'));
  check('immobile di un altro proprietario: a mano, ownerId intatto', a4.state === 'manual' && a4.reason === 'property_has_other_owner' && get('properties/p2').ownerId === 'someone_else');
  const a5 = await MOD.ensureOwnerAccess(T('gia@example.com', 'nope'));
  check('immobile inesistente: a mano', a5.state === 'manual' && a5.reason === 'property_not_found');
}

// ── 5b. i documenti nell'area: onboarding DOPO una locazione già fatta ──
console.log('\n— documenti nell’area —');
{
  const docsOf = (uid) => [...DB.keys()].filter((k) => k.startsWith('documents/') && get(k).userId === uid).sort();
  put('properties/pm', { address: 'Via Prova 9', name: 'Prova 9', ownerId: null });
  put('contracts/k1', { propertyId: 'pm', tenantId: 'ten1', signedPdfUrl: 'https://firebasestorage.googleapis.com/x/contratto-firmato.pdf', fullySignedAt: '2026-08-28T10:00:00.000Z',
    registrationReceiptUrl: 'https://firebasestorage.googleapis.com/x/ricevuta.pdf', registrationReceiptName: 'ricevuta.pdf', registrationCode: 'TJT26T012345000AA', rliRegisteredAt: '2026-09-10' });
  put('contracts/k2', { propertyId: 'pm', tenantId: 'ten2', generatedPDF: 'https://firebasestorage.googleapis.com/x/bozza.pdf' });   // mai firmato
  put('contracts/k3', { propertyId: 'altro', signedPdfUrl: 'https://firebasestorage.googleapis.com/x/altro.pdf' });
  const c = await create({ owner: { ...RAW().owner, email: 'post@example.com' }, property: { ...RAW().property, id: 'pm' } });
  const t = tOf(c.url), id = t.split('.')[0];
  globalThis.__mails = [];
  const r = await call(handler, { body: signBody(t, MOD.hashOf(get('ownerMandates/' + id).terms)) });
  const d = get('ownerMandates/' + id), uid = d.area.uid, mine = docsOf(uid);
  check('firma → area creata e collegata all’immobile', r.statusCode === 200 && d.area.state === 'created' && get('properties/pm').ownerId === uid);
  check('nell’area: incarico, contratto firmato, ricevuta — tre righe', mine.length === 3 && mine.includes('documents/incarico_' + id) && mine.includes('documents/contract-signed_k1_landlord') && mine.includes('documents/registration-receipt_k1_landlord'), mine);
  check('il contratto è la copia FIRMATA, la ricevuta col codice', /contratto-firmato\.pdf/.test(get('documents/contract-signed_k1_landlord').fileUrl) && get('documents/registration-receipt_k1_landlord').registrationCode === 'TJT26T012345000AA' && get('documents/registration-receipt_k1_landlord').docDate === '2026-09-10');
  check('un contratto mai firmato non entra (mai una bozza)', !DB.has('documents/contract-signed_k2_landlord') && !mine.some((k) => /bozza/.test(get(k).fileUrl)));
  check('il contratto di un altro immobile non entra', !DB.has('documents/contract-signed_k3_landlord'));
  check('solo la copia del proprietario: niente scritto per l’inquilino', !DB.has('documents/contract-signed_k1_tenant') && !DB.has('documents/registration-receipt_k1_tenant'));
  check('conteggi sull’incarico, niente in sospeso', d.areaDocs.incarico === 1 && d.areaDocs.contracts === 1 && d.areaDocs.receipts === 1 && !d.pending.includes('area_docs'), d.areaDocs);
  const om = globalThis.__mails.find((m) => m.to === 'post@example.com');
  check('l’email dice ciò che c’è davvero', /Nei documenti trova già questo incarico, il contratto di locazione firmato e la ricevuta di registrazione\./.test(om.html));
  check('areaDocsLine: niente archiviato = nessuna frase', MOD.areaDocsLine({ incarico: 0, contracts: 0, receipts: 0 }) === '' && MOD.areaDocsLine(null) === '' && / questo incarico\.$/.test(MOD.areaDocsLine({ incarico: 1 })));
  // rerun: l'operatore carica una seconda ricevuta dopo → riallinea, stesse righe + una
  put('contracts/k4', { propertyId: 'pm', tenantId: 'ten4', signedPdfUrl: 'https://firebasestorage.googleapis.com/x/k4-firmato.pdf' });
  check('op docs senza admin → 401', (await call(handler, { body: { op: 'docs', id } })).statusCode === 401);
  const again = await call(handler, { body: { op: 'docs', id }, token: 'admin-token' });
  check('op docs: riallinea senza doppioni (3 di prima + il nuovo contratto)', again.body.ok && docsOf(uid).length === 4 && DB.has('documents/contract-signed_k4_landlord') && SIGNUPS.filter((e) => e === 'post@example.com').length === 1, docsOf(uid));
  const again2 = await call(handler, { body: { op: 'docs', id }, token: 'admin-token' });
  check('op docs ripetuto: nessuna riga in più', again2.body.ok && docsOf(uid).length === 4);
  // un documento dell'attivazione già presente si RIPARA, non si affianca
  put('contracts/k5', { propertyId: 'pm', tenantId: 'ten5', signedPdfUrl: 'https://firebasestorage.googleapis.com/x/k5-firmato.pdf' });
  put('documents/vecchio5', { userId: uid, contractId: 'k5', type: 'contract', note: 'Auto-generated upon contract activation via Magic Sign', fileUrl: 'https://firebasestorage.googleapis.com/x/senza-firme.pdf', shared: true });
  await call(handler, { body: { op: 'docs', id }, token: 'admin-token' });
  check('documento dell’attivazione riparato sul posto', /k5-firmato/.test(get('documents/vecchio5').fileUrl) && !DB.has('documents/contract-signed_k5_landlord') && get('documents/vecchio5').shared === true);
  // immobile di un altro: niente contratti
  const none = await MOD.backfillOwnerDocs({ uid: 'intruso', propertyId: 'pm', incarico: null });
  check('uid che non è il proprietario dell’immobile: niente scritto', none.contracts === 0 && none.receipts === 0 && !docsOf('intruso').length);
  // area a mano: niente
  const cm = await create({ owner: { ...RAW().owner, email: 'inquilino@example.com' }, property: { ...RAW().property, id: 'pm' } });
  const tm = tOf(cm.url), idm = tm.split('.')[0];
  await call(handler, { body: signBody(tm, MOD.hashOf(get('ownerMandates/' + idm).terms)) });
  check('area a mano: nessun documento, e op docs lo dice', !get('ownerMandates/' + idm).areaDocs && !DB.has('documents/incarico_' + idm) && (await call(handler, { body: { op: 'docs', id: idm }, token: 'admin-token' })).body.error === 'area_manual');
  const cs = await create({ owner: { ...RAW().owner, email: 'nonfirmato@example.com' } });
  check('op docs su un incarico non firmato → 409', (await call(handler, { body: { op: 'docs', id: tOf(cs.url).split('.')[0] }, token: 'admin-token' })).statusCode === 409);
}

// ── 6. best-effort dichiarato ───────────────────────────────────────────
console.log('\n— best-effort —');
{
  const c = await create({ owner: { ...RAW().owner, email: 'storage@example.com' } });
  const t = tOf(c.url), id = t.split('.')[0];
  FAIL.storage = true; globalThis.__mails = [];
  const r = await call(handler, { body: signBody(t, MOD.hashOf(get('ownerMandates/' + id).terms)) });
  FAIL.storage = false;
  const d = get('ownerMandates/' + id);
  check('Storage giù: la firma resta, il PDF è in sospeso e detto', r.statusCode === 200 && d.status === 'signed' && d.pending.includes('pdf') && !d.docUrl && r.body.pending.includes('pdf'));
  check('Storage giù: l’email parte lo stesso, col link che rigenera', globalThis.__mails.some((m) => m.to === 'storage@example.com' && /pdf=1/.test(m.html)));
  const regen = await call(handler, { method: 'GET', query: { t, pdf: '1' } });
  check('PDF di un firmato senza archivio: rigenerato al volo', regen.statusCode === 200 && regen.sent.subarray(0, 5).toString() === '%PDF-');
  globalThis.__mailFail = () => new Error('smtp down');
  const c2 = await create({ owner: { ...RAW().owner, email: 'smtp@example.com' } });
  const t2 = tOf(c2.url), id2 = t2.split('.')[0];
  const r2 = await call(handler, { body: signBody(t2, MOD.hashOf(get('ownerMandates/' + id2).terms)) });
  globalThis.__mailFail = null;
  check('SMTP giù: firmato, email in sospeso, nessun timbro falso', r2.statusCode === 200 && get('ownerMandates/' + id2).pending.includes('owner_email') && !get('ownerMandates/' + id2).ownerEmailAt);
}

// ── 7. le giunzioni: pagina, console, regole ────────────────────────────
console.log('\n— giunzioni —');
{
  const R = new URL('../../', import.meta.url).pathname, read = (f) => fs.readFileSync(R + f, 'utf8');
  const page = read('incarico.html'), cons = read('incarichi.html');
  check('la pagina non porta testo dell’incarico (viene dal server)', !/in esclusiva|penale di|preavviso scritto/.test(page));
  check('la pagina manda tutto ciò che il server pretende', ['op:\'sign\'', 'accept:true', 'specific:', 'signature:', 'hash:D.hash', 'immediateStart:'].every((k) => page.includes(k)));
  check('nessuna spunta pre-selezionata', !/<input[^>]*type="checkbox"[^>]*checked/.test(page) && !/\.checked\s*=\s*true/.test(page));
  check('la pagina usa il marchio vero e non Firebase', page.includes('/boom-mark.svg') && !/firebase/i.test(page.replace(/<!--[\s\S]*?-->/g, '')));
  check('la console valida col motore del server e passa dall’API', cons.includes('/js/incarico-engine.js') && cons.includes('INC.normalize') && cons.includes('Authorization') && !/collection\('ownerMandates'\)/.test(cons));
  check('nessun dato nel DOM come HTML', !/innerHTML/.test(page) && !/innerHTML/.test(cons));
  check('regole: ownerMandates admin-only (Firestore e Storage)', /match \/ownerMandates\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(read('firestore.rules')) && /match \/ownerMandates\/\{id\}\/\{allPaths=\*\*\}/.test(read('storage.rules')));
  const vj = JSON.parse(read('vercel.json'));
  check('vercel: 60s insieme al rendiconto, entro le 50 regole, pagine noindex', vj.functions['api/owners/{rendiconto,incarico}.js'].maxDuration === 60 && Object.keys(vj.functions).length <= 50 && vj.headers.some((x) => /\|incarico\|/.test(x.source) && /\|incarichi\|/.test(x.source)));
}

// ── 8. mutazioni: rimetti il difetto, il test deve vederlo ──────────────
console.log('\n— mutazioni —');
{
  const src = fs.readFileSync(new URL('../../api/owners/incarico.js', import.meta.url), 'utf8');
  const mutate = async (n, from, to, probe) => {
    if (!src.includes(from)) { check(`mutazione ${n}: il punto da mutare esiste`, false); return; }
    const f = new URL(`../../api/owners/.incarico-mut-${n}.mjs`, import.meta.url);
    fs.writeFileSync(f, src.replace(from, to));
    try { const m = await import(f.href); check(`mutazione ${n} presa`, await probe(m.default)); }
    finally { fs.unlinkSync(f); }
  };
  const fresh = async () => { const c = await create({ owner: { ...RAW().owner, email: `m${Math.random().toString(36).slice(2)}@example.com` } }); const t = tOf(c.url); return { t, id: t.split('.')[0], h: MOD.hashOf(get('ownerMandates/' + t.split('.')[0]).terms) }; };
  await mutate(1, '!safeEq(doc.token, r.token)', 'false', async (h) => {
    const x = await fresh();
    return (await call(h, { method: 'GET', query: { t: x.id + '.' + 'f'.repeat(32) } })).statusCode === 200;   // senza la guardia un token qualunque apre
  });
  await mutate(2, "String(body.hash || '') !== hash || d.hash !== hash", 'false', async (h) => {
    const x = await fresh();
    return (await call(h, { body: signBody(x.t, 'a'.repeat(64)) })).statusCode === 200;   // senza la guardia si firma un testo mai letto
  });
  await mutate(3, 'if (missing.length) return', 'if (false) return', async (h) => {
    const x = await fresh();
    return (await call(h, { body: signBody(x.t, x.h, { specific: [] }) })).statusCode === 200;   // senza la guardia le clausole passano non approvate
  });
}

console.log(`\n${passed} passati, ${failed} falliti` + (failed ? ' — ' + bad.join(' | ') : ''));
process.exit(failed ? 1 : 0);
