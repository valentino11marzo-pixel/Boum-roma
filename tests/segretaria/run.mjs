// tests/segretaria/run.mjs — LA SEGRETARIA: chi parla, quando tace, chi comanda.
//
// Il rischio è lo stesso della scala della fiducia, ma più vicino al cliente:
// qui la macchina CONVERSA. Quindi si testa quasi solo la direzione
// pericolosa, per mutazione: la Segretaria non parla mai su una chat non
// consegnata, mai con un inquilino, mai oltre i tetti, mai con parole che
// chiedono un umano; le sue risposte-eco non la spengono (o morirebbe al
// primo turno) e un messaggio MANUALE dell'operatore la spegne sempre; una
// risposta con un link fuori dominio non parte MAI — diventa un'escalation.
//
// Esegui: node tests/segretaria/run.mjs

import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { register } from 'node:module';
import SEG from '../../js/segretaria-engine.js';
import VOCE from '../../js/voce-engine.js';
import CALENDAR from '../../js/segretaria-calendar-engine.js';

// nodemailer mockato via loader (stesso mock della suite notify): la rotaia
// d'invio passa dall'executor vero → agent/_lib, che lo importa staticamente.
register('../notify/loader.mjs', import.meta.url);
// The actual email scanner and MIME parser run; only IMAP transport is fake.
const imapURL = 'data:text/javascript,' + encodeURIComponent(`export class ImapFlow {
  async connect() {}
  async getMailboxLock() { return { release() {} }; }
  async search({ from }) { return globalThis.__imap.filter(m => m.from === from).map(m => m.uid); }
  async fetchOne(uid) { const m = globalThis.__imap.find(m => m.uid === Number(uid)); return m ? { source: Buffer.from(m.raw) } : null; }
  async logout() {}
}`);
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next) {
  if (s === 'imapflow') return { url: ${JSON.stringify(imapURL)}, shortCircuit: true };
  return next(s,c);
}`), import.meta.url);

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const NOW = Date.parse('2026-08-28T10:00:00Z');

// ── 1. i default e la config ───────────────────────────────────────────────
{
  ok('default: in servizio (il gate vero è la consegna per chat)', SEG.DEFAULTS.enabled === true);
  ok('default: 12 turni/chat, 60/giorno', SEG.DEFAULTS.maxTurns === 12 && SEG.DEFAULTS.dailyCap === 60);
  const { cfg, rejected } = SEG.mergeConfig({ maxTurns: 1, dailyCap: 100, maxChars: 'x' });
  ok('maxTurns impossibile → default + rejected', cfg.maxTurns === 12 && rejected.some(r => r.key === 'maxTurns'));
  ok('dailyCap valido → accettato', cfg.dailyCap === 100);
  ok('maxChars non numerico → default + rejected', cfg.maxChars === 700 && rejected.some(r => r.key === 'maxChars'));
}

// ── 2. il verdetto sul turno (ogni cancello, per mutazione) ────────────────
{
  const cfg = SEG.DEFAULTS;
  const conv = { segretaria: true, contactType: 'whatsapp', segretariaTurns: 0 };
  ok('chat consegnata + testo normale → reply',
    SEG.turnVerdict({ conv, text: 'is it still available?', cfg, turnsToday: 0 }).act === 'reply');
  ok('MUTAZIONE: chat NON consegnata → mai una parola',
    SEG.turnVerdict({ conv: { ...conv, segretaria: false }, text: 'ciao', cfg, turnsToday: 0 }).act === 'skip');
  ok('kill switch spento → tace',
    SEG.turnVerdict({ conv, text: 'ciao', cfg: { ...cfg, enabled: false }, turnsToday: 0 }).act === 'skip');
  ok('MUTAZIONE: un inquilino non parla mai con la Segretaria',
    SEG.turnVerdict({ conv: { ...conv, contactType: 'tenant' }, text: 'la caldaia perde', cfg, turnsToday: 0 }).act === 'escalate');
  ok('parole legali → passaggio a un umano',
    SEG.turnVerdict({ conv, text: 'I will call my lawyer', cfg, turnsToday: 0 }).act === 'escalate');
  ok('tetto turni per chat → escalation',
    SEG.turnVerdict({ conv: { ...conv, segretariaTurns: 12 }, text: 'ok', cfg, turnsToday: 0 }).act === 'escalate');
  ok('tetto giornaliero → escalation',
    SEG.turnVerdict({ conv, text: 'ok', cfg, turnsToday: 60 }).act === 'escalate');
}

// ── 3. l'eco: la MIA risposta che torna dal Mac non mi spegne ──────────────
{
  const sent = SEG.noteSent({ segretariaSent: [] }, 'Ciao! La casa è libera da settembre 😊', NOW);
  const conv = { segretariaSent: sent };
  ok('la stessa frase (spazi diversi) è un eco',
    SEG.isSegretariaEcho(conv, '  Ciao!  la casa è libera da settembre 😊 ', NOW + 60000));
  ok('una frase diversa NON è un eco (è l\'operatore)',
    !SEG.isSegretariaEcho(conv, 'Ci penso io, grazie', NOW + 60000));
  ok('un eco più vecchio di 48h non conta',
    !SEG.isSegretariaEcho(conv, 'Ciao! La casa è libera da settembre 😊', NOW + 49 * 3600 * 1000));
  let s = { segretariaSent: [] };
  for (let i = 0; i < 15; i++) s.segretariaSent = SEG.noteSent(s, 'msg ' + i, NOW + i);
  ok('il registro degli invii resta capato (≤10)', s.segretariaSent.length === 10, s.segretariaSent.length);
}

// ── 4. la sanificazione dell'uscita: rifiuta, non aggiusta ─────────────────
{
  ok('risposta vuota → rifiutata', SEG.sanitizeReply('', SEG.DEFAULTS).ok === false);
  ok('MUTAZIONE: link fuori dominio → MAI inviato',
    SEG.sanitizeReply('Guarda qui: https://evil.example.com/x', SEG.DEFAULTS).ok === false);
  ok('link boomrome.com → passa', SEG.sanitizeReply('Tutto qui: https://www.boomrome.com/listing/l1', SEG.DEFAULTS).ok === true);
  ok('link wa.me → passa', SEG.sanitizeReply('Scrivici: https://wa.me/393331234567', SEG.DEFAULTS).ok === true);
  const md = SEG.sanitizeReply('**Ciao** questo è `codice`', SEG.DEFAULTS);
  ok('il markdown viene spogliato (WhatsApp non lo rende)', md.ok && !/[*`]/.test(md.text), md.text);
  const long = SEG.sanitizeReply(('Frase breve. '.repeat(120)), { ...SEG.DEFAULTS, maxChars: 300 });
  ok('una risposta troppo lunga viene tagliata a una frase intera', long.ok && long.text.length <= 300 && /\.$/.test(long.text.trim()));
}

