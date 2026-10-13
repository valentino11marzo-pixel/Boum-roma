// tests/palazzo/automations.mjs — le macchine del mattino riconoscono il Palazzo.
//
// Gli inquilini di un palazzo preso in carico dalla tabella della proprietaria
// (source 'palazzo-import') hanno contratti firmati SU CARTA, a volte un
// segnaposto (contratto non in archivio), nessun account BOOM, il telefono
// scritto solo nel contratto, i canoni pagati sul conto del LOCATORE. Ogni
// automazione che li trattava come contratti digitali BOOM faceva un danno
// diverso (audit del 12/10/2026). Qui si guidano le funzioni e i handler VERI
// — Firestore in memoria che rispetta tipi, ordinamenti e precondizioni come
// quello vero; si fingono solo la rete (Identity Toolkit, Firestore REST,
// Storage, Telegram, Twilio) e nodemailer — e per le regole importanti si
// rimette il difetto in una copia del file: il test deve cadere.
//
// Dati inventati: nomi di fantasia, telefoni +39 000 000 00xx, email
// @example.invalid, IBAN di prova.
//
// Uso: node tests/palazzo/automations.mjs
import { register, createRequire } from 'node:module';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

register('../notify/loader.mjs', import.meta.url);   // nodemailer → mock

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const require = createRequire(import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.CRON_SECRET = 'cron-test';
process.env.HOMIE_SECRET = 'homie-test';
process.env.TELEGRAM_BOT_TOKEN = 'tg';
process.env.TELEGRAM_CHAT_ID = '42';
process.env.GMAIL_USER = 'sistema@example.invalid';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 600) : '')); }
};

// ── Il tempo fermo: 12 ottobre 2026, 09:00 UTC ──────────────────────────────
const NOW = '2026-10-12T09:00:00Z';
const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.parse(NOW)); else super(...a); }
  static now() { return RealDate.parse(NOW); }
}
FrozenDate.parse = RealDate.parse; FrozenDate.UTC = RealDate.UTC;
globalThis.Date = FrozenDate;

// ── Mutazioni: una copia del file col difetto rimesso, accanto all'originale
// (gli import relativi restano validi), cancellata sempre. ─────────────────
const mutants = new Set();
process.on('exit', () => { for (const f of mutants) { try { unlinkSync(f); } catch { /* già via */ } } });
let mutN = 0;
function mutantPath(rel, from, to) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  if (!src.includes(from)) throw new Error('mutazione non applicabile in ' + rel + ': ' + from.slice(0, 80));
  const dir = path.dirname(path.join(ROOT, rel));
  const file = path.join(dir, '.mut-' + (++mutN) + '-' + path.basename(rel));
  writeFileSync(file, src.split(from).join(to));
  mutants.add(file);
  return file;
}
function dropMutant(file) { try { unlinkSync(file); } catch { /* */ } mutants.delete(file); }
function requireMutant(rel, from, to) { const f = mutantPath(rel, from, to); try { return require(f); } finally { dropMutant(f); } }
async function importMutant(rel, from, to) {
  const f = mutantPath(rel, from, to);
  try { return await import('file://' + f + '?m=' + mutN); } finally { dropMutant(f); }
}

// ═══ Firestore in memoria ═══════════════════════════════════════════════════
// Documenti salvati coi valori TIPIZZATI (stringValue, timestampValue…):
// Firestore confronta per tipo, ordina per nome senza orderBy, rispetta
// updateMask e precondizioni — le tre cose su cui questi difetti vivevano.
const DB = new Map();            // path → { fields, updateTime }
let tick = 0;
const nextUt = () => new RealDate(RealDate.UTC(2026, 0, 1) + (++tick) * 1000).toISOString();
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof RealDate) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = enc(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function dec(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = dec(x); return o; }
  return null;
}
const encFields = o => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = enc(v); return f; };
const decFields = f => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = dec(v); return o; };
const seed = (p, obj) => DB.set(p, { fields: encFields(obj), updateTime: nextUt() });
const read = p => (DB.has(p) ? decFields(DB.get(p).fields) : null);
const keys = prefix => [...DB.keys()].filter(k => k.startsWith(prefix + '/') && k.split('/').length === 2);
const docName = k => 'projects/test-proj/databases/(default)/documents/' + k;

const TYPE_RANK = { nullValue: 0, booleanValue: 1, integerValue: 2, doubleValue: 2, timestampValue: 3, stringValue: 4, arrayValue: 9, mapValue: 10 };
const tKey = v => Object.keys(v || {})[0];
const tRank = v => TYPE_RANK[tKey(v)] ?? 99;
const tVal = v => { const t = tKey(v); return t === 'timestampValue' ? RealDate.parse(v[t]) : t === 'integerValue' ? Number(v[t]) : v[t]; };
function cmpVal(a, b) {
  const ra = tRank(a), rb = tRank(b);
  if (ra !== rb) return ra - rb;
  const x = tVal(a), y = tVal(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
function matchFilter(doc, w) {
  if (!w) return true;
  if (w.compositeFilter) return (w.compositeFilter.filters || []).every(f => matchFilter(doc, f));
  const f = w.fieldFilter; if (!f) return true;
  const v = doc.fields[f.field.fieldPath];
  if (f.op === 'IN') return !!v && (f.value.arrayValue.values || []).some(x => tRank(x) === tRank(v) && cmpVal(x, v) === 0);
  if (f.op === 'ARRAY_CONTAINS') return !!v && v.arrayValue && (v.arrayValue.values || []).some(x => cmpVal(x, f.value) === 0);
  if (!v || tRank(v) !== tRank(f.value)) return false;   // tipi diversi: mai uguali, mai nell'intervallo
  const c = cmpVal(v, f.value);
  return { EQUAL: c === 0, NOT_EQUAL: c !== 0, GREATER_THAN: c > 0, GREATER_THAN_OR_EQUAL: c >= 0, LESS_THAN: c < 0, LESS_THAN_OR_EQUAL: c <= 0 }[f.op] ?? false;
}
function runQuery(q) {
  const coll = q.from[0].collectionId;
  let rows = keys(coll).map(k => [k, DB.get(k)]).filter(([, d]) => matchFilter(d, q.where));
  const ob = (q.orderBy || [])[0];
  if (ob && ob.field.fieldPath !== '__name__') {
    rows = rows.filter(([, d]) => d.fields[ob.field.fieldPath]);
    rows.sort(([ka, a], [kb, b]) => (cmpVal(a.fields[ob.field.fieldPath], b.fields[ob.field.fieldPath]) || (ka < kb ? -1 : 1)) * (ob.direction === 'DESCENDING' ? -1 : 1));
  } else rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));   // senza orderBy: per NOME, come quello vero
  if (q.startAt && q.startAt.values && q.startAt.values[0] && q.startAt.values[0].referenceValue) {
    const after = q.startAt.values[0].referenceValue.split('/documents/')[1];
    rows = rows.filter(([k]) => k > after);
  }
  if (Number.isInteger(q.limit)) rows = rows.slice(0, q.limit);
  return rows.map(([k, d]) => ({ document: { name: docName(k), fields: d.fields, updateTime: d.updateTime } }));
}

