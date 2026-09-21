// Real WhatsApp/email handlers + real MIME parser; only network transports fake.
import { register } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
globalThis.__mails = [];
let sequence = 0, failingCollection = '', beforePatch = null, beforeHeaderCommit = null, failCommit = false;
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
  const body = opts.body ? JSON.parse(opts.body) : {};
  const json = (data, status = 200) => ({ ok: status < 400, status,
    json: async () => data, text: async () => JSON.stringify(data) });
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
    if (beforeHeaderCommit && operations.some(w => w.update?.name.includes('/conversations/'))) {
      const hook = beforeHeaderCommit; beforeHeaderCommit = null; await hook();
    }
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

const { captureFollowUp, refreshTrackedFollowUp, followUpId } = await import('../../api/segretaria/_follow-up.js');
const { default: messageHandler } = await import('../../api/homie/message.js');
const { default: scanHandler } = await import('../../api/segretaria/scan-replies.js');
const CID = 'conv_lead_leadA';
const conv = { contactType: 'lead', contactId: 'leadA', leadId: 'leadA', contactName: 'Cliente fixture',
  contactPhone: '+393331234567', contactEmail: 'client@example.test', segretaria: false, needsReply: false, unread: 0 };
function reset() {
  DB.clear(); versions.clear(); writes.length = 0;
  sequence = 0; failingCollection = ''; beforePatch = null; beforeHeaderCommit = null; failCommit = false; network.length = 0;
  globalThis.__imap = { connections: 0, searches: [], messages: [] };
  save('conversations/' + CID, { ...conv });
  save('leads/leadA', { phone: conv.contactPhone, email: conv.contactEmail, propertyId: 'pA', status: 'contacted' });
  save('properties/pA', { name: 'Immobile fixture' });
}
async function call(handler, body = {}, query = {}) {
  let code, output;
  await handler({ method: 'POST', body, query, headers: { 'x-homie-secret': 'fixture', authorization: 'Bearer fixture' } }, {
    status(value) { code = value; return this; }, json(value) { output = value; return this; }, setHeader() {}, end() {},
  });
  return { code, ...output };
}
async function followed() {
  const task = await captureFollowUp({ cid: CID, conv, messageId: 'initial-event', text: 'Documento da controllare', now: NOW - 1000 });
  const path = 'operatorTasks/' + task.id;
  save(path, { ...DB.get(path), followUp: { ...task.followUp, practiceRef: 'contracts/verified', propertyRef: 'properties/pA',
    nextAction: 'Controllare la ricevuta', waitingOn: 'client', waitingLabel: 'Cliente fixture',
    checkAt: '2026-09-15T10:00:00.000Z', needsReview: false, confirmed: true } });
  return path;
}
const inbound = (mid, extra = {}) => ({ direction: 'in', channel: 'whatsapp', contactType: 'lead', contactId: 'leadA',
  phone: conv.contactPhone, email: conv.contactEmail, name: conv.contactName, body: 'Ecco il dettaglio richiesto',
  messageId: mid, timestamp: new Date(NOW).toISOString(), ...extra });
function mail(uid, id, from = conv.contactEmail, text = 'Here is the receipt.\r\n\r\nOn Monday we wrote:\r\n> Old quoted thread') {
  globalThis.__imap.messages.push({ uid, from, raw: `From: Client <${from}>\r\nTo: Operator <operator@example.test>\r\nDate: Mon, 14 Sep 2026 12:00:00 +0200\r\nMessage-ID: <${id}@fixture.test>\r\nSubject: Re: Receipt\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}` });
}
const messages = () => [...DB].filter(([p]) => p.startsWith('messages/'));
const tasks = () => [...DB].filter(([p, row]) => p.startsWith('operatorTasks/') && row.followUp);
const preserved = row => row.followUp.practiceRef === 'contracts/verified' && row.followUp.nextAction === 'Controllare la ricevuta'
  && row.followUp.waitingOn === 'client' && row.followUp.checkAt === '2026-09-15T10:00:00.000Z';

