// tests/scrivano/run.mjs — LO SCRIVANO, passo 4: la porta dal telefono.
//
// Il giro VERO sui handler reali, con un Firestore in memoria, un Telegram
// finto e un Anthropic finto: un contratto mandato al bot viene archiviato
// dallo Smistatore con un id deterministico e la risposta porta il bottone
// 🌱; il tap NON legge dentro il webhook (Telegram ritenta, Vercel congela):
// mette in coda e lo dice; il worker legge col CUORE dell'Innesto (stesso
// prompt, i BYTE archiviati), scrive la proposta e manda la card col link
// #innesto=<docId>; un secondo tap non legge due volte; i guasti
// deterministici si chiudono subito col rimedio, quelli momentanei si
// riprovano UNA volta. Più: l'offerta dentro smistaDocument, così le porte
// di Codex (WhatsApp, email) la ereditano; e le giunzioni sulla sorgente.
//
// Esegui: node tests/scrivano/run.mjs

import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);   // nodemailer mockato: agent/_lib lo importa in cima

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.ANTHROPIC_API_KEY = 'an';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
process.env.TELEGRAM_CHAT_ID = '777';
process.env.CRON_SECRET = 'cron-secret';
delete process.env.TELEGRAM_WEBHOOK_SECRET;

let fails = 0, passes = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `  \x1b[32m✓\x1b[0m ${name}` : `  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''}`);
  if (cond) passes++; else fails++;
};

// ─── Firestore in memoria (stessa disciplina di tests/documents/smista) ────
const DB = new Map();
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
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });
let autoId = 0;

// ─── le reti: Telegram, Storage, Anthropic ─────────────────────────────────
const TG = [];                       // { method, body }
const PDF_BYTES = Buffer.from('%PDF-1.4 CONTRATTO VIA SIMETO 12 — Oyku Testa — canone 1.100');
let storageUploads = 0, storageDownloads = 0;
let aiSmista = 0, aiIngest = 0, lastIngestBody = null;
let aiSmistaJson = { category: 'contratto', fiscalYear: 2026, propertyId: 'pA', tenantName: 'Oyku Testa', summary: 'Contratto transitorio Via Simeto 12' };
const INGEST_OK = () => ({
  files: [{ index: 1, kind: 'contratto', title: 'Contratto transitorio Via Simeto 12', pages: 3, legible: true, summary: 'contratto firmato', party: null }],
  landlord: { name: 'Anna Rossi', kind: null, businessName: null, partitaIva: null, iban: 'IT60X0542811101000000123456', email: null, phone: null, codiceFiscale: 'RSSNNA70A41H501J', address: null, birthDate: null, birthPlace: null, nationality: null, docType: null, docNum: null, docIssuer: null, docIssueDate: null },
  tenant: { name: 'Oyku Testa', email: 'oyku@example.com', phone: null, codiceFiscale: 'TSTOYK95A41H501P', address: null, birthDate: '1995-01-01', birthPlace: 'Istanbul', nationality: 'turca', docType: 'passport', docNum: 'U12345678', docIssuer: null, docIssueDate: null, permessoNumero: null, permessoScadenza: null },
  coTenants: [],
  property: { name: 'Via Simeto 12', address: 'Via Simeto 12, Roma', city: 'Roma', rent: 1100, sqm: null, rooms: null, bathrooms: null, floor: null, scala: null, interno: null, accessories: null, furnished: null, energyClass: null, cadastral: { sezione: null, foglio: '12', particella: '345', sub: '6', categoria: null, rendita: null }, tabelle: { proprieta: null, riscaldamento: null, ascensore: null } },
  contract: { type: 'transitorio', startDate: '2026-09-01', endDate: '2027-08-31', durationMonths: 12, rent: 1100, deposit: 2200, depositMonths: 2, paymentDay: 5, installmentMonths: '1', accessoryCharges: null, condoMode: null, cedolareSecca: true, transitionalReason: 'motivi di lavoro', transitionalDocs: null, esigenzaDi: 'conduttore', studenti: null, cohabitants: null, otherClauses: null, signaturePlace: 'Roma', signatureDate: '2026-08-20', paymentMethod: null, istatPct: null, notes: null },
  evidence: [{ path: 'contract.rent', quote: 'canone mensile di euro 1.100', file: 1, page: 1 }, { path: 'tenant.codiceFiscale', quote: 'C.F. TSTOYK95A41H501P', file: 1, page: 1 }],
  notes: [], confidence: 88, summary: 'Contratto transitorio firmato, Via Simeto 12, canone 1.100.',
});
let AI = { status: 200, text: '' };   // la risposta del modello per la LETTURA (l'Innesto)

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (u.includes('api.telegram.org/file/')) return new Response(PDF_BYTES, { status: 200, headers: { 'content-type': 'application/pdf' } });
  if (u.includes('api.telegram.org/bot')) {
    const method = u.split('/').pop();
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (method.startsWith('getFile')) return json({ ok: true, result: { file_path: 'documents/file_1.pdf' } });
    TG.push({ method, body });
    return json({ ok: true, result: { message_id: 1000 + TG.length } });
  }
  if (u.includes('firebasestorage.googleapis.com')) {
    if (opts.method === 'POST') { storageUploads++; return json({ downloadTokens: 'dl-tok' }); }
    storageDownloads++;
    return new Response(PDF_BYTES, { status: 200, headers: { 'content-type': 'application/pdf' } });
  }
  if (u.includes('api.anthropic.com')) {
    const body = JSON.parse(opts.body || '{}');
    if (body.output_config) {
      aiIngest++; lastIngestBody = body;
      if (AI.status !== 200) return new Response(AI.text || 'err', { status: AI.status });
      return json({ model: 'claude-opus-5', stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 1200 }, content: [{ type: 'text', text: JSON.stringify(INGEST_OK()) }] });
    }
    aiSmista++;
    return json({ content: [{ type: 'text', text: JSON.stringify(aiSmistaJson) }] });
  }
  // Firestore REST
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const coll = body.structuredQuery.from[0].collectionId;
    return json([...DB.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2).map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next); return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const qm = u.match(/documentId=([^&]+)/);
    const id = qm ? decodeURIComponent(qm[1]) : 'doc' + (++autoId);
    const key = `${path}/${id}`;
    if (qm && DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(key, DB.get(key)));
  }
  if (opts.method === 'DELETE') { DB.delete(path); return json({}); }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