// ── 5. le giunzioni, asserite sulla SORGENTE ───────────────────────────────
{
  const msg = readFileSync(new URL('../../api/homie/message.js', import.meta.url), 'utf8');
  ok('homie/message: import STATICI (la lezione nodemailer)', /import SEG from/.test(msg) && /import \{ segretariaTurn, segretariaOffConv \}/.test(msg));
  const iSync = msg.indexOf('await syncLead(');
  const iSeg = msg.indexOf('segretariaTurn({');
  ok('il turno viene DOPO il sync del lead (il dato prima della voce)', iSync > -1 && iSeg > iSync);
  const iEcho = msg.indexOf('isSegretariaEcho');
  const iOff = msg.indexOf('segretariaOffConv(cid');
  ok('l\'eco si controlla PRIMA di spegnere', iEcho > -1 && iOff > iEcho,
    'senza, la Segretaria si spegne da sola al primo turno mirrorato');
  ok('il blocco è best-effort (mai perdere il messaggio)', /catch \(e\) \{ console\.warn\('\[homie\/message\] segretaria/.test(msg));

  const notif = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  ok('il 🤖 compare su ogni lead raggiungibile (telefono O email)', /l\.phone \|\| l\.email.*sg:\$\{l\.id\}/.test(notif));

  const hook = readFileSync(new URL('../../api/telegram/webhook.js', import.meta.url), 'utf8');
  const iSg = hook.indexOf("verb === 'sg'");
  const iFetch = hook.indexOf('await fsGet(`action_queue/${actionId}`)');
  ok('webhook: sg/sgx/sgk PRIMA del lookup action_queue', iSg > -1 && iFetch > -1 && iSg < iFetch);
  ok('webhook: /segretaria esiste', hook.includes("text === '/segretaria'"));

  ok('callback ≤64B: sg:<leadId>', Buffer.byteLength('sg:' + 'x'.repeat(24)) <= 64);
  ok('callback ≤64B: sgx:<convId>', Buffer.byteLength('sgx:conv_whatsapp_393331234567999') <= 64);

  const vjson = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  ok('il cron delle risposte email è dichiarato in vercel.json', vjson.includes('/api/segretaria/scan-replies') && /scan-replies\.js/.test(vjson));
  const reg = readFileSync(new URL('../../js/squadra-registry.js', import.meta.url), 'utf8');
  ok('la Segretaria è nell\'organigramma (anti-deriva)', /key: 'segretaria'/.test(reg) && reg.includes('/api/segretaria/scan-replies'));
}

// ── 5b. la risposta email, spogliata del thread citato ─────────────────────
{
  const mail = 'Yes perfect, Thursday works!\n\nOn Mon, Aug 24, 2026 at 10:12 BOOM Rome wrote:\n> Hi Sophie, would Thursday...';
  ok('tiene solo la risposta vera (EN)', SEG.stripQuoted(mail) === 'Yes perfect, Thursday works!');
  const it = 'Va bene giovedì, grazie\nIl giorno lun 24 ago 2026 BOOM Rome ha scritto:\n> Ciao...';
  ok('tiene solo la risposta vera (IT)', SEG.stripQuoted(it) === 'Va bene giovedì, grazie');
  ok('le righe ">" tagliano comunque', SEG.stripQuoted('ok!\n> quoted stuff') === 'ok!');
  ok('un\'email senza citazioni resta intera', SEG.stripQuoted('Ciao,\n\nquando posso vederla?') === 'Ciao,\n\nquando posso vederla?');
  ok('vuota resta vuota (il turno non parte sul nulla)', SEG.stripQuoted('> tutto citato\n> anche questo') === '');
}

// ── 6. IL GIRO VERO: Firestore in memoria, executor reale, AI finta ────────
const versions = new Map();
let revision = 0;
class VersionedStore extends Map {
  set(path, value) {
    versions.set(path, new Date(NOW + ++revision).toISOString());
    return super.set(path, value);
  }
  delete(path) { versions.delete(path); return super.delete(path); }
}
const DB = new VersionedStore();
const TG = [];
const AI_REQUESTS = [];
let failingCollection = null, failCommit = false, failingPath = null, AI_HOOK = null;
let AI_REPLY = { reply: 'Ciao! Sì, è ancora disponibile 😊 Vuoi vederla in video o di persona?', escalate: false };
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = f => {
  if (!f) return null;
  if ('nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`,
  fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])), updateTime: versions.get(path) });
const field = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
const comparable = value => value instanceof Date ? value.toISOString() : value;
const matches = (row, filter) => {
  if (!filter) return true;
  if (filter.compositeFilter) {
    const results = filter.compositeFilter.filters.map(f => matches(row, f));
    return filter.compositeFilter.op === 'AND' ? results.every(Boolean) : results.some(Boolean);
  }
  const f = filter.fieldFilter, actual = comparable(field(row, f.field.fieldPath)), expected = dec(f.value);
  if (actual === undefined) return false;
  if (f.op === 'EQUAL') return actual === comparable(expected);
  if (f.op === 'IN') return expected.map(comparable).includes(actual);
  if (f.op === 'GREATER_THAN') return actual > comparable(expected);
  if (f.op === 'GREATER_THAN_OR_EQUAL') return actual >= comparable(expected);
  if (f.op === 'LESS_THAN') return actual < comparable(expected);
  if (f.op === 'LESS_THAN_OR_EQUAL') return actual <= comparable(expected);
  throw new Error('Unsupported Firestore test filter: ' + f.op);
};
const conditionFails = (path, condition) => (condition.exists === false && DB.has(path))
  || (condition.exists === true && !DB.has(path))
  || (condition.updateTime && versions.get(path) !== condition.updateTime);
