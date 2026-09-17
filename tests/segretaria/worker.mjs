// Real worker and preparation with an in-memory Firestore. Only network boundaries are mocked.
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);
Object.assign(process.env, { FIREBASE_API_KEY: 'fixture', FIREBASE_ADMIN_EMAIL: 'admin@example.test',
  FIREBASE_ADMIN_PASS: 'fixture', HOMIE_SECRET: 'fixture', ANTHROPIC_API_KEY: 'fixture', CRON_SECRET: 'fixture-cron' });

const NOW = Date.parse('2026-09-15T10:00:00Z');
const realNow = Date.now;
let clock = NOW;
Date.now = () => clock;
let checks = 0, fails = 0;
function ok(name, pass, detail) {
  checks++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${!pass && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!pass) fails++;
}
const DB = new Map(), versions = new Map(), writes = [], allWrites = [], network = [], reads = [];
globalThis.__mails = [];
let sequence = 0, failingCollection = '', beforePatch = null, commitHook = null;
let aiHits = 0, aiHook = null, aiBuilder = null, failFirstTaskReads = 0, listDelayMs = 0, readHook = null;
const aiInputs = [], aiRequests = [], queryReads = [];
const enc = v => v == null ? { nullValue: null }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'string' ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = v => 'referenceValue' in v ? v.referenceValue : 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue
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
  if (url.hostname === 'api.anthropic.com') {
    aiHits++;
    const input = JSON.parse(body.messages[0].content);
    aiInputs.push(input); aiRequests.push(body);
    if (aiHook) await aiHook(input);
    const proposal = aiBuilder ? await aiBuilder(input) : validProposal(input);
    return json({ content: [{ type: 'text', text: typeof proposal === 'string' ? proposal : JSON.stringify(proposal) }], usage: { input_tokens: 100, output_tokens: 100 } });
  }
  if (url.hostname !== 'firestore.googleapis.com') {
    network.push(url.hostname);
    throw new Error('forbidden_external_effect');
  }
  if (url.pathname.endsWith(':commit')) {
    const operations = body.writes || [];
    if (commitHook) await commitHook(operations);
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
    queryReads.push(structuredClone(q));
    if (coll === 'operatorTasks' && listDelayMs) { clock += listDelayMs; listDelayMs = 0; }
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
      String(sort.field.fieldPath === '__name__' ? a[0] : field(a[1], sort.field.fieldPath)).localeCompare(String(sort.field.fieldPath === '__name__' ? b[0] : field(b[1], sort.field.fieldPath))) * (sort.direction === 'DESCENDING' ? -1 : 1));
    if (q.startAt) {
      const start = q.startAt.values[0].referenceValue.split('/documents/')[1];
      entries = entries.filter(([path]) => q.startAt.before ? path >= start : path > start);
    }
    return json(entries.slice(0, q.limit || 1000).map(([p]) => ({ document: doc(p) })));
  }
  const path = decodeURIComponent(url.pathname.split('/documents/')[1] || '');
  if (!opts.method || opts.method === 'GET') {
    reads.push(path);
    if (readHook) await readHook(path);
  }
  if (failFirstTaskReads > 0 && path === 'operatorTasks/' + ID && !opts.method) {
    failFirstTaskReads--; return json({ error: { status: 'UNAVAILABLE' } }, 503);
  }
  if (failingCollection && path.startsWith(failingCollection + '/')) return json({ error: { status: 'UNAVAILABLE' } }, 503);
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

const { prepareCase } = await import('../../api/segretaria/_prepare.js');
const { default: PROPOSTA } = await import('../../js/segretaria-proposta-engine.js');
const { CONTEXT_VERSION } = await import('../../api/segretaria/_context.js');
const { followUpDecisionHash } = await import('../../api/segretaria/_follow-up.js');
const { default: CALENDAR } = await import('../../js/segretaria-calendar-engine.js');
const { default: workerEndpoint, prepareNextCase } = await import('../../api/segretaria/worker.js');
const ID = 'sg_' + 'a'.repeat(32), ID2 = 'sg_' + 'b'.repeat(32), CID = 'conv_tenant_fixture';
const PHONE = '+393331234567', EMAIL = 'customer@example.test';
const stamp = n => new Date(n).toISOString();
const task = (id = ID) => DB.get('operatorTasks/' + id);
const rows = coll => [...DB].filter(([p]) => p.startsWith(coll + '/'));
const count = () => rows('heartbeat').find(([p]) => p.includes('/segretaria-preparations-'))?.[1].count || 0;
const untouched = () => !rows('action_queue').length && !rows('messageLog').length && !rows('notifications').length
  && !globalThis.__mails.length && !network.length;