const call = async (handler, { method = 'POST', headers = {}, body = null, query = {} } = {}) => {
  const req = { method, headers, body, query };
  let code = 200, out = null;
  const res = { setHeader() {}, status(c) { code = c; return res; }, json(o) { out = o; return res; }, send(o) { out = o; return res; }, end() { return res; } };
  await handler(req, res);
  return { code, body: out };
};
const tgAfter = (n) => TG.slice(n);
const lastSend = () => [...TG].reverse().find((t) => t.method === 'sendMessage');

DB.set('properties/pA', { id: 'pA', name: 'Bilocale Cavour', address: 'Via Cavour 12', title: 'Bilocale Cavour' });
DB.set('users/u1', { id: 'u1', name: 'Oyku Testa', role: 'tenant', email: 'oyku@example.com' });
DB.set('landlords/l1', { id: 'l1', name: 'Anna Rossi' });

const { default: webhook } = await import('../../api/telegram/webhook.js');
const { default: worker } = await import('../../api/scrivano/worker.js');
const core = await import('../../api/scrivano/_core.js');
const offer = await import('../../api/scrivano/_offer.js');
const { smistaDocument } = await import('../../api/documents/_smista.js');

const docIdOf = (uq) => 'tg_' + crypto.createHash('sha1').update(uq).digest('hex').slice(0, 24);

// ─── 1. l'offerta: chi la merita, e il bottone che non uccide la tastiera ──
console.log('\n\x1b[1m1. L\'offerta 🌱 — solo le classi che l\'Innesto sa leggere\x1b[0m');
ok('contratto / documento d\'identità / visura / APE sono eleggibili', ['contratto', 'documento_identita', 'visura', 'ape'].every((k) => offer.scrivanoEligible(k, 'tg_abc')));
ok('rli / cedolare / istat / utenza NON lo sono (eventi su un contratto che c\'è già → oggi farebbero un doppione)', ['rli', 'cedolare', 'istat', 'utenza', 'altro', null].every((k) => !offer.scrivanoEligible(k, 'tg_abc')));
ok('un id che sfora i 64 byte del callback non riceve il bottone (tastiera morta in silenzio)', !offer.scrivanoEligible('contratto', 'x'.repeat(62)) && offer.scrivanoEligible('contratto', 'x'.repeat(61)));
ok('un id con «:» non entra (il webhook separa verbo e id sui due punti)', !offer.scrivanoEligible('contratto', 'a:b'));
ok('il bottone porta sc:<docId> entro 64 byte', Buffer.byteLength(offer.offerKeyboard('tg_' + 'a'.repeat(24)).inline_keyboard[0][0].callback_data) <= 64);