const applyFields = (previous, fields, mask) => {
  const next = mask ? structuredClone(previous || {}) : {};
  const source = Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, dec(v)]));
  for (const path of mask || Object.keys(source)) {
    const parts = path.split('.'), leaf = parts.pop();
    let target = next;
    for (const key of parts) target = target[key] ||= {};
    const value = field(source, path);
    if (value === undefined) delete target[leaf]; else target[leaf] = value;
  }
  return next;
};

let autoId = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (u.includes('api.telegram.org')) {
    TG.push({ method: u.split('/').pop(), body: opts.body ? JSON.parse(opts.body) : {} });
    return json({ ok: true, result: { message_id: 1000 + TG.length } });
  }
  if (u.includes('api.anthropic.com')) {
    AI_REQUESTS.push(JSON.parse(opts.body));
    if (AI_HOOK) await AI_HOOK(JSON.parse(opts.body));
    return json({ content: [{ type: 'text', text: JSON.stringify(AI_REPLY) }], usage: {}, model: 'stub' });
  }
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (path === failingPath) return json({ error: { status: 'UNAVAILABLE' } }, 503);
  if (u.endsWith(':commit')) {
    if (failCommit) return json({ error: { status: 'UNAVAILABLE' } }, 503);
    const writes = body.writes || [];
    // An atomic commit validates ALL versions before changing any document.
    for (const w of writes) {
      const key = (w.update?.name || w.delete)?.split('/documents/')[1];
      if (!key || !w.currentDocument) throw new Error('Commit requires update + precondition');
      if (conditionFails(key, w.currentDocument)) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    }
    const results = writes.map(w => {
      if (w.delete) return {};
      const key = w.update.name.split('/documents/')[1];
      DB.set(key, applyFields(DB.get(key), w.update.fields, w.updateMask?.fieldPaths));
      return { updateTime: versions.get(key) };
    });
    return json({ writeResults: results, commitTime: new Date(NOW + revision).toISOString() });
  }
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    if (coll === failingCollection) return json({ error: { status: 'UNAVAILABLE' } }, 503);
    const lim = q.limit || 1000;
    // __name__ is document metadata, not a stored field. Treating it as a
    // missing business field hid every open follow-up from the real worker.
    const orderedValue = ([key, row], name) => name === '__name__' ? key : comparable(field(row, name));
    let rows = [...DB.entries()]
      .filter(([k, v]) => k.startsWith(coll + '/') && k.split('/').length === 2 && matches(v, q.where))
      .filter(row => (q.orderBy || []).every(sort => orderedValue(row, sort.field.fieldPath) !== undefined));
    for (const sort of [...(q.orderBy || [])].reverse()) rows.sort((a, b) => {
      const left = orderedValue(a, sort.field.fieldPath), right = orderedValue(b, sort.field.fieldPath);
      return (left === right ? 0 : left < right ? -1 : 1) * (sort.direction === 'DESCENDING' ? -1 : 1);
    });
    if (q.startAt) {
      if (q.orderBy?.length !== 1 || q.orderBy[0].field.fieldPath !== '__name__'
        || q.orderBy[0].direction !== 'ASCENDING' || q.startAt.values?.length !== 1
        || typeof q.startAt.values[0].referenceValue !== 'string') throw new Error('Unsupported Firestore test cursor');
      const cursor = q.startAt.values[0].referenceValue.split('/documents/')[1];
      if (!cursor?.startsWith(coll + '/')) throw new Error('Invalid Firestore test cursor collection');
      rows = rows.filter(([key]) => q.startAt.before ? key >= cursor : key > cursor);
    }
    return json(rows.slice(0, lim).map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const params = new URL(u).searchParams;
    const condition = {};
    if (params.has('currentDocument.exists')) condition.exists = params.get('currentDocument.exists') === 'true';
    if (params.has('currentDocument.updateTime')) condition.updateTime = params.get('currentDocument.updateTime');
    if (conditionFails(path, condition)) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    const mask = params.getAll('updateMask.fieldPaths');
    const next = applyFields(DB.get(path), body.fields, mask.length ? mask : null);
    DB.set(path, next);
    return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const qid = u.match(/documentId=([^&]+)/);
    const id = qid ? decodeURIComponent(qid[1]) : 'doc' + (++autoId);
    const key = `${path}/${id}`;
    if (qid && DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(key, DB.get(key)));
  }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
process.env.TELEGRAM_CHAT_ID = '42';
process.env.ANTHROPIC_API_KEY = 'sk-test';

const { default: handler } = await import('../../api/homie/message.js');
const { handoverSegretaria, segretariaTurn } = await import('../../api/segretaria/_core.js');
const { personaDossier } = await import('../../api/segretaria/_persona.js');

const call = async payload => {
  const req = {
    method: 'POST',
    headers: { 'x-homie-secret': 'test-secret', 'content-type': 'application/json' },
    body: payload,
    on(ev, cb) { if (ev === 'data') cb(Buffer.from(JSON.stringify(payload))); if (ev === 'end') cb(); return this; },
  };
  let out = null, code = 0;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(o) { out = o; return this; }, end() { return this; } };
  await handler(req, res);
  return { code, ...(out || {}) };
};
const segActions = () => [...DB.entries()].filter(([, v]) => v.proposedBy === 'segretaria');
const msgLogs = () => [...DB.keys()].filter(k => k.startsWith('messageLog/')).length;

DB.set('listings/l2', { name: 'Bilocale Trastevere', zone: 'Trastevere', address: 'Vicolo del Cinque 3', price: 1600, status: 'available' });

// 6a. inbound da sconosciuto: nasce il lead, ma la Segretaria NON parla
let leadId, cid;
{
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', name: 'Sophie K',
    body: 'Hi! Is the Trastevere flat still available for September?', messageId: 'w1' });
  leadId = r.leadId; cid = r.conversationId;
  ok('6a. il lead nasce come sempre', r.ok === true && !!leadId, r);
  ok('6a. MUTAZIONE: senza consegna, ZERO risposte automatiche', segActions().length === 0 && msgLogs() === 0);
}

