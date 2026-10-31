// tests/leadsinbox/run.mjs — LA CASELLA DEI LEAD: la richiesta nuova si legge
// al giro dopo, non due giorni dopo.
//
// L'incidente (log di produzione, 30/10/2026): «soft deadline: restano 40–80
// email» a ogni giro, per settimane. Il budget addebitava 45s a OGNI email
// prima di scaricarla, anche agli alert e a quelle già lette: un giro poteva
// cominciare email solo nei primi ~8s, rileggeva sempre le stesse (immobiliare
// in testa, idealista in coda) e le richieste nuove di idealista arrivavano al
// server quando la finestra di due giorni le portava in testa.
//
// E i difetti che la revisione avversaria (31/10) ha trovato sullo stesso
// giro: lo stallo IMAP che uccideva il processo, il fetch delle intestazioni
// che cadeva intero per un'email, il modello pagato due volte in modalità
// locale, l'estrazione sempre rotta che affamava le altre, la memoria
// illeggibile scambiata per vuota (e poi cancellata), la memoria persa a un
// errore, il telefono confrontato nella forma sbagliata.
//
// Il handler VERO (api/leads/scan-inbox.js) su un Firestore in memoria;
// imapflow sostituito da una casella finta, mailparser VERO, Anthropic finto.
// L'orologio è finto (Date.now): ogni passo IMAP e ogni chiamata al modello
// "costano" il loro tempo, così il budget si misura senza aspettare.
// Le guardie sono provate per MUTAZIONE: lo stesso file rilancia sé stesso
// col difetto rimesso nel sorgente, e ogni difetto deve far CADERE la suite.
//
// node tests/leadsinbox/run.mjs

import { register } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const SELF = fileURLToPath(import.meta.url);
const TARGET = '/api/leads/scan-inbox.js';

const PRE_DL = "        if (!B.afford(COST_FETCH)) {\n          stats.timeBoxed = left;";
const MUTATIONS = {
  // il difetto del 30/10: 45s addebitati prima di OGNI download
  charge_each: [PRE_DL, "        if (!B.afford(COST_FETCH + COST_AI)) {\n          stats.timeBoxed = left;"],
  no_pre_download_guard: [PRE_DL, "        if (false) {\n          stats.timeBoxed = left;"],
  no_envelope_guard: ['if (uids.size && B.afford(COST_FETCH)) {', 'if (uids.size) {'],
  oldest_first: ['.sort((a, b) => (b.uid || 0) - (a.uid || 0))', '.sort((a, b) => (a.uid || 0) - (b.uid || 0))'],
  no_memory_on_headers: ['    if (mem) { out.duplicates++; continue; }', ''],
  no_brackets: ["  if (v) { if (v[0] !== '<') v = '<' + v; if (v[v.length - 1] !== '>') v += '>'; }", ''],
  no_offer: ['nuova offerta di |', ''],
  remember_on_timeout: ["        if (!aiCap) {\n          stats.timeBoxed = left;", "        if (!aiCap) {\n          remember(memId, 'not_a_lead');\n          stats.timeBoxed = left;"],
  // le correzioni della revisione del 31/10
  no_error_listener: ["  client.on('error', (e) => console.warn('[leads/scan-inbox] imap', (e && (e.code || e.message)) || 'error'));", ''],
  envelopes_unguarded: ['    stats.envelopeFallback = true;', '    throw first;'],
  memory_read_as_empty: ["    return res.status(503).json({ ok: false, error: 'memory_read_failed' });", '    seen = {};'],
  save_only_on_success: ['  if (memDirty && !dry) {\n    // prune', '  if (memDirty && !dry && !failure) {\n    // prune'],
  raw_phone_dedupe: ['          try { dupe = !!(await recentLeadByPhone(lead.phone)); } catch { /* best-effort */ }',
    "          try { const prior = await fsList('leads', { filter: { field: 'phone', op: 'EQUAL', value: String(lead.phone).trim() }, limit: 5 }); dupe = prior.some((p) => Date.now() - new Date(p.createdAt || 0).getTime() < 7 * 86400000); } catch { /* x */ }"],
  retries_first: ['  out.todo = fresh.concat(retry);', '  out.todo = retry.concat(fresh);'],
  never_give_up: ['      if (mem.final && item.attempts >= MAX_EXTRACT_TRIES) { out.gaveUp++; continue; }', ''],
  ai_cap_one_backend: ['  return cap >= AI_MIN_MS ? cap : 0;', '  return maxMs;'],
  no_deterministic_id: ['            }, leadIdFor(memId));', '            });'],
};
const MUTATION = process.env.BOOM_LEADSINBOX_MUTATION || '';
if (MUTATION && !MUTATIONS[MUTATION]) throw new Error('Unknown mutation ' + MUTATION);
const change = MUTATION ? MUTATIONS[MUTATION] : null;