// ─── 2. dal bot: archiviato con id deterministico + bottone ─────────────────
console.log('\n\x1b[1m2. Un contratto mandato al bot: archiviato, e la risposta porta il bottone\x1b[0m');
const docUpdate = { message: { chat: { id: 777 }, message_id: 10, document: { file_id: 'F1', file_unique_id: 'UQ-1', file_name: 'contratto-simeto.pdf', mime_type: 'application/pdf', file_size: 1234 } } };
let t0 = TG.length;
let r = await call(webhook, { body: docUpdate });
const DOC = docIdOf('UQ-1');
ok('200 e il documento nasce con l\'id DERIVATO dal file_unique_id', r.code === 200 && DB.has('documents/' + DOC), [...DB.keys()].filter((k) => k.startsWith('documents/')));
ok('…archiviato dallo Smistatore come contratto, sotto l\'immobile', DB.get('documents/' + DOC)?.category === 'contratto locazione' && DB.get('documents/' + DOC)?.propertyId === 'pA', DB.get('documents/' + DOC));
let reply = lastSend();
ok('la risposta dice «Archiviato» e offre la lettura', /Archiviato/.test(reply?.body?.text || '') && /Posso leggerlo/.test(reply?.body?.text || ''), reply?.body?.text);
ok('…col bottone 🌱 → sc:<docId>', reply?.body?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'sc:' + DOC, reply?.body?.reply_markup);
ok('il webhook NON ha letto niente (nessuna chiamata del cuore, solo lo Smistatore)', aiIngest === 0 && aiSmista === 1, { aiIngest, aiSmista });
const s0 = aiSmista, up0 = storageUploads;
r = await call(webhook, { body: docUpdate });
reply = lastSend();
ok('lo STESSO file rimandato: «Già in archivio», nessuna seconda archiviazione, nessuna spesa', /Già in archivio/.test(reply?.body?.text || '') && aiSmista === s0 && storageUploads === up0, reply?.body?.text);
ok('…ma il bottone resta (magari ora lo vuoi leggere)', reply?.body?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'sc:' + DOC);

// ─── 3. il tap: in coda, non una lettura dentro il webhook ──────────────────
console.log('\n\x1b[1m3. Il tap 🌱 mette in coda (Telegram ritenta, Vercel congela: la lettura non sta nel webhook)\x1b[0m');
const cb = (id, cbid = 'cb1') => ({ callback_query: { id: cbid, data: 'sc:' + id, message: { chat: { id: 777 }, message_id: 42, text: '📁 Archiviato: Contratto di locazione' } } });
t0 = TG.length;
r = await call(webhook, { body: cb(DOC) });
let q = DB.get(core.QUEUE + '/' + DOC);
ok('scrivanoProposals/<docId> nasce «queued» con chat e messaggio', r.code === 200 && q && q.status === 'queued' && q.chatId === '777' && q.messageId === 42 && q.document?.fileUrl, q);
ok('il bottone viene ACCOLTO (answerCallbackQuery) e il messaggio dice «In coda» senza più tastiera',
  tgAfter(t0).some((t) => t.method === 'answerCallbackQuery') && tgAfter(t0).some((t) => t.method === 'editMessageText' && /In coda/.test(t.body.text) && t.body.reply_markup?.inline_keyboard?.length === 0), tgAfter(t0));
ok('nessuna lettura dentro il webhook', aiIngest === 0);
t0 = TG.length;
r = await call(webhook, { body: cb(DOC, 'cb2') });
ok('un secondo tap non raddoppia: resta UNA voce in coda e lo dice', DB.get(core.QUEUE + '/' + DOC)?.status === 'queued' && tgAfter(t0).some((t) => /già in coda/i.test(t.body.text || '')), tgAfter(t0).map((t) => t.body.text));