function revise(fn, id = ID) { const t = structuredClone(task(id)); fn(t); save('operatorTasks/' + id, t); }
function validProposal(input) {
  const src = input.sources.find(s => s.id === input.coverage.lastEvent.sourceId);
  const ids = [src.id], quote = src.text.slice(0, 100);
  return { summary: 'Il cliente attende un aggiornamento sul prossimo intervento.',
    recommendation: 'Verificare la disponibilità del tecnico e preparare la risposta.',
    facts: [{ text: 'È arrivata una richiesta di aggiornamento.', sourceIds: ids, quote }],
    commitments: [{ text: 'Il cliente attende una risposta.', sourceIds: ids, quote, kind: 'inferred', status: 'pending' }],
    uncertainties: [{ text: 'La data resta da verificare.', sourceIds: ids, quote }],
    nextAction: { text: 'Verificare la disponibilità del tecnico', waitingOn: 'valentino', waitingLabel: 'Valentino',
      checkAt: stamp(Date.parse(input.now) + 3600000), checkLocal: CALENDAR.romeLocalInstant(Date.parse(input.now) + 3600000), practiceRef: input.existingFollowUp.practiceRef || null,
      sourceIds: ids, reason: 'La richiesta attende una disponibilità confermata.' },
    draft: { channel: input.channel, text: input.language === 'it'
      ? 'Ricevuto, verifichiamo la disponibilità e ti aggiorniamo.' : 'Thanks, we will check availability and update you.', sourceIds: ids },
    handoff: { needed: false, reason: 'La richiesta può essere preparata per la verifica.', sourceIds: ids } };
}
function reset({ role = 'tenant', text = 'Potete aggiornarmi sulla disponibilità del tecnico?' } = {}) {
  DB.clear(); versions.clear(); writes.length = 0; network.length = 0; reads.length = 0; globalThis.__mails.length = 0;
  aiInputs.length = 0; aiRequests.length = 0; queryReads.length = 0; aiHits = 0; aiHook = null; aiBuilder = null;
  sequence = 0; clock = NOW; readHook = null; failFirstTaskReads = 0; listDelayMs = 0; failingCollection = ''; beforePatch = null; commitHook = null;
  save('users/admin', { role: 'admin' }); save('users/tenant', { role: 'tenant' });
  save('settings/segretaria', { enabled: true, prepareCases: true, dailyCap: 5 });
  const personId = role === 'pfs' ? 'pfsA' : 'tenantA';
  const practiceRef = role === 'pfs' ? 'pfsClients/pfsA' : 'contracts/cA';
  save('conversations/' + CID, { contactType: role, contactId: personId, contactPhone: PHONE,
    contactEmail: EMAIL, contactName: 'Cliente fixture', channel: 'whatsapp', segretaria: false });
  save((role === 'pfs' ? 'pfsClients/' : 'users/') + personId,
    { role, name: 'Cliente fixture', phone: PHONE, email: EMAIL, propertyId: 'pA', status: 'active' });
  if (role !== 'pfs') save('contracts/cA', { tenantId: personId, propertyId: 'pA', status: 'active' });
  save('properties/pA', { name: 'Immobile fixture', status: 'available' });
  save('messages/m1', { conversationId: CID, direction: 'in', channel: 'whatsapp', body: text, at: stamp(NOW - 10000) });
  save('operatorTasks/' + ID, { source: 'segretaria', status: 'open', calendarize: false,
    followUp: { open: true, conversationId: CID, lastMessageId: 'm1', lastInboundAt: stamp(NOW - 10000),
      preview: text, checkAt: stamp(NOW + 60000), practiceRef, needsReview: true } });
}
async function generate(extra = {}) { return prepareCase({ id: ID, actor: 'admin', now: clock, ...extra }); }
async function endpoint(handler, { method = 'POST', token = 'admin', body = {}, headers = {}, query = {} } = {}) {
  let code, out;
  await handler({ method, body, query, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers } }, {
    status(n) { code = n; return this; }, json(v) { out = v; return this; }, setHeader() {}, end() {},
  });
  return { httpCode: code, ...out };
}

const tick = () => endpoint(workerEndpoint, { method: 'GET', token: 'fixture-cron' });
const heartbeat = () => DB.get('heartbeat/segretaria-preparer');
const retryMarker = (after, state = 'retry_wait', extra = {}) => ({ messageId: task().followUp.lastMessageId,
  followUpFingerprint: followUpDecisionHash(task().followUp), version: PROPOSTA.VERSION,
  attempts: 1, reason: 'preparation_unavailable', state, after, ...extra });
function addCase(n, inboundAt, changes = {}) {
  const id = 'sg_' + n.toString(16).padStart(32, '0'), messageId = 'event' + n;
  save('messages/' + messageId, { ...structuredClone(DB.get('messages/m1')), at: stamp(inboundAt) });
  const t = structuredClone(task());
  delete t.preparation; delete t.preparationCheckedAt; delete t.preparationRetry;
  t.followUp = { ...t.followUp, lastMessageId: messageId, lastInboundAt: stamp(inboundAt), ...changes };
  save('operatorTasks/' + id, t);
  return id;
}

