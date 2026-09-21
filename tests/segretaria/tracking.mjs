// Real WhatsApp/email handlers + real MIME parser; only network transports fake.
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
    if (failCommit && body.writes?.some(w => w.update?.name.includes('/operatorTasks/'))) return json({ error: { status: 'UNAVAILABLE' } }, 503);
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
    for (const sort of [...(q.orderBy || [])].reverse()) entries.sort((a, b) => {
      const key = row => sort.field.fieldPath === '__name__' ? row[0] : String(field(row[1], sort.field.fieldPath));
      return (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (sort.direction === 'DESCENDING' ? -1 : 1);
    });
    if (q.startAt) {
      const cursor = q.startAt.values[0].referenceValue.split('/documents/')[1];
      entries = entries.filter(([path]) => q.startAt.before ? path >= cursor : path > cursor);
    }
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
const CID = 'conv_lead_leadA';
const conv = { contactType: 'lead', contactId: 'leadA', leadId: 'leadA', contactName: 'Cliente fixture',
  contactPhone: '+393331234567', contactEmail: 'client@example.test', segretaria: false, needsReply: false, unread: 0 };
function reset() {
  DB.clear(); versions.clear(); writes.length = 0;
  sequence = 0; failingCollection = ''; beforePatch = null; failCommit = false;
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

try {
  reset();
  const before = writes.length;
  const empty = await refreshTrackedFollowUp({ cid: CID, conv, text: 'Nuovo', messageId: 'never-tracked', now: NOW });
  ok('refresh senza cursore non crea una nuova presa in carico', empty === null && writes.length === before && tasks().length === 0);
  let result = await call(messageHandler, inbound('untracked'));
  ok('inbound WhatsApp non consegnato resta messaggio senza nuovo caso', result.code === 200 && messages().length === 1 && tasks().length === 0);

  for (const [name, config, at] of [
    ['opt-in assente', { enabled: true }, NOW],
    ['opt-in spento', { enabled: true, prepareCases: false, prepareSince: new Date(NOW - 1).toISOString() }, NOW],
    ['kill switch spento', { enabled: false, prepareCases: true, prepareSince: new Date(NOW - 1).toISOString() }, NOW],
    ['inizio mancante', { enabled: true, prepareCases: true }, NOW],
    ['inizio impossibile', { enabled: true, prepareCases: true, prepareSince: '2026-02-30T10:00:00Z' }, NOW],
    ['inizio senza timezone', { enabled: true, prepareCases: true, prepareSince: '2026-09-14T10:00:00' }, NOW],
    ['evento storico', { enabled: true, prepareCases: true, prepareSince: new Date(NOW).toISOString() }, NOW - 1],
  ]) {
    reset(); save('settings/segretaria', config);
    const out = await refreshTrackedFollowUp({ cid: CID, conv, text: 'Nuovo', messageId: 'opt-in-fixture', now: at });
    ok(name + ': nessuna cattura implicita di nuovi casi', out === null && tasks().length === 0 && writes.length === 0);
  }
  reset();
  const receivedBefore = new Date().getTime();
  save('settings/segretaria', { enabled: true, prepareCases: true, prepareSince: new Date(receivedBefore - 1000).toISOString() });
  result = await call(messageHandler, inbound('backlog-live', { timestamp: new Date(NOW - 86400000).toISOString(),
    receivedAt: '1990-01-01T00:00:00.000Z' }));
  const freshReceived = new Date(DB.get('messages/' + result.messageId)?.receivedAt).getTime();
  ok('backlog ricevuto ora viene preso in carico dalla data server, conservando la data storica del contenuto', result.followUp?.tracked
    && tasks().length === 1 && tasks()[0][1].followUp.lastInboundAt === new Date(NOW - 86400000).toISOString()
    && freshReceived >= receivedBefore && freshReceived <= new Date().getTime(), result);
  ok('body.receivedAt contraffatto non viene salvato e non spegne la presa in carico',
    DB.get('messages/' + result.messageId)?.receivedAt !== '1990-01-01T00:00:00.000Z'
    && DB.get('conversations/' + CID).segretaria === false && network.length === 0);
  await call(messageHandler, inbound('backlog-live'));
  ok('retry primo evento opt-in non duplica caso o messaggio', tasks().length === 1 && messages().length === 1);

  for (const legacy of [false, true]) {
    reset();
    result = await call(messageHandler, inbound('stored-before-rollout', { timestamp: new Date(NOW - 1000).toISOString() }));
    const oldId = result.messageId, stored = { ...DB.get('messages/' + oldId) };
    if (legacy) delete stored.receivedAt;
    else stored.receivedAt = new Date(NOW - 1000).toISOString();
    save('messages/' + oldId, stored);
    save('settings/segretaria', { enabled: true, prepareCases: true, prepareSince: new Date(NOW).toISOString() });
    result = await call(messageHandler, inbound('stored-before-rollout', { timestamp: new Date(NOW + 1000).toISOString(),
      receivedAt: '2099-01-01T00:00:00.000Z', body: 'RETRY MODIFICATO' }));
    ok((legacy ? 'legacy senza receivedAt' : 'receivedAt persistito prima del rollout') + ': retry ignora data contraffatta e non iscrive archivio storico',
      result.dedupHit && result.messageId === oldId && tasks().length === 0 && messages().length === 1
      && DB.get('messages/' + oldId).receivedAt === stored.receivedAt, result);
  }

  reset(); let path = await followed();
  result = await call(messageHandler, inbound('after-takeover'));
  ok('WhatsApp dopo presa in carico umana aggiorna il caso esistente', result.code === 200 && result.followUp?.tracked
    && tasks().length === 1 && DB.get(path).followUp.lastMessageId === 'after-takeover'
    && DB.get(path).followUp.needsReview === true && DB.get('conversations/' + CID).segretaria === false, result);
  ok('WhatsApp conserva impegno confermato, pratica, responsabile e ricontrollo', preserved(DB.get(path)));
  await call(messageHandler, inbound('manual-out', { direction: 'out' }));
  ok('out manuale non diventa nuovo evento del seguito', DB.get(path).followUp.lastMessageId === 'after-takeover');

  reset(); path = await followed(); failCommit = true;
  result = await call(messageHandler, inbound('tracking-fails', { analysis: { needsReply: false } }));
  ok('errore tracking WhatsApp: messaggio conservato, errore esplicito, needsReply=true', result.code === 200
    && messages().length === 1 && !!result.followUp?.error && DB.get('conversations/' + CID).needsReply === true
    && !!DB.get('conversations/' + CID).followUpTrackingError && DB.get(path).followUp.lastMessageId === 'initial-event', result);
  const failedMessageId = result.messageId;
  result = await call(messageHandler, inbound('tracking-fails', { contactId: 'different-retry-contact', body: 'TAMPERED RETRY' }));
  ok('retry ancora fallito non ricade nella scrittura e conserva errore leggibile', result.dedupHit === true
    && result.messageId === failedMessageId && result.conversationId === CID && !!result.followUp?.error
    && messages().length === 1 && tasks().length === 1 && !DB.has('conversations/conv_lead_different-retry-contact'), result);
  failCommit = false;
  const beforeRepair = writes.length;
  result = await call(messageHandler, inbound('tracking-fails', { contactId: 'different-retry-contact', direction: 'out',
    body: 'TAMPERED RETRY', timestamp: '2030-01-01T00:00:00.000Z' }));
  ok('retry ripara stesso messaggio/caso con identità, direzione, testo e data della fonte salvata', result.dedupHit === true
    && result.messageId === failedMessageId && result.conversationId === CID && result.followUp?.tracked === true
    && messages().length === 1 && tasks().length === 1 && DB.get(path).followUp.lastMessageId === 'tracking-fails'
    && DB.get(path).followUp.preview === 'Ecco il dettaglio richiesto'
    && DB.get(path).followUp.lastInboundAt === new Date(NOW).toISOString()
    && DB.get('conversations/' + CID).followUpTrackingError === null
    && writes.slice(beforeRepair).every(w => !/^(leads|messages)\//.test(w.path)), result);
  await call(messageHandler, inbound('after-repair'));
  const afterNewEvent = DB.get(path).followUp.lastMessageId;
  await call(messageHandler, inbound('tracking-fails', { body: 'ANOTHER TAMPERED RETRY' }));
  ok('retry riparato non riporta indietro l’evento successivo già ricevuto', afterNewEvent === 'after-repair'
    && DB.get(path).followUp.lastMessageId === afterNewEvent && tasks().length === 1 && messages().length === 2);

  reset(); path = await followed();
  save('conversations/' + CID, { ...conv, segretaria: true }); failCommit = true;
  result = await call(messageHandler, inbound('active-tracking-fails'));
  ok('tracking fallito blocca anche il turno di una chat ancora consegnata', result.code === 200
    && !!result.followUp?.error && !result.segretaria && DB.get('conversations/' + CID).needsReply === true, result);
  failCommit = false;

  reset(); path = await followed(); mail(1, 'email-after-takeover');
  result = await call(scanHandler);
  ok('email di caso aperto entra anche con Segretaria spenta', result.code === 200 && result.watched === 1
    && result.refreshed === 1 && result.turns === 0 && messages().length === 1 && tasks().length === 1, result);
  ok('parser MIME e stripQuoted reali: solo risposta nuova nel messaggio e nel seguito', messages()[0][1].body === 'Here is the receipt.'
    && DB.get(path).followUp.preview === 'Here is the receipt.' && preserved(DB.get(path)) && DB.get(path).followUp.needsReview === true,
    messages()[0]?.[1]);
  const afterMailWrites = writes.length, messageCount = messages().length;
  result = await call(scanHandler);
  ok('replay email già vista: nessun nuovo messaggio, turno o aggiornamento del caso', result.refreshed === 0
    && result.turns === 0 && messages().length === messageCount && writes.slice(afterMailWrites).every(w => w.path.startsWith('teamHealth/')));

  reset(); path = await followed(); mail(2, 'tracking-error'); failCommit = true;
  result = await call(scanHandler);
  const persistedId = messages()[0]?.[0];
  ok('errore tracking email conserva messaggio e richiede controllo senza ack memoria', result.code === 200 && result.trackingErrors === 1
    && messages().length === 1 && DB.get('conversations/' + CID).needsReply === true
    && !!DB.get('conversations/' + CID).followUpTrackingError && !DB.get('heartbeat/segretaria-mail-memory')
    && DB.get(path).followUp.lastMessageId === 'initial-event', result);
  failCommit = false;
  result = await call(scanHandler);
  ok('retry email dopo errore ripara seguito senza duplicare messaggio', result.refreshed === 1 && result.trackingErrors === 0
    && messages().length === 1 && messages()[0][0] === persistedId && DB.get(path).followUp.lastMessageId !== 'initial-event'
    && DB.get('conversations/' + CID).followUpTrackingError === null, result);

  reset(); path = await followed();
  save('conversations/conv_lead_other', { ...conv, contactId: 'other', leadId: 'other', contactPhone: '+393339999999', segretaria: true });
  mail(3, 'ambiguous');
  result = await call(scanHandler);
  ok('email condivisa fra due identità: nessun primo/ultimo abbinamento né risposta', result.ambiguousEmails === 1
    && result.ambiguousConversationIds.length === 2 && result.watched === 0 && messages().length === 0
    && DB.get(path).followUp.lastMessageId === 'initial-event' && globalThis.__imap.connections === 0, result);

  reset(); path = await followed();
  save('conversations/conv_whatsapp_393331234567', { ...conv, contactType: 'whatsapp', contactId: '393331234567', segretaria: true });
  mail(6, 'known-alias');
  result = await call(scanHandler);
  ok('alias storico con stesso lead persistito va alla primaria, non all’ultimo trovato', result.knownAliases === 1
    && result.ambiguousEmails === 0 && result.watched === 1 && result.refreshed === 1
    && messages().length === 1 && messages()[0][1].conversationId === CID && result.turns === 0, result);
  reset(); path = await followed();
  save('conversations/conv_whatsapp_393339999999', { ...conv, contactType: 'whatsapp', contactId: '393339999999',
    contactPhone: '+393339999999', segretaria: true });
  mail(7, 'contradictory-alias');
  result = await call(scanHandler);
  ok('leadId uguale ma telefono discordante non autorizza fusione email', result.ambiguousEmails === 1
    && result.knownAliases === 0 && result.watched === 0 && messages().length === 0, result);

  reset(); mail(4, 'not-watched');
  result = await call(scanHandler);
  ok('chat mai consegnata e senza caso non viene letta via IMAP', result.watched === 0 && globalThis.__imap.connections === 0
    && messages().length === 0 && tasks().length === 0);

  reset(); path = await followed(); mail(5, 'dry'); const dryWrites = writes.length;
  result = await call(scanHandler, {}, { dry: '1' });
  ok('dry legge il perimetro e non crea messaggi, casi, invii o heartbeat', result.dry === true && result.processed === 1
    && result.turns === 0 && writes.length === dryWrites && messages().length === 0);

  reset(); await followed();
  for (let i = 0; i < 199; i++) save('operatorTasks/capped-' + i, { status: 'open', followUp: { open: true, conversationId: CID } });
  result = await call(scanHandler, {}, { dry: '1' });
  ok('scansione legge pagina successiva dopo 200 seguiti senza dichiarare falsamente un taglio', result.followUpsIncomplete === false
    && result.watched === 1 && globalThis.__imap.searches.length === 1, result);
  reset(); await followed();
  for (let i = 0; i < 1200; i++) save('operatorTasks/capped-' + i, { status: 'open', followUp: { open: true, conversationId: CID } });
  result = await call(scanHandler, {}, { dry: '1' });
  ok('scansione email dichiara una lettura che supera il budget di pagine del singolo ciclo', result.followUpsIncomplete === true && result.incomplete === true
    && result.watched === 1 && globalThis.__imap.searches.length === 1, result);

  ok('nessun modello, Telegram, email, calendario o outbox durante tracking', network.length === 0 && globalThis.__mails.length === 0
    && allWrites.every(w => !/^(action_queue|messageLog|waOutbox|calendarEvents)\//.test(w.path)), network);
} finally { Date.now = realNow; }
console.log(`${checks} check tracking, ${fails} falliti`);
process.exit(fails ? 1 : 0);
