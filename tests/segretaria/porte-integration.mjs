// Integration: tracked case + PR234 attachments + Scrivano offer contract.
// Real handlers, Firestore helpers, Smistatore and MIME parser; only network fake.
import crypto from 'node:crypto';
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);
const imapSource = `export class ImapFlow {
  constructor() { globalThis.__imap.connections++; }
  async connect() {}
  async getMailboxLock() { return { release() {} }; }
  async search({ from }) {
    globalThis.__imap.searches.push(from);
    return globalThis.__imap.messages.filter(m => m.from === from).map(m => m.uid);
  }
  async fetchOne(uid) {
    const message = globalThis.__imap.messages.find(m => m.uid === Number(uid));
    return message ? { source: Buffer.from(message.raw) } : null;
  }
  async logout() {}
}`;
const imapURL = 'data:text/javascript,' + encodeURIComponent(imapSource);
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next) {
  if(s==='imapflow') return {url:${JSON.stringify(imapURL)},shortCircuit:true};
  return next(s,c);
}`), import.meta.url);
Object.assign(process.env, { FIREBASE_API_KEY: 'fixture', FIREBASE_ADMIN_EMAIL: 'admin@example.test',
  FIREBASE_ADMIN_PASS: 'fixture', HOMIE_SECRET: 'fixture', CRON_SECRET: 'fixture',
  PFS_IMAP_USER: 'operator@example.test', PFS_IMAP_PASS: 'fixture', ANTHROPIC_API_KEY: 'fixture',
  TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_CHAT_ID: '42' });

const NOW = Date.parse('2026-09-14T10:00:00Z');
const realNow = Date.now;
Date.now = () => NOW;
let checks = 0, fails = 0;
function ok(name, pass, detail) {
  checks++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${!pass && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!pass) fails++;
}
const DB = new Map(), versions = new Map(), writes = [], allWrites = [], network = [];
const aiRequests = [], downloads = [], telegram = [];
let storageHits = 0, mediaFails = false;
globalThis.__mails = [];
let sequence = 0, failingCollection = '', beforePatch = null, failCommit = false;
const enc = v => v == null ? { nullValue: null }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'string' ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = v => 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue
  : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue)
  : 'stringValue' in v ? v.stringValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec)
  : Object.fromEntries(Object.entries(v.mapValue?.fields || {}).map(([k, x]) => [k, dec(x)]));
const field = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
function save(path, data) {
  DB.set(path, data);
  versions.set(path, new Date(NOW + ++sequence).toISOString());
}
function doc(path) {
  return { name: 'projects/p/databases/(default)/documents/' + path,
    fields: Object.fromEntries(Object.entries(DB.get(path)).map(([k, v]) => [k, enc(v)])),
    updateTime: versions.get(path) };
}
globalThis.fetch = async (rawURL, opts = {}) => {
  const url = new URL(String(rawURL));
  const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : {};
  const json = (data, status = 200) => ({ ok: status < 400, status,
    json: async () => data, text: async () => JSON.stringify(data) });
  if (url.hostname === 'media.example.test') {
    downloads.push(url.href);
    return new Response(mediaFails ? 'unavailable' : '%PDF-1.4 synthetic integration fixture', {
      status: mediaFails ? 503 : 200, headers: { 'content-type': 'application/pdf' },
    });
  }
  if (url.hostname === 'api.anthropic.com') {
    aiRequests.push(body);
    const blocks = body.messages?.[0]?.content;
    if (!Array.isArray(blocks) || !blocks.some(b => b.type === 'document')
      || !blocks.some(b => b.type === 'text' && b.text.includes('Classifica questo documento'))) {
      network.push('unexpected_ai_reply'); throw new Error('unexpected_ai_reply');
    }
    return json({ content: [{ type: 'text', text: JSON.stringify({ category: 'ape', fiscalYear: 2026,
      propertyId: 'pA', summary: 'APE fixture' }) }] });
  }
  if (url.hostname === 'firebasestorage.googleapis.com') {
    storageHits++; return json({ downloadTokens: 'fixture-token' });
  }
  if (url.hostname === 'api.telegram.org') {
    telegram.push(body); return json({ ok: true, result: { message_id: telegram.length } });
  }
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    if (url.pathname.includes('accounts:signInWithPassword')) return json({ idToken: 'firestore-admin' });
    const uid = { admin: 'admin', tenant: 'tenant', orphan: 'orphan' }[body.idToken];
    return uid ? json({ users: [{ localId: uid, email: uid + '@example.test' }] }) : json({ error: 'invalid_token' }, 401);
  }
  if (url.hostname !== 'firestore.googleapis.com') {
    network.push(url.hostname);
    throw new Error('forbidden_external_effect');
  }
  if (url.pathname.endsWith(':commit')) {
    if (failCommit) return json({ error: { status: 'UNAVAILABLE' } }, 503);
    const operations = body.writes || [];
    const taskWrite = operations.find(w => w.update?.name.includes('/operatorTasks/'));
    if (beforePatch && taskWrite) {
      const hook = beforePatch; beforePatch = null;
      await hook(taskWrite.update.name.split('/documents/')[1]);
    }
    // Validate EVERY precondition first; a failed commit changes no document.
    for (const operation of operations) {
      const path = operation.update?.name?.split('/documents/')[1];
      if (!path) throw new Error('unsupported_commit_shape');
      const condition = operation.currentDocument || {};
      if ((condition.exists === false && DB.has(path)) || (condition.exists === true && !DB.has(path))
        || (condition.updateTime && versions.get(path) !== condition.updateTime)) {
        return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      }
    }
    const results = [];
    for (const operation of operations) {
      const path = operation.update.name.split('/documents/')[1];
      const data = Object.fromEntries(Object.entries(operation.update.fields || {}).map(([k, v]) => [k, dec(v)]));
      save(path, operation.updateMask ? { ...(DB.get(path) || {}), ...data } : data);
      const write = { path, data: structuredClone(DB.get(path)) };
      writes.push(write); allWrites.push(write);
      results.push({ updateTime: versions.get(path) });
    }
    return json({ writeResults: results, commitTime: new Date(NOW + sequence).toISOString() });
  }
  if (url.pathname.endsWith(':runQuery')) {
    const q = body.structuredQuery, coll = q.from[0].collectionId;
    if (coll === failingCollection) return json({ error: { status: 'UNAVAILABLE' } }, 503);
    const matches = (row, filter) => {
      if (!filter) return true;
      if (filter.compositeFilter) {
        const values = filter.compositeFilter.filters.map(f => matches(row, f));
        return filter.compositeFilter.op === 'AND' ? values.every(Boolean) : values.some(Boolean);
      }
      const f = filter.fieldFilter, value = field(row, f.field.fieldPath), expected = dec(f.value);
      if (f.op === 'EQUAL') return value === expected;
      if (f.op === 'IN') return expected.includes(value);
      if (f.op === 'GREATER_THAN') return value > expected;
      throw new Error('unimplemented_filter_' + f.op);
    };
    let entries = [...DB].filter(([p, row]) => p.startsWith(coll + '/') && p.split('/').length === 2 && matches(row, q.where));
    for (const sort of [...(q.orderBy || [])].reverse()) entries.sort((a, b) =>
      String(field(a[1], sort.field.fieldPath)).localeCompare(String(field(b[1], sort.field.fieldPath))) * (sort.direction === 'DESCENDING' ? -1 : 1));
    return json(entries.slice(0, q.limit || 1000).map(([p]) => ({ document: doc(p) })));
  }
  const path = decodeURIComponent(url.pathname.split('/documents/')[1] || '');
  if (opts.method === 'POST') {
    const id = url.searchParams.get('documentId') || 'auto' + ++sequence;
    const key = path + '/' + id;
    if (DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    save(key, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    const write = { path: key, data: structuredClone(DB.get(key)) };
    writes.push(write); allWrites.push(write);
    return json(doc(key));
  }
  if (opts.method === 'PATCH') {
    if (beforePatch) { const hook = beforePatch; beforePatch = null; await hook(path); }
    if (url.searchParams.get('currentDocument.exists') === 'false' && DB.has(path)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    const requiredVersion = url.searchParams.get('currentDocument.updateTime');
    if (requiredVersion && requiredVersion !== versions.get(path)) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    save(path, { ...(DB.get(path) || {}), ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) });
    const write = { path, data: structuredClone(DB.get(path)) };
    writes.push(write); allWrites.push(write);
    return json(doc(path));
  }
  return DB.has(path) ? json(doc(path)) : json({ error: { status: 'NOT_FOUND' } }, 404);
};

const { captureFollowUp, refreshTrackedFollowUp } = await import('../../api/segretaria/_follow-up.js');
const { default: messageHandler } = await import('../../api/homie/message.js');
const { default: scanHandler } = await import('../../api/segretaria/scan-replies.js');
const { default: documentsHandler } = await import('../../api/documents/scan-inbox.js');
const CID = 'conv_tenant_tenantA';
const FILE = 'https://media.example.test/original-ape.pdf';
const FILE2 = 'https://media.example.test/normal-ape.pdf';
const conv = { contactType: 'tenant', contactId: 'tenantA', contactName: 'Tenant fixture',
  contactPhone: '+393331234567', contactEmail: 'tenant@example.test', segretaria: false, needsReply: false, unread: 0 };
function reset() {
  DB.clear(); versions.clear(); writes.length = 0;
  aiRequests.length = downloads.length = telegram.length = 0; storageHits = 0; mediaFails = false;
  sequence = 0; failingCollection = ''; beforePatch = null; failCommit = false;
  globalThis.__imap = { connections: 0, searches: [], messages: [] };
  save('conversations/' + CID, { ...conv });
  save('users/tenantA', { role: 'tenant', phone: conv.contactPhone, email: conv.contactEmail });
  save('properties/pA', { title: 'Immobile fixture', ownerId: 'ownerA' });
  save('contracts/cA', { propertyId: 'pA', tenantId: 'tenantA', landlordId: 'ownerA', status: 'active' });
}
async function call(handler, body = {}, query = {}) {
  let code, output;
  await handler({ method: 'POST', body, query, headers: { 'x-homie-secret': 'fixture' } }, {
    status(value) { code = value; return this; }, json(value) { output = value; return this; }, setHeader() {}, end() {},
  });
  return { code, ...output };
}
const messages = () => [...DB].filter(([p]) => p.startsWith('messages/'));
const docs = () => [...DB].filter(([p]) => p.startsWith('documents/'));
const tasks = () => [...DB].filter(([p, row]) => p.startsWith('operatorTasks/') && row.followUp);
const payload = { direction: 'in', channel: 'whatsapp', contactType: 'tenant', contactId: 'tenantA',
  phone: conv.contactPhone, email: conv.contactEmail, name: conv.contactName, body: 'Ecco l’APE richiesto',
  messageId: 'combined-retry', timestamp: new Date(NOW).toISOString(), mediaUrls: [FILE] };
const docId = url => 'documents/wa_' + crypto.createHash('sha1').update(url).digest('hex');

try {
  reset();
  const task = await captureFollowUp({ cid: CID, conv, messageId: 'initial-event', text: 'Attendo APE', now: NOW - 1000 });
  const taskPath = 'operatorTasks/' + task.id;
  const f = DB.get(taskPath).followUp;
  save(taskPath, { ...DB.get(taskPath), followUp: { ...f, practiceRef: 'contracts/cA', propertyRef: 'properties/pA',
    nextAction: 'Verificare APE', waitingOn: 'client', waitingLabel: 'Tenant fixture', checkAt: '2026-09-16T10:00:00.000Z' } });
  failCommit = true; mediaFails = true;
  let result = await call(messageHandler, payload);
  const persistedMessage = result.messageId;
  ok('primo tentativo salva messaggio/allegato, ma lascia tracking e download ritentabili', result.code === 200
    && !!result.followUp?.error && messages().length === 1 && messages()[0][1].attachments[0] === FILE
    && tasks().length === 1 && docs().length === 0 && downloads.length === 1 && aiRequests.length === 0, result);

  failCommit = false; mediaFails = false;
  result = await call(messageHandler, { ...payload, direction: 'out', contactId: 'forged-contact',
    body: 'TAMPERED BODY', timestamp: '2030-01-01T00:00:00Z', mediaUrls: ['https://invalid.example.test/tampered.pdf'] });
  ok('stesso retry recupera INSIEME seguito e documento da fonti salvate', result.code === 200 && result.dedupHit === true
    && result.conversationId === CID && result.messageId === persistedMessage && result.followUp?.id === task.id
    && messages().length === 1 && tasks().length === 1 && DB.get(taskPath).followUp.lastMessageId === payload.messageId
    && DB.get(taskPath).followUp.preview === payload.body && DB.get(taskPath).followUp.lastInboundAt === payload.timestamp
    && DB.get(docId(FILE))?.propertyId === 'pA' && DB.get(docId(FILE))?.contractId === 'cA'
    && DB.get(docId(FILE))?.source === 'whatsapp' && downloads.every(url => url === FILE)
    && aiRequests[0]?.messages?.[0]?.content.some(b => b.type === 'text' && b.text.includes(payload.body)
      && !b.text.includes('TAMPERED BODY')), result);
  ok('recupero conserva impegno/ricontrollo e cancella il marker del guasto', DB.get(taskPath).followUp.nextAction === 'Verificare APE'
    && DB.get(taskPath).followUp.waitingOn === 'client' && DB.get(taskPath).followUp.checkAt === '2026-09-16T10:00:00.000Z'
    && DB.get('conversations/' + CID).followUpTrackingError === null);
  ok('un solo modello di CLASSIFICAZIONE e upload; nessuna risposta AI o azione cliente', aiRequests.length === 1 && storageHits === 1
    && ![...DB.keys()].some(p => /^(action_queue|messageLog|waOutbox)\//.test(p)) && globalThis.__mails.length === 0);
  ok('Scrivano nuovo aggiunge solo l’offerta operatore WhatsApp, senza leggere il documento', telegram.length === 1
    && telegram[0].reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'sc:' + docId(FILE).slice('documents/'.length));

  const counts = { ai: aiRequests.length, storage: storageHits, media: downloads.length, telegram: telegram.length };
  await call(messageHandler, payload);
  ok('ulteriore retry non duplica messaggio/caso/documento/modello/upload/offerta', messages().length === 1 && tasks().length === 1
    && docs().length === 1 && aiRequests.length === counts.ai && storageHits === counts.storage
    && downloads.length === counts.media && telegram.length === counts.telegram);

  result = await call(messageHandler, { ...payload, messageId: 'normal-combined', mediaUrls: [FILE2] });
  ok('anche il ritorno normale conserva entrambi gli effetti', !result.dedupHit && result.followUp?.id === task.id
    && DB.get(taskPath).followUp.lastMessageId === 'normal-combined' && DB.has(docId(FILE2))
    && messages().length === 2 && tasks().length === 1 && docs().length === 2, result);

  reset();
  const raw = [ 'From: Tenant <tenant@example.test>', 'To: operator@example.test', 'Message-ID: <combined-email@fixture.test>',
    'Date: Mon, 14 Sep 2026 12:00:00 +0200', 'Subject: APE casa', 'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="joint"', '', '--joint', 'Content-Type: text/plain; charset=utf-8', '', 'Ecco APE.',
    ...['ape-a.pdf', 'ape-b.pdf'].flatMap(name => ['--joint', 'Content-Type: application/pdf',
      `Content-Disposition: attachment; filename="${name}"`, 'Content-Transfer-Encoding: base64', '',
      Buffer.from('%PDF-1.4 synthetic ' + name).toString('base64')]), '--joint--', '',
  ].join('\r\n');
  globalThis.__imap.messages = [{ uid: 1, from: 'tenant@example.test', raw }];
  result = await call(documentsHandler);
  ok('email con due APE: due archivi e un solo riepilogo operatore', result.code === 200 && result.counts.filed === 2
    && docs().length === 2 && aiRequests.length === 2 && storageHits === 2 && telegram.length === 1, result);
  ok('offer:false compatibile con nuovo Smistatore: nessuna card Scrivano aggiuntiva', telegram.length === 1
    && !telegram.some(t => t.reply_markup?.inline_keyboard?.flat().some(b => b.callback_data?.startsWith('sc:')))
    && telegram[0].text.includes("documenti archiviati dall'email"));
  const emailCounts = { ai: aiRequests.length, storage: storageHits, telegram: telegram.length };
  await call(documentsHandler);
  ok('retry email integrato conserva idempotenza e non ripete il riepilogo', docs().length === 2
    && aiRequests.length === emailCounts.ai && storageHits === emailCounts.storage && telegram.length === emailCounts.telegram);
  ok('nessuna rete fuori dai mock e nessuna email cliente', network.length === 0 && globalThis.__mails.length === 0, network);
} finally { Date.now = realNow; }
console.log(`${checks} check integrazione, ${fails} falliti`);
process.exit(fails ? 1 : 0);