try {
  reset();
  const middle = addCase(1, NOW - 5000), latest = addCase(2, NOW - 1000), between = addCase(3, NOW - 3000);
  let out = await tick();
  ok('il batch serve due nuovi ingressi e un caso vecchio, in sequenza, con massimo tre chiamate',
    out.httpCode === 200 && out.prepared === 3 && out.checked === 3 && aiHits === 3 && count() === 3
      && JSON.stringify(out.results.map(r => r.id)) === JSON.stringify([latest, between, ID]), out);
  ok('heartbeat aggregato descrive la coda letta, il residuo e il limite batch',
    heartbeat().queueBefore.openCases === 4 && heartbeat().queueBefore.pending === 4 && heartbeat().queueBefore.newEvents === 4
      && heartbeat().queue.currentProposals === 3 && heartbeat().queue.pending === 1 && heartbeat().queue.retrying === 0
      && heartbeat().remaining === 1 && heartbeat().stoppedBy === 'batch_limit', heartbeat());
  out = await tick();
  ok('il giro successivo prepara soltanto il residuo e conta le tre proposte già correnti',
    out.prepared === 1 && out.id === middle && out.queue.currentProposals === 4 && out.remaining === 0
      && count() === 4 && untouched(), out);
  out = await tick();
  ok('coda già aggiornata resta idle: nessun modello, nessun ricontrollo inutile',
    out.checked === 0 && out.prepared === 0 && out.queue.pending === 0 && aiHits === 4, out);

  reset();
  addCase(1, NOW - 5000); const slowLatest = addCase(2, NOW - 1000); addCase(3, NOW - 3000);
  aiHook = async () => { clock += 19000; };
  const turns = [];
  for (let n = 0; n < 3; n++) {
    if (n) clock = NOW + n * 60000;
    turns.push(await tick());
  }
  ok('equità persiste fra run lenti: terzo slot al caso più vecchio anche con un solo modello per minuto',
    turns.every(r => r.prepared === 1 && r.checked === 1 && r.stoppedBy === 'time_budget')
      && turns[0].id === slowLatest && turns[2].id === ID
      && JSON.stringify(turns.map(r => r.schedulerCursor)) === '[1,2,0]' && aiHits === 3, turns);

  reset(); await generate(); clock = NOW + 60001;
  const fresh = addCase(1, clock - 1000);
  out = await tick();
  ok('nuovo messaggio precede il vecchio ricontrollo scaduto e vengono trattati entrambi',
    out.results[0].id === fresh && out.results[1].id === ID && out.queueBefore.newEvents === 1
      && out.queueBefore.rechecks === 1 && out.prepared === 2, out);
  out = await tick();
  ok('recheckFor impedisce nuova spesa per lo stesso ricontrollo già preparato',
    out.prepared === 0 && out.checked === 0 && aiHits === 3, out);

  reset();
  revise(t => { t.followUp.confirmed = true; t.followUp.checkAt = stamp(NOW - 60000); });
  const nearDeadline = addCase(1, NOW - 5000, { confirmed: false, checkAt: stamp(NOW + 7200000),
    intakeTiming: { status: 'resolved', requestedAt: stamp(NOW + 1800000), sourceAt: stamp(NOW - 5000),
      sourceMessageId: 'event1', quote: 'Entro oggi alle 12:30.' } });
  const freshWithoutDeadline = addCase(2, NOW - 1000, { confirmed: false, checkAt: stamp(NOW + 30000) });
  const oldestWithoutDeadline = addCase(3, NOW - 86400000, { confirmed: false, checkAt: stamp(NOW + 7200000) });
  out = await tick();
  ok('scadenza confermata scaduta e richiesta esplicita entro1h precedono nuovi ingressi, terzo slot equo',
    JSON.stringify(out.results.map(row => row.id)) === JSON.stringify([ID, nearDeadline, oldestWithoutDeadline])
      && out.queue.pending === 1 && !task(freshWithoutDeadline).preparation, out);

  reset(); addCase(1, NOW - 5000, { confirmed: false, checkAt: stamp(NOW - 1000),
    intakeTiming: { status: 'ambiguous', requestedAt: stamp(NOW - 1000), sourceAt: stamp(NOW - 5000),
      sourceMessageId: 'event1', quote: 'Forse oggi.' } });
  const recentWithoutPromise = addCase(2, NOW - 1000);
  out = await tick();
  ok('ricontrollo interno non confermato e richiesta ambigua non diventano priorità di scadenza',
    out.results[0].id === recentWithoutPromise, out);

  reset(); await generate();
  ok('contesto corrente è pronto nella regola condivisa fra home e worker',
    PROPOSTA.currentContext(task()) && task().preparation.coverage.version === CONTEXT_VERSION
      && PROPOSTA.CONTEXT_VERSION === 2 && CONTEXT_VERSION === 2);
  const oldSchema = structuredClone(task()); oldSchema.preparation.version = 2;
  ok('contesto corrente non promuove una proposta con schema precedente non approvato', !PROPOSTA.currentContext(oldSchema));
  const closedCurrent = structuredClone(task()); closedCurrent.status = 'done';
  ok('contesto corrente non promuove una proposta su un caso chiuso', !PROPOSTA.currentContext(closedCurrent));
  out = await tick();
  ok('proposta con contesto corrente non viene rigenerata',
    out.prepared === 0 && out.checked === 0 && out.queue.currentProposals === 1 && aiHits === 1, out);
  reset(); await generate();
  revise(t => { t.preparation.version = 2; });
  out = await tick();
  ok('proposta v2 precedente alla correzione delle attese viene rigenerata senza ridurre il contatore',
    out.prepared === 1 && aiHits === 2 && task().preparation.version === PROPOSTA.VERSION
      && DB.get('heartbeat/segretaria-preparations-2026-09-15').count === 2, out);
  for (const legacy of ['missing_coverage', 'missing_version', 'old_version', 'invalid_version']) {
    reset(); await generate();
    revise(t => {
      if (legacy === 'missing_coverage') delete t.preparation.coverage;
      else if (legacy === 'missing_version') delete t.preparation.coverage.version;
      else t.preparation.coverage.version = legacy === 'old_version' ? 1 : '2';
      t.preparation.sourceFingerprint = 'legacy-context-fingerprint';
    });
    ok('contesto precedente non appare pronto nella home: ' + legacy,
      PROPOSTA.current(task()) && !PROPOSTA.currentContext(task()));
    out = await tick();
    ok('contesto precedente viene rigenerato dal worker: ' + legacy,
      out.prepared === 1 && out.queueBefore.rechecks === 1 && out.queueBefore.newEvents === 0
        && out.queueBefore.currentProposals === 0 && task().preparation.coverage.version === 2
        && PROPOSTA.currentContext(task()) && aiHits === 2, out);
  }
  reset(); await generate();
  revise(t => { delete t.preparation.coverage.version; t.preparation.version = 1;
    t.preparation.approval = { at: stamp(NOW), actionId: 'approved-receipt' }; });
  const approvedBefore = JSON.stringify(task().preparation);
  ok('approvazione precedente resta consultabile con lo stesso evento', PROPOSTA.currentContext(task()));
  out = await tick();
  ok('aggiornare la memoria non rigenera proposte già approvate e non modifica ricevute',
    out.prepared === 0 && out.checked === 0 && out.queue.currentProposals === 1 && aiHits === 1
      && JSON.stringify(task().preparation) === approvedBefore, out);
  const closedApproved = structuredClone(task()); closedApproved.status = 'done';
  ok('una ricevuta approvata non rende corrente un caso chiuso', !PROPOSTA.currentContext(closedApproved));
  revise(t => { t.followUp.lastMessageId = 'new-after-approval'; });
  save('messages/new-after-approval', { ...DB.get('messages/m1'), at: stamp(NOW) });
  ok('approvazione del vecchio messaggio non rende pronta la proposta per un nuovo evento', !PROPOSTA.currentContext(task()));
  out = await tick();
  ok('nuovo evento resta da preparare e ricevuta irrisolta viene preservata',
    out.queue.currentProposals === 0 && out.queue.newEvents === 1 && out.prepared === 0
      && out.error === 'previous_delivery_unresolved' && aiHits === 1
      && JSON.stringify(task().preparation) === approvedBefore, out);
  save('action_queue/approved-receipt', { status: 'executed', payload: { channel: 'whatsapp' }, waSentAt: stamp(NOW) });
  clock = NOW + 600001; out = await tick();
  ok('ricevuta conclusa consente preparazione del nuovo evento senza ereditare approvazione',
    out.prepared === 1 && out.queueBefore.newEvents === 1 && aiHits === 2
      && task().preparation.messageId === 'new-after-approval' && !task().preparation.approval
      && PROPOSTA.currentContext(task()), out);

  reset(); const generated = await generate();
  const savedPreparation = structuredClone(generated.preparation);
  revise(t => { delete t.preparation; });
  readHook = async path => {
    if (path !== 'operatorTasks/' + ID) return;
    readHook = null; revise(t => { t.preparation = savedPreparation; });
  };
  out = await tick();
  ok('preparazione concorrente trovata in cache viene contata come cached, mai come nuova',
    out.checked === 1 && out.cached === 1 && out.prepared === 0 && out.remaining === 0 && aiHits === 1, out);

  reset(); save('heartbeat/segretaria-preparations-2026-09-15', { count: 500 });
  out = await tick();
  ok('vecchio cap esaurito non ferma preparazioni continue né azzera il contatore',
    out.prepared === 1 && out.checked === 1 && out.stoppedBy !== 'daily_cap'
      && aiHits === 1 && count() >= 500 && DB.get('settings/segretaria').dailyCap === 5, out);
  reset(); addCase(1, NOW - 2000); addCase(2, NOW - 1000); addCase(3, NOW - 3000);
  save('heartbeat/segretaria-preparations-2026-09-15', { count: 500 });
  out = await tick();
  ok('batch resta tre per durata tecnica, indipendentemente dal vecchio cap',
    out.prepared === 3 && out.checked === 3 && out.stoppedBy === 'batch_limit' && out.remaining === 1, out);

  reset(); addCase(1, NOW - 2000); listDelayMs = 30000;
  out = await tick();
  ok('budget include lettura della coda: 30s consumati impediscono la prima chiamata',
    out.checked === 0 && out.stoppedBy === 'time_budget' && out.remaining === 2 && aiHits === 0, out);
  reset(); addCase(1, NOW - 2000); aiHook = async () => { clock += 19000; };
  out = await tick();
  ok('budget condiviso impedisce seconda chiamata quando non resta il suo costo massimo',
    out.checked === 1 && out.prepared === 1 && out.stoppedBy === 'time_budget' && aiHits === 1, out);

  reset();
  revise(t => { t.preparationRetry = retryMarker(stamp(NOW + 600000)); });
  out = await tick();
  ok('backoff resta visibile nel backlog ma non viene speso',
    out.queue.pending === 1 && out.queue.retrying === 1 && out.queue.eligible === 0
      && out.checked === 0 && aiHits === 0 && out.remaining === 1, out);
  revise(t => { t.followUp.lastMessageId = 'newer'; });
  save('messages/newer', { ...DB.get('messages/m1'), at: stamp(NOW) });
  out = await tick();
  ok('nuovo evento sfugge subito al backoff del precedente',
    out.prepared === 1 && out.queue.retrying === 0 && !task().preparationRetry, out);

  reset();
  revise(t => { t.preparationRetry = retryMarker(stamp(NOW + 3600000)); });
  revise(t => { t.followUp.nextAction = 'Controllare le indicazioni aggiornate.'; });
  out = await tick();
  ok('decisione umana cambiata riapre il retry anche sullo stesso messaggio',
    out.prepared === 1 && aiHits === 1 && task().preparationRetry === null, out);

  reset(); aiHook = async () => { throw new Error('fixture_temporary_outage'); };
  const retryDelays = [];
  for (let attempt = 0; attempt < 7; attempt++) {
    out = await tick();
    const marker = task().preparationRetry;
    retryDelays.push((Date.parse(marker.after) - clock) / 60000);
    ok('retry temporaneo conserva chiave, motivo e prossimo tentativo: ' + (attempt + 1),
      marker.state === 'retry_wait' && marker.attempts === attempt + 1 && marker.version === PROPOSTA.VERSION
        && marker.messageId === task().followUp.lastMessageId
        && marker.followUpFingerprint === followUpDecisionHash(task().followUp)
        && out.queue.retrying === 1 && out.queue.retryReasons.preparation_unavailable === 1
        && out.queue.nextRetryAt === marker.after, out);
    clock = Date.parse(marker.after);
  }
  ok('backoff transitorio scala1/5/15/60/360min e resta ripetibile a360, senza rinuncia definitiva',
    JSON.stringify(retryDelays) === '[1,5,15,60,360,360,360]' && aiHits === 7, retryDelays);

  reset(); aiBuilder = () => ({}); out = await tick();
  const reviewMarker = structuredClone(task().preparationRetry);
  ok('errore422 deterministico appare da verificare e non resta in tentativi automatici',
    out.code === 422 && reviewMarker.state === 'review_required' && reviewMarker.after === null
      && out.queue.awaitingReview === 1 && out.queue.pending === 0 && out.queue.retrying === 0
      && out.queue.retryReasons.invalid_preparation === 1, out);
  clock = NOW + 86400000; out = await tick();
  ok('stessa422 non viene ritentata con il solo trascorrere del tempo',
    out.checked === 0 && aiHits === 1 && out.queue.awaitingReview === 1, out);
  aiBuilder = null;
  revise(t => { t.preparationRetry.version = PROPOSTA.VERSION - 1; });
  out = await tick();
  ok('nuova versione riapre un rifiuto deterministico precedente senza ereditare retry',
    out.prepared === 1 && aiHits === 2 && task().preparationRetry === null && out.queue.awaitingReview === 0, out);

  reset(); aiBuilder = () => ({}); await tick(); aiBuilder = null;
  revise(t => { t.followUp.lastMessageId = 'corrected_after_rejection'; });
  save('messages/corrected_after_rejection', { ...DB.get('messages/m1'), at: stamp(NOW) });
  out = await tick();
  ok('nuovo evento riapre una422 da verificare', out.prepared === 1 && aiHits === 2 && out.queue.awaitingReview === 0, out);
  reset(); aiBuilder = () => ({}); await tick(); aiBuilder = null;
  revise(t => { t.followUp.nextAction = 'Verificare la nuova decisione.'; });
  out = await tick();
  ok('nuova decisione riapre una422 sullo stesso evento', out.prepared === 1 && aiHits === 2 && out.queue.awaitingReview === 0, out);

  reset(); await generate();
  revise(t => { t.preparation.status = 'needs_context'; t.preparation.version = PROPOSTA.VERSION - 1;
    delete t.preparation.coverage; });
  const manualReviewBefore = JSON.stringify(task().preparation);
  clock = NOW + 86400000; out = await tick();
  ok('needs_context resta da verificare con stessa sorgente e decisione oltre versione e scadenza',
    out.checked === 0 && aiHits === 1 && out.queue.awaitingReview === 1 && out.queue.currentProposals === 0
      && JSON.stringify(task().preparation) === manualReviewBefore, out);
  revise(t => { t.followUp.nextAction = 'Correggere la decisione sulla fonte.'; });
  out = await tick();
  ok('decisione cambiata rende nuovamente preparabile il caso needs_context',
    out.prepared === 1 && aiHits === 2 && out.queue.awaitingReview === 0, out);

  reset(); aiHook = async () => {
    revise(t => { t.followUp.lastMessageId = 'during-model'; });
    save('messages/during-model', { ...DB.get('messages/m1'), at: stamp(NOW) });
  };
  out = await tick();
  ok('evento cambiato durante il modello non riceve proposta o retry del vecchio',
    out.prepared === 0 && !task().preparation && !task().preparationRetry
      && !task().preparationCheckedAt, out);

  reset(); aiHook = async () => { revise(t => { t.followUp.nextAction = 'Decisione cambiata durante la lettura.'; }); };
  out = await tick();
  ok('decisione cambiata durante modello non riceve retry legato alla decisione vecchia',
    out.prepared === 0 && !task().preparationRetry && !task().preparationCheckedAt, out);

  reset(); save('heartbeat/segretaria-preparer', { schedulerCursor: 0, queueScanCursor: null }); aiHook = async () => {
    save('heartbeat/segretaria-preparer', { schedulerCursor: 2, queueScanCursor: ID2, concurrentProof: true });
  };
  out = await tick();
  ok('CAS heartbeat non sovrascrive cursori di un run concorrente',
    out.prepared === 1 && out.schedulerDegraded === true && heartbeat().queueScanCursor === ID2
      && heartbeat().schedulerCursor === 2 && heartbeat().concurrentProof === true, out);

  reset(); addCase(1, NOW - 2000);
  save('heartbeat/segretaria-preparer', { schedulerCursor: 1, queueScanCursor: ID });
  readHook = async path => { if (path === 'heartbeat/segretaria-preparer') throw new Error('fixture_monitor_unavailable'); };
  out = await tick();
  ok('heartbeat illeggibile lascia intatto il cursore senza saltare o ricominciare la scansione',
    out.httpCode === 503 && aiHits === 0 && heartbeat().schedulerCursor === 1
      && heartbeat().queueScanCursor === ID && !queryReads.some(q => q.from[0].collectionId === 'operatorTasks'), out);

  reset(); aiHook = async () => { throw new Error('fixture_ai_failure'); };
  out = await tick();
  ok('errore del modello resta dichiarato nel run che lo osserva',
    out.error === 'preparation_unavailable' && heartbeat().error === 'preparation_unavailable', out);
  out = await tick();
  ok('run idle pulisce ultimo esito precedente nel heartbeat senza nascondere il caso in retry',
    out.checked === 0 && out.queue.retrying === 1 && heartbeat().error === null && heartbeat().code === null
      && heartbeat().id === null && heartbeat().errors.length === 0, heartbeat());

  reset();
  const concurrent = await Promise.all([tick(), tick()]);
  ok('due worker simultanei riusano lease e contatore: una sola spesa per lo stesso evento',
    concurrent.every(r => r.httpCode === 200) && aiHits === 1 && count() === 1 && !!task().preparation
      && untouched(), concurrent);

  reset();
  for (let n = 1; n < 205; n++) addCase(n, NOW - n * 1000);
  listDelayMs = 30000; out = await tick();
  const firstCursor = heartbeat().queueScanCursor;
  ok('oltre200: prima pagina limitata dichiarata, cursore salvato anche senza budget modello',
    out.incomplete === true && out.queue.scope === 'page' && out.queue.openCases === 200
      && out.queue.pending === 200 && aiHits === 0 && !!firstCursor, out);
  // A fresh endpoint invocation has no process-local cursor; resume the saved heartbeat.
  clock = NOW + 60000; listDelayMs = 30000; out = await tick();
  const scans = queryReads.filter(q => q.from[0].collectionId === 'operatorTasks');
  ok('scansione ripresa oltre200 dopo nuovo run, senza perdere la coda finale',
    out.queue.openCases === 5 && out.queue.scope === 'page' && out.incomplete === true
      && heartbeat().queueScanCursor === null
      && scans[1].startAt.values[0].referenceValue.endsWith('/' + firstCursor), out);
  clock = NOW + 120000; listDelayMs = 30000; out = await tick();
  ok('fine scansione torna alla prima pagina senza memoria locale aggiuntiva',
    out.queue.openCases === 200 && heartbeat().queueScanCursor === firstCursor, out);
  reset();
  for (let n = 1; n < 202; n++) addCase(n, NOW - n * 1000);
  for (const [path, row] of rows('operatorTasks')) {
    if (path.endsWith('/' + ID)) continue;
    row.preparationRetry = { messageId: row.followUp.lastMessageId, followUpFingerprint: followUpDecisionHash(row.followUp),
      version: PROPOSTA.VERSION, state: 'review_required', attempts: 1, reason: 'invalid_preparation', after: null };
    save(path, row);
  }
  out = await tick();
  ok('pagina interamente in review avanza il cursore senza spesa',
    out.checked === 0 && out.queue.awaitingReview === 200 && !!heartbeat().queueScanCursor && aiHits === 0, out);
  out = await tick();
  ok('il caso dopo una pagina senza candidati resta raggiungibile al prossimo cron',
    out.prepared === 1 && out.id === ID && heartbeat().queueScanCursor === null && aiHits === 1, out);
  for (const pages of [2, 3]) {
    reset();
    // One short final page makes exactly 2 or 3 scans, without an extra empty page.
    for (let n = 1; n < pages * 200 - 1; n++) addCase(n, NOW - n * 1000);
    const oldest = 'sg_' + (1).toString(16).padStart(32, '0');
    revise(t => { t.followUp.lastInboundAt = stamp(NOW - 7 * 86400000); }, oldest);
    aiHook = async () => { clock += 19000; };
    const selected = [];
    for (let n = 0; n < pages * 3 && !task(oldest).preparation; n++) {
      clock = NOW + n * 60000;
      // Fresh work on page one must not starve its oldest case.
      if (n % pages === 0) {
        const id = 'sg_' + (199).toString(16).padStart(32, '0'), event = 'sweep_new_' + n;
        revise(t => { t.followUp.lastMessageId = event; t.followUp.lastInboundAt = stamp(clock - 1000); }, id);
        save('messages/' + event, { ...DB.get('messages/m1'), at: stamp(clock - 1000) });
      }
      out = await tick(); selected.push(out.results[0]?.id);
    }
    ok('equità composta con scansione ' + pages + ' pagine e1tentativo lento raggiunge il vecchio entro3giri',
      !!task(oldest).preparation && selected.includes(oldest) && selected.length <= pages * 3, selected);
  }
  reset(); save('heartbeat/segretaria-preparer', { schedulerCursor: 2, queueScanCursor: ID2 });
  failingCollection = 'operatorTasks'; out = await tick();
  ok('errore lettura pagina conserva cursore e non spende sul modello',
    out.httpCode === 503 && heartbeat().queueScanCursor === ID2 && heartbeat().schedulerCursor === 2 && aiHits === 0, out);

  reset(); save('settings/segretaria', { enabled: true, prepareCases: false });
  out = await tick();
  ok('kill switch lascia spento il worker senza letture casi, modello o scritture',
    out.enabled === false && !aiHits && !writes.length && !reads.some(p => p.startsWith('operatorTasks/')), out);
  reset(); out = await endpoint(workerEndpoint, { method: 'GET', token: 'wrong-cron' });
  ok('cron non autenticato non accede ai dati', out.httpCode === 401 && !reads.length && !writes.length && !aiHits, out);
  out = await endpoint(workerEndpoint, { method: 'POST', token: 'fixture-cron' });
  ok('metodo diverso da GET rifiutato senza effetti', out.httpCode === 405 && !writes.length, out);
  ok('tutte le prove scrivono solo casi e heartbeat, senza invii o altri effetti',
    allWrites.every(w => /^(operatorTasks|heartbeat)\//.test(w.path)) && untouched(), allWrites.map(w => w.path));
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const priorityCode = readFileSync(new URL('../../js/segretaria-priority-engine.js', import.meta.url), 'utf8');
  const sandbox = { window: { BOOM_PROPOSTA: PROPOSTA }, Date };
  vm.runInNewContext(priorityCode, sandbox);
  const priority = sandbox.window.BOOM_SEGRETARIA_PRIORITY;
  reset();
  const fingerprint = followUpDecisionHash(task().followUp);
  revise(t => { t.preparationRetry = retryMarker(stamp(NOW + 60000)); });
  ok('motore UMD condivide attualità retry e politica senza crypto o accessi browser',
    priority.retryCurrent(task(), { decisionFingerprint: fingerprint })?.state === 'retry_wait'
      && priority.retryDelayMinutes(7) === 360 && priority.retryCurrent(task(), { decisionFingerprint: 'changed' }) === null);
  const malformed = structuredClone(task()); delete malformed.followUp.lastMessageId; delete malformed.preparationRetry.messageId;
  ok('nessun evento o decisione mancanti possono attestare un retry corrente',
    priority.retryCurrent(malformed, { decisionFingerprint: fingerprint }) === null
      && priority.retryCurrent(task()) === null);
  const candidates = [{ task: { ...task(), id: ID }, reason: 'event' }], candidatesBefore = JSON.stringify(candidates);
  ok('scelta priorità pura non modifica i candidati del chiamante',
    priority.chooseNext(candidates, 0, NOW).id === ID && JSON.stringify(candidates) === candidatesBefore);
  const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  ok('cron ogni minuto, limite funzione 60s invariato', vercel.crons.some(c => c.path === '/api/segretaria/worker' && c.schedule === '* * * * *')
    && vercel.functions['api/segretaria/worker.js'].maxDuration === 60);

  if (!process.env.BOOM_WORKER_MUTANT && !fails) {
    const fs = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { spawnSync } = await import('node:child_process');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const mutants = [
      { name: 'priorità agli eventi nuovi', file: 'js/segretaria-priority-engine.js', from: 'priority(a) - priority(b)', to: 'priority(b) - priority(a)' },
      { name: 'equità fra run lenti', file: 'js/segretaria-priority-engine.js', from: 'cursor === 2', to: 'false' },
      { name: 'batch limitato a tre', from: 'const MAX_CASES = 3;', to: 'const MAX_CASES = 4;' },
      { name: 'cache distinta da proposta nuova', from: 'if (result.cached) cached++; else prepared++;', to: 'prepared++;' },
      { name: 'lease concorrente non invalida il proprietario', from: "if (result.error === 'preparation_in_progress') { observationsIncomplete = true; continue; }", to: '/* retry concorrente non protetto */' },
      { name: 'evento nuovo non eredita retry del vecchio', from: 'cur.data.followUp.lastMessageId === next.followUp.lastMessageId && decisionHash(cur.data) === inputHash', to: 'true' },
      { name: 'idle cancella esito precedente', from: 'let last = { id: null, code: null, error: null }', to: 'let last = null' },
      { name: 'aggiornamento contesto delle proposte non approvate',
        from: 'PROPOSTA.currentContext(task)', to: 'PROPOSTA.current(task)' },
      { name: 'guardia condivisa della versione contesto', file: 'js/segretaria-proposta-engine.js',
        from: "&& (!!task.preparation.approval || task.preparation.coverage?.version === CONTEXT_VERSION || task.preparation.status === 'needs_context')", to: '' },
      { name: 'contesto corrente richiede proposta ancora valida', file: 'js/segretaria-proposta-engine.js',
        from: 'function currentContext(task) { return current(task)',
        to: 'function currentContext(task) { return true' },
      { name: 'approvazione preservata nel cambio contesto', file: 'js/segretaria-proposta-engine.js',
        from: '!!task.preparation.approval || task.preparation.coverage?.version === CONTEXT_VERSION',
        to: 'task.preparation.coverage?.version === CONTEXT_VERSION' },
      { name: 'approvazione vincolata allo stesso evento', file: 'js/segretaria-proposta-engine.js',
        from: 'function currentContext(task) { return current(task)',
        to: 'function currentContext(task) { return (current(task) || !!task?.preparation?.approval)' },
      { name: 'retry legato alla decisione attuale', file: 'js/segretaria-priority-engine.js',
        from: 'retry.followUpFingerprint === decisionFingerprint', to: 'true' },
      { name: 'retry deterministico legato alla versione', file: 'js/segretaria-priority-engine.js',
        from: 'retry.version === version', to: 'true' },
      { name: 'backoff cresce dopo gli errori temporanei', file: 'js/segretaria-priority-engine.js',
        from: 'RETRY_MINUTES[Math.min(count - 1, RETRY_MINUTES.length - 1)]', to: 'RETRY_MINUTES[0]' },
      { name: '422 richiede review senza ripetizione identica',
        from: "state: result.code === 422 ? 'review_required' : 'retry_wait'", to: "state: 'retry_wait'" },
      { name: 'review needs_context non è un ricontrollo da spendere',
        from: 'reviewCurrent(task) ? null : !PROPOSTA.current(task)', to: 'false ? null : !PROPOSTA.current(task)' },
      { name: 'scansione riparte dal cursore persistito',
        from: 'const afterId = previous?.queueScanCursor || null;', to: 'const afterId = null;' },
      { name: 'pagina senza candidati conserva avanzamento',
        from: 'queueScanCursor: list.nextCursor || null', to: 'queueScanCursor: null' },
      { name: 'heartbeat concorrente protetto dalla versione',
        from: 'out.heartbeatVersion ? { updateTime: out.heartbeatVersion }', to: 'out.heartbeatVersion ? { exists: true }' },
      { name: 'equità disaccoppiata dal numero delle pagine',
        from: 'const fairnessSweep = schedulerSweep === 2;', to: 'const fairnessSweep = false;' },
    ];
    for (const mutant of mutants) {
      const scratch = await fs.mkdtemp(join(tmpdir(), 'boom-worker-mutation-'));
      try {
        await fs.cp(root + 'api', scratch + '/api', { recursive: true });
        await fs.cp(root + 'js', scratch + '/js', { recursive: true });
        await fs.mkdir(scratch + '/tests/segretaria', { recursive: true });
        await fs.cp(root + 'tests/notify', scratch + '/tests/notify', { recursive: true });
        await fs.copyFile(root + 'tests/segretaria/worker.mjs', scratch + '/tests/segretaria/worker.mjs');
        await fs.copyFile(root + 'vercel.json', scratch + '/vercel.json');
        const path = scratch + '/' + (mutant.file || 'api/segretaria/worker.js'), source = await fs.readFile(path, 'utf8');
        if (!source.includes(mutant.from)) throw new Error('mutation_target_missing: ' + mutant.name);
        await fs.writeFile(path, source.replace(mutant.from, mutant.to));
        const run = spawnSync(process.execPath, [scratch + '/tests/segretaria/worker.mjs'], {
          encoding: 'utf8', timeout: 30000, env: { ...process.env, BOOM_WORKER_MUTANT: '1' },
        });
        ok('mutazione intercettata: ' + mutant.name, run.status !== 0 && /^FAIL /m.test(run.stdout),
          run.status === 0 ? 'mutation survived' : run.stderr.slice(0, 200));
      } finally { await fs.rm(scratch, { recursive: true, force: true }); }
    }
  }
} finally { Date.now = realNow; }
console.log(`\nWorker: ${checks - fails}/${checks} PASS`);
if (fails) process.exitCode = 1;