// ─── 4. il worker: legge col cuore dell'Innesto e manda la card ─────────────
console.log('\n\x1b[1m4. Il worker (cron al minuto): UNA lettura, i byte archiviati, la card col link\x1b[0m');
r = await call(worker, { method: 'GET', headers: {} });
ok('senza credenziali il worker non lavora (401)', r.code === 401);
t0 = TG.length;
r = await call(worker, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } });
q = DB.get(core.QUEUE + '/' + DOC);
ok('il run legge il documento in coda e lo segna «done»', r.code === 200 && r.body?.done === DOC && q?.status === 'done', r.body);
ok('la proposta è nello schema del portal (tenant, landlord, property, contract) con citazioni e verdetto per file',
  q?.proposal?.tenant?.name === 'Oyku Testa' && q?.proposal?.contract?.rent === 1100 && q?.proposal?.property?.foglio === '12' && (q?.evidence || []).some((e) => e.path === 'contract.rent') && q?.files?.[0]?.kind === 'contratto', q?.proposal);
ok('i BYTE letti sono quelli archiviati (scaricati dallo Storage, non da Telegram)', storageDownloads >= 1 && (lastIngestBody?.messages?.[0]?.content || []).some((b) => b.type === 'document' && b.source?.data === PDF_BYTES.toString('base64')));
const promptText = (lastIngestBody?.messages?.[0]?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
ok('il contesto è quello del desktop: i nomi in archivio (inquilini, proprietari, immobili) e l\'immobile agganciato come indicazione',
  /Oyku Testa/.test(promptText) && /Anna Rossi/.test(promptText) && /Via Cavour 12/.test(promptText), promptText.slice(-400));
ok('output strutturato anche dal telefono (stesso cuore: output_config json_schema)', lastIngestBody?.output_config?.format?.type === 'json_schema' && lastIngestBody?.model === 'claude-opus-5');
const card = lastSend();
ok('la card dice «Proposta pronta» con parti, immobile e termini', /Proposta pronta/.test(card?.body?.text || '') && /Oyku Testa/.test(card?.body?.text) && /Via Simeto 12/.test(card?.body?.text) && /1\.100/.test(card?.body?.text), card?.body?.text);
ok('…e il bottone apre il portal su #innesto=<docId> (www, mai l\'apex)', card?.body?.reply_markup?.inline_keyboard?.[0]?.[0]?.url === 'https://www.boomrome.com/portal#innesto=' + DOC, card?.body?.reply_markup);
ok('il battito è scritto (teamHealth/scrivano)', DB.get('teamHealth/scrivano')?.ok === true);
const i0 = aiIngest;
r = await call(worker, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } });
ok('coda vuota → idle, nessuna seconda lettura', r.body?.idle === true && aiIngest === i0, r.body);
t0 = TG.length;
r = await call(webhook, { body: cb(DOC, 'cb3') });
ok('un tap DOPO la lettura rimanda la card col link, senza rileggere', aiIngest === i0 && /Proposta pronta/.test(lastSend()?.body?.text || '') && lastSend()?.body?.reply_markup?.inline_keyboard?.[0]?.[0]?.url?.includes(DOC) && DB.get(core.QUEUE + '/' + DOC)?.status === 'done');