// ── la casella finta ─────────────────────────────────────────────────────
// Un EventEmitter come imapflow: lo stallo di un socket arriva come evento
// 'error' da un timer, e il comando in volo fallisce.
const transport = `import { EventEmitter } from 'node:events';
export class ImapFlow extends EventEmitter {
 constructor(){ super(); this.io = globalThis.__inbox; this.closed = false; }
 _alive(){ if (this.closed) { const e = new Error('Connection not available'); e.code = 'NoConnection'; throw e; } }
 async _stall(){ const err = Object.assign(new Error('Socket timeout'), { code: 'ETIMEOUT' }); this.io.tick(25000);
   setTimeout(() => this.emit('error', err), 0); await new Promise((r) => setTimeout(r, 5)); this.closed = true; throw err; }
 async connect(){ this.io.connects++; this.io.tick(this.io.cost.connect); }
 async getMailboxLock(){ this._alive(); const io = this.io; return { release(){ if (io.releaseThrows) throw new Error('lock lost'); } }; }
 async search(q){ this._alive(); this.io.tick(this.io.cost.search); this.io.searches++; const f = String(q.from || '').toLowerCase();
   return this.io.box.filter((m) => m.from.toLowerCase().includes(f)).map((m) => m.uid); }
 _env(m){ return { uid: m.uid, envelope: { subject: m.subject, messageId: m.envId === undefined ? m.messageId : m.envId, date: new Date(m.date) } }; }
 async fetchAll(range){ this._alive(); this.io.envelopeFetches++;
   if (this.io.stall === 'fetchAll') return this._stall();
   this.io.tick(this.io.cost.envelopes);
   if (this.io.fetchAllNo) throw new Error('Command failed');
   const want = String(range).split(',').map(Number);
   return this.io.box.filter((m) => want.includes(m.uid)).map((m) => this._env(m)); }
 async fetchOne(uid, query){ this._alive(); const m = this.io.box.find((x) => String(x.uid) === String(uid));
   if (query && query.envelope) { this.io.tick(50); if (Number(uid) === this.io.badUid) throw new Error('Some messages could not be FETCHed'); return m ? this._env(m) : false; }
   this.io.tick(m && m.slow ? m.slow : this.io.cost.fetch); this.io.downloads.push(Number(uid));
   return m ? { source: Buffer.from(m.raw) } : false; }
 async logout(){ this._alive(); }
}`;
const transportURL = 'data:text/javascript,' + encodeURIComponent(transport);
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s,c,next){ if(s==='imapflow') return {url:${JSON.stringify(transportURL)},shortCircuit:true}; return next(s,c); }
export async function load(url,c,next){ const out=await next(url,c); const change=${JSON.stringify(change)};
  if(change && url.endsWith(${JSON.stringify(TARGET)})){ const src=String(out.source); if(!src.includes(change[0])) throw new Error('MUTATION_BOUNDARY_MISSING'); return {...out, source: src.replace(change[0], change[1])}; }
  return out; }`), import.meta.url);

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

// ── l'orologio finto: il budget del handler legge Date.now ────────────────
let T = Date.now();
Date.now = () => T;
const COST = { connect: 1200, search: 600, envelopes: 500, fetch: 300, ai: 3000 };
const inbox = globalThis.__inbox = {
  box: [], downloads: [], searches: 0, envelopeFetches: 0, connects: 0,
  cost: { ...COST },
  tick(ms) { T += ms; },
};

// ── Firestore in memoria (REST), identitytoolkit, Anthropic ───────────────
const DB = new Map();
const AI = [];
const FAULT = { memGet: 0, createFailFor: null };
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = (f) => {
  if (!f || 'nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });
let autoId = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin', expiresIn: '3600' });
  if (u.includes('api.telegram.org')) return json({ ok: true });
  if (u.includes('api.anthropic.com')) {
    inbox.tick(inbox.cost.ai);
    const text = JSON.stringify(JSON.parse(opts.body).messages);
    const name = (text.match(/Nome: ([^\\"]+?)\\n/) || [])[1] || null;
    const email = (text.match(/Email: ([^\s\\]+)/) || [])[1] || null;
    const phone = (text.match(/Telefono: ([^\\"]+?)\\n/) || [])[1] || null;
    AI.push(name);
    // un messaggio lunghissimo: il JSON esce tagliato, sempre (stop max_tokens)
    if (/^Rotto/.test(name || '')) return json({ content: [{ type: 'text', text: '{"name":"' + name + '","message":"Buongiorno, vorrei' }], usage: { input_tokens: 1, output_tokens: 900 }, stop_reason: 'max_tokens' });
    return json({ content: [{ type: 'text', text: JSON.stringify(name ? { name, email, phone, message: 'Vorrei visitare', listingTitle: null, language: 'it' } : { name: null }) }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
  }
  if (!u.includes('firestore.googleapis.com')) return new Response('not found', { status: 404 });
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    const f = q.where && q.where.fieldFilter;
    let rows = [...DB.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2)
      .filter(([, v]) => !f || String(v[f.field.fieldPath]) === String(dec(f.value)));
    if (q.limit) rows = rows.slice(0, q.limit);
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (u.includes(':commit') || u.includes(':batchGet')) return json({ writeResults: [] });
  if (opts.method === 'PATCH') {
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next);
    return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const data = Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)]));
    if (FAULT.createFailFor && data.name === FAULT.createFailFor) return json({ error: { status: 'UNAVAILABLE' } }, 503);
    const want = (u.match(/documentId=([^&]+)/) || [])[1];
    const id = want ? decodeURIComponent(want) : 'doc' + (++autoId);
    const p = `${path}/${id}`;
    if (DB.has(p)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(p, data);
    return json(toDoc(p, data));
  }
  if (path === 'heartbeat/leads-inbox-memory' && FAULT.memGet > 0) { FAULT.memGet--; return json({ error: { status: 'UNAVAILABLE' } }, 503); }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

Object.assign(process.env, {
  HOMIE_SECRET: 'test-secret', FIREBASE_API_KEY: 'k', FIREBASE_ADMIN_EMAIL: 'a@example.invalid', FIREBASE_ADMIN_PASS: 'p',
  GMAIL_USER: 'valentino@boom-rome.com', GMAIL_APP_PASS: 'synthetic', ANTHROPIC_API_KEY: 'synthetic-key',
  TELEGRAM_BOT_TOKEN: 'tg', TELEGRAM_CHAT_ID: '1',
});
delete process.env.PFS_IMAP_USER; delete process.env.PFS_IMAP_PASS; delete process.env.CRON_SECRET;

const mod = await import('../../api/leads/scan-inbox.js');
const scan = mod.default;
const { simpleParser } = await import('mailparser');

let longestRun = 0;
const call = () => new Promise((resolve, reject) => {
  const t0 = T;
  const req = { method: 'GET', headers: { 'x-homie-secret': 'test-secret' }, body: null, query: {} };
  const res = {
    _s: 200, status(c) { this._s = c; return this; }, setHeader() {},
    json(o) { longestRun = Math.max(longestRun, T - t0); resolve({ status: this._s, body: o }); }, end() { resolve({ status: this._s, body: null }); },
  };
  Promise.resolve(scan(req, res)).catch(reject);
});
const nextRun = () => { T += 600e3; return call(); };

// ── le email ──────────────────────────────────────────────────────────────
let uid = 0;
const raw = ({ from, subject, mid, name, date, email, phone }) =>
  `From: ${from}\r\nTo: valentino@boom-rome.com\r\nSubject: ${subject}\r\nMessage-ID: <${mid}>\r\nDate: ${new Date(date).toUTCString()}\r\n` +
  `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
  (name ? `Nome: ${name}\n` + (email === null ? '' : `Email: ${email || name.toLowerCase().replace(/ /g, '.') + '@example.invalid'}\n`) + (phone ? `Telefono: ${phone}\n` : '') + 'Messaggio: Vorrei visitare\n' : 'Le novità della settimana.\n');