// 6b. la consegna (il click 🤖) → il turno parte sul prossimo inbound
{
  const h = await handoverSegretaria(leadId);
  // La consegna e il prossimo inbound devono mantenere il CID già persistito;
  // diventare lead non apre una seconda conversazione.
  ok('6b. la consegna marca la conversazione che riceverà il traffico', h.ok === true && h.cid === cid && h.cid === DB.get('leads/' + leadId).conversationId, h);
  cid = h.cid;
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567',
    body: 'Great! When can I see it?', messageId: 'w2' });
  ok('6b. il messaggio atterra davvero lì', r.conversationId === cid, r.conversationId);
  ok('6b. il turno risponde', r.segretaria && r.segretaria.sent === true, r.segretaria);
  const [, act] = segActions()[0] || [];
  ok('6b. la risposta passa dalla rotaia vera (action executed + messageLog)', act && act.status === 'executed' && msgLogs() === 1, act && act.status);
  ok('6b. contextHash per messaggio (retry-proof)', act && act.contextHash === `segretaria:turn:${cid}:w2`, act && act.contextHash);
  const conv = DB.get('conversations/' + cid);
  ok('6b. il contatore turni avanza e l\'invio è registrato', conv.segretariaTurns === 1 && Array.isArray(conv.segretariaSent) && conv.segretariaSent.length === 1);
  ok('6b. la chat non risulta più "da rispondere"', conv.needsReply === false);
}

// 6c. l'ECO: la sua risposta torna dal Mac come 'out' → NON si spegne
{
  const sent = AI_REPLY.reply;
  await call({ direction: 'out', channel: 'whatsapp', phone: '+393331234567', body: sent, messageId: 'w3' });
  ok('6c. MUTAZIONE: l\'eco non la spegne (o morirebbe al primo turno)',
    DB.get('conversations/' + cid).segretaria === true);
}

// 6d. un 'out' MANUALE dell'operatore la spegne su quella chat
{
  await call({ direction: 'out', channel: 'whatsapp', phone: '+393331234567', body: 'Ci penso io da qui, grazie', messageId: 'w4' });
  ok('6d. il messaggio manuale la spegne (D4)', DB.get('conversations/' + cid).segretaria === false);
}

// 6e. retry di Homie con lo STESSO messageId → nessuna seconda risposta
{
  await handoverSegretaria(leadId);
  const before = msgLogs();
  await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', body: 'When can I see it?', messageId: 'w2' });
  ok('6e. MUTAZIONE: il retry non risponde due volte', msgLogs() === before);
}

// 6f. parole legali → escalation: niente invio, chat restituita, ping 🖐
{
  const before = msgLogs();
  const tgBefore = TG.length;
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567',
    body: 'This is a scam, I want a refund or I call my lawyer', messageId: 'w5' });
  ok('6f. nessuna risposta automatica', msgLogs() === before && r.segretaria && r.segretaria.escalated === true, r.segretaria);
  ok('6f. la chat torna all\'operatore', DB.get('conversations/' + cid).segretaria === false);
  ok('6f. il ping 🖐 arriva con il contesto', TG.length > tgBefore && JSON.stringify(TG[TG.length - 1].body).includes('Segretaria ti passa'));
}

// 6g. una risposta del modello con un link fuori dominio NON parte mai
{
  await handoverSegretaria(leadId);
  AI_REPLY = { reply: 'Certo! Paga qui: https://evil.example.com/pay', escalate: false };
  const before = msgLogs();
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', body: 'ok how do I pay?', messageId: 'w6' });
  ok('6g. MUTAZIONE: il link fuori dominio diventa escalation, mai un invio',
    msgLogs() === before && r.segretaria && r.segretaria.escalated === true, r.segretaria);
  AI_REPLY = { reply: 'Ciao! Ci pensiamo noi 😊', escalate: false };
}

// 6h. il kill switch globale vince su tutto
{
  await handoverSegretaria(leadId);
  DB.set('settings/segretaria', { enabled: false });
  const before = msgLogs();
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', body: 'hello?', messageId: 'w7' });
  ok('6h. MUTAZIONE: kill switch spento → tace', msgLogs() === before && r.segretaria && r.segretaria.acted === false, r.segretaria);
  DB.set('settings/segretaria', { enabled: true });
}

// 6i. il modello stesso può chiedere l'operatore (escalate: true)
{
  AI_REPLY = { reply: '', escalate: true, reason: 'chiede uno sconto sul canone' };
  const before = msgLogs();
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567', body: 'can you do 1400 instead of 1600?', messageId: 'w8' });
  ok('6i. la trattativa passa a Valentino, mai alla macchina',
    msgLogs() === before && r.segretaria && r.segretaria.escalated === true && DB.get('conversations/' + cid).segretaria === false, r.segretaria);
}

// 6j. LA MOSSA D'APERTURA — lead email-only (portale): il click apre via email
{
  const { handoverSegretaria: ho, segretariaOpen } = await import('../../api/segretaria/_core.js');
  AI_REPLY = { reply: 'Ciao Anna! Sì, il Trilocale è disponibile 😊 Vuoi vederlo in video?', escalate: false };
  DB.set('leads/ldmail', { status: 'new', name: 'Anna B', email: 'anna@example.com',
    message: 'Hello, I am interested in the Trilocale, is it available from October?',
    propertyId: 'l2', propertyTitle: 'Bilocale Trastevere' });
  const h = await ho('ldmail');
  ok('6j. la consegna accetta un lead SENZA numero (canale email)', h.ok === true, h);
  globalThis.__mails = [];
  const r = await segretariaOpen('ldmail');
  ok('6j. l\'apertura parte e scrive LEI per prima', r.sent === true, r);
  ok('6j. l\'email è partita davvero (nodemailer vero, mockato)', globalThis.__mails.length === 1, globalThis.__mails.length);
  ok('6j. al destinatario giusto, con l\'oggetto del suo immobile',
    globalThis.__mails[0].to === 'anna@example.com' && /Bilocale Trastevere/.test(globalThis.__mails[0].subject), globalThis.__mails[0] && globalThis.__mails[0].subject);
  const r2 = await segretariaOpen('ldmail');
  ok('6j. MUTAZIONE: un secondo click non riapre (conversazione già avviata)', r2.acted === false, r2);
}

// 6k. l'apertura su una chat GIÀ avviata non scrive (il filo esiste già)
{
  const { segretariaOpen } = await import('../../api/segretaria/_core.js');
  await handoverSegretaria(leadId);   // riconsegnata dopo l'escalation di 6i
  const r = await segretariaOpen(leadId);
  ok('6k. chat con turni già fatti → nessuna apertura doppia', r.acted === false && /avviata/.test(r.why || ''), r);
}