// ─── 5. i guasti: deterministico subito, momentaneo una volta ───────────────
console.log('\n\x1b[1m5. I guasti: «troppo lungo» si chiude subito col rimedio, un 500 si riprova UNA volta\x1b[0m');
DB.set('documents/d2', { name: 'Contratto lungo', fileName: 'lungo.pdf', fileUrl: 'https://firebasestorage.googleapis.com/v0/b/t/o/smistatore%2Flungo.pdf?alt=media&token=t', mimeType: 'application/pdf', category: 'contratto locazione', type: 'contract' });
await call(webhook, { body: cb('d2', 'cb4') });
AI = { status: 400, text: '{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 250000 tokens > 200000 maximum"}}' };
t0 = TG.length;
r = await call(worker, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } });
q = DB.get(core.QUEUE + '/d2');
ok('«prompt is too long» → failed al primo tentativo, con l\'errore di classe', r.body?.failed === 'd2' && q?.status === 'failed' && q?.error === 'ai_too_long' && q?.attempts === 1, q);
ok('…e la card dice il rimedio (meno pagine, due giri), mai «riprova»', /Lettura non riuscita/.test(lastSend()?.body?.text || '') && /due giri/.test(lastSend()?.body?.text || ''), lastSend()?.body?.text);
DB.set('documents/d3', { name: 'Contratto sfortunato', fileName: 'sf.pdf', fileUrl: 'https://firebasestorage.googleapis.com/v0/b/t/o/smistatore%2Fsf.pdf?alt=media&token=t', mimeType: 'application/pdf', category: 'contratto locazione', type: 'contract' });
await call(webhook, { body: cb('d3', 'cb5') });
AI = { status: 500, text: 'boom' };
t0 = TG.length;
r = await call(worker, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } });
q = DB.get(core.QUEUE + '/d3');
ok('un 500 del fornitore → torna in coda con attempts=1, nessuna card ancora', r.body?.retried === 'd3' && q?.status === 'queued' && q?.attempts === 1 && TG.length === t0, q);
r = await call(worker, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } });
q = DB.get(core.QUEUE + '/d3');
ok('al secondo fallimento si chiude (MAX_ATTEMPTS) e lo si dice', r.body?.failed === 'd3' && q?.status === 'failed' && q?.attempts === 2 && /Lettura non riuscita/.test(lastSend()?.body?.text || ''), q);
ok('un 400 del modello che non è «troppo materiale» (ai_bad_request, ai_bad_document) è deterministico: il worker non lo riprova', core.DETERMINISTIC.has('ai_bad_request') && core.DETERMINISTIC.has('ai_bad_document'));
AI = { status: 200, text: '' };
ok('pickNext: una lettura «reading» col lease scaduto torna eleggibile, una fresca no',
  core.pickNext([{ docId: 'x', status: 'reading', leaseAt: new Date(Date.now() - 10 * 60e3).toISOString(), queuedAt: '2026-09-14T10:00:00Z' }])?.docId === 'x'
  && core.pickNext([{ docId: 'y', status: 'reading', leaseAt: new Date().toISOString(), queuedAt: '2026-09-14T10:00:00Z' }]) === null);
ok('pickNext: la più vecchia prima', core.pickNext([{ docId: 'b', status: 'queued', queuedAt: '2026-09-14T11:00:00Z' }, { docId: 'a', status: 'queued', queuedAt: '2026-09-14T10:00:00Z' }])?.docId === 'a');
r = await call(webhook, { body: cb('nope', 'cb6') });
ok('un tap su un documento che non esiste lo dice, senza mettere in coda', /non trovato/i.test(lastSend()?.body?.text || '') && !DB.has(core.QUEUE + '/nope'));

// ─── 6. le porte di Codex ereditano l'offerta ───────────────────────────────
console.log('\n\x1b[1m6. Le altre porte (WhatsApp, email) ereditano l\'offerta da smistaDocument\x1b[0m');
t0 = TG.length;
let out = await smistaDocument({ base64: PDF_BYTES.toString('base64'), mediaType: 'application/pdf', fileName: 'wa.pdf', hint: null, origin: 'whatsapp', docId: 'wa_abc', relation: { kind: 'landlord', propertyIds: ['pA'] } });
ok('un contratto arrivato da WhatsApp → card Telegram «archiviato dalla porta whatsapp» col bottone sc:wa_abc',
  out.ok && tgAfter(t0).some((t) => t.method === 'sendMessage' && /porta whatsapp/.test(t.body.text) && t.body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'sc:wa_abc'), tgAfter(t0));
t0 = TG.length;
aiSmistaJson = { category: 'utenza', fiscalYear: 2026, propertyId: 'pA', summary: 'bolletta' };
out = await smistaDocument({ base64: PDF_BYTES.toString('base64'), mediaType: 'application/pdf', fileName: 'luce.pdf', hint: null, origin: 'whatsapp', docId: 'wa_luce' });
ok('una bolletta non riceve l\'offerta (classe non eleggibile)', out.ok && TG.length === t0);
aiSmistaJson = { category: 'contratto', fiscalYear: 2026, propertyId: 'pA', summary: 'contratto' };
t0 = TG.length;
out = await smistaDocument({ base64: PDF_BYTES.toString('base64'), mediaType: 'application/pdf', fileName: 'c.pdf', hint: null, origin: 'telegram', docId: 'tg_manual' });
ok('con origin telegram smistaDocument NON manda la card (il bottone lo mette il webhook nella sua risposta)', out.ok && TG.length === t0);
t0 = TG.length;
out = await smistaDocument({ base64: PDF_BYTES.toString('base64'), mediaType: 'application/pdf', fileName: 'wa.pdf', hint: null, origin: 'whatsapp', docId: 'wa_abc' });
ok('il doppione (stesso docId) non riceve una seconda offerta', out.duplicate === true && TG.length === t0);
ok('…e dupResult porta ora la classe (catKey) così il webhook sa se offrire', out.catKey === 'contratto', out);