const mail = (o) => {
  const u = ++uid;
  const date = o.date || (T - (500 - u) * 60e3);
  const mid = o.mid || `m${u}@portal.test`;
  return { uid: u, from: o.from, subject: o.subject, messageId: `<${mid}>`, date: new Date(date).toISOString(), raw: raw({ ...o, mid, date }), name: o.name || null };
};
const IMMO = 'gestionale@notifiche.immobiliare.it', IDEA = 'reply@idealista.it';
const request = (name, extra = {}) => mail({ from: IDEA, subject: `Nuovo messaggio (con profilo) di ${name} sul tuo immobile, Trilocale in Via Montecuccoli, 26`, name, ...extra });
const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
const leads = () => [...DB.entries()].filter(([k]) => k.startsWith('leads/')).map(([, v]) => v);
const memory = () => (DB.get('heartbeat/leads-inbox-memory') || {}).seen || {};
const health = () => DB.get('pfsRadarHealth/leads-inbox') || {};
function reset() {
  inbox.box = []; inbox.downloads = []; inbox.searches = 0; inbox.envelopeFetches = 0; inbox.connects = 0;
  inbox.cost = { ...COST }; inbox.stall = null; inbox.fetchAllNo = false; inbox.badUid = null; inbox.releaseThrows = false;
  for (const k of [...DB.keys()]) if (k.startsWith('leads/') || k.startsWith('heartbeat/') || k.startsWith('pfsRadarHealth/')) DB.delete(k);
  FAULT.memGet = 0; FAULT.createFailFor = null; AI.length = 0;
}

