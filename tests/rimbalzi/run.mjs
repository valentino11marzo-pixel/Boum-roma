// tests/rimbalzi/run.mjs — I RIMBALZI: un'email a un cliente che non arriva
// diventa UN avviso, mai un silenzio e mai due avvisi.
//
// Il handler VERO (api/leads/scan-inbox.js?mode=bounces → api/leads/_rimbalzi.js)
// su un Firestore in memoria che rispetta le precondizioni (exists,
// updateTime) e confronta per TIPO come quello vero; imapflow sostituito da un
// trasporto finto guidato dal test; mailparser VERO; Telegram registrato.
// Qualunque altra rete (Anthropic compreso) è un errore contato.
//
// Le guardie sono provate per MUTAZIONE: lo stesso file rilancia sé stesso
// con un difetto iniettato nel sorgente, e ogni difetto deve far FALLIRE la
// suite (un confine di mutazione che non si trova più è un errore a sé).
//
// Uso: node tests/rimbalzi/run.mjs

import { register } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const SELF = fileURLToPath(import.meta.url);
const TARGET = '/api/leads/_rimbalzi.js';

// ── le mutazioni: [confine esatto nel sorgente, sostituzione] ──────────────
const MUTATIONS = {
  soft_as_hard: ["if (action === 'delayed') return { kind: 'delayed', subtype: null, hard: false };", "if (action === 'delayed') return { kind: 'delayed', subtype: null, hard: true };"],
  no_claim_409: ["fsCreate('agentNotifications', claim, id)", "fsCreate('agentNotifications', claim)"],
  plain_patch: ['fsCommit([{ docPath: path, fields, precondition: { updateTime: snap.updateTime } }])', 'fsPatch(path, fields)'],
  final_only: ["const origRaw = g.has('original-recipient') ? normAddr(g.get('original-recipient')) : null;", 'const origRaw = null;'],
  ignore_attachments: [".filter((a) => MACHINE_TYPES.test(String(a.contentType || '')))", '.filter(() => false)'],
  no_own_filter: ['const notOwn = kept.filter((r) => !isOwnAddress(r.address, own) && !isOwnAddress(r.finalRecipient, own)).slice(0, MAX_RECIPIENTS);', 'const notOwn = kept.slice(0, MAX_RECIPIENTS);'],
  no_memory: ['if (seen[dsnId]) { stats.alreadySeen++; continue; }', 'if (false) { stats.alreadySeen++; continue; }'],
  log_address: ['const matchedN = items.reduce(', "console.warn('[leads/rimbalzi] match', items.map((it) => it.rec.address).join(',')); const matchedN = items.reduce("],
  no_quiet_dead: ['if (!worth.length) outcome = \'quiet_dead\';', 'if (false) outcome = \'quiet_dead\';'],
  no_unmatched_cap: ["else if (orphanOnly && cap.n >= UNMATCHED_CARDS_PER_DAY) outcome = 'unmatched_capped';", "else if (false) outcome = 'unmatched_capped';"],
  gone_in_card: ['if (gone.size) for (const it of items)', 'if (false) for (const it of items)'],
  no_xtext: ["const origDecoded = origRaw ? (normAddr(xtextDecode(origRaw)) || origRaw) : null;", 'const origDecoded = origRaw;'],
  // le correzioni della revisione (25/10): ogni guardia, tolta, deve cadere
  orphan_ignores_also: ['const isOrphan = (it) => !it.people.length && !it.also.length;', 'const isOrphan = (it) => !it.people.length;'],
  bound_not_urgent: ["const priority = anyPaid || anyBound ? 'urgent' : 'high';", "const priority = anyPaid ? 'urgent' : 'high';"],
  no_also_whatsapp: ['.concat(alert.items.flatMap((it) => it.also.map((x) => ({ lead: pseudoLead(x), rec: it.rec }))))', ''],
  pfs_always_paid: ["  ? !!pfsPaidProof(p.doc)\n", "  ? true\n"],
  human_greedy: ['const found = humanRecipients(head, original ? original.to : []);', 'const found = [...new Set([...text.slice(0, 3000).matchAll(ANY_ADDR)].map((m) => normAddr(m[1].replace(/[.]+$/, \'\'))).filter(Boolean))];'],
  no_quote_cut: ['const head = humanHead(text);', 'const head = text.slice(0, 3000);'],
  release_to_np: ["    : { telegramDelivery: 'failed', lastFailedAt: new Date().toISOString(), lastFailCode: failCode };", "    : { telegramNotifiedAt: null, telegramDelivery: 'failed' };"],
  remember_failed: ["stats.notifyFailed++; stats.incomplete = true; rememberIt = false; outcome = 'alert_failed';", "stats.notifyFailed++; stats.incomplete = true; outcome = 'alert_failed';"],
  no_retake: ["if (d.telegramDelivery === 'sending' && !stale) return { outcome: 'in_flight' };", "return { outcome: 'already_sent' };"],
  match_once: ['          if (!B.afford(COST_MATCH)) { outOfTime = true; break; }', ''],
  flag_unbudgeted: ['            if (!B.afford(COST_FLAG)) { outOfTime = true; break; }', ''],
  no_blocklist_first: ["  if (DIAG_BLOCKLIST.test(d)) return { kind: 'rejected', subtype: null, hard: true };", ''],
  dns_is_domain: ['const DIAG_DOMAIN = /domain (?:name )?not found|nxdomain|host not found|no mx\\b|no such domain|unrouteable (?:mail )?domain/i;', 'const DIAG_DOMAIN = /domain (?:name )?not found|dns/i;'],
  confirmation_claim: ['if (d.clientEmailSentAt && tsOf(ctx.at || nowIso) >= tsOf(d.clientEmailSentAt) - 15 * 60e3) fields.emailBouncedAfterConfirmationAt = nowIso;', 'if (d.clientEmailSentAt) fields.clientEmailBouncedAt = nowIso;'],
};
const MUTATION = process.env.BOOM_BOUNCE_MUTATION || '';
if (MUTATION && !MUTATIONS[MUTATION]) throw new Error('Unknown mutation ' + MUTATION);
const change = MUTATION ? MUTATIONS[MUTATION] : null;

