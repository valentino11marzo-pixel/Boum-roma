// tests/withdraw/run.mjs — the online withdrawal function, server half
// (city desks v1.8, stage W; spec §7). The REAL handler (api/withdraw.js) on
// an in-memory Firestore that keeps versions and enforces preconditions like
// the real one (exists, updateTime), with nodemailer captured
// (tests/notify/nodemailer-mock.mjs) and the clock pinned.
//
// What must hold:
//   · the same 200 {ok:true} whatever the match — and an acknowledgement that
//     says nothing a stranger could learn from (no enumeration);
//   · the statement is ONE statement: a retried submit (same email, ref,
//     requestId) is a 409 in agentNotifications, the same answer, no second
//     card, no second email;
//   · each matching case writes what the spec says and only that: a book_
//     order not signed → withdrawnAt + withdrawal; signed/invoiced/paid or
//     closed, a paid svc_ order → the withdrawal map only; a guessed reference
//     with another email, two orders, no order → nothing written; never `city`;
//   · the acknowledgement: to the consumer, at once, with the statement, the
//     date and time in Rome (CET/CEST, across midnight) and the reference;
//     the operator's copy in Italian with the card;
//   · honeypot and per-IP rate limit; recovery of a failed or interrupted
//     acknowledgement with the ORIGINAL date and time;
//   · mutations: every guard put back wrong, one at a time, fails this suite.
//
// Run: node tests/withdraw/run.mjs

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MUTATIONS } from './mutations.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 500) : ''}`); }
};
const section = (t) => console.log('\n' + t);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.GMAIL_USER = 'valentino@boom-rome.com';
delete process.env.ADMIN_NOTIFY_EMAIL;

// ── the clock ─────────────────────────────────────────────────────────────
const REAL_NOW = Date.now;
let NOW = Date.UTC(2026, 10, 5, 10, 42, 0);          // 5 Nov 2026 10:42 UTC = 11:42 CET
Date.now = () => NOW;

// ── Firestore in memory, faithful where it counts ─────────────────────────
const L = await import('../../api/homie/_lib.js');
const DB = new Map();                                 // 'coll/id' -> { fields, ut }
let VER = 0;
const nextUT = () => new Date(Date.UTC(2026, 0, 1) + (++VER) * 1000).toISOString();
const FAIL = { all: false, query: false };
const HOOKS = { beforeCommit: null };
const OPS = [];
const typeOf = (v) => (v ? Object.keys(v)[0] : undefined);
const getField = (fields, path) => {
  const parts = path.split('.');
  let cur = fields;
  for (let i = 0; i < parts.length; i++) {
    const f = cur && cur[parts[i]];
    if (f === undefined) return undefined;
    if (i === parts.length - 1) return f;
    cur = f.mapValue ? f.mapValue.fields : undefined;
  }
  return undefined;
};
const sameVal = (a, b) => typeOf(a) === typeOf(b) && JSON.stringify(a[typeOf(a)]) === JSON.stringify(b[typeOf(b)]);
const docOut = (path, d) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields: d.fields, updateTime: d.ut });
const pathOfName = (name) => String(name).split('/documents/')[1];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit') || u.includes('securetoken')) return json({ idToken: 'fake', localId: 'admin', expiresIn: '3600' });
  if (!u.includes('firestore.googleapis.com')) return json({});
  if (FAIL.all) return json({ error: { code: 503, status: 'UNAVAILABLE' } }, 503);
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    OPS.push({ op: 'query', where: q.where });
    if (FAIL.query) return json({ error: { code: 500, status: 'INTERNAL' } }, 500);
    const coll = q.from[0].collectionId;
    const f = q.where && q.where.fieldFilter;
    let rows = [...DB.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2);
    if (f) rows = rows.filter(([, d]) => { const a = getField(d.fields, f.field.fieldPath); return a !== undefined && f.op === 'EQUAL' && sameVal(a, f.value); });
    rows = rows.sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, q.limit || 1000);
    return json(rows.length ? rows.map(([k, d]) => ({ document: docOut(k, d) })) : [{ readTime: new Date(NOW).toISOString() }]);
  }
  if (u.includes(':commit')) {
    OPS.push({ op: 'commit', writes: body.writes });
    if (HOOKS.beforeCommit) { const h = HOOKS.beforeCommit; HOOKS.beforeCommit = null; h(body.writes); }
    for (const w of body.writes) {
      const path = pathOfName(w.update ? w.update.name : w.delete);
      const cur = DB.get(path);
      const pre = w.currentDocument || {};
      if (pre.exists === true && !cur) return json({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
      if (pre.exists === false && cur) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
      if (pre.updateTime && (!cur || cur.ut !== pre.updateTime)) return json({ error: { code: 400, status: 'FAILED_PRECONDITION' } }, 400);
    }
    for (const w of body.writes) {
      if (!w.update) continue;
      const path = pathOfName(w.update.name);
      const cur = DB.get(path);
      const fields = { ...(cur ? cur.fields : {}) };
      for (const fp of (w.updateMask && w.updateMask.fieldPaths) || []) {
        if (w.update.fields && fp in w.update.fields) fields[fp] = w.update.fields[fp]; else delete fields[fp];
      }
      DB.set(path, { fields, ut: nextUT() });
    }
    return json({ writeResults: body.writes.map(() => ({ updateTime: new Date(NOW).toISOString() })) });
  }
  const m = u.match(/documents\/([^?]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  const method = opts.method || 'GET';
  if (method === 'GET') { OPS.push({ op: 'get', path }); const d = DB.get(path); return d ? json(docOut(path, d)) : json({ error: { code: 404 } }, 404); }
  if (method === 'POST') {
    const qid = u.match(/documentId=([^&]+)/);
    const key = `${path}/${qid ? decodeURIComponent(qid[1]) : 'auto' + (++VER)}`;
    OPS.push({ op: 'create', path: key });
    if (DB.has(key)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, { fields: { ...(body.fields || {}) }, ut: nextUT() });
    return json(docOut(key, DB.get(key)));
  }
  if (method === 'PATCH') {
    const prev = DB.get(path);
    if (u.includes('currentDocument.exists=false') && prev) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    DB.set(path, { fields: { ...(prev ? prev.fields : {}), ...(body.fields || {}) }, ut: nextUT() });
    return json(docOut(path, DB.get(path)));
  }
  return json({});
};

const seed = (path, obj) => DB.set(path, { fields: L.toFsFields(obj), ut: nextUT() });
const docOf = (path) => { const d = DB.get(path); return d ? Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, L.fsValToJs(v)])) : null; };
const snapshot = (prefix) => JSON.stringify([...DB.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, d]) => [k, d.fields]));
const notifications = () => [...DB.keys()].filter((k) => k.startsWith('agentNotifications/withdraw-') && !k.startsWith('agentNotifications/withdraw-mail-'));