console.log('\n── 0. Le regole pure: memoria dalle intestazioni, triage, tetto del modello ──');
{
  const m = request('Offerta Test');
  const parsed = await simpleParser(Buffer.from(m.raw));
  const a = mod.memIdFor(m.messageId, m.uid, 'u');
  const b = mod.memIdFor(m.messageId.slice(1, -1), m.uid, 'u');
  ok('Message-ID dell\'envelope (fra < >) = quello di mailparser: la memoria vecchia vale ancora', a.memId === sha1(parsed.messageId), { env: m.messageId, parsed: parsed.messageId });
  ok('anche se il server lo manda senza < >', b.memId === a.memId);
  ok('senza Message-ID: la stessa ripiega di prima (uid@utente)', mod.memIdFor('', 7, 'u').msgId === '7@u');
  const t = mod.triage([
    { uid: 1, envelope: { subject: 'Hai 1 nuovo match!' } },
    { uid: 2, envelope: { subject: 'Nuovi annunci per te: messaggio dalla tua ricerca' } },
    { uid: 3, envelope: { subject: 'Nuovo contatto per l\'annuncio 129397586', messageId: '<a@x>' } },
    { uid: 4, envelope: { subject: 'Nuova offerta di Mario Rossi sul tuo immobile', messageId: '<b@x>' } },
  ], {}, 'u');
  ok('alert e match restano fuori, contatti e offerte dentro', t.skipped === 2 && t.todo.length === 2, t);
  ok('le più recenti per prime', t.todo.map((x) => x.uid).join(',') === '4,3', t.todo);
  const k = (id) => mod.memIdFor(id, 0, 'u').memId;
  const t2 = mod.triage([
    { uid: 5, envelope: { subject: 'Nuovo contatto A', messageId: '<f1@x>' } },
    { uid: 6, envelope: { subject: 'Nuovo contatto B', messageId: '<f2@x>' } },
    { uid: 7, envelope: { subject: 'Nuovo contatto C', messageId: '<f3@x>' } },
  ], { [k('<f3@x>')]: { outcome: 'extract_failed', attempts: 1, final: true }, [k('<f2@x>')]: { outcome: 'extract_failed', attempts: 3, final: true } }, 'u');
  ok('un tentativo fallito si riprova DOPO quelle mai provate; dopo 3 fallimenti certi si smette', t2.todo.map((x) => x.uid).join(',') === '5,7' && t2.gaveUp === 1 && t2.retries === 1, t2);
  const t3 = mod.triage([{ uid: 8, envelope: { subject: 'Nuovo contatto D', messageId: '<f4@x>' } }],
    { [k('<f4@x>')]: { outcome: 'extract_failed', attempts: 9, final: false } }, 'u');
  ok('un guasto momentaneo (timeout, 5xx) non fa mai smettere: si riprova', t3.todo.length === 1 && t3.gaveUp === 0, t3);
  ok('JSON tagliato e 400 sono fallimenti certi; timeout e 429 no',
    mod.deterministicFailure(new Error('ai_json_truncated')) && mod.deterministicFailure(Object.assign(new Error('x'), { code: 'cloud_http', status: 400 }))
    && !mod.deterministicFailure(Object.assign(new Error('x'), { code: 'cloud_timeout' })) && !mod.deterministicFailure(Object.assign(new Error('x'), { code: 'cloud_http', status: 429 })));
  ok('tetto del modello: 20s a inizio giro', mod.aiCapFor(53_000, 6_000) === 20_000, mod.aiCapFor(53_000, 6_000));
  ok('tetto del modello: due tentativi (locale poi cloud) + telemetria + scrittura stanno nel tempo che resta', mod.aiCapFor(26_000, 6_000) === 8_000, mod.aiCapFor(26_000, 6_000));
  ok('tetto del modello: sotto il minimo non si comincia', mod.aiCapFor(25_999, 6_000) === 0);
}