// ── 7. IL POSTINO: la consegna WhatsApp non è un atto di fede ──────────────
// Il buco vero del 29/08: la Segretaria scriveva, l'executor marcava
// 'executed', e il messaggio restava nell'outbox che NESSUNO ritirava — in
// silenzio. Il Postino lato server: ripara le azioni uccise a metà volo e
// trasforma la posta ferma in una card col testo pronto (un tap = consegna).
{
  const { postinoTick, postinoStatus } = await import('../../api/telegram/_postino.js');
  const CHAT = '42';
  const NOW2 = NOW + 3600_000;

  // 7a. posta ferma da 10 minuti → UNA card col testo pronto, e il Mac non potrà più rimandarla
  DB.set('action_queue/st1', {
    status: 'executed', kind: 'reply', proposedBy: 'segretaria', autoApplied: true,
    summary: 'Segretaria → Sophie (whatsapp)',
    payload: { channel: 'whatsapp', phone: '+393331234567', draft: 'Ciao! Confermo giovedì alle 17 😊' },
    executedAt: new Date(NOW2 - 10 * 60000).toISOString(),
  });
  const tgB = TG.length;
  const p1 = await postinoTick({ chatId: CHAT, now: NOW2 });
  const st1 = DB.get('action_queue/st1');
  ok('7a. la posta ferma diventa una card 📮', p1.stalled === 1 && TG.length === tgB + 1, p1);
  const card = JSON.stringify(TG[TG.length - 1].body);
  ok('7a. la card porta il testo PRONTO nel bottone wa.me',
    card.includes('wa.me/393331234567') && card.includes(encodeURIComponent('Ciao! Confermo giovedì alle 17 😊').slice(0, 30)), card.slice(0, 200));
  ok('7a. da quel momento la consegna è dell\'operatore (l\'outbox non rimanda)',
    st1.waSendError === 'stalled_operator_notified' && !!st1.waStallNotifiedAt);
  const p2 = await postinoTick({ chatId: CHAT, now: NOW2 + 60000 });
  ok('7a. MUTAZIONE: il secondo giro non rimanda la card', p2.stalled === 0 && TG.length === tgB + 1, p2);

  // 7b. il filtro dell'outbox VERO esclude la posta passata all'operatore
  const outbox = readFileSync(new URL('../../api/homie/wa-outbox.js', import.meta.url), 'utf8');
  ok('7b. wa-outbox non ritira ciò che ha waSendError (niente doppi messaggi)',
    /!a\.waSentAt && !a\.waSendError/.test(outbox));

  // 7c. l'azione della MACCHINA uccisa a metà volo si riesegue da sola
  DB.set('action_queue/hl1', {
    status: 'approved', kind: 'reply', proposedBy: 'segretaria', autoApplied: true,
    leadId: 'ld1',
    payload: { channel: 'whatsapp', phone: '+393331234567', draft: 'Riprovo io: giovedì va bene?' },
    approvedAt: new Date(NOW2 - 5 * 60000).toISOString(),
  });
  const logsB = msgLogs();
  const p3 = await postinoTick({ chatId: CHAT, now: NOW2 + 120000 });
  ok('7c. l\'azione approved-e-mai-eseguita viene rieseguita (executor vero)',
    p3.healed === 1 && DB.get('action_queue/hl1').status === 'executed' && msgLogs() === logsB + 1, p3);

  // 7d. le approvazioni UMANE non si toccano (le riesegue il webhook col retry suo)
  DB.set('action_queue/hu1', {
    status: 'approved', kind: 'reply', autoApplied: false,
    payload: { channel: 'whatsapp', phone: '+393339999999', draft: 'x' },
    approvedAt: new Date(NOW2 - 20 * 60000).toISOString(),
  });
  const p4 = await postinoTick({ chatId: CHAT, now: NOW2 + 180000 });
  ok('7d. MUTAZIONE: un\'approvazione umana non viene rieseguita dal Postino',
    p4.healed === 0 && DB.get('action_queue/hu1').status === 'approved', p4);

  // 7e. la posta fresca (sotto i 5') non allarma nessuno
  DB.set('action_queue/st2', {
    status: 'executed', kind: 'reply', autoApplied: true,
    payload: { channel: 'whatsapp', phone: '+39333', draft: 'fresco' },
    executedAt: new Date(NOW2 + 200000 - 60000).toISOString(),
  });
  const tgB2 = TG.length;
  await postinoTick({ chatId: CHAT, now: NOW2 + 200000 });
  ok('7e. sotto i 5 minuti nessuna card (il Mac ha il suo tempo)', TG.length === tgB2);

  // 7f. i conteggi per /segretaria dicono il vero
  const stt = await postinoStatus();
  ok('7f. lo stato conta la posta in attesa e quella in mano all\'operatore',
    stt.handedToOperator >= 1 && typeof stt.waiting === 'number', stt);

  // 7g. le giunzioni sulla sorgente
  const notif2 = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  ok('7g. il Postino gira dentro notify-pending, best-effort',
    /postinoTick\(\{ chatId \}\)/.test(notif2) && /postino tick failed/.test(notif2));
  const hook2 = readFileSync(new URL('../../api/telegram/webhook.js', import.meta.url), 'utf8');
  const iPw = hook2.indexOf("verb === 'pw'");
  ok('7g. ✅ Consegnato (pw) registra la consegna manuale, prima del lookup generico',
    iPw > -1 && iPw < hook2.indexOf('await fsGet(`action_queue/${actionId}`)') && /waSentBy: 'operator'/.test(hook2));
  const vjson2 = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  ok('7g. notify-pending ha maxDuration 60 (fiducia + postino + card in un minuto)',
    /notify-pending\.js"/.test(vjson2));
  ok('7g. la card della consegna dice la VERITÀ sul canale (executed ≠ consegnato)',
    hook2.includes('in consegna su WhatsApp via Mac'));
}

// ── 8. Persona, voce e seguito: il core vero fino alla rete del modello ────
let fixtureNumber = 0;
function turnFixture(label, status = 'available') {
  const n = ++fixtureNumber;
  const lid = 'lotto1_' + label, cid = 'conv_lead_' + lid, pid = 'home_' + label;
  const phone = '+39333555' + String(n).padStart(4, '0');
  const lead = { id: lid, phone, status: 'new', name: 'Integration fixture',
    language: 'en', message: 'Hello, I am looking for an apartment in Rome.', propertyId: pid };
  const conv = { id: cid, contactType: 'lead', contactId: lid, leadId: lid,
    contactPhone: phone, contactName: 'Integration fixture', segretaria: true, segretariaTurns: 0, needsReply: true };
  const listing = { name: 'Fixture home', price: 1500 };
  if (status !== null) listing.status = status;
  DB.set('leads/' + lid, lead);
  DB.set('conversations/' + cid, conv);
  DB.set('listings/' + pid, listing);
  AI_REPLY = { reply: 'Thanks! Which day works for a visit?', escalate: false };
  return { cid, lead, conv, text: 'Can I arrange a viewing?', messageId: 'lotto1_event_' + label, now: NOW + n * 60000 };
}

{
  const input = turnFixture('voice');
  const before = AI_REQUESTS.length;
  const result = await segretariaTurn(input);
  const request = AI_REQUESTS[before];
  ok('8a. il core usa davvero il costruttore voce condiviso nel prompt Anthropic',
    result.sent === true && AI_REQUESTS.length === before + 1
      && request?.system?.[0]?.text === VOCE.systemPrompt({ channel: 'whatsapp', language: 'en', role: 'lead', opening: false }));
  ok('8a. persona e immobile reali entrano nei fatti del turno',
    request?.messages?.[0]?.content.includes('FASCICOLO DELLA PERSONA')
      && request.messages[0].content.includes('Fixture home'));
  const conversation = DB.get('conversations/' + input.cid);
  const followUps = [...DB.values()].filter(t => t.source === 'segretaria' && t.followUp?.conversationId === input.cid);
  ok('8b. needsReply=false dopo la risposta NON chiude il seguito operativo',
    conversation.needsReply === false && followUps.length === 1 && followUps[0].status === 'open' && followUps[0].followUp.open === true);
  ok('8b. restano prossima azione, responsabile e ricontrollo dopo la risposta',
    !!followUps[0]?.followUp.nextAction && followUps[0].followUp.waitingOn === 'valentino'
      && Date.parse(followUps[0].followUp.checkAt) > input.now && followUps[0].followUp.confirmed === false);
}

for (const role of ['tenant', 'landlord', 'pfs']) {
  const input = turnFixture('protected_' + role);
  const coll = role === 'pfs' ? 'pfsClients' : role === 'landlord' ? 'landlords' : 'users';
  // The lead/conversation still say "lead", and the protected row uses the
  // national number. The real persona lookup must find the relationship.
  DB.set(coll + '/protected_' + role, { phone: input.lead.phone.slice(3), role });
  const before = AI_REQUESTS.length, beforeLogs = msgLogs();
  const result = await segretariaTurn(input);
  ok(`8c. il vecchio lead non nasconde ${role}: escalation PRIMA dell'AI`,
    result.escalated === true && AI_REQUESTS.length === before && msgLogs() === beforeLogs
      && DB.get('conversations/' + input.cid).segretaria === false, result);
}

{
  const input = turnFixture('ambiguous');
  input.lead.email = 'identity-a@example.test';
  input.conv.contactEmail = 'identity-b@example.test';
  DB.set('leads/' + input.lead.id, input.lead);
  DB.set('conversations/' + input.cid, input.conv);
  const before = AI_REQUESTS.length, beforeLogs = msgLogs();
  const result = await segretariaTurn(input);
  ok('8d. identità phone/email contraddittoria blocca l\'AI e passa a Valentino',
    result.escalated === true && AI_REQUESTS.length === before && msgLogs() === beforeLogs, result);
}

{
  const input = turnFixture('history');
  for (let i = 0; i < 41; i++) DB.set('messages/history_' + i, {
    conversationId: input.cid, direction: i % 2 ? 'in' : 'out',
    at: new Date(NOW - (50 - i) * 60000), body: 'Previous discussion about the viewing.',
  });
  const dossier = await personaDossier({ phone: input.lead.phone, leadId: input.lead.id, conversationId: input.cid });
  ok('8e. storia oltre il limite segnala solo historyIncomplete',
    dossier.historyIncomplete === true && dossier.identityIncomplete === false && dossier.identityAmbiguous === false);
  const before = AI_REQUESTS.length;
  const result = await segretariaTurn(input);
  ok('8e. sola storia parziale non spegne una chat consegnata con identità verificata',
    result.sent === true && AI_REQUESTS.length === before + 1, result);
}

for (const [label, status, expected] of [
  ['unavailable', 'unavailable', 'STATO: NON PIÙ DISPONIBILE'],
  ['missing_status', null, 'STATO: DA VERIFICARE'],
]) {
  const input = turnFixture(label, status);
  const before = AI_REQUESTS.length;
  const result = await segretariaTurn(input);
  const facts = AI_REQUESTS[before]?.messages?.[0]?.content || '';
  ok(`8f. ${label}: il prompt non dichiara disponibile la casa`,
    result.sent === true && facts.includes(expected) && !facts.includes("IMMOBILE D'INTERESSE — STATO: DISPONIBILE"), { sent: result.sent, expected });
}

{
  const input = turnFixture('identity_unavailable');
  failingCollection = 'landlords';
  const before = AI_REQUESTS.length;
  const result = await segretariaTurn(input);
  failingCollection = null;
  ok('8g. fonte identità non leggibile → escalation prima dell\'AI',
    result.escalated === true && AI_REQUESTS.length === before, result);
}

{
  const input = turnFixture('followup_unavailable');
  failCommit = true;
  const before = AI_REQUESTS.length;
  const result = await segretariaTurn(input);
  failCommit = false;
  ok('8h. impossibile conservare il seguito → escalation, nessuna promessa automatica',
    result.escalated === true && AI_REQUESTS.length === before, result);
}

{
  const input = turnFixture('human_takeover');
  await segretariaTurn(input);
  await call({ direction: 'out', channel: 'whatsapp', phone: input.lead.phone,
    body: 'Da qui rispondo io personalmente.', messageId: 'lotto1_human_reply' });
  const before = AI_REQUESTS.length;
  const result = await call({ direction: 'in', channel: 'whatsapp', phone: input.lead.phone,
    body: 'Grazie, attendo conferma della visita.', messageId: 'lotto1_after_human' });
  const tasks = [...DB.values()].filter(t => t.source === 'segretaria' && t.followUp?.conversationId === input.cid);
  ok('8i. nuovo inbound dopo risposta umana aggiorna il caso anche con Segretaria spenta',
    result.ok === true && DB.get('conversations/' + input.cid).segretaria === false
      && tasks.length === 1 && tasks[0].status === 'open'
      && tasks[0].followUp.lastMessageId === 'lotto1_after_human'
      && tasks[0].followUp.needsReview === true, { tasks: tasks.length, lastMessageId: tasks[0]?.followUp.lastMessageId });
  ok('8i. il seguito dopo presa in carico umana non riattiva l\'AI', AI_REQUESTS.length === before);
}

// ── 9. Preparazione attiva, vecchie risposte sospese: porte REALI ─────────
const { segretariaOpen, segretariaOffConv, segretariaStatusMessage, toggleSegretariaKill } = await import('../../api/segretaria/_core.js');
const { default: telegramHandler } = await import('../../api/telegram/webhook.js');
const { default: scanHandler } = await import('../../api/segretaria/scan-replies.js');
const { prepareNextCase } = await import('../../api/segretaria/worker.js');
const { approvePreparation } = await import('../../api/segretaria/_dispatch.js');
const liveNow = Date.now();
const pausedConfig = { enabled: true, automaticReplies: false, prepareCases: true,
  prepareSince: new Date(liveNow - 60000).toISOString(), dailyCap: 5 };
const collectionRows = coll => [...DB].filter(([p]) => p.startsWith(coll + '/'));
function resetReplyGate() {
  DB.clear(); TG.length = 0; AI_REQUESTS.length = 0; globalThis.__mails = [];
  failingPath = null; AI_HOOK = null; globalThis.__imap = [];
  DB.set('settings/segretaria', { ...pausedConfig });
}
async function invoke(actualHandler, req) {
  let code, data;
  await actualHandler(req, { setHeader() {}, status(n) { code = n; return this; },
    json(v) { data = v; return this; }, end() { return this; } });
  return { code, ...data };
}
const noReplyEffects = () => AI_REQUESTS.length === 0 && collectionRows('action_queue').length === 0
  && msgLogs() === 0 && globalThis.__mails.length === 0;

{
  resetReplyGate();
  const input = turnFixture('replies_off');
  const r = await call({ phone: input.lead.phone, direction: 'in', channel: 'whatsapp',
    body: input.text, messageId: 'pause_inbound', timestamp: new Date(liveNow).toISOString() });
  const follow = collectionRows('operatorTasks').find(([, t]) => t.followUp?.conversationId === input.cid)?.[1];
  ok('9a. automaticReplies false: WhatsApp conserva messaggio e seguito senza vecchio turno', r.ok
    && collectionRows('messages').length === 1 && follow?.followUp.lastMessageId === 'pause_inbound'
    && DB.get('conversations/' + input.cid).needsReply === true && noReplyEffects() && TG.length === 0, r);
  const result = await segretariaTurn(input);
  ok('9a. turno sospeso restituisce motivo esplicito senza spesa, coda, mail o Telegram', result.blocked
    && result.whyCode === 'automatic_replies_disabled' && noReplyEffects() && TG.length === 0, result);
  const status = await segretariaStatusMessage();
  ok('9a. quadro distingue preparazione attiva e risposte sospese', status.msg.includes('Risposte automatiche sospese')
    && status.msg.includes('Preparazione dei casi attiva') && !status.msg.includes('🟢 in servizio'));
  await toggleSegretariaKill(); await toggleSegretariaKill();
  ok('9a. riaccendere il kill switch non riabilita automaticReplies', DB.get('settings/segretaria').enabled === true
    && DB.get('settings/segretaria').automaticReplies === false);
  DB.set('action_queue/previous_legacy', { proposedBy: 'segretaria', status: 'executed',
    payload: { channel: 'whatsapp', draft: 'Risposta preparata prima della sospensione.' } });
  const oldAction = JSON.stringify(DB.get('action_queue/previous_legacy'));
  await segretariaTurn(input);
  ok('9a. sospendere i nuovi turni non cancella o altera azioni già accodate',
    JSON.stringify(DB.get('action_queue/previous_legacy')) === oldAction);
}

{
  resetReplyGate();
  const leadId = 'paused_email';
  DB.set('leads/' + leadId, { name: 'Email fixture', email: 'paused@example.test', message: 'Can I arrange a viewing?' });
  const handover = await handoverSegretaria(leadId);
  const r = await segretariaOpen(leadId);
  ok('9b. apertura email-only resta sospesa dopo consegna reale', handover.ok && r.blocked && noReplyEffects(), r);
  process.env.TELEGRAM_WEBHOOK_SECRET = 'fixture-secret';
  const tap = await invoke(telegramHandler, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'fixture-secret' },
    body: { callback_query: { id: 'pause-callback', data: 'sg:' + leadId,
      message: { chat: { id: 42 }, message_id: 77, text: 'Richiesta sintetica' } } } });
  const edited = TG.filter(t => t.method === 'editMessageText').at(-1)?.body.text || '';
  ok('9b. tap Telegram comunica consegna registrata, non una risposta autonoma', tap.code === 200
    && edited.includes('CONSEGNA REGISTRATA · RISPOSTE SOSPESE') && !edited.includes('risponde lei su questa chat')
    && noReplyEffects(), { tap, edited });

  TG.length = 0;
  process.env.PFS_IMAP_USER = 'operator@example.test'; process.env.PFS_IMAP_PASS = 'fixture';
  globalThis.__imap = [{ uid: 1, from: 'paused@example.test', raw: [
    'From: paused@example.test', 'To: operator@example.test', 'Message-ID: <paused-email-fixture@example.test>',
    'Date: ' + new Date(liveNow).toUTCString(), 'Subject: Re: Viewing', 'Content-Type: text/plain; charset=utf-8',
    '', 'Can I arrange a viewing?', '',
  ].join('\r\n') }];
  const scan = await invoke(scanHandler, { method: 'GET', query: {}, headers: { 'x-homie-secret': 'test-secret' } });
  ok('9c. cron email registra risposta e caso con automaticReplies false, senza rispondere', scan.code === 200
    && scan.processed === 1 && scan.refreshed === 1 && scan.turns === 0 && scan.escalated === 0
    && collectionRows('messages').some(([, m]) => m.channel === 'email' && m.direction === 'in')
    && DB.get('conversations/' + handover.cid).needsReply === true && noReplyEffects() && TG.length === 0, scan);
}

