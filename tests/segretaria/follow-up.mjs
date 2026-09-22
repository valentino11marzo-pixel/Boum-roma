// Real follow-up functions + authenticated handler; only external I/O is fake.
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
register('../notify/loader.mjs', import.meta.url);
Object.assign(process.env, { FIREBASE_API_KEY: 'fixture', FIREBASE_ADMIN_EMAIL: 'admin@example.test',
  FIREBASE_ADMIN_PASS: 'fixture', HOMIE_SECRET: 'fixture' });

const NOW = Date.parse('2026-09-14T10:00:00Z');
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => NOW + clockOffset;
let checks = 0, fails = 0;
function ok(name, pass, detail) {
  checks++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${!pass && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!pass) fails++;
}
const DB = new Map(), versions = new Map(), writes = [], allWrites = [], network = [];
globalThis.__mails = [];
let sequence = 0, failingCollection = '', beforePatch = null, followUpQueries = 0, failingFollowUpPage = 0, pageCost = 0;
const queryShapes = [];
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
    if (coll === 'operatorTasks' && q.orderBy?.[0]?.field?.fieldPath === '__name__') {
      followUpQueries++; queryShapes.push(structuredClone(q));
      if (followUpQueries === failingFollowUpPage) return json({ error: { status: 'UNAVAILABLE' } }, 503);
      if (!opts.signal) throw new Error('follow_up_query_requires_deadline');
      clockOffset += pageCost;
    }
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
      const left = String(sort.field.fieldPath === '__name__' ? a[0] : field(a[1], sort.field.fieldPath));
      const right = String(sort.field.fieldPath === '__name__' ? b[0] : field(b[1], sort.field.fieldPath));
      return (left < right ? -1 : left > right ? 1 : 0) * (sort.direction === 'DESCENDING' ? -1 : 1);
    });
    if (q.startAt) {
      const path = q.startAt.values[0]?.referenceValue?.split('/documents/')[1];
      if (!path) throw new Error('document_cursor_must_be_reference');
      entries = entries.filter(([p]) => q.startAt.before ? p >= path : p > path);
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

const { captureFollowUp, followUpId, listFollowUps, followUpDecisionHash } = await import('../../api/segretaria/_follow-up.js');
const { default: handler } = await import('../../api/segretaria/follow-up.js');
const { default: PROPOSTA } = await import('../../js/segretaria-proposta-engine.js');
const { closeTask, snoozeTask, voidTask, listOpenTasks } = await import('../../api/regista/_tasks.js');
const CID = 'conv_lead_leadA';
const conv = { contactType: 'lead', contactId: 'leadA', leadId: 'leadA', contactName: 'Cliente fixture',
  contactPhone: '+393331234567', contactEmail: 'client@example.test', needsReply: true, unread: 1 };
function reset() {
  DB.clear(); versions.clear(); writes.length = 0;
  sequence = 0; failingCollection = ''; beforePatch = null;
  followUpQueries = 0; failingFollowUpPage = 0; queryShapes.length = 0;
  clockOffset = 0; pageCost = 0;
  save('users/admin', { role: 'admin' }); save('users/tenant', { role: 'tenant' });
  save('conversations/' + CID, { ...conv });
  save('leads/leadA', { phone: conv.contactPhone, email: conv.contactEmail, propertyId: 'pA' });
  save('properties/pA', { name: 'Immobile fixture' });
  save('contracts/cA', { linkedLeadId: 'leadA', propertyId: 'pA', status: 'active' });
  save('contracts/foreign', { propertyId: 'foreign', tenantPhone: '+393339999999' });
}
async function call({ method = 'POST', body = {}, query = {}, token = 'admin', headers = {} } = {}) {
  let code, output;
  await handler({ method, body, query, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers } }, {
    status(value) { code = value; return this; }, json(value) { output = value; return this; }, setHeader() {},
  });
  return { code, ...output };
}
const capture = (messageId = 'event-1', extra = {}) => captureFollowUp({ cid: CID, conv, messageId, text: 'Verifico il documento', now: NOW, ...extra });
const tasks = () => [...DB].filter(([path, row]) => path.startsWith('operatorTasks/') && row.followUp);
const confirmed = (task, extra = {}) => ({ id: task.id, op: 'confirm', lastMessageId: task.followUp.lastMessageId,
  practiceRef: 'contracts/cA', nextAction: 'Ricevere la ricevuta', waitingOn: 'client', waitingLabel: 'Cliente fixture',
  checkAt: new Date(NOW + 86400000).toISOString(), ...extra });