console.log('\n── 1. L\'incidente: alert immobiliare in testa, richieste idealista in coda ──');
reset();
for (let i = 0; i < 18; i++) inbox.box.push(mail({ from: IMMO, subject: i % 3 ? 'Hai 1 nuovo match!' : 'Immobiliare.it | FOCUS ROMA 2026' }));
const oldRequests = [];
for (let i = 0; i < 10; i++) { const m = request(`Vecchio ${i}`); oldRequests.push(m); inbox.box.push(m); }
for (let i = 0; i < 4; i++) inbox.box.push(mail({ from: 'news@quotidiano.idealista.it', subject: `Che succede ${i}/10/2026` }));
const fresh = [];
for (let i = 0; i < 11; i++) { const m = request(`Nuovo ${i}`); fresh.push(m); inbox.box.push(m); }
const offer = mail({ from: IDEA, subject: 'Nuova offerta di Alessandro Pellegrino sul tuo immobile, Trilocale in Piazza Capri, 46', name: 'Alessandro Pellegrino' });
inbox.box.push(offer);
// la memoria del server: le richieste vecchie le aveva già lette
DB.set('heartbeat/leads-inbox-memory', { seen: Object.fromEntries(oldRequests.map((m) => [sha1(m.messageId), { at: new Date(T - 86400e3).toISOString(), outcome: 'ingested' }])) });
{
  const r = await call();
  const got = leads();
  ok('il giro risponde 200', r.status === 200, r.body);
  ok('un solo fetch di intestazioni per tutta la finestra', inbox.envelopeFetches === 1, inbox.envelopeFetches);
  ok('nessun alert, newsletter o email già letta viene scaricata', inbox.downloads.every((u) => fresh.concat(offer).some((m) => m.uid === u)), inbox.downloads);
  ok('l\'offerta (la più recente) diventa un lead', got.some((l) => l.name === 'Alessandro Pellegrino'), got.map((l) => l.name));
  ok('il giro lavora oltre gli 8s del difetto: almeno 5 richieste nuove al primo passaggio', got.length >= 5, { n: got.length, ai: AI.length });
  const order = inbox.downloads;
  ok('scaricate dalla più recente alla più vecchia', order.every((u, i) => i === 0 || u < order[i - 1]), order);
  ok('mai una chiamata al modello sulle richieste già lette', !AI.some((n) => /^Vecchio/.test(n || '')), AI);
  const one = got.find((l) => l.name === 'Alessandro Pellegrino') || {};
  ok('il lead porta quando la persona ha scritto (receivedAt), non solo quando il server l\'ha letta', one.receivedAt === offer.date, one);
  ok('lo stato del giro dice quante richieste ci sono, non quante email', r.body && r.body.requests === 22 && r.body.envelopes === inbox.box.length, r.body);
  ok('il lead ha un id dal Message-ID (inbox_<…>)', [...DB.keys()].some((k) => k === 'leads/' + mod.leadIdFor(sha1(offer.messageId))));
}
{
  for (let i = 0; i < 4 && leads().length < 12; i++) await nextRun();
  const names = new Set(leads().map((l) => l.name));
  ok('i giri dopo finiscono l\'arretrato: tutte le richieste nuove e l\'offerta sono lead', fresh.every((m) => names.has(m.name)) && names.has(offer.name), [...names]);
  ok('nessun lead dalle richieste già lette, nessun doppione', leads().length === 12, leads().length);
  inbox.downloads = []; const before = AI.length;
  const r = await nextRun();
  ok('a casella letta: zero download, zero chiamate al modello', inbox.downloads.length === 0 && AI.length === before, { dl: inbox.downloads, ai: AI.length - before, body: r.body });
  const late = request('Ultima Arrivata', { date: T });
  inbox.box.push(late); inbox.downloads = [];
  await nextRun();
  ok('una richiesta arrivata dopo è un lead al primo giro successivo', leads().some((l) => l.name === 'Ultima Arrivata'), leads().map((l) => l.name));
  ok('ed è l\'unica scaricata', inbox.downloads.length === 1 && inbox.downloads[0] === late.uid, inbox.downloads);
}