{
  resetReplyGate();
  const input = turnFixture('settings_unreadable');
  failingPath = 'settings/segretaria';
  const result = await segretariaTurn(input);
  ok('9d. errore lettura impostazioni non diventa autorizzazione automatica', result.blocked
    && result.whyCode === 'reply_settings_unavailable' && noReplyEffects() && TG.length === 0, result);
  const opened = await segretariaOpen(input.lead.id);
  const status = await segretariaStatusMessage();
  ok('9d. apertura e quadro dichiarano impostazioni illeggibili', opened.whyCode === 'reply_settings_unavailable'
    && status.msg.includes('Impostazioni non verificabili') && !status.msg.includes('🟢 in servizio'));
  failingPath = null;
}

{
  resetReplyGate();
  const input = turnFixture('pause_during_model');
  DB.set('settings/segretaria', { enabled: true, automaticReplies: true });
  AI_HOOK = () => DB.set('settings/segretaria', { ...pausedConfig });
  const result = await segretariaTurn(input);
  AI_HOOK = null;
  ok('9e. sospensione durante AI impedisce la nuova azione prima di ogni invio', result.blocked
    && result.whyCode === 'automatic_replies_disabled' && AI_REQUESTS.length === 1
    && !collectionRows('action_queue').length && !msgLogs() && !globalThis.__mails.length && !TG.length
    && DB.get('conversations/' + input.cid).needsReply === true, result);
}