const SESSIONS = { 'tok-admin': 'admin1', 'tok-own1': 'own1', 'tok-own2': 'own2' };
const TG = [], UPLOADS = [];
const okJson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('accounts:lookup')) {
    const uid = SESSIONS[JSON.parse(opts.body || '{}').idToken];
    return uid ? okJson({ users: [{ localId: uid, email: uid + '@example.invalid' }] }) : okJson({ error: 'INVALID' }, 400);
  }
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return okJson({ idToken: 'svc', localId: 'svc', expiresIn: '3600' });
  if (url.includes('api.telegram.org')) { try { TG.push(JSON.parse(opts.body).text); } catch { TG.push(''); } return okJson({ ok: true, result: { message_id: TG.length } }); }
  if (url.includes('api.twilio.com') && url.includes('/Recordings/')) return new Response(new Uint8Array([73, 68, 51, 4]), { status: 200 });
  if (url.includes('api.twilio.com')) return okJson({});
  if (url.includes('firebasestorage.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') {
      const name = new URL(url).searchParams.get('name');
      UPLOADS.push({ name, type: (opts.headers || {})['Content-Type'], size: opts.body ? opts.body.length : 0 });
      return okJson({ name, downloadTokens: 'dl' });
    }
    return new Response('%PDF-1.4 allegato di prova', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  }
  if (!url.includes('firestore.googleapis.com')) throw new Error('rete inattesa: ' + url);
  const after = url.slice(url.indexOf('/documents') + 10);
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (after.startsWith(':runQuery')) { const rows = runQuery(body.structuredQuery); return okJson(rows.length ? rows : [{ readTime: NOW }]); }
  if (after.startsWith(':batchGet')) {
    return okJson((body.documents || []).map(n => { const k = n.split('/documents/')[1]; const d = DB.get(k); return d ? { found: { name: n, fields: d.fields, updateTime: d.updateTime } } : { missing: n }; }));
  }
  if (after.startsWith(':commit')) {
    const writes = body.writes || [];
    for (const w of writes) {
      const k = (w.update ? w.update.name : w.delete).split('/documents/')[1], cd = w.currentDocument || {};
      if ((cd.exists === false && DB.has(k)) || (cd.exists === true && !DB.has(k)) || (cd.updateTime && (!DB.has(k) || DB.get(k).updateTime !== cd.updateTime)))
        return okJson({ error: { code: 400, status: 'FAILED_PRECONDITION' } }, 400);
    }
    const results = [];
    for (const w of writes) {
      if (w.delete) { DB.delete(w.delete.split('/documents/')[1]); results.push({}); continue; }
      const k = w.update.name.split('/documents/')[1];
      let fields;
      if (w.updateMask) {
        fields = { ...((DB.get(k) || {}).fields || {}) };
        for (const fp of w.updateMask.fieldPaths || []) { const f = fp.replace(/`/g, ''); if (f in (w.update.fields || {})) fields[f] = w.update.fields[f]; else delete fields[f]; }
      } else fields = { ...(w.update.fields || {}) };
      for (const t of w.updateTransforms || []) if (t.setToServerValue) fields[t.fieldPath] = { timestampValue: new RealDate(FrozenDate.now()).toISOString() };
      const ut = nextUt(); DB.set(k, { fields, updateTime: ut }); results.push({ updateTime: ut });
    }
    return okJson({ writeResults: results, commitTime: NOW });
  }
  const [rawPath, qs] = after.replace(/^\//, '').split('?');
  const p = decodeURIComponent(rawPath);
  const params = new URLSearchParams(qs || '');
  const method = opts.method || 'GET';
  if (method === 'GET') return DB.has(p) ? okJson({ name: docName(p), fields: DB.get(p).fields, updateTime: DB.get(p).updateTime }) : okJson({ error: { code: 404 } }, 404);
  if (method === 'DELETE') { DB.delete(p); return okJson({}); }
  if (method === 'POST') {
    const id = params.get('documentId') || 'auto' + (++tick);
    const k = p + '/' + id;
    if (DB.has(k)) return okJson({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    const ut = nextUt(); DB.set(k, { fields: body.fields || {}, updateTime: ut });
    return okJson({ name: docName(k), fields: body.fields || {}, updateTime: ut });
  }
  if (method === 'PATCH') {
    if (params.get('currentDocument.exists') === 'false' && DB.has(p)) return okJson({ error: { code: 400, status: 'FAILED_PRECONDITION' } }, 400);
    const mask = params.getAll('updateMask.fieldPaths');
    const fields = mask.length ? { ...((DB.get(p) || {}).fields || {}) } : {};
    for (const f of (mask.length ? mask : Object.keys(body.fields || {}))) { if (f in (body.fields || {})) fields[f] = body.fields[f]; else delete fields[f]; }
    const ut = nextUt(); DB.set(p, { fields, updateTime: ut });
    return okJson({ name: docName(p), fields, updateTime: ut });
  }
  throw new Error('metodo inatteso ' + method + ' ' + p);
};

const mkRes = () => ({ statusCode: 200, body: null, sent: null, headers: {},
  setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; }, end(b) { this.sent = b; return this; }, send(b) { this.sent = b; return this; } });
async function call(handler, { method = 'POST', body = {}, headers = {}, query = {} } = {}) {
  const res = mkRes();
  const req = { method, headers, body, query, url: '/api/x',
    on(ev, cb) { if (ev === 'data') cb(Buffer.from(typeof body === 'string' ? body : new URLSearchParams(body).toString())); if (ev === 'end') cb(); return this; } };
  await handler(req, res);
  return res;
}
const asAdmin = { authorization: 'Bearer tok-admin' };
const asCron = { authorization: 'Bearer cron-test' };

// ═══ I dati del palazzo (inventati) ════════════════════════════════════════
// Un palazzo preso in carico il 1° ottobre 2026: int. 7 su carta e registrato
// (con bonifico SEGNALATO), int. 11 su carta senza email (rata in ritardo),
// int. 14 segnaposto. Più un inquilino BOOM "normale" con account.
function seedWorld() {
  DB.clear(); TG.length = 0; UPLOADS.length = 0; globalThis.__mails = [];
  seed('users/admin1', { role: 'admin', name: 'Operatore' });
  seed('users/own1', { role: 'landlord', name: 'Proprietaria Esempio', email: 'proprietaria@example.invalid' });
  seed('users/own2', { role: 'landlord', name: 'Altro Proprietario' });
  seed('users/t9', { role: 'tenant', name: 'Nora Nove', email: 'nora@example.invalid' });
  seed('users/t10', { role: 'tenant', name: 'Ivo Dieci', email: 'ivo@example.invalid', language: 'it' });
  for (const [id, int] of [['plz7', '7'], ['plz11', '11'], ['plz14', '14']]) {
    seed('properties/' + id, { name: 'Piazzale Esempio 42 int. ' + int, address: 'Piazzale Esempio 42, Roma', interno: int, ownerId: 'own1', gestioneDal: '2026-10', source: 'palazzo-import' });
  }
  seed('properties/pN', { name: 'Via Normale 1', address: 'Via Normale 1, Roma', ownerId: 'own2' });
  seed('properties/pM', { name: 'Via Normale 2', address: 'Via Normale 2, Roma', ownerId: 'own2' });
  seed('contracts/c7', { propertyId: 'plz7', status: 'active', source: 'palazzo-import', signatureStatus: 'paper',
    tenantName: 'Ada Uno', tenantPhone: '+39 000 000 0001', tenantEmail: 'ada@example.invalid', coTenants: [{ name: 'Bea Due', phone: '+39 000 000 0012' }],
    startDate: '2026-09-15', endDate: '2027-08-14', rent: 1600, deposit: 3200, type: 'studenti', cedolareSecca: 'no',
    rliRegisteredAt: '2026-09-20', registrationStatus: 'registered', paymentsFrom: '2026-10', createdAt: '2026-10-01T08:00:00Z',
    landlordName: 'Esempio S.r.l.', landlordIban: 'IT60X0542811101000000123456' });
  seed('contracts/c11', { propertyId: 'plz11', status: 'active', source: 'palazzo-import', signatureStatus: 'paper',
    tenantName: 'Carlo Tre', tenantPhone: '+39 000 000 0002', startDate: '2026-10-01', endDate: '2027-08-31', rent: 1500, deposit: 3000,
    type: 'studenti', cedolareSecca: 'no', paymentsFrom: '2026-10', createdAt: '2026-10-01T08:00:00Z' });
  seed('contracts/c14', { propertyId: 'plz14', status: 'active', source: 'palazzo-import', contractMissing: true,
    tenantName: 'Elsa Sei', tenantPhone: '+39 000 000 0003', createdAt: '2026-10-01T08:00:00Z' });
  seed('contracts/cN', { propertyId: 'pN', status: 'active', tenantId: 't9', tenantName: 'Nora Nove', startDate: '2026-01-01', endDate: '2027-12-31',
    rent: 900, deposit: 1800, type: 'transitorio', signatureStatus: 'complete', createdAt: '2026-01-01T08:00:00Z' });
  seed('contracts/cM', { propertyId: 'pM', status: 'active', tenantId: 't10', tenantName: 'Ivo Dieci', startDate: '2026-01-01', endDate: '2027-12-31',
    rent: 800, deposit: 1600, type: 'transitorio', signatureStatus: 'complete', createdAt: '2026-01-01T08:00:00Z' });
  // int. 7: ottobre col bonifico SEGNALATO e la ricevuta; settembre prima della gestione
  seed('payments/pay_c7_2026-10', { contractId: 'c7', propertyId: 'plz7', type: 'rent', month: '2026-10', amount: 1720, dueDate: '2026-10-05',
    status: 'pending', source: 'palazzo-import', tenantReported: true, tenantReportDate: '2026-10-05', tenantReportProofUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/r.pdf' });
  seed('payments/pay_c7_2026-09', { contractId: 'c7', propertyId: 'plz7', type: 'rent', month: '2026-09', amount: 1720, dueDate: '2026-09-05', status: 'pending' });
  // int. 11: ottobre in ritardo, nessun account né email
  seed('payments/pay_c11_2026-10', { contractId: 'c11', propertyId: 'plz11', type: 'rent', month: '2026-10', amount: 1620, dueDate: '2026-10-05', status: 'pending', source: 'palazzo-import' });
  // inquilino BOOM con account: ritardo vero (inglese) e uno già sollecitato ieri
  seed('payments/pay_cN_2026-10', { contractId: 'cN', propertyId: 'pN', tenantId: 't9', type: 'rent', month: '2026-10', amount: 900, dueDate: '2026-10-01', status: 'pending' });
  seed('payments/pay_cN_2026-09', { contractId: 'cN', propertyId: 'pN', tenantId: 't9', type: 'rent', month: '2026-09', amount: 900, dueDate: '2026-09-01', status: 'pending',
    lastReminderDate: '2026-10-11', dunningHistory: [{ channel: 'whatsapp', kind: 'rata-link', at: '2026-10-11T10:00:00Z', month: '2026-09' }] });
  seed('payments/pay_cM_2026-10', { contractId: 'cM', propertyId: 'pM', tenantId: 't10', type: 'rent', month: '2026-10', amount: 800, dueDate: '2026-10-01', status: 'pending' });
  // un contratto storico BOOM senza account ma con l'email (non del Palazzo)
  seed('properties/pL', { name: 'Via Storica 3', ownerId: 'own2' });
  seed('contracts/cL', { propertyId: 'pL', status: 'active', tenantName: 'Lia Storica', tenantEmail: 'lia@example.invalid', startDate: '2025-10-01', endDate: '2026-12-31', rent: 700, createdAt: '2025-10-01T08:00:00Z' });
  seed('payments/pay_cL_2026-10', { contractId: 'cL', propertyId: 'pL', type: 'rent', month: '2026-10', amount: 700, dueDate: '2026-10-01', status: 'pending' });
  // un tap su «Firma ora» aveva coniato i token del contratto su carta
  seed('signTokens/c7', { contractId: 'c7', tenant: '11111111-2222-3333-4444-555555555555', landlord: '66666666-7777-8888-9999-000000000000' });
}

const CS = require('../../js/contract-state.js');

// ═══ 1. I fatti condivisi (js/contract-state.js, aggiunte S7) ════════════════
{
  ok(CS.isRegistered({ rliRegisteredAt: '2026-09-20' }) && CS.isRegistered({ registrationStatus: 'registered' }) && !CS.isRegistered({ registrationStatus: 'sent' }) && !CS.isRegistered(null),
    'isRegistered: data RLI o stato «registered», mai «sent»');
  ok(CS.beforeGestione('2026-09', { gestioneDal: '2026-10' }) && !CS.beforeGestione('2026-10', { gestioneDal: '2026-10' })
    && !CS.beforeGestione('2026-09', {}) && !CS.beforeGestione('Ago 2026', { gestioneDal: '2026-10' }),
    'beforeGestione: solo i mesi PRIMA di gestioneDal; senza dato o con un mese illeggibile, mai');
  const now = new Date(NOW);
  ok(!!CS.recentReminder({ lastReminderDate: '2026-10-10' }, now, 7) && !!CS.recentReminder({ dunningHistory: [{ at: '2026-10-11T10:00:00Z' }] }, now, 7)
    && CS.recentReminder({ lastReminderDate: '2026-09-01', dunningHistory: [{ at: '2026-09-02T10:00:00Z' }] }, now, 7) === null
    && !!CS.recentReminder({ lastReminderDate: { seconds: RealDate.parse('2026-10-09T10:00:00Z') / 1000 } }, now, 7),
    'recentReminder: lastReminderDate (anche Timestamp) o dunningHistory negli ultimi giorni');
  const ph = CS.tenantPhones({ tenantPhone: '+39 000 000 0011', tenantName: 'A', coTenants: [{ name: 'B', phone: '+39 000 000 0012' }, { name: 'C' }] });
  ok(ph.length === 2 && ph[0].role === 'tenant' && ph[1].role === 'cotenant' && ph[1].index === 0, 'tenantPhones: titolare + co-intestatari col telefono, mai inventati', ph);
}

// ═══ 2. Compliance: registrato = fatto; controllo superato = fatto; prima di BOOM = na
{
  const C = require('../../js/compliance-rules.js');
  const today = new Date(NOW);
  const c7 = { id: 'c7', type: 'studenti', rent: 1600, deposit: 3200, startDate: '2026-09-15', endDate: '2027-08-14', cedolareSecca: 'no',
    rliRegisteredAt: '2026-09-20', registrationStatus: 'registered', signatureStatus: 'paper' };
  const st = (c, opts = {}, mod = C) => Object.fromEntries(mod.obligationsFor(c, { tenant: {}, today, ...opts }).map(o => [o.code, mod.statusOf(o, {}, today, 14)]));
  const s1 = st(c7);
  ok(s1.RLI_REG === 'done' && s1.REGISTRO_BOLLO === 'done', 'compliance: contratto registrato → RLI e imposta di registro FATTE (non «in scadenza»)', s1);
  ok(s1.DEPOSIT_CHECK === 'done', 'compliance: deposito entro 3 mensilità con data di stipula → FATTO (non più «SCADUTA»)', s1);
  const s2 = st({ ...c7, cedolareSecca: 'si' });
  ok(s2.CEDOLARE_OPT === 'done', 'compliance: opzione cedolare chiusa dalla registrazione', s2);
  const s3 = st(c7, { property: { gestioneDal: '2026-10' } });
  ok(s3.APE === 'na' && s3.DEPOSIT_CHECK === 'done', 'compliance: APE scaduta PRIMA della gestione BOOM → na, non «SCADUTA» ogni mattina', s3);
  const s4 = st({ ...c7, rliRegisteredAt: null, registrationStatus: null }, { property: { gestioneDal: '2026-10' } });
  ok(['overdue', 'due_soon'].includes(s4.RLI_REG), 'compliance: un contratto NON registrato resta visibile anche prima della gestione (è un fatto legale)', s4);
  const s5 = st({ ...c7, startDate: '2026-06-01', rliRegisteredAt: null, registrationStatus: null }, { property: { gestioneDal: '2026-10' } });
  ok(s5.RLI_REG === 'overdue' && s5.APE === 'na' && s5.REGISTRO_BOLLO === 'na',
    'compliance: RLI scaduta prima della gestione resta ROSSA; l\'imposta di registro di giugno no (non è nostra)', s5);
  const s7 = st({ ...c7, source: 'palazzo-import', startDate: '2026-10-01' }, { property: { gestioneDal: '2026-10' } });
  ok(s7.APE === 'na', 'compliance: l\'APE di un contratto preso in carico (firmato su carta prima di BOOM) non è «SCADUTA»', s7);
  ok(st({ ...c7, startDate: '2026-10-01' }, { property: { gestioneDal: '2026-10' } }).APE === 'overdue', 'compliance: per un contratto BOOM l\'APE resta un adempimento vero');
  const s6 = st({ ...c7, deposit: 9000 }, { property: { gestioneDal: '2026-10' } });
  ok(s6.DEPOSIT_CHECK === 'overdue', 'compliance: un deposito oltre le 3 mensilità resta rosso anche prima della gestione', s6);
  const M1 = requireMutant('js/compliance-rules.js', "    if (item.check === 'ok') return 'done';", "    if (item.check === 'ok' && !item.dueDate) return 'done';");
  ok(st(c7, {}, M1).DEPOSIT_CHECK === 'overdue', 'mutazione: col vecchio «ok && !dueDate» il deposito regolare torna SCADUTO (il test lo vede)');
  const M2 = requireMutant('js/compliance-rules.js', "    if (isRegistered(contract)) {", "    if (false) {");
  ok(st(c7, {}, M2).RLI_REG !== 'done', 'mutazione: senza la regola «registrato» la RLI torna da fare (il test lo vede)');
}

// ═══ 3. Scadenze fiscali: RLI registrata, cedolareSecca letta, niente IMU prima di BOOM
{
  const F = require('../../js/fiscal-engine.js');
  const T = require('../../js/taxpack-engine.js');
  const base = { id: 'cx', startDate: '2026-09-15', endDate: '2027-08-14', rent: 1600, type: 'studenti' };
  const rli = (c, mod = F) => mod.contractObligations(c, { id: 'p' }, 2026).find(o => o.key.startsWith('rli_'));
  ok(!rli({ ...base, cedolareSecca: 'no', rliRegisteredAt: '2026-09-20' }), 'fiscale: contratto registrato → nessuna «Registrazione contratto (RLI)»');
  ok(rli({ ...base, cedolareSecca: 'no' }).amount > 0 && rli({ ...base, cedolareSecca: 'si' }).amount === 0,
    'fiscale: cedolareSecca letta davvero — «no» = imposta di registro, «si» = esente');
  ok(T.classifyContract({ cedolareSecca: 'si' }).isCedolare === true && T.classifyContract({ cedolareSecca: 'no' }).isCedolare === false
    && T.classifyContract({ cedolare: true }).isCedolare === true, 'taxpack: cedolareSecca letta, i segnali storici restano');
  const imu = F.propertyObligations({ id: 'plz7', gestioneDal: '2026-10' }, 2026).map(o => o.key);
  ok(imu.length === 1 && /imu_saldo/.test(imu[0]), 'fiscale: IMU acconto di giugno PRIMA della gestione BOOM non esce; il saldo di dicembre sì', imu);
  ok(F.propertyObligations({ id: 'pz' }, 2026).length === 2, 'fiscale: senza gestioneDal le due rate IMU restano');
  const old = { id: 'co', startDate: '2025-03-01', endDate: '2029-02-28', rent: 1000, cedolareSecca: 'no', type: 'libero' };
  const keysOld = F.contractObligations(old, { id: 'pz', gestioneDal: '2026-10' }, 2026).map(o => o.key);
  ok(!keysOld.some(k => /^istat_|^registro_annuale_/.test(k)), 'fiscale: ISTAT e registro annuale di marzo, prima della gestione, non escono', keysOld);
  const MF = requireMutant('js/fiscal-engine.js', '    var decl = cedolareDeclared(contract || {});', '    var decl = null;');
  ok(rli({ ...base, cedolareSecca: 'si' }, MF).amount > 0, 'mutazione: ignorando cedolareSecca un contratto in cedolare paga il registro (il test lo vede)');
}

// ═══ 4. La Bonifica non tocca i contratti con valore legale ══════════════════
{
  const D = require('../../js/dataops-engine.js');
  const DO = D.isProtected ? D : globalThis.BOOM_DATAOPS;
  ok(DO.isProtected('contracts', { signatureStatus: 'paper' }) && DO.isProtected('contracts', { signatureStatus: 'complete' })
    && DO.isProtected('contracts', { rliRegisteredAt: '2026-09-20' }) && DO.isProtected('contracts', { registrationStatus: 'registered' })
    && DO.isProtected('contracts', { source: 'palazzo-import', contractMissing: true }) && !DO.isProtected('contracts', { tenantName: 'x' }),
    'bonifica: carta, firma completa, registrato e presa in carico sono PROTETTI; un contratto vuoto no');
  const MD = requireMutant('js/dataops-engine.js', "|| d.source === 'palazzo-import';", ';');
  const MDO = MD.isProtected ? MD : globalThis.BOOM_DATAOPS;
  ok(!MDO.isProtected('contracts', { source: 'palazzo-import', contractMissing: true }), 'mutazione: senza la riga, il segnaposto del Palazzo torna cancellabile (il test lo vede)');
}

// ═══ 5. Oggi: il bonifico segnalato si VERIFICA, il Palazzo ha le sue azioni ═
{
  const O = require('../../js/oggi-engine.js');
  const app = readFileSync(path.join(ROOT, 'js/portal-app.js'), 'utf8');
  const S = {
    payments: [
      { id: 'rep', contractId: 'c7', propertyId: 'plz7', amount: 1720, month: '2026-10', dueDate: '2026-10-05', status: 'overdue', tenantReported: true, tenantReportDate: '2026-10-05', tenantReportProofUrl: 'https://x' },
      { id: 'imp', contractId: 'c11', propertyId: 'plz11', amount: 1620, month: '2026-10', dueDate: '2026-10-05', status: 'pending', source: 'palazzo-import' },
      { id: 'pre', contractId: 'c7', propertyId: 'plz7', amount: 1720, month: '2026-09', dueDate: '2026-09-05', status: 'pending' },
      { id: 'nor', contractId: 'cN', propertyId: 'pN', amount: 900, month: '2026-10', dueDate: '2026-10-01', status: 'pending' },
    ],
    contracts: [{ id: 'c7', propertyId: 'plz7', tenantName: 'Ada Uno', source: 'palazzo-import' }, { id: 'c11', propertyId: 'plz11', tenantName: 'Carlo Tre', source: 'palazzo-import' },
      { id: 'cN', propertyId: 'pN', tenantId: 't9' }],
    users: [{ id: 't9', name: 'Nora Nove' }],
    properties: [{ id: 'plz7', name: 'Piazzale Esempio 42 int. 7', gestioneDal: '2026-10' }, { id: 'plz11', name: 'Piazzale Esempio 42 int. 11', gestioneDal: '2026-10' }, { id: 'pN', name: 'Via Normale 1' }],
  };
  const r = O.build(S, NOW);
  const ids = r.decisions.map(d => d.id);
  const rep = r.decisions.find(d => d.id === 'rep_rep');
  ok(rep && rep.actions[0].fn === 'confirmRentPayment' && /Bonifico segnalato/.test(rep.title) && !ids.includes('pay_rep'),
    'Oggi: il bonifico segnalato è una card «verifica» con Registra incasso, MAI fra i ritardi col 📧 Sollecito', ids);
  const imp = r.decisions.find(d => d.id === 'pay_imp');
  ok(imp && imp.actions[0].fn === 'goTo' && imp.actions[0].args[0] === 'palazzo' && imp.actions.some(a => a.fn === 'confirmRentPayment')
    && !imp.actions.some(a => a.fn === 'sendPaymentReminder'),
    'Oggi: la rata del Palazzo (nessun account) porta al Palazzo e a Registra incasso, mai al Sollecito che dava «Inquilino non trovato»', imp && imp.actions);
  ok(!ids.includes('pay_pre') && r.cash.overdueCount === 2 && r.cash.reportedCount === 1 && r.cash.overdueTotal === 2520,
    'Oggi: il mese prima della gestione BOOM non è un arretrato; il polso conta 2 ritardi e 1 segnalato a parte', r.cash);
  const fns = new Set(r.decisions.flatMap(d => d.actions.map(a => a.fn)));
  const missing = [...fns].filter(fn => !new RegExp('(async\\s+)?function\\s+' + fn + '\\s*\\(').test(app));
  ok(!missing.length, 'Oggi: ogni azione dichiarata esiste in portal-app.js', missing);
  const MO = requireMutant('js/oggi-engine.js', '            if (RENT && RENT.paymentState) return RENT.paymentState(p, nowDate);\n', '');
  ok(MO.build(S, NOW).decisions.some(d => d.id === 'pay_rep'), 'mutazione: senza paymentState il segnalato torna fra i ritardi (il test lo vede)');
}

// ═══ 6. Journey e recensioni: fuori gli inquilini del Palazzo ═══════════════
{
  const { journeyEligible } = await import('../../api/journey/_run.js');
  const { reviewCandidates } = await import('../../api/reviews/_lib.js');
  const imp = { status: 'active', signatureStatus: 'paper', source: 'palazzo-import', startDate: '2026-10-08', tenantName: 'Ada', tenantPhone: '+39000', propertyId: 'p' };
  ok(!journeyEligible(imp) && !journeyEligible({ status: 'active', contractMissing: true }) && !journeyEligible({ status: 'active', signatureStatus: 'paper' })
    && journeyEligible({ status: 'active', startDate: '2026-10-01' }) && journeyEligible({ status: 'active', signatureStatus: 'complete' }),
    'journey: palazzo-import, carta e segnaposto fuori; legacy e firmati digitali dentro come prima');
  ok(reviewCandidates([{ id: 'c1', ...imp }, { id: 'c2', status: 'active', startDate: '2026-10-08', tenantPhone: '+39001', tenantName: 'Zoe' }], '2026-10-12').map(x => x.id).join() === 'c2',
    'recensioni: l\'inquilino del Palazzo non riceve la richiesta, gli altri sì');
  const MJ = await importMutant('api/journey/_run.js', '  if (CS.outOfJourney(c)) return false;\n', '');
  ok(MJ.journeyEligible(imp) === true, 'mutazione: senza outOfJourney il contratto su carta del Palazzo rientra nel journey (il test lo vede)');
}

// ═══ 7. La banca: la rata pagata al LOCATORE non si segna pagata da sola ════
{
  const B = await import('../../api/banking/_lib.js');
  const { payRef } = await import('../../api/payments/_ref.js');
  const tx = (amount, description) => ({ side: 'in', bookingDate: '2026-10-08', amount, description, counterparty: 'ACME SRL' });
  const imp = { id: 'pay_c11_2026-10', contractId: 'c11', amount: 1620, month: '2026-10', dueDate: '2026-10-05', status: 'pending', source: 'palazzo-import' };
  const nor = { id: 'pay_cN_2026-10', contractId: 'cN', amount: 900, month: '2026-10', dueDate: '2026-10-01', status: 'pending', tenantId: 't9' };
  const r1 = B.reconcile(tx(1620, 'Bonifico'), [imp, nor], {});
  ok(!r1.match && r1.suggestions.includes(imp.id), 'banca: un accredito di pari importo NON chiude la rata del Palazzo — solo suggerita', r1);
  const r2 = B.reconcile(tx(1620, 'Pagamento ' + payRef(imp.id)), [imp], {});
  ok(!r2.match && r2.suggestions[0] === imp.id, 'banca: nemmeno il codice in causale la segna pagata da sola (i soldi vanno al locatore)', r2);
  const r3 = B.reconcile(tx(900, 'Bonifico'), [imp, nor], {});
  ok(r3.match && r3.match.paymentId === nor.id, 'banca: la rata BOOM normale si abbina come prima', r3);
  // la rata nata DOPO la presa in carico (senza source sulla rata): la
  // marca il contratto
  const later = [{ ...nor, id: 'pay_cP_2026-10', contractId: 'cP' }];
  B.markLandlordDirect(later, [{ id: 'cP', source: 'palazzo-import' }]);
  ok(!B.reconcile(tx(900, 'Bonifico'), later, {}).match, 'banca: una rata di un contratto preso in carico (anche senza source sulla rata) resta solo un suggerimento');
  // il solo landlordIban (raccolto dalla Scheda anche sui contratti digitali,
  // i cui canoni arrivano sul conto BOOM) non spegne la riconciliazione
  const withIban = [{ ...nor }];
  B.markLandlordDirect(withIban, [{ id: 'cN', landlordIban: 'IT60X0542811101000000123456' }]);
  ok(!!(B.reconcile(tx(900, 'Bonifico'), withIban, {}).match || {}).paymentId, 'banca: un contratto digitale col solo landlordIban si abbina come prima');
  const MB = await importMutant('api/banking/_lib.js', '  if (toLandlordAccount(p)) return { match: null, suggestions: [p.id] };\n', '');
  ok(!!MB.reconcile(tx(1620, 'Bonifico'), [imp, nor], {}).match, 'mutazione: senza la guardia la rata del Palazzo si chiude da sola (il test lo vede)');
}

// ═══ 8. Le rate della firma digitale: mai una scadenza prima del periodo ════
{
  const { rentSchedule } = await import('../../api/magic-sign/submit.js');
  const r = rentSchedule({ startDate: '2026-09-15', endDate: '2027-08-14', rent: 1600, paymentDay: 5 });
  ok(r.length === 11 && r.every(x => x.dueDate >= x.periodFrom) && r[0].dueDate === '2026-09-15' && r[1].dueDate === '2026-10-15' && r[10].month === '2027-07',
    'firma digitale: contratto dal 15 → 11 rate, ogni scadenza dal primo giorno del suo periodo', r.map(x => x.dueDate));
  const r2 = rentSchedule({ startDate: '2026-11-01', endDate: '2027-04-30', rent: 900, paymentDay: 31 });
  ok(r2.map(x => x.dueDate).join() === '2026-11-30,2026-12-31,2027-01-31,2027-02-28,2027-03-31,2027-04-30',
    'firma digitale: giorno 31 tenuto dentro il mese (febbraio = 28, mai il 3 marzo)');
  const script = (file) => `import('file://${file}').then(m => { const r = m.rentSchedule({ startDate: '2026-09-15', endDate: '2027-08-14', rent: 1600, paymentDay: 5 }); console.log(JSON.stringify(r.map(x => [x.periodFrom, x.dueDate]))); });`;
  const runTz = (file) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script(file)], { env: { ...process.env, TZ: 'America/Los_Angeles' }, cwd: ROOT }).toString().trim().split('\n').pop());
  const la = runTz(path.join(ROOT, 'api/magic-sign/submit.js'));
  ok(la[0][1] === '2026-09-15' && la.every(([from, due]) => due >= from && from.endsWith('-15')),
    'firma digitale: a ovest di Greenwich (TZ America/Los_Angeles) le date restano quelle del contratto', la.slice(0, 2));
  const mf = mutantPath('api/magic-sign/submit.js',
    "    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);\n    const d = new Date(v);",
    "    const d = new Date(v);");
  let laMut; try { laMut = runTz(mf); } finally { dropMutant(mf); }
  ok(laMut[0][1] === '2026-09-14', 'mutazione: con la data letta in UTC la prima rata scade il 14, prima del periodo (il test lo vede)', laMut.slice(0, 1));
}

// ═══ 9. Gli euro del rendiconto e dei rapporti: €1.600, mai €1600 ══════════
{
  const { euro } = await import('../../api/employees/_lib.js');
  ok(euro(1600) === '€1.600' && euro(1620.5) === '€1.620,50' && euro(0) === '€0' && euro(-12.4) === '-€12,40' && euro(1234567) === '€1.234.567',
    'euro(): deterministico all\'italiana (migliaia col punto, centesimi solo se ci sono)', [euro(1600), euro(1620.5), euro(-12.4)]);
}

// ═══ 10. Il Gestore ═════════════════════════════════════════════════════════
{
  seedWorld();
  const gestore = (await import('../../api/employees/gestore.js')).default;
  const r = await call(gestore, { headers: asCron });
  const aq = keys('action_queue').map(read);
  const digest = (r.body && r.body.report && r.body.report.digest) || [];
  ok(r.statusCode === 200, 'gestore: giro completato', r.body);
  ok(!aq.some(a => /pay_c7_2026-10/.test(a.contextHash)) && digest.some(l => /💶 .*int\. 7.*bonifico segnalato/.test(l)),
    'gestore: il bonifico segnalato NON riceve «risulta ancora da saldare» — una riga «verifica l\'incasso»', { aq: aq.map(a => a.contextHash), digest });
  ok(!aq.some(a => /pay_c11_|pay_c7_2026-09/.test(a.contextHash)), 'gestore: nessuna email agli inquilini del Palazzo né per i mesi prima della gestione', aq.map(a => a.contextHash));
  const l11 = digest.find(l => /int\. 11/.test(l) && /in ritardo/.test(l));
  ok(l11 && /manda il link della rata dal Palazzo: https:\/\/www\.boomrome\.com\/rata\?id=pay_c11_2026-10&t=[0-9a-f]{24}/.test(l11),
    'gestore: per il Palazzo il digest porta il link /rata pronto (non un\'email inesistente)', l11);
  ok(!digest.some(l => /2026-09|settembre/.test(l) && /int\. 7/.test(l)), 'gestore: settembre (prima di BOOM) non è un arretrato');
  const en = aq.find(a => /pay_cN_2026-10/.test(a.contextHash));
  ok(en && en.payload.lang === 'en' && /^Hi Nora,/.test(en.payload.draft) && en.payload.draft.includes('https://www.boomrome.com/casa') && /Rent reminder October 2026/.test(en.payload.subject),
    'gestore: inquilino BOOM con account → sollecito in INGLESE col link per pagare (/casa)', en && en.payload);
  const it = aq.find(a => /pay_cM_2026-10/.test(a.contextHash));
  ok(it && it.payload.lang === 'it' && /il canone di ottobre 2026/.test(it.payload.draft) && /Promemoria canone ottobre 2026/.test(it.payload.subject),
    'gestore: italiano solo se dichiarato sul profilo', it && it.payload);
  const lia = aq.find(a => /pay_cL_2026-10/.test(a.contextHash));
  ok(lia && lia.payload.to === 'lia@example.invalid' && /https:\/\/www\.boomrome\.com\/rata\?id=pay_cL_2026-10&t=/.test(lia.payload.draft),
    'gestore: un contratto senza account (non del Palazzo) riceve l\'email col link della rata, senza login', lia && lia.payload);
  ok(!aq.some(a => /pay_cN_2026-09/.test(a.contextHash)) && r.body.counts.remindersSkippedRecent >= 1,
    'gestore: la rata che ha ricevuto il link ieri (dunningHistory) non riceve un\'email oggi', r.body.counts);
  ok(!aq.some(a => /gestore:sign:c7/.test(a.contextHash)) && !digest.some(l => /✍️.*int\. 7/.test(l)),
    'gestore: il contratto su carta non riceve solleciti di firma anche coi token coniati per sbaglio');
  ok(!digest.some(l => /int\. 7/.test(l) && /(Registrazione contratto|Imposta di registro|Deposito cauzionale|APE)/.test(l)),
    'gestore: niente scadenze false sul contratto registrato del Palazzo (RLI, registro, deposito, APE prima di BOOM)', digest.filter(l => /int\. 7/.test(l)));
  // mutazione: il vecchio filtro (status != paid) → il segnalato riceve il
  // sollecito. Sullo STESSO scenario (int. 7 con un account, così l'email
  // sarebbe possibile) il file vero tace e la copia col difetto propone.
  seedWorld();
  seed('users/t7', { role: 'tenant', name: 'Ada Uno', email: 'ada@example.invalid' });
  const c7 = read('contracts/c7'); seed('contracts/c7', { ...c7, tenantId: 't7', source: null });
  await call(gestore, { headers: asCron });
  ok(!keys('action_queue').map(read).some(a => /pay_c7_2026-10/.test(a.contextHash)), 'gestore: anche con un account il bonifico segnalato non riceve il sollecito');
  for (const k of keys('action_queue')) DB.delete(k);
  const MG = await importMutant('api/employees/gestore.js', 'const state = RENT.paymentState(p, now);', "const state = 'overdue';");
  await call(MG.default, { headers: asCron });
  ok(keys('action_queue').map(read).some(a => /pay_c7_2026-10/.test(a.contextHash)), 'mutazione: senza paymentState il bonifico segnalato riceve il sollecito (il test lo vede)');
}

// ═══ 11. Il Contabile ═══════════════════════════════════════════════════════
{
  seedWorld();
  const contabile = (await import('../../api/employees/contabile.js')).default;
  const r = await call(contabile, { headers: asCron, query: { dry: '1' } });
  const rep = r.body && r.body.report || {};
  ok(r.statusCode === 200 && !rep.late.some(l => l.paymentId === 'pay_c7_2026-10') && rep.reported.some(l => l.paymentId === 'pay_c7_2026-10'),
    'contabile: il bonifico segnalato non è «in ritardo», è «da verificare»', { late: rep.late, reported: rep.reported });
  ok(!rep.late.some(l => l.paymentId === 'pay_c7_2026-09'), 'contabile: il mese prima della gestione non è un ritardo');
  const all = (rep.obligations.overdue || []).concat(rep.obligations.dueSoon || []);
  ok(!all.some(o => /rli_c7/.test(o.key)) && !all.some(o => /imu_acconto_plz/.test(o.key)), 'contabile: niente RLI per il registrato, niente IMU di giugno prima della gestione', all.map(o => o.key));
  const withProp = all.filter(o => o.party === 'landlord');
  ok(withProp.length > 0 && withProp.every(o => o.property && o.property !== '—'), 'contabile: ogni scadenza di un immobile dice QUALE immobile', withProp.map(o => [o.key, o.property]));
}

// ═══ 12. Firma: carta e segnaposto non si firmano, e non si conia niente ════
{
  seedWorld();
  DB.delete('signTokens/c7');
  const links = (await import('../../api/sign/links.js')).default;
  const sendLink = (await import('../../api/sign/send-link.js')).default;
  const r1 = await call(links, { headers: asAdmin, body: { contractId: 'c7' } });
  ok(r1.statusCode === 409 && r1.body.error === 'not_signable' && r1.body.reason === 'paper' && !DB.has('signTokens/c7'),
    'sign/links: contratto su carta → 409 not_signable (paper), nessun token coniato', r1.body);
  const r2 = await call(links, { headers: asAdmin, body: { contractId: 'c14' } });
  ok(r2.statusCode === 409 && r2.body.reason === 'contract_missing' && !DB.has('signTokens/c14'), 'sign/links: segnaposto → contract_missing', r2.body);
  const r3 = await call(links, { headers: { authorization: 'Bearer tok-own2' }, body: { contractId: 'c7' } });
  ok(r3.statusCode === 403, 'sign/links: chi non è proprietario riceve 403 prima di sapere che tipo di contratto è');
  seed('contracts/cD', { propertyId: 'pN', status: 'active', tenantId: 't9', tenantName: 'Nora Nove', startDate: '2026-11-01', endDate: '2027-10-31', rent: 900 });
  const r4 = await call(links, { headers: asAdmin, body: { contractId: 'cD' } });
  ok(r4.statusCode === 200 && /\/sign\?sign=/.test(r4.body.tenant || '') && DB.has('signTokens/cD'), 'sign/links: un contratto digitale riceve i suoi link come prima', r4.body);
  // un token coniato PRIMA della guardia (un vecchio tap su «Firma ora»):
  // il link riaperto non firma un contratto su carta
  seed('signTokens/c7', { contractId: 'c7', tenant: '11111111-2222-3333-4444-555555555555', landlord: '66666666-7777-8888-9999-000000000000' });
  const submit = (await import('../../api/magic-sign/submit.js')).default;
  const sig = 'data:image/png;base64,' + 'A'.repeat(400);
  const r6 = await call(submit, { headers: { 'x-forwarded-for': '10.9.9.9' }, body: { token: '11111111-2222-3333-4444-555555555555', signature: sig, consent: { text: 'x', hash: 'y' } } });
  const c7after = read('contracts/c7');
  ok(r6.statusCode === 409 && r6.body.error === 'not_signable' && r6.body.reason === 'paper' && !c7after.tenantSignature && c7after.signatureStatus === 'paper',
    'magic-sign/submit: un vecchio link non firma digitalmente un contratto su carta (409, nessuna scrittura)', r6.body);
  DB.delete('signTokens/c7');
  const mails = (globalThis.__mails || []).length;
  const r5 = await call(sendLink, { headers: asAdmin, body: { contractId: 'c7', role: 'tenant' } });
  ok(r5.statusCode === 409 && r5.body.error === 'not_signable' && (globalThis.__mails || []).length === mails && !DB.has('signTokens/c7'),
    'sign/send-link: nessun invito a firmare un contratto su carta, nessuna email', r5.body);
}

// ═══ 13. send-sign: la PROPRIETÀ, non solo il ruolo (lacuna 0) ══════════════
{
  seedWorld();
  seed('preAgreements/pa1', { status: 'sent', propertyId: 'plz7', ref: 'BOOM-TEST1', tenant: { fullName: 'Prova' } });
  seed('preAgreements/pa2', { status: 'accepted', ref: 'BOOM-TEST2' });
  const sendSign = (await import('../../api/preagreement/send-sign.js')).default;
  const before = DB.size;
  const r1 = await call(sendSign, { headers: { authorization: 'Bearer tok-own2' }, body: { id: 'pa1' } });
  ok(r1.statusCode === 403 && r1.body.error === 'forbidden_property' && DB.size === before, 'send-sign: un proprietario sulla proposta di un ALTRO immobile → 403, zero scritture', r1.body);
  const r2 = await call(sendSign, { headers: { authorization: 'Bearer tok-own1' }, body: { id: 'pa1' } });
  ok(r2.statusCode === 409 && r2.body.error === 'not_accepted_yet', 'send-sign: la proprietaria del SUO immobile passa il controllo (poi le regole di sempre)', r2.body);
  const r3 = await call(sendSign, { headers: { authorization: 'Bearer tok-own1' }, body: { id: 'pa2', createProperty: true } });
  ok(r3.statusCode === 403 && !keys('contracts').some(k => /pa2/.test(k)) && !keys('properties').some(k => /pa2/.test(k)),
    'send-sign: proposta senza immobile + proprietario → 403 (creare immobili dalla proposta resta all\'admin)', r3.body);
  const r4 = await call(sendSign, { headers: asAdmin, body: { id: 'pa1' } });
  ok(r4.statusCode === 409 && r4.body.error === 'not_accepted_yet', 'send-sign: l\'admin come prima');
}

// ═══ 14. Fascicolo, ASPI e allega: carta = scansione, segnaposto = niente ════
{
  seedWorld();
  const fascicolo = (await import('../../api/fiscal/fascicolo.js')).default;
  const r1 = await call(fascicolo, { headers: asAdmin, body: { contractId: 'c14' } });
  ok(r1.statusCode === 409 && r1.body.error === 'contract_missing' && !UPLOADS.length, 'fascicolo: segnaposto → 409 contract_missing, nessun PDF di puntini', r1.body);
  const A = await import('../../api/fiscal/_aspi.js');
  const c7 = { id: 'c7', ...read('contracts/c7') };
  const row = A.aspiChecklist(c7, read('properties/plz7'), 'registrazione').find(i => i.key === 'contratto');
  ok(row.state === 'missing' && row.blocking && /scansione/.test(row.hint) && !/Rigenera/.test(row.hint),
    'ASPI: contratto su carta senza scansione → blocca e chiede la SCANSIONE (mai «Rigenera PDF» dal modello BOOM)', row);
  const row2 = A.aspiChecklist({ ...c7, generatedPDF: 'https://x/model.pdf', paperPdfUrl: 'https://x/carta.pdf' }, {}, 'registrazione').find(i => i.key === 'contratto');
  ok(row2.state === 'ok' && row2.url === 'https://x/carta.pdf' && !row2.blocking, 'ASPI: con la scansione la voce è a posto e allega QUELLA (non il modello)', row2);
  const row3 = A.aspiChecklist({ id: 'c14', ...read('contracts/c14') }, {}, 'registrazione').find(i => i.key === 'contratto');
  ok(row3.blocking && /non ancora in archivio/.test(row3.label), 'ASPI: segnaposto → bloccato con la ragione giusta', row3);
  const s1 = await A.sendAspiRequest('c14', { settings: await A.loadAspiSettings() });
  ok(s1.ok === false && s1.error === 'contract_missing' && !(globalThis.__mails || []).length, 'ASPI: invio di un segnaposto → contract_missing, nessuna email', s1);
  const allega = (await import('../../api/fiscal/allega.js')).default;
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 contratto firmato su carta').toString('base64');
  const a1 = await call(allega, { headers: asAdmin, body: { contractId: 'c7', key: 'contratto', base64: pdf, contentType: 'application/pdf', name: 'contratto.pdf' } });
  const c7b = read('contracts/c7');
  ok(a1.statusCode === 200 && /contracts%2Fc7%2Fcontratto-carta-\d+\.pdf/.test(c7b.paperPdfUrl || '') && c7b.paperPdfBy && c7b.pdfSource === 'paper'
    && a1.body.kinds.registrazione.find(i => i.key === 'contratto').state === 'ok',
    'allega: la scansione del contratto su carta va su paperPdfUrl (path del Palazzo) e la voce passa a ✓', { url: c7b.paperPdfUrl, code: a1.statusCode });
  const a2 = await call(allega, { headers: asAdmin, body: { contractId: 'c7', key: 'contratto', base64: Buffer.from('non un pdf').toString('base64'), contentType: 'application/pdf' } });
  ok(a2.statusCode === 400 && a2.body.error === 'pdf_required', 'allega: un file che non è un PDF non diventa il contratto', a2.body);
  const a3 = await call(allega, { headers: asAdmin, body: { contractId: 'c14', key: 'contratto', base64: pdf } });
  ok(a3.statusCode === 409 && a3.body.error === 'contract_missing', 'allega: su un segnaposto → contract_missing', a3.body);
}

// ═══ 15. Il radar dei rischi e il digest di Homie ═══════════════════════════
{
  seedWorld();
  const { scan } = await import('../../api/agent/risk.scan.js');
  const r = await scan(60);
  const label7 = 'Piazzale Esempio 42 int. 7';
  ok(!r.items.some(i => i.cat === 'Firma mancante' && (i.ref === 'c7' || i.ref === 'c11' || i.ref === 'c14')), 'risk.scan: nessuna «Firma mancante» su carta o segnaposto',
    r.items.filter(i => i.cat === 'Firma mancante'));
  ok(r.items.some(i => i.cat === 'Bonifico segnalato' && i.ref === 'pay_c7_2026-10') && !r.items.some(i => i.cat === 'Pagamento in ritardo' && /pay_c7_/.test(i.ref)),
    'risk.scan: il segnalato è «da verificare», settembre prima di BOOM non c\'è');
  ok(!r.items.some(i => /Burocrazia/.test(i.cat) && i.title === label7 && /(Registrazione|registro|Deposito|APE)/.test(i.detail)), 'risk.scan: nessuna burocrazia falsa sul contratto registrato');
  const digest = (await import('../../api/agent/digest.js')).default;
  const d = await call(digest, { headers: { 'x-homie-secret': 'homie-test' }, body: {} });
  const text = JSON.stringify(d.body || {});
  ok(d.statusCode === 200 && !/int\. 7 — firma mancante/.test(text) && /bonifico segnalato/.test(text), 'digest di Homie: niente firme mancanti false, il segnalato detto per quello che è');
  // la fotografia per Homie (state.snapshot): stessi fatti
  const { snapshot } = await import('../../api/agent/state.snapshot.js');
  const snap = await snapshot('all');
  const unsignedOld = keys('contracts').map(read).filter(c => !c.landlordSignature || !c.tenantSignature).length;
  ok(snap.contracts.unsigned < unsignedOld && snap.payments.reported >= 1,
    'state.snapshot: carta e segnaposto non sono «non firmati», il segnalato contato a parte', { unsigned: snap.contracts.unsigned, unsignedOld, payments: snap.payments });
  const MS = await importMutant('api/agent/state.snapshot.js', '!CS.notSignable(c) && ', '');
  const snapM = await MS.snapshot('contracts');
  ok(snapM.contracts.unsigned === unsignedOld, 'mutazione: senza la guardia la fotografia conta i contratti su carta fra i non firmati (il test lo vede)', { m: snapM.contracts.unsigned, unsignedOld });
}

// ═══ 16. Telegram e la coda del Mac: la card nuova arriva sempre ════════════
{
  seedWorld();
  // 120 card vecchie ancora 'pending' (auto-id: ordinate per NOME, metà
  // prima di 'p'), alcune già oltre i 14 giorni; poi la segnalazione di oggi.
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let sd = 7; const rnd = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648;
  const auto = () => Array.from({ length: 20 }, () => ALPHA[Math.floor(rnd() * 62)]).join('');
  for (let i = 0; i < 120; i++) {
    const old = new RealDate(RealDate.parse(NOW) - (i < 20 ? 20 : 3) * 86400000).toISOString();
    seed('agentNotifications/' + auto(), { type: 'contract.signed', status: 'pending', priority: i % 2 ? 'high' : 'low', summary: 'vecchia', createdAt: old, telegramNotifiedAt: old });
  }
  seed('agentNotifications/payrep_pay_c7_2026-10_1', { type: 'payment.reported', status: 'pending', priority: 'high', summary: '💶 int. 7 dice di aver pagato', createdAt: new RealDate(RealDate.parse(NOW) - 60000).toISOString() });
  seed('agentNotifications/maint_m1', { type: 'maintenance.opened', status: 'pending', priority: 'urgent', summary: '🔧 int. 11 — perdita', createdAt: new RealDate(RealDate.parse(NOW) - 30000).toISOString() });
  const legacyWindow = keys('agentNotifications').sort().slice(0, 50);
  ok(!legacyWindow.some(k => /payrep_|maint_/.test(k)), 'premessa: con la vecchia lettura (50 per nome) le due card nuove restano FUORI dalla finestra');
  const notify = (await import('../../api/telegram/notify-pending.js')).default;
  const r = await call(notify, { method: 'GET', headers: { authorization: 'Bearer cron-test' } });
  ok(r.statusCode === 200 && TG.some(t => /dice di aver pagato/.test(t)) && TG.some(t => /perdita/.test(t)),
    'notify-pending: il bonifico segnalato e il guasto arrivano su Telegram anche con 120 card vecchie in coda', r.body && r.body.events);
  ok(TG.findIndex(t => /perdita/.test(t)) < TG.findIndex(t => /dice di aver pagato/.test(t)), 'notify-pending: l\'urgente prima');
  const expired = keys('agentNotifications').map(read).filter(d => d.status === 'expired');
  ok(expired.length === 20 && expired.every(d => d.expiredBy === 'sweeper') && read('agentNotifications/payrep_pay_c7_2026-10_1').status === 'pending',
    'spazzino: le card oltre 14 giorni passano a «expired» (mai cancellate), le nuove restano', { expired: expired.length, sweep: r.body && r.body.sweep });
  const r2 = await call(notify, { method: 'GET', headers: { authorization: 'Bearer cron-test' } });
  ok(r2.body.sweep && r2.body.sweep.skipped === 'recent', 'spazzino: una volta l\'ora, non a ogni minuto', r2.body.sweep);
  const queue = (await import('../../api/agent/queue.js')).default;
  const q = await call(queue, { headers: { 'x-homie-secret': 'homie-test' }, body: { limit: 5 } });
  ok(q.statusCode === 200 && q.body.items.some(i => i.id === 'payrep_pay_c7_2026-10_1') && q.body.items.some(i => i.id === 'maint_m1'),
    'coda del Mac: la segnalazione di oggi viene reclamata (non affamata dalle vecchie)', q.body.items.map(i => i.id));
  // mutazione: la vecchia lettura per status, limit 50 senza ordine
  seed('agentNotifications/payrep_pay_c7_2026-10_2', { type: 'payment.reported', status: 'pending', priority: 'high', summary: '💶 int. 7 bis', createdAt: new RealDate(RealDate.parse(NOW) - 1000).toISOString() });
  TG.length = 0;
  const MN = await importMutant('api/telegram/notify-pending.js', "events = await pendingNotifications({ days: 2, limit: 60, legacyLimit: 50 });",
    "events = await fsList('agentNotifications', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 50 });");
  await call(MN.default, { method: 'GET', headers: { authorization: 'Bearer cron-test' } });
  ok(!TG.some(t => /int\. 7 bis/.test(t)), 'mutazione: con la vecchia lettura la card nuova non arriva (il test lo vede)');
}

// ═══ 17. WhatsApp e telefono: l'inquilino del contratto non è un lead ═══════
{
  seedWorld();
  const LEAD = await import('../../api/homie/_lead.js');
  LEAD.resetTenantIndex();
  ok(LEAD.phoneKeys('390000000044').includes('+390000000044') && LEAD.phoneKeys('+39 000 000 0045').includes('+390000000045'),
    'phoneKeys: il JID senza «+» e la forma con gli spazi trovano la stessa chiave');
  const idx = LEAD.buildTenantIndex([read('contracts/c7') && { id: 'c7', ...read('contracts/c7') }, { id: 'cOld', status: 'expired', endDate: '2024-01-31', tenantPhone: '+39 000 000 0099' }], RealDate.parse(NOW));
  ok(idx.has('+390000000001') && idx.has('+390000000012') && !idx.has('+390000000099'), 'indice: titolare e co-intestatario dei contratti vivi; un contratto finito da anni no');
  const hit = await LEAD.contractTenantByPhone('+390000000001');
  ok(hit && hit.contractId === 'c7' && hit.propertyLabel === 'Piazzale Esempio 42 int. 7' && hit.role === 'tenant', 'contractTenantByPhone: il conduttore con l\'interno nel contesto', hit);
  const message = (await import('../../api/homie/message.js')).default;
  const wa = (phone, text, id) => call(message, { headers: { 'x-homie-secret': 'homie-test' }, body: { direction: 'in', channel: 'whatsapp', phone, body: text, messageId: id } });
  const m1 = await wa('+390000000001', 'I made the bank transfer for October, receipt attached', 'wa1');
  const conv = read('conversations/conv_whatsapp_390000000001') || {};
  ok(m1.statusCode === 200 && !keys('leads').length && m1.body.tenant === true && conv.contactRole === 'tenant'
    && conv.tenantContractId === 'c7' && conv.tenantPropertyLabel === 'Piazzale Esempio 42 int. 7' && conv.contactName === 'Ada Uno',
    'WhatsApp: «ho fatto il bonifico» dal numero del contratto → nessun lead, la chat dice inquilina di int. 7', { body: m1.body, conv });
  const m2 = await wa('+390000000012', 'The shower in int. 7 is leaking', 'wa2');
  ok(m2.statusCode === 200 && !keys('leads').length && (read('conversations/conv_whatsapp_390000000012') || {}).contactRole === 'cotenant',
    'WhatsApp: anche il co-intestatario è riconosciuto (nessun lead)');
  const m3 = await wa('+390000000077', 'Hi, is the apartment in Trastevere still available?', 'wa3');
  ok(m3.statusCode === 200 && keys('leads').length === 1, 'WhatsApp: uno sconosciuto vero diventa ancora un lead (controllo)', m3.body);
  LEAD.resetTenantIndex();
  const MM = await importMutant('api/homie/message.js', 'try { tenantMatch = await contractTenantByPhone(body.phone || contactPhone); }', 'try { tenantMatch = null; }');
  const leadsBefore = keys('leads').length;
  await call(MM.default, { headers: { 'x-homie-secret': 'homie-test' }, body: { direction: 'in', channel: 'whatsapp', phone: '+390000000001', body: 'Also: the heating is off since yesterday', messageId: 'wa4' } });
  ok(keys('leads').length === leadsBefore + 1, 'mutazione: senza il riconoscimento l\'inquilina diventa un lead (il test lo vede)');

  // telefono: la segreteria (handler VERO) — inbound poi registrazione
  seedWorld();
  LEAD.resetTenantIndex();
  const P = await import('../../api/phone/_lib.js');
  const res = await P.resolveCaller('+390000000001');
  ok(res && res.type === 'tenant' && res.entity._contract && P.callerLabel(res, '+390000000001') === 'Ada Uno — inquilino di Piazzale Esempio 42 int. 7',
    'telefono: resolveCaller riconosce l\'inquilina del contratto, col suo interno', res);
  const card = P.tgCallCard({ callerName: P.callerLabel(res), callerType: 'tenant', from: '+390000000001', durationSec: 10, analysis: P.fallbackAnalysis(''), transcript: null });
  ok(/inquilino di Piazzale Esempio 42 int\. 7/.test(card) && !/🏠 inquilino/.test(card) && !/lead creato/.test(card), 'telefono: la card dice «inquilino di … int. 7», senza badge doppio');
  const inbound = (await import('../../api/phone/inbound.js')).default;
  const recording = (await import('../../api/phone/recording.js')).default;
  const KEY = P.phoneKey('homie-test');
  await call(inbound, { query: { k: KEY }, headers: { host: 'boomrome.com' }, body: { CallSid: 'CA7', From: '+39 000 000 0001', To: '+390600000000' } });
  TG.length = 0;
  const rc = await call(recording, { query: { k: KEY }, body: { CallSid: 'CA7', RecordingStatus: 'completed', RecordingDuration: '20', RecordingUrl: 'https://api.twilio.com/x/Recordings/RE7' } });
  const pc = read('phoneCalls/CA7') || {};
  ok(rc.statusCode === 200 && !keys('leads').length && pc.callerType === 'tenant' && /inquilino di Piazzale Esempio 42 int\. 7/.test(pc.callerName || '')
    && TG.some(t => /inquilino di Piazzale Esempio 42 int\. 7/.test(t) && !/lead creato/.test(t)),
    'segreteria (handler vero): la telefonata dell\'inquilina NON crea un lead e la card dice chi è', { pc: { callerType: pc.callerType, callerName: pc.callerName }, out: rc.body });
}

// ═══ 18. La scala della fiducia: il sollecito nuovo riparte da zero ══════════
// Il testo di gestore:payrem è cambiato (lingua, link, mai al segnalato):
// i sì dati al testo vecchio non provano quello nuovo. Senza la data di
// taglio, 40 approvazioni d'agosto basterebbero a farlo partire da solo.
{
  const FID = require('../../js/fiducia-engine.js');
  const old = Array.from({ length: 40 }, (_, i) => ({ contextHash: 'gestore:payrem:p' + i + ':2026-W33', status: 'approved', createdAt: '2026-08-1' + (i % 9) + 'T09:00:00Z' }));
  const fresh = Array.from({ length: 3 }, (_, i) => ({ contextHash: 'gestore:payrem:q' + i + ':2026-W42', status: 'approved', createdAt: { seconds: RealDate.parse('2026-10-12T10:00:00Z') / 1000 } }));
  const noDate = [{ contextHash: 'gestore:payrem:z:2026-W40', status: 'approved' }];
  const follow = Array.from({ length: 5 }, (_, i) => ({ contextHash: 'commerciale:followup:l' + i, status: 'approved', createdAt: '2026-08-10T09:00:00Z' }));
  const st = FID.statsFor(old.concat(fresh, noDate, follow));
  ok(st['gestore:payrem'].decided === 3 && st['commerciale:followup'].decided === 5,
    'fiducia: per il sollecito contano solo le decisioni sul testo NUOVO (le altre categorie come prima)', st);
  const cfg = FID.mergeConfig({ enabled: true, categories: { 'gestore:payrem': true } }).cfg;
  const v = FID.autoVerdict({ action: { contextHash: 'gestore:payrem:x:2026-W42', payload: { to: 'nora@example.invalid' } }, stats: FID.statsFor(old.concat(fresh)), cfg, now: RealDate.parse(NOW) });
  ok(v.auto === false && /campione insufficiente/.test(v.why), 'fiducia: 40 sì al testo vecchio non bastano a mandare da solo il sollecito nuovo', v);
  const MF = requireMutant('js/fiducia-engine.js', "      if (SINCE[key] && msOf(a && a.createdAt) < SINCE[key]) return;\n", '');
  ok(MF.statsFor(old.concat(fresh))['gestore:payrem'].decided === 43, 'mutazione: senza la data di taglio il testo vecchio fa da campione (il test lo vede)');
}

// ═══ 19. Revisione del 13/10/2026 ═══════════════════════════════════════════
// 19a. Il fatto condiviso per le strade che generano il PDF dal modello BOOM.
{
  ok(CS.noModelPdf({ signatureStatus: 'paper' }) && CS.noModelPdf({ contractMissing: true })
    && !CS.noModelPdf({ signatureStatus: 'complete' }) && !CS.noModelPdf({ signatureStatus: 'none' }) && !CS.noModelPdf(null),
    'noModelPdf: carta e segnaposto non ricevono il PDF del modello BOOM; i contratti digitali sì');
}

// 19b. Il sollecito in inglese scrive gli euro all'inglese: €1,620.50, mai
// «€1.620,50» (che un inglese legge un euro e sessantadue).
{
  const { euro, euroEn, euroFor } = await import('../../api/employees/_lib.js');
  ok(euroEn(1600) === '€1,600' && euroEn(1620.5) === '€1,620.50' && euroEn(900) === '€900' && euroEn(-12.4) === '-€12.40' && euroEn(1234567) === '€1,234,567',
    'euroEn(): deterministico all\'inglese (migliaia con la virgola, centesimi col punto)', [euroEn(1600), euroEn(1620.5), euroEn(-12.4)]);
  ok(euroFor(1600, 'it') === euro(1600) && euroFor(1600, 'en') === '€1,600' && euroFor(1600, undefined) === '€1,600',
    'euroFor(): italiano solo per \'it\', inglese per tutto il resto');
  const scenario = async (mod) => {
    seedWorld();
    seed('payments/pay_cN_2026-10', { contractId: 'cN', propertyId: 'pN', tenantId: 't9', type: 'rent', month: '2026-10', amount: 1620.5, dueDate: '2026-10-01', status: 'pending' });
    seed('payments/pay_cM_2026-10', { contractId: 'cM', propertyId: 'pM', tenantId: 't10', type: 'rent', month: '2026-10', amount: 1250, dueDate: '2026-10-01', status: 'pending' });
    await call(mod.default, { headers: asCron });
    const aq = keys('action_queue').map(read);
    return { en: aq.find(a => /pay_cN_2026-10/.test(a.contextHash)), it: aq.find(a => /pay_cM_2026-10/.test(a.contextHash)) };
  };
  const { en, it } = await scenario(await import('../../api/employees/gestore.js'));
  ok(en && en.payload.draft.includes('€1,620.50') && !/€1\.620/.test(en.payload.draft),
    'gestore: la bozza in inglese dice «€1,620.50» (mai «€1.620,50»)', en && en.payload.draft);
  ok(en && /€1\.620,50/.test(en.summary || ''), 'gestore: il riassunto per l\'operatore resta all\'italiana', en && en.summary);
  ok(it && it.payload.draft.includes('€1.250') && !it.payload.draft.includes('€1,250'), 'gestore: la bozza in italiano resta «€1.250»', it && it.payload.draft);
  const MG = await importMutant('api/employees/gestore.js', 'amount: euroFor(p.amount, lang)', 'amount: euro(p.amount)');
  const mut = await scenario(MG);
  ok(mut.en && /€1\.620,50/.test(mut.en.payload.draft), 'mutazione: con euro() la bozza inglese torna «€1.620,50» (il test lo vede)', mut.en && mut.en.payload.draft);
}

// 19c. La checklist ASPI dice solo cose che si possono fare da dove sei.
{
  seedWorld();
  const A = await import('../../api/fiscal/_aspi.js');
  const row = A.aspiChecklist({ id: 'c7', ...read('contracts/c7') }, read('properties/plz7'), 'registrazione').find(i => i.key === 'contratto');
  ok(row.state === 'missing' && !/📎/.test(row.hint) && /Palazzo/.test(row.hint) && row.allegabile === true && row.accept === 'application/pdf',
    'ASPI: per la scansione su carta il suggerimento rimanda al Palazzo (niente 📎 che il pannello non mostra) e la voce si dichiara allegabile in PDF', row);
  const dig = A.aspiChecklist({ id: 'cD', generatedPDF: 'https://x/m.pdf' }, {}, 'registrazione').find(i => i.key === 'contratto');
  ok(!dig.allegabile, 'ASPI: il contratto digitale non è «allegabile» (il PDF si genera o si corregge)', dig);
}

// 19d. L'asseverazione: un contratto preso in carico non è un allarme quotidiano.
{
  const C = require('../../js/compliance-rules.js');
  const today = new Date(NOW);
  const c7 = { id: 'c7', type: 'studenti', rent: 1600, deposit: 3200, startDate: '2026-09-15', endDate: '2027-08-14', cedolareSecca: 'no',
    rliRegisteredAt: '2026-09-20', registrationStatus: 'registered', signatureStatus: 'paper', source: 'palazzo-import' };
  const st = (c, mod = C) => Object.fromEntries(mod.obligationsFor(c, { tenant: {}, today, property: { gestioneDal: '2026-10' } }).map(o => [o.code, mod.statusOf(o, {}, today, 14)]));
  ok(st(c7).ASSEVERAZIONE === 'na', 'compliance: contratto preso in carico → asseverazione «na» (atto della firma su carta), non «in scadenza» ogni mattina', st(c7));
  ok(st({ ...c7, requiresAsseverazione: true }).ASSEVERAZIONE === 'due_soon', 'compliance: se qualcuno DICHIARA che va fatta (requiresAsseverazione), torna visibile');
  const boom = { ...c7, source: undefined, signatureStatus: 'complete' };
  ok(st(boom).ASSEVERAZIONE === 'due_soon', 'compliance: per un contratto BOOM l\'asseverazione resta un adempimento vero', st(boom));
  ok(st({ ...boom, asseverazioneStatus: 'done' }).ASSEVERAZIONE === 'done' && st({ ...boom, requiresAsseverazione: false }).ASSEVERAZIONE === 'na',
    'compliance: «CAF ✓» (asseverazioneStatus) la chiude, «Non richiesta» (requiresAsseverazione false) la toglie — gli stessi campi del badge del portal');
  const MA = requireMutant('js/compliance-rules.js', "      if (String(c.source || '') === 'palazzo-import' && c.requiresAsseverazione !== true) it.na = 'presa-in-carico';\n", '');
  ok(st(c7, MA).ASSEVERAZIONE === 'due_soon', 'mutazione: senza la regola il contratto del Palazzo torna «in scadenza» (il test lo vede)');
  // i handler veri: digest del Gestore e radar dei rischi
  seedWorld();
  const gestore = (await import('../../api/employees/gestore.js')).default;
  const g = await call(gestore, { headers: asCron });
  const digest = (g.body && g.body.report && g.body.report.digest) || [];
  ok(g.statusCode === 200 && !digest.some(l => /int\. (7|11|14)/.test(l) && /Attestazione/.test(l)),
    'gestore: nessuna «Attestazione / asseverazione … in scadenza» sui contratti del Palazzo', digest.filter(l => /Attestazione/.test(l)));
  const { scan } = await import('../../api/agent/risk.scan.js');
  const r = await scan(60);
  ok(!r.items.some(i => /Burocrazia/.test(i.cat) && /int\. (7|11|14)/.test(i.title || '') && /asseverazione/i.test(i.detail || i.title || '')),
    'risk.scan: nessuna asseverazione falsa sui contratti del Palazzo', r.items.filter(i => /assever/i.test((i.detail || '') + (i.title || ''))));
}

// 19e. Le rate: la firma digitale e il generatore del portal danno lo STESSO
// piano (id pay_<contratto>_<mese> condiviso: la stessa rata non può avere
// due scadenze secondo la porta da cui nasce). Il generatore del portal si
// esegue VERO, estratto da js/portal-app.js con un Firestore finto.
{
  const { rentSchedule } = await import('../../api/magic-sign/submit.js');
  const src = readFileSync(path.join(ROOT, 'js/portal-app.js'), 'utf8');
  const head = 'async function generateMonthlyPayments(contractId, contract) {';
  const at = src.indexOf(head);
  let depth = 0, end = -1;
  for (let i = at + head.length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const body = src.slice(at, end);
  const portalPlan = async (contract) => {
    const sets = [];
    const db = {
      collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }), doc: (id) => ({ id }) }),
      batch: () => ({ set: (ref, data) => sets.push({ id: ref.id, ...data }), commit: async () => {} }),
    };
    const firebase = { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } };
    const quiet = { log() {}, warn() {} };
    const gen = new Function('db', 'firebase', 'console', body + '\nreturn generateMonthlyPayments;')(db, firebase, quiet);
    await gen('cX', contract);
    return sets.map(s => [s.month, s.dueDate, s.amount, s.installmentMonths, s.coversTo].join('|'));
  };
  const serverPlan = (contract, fn = rentSchedule) => fn(contract).map(s => [s.month, s.dueDate, s.amount, s.installmentMonths, s.coversTo].join('|'));
  const cases = [];
  for (const start of ['2026-09-01', '2026-09-15', '2026-01-31', '2026-10-28', '2026-03-10']) {
    for (const step of [1, 3, 6]) {
      for (const payDay of [1, 5, 10, 15, 28]) {
        const s = new Date(start + 'T00:00:00Z');
        const e = new Date(Date.UTC(s.getUTCFullYear() + 1, s.getUTCMonth(), s.getUTCDate() - 1)).toISOString().slice(0, 10);
        cases.push({ startDate: start, endDate: e, rent: 1250, paymentDay: payDay, installmentMonths: step });
      }
    }
  }
  let diff = null;
  for (const c of cases) {
    const a = serverPlan(c).join(';'), b = (await portalPlan(c)).join(';');
    if (a !== b) { diff = { c, server: a.slice(0, 200), portal: b.slice(0, 200) }; break; }
  }
  ok(body.length > 200 && !diff, 'rate: firma digitale e portal danno lo stesso piano (75 contratti: inizio a metà mese, fine mese, cadenze 1/3/6, giorni 1–28)', diff);
  // giorni 29–31: la firma digitale tiene la scadenza DENTRO il mese; il
  // portal oggi la fa rotolare al mese dopo (da allineare in js/portal-app.js,
  // filone portal) — qui si conta, non si fallisce
  let roll = 0;
  for (const payDay of [29, 30, 31]) {
    const c = { startDate: '2026-11-01', endDate: '2027-10-31', rent: 900, paymentDay: payDay };
    const a = serverPlan(c), b = await portalPlan(c);
    roll += a.filter((x, i) => x !== b[i]).length;
  }
  console.log(`  ℹ rate col giorno 29–31: ${roll} scadenze diverse fra firma digitale e portal (da allineare in js/portal-app.js)`);
  const MS = await importMutant('api/magic-sign/submit.js', '    if (due < periodStart) due = periodStart;\n', '');
  let mdiff = false;
  for (const c of cases) { if (serverPlan(c, MS.rentSchedule).join(';') !== (await portalPlan(c)).join(';')) { mdiff = true; break; } }
  ok(mdiff, 'mutazione: senza «mai prima del periodo» i due piani divergono (il test lo vede)');
}

// ═══ 20. Revisione finale (13/10/2026): letture intere, soldi tornati, gestione per RATA ═══
// Un palazzo inventato con rate in OGNI stato: prima della gestione, pagata,
// scaduta, segnalata, rimborsata con carta, saldo deposito, trimestrale che
// scavalca «gestione BOOM dal», contratto chiuso, SEPA in corso.
function seedWorld2() {
  DB.clear(); TG.length = 0; UPLOADS.length = 0; globalThis.__mails = [];
  const ADDR = 'Via Prova 10, Roma';
  const P = (id, int, floor, gd) => seed('properties/' + id, { name: ADDR + ' int. ' + int, address: ADDR, interno: int, floor: String(floor), ownerId: 'own1', gestioneDal: gd, source: 'palazzo-import' });
  P('pA', '1', 1, '2026-08'); P('pB', '2', 1, '2026-08'); P('pC', '3', 2, '2026-08');
  P('pD', '4', 2, '2026-10'); P('pE', '5', 3, '2026-09'); P('pF', '6', 3, '2026-08');
  seed('users/admin1', { role: 'admin', name: 'Operatore' });
  seed('users/own1', { role: 'landlord', name: 'Chiara Prova', email: 'chiara@example.invalid' });
  seed('users/tF', { role: 'tenant', name: 'Sergio Prova', email: 'sergio@example.invalid' });
  const imp = { source: 'palazzo-import', signatureStatus: 'paper', landlordName: 'Prova Immobiliare S.r.l.' };
  seed('contracts/cA', { propertyId: 'pA', status: 'active', ...imp, tenantName: 'Ayse Prova', startDate: '2026-07-01', endDate: '2027-06-30', rent: 1000, type: 'studenti' });
  seed('contracts/cB', { propertyId: 'pB', status: 'active', ...imp, tenantName: 'Ivan Prova', startDate: '2026-08-15', endDate: '2027-08-14', rent: 1500, oneriQuota: 120, type: 'studenti' });
  seed('contracts/cC', { propertyId: 'pC', status: 'terminated', terminatedAt: '2026-09-30', ...imp, tenantName: 'Olga Prova', startDate: '2026-03-01', endDate: '2027-02-28', rent: 900, type: 'studenti' });
  seed('contracts/cD', { propertyId: 'pD', status: 'active', ...imp, contractMissing: true, tenantName: 'Pavel Prova' });
  seed('contracts/cE', { propertyId: 'pE', status: 'active', ...imp, tenantName: 'Emre Prova', startDate: '2026-08-01', endDate: '2027-07-31', rent: 1000, installmentMonths: 3, type: 'transitorio' });
  seed('contracts/cF', { propertyId: 'pF', status: 'active', tenantId: 'tF', tenantName: 'Sergio Prova', startDate: '2026-01-01', endDate: '2026-12-31', rent: 800, type: 'transitorio', signatureStatus: 'complete' });
  const R = (id, contractId, propertyId, month, amount, dueDate, status, extra = {}) => seed('payments/' + id, { contractId, propertyId, type: 'rent', month, amount, dueDate, status, ...extra });
  R('pay_cA_2026-07', 'cA', 'pA', '2026-07', 1000, '2026-07-05', 'pending', { source: 'palazzo-import' });
  R('pay_cA_2026-08', 'cA', 'pA', '2026-08', 1000, '2026-08-05', 'paid', { paidDate: '2026-08-03', paidVia: 'bonifico', source: 'palazzo-import' });
  R('pay_cA_2026-09', 'cA', 'pA', '2026-09', 1000, '2026-09-05', 'pending', { source: 'palazzo-import' });
  R('pay_cA_2026-10', 'cA', 'pA', '2026-10', 1000, '2026-10-05', 'pending', { source: 'palazzo-import', tenantReported: true, tenantReportDate: '2026-10-06', tenantReportedAt: '2026-10-06T10:00:00Z' });
  R('pay_cB_2026-08', 'cB', 'pB', '2026-08', 1620, '2026-08-15', 'paid', { rentAmount: 1500, oneriAmount: 120, paidDate: '2026-08-16', paidVia: 'bonifico' });
  R('pay_cB_2026-09', 'cB', 'pB', '2026-09', 1620, '2026-09-15', 'paid', { rentAmount: 1500, oneriAmount: 120, paidDate: '2026-09-16', paidVia: 'stripe', refundedAt: '2026-10-01T10:00:00Z', refundedAmount: 1620, refundedFull: true });
  R('pay_cB_2026-10', 'cB', 'pB', '2026-10', 1620, '2026-10-15', 'pending', { rentAmount: 1500, oneriAmount: 120 });
  seed('payments/depbal_cB', { contractId: 'cB', propertyId: 'pB', type: 'deposit-balance', month: 'saldo deposito', amount: 1500, dueDate: '2026-08-15', status: 'pending' });
  R('pay_cC_2026-09', 'cC', 'pC', '2026-09', 900, '2026-09-05', 'paid', { paidDate: '2026-10-02', paidVia: 'bonifico' });
  R('pay_cC_2026-10', 'cC', 'pC', '2026-10', 900, '2026-10-05', 'pending');
  R('pay_cC_2026-11', 'cC', 'pC', '2026-11', 900, '2026-11-05', 'pending');
  R('pay_cD_2026-09', 'cD', 'pD', '2026-09', 700, '2026-09-05', 'pending');   // prima della gestione (2026-10)
  R('pay_cE_2026-08', 'cE', 'pE', '2026-08', 3000, '2026-08-05', 'pending', { coversTo: '2026-10', installmentMonths: 3 });
  R('pay_cF_2026-08', 'cF', 'pF', '2026-08', 800, '2026-08-01', 'paid', { paidDate: '2026-08-01', paidVia: 'sepa', tenantId: 'tF' });
  R('pay_cF_2026-09', 'cF', 'pF', '2026-09', 800, '2026-09-01', 'cancelled', { tenantId: 'tF' });
  R('pay_cF_2026-10', 'cF', 'pF', '2026-10', 800, '2026-10-01', 'pending', { sddPiId: 'pi_1', sddStatus: 'processing', tenantId: 'tF' });
}
// L'archivio che cresce: `n` rate PAGATE di altri contratti con id che, in
// ordine di NOME, vengono PRIMA di quelle del Palazzo ('pay_A…' < 'pay_c…').
function seedBigArchive(n) {
  const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < n; i++) {
    const cid = AZ[i % 26] + 'x' + String(Math.floor(i / 12)).padStart(3, '0');
    const mm = '2025-' + String((i % 12) + 1).padStart(2, '0');
    seed('payments/pay_' + cid + '_' + mm + '_' + i, { contractId: cid, type: 'rent', month: mm, amount: 700, dueDate: mm + '-05', status: 'paid', paidDate: mm + '-04' });
  }
}

// 20a. fsListAll / fsListOpenPayments: tutto, a pagine; un tetto si DICE.
{
  seedWorld();
  seedBigArchive(700);
  const L = await import('../../api/homie/_lib.js');
  const all = await L.fsListAll('payments');
  const total = keys('payments').length;
  ok(all.docs.length === total && all.truncated === false, 'fsListAll: legge TUTTE le rate a pagine per nome (oltre 700), senza tetto scattato', { got: all.docs.length, total });
  const cut = await L.fsListAll('payments', { page: 100, maxPages: 3 });
  ok(cut.docs.length === 300 && cut.truncated === true, 'fsListAll: un tetto di sicurezza scattato si dichiara (truncated)', { got: cut.docs.length, truncated: cut.truncated });
  const open = await L.fsListOpenPayments();
  ok(open.docs.length && open.docs.every(p => L.OPEN_PAYMENT_STATUSES.includes(p.status)) && open.docs.some(p => p.id === 'pay_c11_2026-10') && open.docs.some(p => p.id === 'pay_c7_2026-10'),
    'fsListOpenPayments: le rate aperte del Palazzo ci sono, nessuna pagata', open.docs.map(p => p.id));
}

// 20b. Con un archivio grande le macchine del mattino vedono ANCORA il Palazzo.
{
  seedWorld();
  seedBigArchive(700);
  ok(keys('payments').sort().slice(0, 600).every(k => !/pay_c(7|11)_/.test(k)), 'premessa: con la vecchia lettura (600 per nome) le rate del Palazzo restano FUORI');
  const gestore = (await import('../../api/employees/gestore.js')).default;
  const g = await call(gestore, { headers: asCron, query: { dry: '1' } });
  const dg = (g.body && g.body.report && g.body.report.digest) || [];
  ok(g.statusCode === 200 && dg.some(l => /int\. 11/.test(l) && /in ritardo/.test(l)) && dg.some(l => /💶 .*int\. 7.*bonifico segnalato/.test(l)) && !dg.some(l => /archivio letto in parte/.test(l)),
    'gestore: con 700 rate pagate davanti, il ritardo di int. 11 e il bonifico segnalato di int. 7 restano nel digest', dg);
  const MG = await importMutant('api/employees/gestore.js', '    fsListOpenPayments(),\n', "    fsList('payments', { limit: 600 }).then(docs => ({ docs, truncated: false })),\n");
  const gm = await call(MG.default, { headers: asCron, query: { dry: '1' } });
  const dgm = (gm.body && gm.body.report && gm.body.report.digest) || [];
  ok(!dgm.some(l => /int\. 11/.test(l) && /in ritardo/.test(l)), 'mutazione: con la vecchia lettura «limit: 600» il ritardo del Palazzo sparisce (il test lo vede)', dgm);
  const contabile = (await import('../../api/employees/contabile.js')).default;
  const cb = await call(contabile, { headers: asCron, query: { dry: '1' } });
  const rep = (cb.body && cb.body.report) || {};
  ok(cb.statusCode === 200 && (rep.late || []).some(l => l.paymentId === 'pay_c11_2026-10') && (rep.reported || []).some(l => l.paymentId === 'pay_c7_2026-10'),
    'contabile: con 700 rate pagate davanti, ritardo e bonifico segnalato del Palazzo ci sono', { late: rep.late, reported: rep.reported });
  const { scan } = await import('../../api/agent/risk.scan.js');
  const rs = await scan(60);
  ok(rs.items.some(i => i.cat === 'Bonifico segnalato' && i.ref === 'pay_c7_2026-10') && rs.items.some(i => i.cat === 'Pagamento in ritardo' && i.ref === 'pay_c11_2026-10'),
    'risk.scan: con 700 rate davanti, il segnalato e il ritardo del Palazzo ci sono', rs.items.map(i => i.cat + ' ' + i.ref));
  const { snapshot } = await import('../../api/agent/state.snapshot.js');
  const sn = await snapshot('payments');
  ok(sn.payments.reported >= 1 && sn.payments.overdue >= 1 && !sn.payments.partial, 'state.snapshot: con 700 rate davanti conta ritardi e segnalati del Palazzo', sn.payments);
  const digest = (await import('../../api/agent/digest.js')).default;
  const d = await call(digest, { headers: { 'x-homie-secret': 'homie-test' }, body: {} });
  ok(d.statusCode === 200 && /bonifico segnalato/.test(d.body.text || ''), 'digest di Homie: con 700 rate davanti il bonifico segnalato c\'è ancora', d.body && d.body.text);
  const W = await import('../../api/telegram/webhook.js');
  const lines = W.snapshotLines({ payments: (await (await import('../../api/homie/_lib.js')).fsListOpenPayments()).docs, now: new Date(NOW) });
  ok(/segnalati da verificare: 1/.test(lines.join('\n')), 'Telegram /snapshot: il segnalato del Palazzo contato', lines);
}

// 20c. Una rata trimestrale che scavalca «gestione BOOM dal»: arretrato vero
// per TUTTI (Palazzo, Oggi, Gestore, Contabile, risk, digest, snapshot);
// le rate tutte prima della gestione per nessuno (snapshot compreso).
{
  ok(CS.paymentBeforeGestione({ month: '2026-08', coversTo: '2026-10' }, { gestioneDal: '2026-09' }) === false
    && CS.paymentBeforeGestione({ month: '2026-08' }, { gestioneDal: '2026-09' }) === true
    && CS.paymentBeforeGestione({ month: 'saldo deposito', dueDate: '2026-07-15' }, { gestioneDal: '2026-09' }) === true
    && CS.paymentBeforeGestione({ month: '2026-08', coversTo: '2026-10' }, {}) === false
    && CS.paymentBeforeGestione({ month: 'boh' }, { gestioneDal: '2026-09' }) === false,
    'paymentBeforeGestione: la RATA intera (coversTo), dal mese o dalla scadenza; senza dato, mai');
  // la stessa regola del motore del Palazzo
  const PE = require('../../js/palazzo-engine.js');
  seedWorld2();
  const props = keys('properties').map(k => ({ id: k.split('/')[1], ...read(k) }));
  const cons = keys('contracts').map(k => ({ id: k.split('/')[1], ...read(k) }));
  const pays = keys('payments').map(k => ({ id: k.split('/')[1], ...read(k) }));
  const users = keys('users').map(k => ({ id: k.split('/')[1], ...read(k) }));
  const ctx = PE.context({ properties: props, contracts: cons, payments: pays, users, now: new Date(NOW) });
  const m = PE.model(ctx, PE.buildings(ctx)[0].key, '2026-10', { strip: false });
  const debtIds = (m.debtors || []).flatMap(d => d.rows.map(r => r.id));
  ok(debtIds.includes('pay_cE_2026-08') && !debtIds.includes('pay_cA_2026-07'), 'premessa: il Palazzo conta la trimestrale di agosto (gestione da settembre) fra gli arretrati', debtIds);
  const O = require('../../js/oggi-engine.js');
  const oggi = O.build({ payments: pays, contracts: cons, properties: props, users }, NOW);
  ok(oggi.decisions.some(x => x.id === 'pay_pay_cE_2026-08') && !oggi.decisions.some(x => x.id === 'pay_pay_cA_2026-07'),
    'Oggi: la trimestrale che arriva dentro la gestione è un ritardo; il luglio prima della gestione no', oggi.decisions.map(x => x.id));
  const gestore = (await import('../../api/employees/gestore.js')).default;
  const g = await call(gestore, { headers: asCron, query: { dry: '1' } });
  const dg = (g.body && g.body.report && g.body.report.digest) || [];
  ok(dg.some(l => /int\. 5/.test(l) && /€3\.000 in ritardo/.test(l)) && !dg.some(l => /int\. 1/.test(l) && /luglio/.test(l)),
    'gestore: la trimestrale di int. 5 arriva nel digest col link; luglio di int. 1 (prima della gestione) no', dg);
  const MG = await importMutant('api/employees/gestore.js', '    if (CS.paymentBeforeGestione(p, property)) continue;\n',
    "    if (CS.beforeGestione(/^\\d{4}-\\d{2}$/.test(String(p.month || '')) ? p.month : String(p.dueDate || '').slice(0, 7), property)) continue;\n");
  const gm = await call(MG.default, { headers: asCron, query: { dry: '1' } });
  ok(!((gm.body.report || {}).digest || []).some(l => /int\. 5/.test(l) && /in ritardo/.test(l)), 'mutazione: col solo mese la trimestrale di int. 5 sparisce dal digest (il test lo vede)');
  const contabile = (await import('../../api/employees/contabile.js')).default;
  const cb = await call(contabile, { headers: asCron, query: { dry: '1' } });
  ok((cb.body.report.late || []).some(l => l.paymentId === 'pay_cE_2026-08') && !(cb.body.report.late || []).some(l => l.paymentId === 'pay_cA_2026-07'),
    'contabile: la trimestrale è un ritardo, il mese prima della gestione no', cb.body.report.late);
  const { scan } = await import('../../api/agent/risk.scan.js');
  const rs = await scan(60);
  ok(rs.items.some(i => i.cat === 'Pagamento in ritardo' && i.ref === 'pay_cE_2026-08') && !rs.items.some(i => i.ref === 'pay_cA_2026-07'), 'risk.scan: idem', rs.items.map(i => i.ref));
  const { snapshot } = await import('../../api/agent/state.snapshot.js');
  const sn = await snapshot('payments');
  // aperte e scadute dopo la gestione: cA_09 (1000), depbal_cB (1500), cC_10 (900), cE_08 (3000)
  ok(sn.payments.overdue === 4 && sn.payments.overdueAmount === 6400, 'state.snapshot: niente rate tutte prima della gestione (luglio di int. 1 e settembre di int. 4 fuori), la trimestrale dentro', sn.payments);
  const MS = await importMutant('api/agent/state.snapshot.js', '      return !CS.paymentBeforeGestione(p, propById[p.propertyId || pc.propertyId]);\n', '      return true;\n');
  ok((await MS.snapshot('payments')).payments.overdueAmount === 8100, 'mutazione: senza il filtro la fotografia conta luglio di int. 1 e settembre di int. 4 come arretrati (il test lo vede)');
}

// 20d. Rata rimborsata o contestata: non è incassata, né nella chiusura del
// mese né nell'incassato YTD né nel pacchetto del commercialista.
{
  seedWorld2();
  process.env.ACCOUNTING_EMAIL = 'contabile@example.invalid';
  const contabile = (await import('../../api/employees/contabile.js')).default;
  const cb = await call(contabile, { headers: asCron, query: { monthly: '1' } });
  const mail = (globalThis.__mails || []).find(x => /Chiusura contabile/.test(x.subject || ''));
  const html = mail ? mail.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '';
  ok(cb.statusCode === 200 && mail && /settembre 2026/.test(mail.subject) && /€900 su €3\.520/.test(mail.text),
    'chiusura mese: settembre dice €900 su €3.520 — come il Palazzo e il rendiconto (la rata rimborsata NON è incassata)', mail && { subject: mail.subject, text: mail.text });
  ok(/Non incassato: .*int\. 1 — €1\.000/.test(html) && !/Non incassato: [^D]*int\. 4/.test(html) && !/Non incassato: [^D]*int\. 2/.test(html)
    && /Da verificare .*int\. 2 — €1\.620 \(rimborso o contestazione\)/.test(html),
    'chiusura mese: int. 1 fra i non incassati; int. 4 (prima della gestione) assente; int. 2 (rimborsata) fra i «da verificare»', html.slice(html.indexOf('Canoni'), html.indexOf('Pacchetto')));
  const ytd = cb.body.counts;
  ok(ytd.incassatoYtd === 4320 && ytd.paymentsMoneyBack === 1, 'contabile: incassato YTD senza i €1.620 rimborsati (4.320, non 5.940)', ytd);
  ok((cb.body.report.moneyBack || []).some(x => x.paymentId === 'pay_cB_2026-09' && x.why === 'rimborso'), 'contabile: la rata rimborsata è nella lista «da verificare» del rapporto', cb.body.report.moneyBack);
  const MC = await importMutant('api/employees/contabile.js', "      if (st === 'paid') { incassatoYtd += amt; attesoYtd += amt; }", "      if (p.status === 'paid') { incassatoYtd += amt; attesoYtd += amt; }");
  seedWorld2();
  const cbm = await call(MC.default, { headers: asCron, query: { dry: '1' } });
  ok(cbm.body.counts.incassatoYtd === 5940, 'mutazione: con p.status === \'paid\' la rata rimborsata torna incassata (il test lo vede)', cbm.body.counts.incassatoYtd);
  const MC2 = await importMutant('api/employees/contabile.js', "    if (st === 'paid') incassato += amt;", "    if (p.status === 'paid') incassato += amt;");
  const pays = keys('payments').map(k => ({ id: k.split('/')[1], ...read(k) }));
  const propById = Object.fromEntries(keys('properties').map(k => [k.split('/')[1], { id: k.split('/')[1], ...read(k) }]));
  const contractById = Object.fromEntries(keys('contracts').map(k => [k.split('/')[1], { id: k.split('/')[1], ...read(k) }]));
  const fig = MC2.monthlyCloseFigures({ payments: pays, monthKey: '2026-09', propById, contractById, now: new Date(NOW) });
  ok(fig.incassato === 2520, 'mutazione: nella chiusura col vecchio p.status la rimborsata torna incassata (€2.520, il test lo vede)', fig);
  // il pacchetto commercialista
  const T = require('../../js/taxpack-engine.js');
  const cBpays = pays.filter(p => p.contractId === 'cB');
  const tot = T.computeTotals({ contract: { id: 'cB', ...read('contracts/cB') }, payments: cBpays, fiscalYear: 2026 });
  ok(tot.canoniIncassati === 1620 && tot.monthsPaid === 1, 'taxpack: i canoni incassati non contano la rata rimborsata', tot);
  ok(T.computeTotals({ contract: {}, payments: [{ month: '2026-09', amount: 500, status: 'paid', disputeStatus: 'open' }, { month: '2026-08', amount: 500, status: 'paid', disputeStatus: 'won' }], fiscalYear: 2026 }).canoniIncassati === 500,
    'taxpack: una contestazione aperta toglie la rata dagli incassati, una vinta no');
  const MT = requireMutant('js/taxpack-engine.js', '    var paid = yearPayments.filter(paidMoney);', "    var paid = yearPayments.filter(function (p) { return p.status === 'paid'; });");
  ok(MT.computeTotals({ contract: {}, payments: cBpays, fiscalYear: 2026 }).canoniIncassati === 3240, 'mutazione: col solo status il pacchetto mette in dichiarazione un canone rimborsato (il test lo vede)');
  delete process.env.ACCOUNTING_EMAIL;
}

// 20e. compliance.scan (il radar di Homie) passa l'immobile: niente
// «Burocrazia scaduta» sugli adempimenti di PRIMA della gestione BOOM.
{
  seedWorld();
  seed('properties/plz20', { name: 'Piazzale Esempio 42 int. 20', address: 'Piazzale Esempio 42, Roma', interno: '20', ownerId: 'own1', gestioneDal: '2026-10', source: 'palazzo-import' });
  seed('contracts/c20', { propertyId: 'plz20', status: 'active', source: 'palazzo-import', signatureStatus: 'paper', type: 'studenti', startDate: '2025-09-15', endDate: '2026-09-14',
    rent: 1600, deposit: 3200, cedolareSecca: 'no', tenantName: 'Zeynep Prova', createdAt: '2026-10-12T08:00:00Z' });
  const cscan = (await import('../../api/agent/compliance.scan.js')).default;
  const r = await call(cscan, { headers: { 'x-homie-secret': 'homie-test' }, body: {} });
  const on20 = (r.body.items || []).filter(i => i.ref === 'c20' && i.cat === 'Burocrazia scaduta').map(i => i.code);
  ok(r.statusCode === 200 && on20.includes('RLI_REG') && !on20.some(c => ['REGISTRO_BOLLO', 'APE', 'RENEWAL_DECISION', 'DEPOSIT_RETURN'].includes(c)),
    'compliance.scan: per il contratto preso in carico resta la RLI (fatto legale), non gli adempimenti di prima della gestione', on20);
  ok(!(r.body.items || []).some(i => ['c7', 'c11', 'c14'].includes(i.ref) && i.cat === 'Burocrazia scaduta' && ['REGISTRO_BOLLO', 'APE', 'RENEWAL_DECISION'].includes(i.code)),
    'compliance.scan: niente scadenze false sui contratti del Palazzo', (r.body.items || []).filter(i => ['c7', 'c11', 'c14'].includes(i.ref)));
  const MC = await importMutant('api/agent/compliance.scan.js', '{ tenant, today, property: prop }', '{ tenant, today }');
  const rm = await call(MC.default, { headers: { 'x-homie-secret': 'homie-test' }, body: {} });
  ok((rm.body.items || []).some(i => i.ref === 'c20' && i.cat === 'Burocrazia scaduta' && ['REGISTRO_BOLLO', 'RENEWAL_DECISION', 'DEPOSIT_RETURN'].includes(i.code)),
    'mutazione: senza l\'immobile il radar grida SCADUTI gli adempimenti di prima della gestione (il test lo vede)', (rm.body.items || []).filter(i => i.ref === 'c20').map(i => i.code));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