console.log('\n── 2. Il tempo: mai oltre i 60s, e ogni passo chiede il suo ─────────');
{
  reset();
  const slow = request('Lenta Rete', { date: T });
  slow.slow = 27_000;   // il download si mangia il tempo del modello
  inbox.box.push(slow);
  await call();
  ok('download lento: non diventa lead in questo giro', !leads().some((l) => l.name === 'Lenta Rete'));
  slow.slow = 0;
  await nextRun();
  ok('ma non è segnata come letta: il giro dopo la prende', leads().some((l) => l.name === 'Lenta Rete'), leads().map((l) => l.name));

  reset();
  inbox.cost.ai = 18_000;   // il modello lento: dopo due email il terzo download non ci sta più
  for (let i = 0; i < 3; i++) inbox.box.push(request(`Paziente ${i}`));
  await call();
  ok('modello lento: si scaricano solo le email che il tempo copre (2 su 3)', inbox.downloads.length === 2, inbox.downloads);

  reset();
  inbox.cost.search = 25_000;   // le ricerche si mangiano il giro (socket malato)
  inbox.box.push(request('Dopo Ricerche'));
  const r = await call();
  ok('ricerche lente: il fetch delle intestazioni non parte se non può finire', inbox.envelopeFetches === 0 && r.status === 200, { fetches: inbox.envelopeFetches, body: r.body });
  ok('nessun giro di questa suite ha superato i 60s', longestRun <= 60_000, longestRun);
}

console.log('\n── 3. Lo stallo IMAP diventa un errore contato, non un processo morto ──');
{
  reset();
  inbox.box.push(request('Stallo'));
  inbox.stall = 'fetchAll';
  const r = await call();
  ok('lo stallo durante il fetch: 500 con l\'errore, il processo vivo', r.status === 500 && /timeout|Connection/i.test(r.body.error || ''), r.body);
  ok('e il battito lo conta (ok:false)', health().ok === false, health());
}

console.log('\n── 4. Un\'email che Gmail non legge non fa cadere la finestra ──');
{
  reset();
  const bad = mail({ from: IMMO, subject: 'Hai 1 nuovo match!' });
  inbox.box.push(bad, request('Arriva Comunque'));
  inbox.fetchAllNo = true; inbox.badUid = bad.uid;
  const r = await call();
  ok('il fetch in blocco fallisce, si legge una alla volta saltando quella rotta', r.status === 200 && r.body.envelopeFallback === true && r.body.envelopeErrors === 1, r.body);
  ok('e la richiesta buona diventa lead', leads().some((l) => l.name === 'Arriva Comunque'), leads().map((l) => l.name));
}