// ── il trasporto IMAP finto ───────────────────────────────────────────────
const transport = `export class ImapFlow {
 constructor(options){this.io=globalThis.__bounceIO;this.io.clients.push(this);this.io.options.push(options);}
 on(){return this;}
 async connect(){return this.io.step('connect');}
 async list(){await this.io.step('list');return this.io.folders;}
 async getMailboxLock(folder,options){this.io.locks.push({folder,options});await this.io.step('lock');this.mailbox={uidValidity:7n,readOnly:options&&options.readOnly===true};return{release:()=>{this.io.released++;}};}
 async search(query,options){this.io.searches.push({query,options});await this.io.step('search');return this.io.searchRows(query);}
 async fetchAll(range,query,options){this.io.fetches.push({kind:'all',range,query,options});await this.io.step('envelopes');const want=String(range).split(',').map(Number);return this.io.rows.filter(r=>want.includes(r.uid)).map(r=>({uid:r.uid,size:r.raw.length,emailId:'gm'+r.uid,envelope:{messageId:r.messageId,subject:r.subject,date:r.date,from:[{address:r.fromAddr}]}}));}
 async fetchOne(uid,query,options){this.io.fetches.push({kind:'one',uid,query,options});await this.io.step('source');const r=this.io.rows.find(x=>x.uid===Number(uid));if(!r)return false;const max=query&&query.source&&query.source.maxLength;return{uid:r.uid,source:max?r.raw.subarray(0,max):r.raw};}
 async logout(){this.io.loggedOut++;}
 close(){this.io.closed++;}
}`;
const transportURL = 'data:text/javascript,' + encodeURIComponent(transport);
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s,c,next){ if(s==='imapflow') return {url:${JSON.stringify(transportURL)},shortCircuit:true}; return next(s,c); }
export async function load(url,c,next){ const out=await next(url,c); const change=${JSON.stringify(change)};
  if(change && url.endsWith(${JSON.stringify(TARGET)})){ const src=String(out.source); if(!src.includes(change[0])) throw new Error('Mutation boundary missing'); return {...out, source: src.replace(change[0], change[1])}; }
  return out; }`), import.meta.url);

// ── ambiente ──────────────────────────────────────────────────────────────
Object.assign(process.env, {
  FIREBASE_API_KEY: 'fixture-key', FIREBASE_ADMIN_EMAIL: 'admin@example.invalid', FIREBASE_ADMIN_PASS: 'fixture-password',
  FIREBASE_PROJECT_ID: 'boom-property-dashboards', CRON_SECRET: 'cron-fixture', GMAIL_USER: 'operator@example.invalid',
  GMAIL_APP_PASS: 'fixture-app-password', TELEGRAM_BOT_TOKEN: 'tg-fixture', TELEGRAM_CHAT_ID: '4242',
});
delete process.env.ANTHROPIC_API_KEY;
delete process.env.PFS_IMAP_USER;
delete process.env.PFS_IMAP_PASS;

// ── i log: tutto registrato, niente stampato dal codice sotto test ─────────
const LOGS = [];
const realOut = (s) => process.stdout.write(s + '\n');
for (const k of ['log', 'warn', 'error', 'info', 'debug']) console[k] = (...a) => { LOGS.push(a.map((x) => (typeof x === 'string' ? x : (x && x.message) || JSON.stringify(x))).join(' ')); };

let pass = 0, fail = 0;
const failed = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; realOut('PASS ' + name); }
  else { fail++; failed.push(name); realOut('✗ FAIL ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); }
};

// ── Firestore in memoria, con i tipi ──────────────────────────────────────
const enc = (v) => v === null || v === undefined ? { nullValue: null }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = (v) => !v ? null : 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue : 'stringValue' in v ? v.stringValue
  : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec) : Object.fromEntries(Object.entries((v.mapValue && v.mapValue.fields) || {}).map(([k, x]) => [k, dec(x)]));
const typeOf = (v) => Object.keys(v || {})[0];
const cmpVal = (v) => typeOf(v) === 'timestampValue' ? Date.parse(v.timestampValue) : typeOf(v) === 'integerValue' ? Number(v.integerValue) : dec(v);
const sameKind = (a, b) => typeOf(a) === typeOf(b) || (['integerValue', 'doubleValue'].includes(typeOf(a)) && ['integerValue', 'doubleValue'].includes(typeOf(b)));
const field = (fields, path) => path.split('.').reduce((cur, k, i, arr) => {
  if (!cur) return undefined;
  const f = cur[k];
  if (i < arr.length - 1) return f && f.mapValue ? f.mapValue.fields : undefined;
  return f;
}, fields);

let io;
let rev = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 1) + (++rev) * 1000).toISOString();
function put(path, obj) { io.db.set(path, { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, enc(v)])), updateTime: stamp() }); }
function get(path) { const d = io.db.get(path); return d ? Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, dec(v)])) : null; }
const docOut = (path) => ({ name: 'projects/boom-property-dashboards/databases/(default)/documents/' + path, fields: io.db.get(path).fields, createTime: io.db.get(path).updateTime, updateTime: io.db.get(path).updateTime });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

function matchWhere(fields, where) {
  if (!where) return true;
  const f = where.fieldFilter;
  const actual = field(fields, f.field.fieldPath);
  if (actual === undefined || !sameKind(actual, f.value)) return false;
  const a = cmpVal(actual), b = cmpVal(f.value);
  return f.op === 'EQUAL' ? a === b : f.op === 'GREATER_THAN_OR_EQUAL' ? a >= b : f.op === 'GREATER_THAN' ? a > b : f.op === 'LESS_THAN' ? a < b : false;
}

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (u.hostname === 'identitytoolkit.googleapis.com') {
    if (u.pathname.includes('signInWithPassword')) return json({ idToken: 'admin-token' });
    const who = { 'valid-admin': 'admin1', 'valid-landlord': 'll1' }[body && body.idToken];
    return who ? json({ users: [{ localId: who }] }) : json({}, 400);
  }
  if (u.hostname === 'api.telegram.org') {
    io.tg.push({ method: u.pathname.split('/').pop(), body });
    if (io.tgHang) return new Promise(() => {});
    if (io.tgFail) return json({ ok: false, description: 'Internal Server Error' }, 500);
    return json({ ok: true, result: { message_id: 7000 + io.tg.length } });
  }
  if (u.hostname !== 'firestore.googleapis.com') { io.forbidden.push(u.hostname); throw new Error('forbidden host'); }
  const rest = decodeURIComponent(u.pathname.split('/documents')[1] || '');
  if (rest === ':runQuery') {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    const f = q.where && q.where.fieldFilter ? q.where.fieldFilter.field.fieldPath : null;
    io.queries.push({ coll, field: f, op: q.where && q.where.fieldFilter && q.where.fieldFilter.op });
    if (io.failQuery && io.failQuery(coll, f)) return json({ error: { status: 'UNAVAILABLE' } }, 503);
    let rows = [...io.db.entries()].filter(([p, d]) => p.startsWith(coll + '/') && p.split('/').length === 2 && matchWhere(d.fields, q.where));
    for (const o of q.orderBy || []) rows = rows.filter(([, d]) => o.field.fieldPath === '__name__' || field(d.fields, o.field.fieldPath) !== undefined);
    rows.sort(([pa, da], [pb, db]) => {
      for (const o of q.orderBy || []) {
        const dir = o.direction === 'DESCENDING' ? -1 : 1;
        const a = o.field.fieldPath === '__name__' ? pa : cmpVal(field(da.fields, o.field.fieldPath));
        const b = o.field.fieldPath === '__name__' ? pb : cmpVal(field(db.fields, o.field.fieldPath));
        if (a < b) return -dir; if (a > b) return dir;
      }
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    });
    rows = rows.slice(0, q.limit || 1000);
    return json(rows.length ? rows.map(([p]) => ({ document: docOut(p), readTime: stamp() })) : [{ readTime: stamp() }]);
  }
  if (rest === ':commit') {
    const writes = body.writes || [];
    for (const w of writes) { const p = (w.update ? w.update.name : w.delete).split('/documents/')[1]; if (io.beforeWrite) await io.beforeWrite(p, 'commit'); }
    for (const w of writes) {
      const p = (w.update ? w.update.name : w.delete).split('/documents/')[1];
      const c = w.currentDocument || {};
      const exists = io.db.has(p);
      if (c.exists === false && exists) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
      if (c.exists === true && !exists) return json({ error: { status: 'NOT_FOUND' } }, 404);
      if (c.updateTime && !exists) return json({ error: { status: 'NOT_FOUND' } }, 404);
      if (c.updateTime && io.db.get(p).updateTime !== c.updateTime) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    }
    for (const w of writes) {
      const p = (w.update ? w.update.name : w.delete).split('/documents/')[1];
      if (!w.update) { io.db.delete(p); continue; }
      const prev = io.db.has(p) ? io.db.get(p).fields : {};
      const next = { ...prev };
      for (const k of (w.updateMask && w.updateMask.fieldPaths) || Object.keys(w.update.fields || {})) {
        if (w.update.fields && k in w.update.fields) next[k] = w.update.fields[k]; else delete next[k];
      }
      io.db.set(p, { fields: next, updateTime: stamp() });
      io.writes.push({ path: p, how: 'commit', keys: Object.keys(w.update.fields || {}) });
    }
    return json({ writeResults: writes.map(() => ({ updateTime: stamp() })) });
  }
  const path = rest.replace(/^\//, '');
  if (method === 'GET') {
    if (io.failGet && io.failGet(path)) return json({ error: { status: 'UNAVAILABLE' } }, 503);
    return io.db.has(path) ? json(docOut(path)) : json({ error: { status: 'NOT_FOUND' } }, 404);
  }
  if (method === 'POST') {
    const id = u.searchParams.get('documentId') || ('auto' + (++io.auto));
    const p = path + '/' + id;
    if (io.beforeWrite) await io.beforeWrite(p, 'create');
    if (io.db.has(p)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    io.db.set(p, { fields: body.fields || {}, updateTime: stamp() });
    io.writes.push({ path: p, how: 'create', keys: Object.keys(body.fields || {}) });
    return json(docOut(p));
  }
  if (method === 'PATCH') {
    if (io.beforeWrite) await io.beforeWrite(path, 'patch');
    const mask = u.searchParams.getAll('updateMask.fieldPaths');
    if (u.searchParams.get('currentDocument.exists') === 'false' && io.db.has(path)) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    const prev = io.db.has(path) ? io.db.get(path).fields : {};
    const next = { ...prev };
    for (const k of mask.length ? mask : Object.keys(body.fields || {})) { if (k in (body.fields || {})) next[k] = body.fields[k]; else delete next[k]; }
    io.db.set(path, { fields: next, updateTime: stamp() });
    io.writes.push({ path, how: 'patch', keys: Object.keys(body.fields || {}) });
    return json(docOut(path));
  }
  return json({}, 400);
};

// ── lo stato di un giro ───────────────────────────────────────────────────
const F = await import('./fixtures.mjs');
const { CLIENT, OPERATOR, VARIANTS } = F;
function reset() {
  io = globalThis.__bounceIO = {
    clients: [], options: [], locks: [], searches: [], fetches: [], released: 0, closed: 0, loggedOut: 0,
    folders: [{ path: 'INBOX', specialUse: '\\Inbox', flags: new Set() }, { path: '[Gmail]/All Mail', specialUse: '\\All', flags: new Set() }, { path: '[Gmail]/Sent Mail', specialUse: '\\Sent', flags: new Set() }],
    rows: [], db: new Map(), writes: [], queries: [], tg: [], forbidden: [], auto: 0,
    tgFail: false, tgHang: false, hang: null, failQuery: null, failGet: null, beforeWrite: null,
  };
  io.step = async (name) => { if (io.hang === name) return new Promise(() => {}); };
  io.searchRows = (query) => {
    const since = query.since instanceof Date ? query.since.getTime() : 0;
    const terms = query.or || [];
    return io.rows.filter((r) => r.date.getTime() >= since && terms.some((t) =>
      (t.from && r.fromHeader.toLowerCase().includes(String(t.from).toLowerCase())) ||
      (t.subject && r.subject.toLowerCase().includes(String(t.subject).toLowerCase())))).map((r) => r.uid);
  };
  put('users/admin1', { role: 'admin', email: 'admin@example.invalid' });
  put('users/ll1', { role: 'landlord', email: 'landlord@example.invalid' });
  return io;
}
const hdr = (raw, name) => { const m = new RegExp('^' + name + ':\\s*(.*)$', 'im').exec(raw.toString('latin1').split(/\r\n\r\n/)[0]); return m ? m[1].trim() : ''; };
function addRow(uid, raw, { date = new Date() } = {}) {
  const fromHeader = hdr(raw, 'From');
  const fromAddr = (/<([^>]+)>/.exec(fromHeader) || [null, fromHeader.split(/\s/)[0]])[1];
  io.rows.push({ uid, raw, messageId: hdr(raw, 'Message-ID'), subject: hdr(raw, 'Subject'), fromHeader, fromAddr, date });
}
const dsnIdOf = (raw) => crypto.createHash('sha1').update(hdr(raw, 'Message-ID')).digest('hex').slice(0, 24);

const scan = (await import('../../api/leads/scan-inbox.js')).default;
const R = await import('../../api/leads/_rimbalzi.js');
const notifyPending = (await import('../../api/telegram/notify-pending.js')).default;
const { simpleParser } = await import('mailparser');

function mockRes() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => r;
  return r;
}
async function call({ query = { mode: 'bounces' }, token = null, method = 'GET' } = {}) {
  const res = mockRes();
  await scan({ method, query, headers: { authorization: 'Bearer ' + (token || process.env.CRON_SECRET) }, body: {} }, res);
  return res;
}
const telegrams = () => io.tg.filter((t) => t.method === 'sendMessage');
const leadWrites = (prefix = 'leads/') => io.writes.filter((w) => w.path.startsWith(prefix));
const sourceFetches = () => io.fetches.filter((f) => f.kind === 'one' && f.query && f.query.source);
const now = Date.now();

// il lead del caso vero: un ordine PAGATO su Madrid, conferma partita
const SVC = 'leads/svc_cs_test_madrid1';
function seedPaidLead(over = {}) {
  put(SVC, {
    name: 'Lucía Fernández', email: CLIENT, phone: '+34612345678', market: 'madrid', sourceRef: 'city-madrid', paid: true,
    kind: 'full-search', amount_eur: 500, status: 'new', city: { key: 'madrid', serviceLabel: 'Full Search', paid: true },
    clientEmailSentAt: '2026-10-25T10:00:05.000Z', createdAt: new Date(now - 3600e3), telegramNotifiedAt: new Date(now - 3500e3), grade: 'A', ...over,
  });
}

realOut('\n▸ 1. la lettura del rimbalzo (pura)');
{
  const P = async (k, cut) => { let raw = VARIANTS[k](); if (cut) raw = raw.subarray(0, cut); return R.parseDsn(await simpleParser(raw)); };
  const real = await P('real');
  const r0 = real.recipients[0] || {};
  ok(real.isDsn && real.recipients.length === 1 && r0.address === CLIENT, 'caso vero: un destinatario, l\'indirizzo del cliente', real.recipients);
  ok(r0.action === 'failed' && r0.status === '5.1.1' && r0.source === 'dsn', 'caso vero: Action failed, Status 5.1.1, dalla parte macchina', r0);
  ok(/does not exist/.test(r0.diagnostic || '') && /unnecessary spaces/.test(r0.diagnostic || ''), 'caso vero: il Diagnostic-Code ripiegato è ricomposto');
  ok(R.classify(r0).kind === 'bad_address' && R.classify(r0).hard === true, 'caso vero: definitivo, indirizzo inesistente');
  ok(real.original && real.original.subject === 'Your Full Search is booked' && real.original.messageId === '<orig-123@example.invalid>', 'caso vero: l\'oggetto e il Message-ID dell\'originale', real.original);
  ok(real.reportingMta === 'googlemail.com', 'caso vero: Reporting-MTA letto senza il tipo «dns;»');
  ok(R.HARD_RE.test(F.REAL_HUMAN) && !R.SOFT_RE.test(F.REAL_HUMAN), 'il testo italiano vero è DEFINITIVO per HARD_RE e non è un ritardo per SOFT_RE');

  const a = await P('a');
  ok(a.recipients[0] && a.recipients[0].source === 'dsn' && a.recipients[0].status === '5.1.1', 'a. parte macchina come allegato (Content-Disposition): letta lo stesso', a.recipients);
  const b = await P('b');
  ok(b.isDsn && b.recipients[0] && b.recipients[0].source === 'x-failed-recipients' && b.recipients[0].status === '5.1.1' && R.classify(b.recipients[0]).hard, 'b. senza parte macchina: X-Failed-Recipients, status dal testo', b.recipients);
  const c = await P('c');
  ok(c.isDsn && c.recipients[0] && c.recipients[0].source === 'human' && c.recipients[0].address === CLIENT && R.classify(c.recipients[0]).kind === 'bad_address', 'c. solo testo umano da un demone: letto e marcato «human»', c.recipients);
  const d = await P('d');
  ok(d.recipients[0] && d.recipients[0].action === 'delayed' && R.classify(d.recipients[0]).hard === false && d.recipients[0].willRetryUntil, 'd. il ritardo (4.4.1, Will-Retry-Until) NON è definitivo', d.recipients);
  const e = await P('e');
  ok(e.recipients.length === 2 && e.recipients.map((r) => R.classify(r).hard).join() === 'true,false' && !e.recipients.some((r) => /fine\.user/.test(r.address)), 'e. tre destinatari: un definitivo, un ritardo, il consegnato fuori', e.recipients.map((r) => r.address));
  const f = await P('f');
  ok(f.recipients[0] && f.recipients[0].address === 'old.address@forward.test' && f.recipients[0].keys.includes('new.address@target.test'), 'f. inoltro: si mostra ciò che abbiamo scritto (Original-Recipient), si cerca anche il Final', f.recipients[0]);
  ok(f.recipients[1] && f.recipients[1].address === 'a+b@x.test' && f.recipients[1].keys.includes('a+2Bb@x.test'), 'f. xtext RFC 3461 decodificato, le due forme come chiavi', f.recipients[1]);
  const g = await P('g');
  ok(g.recipients[0] && g.recipients[0].address === 'postfix.user@example-mail.test' && g.original && g.original.subject === 'La tua visita è confermata', 'g. Postfix: text/rfc822-headers letto per l\'oggetto', g.original);
  const h = await P('h');
  ok(h.recipients[0] && R.classify(h.recipients[0]).kind === 'bad_address', 'h. Exchange 5.4.1 «Recipient address rejected» = indirizzo inesistente');
  const i = await P('i');
  ok(i.recipients[0] && R.classify(i.recipients[0]).kind === 'rejected', 'i. 5.7.1 di politica = rifiutata dal server');
  const j = await P('j');
  ok(!j.isDsn && !j.recipients.length, 'j. una ricevuta di lettura non è un rimbalzo');
  const k = await P('k');
  ok(!k.isDsn && !k.recipients.length, 'k. una risposta fuori sede non è un rimbalzo');
  const l = await P('l');
  ok(l.isDsn && !l.recipients.length && l.reason === 'own_only', 'l. un rimbalzo che parla solo della nostra casella: own_only, nessun destinatario', l);
  const m = await P('m', 262144);
  ok(m.recipients[0] && m.recipients[0].address === CLIENT && m.recipients[0].status === '5.1.1', 'm. sorgente tagliata a 256KB dentro l\'originale: la parte macchina c\'è ancora', m.recipients);
  const n = await P('n');
  ok(n.recipients[0] && n.recipients[0].address === 'globale.user@example-mail.test', 'n. message/global-delivery-status con «utf-8;»', n.recipients);
  const o = await P('o');
  ok(o.original && /<script>/.test(o.original.subject), 'o. l\'oggetto originale arriva com\'è (si escapa nella card, non qui)');
  ok(R.normAddr('rfc822; <A@B.co>') === 'A@B.co' && R.normAddr('rfc822; non un indirizzo') === null && R.emailKey(' A@B.co ') === 'a@b.co', 'normAddr toglie tipo e <>, rifiuta ciò che non è un indirizzo');
  const groups = R.parseFieldGroups('A: 1\r\n  due\r\nA: x\r\n\r\nB: 3');
  ok(groups.length === 2 && groups[0].get('a') === '1 due' && groups[1].get('b') === '3', 'parseFieldGroups: folding, primo valore, gruppi sulla riga vuota');
}

realOut('\n▸ 2. la card e il WhatsApp (puri)');
{
  const raw = VARIANTS.o();
  const dsn = await R.parseDsn(await simpleParser(raw));
  const rec = R.classify(dsn.recipients[0]);
  const lead = { name: 'Lucía Fernández', email: CLIENT, phone: '+34612345678', market: 'madrid', paid: true, kind: 'full-search', amount_eur: 500, city: { serviceLabel: 'Full Search' }, clientEmailSentAt: '2026-10-25T10:00:05.000Z', status: 'new' };
  const card = R.cardText({ items: [{ rec, people: [{ coll: 'leads', id: 'svc_x', doc: lead }], also: [] }], original: dsn.original, reportingMta: dsn.reportingMta, partial: [] });
  ok(card.includes('&lt;script&gt;') && !card.includes('<script>'), 'card: l\'oggetto originale con <script> è escapato');
  ok(/inviata 25\/10 11:00/.test(card), 'card: l\'ora d\'invio in ora di Roma (25/10 dopo il cambio d\'ora: 10:00 UTC = 11:00)', card);
  ok(/Se è la conferma dell'ordine, contiene il recesso/.test(card), 'card: la riga del supporto durevole è CONDIZIONALE («Se è…»), mai un\'affermazione sul flusso');
  ok(/PAGATO Full Search €500/.test(card) && /🇪🇸 Madrid/.test(card), 'card: pagato, piano, importo e desk dal record');
  const wa = R.waTextFor(lead, CLIENT, 'bad_address', 'Your Full Search is booked');
  ok(/^Hi Lucía, Valentino from BOOM/.test(wa) && wa.includes(CLIENT) && !/€|\b\d+ ?eur/i.test(wa), 'WhatsApp città: inglese, firmato Valentino, mai un prezzo', wa);
  ok(!/does not exist|550/.test(wa), 'WhatsApp: mai il testo diagnostico del server');
  const fr = R.waTextFor({ name: 'Jean Payet', market: 'reunion' }, 'x@y.re', 'bad_address');
  ok(/^Bonjour Jean, ici l'équipe BOOM/.test(fr) && !/Valentino/.test(fr), 'WhatsApp Réunion: francese, senza firma');
  const owner = R.waTextFor({ name: 'Giulia Rossi', leadType: 'landlord', source: 'web' }, 'g@r.it', 'mailbox_full');
  ok(/^Buongiorno Giulia, sono Valentino di BOOM — Egidi Immobiliare/.test(owner) && /Le ho inviato/.test(owner) && /non è stato possibile consegnarla/.test(owner), 'WhatsApp proprietario: Lei, Egidi, e per una casella piena «non consegnata» (non «inesistente»)');
  const it = R.waTextFor({ name: 'Marco', message: 'Ciao, cerco un appartamento in affitto a Roma, grazie' }, 'm@x.it', 'bad_address');
  ok(/^Ciao Marco, sono Valentino di BOOM/.test(it), 'WhatsApp Roma: la lingua delle SUE parole (italiano)');
  const sum = R.summaryText({ items: [{ rec, people: [{ coll: 'leads', id: 'svc_x', doc: lead }], also: [] }], reportingMta: dsn.reportingMta });
  ok(sum.length <= 600 && sum.includes(CLIENT) && sum.includes('leads/svc_x'), 'riassunto della notifica: testo semplice ≤600 con indirizzo e record');
}

realOut('\n▸ 3. il giro vero: il caso del cliente pagante (Madrid)');
let REAL_ID;
{
  reset();
  seedPaidLead();
  const raw = VARIANTS.real();
  REAL_ID = dsnIdOf(raw);
  addRow(101, raw);
  const res = await call();
  const lead = get(SVC);
  const eb = (lead && lead.emailBounce) || {};
  ok(res.statusCode === 200 && res.body.ok === true && res.body.mode === 'bounces', 'giro: 200, ok, mode bounces', res.body);
  ok(eb.status === '5.1.1' && eb.kind === 'bad_address' && eb.hard === true && eb.dsnId === REAL_ID && eb.addressKey === CLIENT, 'lead segnato: emailBounce {5.1.1, bad_address, definitivo, dsnId}', eb);
  ok(lead.emailBouncedAfterConfirmationAt && lead.emailBouncedAt && lead.emailBounceCount === 1 && !('clientEmailBouncedAt' in lead),
    'lead: emailBouncedAfterConfirmationAt (un fatto di tempo, MAI «la conferma è rimbalzata»), emailBouncedAt, conteggio 1', lead);
  ok(lead.email === CLIENT && lead.status === 'new' && lead.grade === 'A' && lead.telegramNotifiedAt, 'lead: email, stato, voto e notifica INTATTI');
  ok(eb.originalSubject === 'Your Full Search is booked' && eb.source === 'dsn', 'lead: l\'oggetto dell\'originale e la fonte dichiarata');
  const n = get('agentNotifications/bounce-' + REAL_ID) || {};
  ok(n.priority === 'urgent' && n.telegramDelivery === 'sent' && n.telegramMessageId && n.type === 'email.bounced' && n.status === 'pending', 'notifica: urgente (pagante), consegnata, una sola', n);
  const tg = telegrams();
  ok(tg.length === 1, 'UNA card Telegram', tg.length);
  const t = (tg[0] && tg[0].body) || {};
  ok(/indirizzo inesistente/.test(t.text) && t.text.includes(CLIENT) && t.text.includes('«Your Full Search is booked»'), 'card: «indirizzo inesistente», l\'indirizzo, l\'oggetto originale', t.text);
  ok(t.text.includes('<code>leads/svc_cs_test_madrid1</code>') && /\+34612345678/.test(t.text) && /conferma inviata/.test(t.text), 'card: il record, il telefono, la conferma inviata');
  const btn = ((t.reply_markup && t.reply_markup.inline_keyboard) || []).flat();
  const wa = btn.find((b) => /^https:\/\/wa\.me\//.test(b.url || ''));
  ok(wa && wa.url.startsWith('https://wa.me/34612345678?text=') && /Hi Lucía/.test(decodeURIComponent(wa.url.split('text=')[1])), 'card: il WhatsApp col numero del desk e il messaggio pronto', wa);
  ok(btn.some((b) => b.url === 'https://www.boomrome.com/portal#leads'), 'card: il tasto Portale');
  const mem = get(R.MEM_DOC) || {};
  ok(mem.seen && mem.seen[REAL_ID] && mem.seen[REAL_ID].outcome === 'alerted', 'memoria: il rimbalzo è ricordato «alerted»', mem.seen);
  const h = get('pfsRadarHealth/' + R.HEALTH_SOURCE) || {};
  ok(h.ok === true && h.stats && h.stats.alerted === 1, 'battito: pfsRadarHealth/leads-bounces ok', h);
  ok(io.locks.length === 1 && io.locks[0].folder === '[Gmail]/All Mail' && io.locks[0].options.readOnly === true, 'casella: Tutti i messaggi (l\'unica \\All), in sola lettura', io.locks);
  ok(sourceFetches().length === 1 && sourceFetches()[0].query.source.maxLength === 262144, 'download parziale: maxLength 262144', sourceFetches());
  const sq = io.searches[0] && io.searches[0].query;
  ok(sq && sq.since instanceof Date && now - sq.since.getTime() > 2.9 * 86400e3 && sq.or.length === 9, 'UNA ricerca: since 3 giorni, nove termini in OR', sq);
  ok(io.options[0] && io.options[0].host === 'imap.gmail.com' && io.options[0].auth.user === OPERATOR, 'la casella che SPEDISCE (GMAIL_USER), non quella degli alert PFS');
  ok(io.forbidden.length === 0, 'nessuna rete fuori da Firestore e Telegram (zero Anthropic)', io.forbidden);
  const act = [...io.db.entries()].filter(([p]) => p.startsWith('activityLog/')).map(([p]) => get(p));
  ok(act.length === 1 && act[0].action === 'email_bounced' && !JSON.stringify(act[0]).includes('@'), 'activityLog: email_bounced, senza indirizzo', act);
  ok(!JSON.stringify(res.body).includes('@') && !JSON.stringify(res.body).includes('Lucía'), 'la risposta HTTP non porta indirizzi né nomi', res.body);

  // 2. il secondo giro non scarica, non scrive, non avvisa
  const tgBefore = telegrams().length, srcBefore = sourceFetches().length, wBefore = leadWrites().length;
  const res2 = await call();
  ok(res2.body.stats.alreadySeen === 1 && sourceFetches().length === srcBefore && telegrams().length === tgBefore && leadWrites().length === wBefore, 'secondo giro: già visto → zero download, zero Telegram, zero scritture sul lead', res2.body.stats);

  // 3. memoria persa: il 409 della notifica e il dsnId del lead tengono
  io.db.delete(R.MEM_DOC);
  const res3 = await call();
  const lead3 = get(SVC);
  ok(telegrams().length === tgBefore && lead3.emailBounceCount === 1 && res3.body.stats.alerted === 0, 'memoria cancellata: nessuna seconda card, il lead non si riconta', { tg: telegrams().length, count: lead3.emailBounceCount, stats: res3.body.stats });
}

realOut('\n▸ 4. due giri insieme: un avviso');
{
  reset();
  seedPaidLead();
  addRow(101, VARIANTS.real());
  const [a, b] = await Promise.all([call(), call()]);
  ok(telegrams().length === 1, 'due run concorrenti: esattamente UNA card', telegrams().length);
  ok(get(SVC).emailBounceCount === 1 && a.statusCode === 200 && b.statusCode === 200, 'due run concorrenti: il lead contato una volta', get(SVC).emailBounceCount);
}

realOut('\n▸ 5. Telegram giù: la card riparte DA QUI al giro dopo, mai il riassunto di notify-pending');
{
  reset();
  seedPaidLead();
  addRow(101, VARIANTS.real());
  io.tgFail = true;
  const res = await call();
  const n = get('agentNotifications/bounce-' + REAL_ID) || {};
  ok(n.telegramDelivery === 'failed' && n.telegramNotifiedAt && n.lastFailCode, 'invio fallito: il claim RESTA (telegramNotifiedAt pieno, failed, col codice)', n);
  ok(!((get(R.MEM_DOC) || {}).seen || {})[REAL_ID], 'invio fallito: il rimbalzo NON si ricorda (il giro dopo lo riprende)');
  ok(res.statusCode === 500 && res.body.ok === false && res.body.error === 'telegram_failed' && res.body.stats.notifyFailed === 1,
    'invio fallito: il giro è un guasto (battito rosso «telegram_failed»), mai un ok', res.body);
  ok((get('pfsRadarHealth/' + R.HEALTH_SOURCE) || {}).ok === false, 'battito leads-bounces: ok:false');
  io.tgFail = false;
  io.tg = [];
  const r2 = mockRes();
  await notifyPending({ method: 'GET', headers: { authorization: 'Bearer ' + process.env.CRON_SECRET }, query: {} }, r2);
  ok(telegrams().filter((t) => /email\.bounced/.test(t.body.text || '')).length === 0, 'notify-pending VERO non manda il riassunto generico (il claim è nostro)', telegrams().map((t) => (t.body.text || '').slice(0, 80)));
  const r3 = await call();
  const tg3 = telegrams();
  const n3 = get('agentNotifications/bounce-' + REAL_ID) || {};
  ok(tg3.length === 1 && /indirizzo inesistente/.test(tg3[0].body.text) && /wa\.me\/34612345678/.test(JSON.stringify(tg3[0].body.reply_markup)),
    'Telegram tornato: il giro dopo manda LA card (con il WhatsApp), una volta', tg3.map((t) => (t.body.text || '').slice(0, 80)));
  ok(n3.telegramDelivery === 'sent' && n3.attempts === 2 && r3.body.ok === true && ((get(R.MEM_DOC) || {}).seen || {})[REAL_ID],
    'claim ripreso: sent, secondo tentativo, rimbalzo ricordato, battito ok', { n3, body: r3.body });
  ok(get(SVC).emailBounceCount === 1, 'il lead non si riconta al secondo giro (dsnId già segnato)');
  await call();
  ok(telegrams().length === 1, 'il giro dopo ancora: niente');
}

realOut('\n▸ 5b. Telegram giù con 50 notifiche più vecchie in coda: la card arriva comunque');
{
  // notify-pending legge status=='pending' limit 50 SENZA ordine: con 50
  // notifiche più vecchie davanti (già consegnate, ma ancora 'pending' per il
  // demone del Mac) un riassunto delegato a lui non partirebbe mai.
  reset();
  seedPaidLead();
  for (let i = 0; i < 50; i++) put('agentNotifications/A' + String(i).padStart(19, '0'), { type: 'lead.new', priority: 'high', status: 'pending', summary: 'old', telegramNotifiedAt: new Date(now - 86400e3), createdAt: new Date(now - 86400e3).toISOString() });
  addRow(101, VARIANTS.real());
  io.tgFail = true;
  await call();
  io.tgFail = false; io.tg = [];
  for (let k = 0; k < 3; k++) { const r = mockRes(); await notifyPending({ method: 'GET', headers: { authorization: 'Bearer ' + process.env.CRON_SECRET }, query: {} }, r); }
  await call();
  const cards = telegrams().filter((t) => /Email non recapitata/.test(t.body.text || ''));
  ok(cards.length === 1, 'cinquanta notifiche davanti: la card la manda il giro dei rimbalzi, una volta', telegrams().map((t) => (t.body.text || '').slice(0, 60)));
}

realOut('\n▸ 6. il claim orfano (la funzione è morta fra il claim e l\'invio)');
{
  reset();
  seedPaidLead();
  addRow(101, VARIANTS.real());
  put('agentNotifications/bounce-' + REAL_ID, { type: 'email.bounced', priority: 'urgent', status: 'pending', summary: 'x', telegramNotifiedAt: new Date(now - 300e3), telegramDelivery: 'sending', claimedAt: new Date(now - 300e3).toISOString(), createdAt: new Date(now - 300e3).toISOString(), attempts: 1 });
  await call();
  const n6 = get('agentNotifications/bounce-' + REAL_ID) || {};
  ok(n6.telegramDelivery === 'sent' && n6.attempts === 2 && telegrams().length === 1, 'claim orfano di 5 minuti: ripreso e consegnato da qui, UNA card', { n6, tg: telegrams().length });
  // un claim fresco (un altro run in volo) non si tocca, e il rimbalzo non si
  // ricorda finché quel run non ha detto com'è andata
  reset();
  seedPaidLead();
  addRow(101, VARIANTS.real());
  put('agentNotifications/bounce-' + REAL_ID, { type: 'email.bounced', priority: 'urgent', status: 'pending', summary: 'x', telegramNotifiedAt: new Date(), telegramDelivery: 'sending', claimedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
  const rf = await call();
  ok((get('agentNotifications/bounce-' + REAL_ID) || {}).telegramDelivery === 'sending' && telegrams().length === 0 && !((get(R.MEM_DOC) || {}).seen || {})[REAL_ID] && rf.body.stats.inFlight === 1,
    'claim fresco: lasciato a chi lo tiene, rimbalzo NON ricordato (si ricontrolla)', rf.body.stats);
  const doc = io.db.get('agentNotifications/bounce-' + REAL_ID);
  doc.fields.telegramDelivery = { stringValue: 'sent' }; doc.fields.telegramMessageId = { integerValue: '99' };
  await call();
  ok(telegrams().length === 0 && (((get(R.MEM_DOC) || {}).seen || {})[REAL_ID] || {}).outcome === 'alerted', 'quando l\'altro run l\'ha consegnata: ricordato «alerted», nessuna seconda card');
}

realOut('\n▸ 7-8. il ritardo non sveglia nessuno, e non declassa un definitivo');
{
  reset();
  put('leads/rome1', { name: 'Marco Bianchi', email: CLIENT, phone: '3331234567', status: 'new', source: 'idealista', createdAt: new Date(now - 86400e3) });
  addRow(201, VARIANTS.d());
  const res = await call();
  const l = get('leads/rome1');
  ok(l.emailBounce && l.emailBounce.hard === false && l.emailBounce.kind === 'delayed' && l.emailDelayedAt && !l.emailBouncedAt, 'ritardo: segnato come ritardo (emailDelayedAt), non come rimbalzo', l.emailBounce);
  ok(telegrams().length === 0 && ![...io.db.keys()].some((p) => p.startsWith('agentNotifications/')), 'ritardo: nessuna card, nessuna notifica', telegrams().length);
  ok(res.body.preview.some((p) => p.outcome === 'flagged_soft'), 'ritardo: esito flagged_soft');
  // poi il definitivo: avviso
  addRow(202, VARIANTS.real());
  await call();
  const l2 = get('leads/rome1');
  ok(l2.emailBounce.hard === true && l2.emailBounceCount === 1 && telegrams().length === 1, 'ritardo poi definitivo: il definitivo vince e avvisa', { eb: l2.emailBounce, tg: telegrams().length });
  ok(/393331234567/.test(JSON.stringify(telegrams()[0].body.reply_markup)), 'Roma: il numero nazionale diventa 39… (la regola della card dei lead)');

  // definitivo poi ritardo: nessun declassamento
  reset();
  put('leads/rome1', { name: 'Marco Bianchi', email: CLIENT, phone: '3331234567', status: 'new', source: 'idealista', createdAt: new Date(now - 86400e3) });
  addRow(301, VARIANTS.real());
  await call();
  addRow(302, VARIANTS.d());
  await call();
  const l3 = get('leads/rome1');
  ok(l3.emailBounce.hard === true && l3.emailBounce.dsnId === REAL_ID && !l3.emailDelayedAt && l3.emailBounceCount === 1, 'definitivo poi ritardo: resta definitivo (mai un declassamento)', l3.emailBounce);
}

realOut('\n▸ 9. nessun record: nessuna scrittura, ma una riga d\'avviso');
{
  reset();
  addRow(401, VARIANTS.real());
  const res = await call();
  ok(leadWrites().length === 0 && leadWrites('pfsClients/').length === 0 && leadWrites('activityLog/').length === 0, 'nessun lead/cliente: nessuna scrittura sui record', io.writes);
  ok(res.body.stats.unmatched === 1 && res.body.preview[0].outcome === 'unmatched', 'stats.unmatched = 1, esito unmatched', res.body);
  const tg = telegrams();
  ok(tg.length === 1 && /Nessun lead o cliente BOOM con questo indirizzo/.test(tg[0].body.text) && tg[0].body.text.includes(CLIENT), 'UNA riga d\'avviso: l\'indirizzo e «nessun record»', tg.map((t) => t.body.text));
  ok(!JSON.stringify(tg[0].body.reply_markup).includes('wa.me') && (get('agentNotifications/bounce-' + REAL_ID) || {}).priority === 'high', 'senza numero nessun WhatsApp; priorità alta, non urgente');
  ok(((get(R.MEM_DOC) || {}).seen || {})[REAL_ID], 'la memoria ricorda il rimbalzo');
}

realOut('\n▸ 10-11. cliente PFS, e gli altri archivi elencati');
{
  reset();
  put('pfsClients/pfs1', { name: 'Marta Bianchi', email: CLIENT, phone: '3331234567', portalAccessCode: 'BM-7K2Q', amount_paid: 35000, status: 'paid', created_at: new Date(now - 7200e3).toISOString() });
  addRow(501, VARIANTS.real());
  await call();
  const p = get('pfsClients/pfs1');
  ok(p.emailBounce && p.emailBounce.hard === true && p.email === CLIENT, 'cliente PFS segnato, email intatta', p.emailBounce);
  const t = (telegrams()[0] || { body: {} }).body;
  ok(/BM-7K2Q/.test(t.text) && /Se era la conferma PFS/.test(t.text) && /PAGATO Property Finding €350/.test(t.text), 'card PFS: il codice portale (condizionale) e il pagato', t.text);
  ok((get('agentNotifications/bounce-' + REAL_ID) || {}).priority === 'urgent' && /wa\.me\/393331234567/.test(JSON.stringify(t.reply_markup)), 'PFS = pagante: urgente; WhatsApp col numero');

  reset();
  put('leads/rome2', { name: 'Anna Verdi', email: CLIENT, status: 'contacted', source: 'web', createdAt: new Date(now - 86400e3) });
  put('preAgreements/pa1', { ref: 'BOOM-ABC123', status: 'sent', tenant: { email: CLIENT, name: 'Anna Verdi' } });
  put('viewingRequests/v1', { email: CLIENT, clientEmail: CLIENT, proposedDateTime: '2026-10-28T09:00:00.000Z', status: 'pending' });
  const before = JSON.stringify([get('preAgreements/pa1'), get('viewingRequests/v1')]);
  addRow(601, VARIANTS.real());
  await call();
  const tx = (telegrams()[0] || { body: {} }).body.text || '';
  ok(/Anche in: proposta BOOM-ABC123 \(inquilino\) · visita 28\/10/.test(tx), 'card: «Anche in» proposta e visita', tx);
  ok(JSON.stringify([get('preAgreements/pa1'), get('viewingRequests/v1')]) === before && !io.writes.some((w) => /^(preAgreements|viewingRequests)\//.test(w.path)), 'proposta e visita: elencate, MAI scritte');
}

realOut('\n▸ 12-13. maiuscole diverse; un lead cancellato non rinasce');
{
  reset();
  put('leads/mixed1', { name: 'Ola Nowak', email: 'Client.Typo@Example-Mail.test', status: 'new', source: 'web', createdAt: new Date(now - 2 * 86400e3) });
  addRow(701, VARIANTS.real());
  const res = await call();
  ok((get('leads/mixed1').emailBounce || {}).hard === true && res.body.stats.matched === 1, 'email salvata con maiuscole: trovata dalla lettura degli ultimi 45 giorni', res.body.stats);
  ok(io.queries.some((q) => q.coll === 'leads' && q.field === 'createdAt' && q.op === 'GREATER_THAN_OR_EQUAL'), 'il ripiego legge i lead per createdAt (timestamp e stringa)');

  reset();
  put('leads/gone1', { name: 'Tom Lee', email: CLIENT, status: 'new', source: 'web', createdAt: new Date(now - 86400e3) });
  io.beforeWrite = async (p) => { if (p === 'leads/gone1') { io.db.delete(p); io.beforeWrite = null; } };
  addRow(801, VARIANTS.real());
  const rg = await call();
  ok(!io.db.has('leads/gone1'), 'lead cancellato fra la lettura e la scrittura: NESSUN documento fantasma', get('leads/gone1'));
  const tg = (telegrams()[0] || { body: {} }).body.text || '';
  ok(rg.body.ok === true && !tg.includes('leads/gone1') && /Nessun lead o cliente/.test(tg) && ((get(R.MEM_DOC) || {}).seen || {})[REAL_ID], 'il lead sparito non è un guasto e non finisce nella card (che dice «nessun record»)', { ok: rg.body.ok, tg });
}

realOut('\n▸ tempesta di rimbalzi senza record (backscatter): al massimo 5 righe al giorno');
{
  reset();
  for (let n = 1; n <= 7; n++) {
    addRow(2000 + n, F.dsnMessage({ messageId: `<storm-${n}@mx.google.com>`, machine: [
      'Reporting-MTA: dns; googlemail.com', '', `Final-Recipient: rfc822; nobody${n}@spam.example.test`, 'Action: failed', 'Status: 5.1.1', '',
    ].join('\r\n') }));
  }
  const r = await call();
  const outs = r.body.preview.map((p) => p.outcome);
  ok(telegrams().length === 5 && outs.filter((o) => o === 'unmatched').length === 5 && outs.filter((o) => o === 'unmatched_capped').length === 2, 'sette rimbalzi orfani: cinque righe, due ricordati in silenzio', outs);
  const mem = get(R.MEM_DOC) || {};
  ok(mem.unmatchedCards && mem.unmatchedCards.n === 5 && Object.keys(mem.seen || {}).length === 7, 'il tetto del giorno resta in memoria', mem.unmatchedCards);
  // un rimbalzo CON record passa anche a tetto pieno
  put('leads/real1', { name: 'Vera Paganti', email: CLIENT, phone: '+34612345678', paid: true, market: 'madrid', status: 'new', createdAt: new Date(now - 3600e3) });
  addRow(2100, VARIANTS.real());
  await call();
  ok(telegrams().length === 6 && /Vera Paganti/.test(telegrams()[5].body.text), 'a tetto pieno, un rimbalzo di un cliente vero avvisa comunque');
}

realOut('\n▸ 14-15. la porta: senza Anthropic, ruoli, risposta pulita');
{
  reset();
  seedPaidLead();
  addRow(901, VARIANTS.real());
  const r = await call();
  ok(r.statusCode === 200 && telegrams().length === 1, 'senza ANTHROPIC_API_KEY il modo rimbalzi gira lo stesso');
  const clientsBefore = io.clients.length, getsBefore = io.queries.length;
  const d = await call({ query: {} });
  ok(d.body && d.body.error === 'anthropic_key_missing' && io.clients.length === clientsBefore && io.queries.length === getsBefore, 'il modo predefinito resta com\'era e non fa nulla dei rimbalzi', d.body);
  const ll = await call({ token: 'valid-landlord' });
  ok(ll.statusCode === 403, 'un landlord: 403 (la casella globale è dell\'admin)', ll.body);
  const ad = await call({ token: 'valid-admin' });
  ok(ad.statusCode === 200 && !JSON.stringify(ad.body).includes('@'), 'admin: 200, nessun «@» nella risposta', ad.body);
  const no = await call({ token: 'garbage' });
  ok(no.statusCode === 401, 'senza credenziali: 401');
  const dry = (reset(), seedPaidLead(), addRow(902, VARIANTS.real()), await call({ query: { mode: 'bounces', dry: '1' } }));
  ok(dry.body.dry === true && telegrams().length === 0 && io.writes.length === 0 && dry.body.preview[0].outcome === 'would_alert', '?dry=1: legge e cerca, non scrive e non avvisa', { writes: io.writes, preview: dry.body.preview });
}

realOut('\n▸ 17-18. IMAP appeso; la cartella');
{
  reset();
  addRow(1001, VARIANTS.real());
  io.hang = 'search';
  const realST = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => realST(fn, ms >= 5000 ? 5 : ms, ...a);
  const t0 = Date.now();
  let res;
  try { res = await call(); } finally { globalThis.setTimeout = realST; }
  const h = get('pfsRadarHealth/' + R.HEALTH_SOURCE) || {};
  ok(Date.now() - t0 < 5000 && res.statusCode === 500 && h.ok === false && h.lastError === 'imap_timeout', 'ricerca appesa: esce entro il budget, battito ok:false «imap_timeout»', { ms: Date.now() - t0, h });
  ok(!io.db.has(R.MEM_DOC) && io.closed >= 1, 'ricerca appesa: niente ricordato, socket chiuso');

  reset();
  io.folders = [{ path: 'INBOX', specialUse: '\\Inbox', flags: new Set() }];
  await call();
  ok(io.locks[0] && io.locks[0].folder === 'INBOX' && io.locks[0].options.readOnly === true, 'senza \\All: INBOX, in sola lettura');
  reset();
  io.folders = [{ path: 'A', specialUse: '\\All', flags: new Set() }, { path: 'B', specialUse: '\\All', flags: new Set() }];
  await call();
  ok(io.locks[0] && io.locks[0].folder === 'INBOX', 'due \\All: non si indovina, INBOX');
}

realOut('\n▸ 19-20. non un rimbalzo; lead morto; lo stesso indirizzo in 24 ore');
{
  reset();
  put('leads/sender1', { name: 'Pia', email: CLIENT, status: 'new', source: 'web', createdAt: new Date(now - 86400e3) });
  addRow(1101, F.plainMessage({ from: `Pia <${CLIENT}>`, subject: 'Re: failure notice', text: 'Ciao, ho visto il messaggio, ti scrivo domani.', messageId: '<client-1101@example-mail.test>' }));
  const r = await call();
  ok(r.body.preview[0] && r.body.preview[0].outcome === 'not_dsn' && !get('leads/sender1').emailBounce && telegrams().length === 0, 'un\'email di un cliente intitolata «failure notice»: not_dsn, nessun segno', r.body.preview);

  reset();
  put('leads/dead1', { name: 'Bot', email: CLIENT, status: 'archived', grade: 'dead', source: 'web', createdAt: new Date(now - 86400e3) });
  addRow(1201, VARIANTS.real());
  const r2 = await call();
  ok(r2.body.preview[0].outcome === 'quiet_dead' && telegrams().length === 0 && (get('leads/dead1').emailBounce || {}).hard === true, 'lead morto: segnato, ma nessuna card (quiet_dead)', r2.body.preview);

  reset();
  put('leads/live1', { name: 'Eva Ruiz', email: CLIENT, phone: '+34612345678', status: 'new', source: 'web', createdAt: new Date(now - 86400e3) });
  addRow(1301, VARIANTS.real());
  await call();
  const second = F.dsnMessage({ messageId: '<dsn-second@mx.google.com>' });
  addRow(1302, second);
  const r3 = await call();
  ok(telegrams().length === 1 && r3.body.preview.some((p) => p.outcome === 'quiet_repeat') && get('leads/live1').emailBounceCount === 2, 'secondo rimbalzo dello stesso indirizzo in 24 ore: segnato (conteggio 2), nessuna seconda card', { tg: telegrams().length, preview: r3.body.preview });
}

realOut('\n▸ più destinatari, inoltro');
{
  reset();
  put('leads/gone', { name: 'Gina', email: 'gone.user@example-mail.test', phone: '3337654321', status: 'new', source: 'web', createdAt: new Date(now - 86400e3) });
  put('leads/full', { name: 'Fabio', email: 'full.box@example-mail.test', status: 'new', source: 'web', createdAt: new Date(now - 86400e3) });
  put('leads/fine', { name: 'Fede', email: 'fine.user@example-mail.test', status: 'new', source: 'web', createdAt: new Date(now - 86400e3) });
  addRow(1401, VARIANTS.e());
  await call();
  const tx = (telegrams()[0] || { body: {} }).body.text || '';
  ok(telegrams().length === 1 && tx.includes('gone.user@example-mail.test') && !tx.includes('full.box@') && !tx.includes('fine.user@'), 'più destinatari: la card nomina SOLO il definitivo', tx);
  ok(get('leads/gone').emailBounce.hard === true && get('leads/full').emailBounce.hard === false && !get('leads/fine').emailBounce, 'definitivo segnato, ritardo segnato come ritardo, consegnato intatto');

  reset();
  put('leads/fwd', { name: 'Olga', email: 'old.address@forward.test', status: 'new', source: 'web', createdAt: new Date(now - 86400e3) });
  addRow(1501, VARIANTS.f());
  await call();
  ok((get('leads/fwd').emailBounce || {}).hard === true, 'inoltro: il lead col vecchio indirizzo (Original-Recipient) è trovato');
  ok(io.queries.some((q) => q.coll === 'users' && q.field === 'email') && io.queries.some((q) => q.coll === 'contracts' && q.field === 'tenantEmail') && io.queries.some((q) => q.coll === 'preAgreements' && q.field === 'tenant.email'), 'si cerca anche in utenti, contratti, proposte');
}

realOut('\n▸ un archivio non letto: detto, non nascosto');
{
  reset();
  seedPaidLead();
  addRow(1601, VARIANTS.real());
  io.failQuery = (coll) => coll === 'contracts';
  const r = await call();
  const tx = (telegrams()[0] || { body: {} }).body.text || '';
  ok(telegrams().length === 1 && /Non letti \(errore\): contracts/.test(tx), 'contratti illeggibili: la card lo dice', tx);
  reset();
  seedPaidLead();
  addRow(1602, VARIANTS.real());
  io.failQuery = (coll) => coll === 'leads';
  const r2 = await call();
  ok(telegrams().length === 0 && !(get(R.MEM_DOC) || { seen: {} }).seen[REAL_ID] && r2.body.stats.errors === 1 && r2.body.ok === false, 'lead illeggibili: niente avviso, niente memoria, si riprova al giro dopo', r2.body.stats);
}

realOut('\n▸ la regola del numero WhatsApp = quella della card dei lead (notify-pending VERO)');
{
  reset();
  const cases = [
    { id: 'p1', name: 'Rocco Uno', phone: '3331234567' },
    { id: 'p2', name: 'Rita Due', phone: '+39 333 765 4321' },
    { id: 'p3', name: 'Joost Drie', phone: '06 12345678', market: 'amsterdam', sourceRef: 'city-amsterdam' },
    { id: 'p4', name: 'Pablo Cuatro', phone: '612 345 678', market: 'madrid', sourceRef: 'city-madrid' },
    { id: 'p5', name: 'Italo Cinque', phone: '333 1112223', market: 'amsterdam', sourceRef: 'city-amsterdam' },
  ];
  for (const c of cases) put('leads/' + c.id, { ...c, email: c.id + '@example.test', status: 'new', grade: 'A', source: 'web', createdAt: new Date(now - 600e3) });
  const r = mockRes();
  await notifyPending({ method: 'GET', headers: { authorization: 'Bearer ' + process.env.CRON_SECRET }, query: {} }, r);
  let same = 0;
  const diffs = [];
  for (const c of cases) {
    const card = telegrams().find((t) => (t.body.text || '').includes(c.name));
    const url = card && JSON.stringify(card.body.reply_markup).match(/wa\.me\/(\d+)/);
    const theirs = url ? url[1] : null;
    if (theirs && theirs === R.leadWaNumber({ ...c })) same++; else diffs.push({ c: c.id, theirs, ours: R.leadWaNumber({ ...c }) });
  }
  ok(same === cases.length, 'cinque forme del numero: stesso wa.me della card di notify-pending', diffs);
}

realOut('\n▸ 21. l\'indirizzo è solo in un contratto (invito Magic Sign, benvenuto): NON è un orfano');
{
  reset();
  put('contracts/c1', { tenantName: 'Ines Costa', tenantEmail: CLIENT, tenantPhone: '+351912345678', status: 'active', propertyId: 'p1' });
  addRow(101, VARIANTS.real());
  const res = await call();
  const t = (telegrams()[0] || { body: {} }).body;
  const n = get('agentNotifications/bounce-' + REAL_ID) || {};
  ok(res.body.preview[0] && res.body.preview[0].outcome === 'alerted' && res.body.stats.unmatched === 0 && res.body.stats.matched === 1,
    'contratto: esito «alerted», non «unmatched»; stats.matched 1', { preview: res.body.preview, stats: res.body.stats });
  ok(n.priority === 'urgent' && (n.refs || []).some((r) => r.collection === 'contracts' && r.id === 'c1'), 'contratto: priorità URGENTE, il contratto nei riferimenti', n);
  ok(!/Nessun lead o cliente BOOM con questo indirizzo/.test(t.text || '') && /Nessun lead o cliente PFS con questo indirizzo, ma è in:/.test(t.text || '')
    && /Ines Costa/.test(t.text || '') && /contratto \(inquilino\)/.test(t.text || '') && /<code>contracts\/c1<\/code>/.test(t.text || ''),
    'card: mai «nessun record» — chi è, in quale contratto', t.text);
  ok(/correggilo dove è salvato \(contratto, proposta o profilo\)/.test(t.text || '') && /Se era l'invito alla firma o il benvenuto/.test(t.text || ''), 'card: cosa fare su un contratto (condizionale sul flusso)', t.text);
  const btn = ((t.reply_markup && t.reply_markup.inline_keyboard) || []).flat();
  const wa = btn.find((b) => /^https:\/\/wa\.me\//.test(b.url || ''));
  ok(wa && wa.url.startsWith('https://wa.me/351912345678?text=') && /^Hi Ines, Valentino from BOOM/.test(decodeURIComponent(wa.url.split('text=')[1])),
    'card: il WhatsApp col numero del CONTRATTO, in inglese', wa);
  ok(btn.some((b) => b.url === 'https://www.boomrome.com/portal#contracts'), 'card: il Portale apre i contratti');
  ok(((get(R.MEM_DOC) || {}).unmatchedCards || { n: 0 }).n === 0, 'il tetto degli orfani NON si consuma');
  ok(leadWrites('contracts/').length === 0, 'il contratto è elencato, MAI scritto');

  // dopo cinque orfani nello stesso giorno, l'inquilino del contratto avvisa comunque
  reset();
  for (let k = 1; k <= 5; k++) addRow(2000 + k, F.dsnMessage({ messageId: `<storm-${k}@mx.google.com>`, machine: ['Reporting-MTA: dns; googlemail.com', '', `Final-Recipient: rfc822; nobody${k}@spam.example.test`, 'Action: failed', 'Status: 5.1.1', ''].join('\r\n') }));
  await call();
  put('contracts/c1', { tenantName: 'Ines Costa', tenantEmail: CLIENT, tenantPhone: '+351912345678', status: 'active', propertyId: 'p1' });
  addRow(2100, VARIANTS.real());
  const before = telegrams().length;
  const r2 = await call();
  ok(telegrams().length === before + 1 && /Ines Costa/.test(telegrams()[before].body.text) && r2.body.preview.some((p) => p.outcome === 'alerted'),
    'a tetto orfani pieno: il rimbalzo del contratto avvisa lo stesso', r2.body.preview);

  // il proprietario in un profilo (users role landlord): urgente, WhatsApp col Lei
  reset();
  put('users/ll9', { role: 'landlord', name: 'Giulia Rossi', email: CLIENT, phone: '3331234567' });
  addRow(101, VARIANTS.real());
  await call();
  const t3 = (telegrams()[0] || { body: {} }).body;
  const wa3 = ((t3.reply_markup && t3.reply_markup.inline_keyboard) || []).flat().find((b) => /wa\.me/.test(b.url || ''));
  ok((get('agentNotifications/bounce-' + REAL_ID) || {}).priority === 'urgent' && wa3 && wa3.url.startsWith('https://wa.me/393331234567?text=')
    && /^Buongiorno Giulia, sono Valentino di BOOM — Egidi Immobiliare/.test(decodeURIComponent(wa3.url.split('text=')[1])),
    'proprietario (profilo): urgente, WhatsApp italiano col Lei', { wa3, p: (get('agentNotifications/bounce-' + REAL_ID) || {}).priority });

  // una ricerca salvata e basta: elencata, priorità alta (non un atto)
  reset();
  put('savedSearches/s1', { email: CLIENT, status: 'active' });
  addRow(101, VARIANTS.real());
  const r4 = await call();
  ok((get('agentNotifications/bounce-' + REAL_ID) || {}).priority === 'high' && r4.body.preview[0].outcome === 'alerted' && /ricerca salvata/.test((telegrams()[0] || { body: {} }).body.text || ''),
    'solo una ricerca salvata: elencata, priorità alta, non un orfano', r4.body.preview);
  ok(/co-conduttori dei contratti non si cercano/.test(R.cardText({ items: [{ rec: { address: CLIENT, kind: 'bad_address', status: '5.1.1' }, people: [], also: [] }], partial: [] })),
    'la card dell\'orfano dichiara ciò che NON si cerca (i co-conduttori)');
}

realOut('\n▸ 22. un cliente PFS non è pagante perché esiste');
{
  reset();
  put('pfsClients/pfsLead', { name: 'Paolo Prospect', email: CLIENT, phone: '3331234567', stage: 'lead', service: 'PFS', source: 'website', createdAt: new Date(now - 3600e3) });
  addRow(101, VARIANTS.real());
  await call();
  const t = (telegrams()[0] || { body: {} }).body.text || '';
  ok((get('agentNotifications/bounce-' + REAL_ID) || {}).priority === 'high', 'prospect PFS in fase «lead»: priorità alta, non urgente');
  ok(!/PAGATO/.test(t) && /fase «lead» · nessun pagamento registrato/.test(t), 'card: mai «PAGATO» senza una prova; la fase e «nessun pagamento registrato»', t);
  ok(R.pfsPaidProof({ status: 'paid' }) === 'status' && R.pfsPaidProof({ amount_paid: 35000 }) === 'amount' && R.pfsPaidProof({ paid_at: '2026-10-01' }) === 'paid_at'
    && R.pfsPaidProof({ stage: 'searching' }) === 'stage' && R.pfsPaidProof({ stage: 'qualified' }) === null && R.pfsPaidProof({}) === null,
    'pfsPaidProof: stato, importo, data o fase dopo il pagamento — «qualified» (in attesa) no');
  reset();
  put('pfsClients/pfsOnb', { name: 'Olga Onboarded', email: CLIENT, phone: '3331234567', stage: 'onboarded', createdAt: new Date(now - 3600e3) });
  addRow(101, VARIANTS.real());
  await call();
  const t2 = (telegrams()[0] || { body: {} }).body.text || '';
  ok((get('agentNotifications/bounce-' + REAL_ID) || {}).priority === 'urgent' && /PAGATO Property Finding \(dalla fase «onboarded»\)/.test(t2),
    'fase «onboarded» (dopo il pagamento): urgente, e la card dice da dove viene la prova', t2);
}

realOut('\n▸ 23. il testo umano: mai un indirizzo della COPIA citata');
const CRLF = '\r\n';
const qmail = (extra = []) => Buffer.from([
  'From: MAILER-DAEMON@mx.example-mail.test', `To: ${OPERATOR}`, 'Subject: failure notice',
  'Message-ID: <qmail-1@mx.example-mail.test>', 'Date: Sat, 25 Oct 2026 10:00:03 +0000', 'MIME-Version: 1.0',
  'Content-Type: text/plain; charset="UTF-8"', '',
  'Hi. This is the qmail-send program at mx.example-mail.test.',
  "I'm afraid I wasn't able to deliver your message to the following addresses.",
  "This is a permanent error; I've given up. Sorry it didn't work out.", '',
  '<landlord.typo@example-mail.test>:', 'Sorry, no mailbox here by that name. (#5.1.1)', '',
  '--- Below this line is a copy of the message.', '',
  `Return-Path: <${OPERATOR}>`, `From: BOOM <${OPERATOR}>`, 'To: landlord.typo@example-mail.test',
  'Subject: Contratto pronto per la firma', 'Reply-To: tenant.real@example.test', '',
  "Gentile proprietario, l'inquilino Mario (tenant.real@example.test) ha firmato il contratto.", '',
  ...extra,
].join(CRLF), 'utf8');
{
  reset();
  put('leads/tenantReal', { name: 'Mario Inquilino', email: 'tenant.real@example.test', phone: '3339998887', status: 'contacted', source: 'web', createdAt: new Date(now - 86400e3) });
  // una riga rientrata con un indirizzo DENTRO la copia: la forma «rientrata»
  // la prenderebbe, se il testo non si tagliasse dove comincia la copia
  addRow(301, qmail(['Per contatti:', '    tenant.real@example.test', '']));
  const res = await call();
  const t = (telegrams()[0] || { body: {} }).body.text || '';
  ok(!(get('leads/tenantReal') || {}).emailBounce, 'il lead nominato nella copia citata NON è segnato', (get('leads/tenantReal') || {}).emailBounce);
  ok(t.includes('landlord.typo@example-mail.test') && !t.includes('tenant.real@'), 'la card nomina il destinatario vero (qmail «<x>:»), mai l\'indirizzo citato', t);
  ok(res.body.preview[0] && res.body.preview[0].outcome === 'unmatched', 'esito: il destinatario vero non ha record (riga d\'orfano)', res.body.preview);

  const P = async (raw) => R.parseDsn(await simpleParser(raw));
  // forme umane ambigue: nessuna forma da destinatario, nessun originale → illeggibile
  const amb = await P(Buffer.from(['From: Mail Delivery System <MAILER-DAEMON@mx.example.test>', `To: ${OPERATOR}`, 'Subject: Undeliverable mail',
    'Message-ID: <amb-1@mx.example.test>', 'Date: Sat, 25 Oct 2026 10:00:03 +0000', 'Content-Type: text/plain', '',
    'Your mail could not be delivered. Contact help.desk@example-mail.test or see tenant.real@example.test for details.', ''].join(CRLF)));
  ok(amb.isDsn && amb.reason === 'unparsed' && amb.recipients.length === 0, 'testo ambiguo, nessuna forma, nessun originale: «unparsed», mai un\'ipotesi', amb);
  // con l'originale allegato: vale l'indirizzo che è anche nel suo To
  const inter = await P(F.dsnMessage({ messageId: '<inter-1@mx.example.test>', from: 'Mail Delivery System <MAILER-DAEMON@mx.example.test>',
    subject: 'Undeliverable mail', noMachine: true, inReplyTo: false,
    human: 'Your mail could not be delivered (permanent failure). Recipients: other.person@example-mail.test, client.typo@example-mail.test. Ask help.desk@example-mail.test.',
    originalTo: CLIENT }));
  ok(inter.recipients.length === 1 && inter.recipients[0].address === CLIENT && inter.recipients[0].source === 'human', 'senza forme: solo l\'indirizzo che è ANCHE nel To dell\'originale', inter.recipients);
  // Gmail vecchio (inglese): l'indirizzo da solo, rientrato
  const gm = await P(F.plainMessage({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)', messageId: '<gm-old@mx.google.com>',
    text: ['Delivery to the following recipient failed permanently:', '', `     ${CLIENT}`, '', 'Technical details of permanent failure:', 'The email account that you tried to reach does not exist.'].join('\n') }));
  ok(gm.recipients.length === 1 && gm.recipients[0].address === CLIENT, 'Gmail vecchio: «failed permanently:» + indirizzo rientrato', gm.recipients);
  ok(R.humanHead('ciao\n--- Below this line is a copy of the message.\nReply-To: x@y.it') === 'ciao\n', 'humanHead: si taglia dove comincia la copia');
}

realOut('\n▸ 24. il tempo: cinque destinatari su un Firestore lento non portano oltre i 60s');
{
  const recips = [1, 2, 3, 4, 5].map((k) => `person${k}@example-mail.test`);
  const heavyMachine = ['Reporting-MTA: dns; googlemail.com', '', ...recips.flatMap((a) => [`Final-Recipient: rfc822; ${a}`, 'Action: failed', 'Status: 5.1.1', ''])].join('\r\n');
  const orphanRow = (uid, k) => addRow(uid, F.dsnMessage({ messageId: `<old-${k}@mx.google.com>`, machine: ['Reporting-MTA: dns; googlemail.com', '', `Final-Recipient: rfc822; nobody${k}@spam.example.test`, 'Action: failed', 'Status: 5.1.1', ''].join('\r\n') }));
  const HEAVY = crypto.createHash('sha1').update('<heavy@mx.google.com>').digest('hex').slice(0, 24);
  const flagged = () => [0, 1, 2, 3, 4].filter((i) => (get('leads/l' + i) || {}).emailBounce).length;
  // Un orologio virtuale: ogni query 750ms (12 query in parallelo ≈ 9s per
  // destinatario), ogni scrittura 1,5s — i tempi del probe del revisore. Il
  // giro misurato è il handler intero (battito compreso), come la piattaforma.
  async function virtualRun() {
    let offset = 0;
    const realNow = Date.now, realFetch = globalThis.fetch;
    Date.now = () => realNow() + offset;
    globalThis.fetch = async (url, opts = {}) => {
      const u = new URL(String(url));
      if (u.hostname === 'firestore.googleapis.com' && u.pathname.endsWith(':runQuery')) offset += 750;
      else if (u.hostname === 'firestore.googleapis.com' && (opts.method || 'GET') !== 'GET') offset += 1500;
      return realFetch(url, opts);
    };
    try { const t0 = Date.now(); const res = await call(); return { res, elapsed: Date.now() - t0 }; }
    finally { Date.now = realNow; globalThis.fetch = realFetch; }
  }
  const seed = () => { reset(); recips.forEach((a, i) => put('leads/l' + i, { name: 'P' + i, email: a, status: 'new', source: 'web', createdAt: new Date(now - 86400e3) })); };

  // a. il pesante per primo: i cinque destinatari si pagano (45s), le
  //    scritture no — ogni record si segna solo se il tempo lo copre
  seed();
  for (let k = 1; k <= 4; k++) orphanRow(3000 + k, k);
  addRow(4000, F.dsnMessage({ messageId: '<heavy@mx.google.com>', machine: heavyMachine }));
  const a1 = await virtualRun();
  ok(a1.elapsed <= 60000 && a1.res.statusCode === 200 && a1.res.body.stats.incomplete === true, 'a. il pesante per primo: dentro i 60s virtuali, e dice «incompleto»', { elapsed: a1.elapsed, stats: a1.res.body.stats });
  let rounds = 0;
  while (rounds < 6 && !((get(R.MEM_DOC) || {}).seen || {})[HEAVY]) { await call(); rounds++; }
  ok(flagged() === 5 && [0, 1, 2, 3, 4].every((i) => get('leads/l' + i).emailBounceCount === 1), 'a. nei giri dopo si completa: cinque lead segnati UNA volta', { flagged: flagged(), rounds });

  // b. il pesante dopo un altro rimbalzo: il tempo finisce A METÀ dei suoi
  //    destinatari — si chiede il conto prima di OGNUNO, non una volta sola
  seed();
  orphanRow(4001, 9);
  addRow(4000, F.dsnMessage({ messageId: '<heavy@mx.google.com>', machine: heavyMachine }));
  const b1 = await virtualRun();
  ok(b1.elapsed <= 60000 && b1.res.statusCode === 200 && !((get(R.MEM_DOC) || {}).seen || {})[HEAVY] && b1.res.body.stats.deferred >= 1,
    'b. destinatari pagati uno per uno: dentro i 60s, il pesante rinviato (non ricordato)', { elapsed: b1.elapsed, stats: b1.res.body.stats });
  rounds = 0;
  while (rounds < 6 && !((get(R.MEM_DOC) || {}).seen || {})[HEAVY]) { await call(); rounds++; }
  ok(flagged() === 5, 'b. il giro dopo lo riprende da capo e lo completa', { flagged: flagged(), rounds });
}

realOut('\n▸ 25. le diagnostiche: una lista nera parla di NOI, «DNS» non è un dominio inesistente');
{
  const k = (status, diagnostic) => R.bounceKind({ action: 'failed', status, diagnostic });
  ok(k('5.0.0', '550 5.0.0 Message rejected: sending IP 209.85.0.1 listed on DNSBL').kind === 'rejected', 'DNSBL → rifiutata dal server (non «dominio inesistente»)');
  ok(k('5.5.0', 'Recipient rejected: client IP found in DNS blocklist').kind === 'rejected', 'DNS blocklist → rifiutata');
  ok(k('5.0.0', '554 5.0.0 <x@y.test>: Recipient address rejected: blocked using zen.spamhaus.org').kind === 'rejected', 'Postfix «address rejected … blocked using spamhaus» → rifiutata, NON indirizzo inesistente');
  ok(k('5.0.0', '554 5.0.0 reverse DNS lookup failed for sending host').kind === 'other', '«reverse DNS lookup failed» (parla di noi) → non recapitata, MAI «dominio inesistente»');
  const dom = k('5.0.0', 'DNS Error: Address resolution of example-mail.test. failed: Domain name not found');
  ok(dom.kind === 'bad_address' && dom.subtype === 'domain', 'Gmail «Domain name not found» → dominio inesistente');
  ok(k('5.0.0', '550 Host not found').subtype === 'domain' && k('5.0.0', 'no MX record for domain').subtype === 'domain', 'host not found / no MX → dominio inesistente');
}

realOut('\n▸ 26. un rimbalzo PRIMA della conferma non viene attaccato alla conferma');
{
  reset();
  seedPaidLead({ clientEmailSentAt: '2026-10-25T12:00:00.000Z' });   // la conferma è partita DUE ore dopo il rimbalzo (10:00)
  addRow(101, VARIANTS.real());
  await call();
  const l = get(SVC);
  ok(l.emailBounce && l.emailBounce.hard === true && !l.emailBouncedAfterConfirmationAt && !l.clientEmailBouncedAt, 'rimbalzo più vecchio della conferma: segnato, ma nessun campo che lo leghi alla conferma', l);
}

realOut('\n▸ 16. i log non portano dati personali');
{
  const all = LOGS.join('\n');
  const secrets = [CLIENT, 'client.typo', 'gone.user', 'Lucía', 'Fernández', 'Marta', 'Your Full Search', 'does not exist', '34612345678', '3331234567', 'old.address', OPERATOR,
    'Ines', '351912345678', 'tenant.real', 'landlord.typo', 'Paolo', 'Giulia Rossi', 'spamhaus', 'person1@'];
  const leaked = secrets.filter((s) => all.includes(s));
  ok(leaked.length === 0, 'in tutto ciò che il codice ha stampato: nessun indirizzo, nome, oggetto, diagnostico o telefono', leaked);
  ok(LOGS.some((l) => /\[leads\/rimbalzi\] imap_timeout/.test(l)), 'il log dice il CODICE del guasto (imap_timeout)');
}

// ── le mutazioni ───────────────────────────────────────────────────────────
if (!MUTATION && !process.env.BOOM_BOUNCE_CHILD) {
  realOut('\n▸ mutazioni: ogni guardia, rotta, deve far fallire la suite');
  for (const name of Object.keys(MUTATIONS)) {
    const r = spawnSync(process.execPath, [SELF], { env: { ...process.env, BOOM_BOUNCE_MUTATION: name, BOOM_BOUNCE_CHILD: '1' }, encoding: 'utf8', timeout: 120000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const boundary = /Mutation boundary missing/.test(out);
    const fails = (out.match(/✗ FAIL[^\n]*/g) || []);
    ok(r.status !== 0 && !boundary && fails.length > 0, `mutazione ${name}: presa (${fails.length} fail${fails[0] ? ' — ' + fails[0].slice(7, 90) : ''})`, boundary ? 'confine mancante' : r.status);
  }
}

realOut(`\n${fail ? '✗' : '✓'} rimbalzi: ${pass} passed, ${fail} failed${MUTATION ? ' (mutazione ' + MUTATION + ')' : ''}`);
if (fail) realOut('fallite: ' + failed.join(' | '));
process.exit(fail ? 1 : 0);