try {
  reset();
  let task = await capture();
  ok('cattura nel registro operatorTasks esistente, senza calendario', tasks().length === 1
    && DB.get('operatorTasks/' + task.id)?.calendarize === false && task.status === 'open');
  ok('fonte, cliente e prossimo controllo presenti; pratica non inventata', task.followUp.conversationId === CID
    && task.followUp.contactName === conv.contactName && task.followUp.practiceRef === null
    && task.followUp.waitingOn === 'valentino' && Date.parse(task.followUp.checkAt) > NOW && task.followUp.needsReview === true);
  const firstWrites = writes.length;
  const replay = await capture();
  ok('replay immediato: stessa identità e nessuna seconda scrittura', replay.id === task.id && tasks().length === 1 && writes.length === firstWrites);
  ok('ID deterministico distingue conversazione ed evento', followUpId(CID, 'event-1') === task.id
    && followUpId('conv_other', 'event-1') !== task.id && followUpId(CID, 'event-2') !== task.id);

  reset();
  const deadlineText = 'Verificate le alternative entro oggi alle 13:00, ora di Roma.';
  task = await capture('deadline', { text: deadlineText });
  ok('richiesta esplicita conservata prima del modello e senza attendere il cap',
    task.followUp.checkAt === '2026-09-14T11:00:00.000Z'
    && task.followUp.intakeTiming?.requestedAt === task.followUp.checkAt
    && task.followUp.intakeTiming?.sourceMessageId === 'deadline'
    && task.followUp.intakeTiming?.sourceAt === new Date(NOW).toISOString()
    && task.followUp.intakeTiming?.status === 'resolved' && task.followUp.confirmed === false);
  const timingEvidence = structuredClone(task.followUp.intakeTiming), timedWrites = writes.length;
  await capture('deadline', { text: 'Testo retry diverso entro domani alle 15:00', now: NOW + 5000 });
  ok('retry non può cambiare la fonte o rimandare la richiesta catturata', writes.length === timedWrites
    && JSON.stringify(DB.get('operatorTasks/' + task.id).followUp.intakeTiming) === JSON.stringify(timingEvidence));
  await capture('neutral', { text: 'Grazie.', now: NOW + 1000 });
  ok('messaggio neutro conserva scadenza e fonte precedente distinguibile dal nuovo evento',
    DB.get('operatorTasks/' + task.id).followUp.lastMessageId === 'neutral'
    && DB.get('operatorTasks/' + task.id).followUp.intakeTiming.sourceMessageId === 'deadline'
    && DB.get('operatorTasks/' + task.id).followUp.checkAt === task.followUp.checkAt);
  await capture('earlier', { text: 'Verificate entro oggi alle 12:30.', now: NOW + 2000 });
  ok('nuova richiesta chiara anticipa solo il ricontrollo non confermato',
    DB.get('operatorTasks/' + task.id).followUp.checkAt === '2026-09-14T10:30:00.000Z'
    && DB.get('operatorTasks/' + task.id).followUp.intakeTiming.sourceMessageId === 'earlier'
    && DB.get('operatorTasks/' + task.id).due === '2026-09-14');
  await capture('later', { text: 'Verificate entro domani alle 18:00.', now: NOW + 3000 });
  ok('scadenza richiesta successiva resta evidenza senza posticipare il controllo pendente',
    DB.get('operatorTasks/' + task.id).followUp.checkAt === '2026-09-14T10:30:00.000Z'
    && DB.get('operatorTasks/' + task.id).followUp.intakeTiming.requestedAt === '2026-09-15T16:00:00.000Z');

  for (const [label, text, status] of [
    ['ora senza giorno', 'Verificate entro le 12:00.', 'ambiguous'],
    ['richiesta esitante', 'Forse verificate entro oggi alle 13:00.', 'ambiguous'],
    ['orario già trascorso', 'Verificate entro oggi alle 09:00.', 'past'],
  ]) {
    reset(); task = await capture(label, { text });
    ok(label + ': revisione immediata, fonte esplicita e nessuna promessa',
      task.followUp.checkAt === new Date(NOW).toISOString() && task.followUp.intakeTiming.status === status
      && task.followUp.needsReview && !task.followUp.confirmed);
  }

  for (const practiceRef of ['contracts/cA', null]) {
    reset(); task = await capture();
    await call({ body: confirmed(task, { practiceRef }) });
    const manual = structuredClone(DB.get('operatorTasks/' + task.id).followUp);
    await capture('urgent-after-manual', { text: deadlineText, now: NOW + 1000 });
    const next = DB.get('operatorTasks/' + task.id).followUp;
    ok('richiesta successiva conserva decisione manuale ' + (practiceRef ? 'con pratica' : 'senza pratica verificata'),
      ['checkAt', 'checkBasis', 'nextAction', 'waitingOn', 'waitingLabel', 'practiceRef', 'confirmedAt'].every(k => next[k] === manual[k])
      && next.intakeTiming?.requestedAt === '2026-09-14T11:00:00.000Z' && next.needsReview === true);
  }

  reset(); task = await capture('recent-time', { text: deadlineText });
  const recentTiming = JSON.stringify(task.followUp);
  await capture('old-backlog-time', { text: 'Verificate entro oggi alle 09:00.', now: NOW - 86400000, preserveNewer: true });
  ok('backlog precedente non sovrascrive né fonte temporale né controllo recente',
    JSON.stringify(DB.get('operatorTasks/' + task.id).followUp) === recentTiming && tasks().length === 1);

  reset();
  const simultaneous = await Promise.all([capture(), capture()]);
  ok('gara di cattura dello stesso evento: create409 recupera una sola card', tasks().length === 1 && simultaneous[0].id === simultaneous[1].id);
  reset();
  await Promise.all([capture('race-a'), capture('race-b')]);
  ok('due inbound diversi simultanei sulla stessa conversazione: una card corrente', tasks().length === 1);

  reset(); task = await capture();
  let result = await call({ body: confirmed(task, { actor: 'forged-user', propertyRef: 'properties/foreign' }) });
  ok('conferma una pratica candidata verificata dal dossier REALE', result.code === 200 && result.followUp.practiceRef === 'contracts/cA'
    && result.followUp.propertyRef === 'properties/pA' && result.followUp.confirmedBy === 'admin', result);
  const agreed = structuredClone(DB.get('operatorTasks/' + task.id).followUp);
  save('conversations/' + CID, { ...conv, unread: 0, needsReply: false, lastDirection: 'out' });
  save('messages/manual-reply', { conversationId: CID, direction: 'out', body: 'Ti aggiorno domani', at: new Date(NOW).toISOString() });
  result = await call({ method: 'GET' });
  ok('leggere o rispondere non chiude il seguito: compare ancora nella lista', result.code === 200
    && result.rows.some(t => t.id === task.id && t.status === 'open')
    && DB.get('operatorTasks/' + task.id).followUp.checkAt === agreed.checkAt);
  ok('elenco admin include stato preparazione distinto dalla ricezione WhatsApp',
    result.monitoring?.scope === 'preparation_only' && result.monitoring.checkedAt
    && typeof result.monitoring.status === 'string' && !network.length);
  await capture('event-2', { text: 'Arriva una nuova risposta', now: NOW + 1000 });
  let current = DB.get('operatorTasks/' + task.id).followUp;
  ok('nuova risposta conserva pratica, azione, responsabile e controllo ma chiede verifica',
    ['practiceRef', 'propertyRef', 'nextAction', 'waitingOn', 'waitingLabel', 'checkAt'].every(k => current[k] === agreed[k])
    && current.lastMessageId === 'event-2' && current.needsReview === true && tasks().length === 1);
  await capture('event-1', { now: NOW + 2000 });
  current = DB.get('operatorTasks/' + task.id).followUp;
  ok('replay di evento vecchio non riporta indietro ultima risposta o card', current.lastMessageId === 'event-2'
    && current.preview === 'Arriva una nuova risposta' && tasks().length === 1, current);

  reset(); task = await capture();
  const secondId = followUpId(CID, 'different-case');
  const original = DB.get('operatorTasks/' + task.id);
  save('operatorTasks/' + task.id, { ...original, followUp: { ...original.followUp, practiceRef: 'contracts/cA' } });
  save('operatorTasks/' + secondId, { ...original, followUp: { ...original.followUp, practiceRef: 'contracts/other', lastMessageId: 'different-case' } });
  const ambiguous = await capture('which-case');
  ok('due casi attivi: nuova richiesta senza assegnazione automatica', tasks().length === 3 && ambiguous.followUp.ambiguous
    && ambiguous.followUp.practiceRef === null && task.id !== ambiguous.id && secondId !== ambiguous.id);
  ok('i due casi precedenti mantengono le pratiche distinte', DB.get('operatorTasks/' + task.id).followUp.practiceRef === 'contracts/cA'
    && DB.get('operatorTasks/' + secondId).followUp.practiceRef === 'contracts/other');
  const otherConversation = await capture('which-case', { cid: 'conv_other' });
  ok('stesso evento su conversazione diversa non si fonde', otherConversation.id !== ambiguous.id && tasks().length === 4);

  reset(); task = await capture();
  result = await call({ body: confirmed(task, { practiceRef: 'contracts/foreign', dossier: { practices: [{ ref: 'contracts/foreign' }] } }) });
  ok('il dossier del client non autorizza una pratica estranea', result.code === 409 && result.error === 'practice_not_verified');
  failingCollection = 'contracts';
  result = await call({ body: confirmed(task, { practiceRef: 'leads/leadA' }) });
  ok('fonti incomplete: nessuna conferma di pratica', result.code === 409 && result.error === 'practice_not_verified');
  failingCollection = '';
  for (let i = 0; i < 41; i++) save('messages/history-' + i, {
    conversationId: CID, direction: 'out', body: 'Frase fixture', at: new Date(NOW - i * 1000).toISOString(),
  });
  result = await call({ body: confirmed(task) });
  ok('sola cronologia incompleta non invalida la pratica verificata', result.code === 200
    && result.followUp.practiceRef === 'contracts/cA', result);
  result = await call({ body: confirmed(task, { practiceRef: null }) });
  ok('nessuna pratica scelta resta esplicita e da verificare', result.code === 200 && result.followUp.practiceRef === null
    && result.followUp.confirmed === false && result.followUp.needsReview === true);
  reset(); task = await capture();
  save('leads/conflicting-person', { phone: conv.contactPhone, email: 'someone-else@example.test' });
  const ambiguousWrites = writes.length;
  result = await call({ body: confirmed(task) });
  ok('stesso telefono con email incompatibile: pratica candidata bloccata senza scrivere', result.code === 409
    && result.error === 'practice_not_verified' && writes.length === ambiguousWrites);

  for (const [name, patch] of [
    ['azione vuota', { nextAction: ' ' }], ['azione oggetto', { nextAction: { command: 'fake' } }],
    ['responsabile sconosciuto', { waitingOn: 'anyone' }], ['nome mancante', { waitingLabel: '' }],
    ['nome oggetto', { waitingLabel: { name: 'fake' } }], ['data impossibile', { checkAt: '2026-11-31T09:00:00Z' }],
    ['data senza fuso', { checkAt: '2026-10-15T09:00:00' }], ['data passata', { checkAt: new Date(NOW - 1).toISOString() }],
    ['data oltre un anno', { checkAt: new Date(NOW + 366 * 86400000).toISOString() }],
  ]) {
    reset(); task = await capture(); const before = writes.length;
    result = await call({ body: confirmed(task, patch) });
    ok('conferma rifiuta ' + name + ' senza scrivere', result.code === 400 && writes.length === before, result);
  }

  for (const [name, options, status] of [
    ['anonimo', { token: null }, 401], ['token falso', { token: 'forged' }, 401],
    ['tenant', { token: 'tenant' }, 403], ['utente senza profilo', { token: 'orphan' }, 403],
    ['solo Homie secret', { token: null, headers: { 'x-homie-secret': 'fixture' } }, 401],
  ]) {
    reset(); task = await capture(); const before = writes.length;
    result = await call({ ...options, body: confirmed(task) });
    ok('permessi: ' + name + ' non può confermare', result.code === status && writes.length === before, result);
  }
  reset();
  result = await call({ body: { id: '../private', op: 'close', outcome: 'x' } });
  ok('ID non valido rifiutato', result.code === 400 && writes.length === 0);

  reset(); task = await capture();
  result = await call({ body: { id: task.id, op: 'close', lastMessageId: 'event-1', outcome: ' ' } });
  ok('chiusura esige esito scritto', result.code === 400 && DB.get('operatorTasks/' + task.id).status === 'open');
  await capture('event-2');
  result = await call({ body: { id: task.id, op: 'close', lastMessageId: 'event-1', outcome: 'Ricevuta verificata' } });
  ok('chiusura con evento superato: 409 e caso aperto', result.code === 409 && result.error === 'new_message_reload'
    && DB.get('operatorTasks/' + task.id).status === 'open');
  result = await call({ body: { id: task.id, op: 'close', lastMessageId: 'event-2', outcome: 'Ricevuta verificata' } });
  ok('chiusura esplicita conserva esito e autore', result.code === 200 && DB.get('operatorTasks/' + task.id).status === 'done'
    && DB.get('operatorTasks/' + task.id).followUp.outcome === 'Ricevuta verificata'
    && DB.get('operatorTasks/' + task.id).followUp.closedBy === 'admin');
  ok('caso chiuso non compare tra aperti', (await listFollowUps()).rows.length === 0);
  const closedWrites = writes.length;
  await capture('event-1');
  ok('replay storico dopo chiusura non riapre il caso', tasks().length === 1
    && (await listFollowUps()).rows.length === 0 && writes.length === closedWrites);
  await capture('event-3');
  ok('evento nuovo dopo chiusura crea un nuovo caso senza alterare esito precedente', tasks().length === 2
    && (await listFollowUps()).rows.length === 1 && DB.get('operatorTasks/' + task.id).followUp.outcome === 'Ricevuta verificata');

  reset(); task = await capture();
  beforePatch = async path => {
    if (path === 'operatorTasks/' + task.id) {
      const row = DB.get(path);
      save(path, { ...row, followUp: { ...row.followUp, lastMessageId: 'event-concurrent', needsReview: true } });
    }
  };
  result = await call({ body: { id: task.id, op: 'close', lastMessageId: 'event-1', outcome: 'Ricevuta verificata' } });
  ok('gara: evento nuovo durante chiusura dà 409 senza perderlo', result.code === 409
    && DB.get('operatorTasks/' + task.id).status === 'open'
    && DB.get('operatorTasks/' + task.id).followUp.lastMessageId === 'event-concurrent', result);
  reset(); task = await capture();
  beforePatch = async path => {
    const row = DB.get(path);
    save(path, { ...row, followUp: { ...row.followUp, lastMessageId: 'event-during-confirm', needsReview: true } });
  };
  result = await call({ body: confirmed(task) });
  ok('gara: evento nuovo durante conferma dà 409 e resta da verificare', result.code === 409
    && DB.get('operatorTasks/' + task.id).followUp.lastMessageId === 'event-during-confirm'
    && DB.get('operatorTasks/' + task.id).followUp.practiceRef === null
    && DB.get('operatorTasks/' + task.id).followUp.needsReview === true, result);

  reset(); task = await capture();
  const protectedPath = 'operatorTasks/' + task.id;
  // Even a legacy card that used to have a timed invitation cannot reach the
  // old task mutation/calendar path: the follow-up contract remains in Oggi.
  save(protectedPath, { ...DB.get(protectedPath), calInvited: true, dueTime: '15:00' });
  const protectedCard = JSON.stringify(DB.get(protectedPath)), protectedWrites = writes.length;
  for (const [name, mutate] of [['chiusura', closeTask], ['rinvio', snoozeTask], ['annullamento', voidTask]]) {
    const answer = await mutate(task.id);
    ok('vecchio Regista: ' + name + ' non aggira esito e versione del seguito', answer === null
      && JSON.stringify(DB.get(protectedPath)) === protectedCard && writes.length === protectedWrites);
  }
  save('operatorTasks/manual-fixture', { title: 'Controllo ordinario', status: 'open', due: '2026-09-15', calendarize: false });
  const legacyList = await listOpenTasks();
  ok('vecchia lista Regista esclude i seguiti e conserva i task ordinari', legacyList.length === 1
    && legacyList[0].id === 'manual-fixture');
  await snoozeTask('manual-fixture');
  await closeTask('manual-fixture');
  ok('task ordinario continua a potersi rinviare e chiudere', DB.get('operatorTasks/manual-fixture').due === '2026-09-16'
    && DB.get('operatorTasks/manual-fixture').status === 'done');

  reset(); task = await capture();
  const reviewRow = structuredClone(DB.get('operatorTasks/' + task.id));
  const reviewMarker = { messageId: task.followUp.lastMessageId, followUpFingerprint: followUpDecisionHash(task.followUp),
    version: PROPOSTA.VERSION, state: 'review_required', reason: 'calendar_check_local_mismatch', attempts: 1, after: null };
  save('operatorTasks/' + task.id, { ...reviewRow, preparationRetry: reviewMarker });
  const reviewWrites = writes.length;
  const reviewList = await call({ method: 'GET' });
  const reviewDetail = await call({ method: 'GET', query: { id: task.id } });
  ok('errore422 attuale senza proposta appare da verificare su lista e dettaglio',
    reviewList.rows[0].preparationReview?.reason === reviewMarker.reason
    && reviewDetail.task.preparationReview?.reason === reviewMarker.reason && writes.length === reviewWrites);
  for (const [label, patch] of [
    ['evento superato', { preparationRetry: { ...reviewMarker, messageId: 'old-event' } }],
    ['decisione cambiata', { followUp: { ...reviewRow.followUp, checkAt: new Date(NOW + 900000).toISOString() } }],
    ['versione precedente', { preparationRetry: { ...reviewMarker, version: PROPOSTA.VERSION - 1 } }],
    ['retry transitorio', { preparationRetry: { ...reviewMarker, state: 'retry_wait' } }],
    ['caso chiuso', { status: 'done' }],
    ['seguito chiuso', { followUp: { ...reviewRow.followUp, open: false } }],
  ]) {
    save('operatorTasks/' + task.id, { ...reviewRow, preparationRetry: reviewMarker,
      preparationReview: { reason: 'forged_stored_flag' }, ...patch });
    const detail = await call({ method: 'GET', query: { id: task.id } });
    ok('review derivata ignora ' + label + ' e flag persistito', detail.code === 200 && detail.task.preparationReview === null);
  }
  save('operatorTasks/' + task.id, { ...reviewRow, preparationRetry: { ...reviewMarker, reason: '<private contact payload>' } });
  const safeReview = await call({ method: 'GET', query: { id: task.id } });
  ok('review mostra soltanto un codice ragione sanificato', safeReview.task.preparationReview?.reason === 'preparation_review_required');

  // More than a run/page worth of cases must remain reachable by an exclusive,
  // stable cursor; filtering legacy closed records cannot change its position.
  const pageId = n => 'sg_' + n.toString(16).padStart(32, '0');
  const seedPages = count => {
    for (let n = count - 1; n >= 0; n--) save('operatorTasks/' + pageId(n), {
      source: 'segretaria', status: n === 199 ? 'done' : 'open', calendarize: false,
      followUp: { open: true, conversationId: CID, lastMessageId: 'page-' + n,
        checkAt: new Date(NOW + (count - n) * 1000).toISOString() },
    });
  };
  reset(); seedPages(1205);
  const firstPage = await listFollowUps({ maxPages: 1 });
  ok('pagina oltre200: cursore sul documento RAW anche quando chiuso e filtrato',
    firstPage.rows.length === 199 && firstPage.incomplete && firstPage.nextCursor === pageId(199)
    && firstPage.scope === 'page' && !firstPage.readingDegraded && firstPage.pages === 1, firstPage);
  ok('prima pagina ordina solo per nome documento e ha deadline',
    JSON.stringify(queryShapes[0].orderBy) === JSON.stringify([{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }])
    && !queryShapes[0].startAt);
  const seen = new Set(firstPage.rows.map(row => row.id));
  let cursor = firstPage.nextCursor, pageRuns = 1;
  DB.delete('operatorTasks/' + pageId(199)); // A deleted cursor still has a valid ordering position.
  while (cursor && pageRuns < 10) {
    const page = await listFollowUps({ afterId: cursor, maxPages: 1 });
    for (const row of page.rows) {
      if (seen.has(row.id)) throw new Error('pagination_repeated_case');
      seen.add(row.id);
    }
    cursor = page.nextCursor; pageRuns++;
  }
  ok('ripresa copre1204aperti senza duplicati, oltrelimite5pagine e cursore eliminato',
    seen.size === 1204 && cursor === null && pageRuns === 7 && seen.has(pageId(1204)));
  ok('continuazione Firestore esclusiva usa document referenceValue',
    queryShapes[1].startAt?.before === false
    && queryShapes[1].startAt.values[0].referenceValue.endsWith('/operatorTasks/' + pageId(199)));
  save('operatorTasks/sg_0000000000000000000000000000000a', {
    source: 'segretaria', status: 'open', calendarize: false,
    followUp: { open: true, conversationId: CID, lastMessageId: 'new-event-behind-cursor', checkAt: new Date(NOW).toISOString() },
  });
  const restart = await listFollowUps({ maxPages: 1 });
  ok('giro successivo riparte e ritrova eventi aggiornati dietro il cursore',
    restart.rows.some(row => row.followUp.lastMessageId === 'new-event-behind-cursor'));
  reset(); seedPages(1205);
  result = await call({ method: 'GET' });
  ok('handler espone1000RAW e continuazione senza simulare lista completa', result.code === 200
    && result.rows.length === 999 && result.incomplete && result.nextCursor === pageId(999)
    && !result.readingDegraded && result.scope === 'page');
  result = await call({ method: 'GET', query: { after: result.nextCursor } });
  ok('handler pagina finale oltre1000 restituisce finecoda esplicita', result.code === 200
    && result.rows.length === 205 && !result.incomplete && result.nextCursor === null && result.scope === 'page');
  reset(); seedPages(200);
  let exact = await listFollowUps({ maxPages: 1 });
  const emptyFinal = await listFollowUps({ afterId: exact.nextCursor, maxPages: 1 });
  ok('numero esatto200 risolve pagina finale vuota senza ciclo', exact.incomplete
    && !emptyFinal.incomplete && emptyFinal.nextCursor === null && !emptyFinal.rows.length);
  reset(); seedPages(405); failingFollowUpPage = 2;
  let partial = await listFollowUps();
  ok('errore pagina2 conserva cursore pagina1 e dichiara lettura parziale',
    partial.rows.length === 199 && partial.incomplete && partial.nextCursor === pageId(199)
    && partial.readingDegraded && partial.readError === 'follow_up_page_unavailable' && partial.pages === 1);
  failingFollowUpPage = 0;
  const recovered = await listFollowUps({ afterId: partial.nextCursor });
  ok('ripresa dopoerrore rilegge pagina fallita finoallafine senza saltarla', recovered.rows.length === 205
    && recovered.rows.some(row => row.id === pageId(200)) && !recovered.incomplete && !recovered.readingDegraded);
  reset(); seedPages(405); pageCost = 5000;
  partial = await listFollowUps();
  ok('budget lettura esaurito dopo5s rimanda pagina2 senza errore né perdita del cursore',
    partial.pages === 1 && followUpQueries === 1 && partial.incomplete && !partial.readingDegraded
    && partial.nextCursor === pageId(199));
  reset(); seedPages(405); failingFollowUpPage = 1;
  result = await call({ method: 'GET' });
  ok('errore primapagina è503, mai una falsa coda vuota', result.code === 503 && result.error === 'follow_up_unavailable');
  for (const invalid of ['', '.', '..', '../other', 'x/y', ['cursor'], {}, 'x'.repeat(181)]) {
    reset(); result = await call({ method: 'GET', query: { after: invalid } });
    ok('cursore non valido respinto prima della query: ' + JSON.stringify(invalid),
      result.code === 400 && result.error === 'invalid_cursor' && followUpQueries === 0);
  }

  // Run mutated real capture code with the SAME in-memory network boundary.
  // This proves the checks would fail if an automatic update overrode a
  // human decision, including a decision with no verified practice selected.
  const followUpURL = new URL('../../api/segretaria/_follow-up.js', import.meta.url);
  const originalCode = await readFile(followUpURL, 'utf8');
  if (!originalCode.includes('cursor = page[page.length - 1].id;')) throw new Error('pagination_mutation_target_missing');
  const missingCursor = originalCode.replace('cursor = page[page.length - 1].id;', 'cursor = null;')
    .replace(/from '(\.\.?\/[^']+)'/g, (_, relative) => 'from ' + JSON.stringify(new URL(relative, followUpURL).href));
  const missingCursorModule = await import('data:text/javascript;base64,' + Buffer.from(missingCursor).toString('base64'));
  reset(); seedPages(405);
  const stranded = await missingCursorModule.listFollowUps({ maxPages: 1 });
  ok('mutazione intercettata: togliere continuazione rende irraggiungibile il resto della coda',
    stranded.incomplete && stranded.nextCursor === null && stranded.rows.length === 199);
  for (const [label, from, to, practiceRef] of [
    ['protezione decisione confermata', '!prior.confirmed && !prior.confirmedAt && !prior.confirmedBy', 'true', 'contracts/cA'],
    ['protezione decisione manuale senza pratica', '!prior.confirmed && !prior.confirmedAt && !prior.confirmedBy', '!prior.confirmed', null],
  ]) {
    if (!originalCode.includes(from)) throw new Error('mutation_target_missing');
    const code = originalCode.replace(from, to).replace(/from '(\.\.?\/[^']+)'/g,
      (_, relative) => 'from ' + JSON.stringify(new URL(relative, followUpURL).href));
    const mutated = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    reset(); task = await capture();
    await call({ body: confirmed(task, { practiceRef }) });
    const manualAt = DB.get('operatorTasks/' + task.id).followUp.checkAt;
    const changed = await mutated.captureFollowUp({ cid: CID, conv, messageId: 'mutated-deadline',
      text: deadlineText, now: NOW + 1000 });
    ok('mutazione intercettata: ' + label, changed.followUp.checkAt !== manualAt);
  }

  ok('nessun modello, Telegram, rete calendario o email chiamati', network.length === 0 && globalThis.__mails.length === 0, network);
  ok('nessuna coda di invio o calendario scritta', allWrites.every(w => w.path.startsWith('operatorTasks/')
    || /^heartbeat\/segretaria-(event|case)-/.test(w.path))
    && allWrites.filter(w => w.path.startsWith('operatorTasks/')).every(w => w.data.calendarize === false));
} finally {
  Date.now = realNow;
}
console.log(`${checks} check follow-up, ${fails} falliti`);
process.exit(fails ? 1 : 0);