console.log('\n── 5. La memoria: illeggibile ≠ vuota, e si salva anche se il giro cade ──');
{
  reset();
  const a = request('Prima Letta');
  inbox.box.push(a);
  await call();
  const mem = JSON.stringify(memory());
  FAULT.memGet = 1;
  const r = await nextRun();
  ok('memoria illeggibile: il giro si ferma (503) senza aprire la casella', r.status === 503 && inbox.connects === 1, { status: r.status, connects: inbox.connects });
  ok('e la memoria vera resta com\'era', JSON.stringify(memory()) === mem);
  ok('il battito lo dice', health().ok === false, health());

  reset();
  inbox.box.push(request('Salvata Uno'), request('Salvata Due'));
  inbox.releaseThrows = true;   // il giro cade DOPO aver letto due richieste
  const r2 = await call();
  ok('il giro cade dopo il lavoro: 500', r2.status === 500, r2.body);
  inbox.releaseThrows = false;
  const before = AI.length;
  await nextRun();
  ok('ma ciò che ha letto resta letto: il giro dopo non ripaga il modello', AI.length === before && leads().length === 2, { ai: AI.length - before, leads: leads().length });

  reset();
  inbox.box.push(request('Scritta Prima'), request('Scrittura Rotta'));
  FAULT.createFailFor = 'Scrittura Rotta';
  const r3 = await call();
  ok('una scrittura fallita non ferma il giro', r3.status === 200 && r3.body.writeErrors === 1 && leads().some((l) => l.name === 'Scritta Prima'), r3.body);
  FAULT.createFailFor = null;
  await nextRun();
  ok('e la richiesta fallita si riprende al giro dopo, senza doppioni', leads().filter((l) => l.name === 'Scrittura Rotta').length === 1 && leads().filter((l) => l.name === 'Scritta Prima').length === 1, leads().map((l) => l.name));

  reset();
  const anon = request('Solo Nome', { email: null });
  inbox.box.push(anon);
  await call();
  DB.delete('heartbeat/leads-inbox-memory');   // la memoria persa (mai successo per errore, ma può)
  await nextRun();
  ok('memoria persa: rileggere la stessa email non crea un secondo lead (409 sull\'id)', leads().filter((l) => l.name === 'Solo Nome').length === 1, leads().map((l) => l.name));
}

console.log('\n── 6. La stessa persona due volte, col telefono scritto in due modi ──');
{
  reset();
  inbox.box.push(request('Tel Uno', { email: null, phone: '333 111 0866' }));
  inbox.box.push(mail({ from: IDEA, subject: 'Nuovo messaggio di Tel Uno sul tuo immobile, Bilocale in Via Satrico, 70', name: 'Tel Uno', email: null, phone: '+39 3331110866' }));
  await call();
  ok('due email, un telefono in due forme: un lead solo', leads().length === 1 && leads()[0].phone === '+393331110866', leads().map((l) => [l.name, l.phone]));
}

console.log('\n── 7. L\'estrazione sempre rotta non affama le altre e smette di costare ──');
{
  reset();
  const good = request('Buona Vecchia');
  inbox.box.push(good);
  for (let i = 0; i < 9; i++) inbox.box.push(request(`Rotto ${i}`));
  await call();
  await nextRun();
  ok('la richiesta buona (più vecchia) diventa lead entro il secondo giro', leads().some((l) => l.name === 'Buona Vecchia'), { leads: leads().map((l) => l.name), ai: AI });
  for (let i = 0; i < 6; i++) await nextRun();
  const per = {};
  for (const n of AI) if (/^Rotto/.test(n || '')) per[n] = (per[n] || 0) + 1;
  ok('dopo 3 fallimenti certi un\'email non si paga più', Object.keys(per).length === 9 && Object.values(per).every((c) => c === mod.MAX_EXTRACT_TRIES), per);
  const r = await nextRun();
  ok('e il giro le conta come abbandonate (gaveUp)', r.body.gaveUp === 9, r.body);
}

console.log(`\n${failed ? '✗' : '✓'} leadsinbox${MUTATION ? ' [' + MUTATION + ']' : ''}: ${passed} pass, ${failed} fail`);

if (!MUTATION) {
  console.log('\n── Mutazioni: ogni difetto rimesso deve far cadere la suite ──');
  let caught = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const r = spawnSync(process.execPath, [SELF], { env: { ...process.env, BOOM_LEADSINBOX_MUTATION: name }, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const fell = r.status !== 0 && !/MUTATION_BOUNDARY_MISSING/.test(out);
    if (fell) caught++;
    ok(`mutazione ${name}: presa`, fell, out.split('\n').filter((l) => /FAIL|BOUNDARY|Error/.test(l)).slice(0, 3));
  }
  console.log(`\n${failed ? '✗' : '✓'} leadsinbox: ${passed} pass, ${failed} fail · mutazioni prese ${caught}/${Object.keys(MUTATIONS).length}`);
}
process.exit(failed ? 1 : 0);