{
  resetReplyGate();
  const input = turnFixture('proposal_remains_enabled');
  // Explicit operator takeover frees reply ownership; pausing globally does
  // not silently revoke the previously handed conversation.
  await segretariaOffConv(input.cid);
  await call({ phone: input.lead.phone, direction: 'in', channel: 'whatsapp', body: input.text,
    messageId: 'paused_proposal_inbound', timestamp: new Date(liveNow).toISOString() });
  AI_HOOK = request => {
    const context = JSON.parse(request.messages[0].content);
    const source = context.sources.find(s => s.id === context.coverage.lastEvent.sourceId);
    const sourceIds = [source.id];
    AI_REPLY = { summary: 'Il cliente chiede una visita.', recommendation: 'Verificare le opzioni di visita.',
      facts: [{ text: 'Richiesta una visita.', sourceIds, quote: source.text }], commitments: [], uncertainties: [],
      nextAction: { text: 'Verificare le opzioni di visita', waitingOn: 'valentino', waitingLabel: 'Valentino',
        checkAt: new Date(liveNow + 3600000).toISOString(),
        checkLocal: CALENDAR.romeLocalInstant(new Date(liveNow + 3600000).toISOString()), practiceRef: 'leads/' + input.lead.id,
        sourceIds, reason: 'Serve una verifica prima di confermare.' },
      draft: { channel: 'whatsapp', text: 'Thanks, we will check the viewing options.', sourceIds },
      handoff: { needed: false, reason: 'Valentino verifica e conferma la risposta.', sourceIds } };
  };
  const captured = collectionRows('operatorTasks').find(([, t]) => t.followUp?.conversationId === input.cid)?.[1];
  ok('9f. l’ingresso reale crea il caso aperto della Segretaria prima del worker', captured?.source === 'segretaria'
    && captured.status === 'open' && captured.followUp.open === true
    && captured.followUp.lastMessageId === 'paused_proposal_inbound');
  const worker = await prepareNextCase({ now: liveNow });
  AI_HOOK = null;
  const task = DB.get('operatorTasks/' + worker.id);
  ok('9f. worker prepara normalmente mentre automaticReplies è false', worker.prepared === 1
    && task?.preparation.draft?.text && AI_REQUESTS.length === 1 && !collectionRows('action_queue').length
    && !msgLogs() && !globalThis.__mails.length && !TG.length, worker);
  if (task?.preparation) {
    const approval = await approvePreparation({ id: worker.id, revision: task.preparation.revision,
      lastMessageId: task.followUp.lastMessageId, actor: 'admin', now: liveNow });
    ok('9f. conferma esplicita usa executor reale anche con automaticReplies false', approval.code === 200
      && approval.delivery === 'queued' && collectionRows('action_queue').length === 1 && segActions().length === 0
      && collectionRows('action_queue')[0][1].proposedBy === 'segretaria-proposal'
      && AI_REQUESTS.length === 1 && !globalThis.__mails.length && !TG.length, approval);
  } else ok('9f. proposta necessaria alla prova di conferma esplicita', false);
}