// ─── 7. le giunzioni sulla sorgente ─────────────────────────────────────────
console.log('\n\x1b[1m7. Giunzioni sulla sorgente\x1b[0m');
const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const hook = rd('api/telegram/webhook.js'), ingest = rd('api/portal/ingest.js'), smista = rd('api/documents/_smista.js'), coreSrc = rd('api/scrivano/_core.js');
const app = rd('js/portal-app.js'), rules = rd('firestore.rules'), vercel = JSON.parse(rd('vercel.json'));
const iSc = hook.indexOf("verb === 'sc'"), iAq = hook.indexOf('fsGet(`action_queue/');
ok('webhook: il dispatch sc: sta PRIMA della lettura di action_queue', iSc > -1 && iAq > -1 && iSc < iAq);
ok('webhook: il docId deriva dal file_unique_id', /file_unique_id/.test(hook) && /createHash\('sha1'\)/.test(hook));
ok('il cuore è UNA copia: l\'HTTP chiama ingestRead, il worker importa ingestRead da portal/ingest', /export async function ingestRead\(/.test(ingest) && /const out = await ingestRead\(\{ files, text, hint, known \}\)/.test(ingest) && /import \{ readFiles, ingestRead, knownFromStore \} from '\.\.\/portal\/ingest\.js'/.test(coreSrc));
ok('smistaDocument offre DOPO l\'archiviazione (le porte ereditano)', smista.indexOf("fsCreate('documents'") > -1 && smista.indexOf('sendScrivanoOffer(result') > smista.indexOf("fsCreate('documents'"));
ok('_offer.js non importa lo Smistatore (niente ciclo _smista → _offer → _smista)', !/_smista\.js/.test(rd('api/scrivano/_offer.js')));
ok('rules: scrivanoProposals è admin-only', /match \/scrivanoProposals\/\{x\}\s+\{ allow read, write: if isAdmin\(\); \}/.test(rules));
const md = vercel.functions?.['api/scrivano/worker.js']?.maxDuration;
ok('vercel.json: il worker ha il tempo di una lettura (maxDuration ≥ 120) e gira ogni minuto', md >= 120 && (vercel.crons || []).some((c) => c.path === '/api/scrivano/worker' && c.schedule === '* * * * *'), { md });
ok('…e il costo dichiarato di una lettura sta sotto quel tetto', core.READ_COST_MS < md * 1000);
const requireCjs = createRequire(import.meta.url);
const registry = requireCjs('../../js/squadra-registry.js');
const agent = (registry.TEAM || []).find((a) => a.key === 'scrivano');
ok('lo Scrivano è nell\'organigramma col suo cron (niente dipendente fantasma)', agent && agent.crons.includes('/api/scrivano/worker') && agent.approval === 'parziale' && !agent.reach.includes('clienti'), agent && agent.crons);
ok('portal: il post-processing della lettura è UNA funzione, chiamata dalla lettura dal portal', (app.match(/function innestoIngest\(/g) || []).length === 1 && /innestoIngest\(data, prepared\);/.test(app));
const iBootSeed = app.indexOf('innestoSeedFromHash()'), iBootGoto = app.indexOf("goTo(innestoSeed ? 'innesto'");
ok('portal: #innesto=<docId> viene letto PRIMA che goTo riscriva l\'hash, al boot e sul popstate', iBootSeed > -1 && iBootGoto > iBootSeed && /popstate[\s\S]{0,300}innestoSeedFromHash\(\)/.test(app));
const arch = app.slice(app.indexOf('async function innestoArchiveDoc('), app.indexOf('async function innestoArchiveDoc(') + 4000);
ok('portal: il documento già archiviato si LEGA prima di qualunque upload', arch.indexOf('rd.archived') > -1 && arch.indexOf('rd.archived') < arch.indexOf('storage.ref('));

console.log(`\n\x1b[1mResult: ${passes} passed, ${fails} failed\x1b[0m`);
if (!fails) console.log('\x1b[32mLo Scrivano: dal telefono alla proposta, una lettura sola, mai due, mai nel webhook.\x1b[0m');
process.exit(fails ? 1 : 0);
