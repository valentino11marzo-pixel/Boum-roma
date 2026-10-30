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

const MUTATIONS = {
  // il difetto del 30/10: 45s addebitati prima di OGNI download
  charge_each: ["        if (!B.afford(COST_FETCH)) {\n          stats.timeBoxed = left;", "        if (!B.afford(COST_FETCH + COST_AI)) {\n          stats.timeBoxed = left;"],
  oldest_first: ['.sort((a, b) => (b.uid || 0) - (a.uid || 0))', '.sort((a, b) => (a.uid || 0) - (b.uid || 0))'],
  no_memory_on_headers: ['    if (seen && seen[memId]) { out.duplicates++; continue; }', ''],
  no_brackets: ["  if (v) { if (v[0] !== '<') v = '<' + v; if (v[v.length - 1] !== '>') v += '>'; }", ''],
  no_offer: ['nuova offerta di |', ''],
  remember_on_timeout: ["        if (!B.afford(COST_AI + COST_WRITE)) {\n          stats.timeBoxed = left;", "        if (!B.afford(COST_AI + COST_WRITE)) {\n          remember(memId, 'not_a_lead');\n          stats.timeBoxed = left;"],
};
const MUTATION = process.env.BOOM_LEADSINBOX_MUTATION || '';
if (MUTATION && !MUTATIONS[MUTATION]) throw new Error('Unknown mutation ' + MUTATION);
const change = MUTATION ? MUTATIONS[MUTATION] : null;