// Actually reintroduce the defects; each child must fail its named behavioural
// assertion, not just fail to load. Portable scratch directory also runs in CI.
if (!process.env.BOOM_REPLY_GATE_MUTATION) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const scratch = mkdtempSync(join(tmpdir(), 'boom-reply-gate-'));
  try {
    for (const path of ['api', 'js', 'tests/segretaria', 'tests/notify', 'vercel.json'])
      cpSync(join(root, path), join(scratch, path), { recursive: true, filter: p => !p.includes('node_modules') });
    symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
    const files = ['api/segretaria/_core.js', 'api/telegram/webhook.js'];
    const sources = Object.fromEntries(files.map(f => [f, readFileSync(join(root, f), 'utf8')]));
    for (const [name, file, from, to, expected] of [
      ['flag rimosso', files[0], 'if (raw?.automaticReplies === false)', 'if (false)', '9a. automaticReplies false'],
      ['rilettura rimossa', files[0], 'if (gateBeforeAction.blocked)', 'if (false)', '9e. sospensione durante AI'],
      ['consegna ingannevole', files[1], 'const handoverLine = opened?.blocked', 'const handoverLine = false', '9b. tap Telegram'],
    ]) {
      for (const f of files) writeFileSync(join(scratch, f), sources[f]);
      if (!sources[file].includes(from)) { ok('mutazione ' + name + ': bersaglio presente', false); continue; }
      writeFileSync(join(scratch, file), sources[file].replace(from, to));
      const child = spawnSync(process.execPath, ['tests/segretaria/run.mjs'], { cwd: scratch,
        env: { ...process.env, BOOM_REPLY_GATE_MUTATION: '1' }, encoding: 'utf8', timeout: 30000 });
      ok('mutazione ' + name + ' è catturata dal percorso reale', child.status === 1
        && child.stdout.includes('FAIL ' + expected), child.status === 1 ? child.stderr.slice(-300) : { status: child.status, error: child.error?.message });
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

console.log(fails ? `\n${fails} FAIL` : '\nOK — risposte automatiche controllate, ricezione e preparazione conservate, conferma esplicita verificata.');
process.exit(fails ? 1 : 0);