// ── the handler ───────────────────────────────────────────────────────────
const W = await import('../../api/withdraw.js');
const handler = W.default;
const SCALO = (await import('../../js/scalo-codes.js')).default;
const mockRes = () => {
  const r = { statusCode: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => r;
  return r;
};
let ipN = 0;
const post = async (body, { ip, method = 'POST' } = {}) => {
  const res = mockRes();
  await handler({ method, body, headers: { 'x-forwarded-for': ip || '10.9.0.' + (++ipN) }, query: {} }, res);
  return res;
};
const mails = () => globalThis.__mails || [];
const resetMails = () => { globalThis.__mails = []; globalThis.__mailAttempts = []; globalThis.__mailFail = null; };
const to = (addr) => mails().filter((m) => m.to === addr);
const OPERATOR = 'valentino@boom-rome.com';
let rid = 0;
const stmt = (over = {}) => ({ name: 'Anna Rossi', email: 'anna@example.com', ref: '', desk: 'Paris', service: 'full-search', requestId: 'req' + String(++rid).padStart(8, '0'), company: '', ...over });

// ── the orders on file (the §3.4 schema of book_; the six's svc_) ─────────
const bookCity = (id, over = {}) => ({
  key: 'paris', label: 'Paris', mode: 'search', chargeAt: 'signing', service: 'full-search', serviceLabel: 'Full Search',
  price: 500, currency: 'eur', file: SCALO.fileCode(id), startNow: false, orderedAt: '2026-11-05T09:00:00.000Z',
  withdrawalEndsOn: '2026-11-19', workFrom: '2026-11-20', workFromLabel: '20 November 2026',
  order: { number: 'PAR-2026-0007', termsV: 'par-2026-11-1', termsHash: 'h', expiresOn: '2027-05-05' }, ...over,
});
const book = (id, { email, market = 'paris', city = {}, ...rest }) => seed('leads/' + id, {
  type: 'service', status: 'new', source: 'web', leadType: 'tenant', language: 'en', market, sourceRef: 'city-' + market,
  intent: 'city_booking', name: 'Client ' + id, email, booked: true, paid: false,
  message: `${market.toUpperCase()} — order`, city: bookCity(id, { key: market, label: market[0].toUpperCase() + market.slice(1), ...city }),
  createdAt: '2026-11-05T09:00:00.000Z', ...rest,
});
book('book_parisopen01', { email: 'anna@example.com', city: { order: { number: 'PAR-2026-0007', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
book('book_parisopen02', { email: 'lea@example.com', city: { order: { number: 'PAR-2026-0011', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
book('book_parisopen03', { email: 'max@example.com', city: { order: { number: 'PAR-2026-0012', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
book('book_parisinv001', { email: 'bea@example.com', city: { order: { number: 'PAR-2026-0008', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } },
  signing: { status: 'invoiced', fare: 'full-search', signedOn: '2026-11-12', invoiceId: 'cityfee_book_parisinv001', amount: 500 } });
book('book_berlinpaid1', { email: 'carl@example.com', market: 'berlin', city: { order: { number: 'BER-2026-0003', termsV: 'v', termsHash: 'h', expiresOn: null }, startNow: true, withdrawalEndsOn: '2026-11-19' },
  paid: true, paidAt: '2026-11-14T10:00:00.000Z', paidVia: 'link', signing: { status: 'invoiced', invoiceId: 'cityfee_book_berlinpaid1' } });
book('book_berlinopen1', { email: 'dora@example.com', market: 'berlin', city: { order: { number: 'BER-2026-0004', termsV: 'v', termsHash: 'h', expiresOn: null } } });
book('book_parisclosed', { email: 'eve@example.com', city: { order: { number: 'PAR-2026-0009', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } }, closedAt: '2026-11-04T15:00:00.000Z', closeReason: 'stopped' });
book('book_ivyfs000001', { email: 'ivy@example.com', city: { service: 'full-search', order: { number: 'PAR-2026-0013', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
book('book_ivyap000001', { email: 'ivy@example.com', city: { service: 'application-pack', serviceLabel: 'Application Pack', order: { number: 'PAR-2026-0014', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
book('book_nora0000001', { email: 'nora@example.com', market: 'berlin', city: { order: { number: 'BER-2026-0005', termsV: 'v', termsHash: 'h', expiresOn: null } } });
const svc = (id, o) => seed('leads/' + id, { type: 'service', service: 'SERVICE', status: 'new', paid: true, source: 'web', amount_paid: o.amount * 100, amount_eur: o.amount, currency: o.currency || 'eur', stripe_session_id: 'cs_test_' + id, paid_at: '2026-11-02T10:00:00.000Z', createdAt: '2026-11-02T10:00:00.000Z', ...o.fields });
svc('svc_csmadrid01', { amount: 500, fields: { kind: 'full-search', intent: 'city_order', email: 'Fred@Example.com', name: 'Fred', market: 'madrid', sourceRef: 'city-madrid', leadType: 'tenant',
  city: { key: 'madrid', label: 'Madrid', mode: 'search', service: 'full-search', serviceLabel: 'Full Search', paid: true, startNow: true, workFrom: null, workFromLabel: null, withdrawalEndsOn: null, file: SCALO.fileCode('svc_csmadrid01'), fileLeadId: null } } });
svc('svc_csroma0001', { amount: 349, fields: { kind: 'concordato-pack', intent: 'service', email: 'gina@example.it', name: 'Gina' } });
svc('svc_cslondon01', { amount: 199, currency: 'gbp', fields: { kind: 'application-pack', intent: 'city_order', email: 'jo@example.com', name: 'Jo', market: 'london',
  city: { key: 'london', label: 'London', mode: 'search', service: 'application-pack', serviceLabel: 'Application Pack', paid: true, startNow: false, withdrawalEndsOn: '2026-11-16', file: SCALO.fileCode('svc_cslondon01') } } });
seed('leads/city_freefile01', { source: 'web', market: 'amsterdam', intent: 'city_search', email: 'hank@example.com', name: 'Hank', city: { key: 'amsterdam', file: SCALO.fileCode('city_freefile01') } });

// ═══ 1. the pieces, pure ═══════════════════════════════════════════════════
section('1. The statement, its id, the Rome clock, the reference');
{
  const n = W.normalizeStatement(stmt({ email: '  Anna@Example.COM ', name: 'Anna Rossi', ref: ' PAR-2026-0007 ', desk: 'paris' }));
  ok('normalize: email trimmed, key lowercased, desk canonical, service labelled', n.st && n.st.email === 'Anna@Example.COM' && n.st.emailKey === 'anna@example.com' && n.st.desk === 'Paris' && n.st.service === 'Full Search' && n.st.ref === 'PAR-2026-0007', n);
  ok('normalize: name required (2 chars)', W.normalizeStatement(stmt({ name: 'A' })).error === 'name_required');
  ok('normalize: a real email required', W.normalizeStatement(stmt({ email: 'not-an-email' })).error === 'email_required');
  ok('normalize: ref longer than 80 → refused, never clipped', W.normalizeStatement(stmt({ ref: 'x'.repeat(81) })).error === 'ref_too_long' && W.normalizeStatement(stmt({ ref: 'x'.repeat(80) })).st);
  ok('normalize: a desk outside the list → refused', W.normalizeStatement(stmt({ desk: 'Tokyo' })).error === 'unknown_desk');
  ok('desks: the ten of the spec, Rome and Roma the same desk, empty = other', W.DESKS.length === 10 && W.deskOf('Rome') === 'Roma' && W.deskOf('ROMA') === 'Roma' && W.deskOf('') === 'other' && W.deskOf('berlin') === 'Berlin' && W.deskOf('Paris') === 'Paris');
  ok('service: the page values and their texts; anything else verbatim', W.serviceOf('concordato-pack').label === 'Pacchetto canone concordato' && W.serviceOf('Full Search').key === 'full-search' && W.serviceOf('my own words').label === 'my own words' && W.serviceOf('').label === null);
  ok('lang: Roma speaks Italian, the desks English, ?lang=it honoured', W.normalizeStatement(stmt({ desk: 'Roma' })).st.lang === 'it' && W.normalizeStatement(stmt()).st.lang === 'en' && W.normalizeStatement(stmt({ lang: 'it' })).st.lang === 'it');

  const a = W.normalizeStatement(stmt({ requestId: 'abcdefgh12', ref: 'X' })).st;
  const b = W.normalizeStatement(stmt({ requestId: 'abcdefgh12', ref: 'X', email: 'ANNA@example.com' })).st;
  const id = W.statementId(a);
  ok('statement id = withdraw-<sha1(email|ref|requestId)[0:20]>, case-blind on the email', /^withdraw-[0-9a-f]{20}$/.test(id) && id === W.statementId(b), id);
  ok('statement id: another requestId = another statement', W.statementId({ ...a, requestId: 'zzzzzzzz99' }) !== id);
  ok('requestId: the pages\' token or a UUID kept, anything else ignored', W.normalizeStatement(stmt({ requestId: '550e8400-e29b-41d4-a716-446655440000' })).st.requestId === '550e8400-e29b-41d4-a716-446655440000' && W.normalizeStatement(stmt({ requestId: 'x y' })).st.requestId === null);
  ok('receipt number: W- and 10 characters of the id', W.receiptOf(id) === 'W-' + id.slice(9, 19).toUpperCase());

  const r1 = W.romeStamp(new Date(Date.UTC(2026, 10, 5, 10, 42)));
  ok('Rome clock, winter: 10:42 UTC = 11:42 CET', r1.en === '5 November 2026, 11:42 (Rome time, CET)' && r1.it === '5 novembre 2026, ore 11:42 (ora di Roma)' && r1.short === '05/11/2026 11:42' && r1.day === '2026-11-05', r1);
  const r2 = W.romeStamp(new Date(Date.UTC(2026, 10, 5, 23, 30)));
  ok('Rome clock across midnight: 23:30 UTC on the 5th = 00:30 on the 6th', r2.en === '6 November 2026, 00:30 (Rome time, CET)' && r2.day === '2026-11-06', r2);
  const r3 = W.romeStamp(new Date(Date.UTC(2026, 5, 30, 22, 15)));
  ok('Rome clock, summer: 22:15 UTC on 30 June = 00:15 CEST on 1 July', r3.en === '1 July 2026, 00:15 (Rome time, CEST)' && r3.it === '1 luglio 2026, ore 00:15 (ora di Roma)', r3);
  ok('itDay: ISO day → DD/MM/YYYY, plus calendar days, across a month', W.itDay('2026-11-05') === '05/11/2026' && W.itDay('2026-11-20', 14) === '04/12/2026' && W.itDay(null) === null);

  ok('ref: "PAR-2026-0007" → the order number', W.refKeys('PAR-2026-0007').order === 'PAR-2026-0007' && W.refKeys('PAR-2026-0007').file === null);
  ok('ref: the invoice number "PAR-2026-0007-FS" → the order', W.refKeys('Invoice PAR-2026-0007-FS').order === 'PAR-2026-0007');
  ok('ref: "par 2026 7" and "BER-2026-12" normalised', W.refKeys('par 2026 7').order === 'PAR-2026-0007' && W.refKeys('ber-2026-12').order === 'BER-2026-0012');
  ok('ref: "bm-x7k2q", "BMX7K2Q", "File BM X7K2Q" → "BM X7K2Q"', ['bm-x7k2q', 'BMX7K2Q', 'File BM X7K2Q'].every((s) => W.refKeys(s).file === 'BM X7K2Q'));
  ok('ref: a code outside the file alphabet (O, 1) or glued to more text is not a file', W.refKeys('BM X7K2O').file === null && W.refKeys('BM 12345').file === null && W.refKeys('BMW123456').file === null && W.refKeys('SPAR-2026-0007').order === null);
  ok('ref: both codes read from one line', JSON.stringify(W.refKeys('PAR-2026-0007 · BM X7K2Q')) === JSON.stringify({ file: 'BM X7K2Q', order: 'PAR-2026-0007' }));

  ok('classify: book_ unsigned → open; draft → open', W.classify({ id: 'book_a' }) === 'book_open' && W.classify({ id: 'book_a', signing: { status: 'draft' } }) === 'book_open');
  ok('classify: invoicing/invoiced/paid → after signing', ['invoicing', 'invoiced'].every((s) => W.classify({ id: 'book_a', signing: { status: s } }) === 'book_signed') && W.classify({ id: 'book_a', paid: true }) === 'book_signed');
  ok('classify: closed or no_fee → closed; withdrawn wins', W.classify({ id: 'book_a', closedAt: 'x' }) === 'book_closed' && W.classify({ id: 'book_a', signing: { status: 'no_fee' } }) === 'book_closed' && W.classify({ id: 'book_a', withdrawnAt: 'x', paid: true }) === 'book_withdrawn');
  ok('classify: a paid svc_ is an order; a city_ file or an unpaid svc_ is not', W.classify({ id: 'svc_x', paid: true }) === 'svc_paid' && W.classify({ id: 'city_x' }) === null && W.classify({ id: 'svc_x' }) === null && !W.isOrderLead({ id: 'city_x' }) && W.isOrderLead({ id: 'book_x' }));
  const w = { at: 'T', ackSentAt: 'A', statementId: 'S' };
  ok('lead write: open → withdrawnAt + the map, nothing else', JSON.stringify(W.leadWrite('book_open', {}, w)) === JSON.stringify({ withdrawnAt: 'T', withdrawal: { at: 'T', via: 'online', ackSentAt: 'A', statementId: 'S' } }));
  ok('lead write: after signing, closed, paid svc_ → the map only; a second statement never overwrites', ['book_signed', 'book_closed', 'svc_paid'].every((k) => Object.keys(W.leadWrite(k, {}, w)).join() === 'withdrawal') && W.leadWrite('svc_paid', { withdrawal: { at: 'old' } }, w) === null && W.leadWrite('book_withdrawn', {}, w) === null);
}

// ═══ 2. the door ════════════════════════════════════════════════════════════
section('2. The door: method, honeypot, validation');
{
  resetMails();
  const before = snapshot('');
  const g = await post(stmt(), { method: 'GET' });
  ok('GET → 405', g.statusCode === 405);
  const o = await post(stmt(), { method: 'OPTIONS' });
  ok('OPTIONS → 204', o.statusCode === 204);
  const h = await post(stmt({ company: 'Acme Ltd' }));
  ok('honeypot → the same 200 {ok:true} a person gets', h.statusCode === 200 && JSON.stringify(h.body) === '{"ok":true}', h.body);
  ok('honeypot → nothing written, nothing sent', snapshot('') === before && mails().length === 0);
  const bad = await post(stmt({ email: 'nope' }));
  ok('a bad email → 400 email_required, nothing written', bad.statusCode === 400 && bad.body.error === 'email_required' && snapshot('') === before);
  const nb = await post(null);
  ok('no body → 400', nb.statusCode === 400);
  ok('Cache-Control: no-store on every answer', h.headers['Cache-Control'] === 'no-store' && bad.headers['Cache-Control'] === 'no-store');
}

// ═══ 3. a Paris order, not signed: withdrawn, nothing to refund ═══════════
section('3. A book_ order not signed, by its order number: withdrawnAt + "nulla da rimborsare"');
let firstBody, firstStatement;
{
  resetMails();
  const cityBefore = JSON.stringify(DB.get('leads/book_parisopen01').fields.city);
  firstStatement = stmt({ ref: 'PAR-2026-0007', requestId: 'firstpage01' });
  const r = await post(firstStatement);
  firstBody = r.body;
  ok('200 {ok:true}', r.statusCode === 200 && JSON.stringify(r.body) === '{"ok":true}', r.body);
  const id = W.statementId(W.normalizeStatement(firstStatement).st);
  const n = docOf('agentNotifications/' + id);
  ok('agentNotifications/withdraw-<id>: type, high, pending, the statement, receivedAt', n && n.type === 'withdrawal.received' && n.priority === 'high' && n.status === 'pending'
    && n.statement.name === 'Anna Rossi' && n.statement.email === 'anna@example.com' && n.statement.desk === 'Paris' && n.statement.service === 'Full Search' && n.statement.ref === 'PAR-2026-0007' && n.receivedAt === new Date(NOW).toISOString(), n);
  ok('the card: the desk, the person, the order, "nulla da rimborsare"', /RECESSO ONLINE/.test(n.summary) && /PARIGI/.test(n.summary) && /Anna Rossi/.test(n.summary) && /ordine PAR-2026-0007/.test(n.summary) && /nulla da rimborsare/.test(n.summary) && /leads\/book_parisopen01/.test(n.summary), n.summary);
  ok('match recorded: book_open on leads/book_parisopen01 (and ref → the lead)', n.match.kind === 'book_open' && n.match.leadId === 'book_parisopen01' && n.match.via === 'ref' && n.ref && n.ref.id === 'book_parisopen01');
  const lead = docOf('leads/book_parisopen01');
  ok('the order: withdrawnAt = the time of receipt', lead.withdrawnAt === new Date(NOW).toISOString(), lead.withdrawnAt);
  ok('the order: withdrawal {at, via:"online", ackSentAt, statementId}', lead.withdrawal && lead.withdrawal.at === lead.withdrawnAt && lead.withdrawal.via === 'online' && typeof lead.withdrawal.ackSentAt === 'string' && lead.withdrawal.statementId === id && Object.keys(lead.withdrawal).sort().join() === 'ackSentAt,at,statementId,via', lead.withdrawal);
  ok('the order: `city` untouched (a top-level mask replaces whole maps)', JSON.stringify(DB.get('leads/book_parisopen01').fields.city) === cityBefore);
  ok('the order: nothing else decided (status, paid, closedAt unchanged)', lead.status === 'new' && lead.paid === false && lead.closedAt === undefined);

  const ack = to('anna@example.com');
  ok('ONE acknowledgement, to the consumer, at once', ack.length === 1, mails().map((m) => m.to));
  const a = ack[0] || {};
  ok('ack subject: "Withdrawal received · BOOM Paris"', a.subject === 'Withdrawal received · BOOM Paris', a.subject);
  ok('ack: the statement in the words of the model form', a.text.includes('I hereby give notice that I withdraw from my contract for the provision of the following service: Full Search (Paris).'));
  ok('ack: the date and time of receipt, Rome', a.text.includes('Received: 5 November 2026, 11:42 (Rome time, CET)') && a.text.includes('on 5 November 2026 at 11:42, Rome time (CET)'), a.text);
  ok('ack: the reference and our receipt number', a.text.includes('Your reference: PAR-2026-0007') && a.text.includes('Receipt number: ' + W.receiptOf(id)));
  ok('ack: name, email used, desk, service', a.text.includes('Name: Anna Rossi') && a.text.includes('Email used: anna@example.com') && a.text.includes('Desk: Paris') && a.text.includes('Service: Full Search'));
  ok('ack HTML carries the same facts (escaped), in the BOOM shell', a.html.includes('5 November 2026') && a.html.includes('11:42') && a.html.includes('PAR-2026-0007') && a.html.includes(W.receiptOf(id)) && a.html.includes('B&nbsp;O&nbsp;O&nbsp;M'));
  ok('ack: durable-medium wording, a hedged refund line, Reply-To the shared box', /acknowledgement of receipt, on a durable medium/.test(a.text) && /If a refund is due, it is made within 14 days of today/.test(a.text) && a.replyTo === 'hello@boom-rome.com');
  ok('ack: never the state of the order (no "nothing to refund", no file code, no lead id)', !/nothing to refund|withdrawn|book_|BM [A-Z2-9]{5}|signed|invoice/i.test(a.text), a.text);
  const op = to(OPERATOR);
  ok('the operator copy: Italian, the card inside, Reply-To the consumer', op.length === 1 && /^Recesso online — PARIGI — Anna Rossi — PAR-2026-0007$/.test(op[0].subject) && op[0].html.includes('nulla da rimborsare') && op[0].replyTo === 'anna@example.com', op[0] && op[0].subject);
  const n2 = docOf('agentNotifications/' + id);
  ok('outcome recorded on the notification: ack, operator copy, the stamp', typeof n2.ackSentAt === 'string' && typeof n2.operatorCopySentAt === 'string' && n2.leadStampedAt === lead.withdrawnAt && n2.leadStamp.kind === 'book_open' && n2.leadStamp.wrote.join() === 'withdrawnAt,withdrawal', n2);
}

// ═══ 4. no enumeration ═════════════════════════════════════════════════════
section('4. No enumeration: the same answer and the same acknowledgement, match or not');
{
  resetMails();
  const before = snapshot('leads/');
  const r = await post(stmt({ name: 'Zed Nobody', email: 'zed@example.com', ref: 'PAR-2026-0999', requestId: 'nomatch0001' }));
  ok('no match: the same status and the same body as the match', r.statusCode === 200 && JSON.stringify(r.body) === JSON.stringify(firstBody), r.body);
  ok('no match: no order written', snapshot('leads/') === before);
  const n = docOf('agentNotifications/' + W.statementId(W.normalizeStatement(stmt({ email: 'zed@example.com', ref: 'PAR-2026-0999', requestId: 'nomatch0001' })).st));
  ok('no match: the card says "da abbinare a mano", the ack still goes', n && n.match.kind === 'none' && /da abbinare a mano/.test(n.summary) && to('zed@example.com').length === 1, n && n.summary);

  // the same statement shape, one email on an order (Berlin, open), one not:
  // the two acknowledgements must be the same text but for the email and the receipt
  resetMails();
  const base = { name: 'Kim Test', ref: '', desk: 'Berlin', service: 'full-search' };
  const r1 = await post(stmt({ ...base, email: 'dora@example.com', requestId: 'enumcmp0001' }));
  const r2 = await post(stmt({ ...base, email: 'nobody@example.com', requestId: 'enumcmp0002' }));
  ok('match (email + desk) and no match: identical answers', r1.statusCode === r2.statusCode && JSON.stringify(r1.body) === JSON.stringify(r2.body));
  const k1 = W.statementId(W.normalizeStatement(stmt({ ...base, email: 'dora@example.com', requestId: 'enumcmp0001' })).st);
  const k2 = W.statementId(W.normalizeStatement(stmt({ ...base, email: 'nobody@example.com', requestId: 'enumcmp0002' })).st);
  const a1 = to('dora@example.com')[0], a2 = to('nobody@example.com')[0];
  const norm = (m, email, id) => (m ? (m.subject + '\n' + m.text + '\n' + m.html).split(email).join('<EMAIL>').split(W.receiptOf(id)).join('<RECEIPT>') : '');
  ok('the two acknowledgements are the same text (email and receipt aside)', a1 && a2 && norm(a1, 'dora@example.com', k1) === norm(a2, 'nobody@example.com', k2));
  ok('…and the matched one was really matched (the order is withdrawn)', !!docOf('leads/book_berlinopen1').withdrawnAt && docOf('agentNotifications/' + k1).match.kind === 'book_open');
  ok('…without the order number or file code the consumer did not type', !a1.text.includes('BER-2026-0004') && !a1.text.includes(SCALO.fileCode('book_berlinopen1')));
}

// ═══ 5. one statement ══════════════════════════════════════════════════════
section('5. A retried submit is the same statement: 409, the same answer, nothing twice');
{
  resetMails();
  const before = snapshot('');
  const r = await post(firstStatement);
  ok('the same body again → the same 200 {ok:true}', r.statusCode === 200 && JSON.stringify(r.body) === JSON.stringify(firstBody));
  ok('no second notification, no second write, no second email', snapshot('') === before && mails().length === 0, mails().map((m) => m.to));
  const n = notifications().filter((k) => docOf(k).statement && docOf(k).statement.ref === 'PAR-2026-0007');
  ok('one statement on file for that reference', n.length === 1, n);
}

// ═══ 6. every matching case ════════════════════════════════════════════════
section('6. Every matching case writes what the spec says, and only that');
const lastNotif = (st) => docOf('agentNotifications/' + W.statementId(W.normalizeStatement(st).st));
{
  resetMails();
  let s = stmt({ name: 'Lea M', email: 'lea@example.com', ref: 'file ' + SCALO.fileCode('book_parisopen02').replace(' ', '-').toLowerCase() });
  await post(s);
  ok('by the file code, typed loosely ("file bm-xxxxx") → the order, withdrawn', !!docOf('leads/book_parisopen02').withdrawnAt && lastNotif(s).match.via === 'ref', lastNotif(s).match);

  s = stmt({ name: 'Max K', email: 'MAX@EXAMPLE.COM', ref: '', desk: 'Paris' });
  await post(s);
  ok('by email + desk, the email typed in capitals → the order, withdrawn', !!docOf('leads/book_parisopen03').withdrawnAt && lastNotif(s).match.via === 'email');

  s = stmt({ name: 'Bea', email: 'bea@example.com', ref: 'PAR-2026-0008' });
  await post(s);
  let lead = docOf('leads/book_parisinv001');
  ok('invoiced (after signing) → the withdrawal map only, NO withdrawnAt', lead.withdrawal && lead.withdrawal.via === 'online' && lead.withdrawnAt === undefined && lead.signing.status === 'invoiced', lead);
  ok('…the card: "dopo la firma: finestra fino al 19/11/2026, Start now no — decidi tu"', /dopo la firma: finestra fino al 19\/11\/2026, Start now no — decidi tu/.test(lastNotif(s).summary) && /fattura emessa/.test(lastNotif(s).summary), lastNotif(s).summary);

  s = stmt({ name: 'Carl', email: 'carl@example.com', ref: 'BER-2026-0003', desk: 'Berlin' });
  await post(s);
  lead = docOf('leads/book_berlinpaid1');
  ok('paid at signing → the map only, no withdrawnAt; the card: Start now sì, fee paid, you decide', lead.withdrawal && lead.withdrawnAt === undefined && lead.paid === true
    && /Start now sì — decidi tu/.test(lastNotif(s).summary) && /compenso già pagato/.test(lastNotif(s).summary) && /BERLINO/.test(lastNotif(s).summary), lastNotif(s).summary);

  s = stmt({ name: 'Eve', email: 'eve@example.com', ref: 'PAR-2026-0009' });
  await post(s);
  lead = docOf('leads/book_parisclosed');
  ok('closed order → the map only; the card: already closed, nothing to refund', lead.withdrawal && lead.withdrawnAt === undefined && /ordine già chiuso \(stopped\) il 04\/11\/2026: nulla da rimborsare/.test(lastNotif(s).summary), lastNotif(s).summary);

  s = stmt({ name: 'Fred', email: 'fred@example.com', ref: SCALO.fileCode('svc_csmadrid01'), desk: 'Madrid' });
  await post(s);
  lead = docOf('leads/svc_csmadrid01');
  ok('a paid svc_ order of the six (Madrid), by its file → the map on the order, no withdrawnAt', lead.withdrawal && lead.withdrawal.statementId === W.statementId(W.normalizeStatement(s).st) && lead.withdrawnAt === undefined && lead.paid === true);
  ok('…the card: "rimborso entro 14 giorni (entro il 19/11/2026)", €500, Start now sì, paid on 02/11', /ordine pagato €500 · Full Search \(Madrid\)/.test(lastNotif(s).summary) && /rimborso entro 14 giorni \(entro il 19\/11\/2026\)/.test(lastNotif(s).summary)
    && /Start now sì/.test(lastNotif(s).summary) && /pagato il 02\/11\/2026/.test(lastNotif(s).summary) && /Nessun rimborso automatico/.test(lastNotif(s).summary), lastNotif(s).summary);
  ok('…the mixed-case email on the Stripe lead still counts as the same person', lastNotif(s).match.kind === 'svc_paid');

  resetMails();
  s = stmt({ name: 'Gina Bianchi', email: 'gina@example.it', ref: '', desk: 'Roma', service: 'concordato-pack' });
  await post(s);
  lead = docOf('leads/svc_csroma0001');
  ok('the Rome Pacchetto, desk Roma + email → the paid svc_, the card "rimborso entro 14 giorni"', lead.withdrawal && /ROMA/.test(lastNotif(s).summary) && /ordine pagato €349 · Pacchetto canone concordato \(Roma\)/.test(lastNotif(s).summary) && /rimborso entro 14 giorni/.test(lastNotif(s).summary), lastNotif(s).summary);
  const it = to('gina@example.it')[0] || {};
  ok('…the acknowledgement in Italian (Lei), Rome date and time', it.subject === 'Recesso ricevuto · BOOM Roma' && it.text.includes('Gentile Gina Bianchi,') && it.text.includes('Con la presente notifico il recesso dal mio contratto per la prestazione del seguente servizio: Pacchetto canone concordato (Roma).')
    && it.text.includes('Ricevuta il: 5 novembre 2026, ore 11:42 (ora di Roma)') && it.text.includes('Se le spetta un rimborso, lo riceve entro 14 giorni da oggi'), it.text);
  ok('…"desk=Rome" (the Pacchetto\'s own emails) is the same desk', W.normalizeStatement(stmt({ desk: 'Rome' })).st.desk === 'Roma');

  resetMails();
  const anna = JSON.stringify(DB.get('leads/book_parisopen01').fields);
  const before = snapshot('leads/');
  s = stmt({ name: 'Mallory', email: 'mallory@example.com', ref: 'BER-2026-0005', desk: 'Berlin' });
  const rm = await post(s);
  ok('a guessed reference with another email: the same answer, NO write on that order', rm.statusCode === 200 && JSON.stringify(rm.body) === '{"ok":true}' && snapshot('leads/') === before && docOf('leads/book_nora0000001').withdrawnAt === undefined);
  ok('…the card: the reference matches, the email does not, "da abbinare a mano"', lastNotif(s).match.kind === 'mismatch' && /l'email dell'ordine è un'altra \(nora@example.com\)/.test(lastNotif(s).summary) && /da abbinare a mano/.test(lastNotif(s).summary) && /Nessuna modifica all'ordine/.test(lastNotif(s).summary), lastNotif(s).summary);
  ok('…and the acknowledgement goes to who wrote, saying nothing of that order', to('mallory@example.com').length === 1 && !to('mallory@example.com')[0].text.includes('nora') && JSON.stringify(DB.get('leads/book_parisopen01').fields) === anna);

  s = stmt({ name: 'Ivy', email: 'ivy@example.com', ref: '', desk: 'Paris' });
  const before2 = snapshot('leads/');
  await post(s);
  ok('two open orders for one email at one desk → ambiguous, nothing written', lastNotif(s).match.kind === 'ambiguous' && snapshot('leads/') === before2 && /più ordini corrispondono \(2/.test(lastNotif(s).summary) && /da abbinare a mano/.test(lastNotif(s).summary), lastNotif(s).summary);

  s = stmt({ name: 'Anna Rossi', email: 'anna@example.com', ref: 'PAR-2026-0007', requestId: 'secondpage1' });
  const firstAt = docOf('leads/book_parisopen01').withdrawnAt;
  await post(s);
  ok('a second statement on a withdrawn order → "già receduto", withdrawnAt kept from the first', docOf('leads/book_parisopen01').withdrawnAt === firstAt && lastNotif(s).match.kind === 'book_withdrawn' && /già receduto il 05\/11\/2026/.test(lastNotif(s).summary), lastNotif(s).summary);

  s = stmt({ name: 'Ivy', email: 'ivy@example.com', ref: '', desk: 'Berlin' });
  await post(s);
  ok('the desk filters an email match (Ivy has no Berlin order) → none', lastNotif(s).match.kind === 'none');
  s = stmt({ name: 'Jo', email: 'jo@example.com', ref: '', desk: 'other' });
  await post(s);
  ok('desk "other" → email across every desk (the London order)', lastNotif(s).match.kind === 'svc_paid' && lastNotif(s).match.leadId === 'svc_cslondon01' && /ordine pagato £199/.test(lastNotif(s).summary), lastNotif(s).summary);

  s = stmt({ name: 'Hank', email: 'hank@example.com', ref: SCALO.fileCode('city_freefile01'), desk: 'Amsterdam' });
  const freeBefore = JSON.stringify(DB.get('leads/city_freefile01').fields);
  await post(s);
  ok('a free file (city_, no contract) is not an order → none, the file untouched', lastNotif(s).match.kind === 'none' && JSON.stringify(DB.get('leads/city_freefile01').fields) === freeBefore);

  book('book_lostref0001', { email: 'olga@example.com', city: { order: { number: 'PAR-2026-0020', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
  s = stmt({ name: 'Olga', email: 'olga@example.com', ref: 'PAR-2026-0099' });
  await post(s);
  ok('a reference that matches nothing falls back to email + desk, and the card says so', !!docOf('leads/book_lostref0001').withdrawnAt && lastNotif(s).match.via === 'email' && /abbinato per email/.test(lastNotif(s).summary), lastNotif(s).summary);
}

// ═══ 7. the order moves between the read and the write ════════════════════
section('7. A cfy tap lands between the read and the stamp: decided again, never withdrawnAt on an invoice');
{
  resetMails();
  book('book_racer000001', { email: 'rita@example.com', city: { order: { number: 'PAR-2026-0030', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
  HOOKS.beforeCommit = (writes) => {
    if (!writes.some((w) => w.update && /leads\/book_racer000001$/.test(w.update.name))) return;
    const d = DB.get('leads/book_racer000001');
    d.fields.signing = L.toFsFields({ s: { status: 'invoiced', invoiceId: 'cityfee_book_racer000001' } }).s;
    d.ut = nextUT();
  };
  const s = stmt({ name: 'Rita', email: 'rita@example.com', ref: 'PAR-2026-0030' });
  const r = await post(s);
  const lead = docOf('leads/book_racer000001');
  ok('the same answer', r.statusCode === 200 && JSON.stringify(r.body) === '{"ok":true}');
  ok('the stamp re-read the order: invoiced now → the map only, no withdrawnAt', lead.signing.status === 'invoiced' && lead.withdrawal && lead.withdrawnAt === undefined, lead);
  ok('the card is rewritten to the new state ("dopo la firma")', lastNotif(s).match.kind === 'book_signed' && /dopo la firma/.test(lastNotif(s).summary) && !/nulla da rimborsare/.test(lastNotif(s).summary), lastNotif(s).summary);
}

// ═══ 8. failures and recovery ══════════════════════════════════════════════
section('8. Failures: the acknowledgement that does not go, the run that dies, Firestore down');
{
  resetMails();
  book('book_ackfail0001', { email: 'paul@example.com', city: { order: { number: 'PAR-2026-0040', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
  globalThis.__mailFail = (m) => (m.to === 'paul@example.com' ? Object.assign(new Error('rejected'), { responseCode: 550 }) : null);
  const s = stmt({ name: 'Paul', email: 'paul@example.com', ref: 'PAR-2026-0040', requestId: 'ackfail0001' });
  const r = await post(s);
  const id = W.statementId(W.normalizeStatement(s).st);
  let n = docOf('agentNotifications/' + id);
  ok('the statement is recorded: the answer stays {ok:true}', r.statusCode === 200 && JSON.stringify(r.body) === '{"ok":true}');
  ok('the failure is recorded on the notification (ackFailedAt, the SMTP code)', typeof n.ackFailedAt === 'string' && n.ackError === '550' && !n.ackSentAt, n);
  const alarm = docOf('agentNotifications/withdraw-mail-' + id.slice(9));
  ok('an alarm for the operator: "NON è partita — mandala a mano"', alarm && alarm.type === 'withdrawal.ack_failed' && alarm.priority === 'high' && /NON è partita — mandala a mano/.test(alarm.summary), alarm);
  ok('the order is stamped anyway, ackSentAt null on its map', !!docOf('leads/book_ackfail0001').withdrawnAt && docOf('leads/book_ackfail0001').withdrawal.ackSentAt === null);

  globalThis.__mailFail = null; globalThis.__mails = [];
  NOW += 5 * 60 * 1000;                                  // the consumer tries again five minutes later
  const r2 = await post(s);
  n = docOf('agentNotifications/' + id);
  const ack = to('paul@example.com');
  ok('the retry resumes: ONE acknowledgement now, the same answer', r2.statusCode === 200 && JSON.stringify(r2.body) === '{"ok":true}' && ack.length === 1);
  ok('…dated with the ORIGINAL time of receipt (11:42, not 11:47)', ack[0] && ack[0].text.includes('Received: 5 November 2026, 11:42 (Rome time, CET)'), ack[0] && ack[0].text);
  ok('…recorded: ackSentAt, attempts 1; the alarm closed', typeof n.ackSentAt === 'string' && n.attempts === 1 && docOf('agentNotifications/withdraw-mail-' + id.slice(9)).status === 'done');
  const r3 = await post(s);
  ok('a third submit: complete → nothing more', r3.statusCode === 200 && to('paul@example.com').length === 1);
  NOW -= 5 * 60 * 1000;

  // the first run died after the record, before the emails and the stamp
  resetMails();
  book('book_died0000001', { email: 'quinn@example.com', city: { order: { number: 'PAR-2026-0041', termsV: 'v', termsHash: 'h', expiresOn: '2027-05-05' } } });
  const sd = stmt({ name: 'Quinn', email: 'quinn@example.com', ref: 'PAR-2026-0041', requestId: 'diedrun0001' });
  const st = W.normalizeStatement(sd).st;
  const did = W.statementId(st);
  const born = new Date(NOW - 42 * 60 * 1000).toISOString();          // 42 minutes ago: 11:00 CET
  seed('agentNotifications/' + did, { type: 'withdrawal.received', priority: 'high', status: 'pending', actor: 'withdraw', summary: 'card', receipt: W.receiptOf(did),
    statement: { name: st.name, email: st.email, desk: st.desk, service: st.service, serviceKey: st.serviceKey, ref: st.ref, requestId: st.requestId, lang: st.lang },
    receivedAt: born, match: { kind: 'book_open', leadId: 'book_died0000001', via: 'ref', leads: null }, createdAt: born, attempts: 0 });
  const rd = await post(sd);
  const dl = docOf('leads/book_died0000001');
  ok('a dead first run is finished by the retry: the ack with the original 11:00', rd.statusCode === 200 && to('quinn@example.com').length === 1 && to('quinn@example.com')[0].text.includes('5 November 2026, 11:00 (Rome time, CET)'), to('quinn@example.com').map((m) => m.text.slice(0, 80)));
  ok('…the operator copy too, and the order stamped with the original time', to(OPERATOR).length === 1 && dl.withdrawnAt === born && dl.withdrawal.statementId === did);

  // the first run is still at work (10 s ago, no outcome): the retry waits
  resetMails();
  const sf = stmt({ name: 'Ruth', email: 'ruth@example.com', ref: '', requestId: 'inflight001' });
  const sft = W.normalizeStatement(sf).st;
  const fid = W.statementId(sft);
  const young = new Date(NOW - 10 * 1000).toISOString();
  seed('agentNotifications/' + fid, { type: 'withdrawal.received', priority: 'high', status: 'pending', summary: 'card', statement: { ...sft }, receivedAt: young, match: { kind: 'none', leadId: null }, createdAt: young, attempts: 0 });
  const beforeF = snapshot('agentNotifications/' + fid);
  const rf = await post(sf);
  ok('a run still in flight: the same answer, no second email, nothing touched', rf.statusCode === 200 && mails().length === 0 && snapshot('agentNotifications/' + fid) === beforeF);

  // the lookup fails: the statement is still received and acknowledged
  resetMails();
  FAIL.query = true;
  const sq = stmt({ name: 'Sam', email: 'sam@example.com', ref: 'PAR-2026-0007', requestId: 'qfail000001' });
  const rq = await post(sq);
  FAIL.query = false;
  ok('the order lookup fails: {ok:true}, the ack goes, the card says "ricerca … non riuscita: da abbinare a mano"', rq.statusCode === 200 && to('sam@example.com').length === 1
    && lastNotif(sq).match.kind === 'lookup_failed' && /ricerca dell'ordine non riuscita: da abbinare a mano/.test(lastNotif(sq).summary), lastNotif(sq));

  // Firestore unreachable: the two emails are the record
  resetMails();
  FAIL.all = true;
  const sx = stmt({ name: 'Tess', email: 'tess@example.com', ref: '', requestId: 'dbdown00001' });
  const rx = await post(sx);
  ok('Firestore down: the ack still goes and the answer is {ok:true}', rx.statusCode === 200 && to('tess@example.com').length === 1);
  ok('…the operator copy says it is the only record', to(OPERATOR).length === 1 && /Non registrato in Firestore/.test(to(OPERATOR)[0].html));
  resetMails();
  globalThis.__mailFail = () => Object.assign(new Error('down'), { code: 'ECONNECTION' });
  const ry = await post(stmt({ name: 'Uma', email: 'uma@example.com', ref: '', requestId: 'dbdown00002' }));
  FAIL.all = false; globalThis.__mailFail = null;
  ok('Firestore down AND mail down: nothing recorded anywhere → 503 (the page says retry or email)', ry.statusCode === 503 && ry.body.error === 'unavailable', ry.body);
}

// ═══ 9. the rate limit ═════════════════════════════════════════════════════
section('9. Per-IP rate limit');
{
  resetMails();
  const codes = [];
  for (let i = 0; i < W.MAX_PER_WINDOW + 1; i++) codes.push((await post(stmt({ name: 'Vic', email: `vic${i}@example.com`, requestId: 'ratelimit' + i }), { ip: '203.0.113.7' })).statusCode);
  ok(`${W.MAX_PER_WINDOW} statements from one IP pass, the next is 429`, codes.slice(0, -1).every((c) => c === 200) && codes[codes.length - 1] === 429, codes);
  ok('another IP is not affected', (await post(stmt({ name: 'Wes', email: 'wes@example.com' }), { ip: '203.0.113.8' })).statusCode === 200);
  NOW += 11 * 60 * 1000;
  ok('ten minutes later the same IP passes again', (await post(stmt({ name: 'Vic', email: 'vic9@example.com' }), { ip: '203.0.113.7' })).statusCode === 200);
}

// ═══ 10. Rome across midnight and in summer, end to end ════════════════════
section('10. The Rome date on the acknowledgement, at 23:30 UTC and in summer');
{
  resetMails();
  NOW = Date.UTC(2026, 10, 5, 23, 30, 0);
  await post(stmt({ name: 'Xena', email: 'xena@example.com', ref: SCALO.fileCode('svc_cslondon01'), desk: 'London', requestId: 'midnight001' }));
  const a = to('xena@example.com')[0] || {};
  ok('23:30 UTC on 5 Nov: the ack says 6 November 2026, 00:30 CET', a.text && a.text.includes('Received: 6 November 2026, 00:30 (Rome time, CET)'), a.text);
  NOW = Date.UTC(2026, 5, 30, 22, 15, 0);
  await post(stmt({ name: 'Yves', email: 'yves@example.com', desk: 'Valencia', requestId: 'summer00001' }));
  const b = to('yves@example.com')[0] || {};
  ok('22:15 UTC on 30 June: 1 July 2026, 00:15 CEST', b.text && b.text.includes('Received: 1 July 2026, 00:15 (Rome time, CEST)') && b.subject === 'Withdrawal received · BOOM Valencia', b.text);
  NOW = Date.UTC(2026, 10, 5, 10, 42, 0);
}

// ═══ 11. the source ════════════════════════════════════════════════════════
section('11. The source: default config, every write awaited, no Stripe, one answer');
{
  const src = readFileSync(new URL('../../api/withdraw.js', import.meta.url), 'utf8');
  const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  ok('vercel.json: no function rule names api/withdraw.js (default config, 50 rules stay)', !Object.keys(vercel.functions || {}).some((k) => k.includes('withdraw')) && Object.keys(vercel.functions).length <= 50);
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const bare = code.split('\n').filter((l) => /^\s*(fsCreate|fsCommit|fsPatch|sendEmail|logActivity)\(/.test(l));
  ok('every Firestore write and email is awaited (the 13/09 lesson)', bare.length === 0, bare);
  ok('no Stripe, no new collection: agentNotifications and leads only', !/from 'stripe'/.test(src) && [...code.matchAll(/fs(?:Create|List|GetVersioned)\('([a-zA-Z]+)/g)].every((m) => ['agentNotifications', 'leads'].includes(m[1])));
  ok('one success answer in the handler, the same for every match', (code.match(/return SAME\(res\)/g) || []).length === 2 && /const SAME = \(res\) => res\.status\(200\)\.json\(\{ ok: true \}\);/.test(code));
  ok('the run-all registration', /name: 'withdraw', file: 'tests\/withdraw\/run\.mjs'/.test(readFileSync(new URL('../run-all.mjs', import.meta.url), 'utf8')));
}

// ═══ 12. mutations ════════════════════════════════════════════════════════
if (!process.env.WITHDRAW_MUTATION) {
  section('12. Mutations: each guard put back wrong must fail this suite');
  const self = fileURLToPath(import.meta.url);
  for (const name of Object.keys(MUTATIONS)) {
    const r = spawnSync(process.execPath, [self], { env: { ...process.env, WITHDRAW_MUTATION: name }, encoding: 'utf8', timeout: 120000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const missing = /mutation anchor missing/.test(out);
    const reds = (out.match(/✗/g) || []).length;
    ok(`mutation "${name}" is caught${reds ? ` (${reds} red)` : ''}`, r.status !== 0 && !missing, missing ? 'anchor missing' : out.split('\n').filter((l) => /passed|failed/.test(l)).pop());
  }
}

Date.now = REAL_NOW;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