// ── la casella finta ─────────────────────────────────────────────────────
const transport = `export class ImapFlow {
 constructor(){ this.io = globalThis.__inbox; }
 async connect(){ this.io.tick(this.io.cost.connect); }
 async getMailboxLock(){ return { release(){} }; }
 async search(q){ this.io.tick(this.io.cost.search); this.io.searches++; const f = String(q.from || '').toLowerCase();
   return this.io.box.filter((m) => m.from.toLowerCase().includes(f)).map((m) => m.uid); }
 async fetchAll(range, query){ this.io.tick(this.io.cost.envelopes); this.io.envelopeFetches++;
   const want = String(range).split(',').map(Number);
   return this.io.box.filter((m) => want.includes(m.uid)).map((m) => ({ uid: m.uid, envelope: { subject: m.subject, messageId: m.envId === undefined ? m.messageId : m.envId, date: m.date } })); }
 async fetchOne(uid){ const m = this.io.box.find((x) => String(x.uid) === String(uid)); this.io.tick(m && m.slow ? m.slow : this.io.cost.fetch); this.io.downloads.push(Number(uid));
   return m ? { source: Buffer.from(m.raw) } : false; }
 async logout(){}
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
const realNow = Date.now.bind(Date);
let T = realNow();
Date.now = () => T;
const inbox = globalThis.__inbox = {
  box: [], downloads: [], searches: 0, envelopeFetches: 0,
  cost: { connect: 1200, search: 600, envelopes: 500, fetch: 300, ai: 3000 },
  tick(ms) { T += ms; },
};

// ── Firestore in memoria (REST), identitytoolkit, Anthropic ───────────────
const DB = new Map();
const AI = [];
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
    const body = JSON.parse(opts.body);
    const text = JSON.stringify(body.messages);
    const name = (text.match(/Nome: ([^\\"]+?)\\n/) || [])[1] || null;
    const email = (text.match(/Email: ([^\s\\]+)/) || [])[1] || null;
    AI.push(name);
    return json({ content: [{ type: 'text', text: JSON.stringify(name ? { name, email, phone: null, message: 'Vorrei visitare', listingTitle: null, language: 'it' } : { name: null }) }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
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
    const id = 'doc' + (++autoId);
    const p = `${path}/${id}`;
    DB.set(p, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(p, DB.get(p)));
  }
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

const call = () => new Promise((resolve, reject) => {
  const req = { method: 'GET', headers: { 'x-homie-secret': 'test-secret' }, body: null, query: {} };
  const res = {
    _s: 200, status(c) { this._s = c; return this; }, setHeader() {},
    json(o) { resolve({ status: this._s, body: o }); }, end() { resolve({ status: this._s, body: null }); },
  };
  Promise.resolve(scan(req, res)).catch(reject);
});

// ── la casella dell'incidente ────────────────────────────────────────────
// UID crescenti con l'arrivo. Immobiliare in testa (alert e newsletter), poi
// idealista: richieste vecchie già lette, richieste nuove, un'offerta.
let uid = 0;
const raw = ({ from, subject, mid, name, date }) =>
  `From: ${from}\r\nTo: valentino@boom-rome.com\r\nSubject: ${subject}\r\nMessage-ID: <${mid}>\r\nDate: ${new Date(date).toUTCString()}\r\n` +
  `Content-Type: text/plain; charset=utf-8\r\n\r\n${name ? `Nome: ${name}\nEmail: ${name.toLowerCase().replace(/ /g, '.')}@example.invalid\nMessaggio: Vorrei visitare\n` : 'Le novità della settimana.\n'}`;
const mail = (o) => {
  const u = ++uid;
  const date = o.date || (T - (200 - u) * 60e3);
  const mid = o.mid || `m${u}@portal.test`;
  return { uid: u, from: o.from, subject: o.subject, messageId: `<${mid}>`, date: new Date(date).toISOString(), raw: raw({ ...o, mid, date }), name: o.name || null };
};
const IMMO = 'gestionale@notifiche.immobiliare.it', IDEA = 'reply@idealista.it';
for (let i = 0; i < 18; i++) inbox.box.push(mail({ from: IMMO, subject: i % 3 ? 'Hai 1 nuovo match!' : 'Immobiliare.it | FOCUS ROMA 2026' }));
const oldRequests = [];
for (let i = 0; i < 10; i++) { const m = mail({ from: IDEA, subject: `Nuovo messaggio (con profilo) di Vecchio${i} sul tuo immobile, Bilocale in Via Satrico, 70`, name: `Vecchio ${i}` }); oldRequests.push(m); inbox.box.push(m); }
for (let i = 0; i < 4; i++) inbox.box.push(mail({ from: 'news@quotidiano.idealista.it', subject: `Che succede ${i}/10/2026` }));
const fresh = [];
for (let i = 0; i < 11; i++) { const m = mail({ from: IDEA, subject: `Nuovo messaggio (con profilo) di Nuovo${i} sul tuo immobile, Trilocale in Via Montecuccoli, 26`, name: `Nuovo ${i}` }); fresh.push(m); inbox.box.push(m); }
const offer = mail({ from: IDEA, subject: 'Nuova offerta di Alessandro Pellegrino sul tuo immobile, Trilocale in Piazza Capri, 46', name: 'Alessandro Pellegrino' });
inbox.box.push(offer);

// la memoria del server: le richieste vecchie le aveva già lette
const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
DB.set('heartbeat/leads-inbox-memory', { seen: Object.fromEntries(oldRequests.map((m) => [sha1(m.messageId), { at: new Date(T - 86400e3).toISOString(), outcome: 'ingested' }])) });

const leads = () => [...DB.entries()].filter(([k]) => k.startsWith('leads/')).map(([, v]) => v);

console.log('\n── 0. La memoria si riconosce dalle sole intestazioni ──────────');
{
  const m = offer;
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
}

console.log('\n── 1. Il primo giro legge le richieste NUOVE, partendo dalle più recenti ──');
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
  ok('lo stato del giro dice quante richieste restano, non quante email', r.body && r.body.requests === 22 && r.body.envelopes === inbox.box.length, r.body);
}

console.log('\n── 2. Il secondo giro finisce l\'arretrato, il terzo non spende niente ──');
{
  for (let i = 0; i < 4 && leads().length < 12; i++) { T += 600e3; await call(); }
  const names = new Set(leads().map((l) => l.name));
  ok('tutte le richieste nuove e l\'offerta sono lead', fresh.every((m) => names.has(m.name)) && names.has(offer.name), [...names]);
  ok('nessun lead dalle richieste già lette, nessun doppione', leads().length === 12, leads().length);
  inbox.downloads = []; const before = AI.length;
  T += 600e3; const r = await call();
  ok('a casella letta: zero download, zero chiamate al modello', inbox.downloads.length === 0 && AI.length === before, { dl: inbox.downloads, ai: AI.length - before, body: r.body });
}

console.log('\n── 3. Una richiesta nuova arrivata dopo si legge al giro successivo ──');
{
  const late = mail({ from: IDEA, subject: 'Nuovo messaggio di Ultima Arrivata sul tuo immobile, Attico in Via Val d\'Ossola, 68', name: 'Ultima Arrivata', date: T });
  inbox.box.push(late);
  inbox.downloads = [];
  T += 600e3; await call();
  ok('la nuova è un lead al primo giro dopo l\'arrivo', leads().some((l) => l.name === 'Ultima Arrivata'), leads().map((l) => l.name));
  ok('ed è l\'unica scaricata', inbox.downloads.length === 1 && inbox.downloads[0] === late.uid, inbox.downloads);
}

console.log('\n── 4. Tempo finito prima del modello: l\'email resta da leggere ──');
{
  const slow = mail({ from: IDEA, subject: 'Nuovo messaggio di Lenta Rete sul tuo immobile, Bilocale', name: 'Lenta Rete', date: T });
  slow.slow = 27_000;   // il download si mangia il tempo del modello
  inbox.box.push(slow);
  T += 600e3; await call();
  ok('non diventa lead in questo giro', !leads().some((l) => l.name === 'Lenta Rete'));
  slow.slow = 0;
  T += 600e3; await call();
  ok('ma non è segnata come letta: il giro dopo la prende', leads().some((l) => l.name === 'Lenta Rete'), leads().map((l) => l.name));
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