const backlog = (mid, extra = {}) => inbound(mid, { intakeMode: 'backlog_review', ...extra });
const enable = () => save('settings/segretaria', { enabled: true, prepareCases: true, prepareSince: '2020-01-01T00:00:00.000Z' });
const quiet = () => network.length === 0 && ![...DB.keys()].some(k => /^(action_queue|documents|messageLog)\//.test(k))
  && !writes.some(w => w.path.startsWith('leads/'));
const recentConversation = () => ({ ...conv, lastMessageAt: new Date(NOW + 60000).toISOString(),
  lastMessagePreview: 'Risposta recente', lastDirection: 'out', unread: 0, needsReply: false });
const cursorPath = 'heartbeat/segretaria-case-' + followUpId(CID, 'cursor').slice(3);
const receiptPath = event => 'heartbeat/segretaria-event-' + followUpId(CID, event).slice(3);
async function assertUndatedRejected(handler, timestamp = undefined) {
  reset(); enable();
  const header = recentConversation();
  save('conversations/' + CID, header);
  const result = await call(handler, backlog('undated-archive', { timestamp }));
  assert.equal(result.code, 400, 'a backlog date must be explicit and valid');
  assert.equal(result.error, 'invalid_timestamp');
  assert.equal(writes.length, 0);
  assert.deepEqual(DB.get('conversations/' + CID), header);
}
async function assertTrackingErrorKeepsHeader(handler, retry = false) {
  reset(); await followed();
  const header = recentConversation();
  save('conversations/' + CID, header);
  failingCollection = 'operatorTasks';
  const payload = backlog('older-tracking-failed', { timestamp: new Date(NOW - 86400000).toISOString() });
  // Persist the original mode while leaving its secondary receipt unwritten.
  // A later caller cannot turn a backlog retry into a normal incoming message.
  if (retry) await call(messageHandler, payload);
  const result = await call(handler, retry ? inbound(payload.messageId, { timestamp: undefined, body: 'FORGED RETRY' }) : payload);
  assert.equal(result.code, 200);
  assert.equal(result.followUp?.tracked, false);
  assert.ok(DB.get('conversations/' + CID).followUpTrackingError);
  assert.deepEqual(DB.get('conversations/' + CID), { ...header, followUpTrackingError: result.followUp.error });
  assert.equal(messages().length, 1);
  assert.equal(messages()[0][1].body, payload.body);
  assert.equal(tasks().length, 1);
  assert.ok(quiet());
}
async function closedCase({ cursorOnly = false, withoutCursor = false } = {}) {
  reset(); enable();
  const path = await followed(), row = DB.get(path);
  save(path, { ...row, status: 'done', doneAt: new Date(NOW).toISOString(), doneVia: 'segretaria',
    followUp: { ...row.followUp, open: false, outcome: 'Ricevuta verificata; richiesta conclusa', closedBy: 'admin',
      ...(cursorOnly ? { lastInboundAt: null } : {}) } });
  if (withoutCursor) { DB.delete(cursorPath); versions.delete(cursorPath); }
  save('conversations/' + CID, recentConversation());
  return { path, row: structuredClone(DB.get(path)), cursor: structuredClone(DB.get(cursorPath)) };
}
async function assertClosedPreserved(capture = captureFollowUp, options = {}) {
  const before = await closedCase(options);
  const input = { cid: CID, conv, messageId: 'before-completed-case', text: 'Arretrato precedente',
    now: NOW - 86400000, preserveNewer: true };
  const result = await capture(input);
  assert.equal(result.id, before.path.split('/')[1]);
  assert.equal(tasks().length, 1, 'historical evidence must not create a new open obligation');
  assert.deepEqual(DB.get(before.path), before.row);
  assert.equal(DB.get(receiptPath(input.messageId)).taskId, result.id);
  if (before.cursor) {
    assert.equal(DB.get(cursorPath).at, before.cursor.at);
    assert.equal(DB.get(cursorPath).taskId, before.cursor.taskId);
  }
  const receiptCount = [...DB.keys()].filter(p => p.startsWith('heartbeat/segretaria-event-')).length;
  const repeated = await capture({ ...input, text: 'CHANGED RETRY', now: NOW + 1000 });
  assert.equal(repeated.id, result.id);
  assert.deepEqual(DB.get(before.path), before.row);
  assert.equal([...DB.keys()].filter(p => p.startsWith('heartbeat/segretaria-event-')).length, receiptCount);
}
async function mutant(relativeFile, from, to) {
  const file = new URL(relativeFile, import.meta.url);
  const original = readFileSync(file, 'utf8');
  assert.ok(original.includes(from), 'mutation target must exist');
  const source = original.replace(from, to).replace(/from (['"])(\.[^'"]+)\1/g,
    (_, quote, specifier) => 'from ' + quote + new URL(specifier, file).href + quote);
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
try {
  reset(); enable();
  save('conversations/' + CID, { ...conv, segretaria: true });
  const lead = { ...DB.get('leads/leadA'), status: 'closed', telegramNotifiedAt: 'already-notified' };
  save('leads/leadA', lead);
  let result = await call(messageHandler, backlog('archive-1', { mediaUrls: ['https://media.fixture.test/document.pdf'],
    analysis: { summary: 'FORGED ANALYSIS', needsReply: false, suggestedReply: 'SEND ME' } }));
  ok('backlog autenticato salva Inbox e riferimenti allegati', result.code === 200 && messages().length === 1
    && messages()[0][1].intakeMode === 'backlog_review' && messages()[0][1].attachments.length === 1, result);
  ok('opt-in esistente apre il caso senza cambiare la delega', result.followUp?.tracked && tasks().length === 1
    && DB.get('conversations/' + CID).segretaria === true, result);
  ok('nessun lead riaperto, ping riarmato, AI, coda o download', quiet() && JSON.stringify(DB.get('leads/leadA')) === JSON.stringify(lead));
  ok('analisi allegata ignorata: nessun riassunto o risposta spacciata per elaborata', !DB.get('conversations/' + CID).aiSummary
    && !DB.get('conversations/' + CID).suggestedReply && DB.get('conversations/' + CID).needsReply === true);
  const firstId = result.messageId;
  result = await call(messageHandler, inbound('archive-1', { direction: 'out', body: 'TAMPERED', mediaUrls: ['https://other.fixture.test'] }));
  ok('retry senza flag usa intakeMode persistito e identità originale', result.dedupHit && result.messageId === firstId
    && messages().length === 1 && messages()[0][1].body === 'Ecco il dettaglio richiesto' && quiet(), result);

  reset(); enable();
  save('users/tenantA', { role: 'tenant', phone: conv.contactPhone, email: 'tenant@example.test' });
  save('contracts/cA', { propertyId: 'pA', tenantId: 'tenantA', status: 'active' });
  const tenantMessage = backlog('tenant-archive', { contactType: 'tenant', contactId: 'tenantA',
    email: 'tenant@example.test', mediaUrls: ['https://media.fixture.test/real-relation.pdf'] });
  result = await call(messageHandler, tenantMessage);
  ok('allegato tenant con relazione reale resta solo riferimento, nessun download o Smistatore', result.code === 200
    && messages()[0][1].attachments.length === 1 && quiet(), result);
  await call(messageHandler, { ...tenantMessage, intakeMode: undefined, mediaUrls: ['https://forged.fixture.test/retry.pdf'] });
  ok('retry tenant senza mode non riattiva analisi o effetti degli allegati', messages().length === 1
    && messages()[0][1].attachments[0] === 'https://media.fixture.test/real-relation.pdf' && quiet());

  reset(); enable();
  save('conversations/' + CID, { ...conv, segretaria: true });
  save('leads/leadA', { ...DB.get('leads/leadA'), status: 'new' });
  result = await call(messageHandler, backlog('old-operator-reply', { direction: 'out' }));
  ok('out storico non inventa contattato e non revoca la delega corrente', result.code === 200
    && DB.get('leads/leadA').status === 'new' && !DB.get('leads/leadA').contactedAt
    && DB.get('conversations/' + CID).segretaria === true && quiet());

  reset(); enable();
  save('leads/leadA', { ...DB.get('leads/leadA'), status: 'closed', telegramNotifiedAt: 'old' });
  await call(messageHandler, backlog('old-row'));
  result = await call(messageHandler, inbound('fresh-normal'));
  ok('messaggio nuovo senza mode mantiene syncLead ordinario', result.code === 200 && DB.get('leads/leadA').status === 'new'
    && DB.get('leads/leadA').telegramNotifiedAt === null && messages().find(([p]) => p === 'messages/' + result.messageId)[1].intakeMode === undefined, result);
  await call(messageHandler, backlog('fresh-normal'));
  ok('retry con mode non riscrive il flag del messaggio normale già salvato', messages().find(([p]) => p === 'messages/' + result.messageId)[1].intakeMode === undefined);

  reset();
  result = await call(messageHandler, backlog('no-rollout'));
  ok('mode non iscrive casi quando rollout è spento', result.code === 200 && tasks().length === 0 && messages().length === 1 && quiet());
  reset(); enable();
  result = await call(messageHandler, backlog('unknown-contact', { contactType: 'whatsapp', contactId: '393337777777', phone: '+393337777777' }));
  ok('contatto sconosciuto entra in Inbox/caso senza nuova pipeline lead', result.code === 200 && tasks().length === 1
    && [...DB.keys()].filter(k => k.startsWith('leads/')).length === 1 && quiet(), result);

  reset(); let path = await followed();
  const beforeCase = structuredClone(DB.get(path));
  const recentHeader = { ...conv, lastMessageAt: new Date(NOW + 60000).toISOString(), lastMessagePreview: 'Risposta recente',
    lastDirection: 'out', updatedAt: new Date(NOW + 60000).toISOString(), contactUid: 'verified-uid', assignedLandlordId: 'verified-owner',
    unread: 0, needsReply: false };
  save('conversations/' + CID, recentHeader);
  result = await call(messageHandler, backlog('older-event', { timestamp: new Date(NOW - 86400000).toISOString(), contactUid: 'stale-uid', assignedLandlordId: 'stale-owner' }));
  ok('arretrato non retrocede head, contatto, autorizzazioni o stato lettura recenti', JSON.stringify(DB.get('conversations/' + CID)) === JSON.stringify(recentHeader));
  ok('autorizzazioni del messaggio seguono la conversazione attuale, non i metadati storici', messages()[0][1].contactUid === 'verified-uid'
    && messages()[0][1].assignedLandlordId === 'verified-owner');
  ok('arretrato non sovrascrive ultimo evento né decisione confermata del caso', result.followUp?.tracked
    && JSON.stringify(DB.get(path).followUp) === JSON.stringify(beforeCase.followUp) && preserved(DB.get(path)), result);
  const cursor = [...DB].find(([p]) => p.startsWith('heartbeat/segretaria-case-'))[1];
  ok('cursore non retrocede ma evento arretrato riceve ricevuta permanente', cursor.at === new Date(NOW - 1000).toISOString()
    && [...DB.keys()].filter(k => k.startsWith('heartbeat/segretaria-event-')).length === 2);
  await call(messageHandler, backlog('older-event'));
  ok('retry arretrato non duplica messaggio o ricevuta e non tocca la pratica', messages().length === 1
    && [...DB.keys()].filter(k => k.startsWith('heartbeat/segretaria-event-')).length === 2 && preserved(DB.get(path)));

  reset(); path = await followed();
  beforePatch = async () => {
    await captureFollowUp({ cid: CID, conv, messageId: 'racing-recent', text: 'Evento recente durante commit', now: NOW + 1000 });
  };
  result = await call(messageHandler, backlog('racing-old', { timestamp: new Date(NOW - 10000).toISOString() }));
  ok('race: CAS rilegge il caso aggiornato e conserva evento più recente', result.followUp?.tracked
    && DB.get(path).followUp.lastMessageId === 'racing-recent' && DB.get(path).followUp.lastInboundAt === new Date(NOW + 1000).toISOString()
    && preserved(DB.get(path)), result);

  reset(); enable();
  beforeHeaderCommit = async () => save('conversations/' + CID, recentHeader);
  result = await call(messageHandler, backlog('header-race'));
  ok('race head: messaggio conservato senza sovrascrivere nuovo header concorrente', result.code === 200
    && messages().length === 1 && JSON.stringify(DB.get('conversations/' + CID)) === JSON.stringify(recentHeader), result);

  reset(); enable();
  const simultaneous = await Promise.all([call(messageHandler, backlog('same-backlog')), call(messageHandler, backlog('same-backlog'))]);
  ok('due ingressi backlog concorrenti: un messaggio e un caso', simultaneous.every(r => r.code === 200)
    && messages().length === 1 && tasks().length === 1 && DB.get('conversations/' + CID).unread === 1, simultaneous);

  reset(); enable(); failingCollection = 'messages';
  result = await call(messageHandler, backlog('dedup-unavailable'));
  ok('dedup non leggibile non autorizza scrittura cieca dell’arretrato', result.code === 503 && messages().length === 0 && writes.length === 0, result);
  failingCollection = '';
  result = await call(messageHandler, inbound('bad-mode', { intakeMode: 'silent' }));
  ok('mode sconosciuto rifiutato senza scritture', result.code === 400 && writes.length === 0);
  result = await call(messageHandler, backlog('', { messageId: undefined }));
  ok('backlog richiede chiave idempotente', result.code === 400 && writes.length === 0);
  let authCode, authBody;
  await messageHandler({ method: 'POST', headers: { 'x-homie-secret': 'wrong' }, body: backlog('unauthorized') }, {
    status(n) { authCode = n; return this; }, json(v) { authBody = v; return this; }, setHeader() {}, end() {},
  });
  ok('nessun ingresso silenzioso senza autenticazione Homie', authCode === 401 && writes.length === 0, authBody);

  for (const timestamp of [undefined, null, '', 0, false, {}, 'not-a-date', '2026-02-30T10:00:00Z',
    '2026-09-14T10:00:00', '2026-09-14T10:00:00+25:00']) await assertUndatedRejected(messageHandler, timestamp);
  ok('backlog rifiuta date assenti, non valide o senza fuso prima di ogni scrittura', true);
  reset(); enable();
  result = await call(messageHandler, backlog('valid-offset', { timestamp: '2026-09-14T12:00:00+02:00' }));
  ok('data originale con fuso esplicito conservata come istante verificato', result.code === 200
    && messages()[0][1].at === new Date(NOW).toISOString(), result);
  reset();
  result = await call(messageHandler, inbound('normal-undated', { timestamp: undefined }));
  ok('ingresso normale mantiene la data facoltativa', result.code === 200 && messages().length === 1, result);

  await assertTrackingErrorKeepsHeader(messageHandler);
  ok('errore di tracking backlog conserva needsReply e header recenti; errore resta visibile', true);
  await assertTrackingErrorKeepsHeader(messageHandler, true);
  ok('retry backlog senza mode conserva needsReply anche se il tracking fallisce ancora', true);
  reset(); await followed(); failingCollection = 'operatorTasks';
  result = await call(messageHandler, inbound('normal-tracking-failed', { analysis: { needsReply: false } }));
  ok('ingresso normale continua a segnalare needsReply se il tracking fallisce', result.code === 200
    && result.followUp?.tracked === false && DB.get('conversations/' + CID).needsReply === true, result);
  save('conversations/' + CID, { ...DB.get('conversations/' + CID), needsReply: false });
  result = await call(messageHandler, inbound('normal-tracking-failed'));
  ok('retry normale continua a segnalare needsReply se il tracking fallisce', result.dedupHit
    && result.followUp?.tracked === false && DB.get('conversations/' + CID).needsReply === true, result);

  await assertClosedPreserved();
  ok('arretrato precedente al caso chiuso conserva esito e ricevuta idempotente', true);
  await assertClosedPreserved(captureFollowUp, { cursorOnly: true });
  ok('cursore recente verificato protegge la chiusura anche senza data sulla scheda', true);
  await assertClosedPreserved(captureFollowUp, { withoutCursor: true });
  ok('caso chiuso con evento recente verificato resta chiuso anche senza cursore', true);
  const completed = await closedCase();
  result = await call(messageHandler, backlog('closed-handler-old', { timestamp: new Date(NOW - 86400000).toISOString() }));
  const closedMessage = result.messageId;
  result = await call(messageHandler, inbound('closed-handler-old', { body: 'FORGED RETRY' }));
  ok('handler archivia e riconosce il retry senza riaprire il caso già concluso', result.dedupHit
    && result.messageId === closedMessage && messages().length === 1 && tasks().length === 1
    && JSON.stringify(DB.get(completed.path)) === JSON.stringify(completed.row) && quiet(), result);
  const racingClosed = await closedCase();
  beforePatch = async () => save(racingClosed.path, { ...DB.get(racingClosed.path),
    followUp: { ...DB.get(racingClosed.path).followUp, outcome: 'Esito completato e verificato durante il recupero' } });
  result = await call(messageHandler, backlog('closed-race-old', { timestamp: new Date(NOW - 86400000).toISOString() }));
  ok('CAS del caso chiuso rilegge e conserva la correzione concorrente dell’esito', result.followUp?.tracked
    && tasks().length === 1 && DB.get(racingClosed.path).status === 'done'
    && DB.get(racingClosed.path).followUp.outcome === 'Esito completato e verificato durante il recupero', result);
  reset(); enable();
  const foreignId = followUpId('conv_lead_other', 'closed-event');
  const foreignCase = { status: 'done', followUp: { conversationId: 'conv_lead_other', open: false,
    lastInboundAt: new Date(NOW).toISOString(), outcome: 'Caso di un altro contatto' } };
  save('operatorTasks/' + foreignId, foreignCase);
  save(cursorPath, { taskId: foreignId, at: new Date(NOW).toISOString() });
  result = await call(messageHandler, backlog('foreign-cursor-old', { timestamp: new Date(NOW - 86400000).toISOString() }));
  ok('cursore incoerente non associa lo storico al caso chiuso di un altro contatto', result.followUp?.tracked
    && result.followUp.id !== foreignId && JSON.stringify(DB.get('operatorTasks/' + foreignId)) === JSON.stringify(foreignCase)
    && DB.get(receiptPath('foreign-cursor-old')).taskId === result.followUp.id, result);
  await closedCase();
  result = await call(messageHandler, backlog('newer-than-closed', { timestamp: new Date(NOW + 1000).toISOString() }));
  ok('backlog successivo alla chiusura può aprire un seguito nuovo', result.code === 200 && tasks().length === 2
    && tasks().filter(([, row]) => row.status === 'open').length === 1, result);
  await closedCase();
  result = await call(messageHandler, inbound('normal-after-closed', { timestamp: new Date(NOW - 86400000).toISOString() }));
  ok('default normale conserva la riapertura come nuovo caso anche per evento retrodatato', result.code === 200
    && tasks().length === 2 && tasks().filter(([, row]) => row.status === 'open').length === 1, result);

  const noDateGuard = await mutant('../../api/homie/message.js',
    'if (backlogReview && !Number.isFinite(checkTimestamp(body.timestamp)))', 'if (false)');
  await assert.rejects(() => assertUndatedRejected(noDateGuard.default), assert.AssertionError);
  ok('mutazione: la regressione intercetta il ritorno della data odierna per backlog senza data', true);
  const retryFlagRemoved = await mutant('../../api/homie/message.js',
    "fsPatch('conversations/' + storedCid, { ...(backlogReview || stored.direction !== 'in' ? {} : { needsReply: true }), followUpTrackingError: error })",
    "fsPatch('conversations/' + storedCid, { needsReply: true, followUpTrackingError: error })");
  await assert.rejects(() => assertTrackingErrorKeepsHeader(retryFlagRemoved.default, true), assert.AssertionError);
  ok('mutazione: il test retry intercetta needsReply riacceso da un errore storico', true);
  const initialFlagRemoved = await mutant('../../api/homie/message.js',
    "fsPatch('conversations/' + cid, { ...(backlogReview || direction !== 'in' ? {} : { needsReply: true }), followUpTrackingError: error })",
    "fsPatch('conversations/' + cid, { needsReply: true, followUpTrackingError: error })");
  await assert.rejects(() => assertTrackingErrorKeepsHeader(initialFlagRemoved.default), assert.AssertionError);
  ok('mutazione: il test ingresso intercetta needsReply riacceso da un errore storico', true);
  const closureRemoved = await mutant('../../api/segretaria/_follow-up.js',
    'if (preserveNewer && active.length === 0)', 'if (false)');
  await assert.rejects(() => assertClosedPreserved(closureRemoved.captureFollowUp), assert.AssertionError);
  ok('mutazione: la regressione intercetta la riapertura di un caso chiuso da un arretrato', true);
} catch (e) {
  ok('suite completa senza eccezioni', false, e.stack);
} finally {
  Date.now = realNow;
  console.log(`\n${checks - fails}/${checks} PASS`);
  process.exitCode = fails ? 1 : 0;
}
