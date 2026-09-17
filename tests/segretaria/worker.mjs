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
const aiInputs = [], aiRequests = [];
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
      String(field(a[1], sort.field.fieldPath)).localeCompare(String(field(b[1], sort.field.fieldPath))) * (sort.direction === 'DESCENDING' ? -1 : 1));
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
    nextAction: { text: 'Verificare la disponibilità del tecnico', waitingOn: 'collaborator', waitingLabel: 'Tecnico',
      checkAt: stamp(Date.parse(input.now) + 3600000), practiceRef: input.existingFollowUp.practiceRef || null,
      sourceIds: ids, reason: 'La richiesta attende una disponibilità confermata.' },
    draft: { channel: input.channel, text: input.language === 'it'
      ? 'Ricevuto, verifichiamo la disponibilità e ti aggiorniamo.' : 'Thanks, we will check availability and update you.', sourceIds: ids },
    handoff: { needed: false, reason: 'La richiesta può essere preparata per la verifica.', sourceIds: ids } };
}
function reset({ role = 'tenant', text = 'Potete aggiornarmi sulla disponibilità del tecnico?' } = {}) {
  DB.clear(); versions.clear(); writes.length = 0; network.length = 0; reads.length = 0; globalThis.__mails.length = 0;
  aiInputs.length = 0; aiRequests.length = 0; aiHits = 0; aiHook = null; aiBuilder = null;
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
    heartbeat().queue.openCases === 4 && heartbeat().queue.pending === 4 && heartbeat().queue.newEvents === 4
      && heartbeat().queue.currentProposals === 0 && heartbeat().queue.retrying === 0
      && heartbeat().remaining === 1 && heartbeat().stoppedBy === 'batch_limit', heartbeat());
  out = await tick();
  ok('il giro successivo prepara soltanto il residuo e conta le tre proposte già correnti',
    out.prepared === 1 && out.id === middle && out.queue.currentProposals === 3 && out.remaining === 0
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
    out.results[0].id === fresh && out.results[1].id === ID && out.queue.newEvents === 1
      && out.queue.rechecks === 1 && out.prepared === 2, out);
  out = await tick();
  ok('recheckFor impedisce nuova spesa per lo stesso ricontrollo già preparato',
    out.prepared === 0 && out.checked === 0 && aiHits === 3, out);

  reset(); await generate();
  ok('contesto corrente è pronto nella regola condivisa fra home e worker',
    PROPOSTA.currentContext(task()) && task().preparation.coverage.version === CONTEXT_VERSION
      && PROPOSTA.CONTEXT_VERSION === 2 && CONTEXT_VERSION === 2);
  const oldSchema = structuredClone(task()); oldSchema.preparation.version = 1;
  ok('contesto corrente non promuove una proposta con schema precedente non approvato', !PROPOSTA.currentContext(oldSchema));
  const closedCurrent = structuredClone(task()); closedCurrent.status = 'done';
  ok('contesto corrente non promuove una proposta su un caso chiuso', !PROPOSTA.currentContext(closedCurrent));
  out = await tick();
  ok('proposta con contesto corrente non viene rigenerata',
    out.prepared === 0 && out.checked === 0 && out.queue.currentProposals === 1 && aiHits === 1, out);
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
      out.prepared === 1 && out.queue.rechecks === 1 && out.queue.newEvents === 0
        && out.queue.currentProposals === 0 && task().preparation.coverage.version === 2
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
    out.prepared === 1 && out.queue.newEvents === 1 && aiHits === 2
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

  reset(); save('heartbeat/segretaria-preparations-2026-09-15', { count: 5 });
  out = await tick();
  ok('cap giornaliero dichiarato senza spesa, lease o rinvio dieci minuti del caso',
    out.prepared === 0 && out.checked === 1 && out.stoppedBy === 'daily_cap' && out.remaining === 1
      && aiHits === 0 && count() === 5 && !task().preparationRetry && !task().preparationCheckedAt
      && !rows('heartbeat').some(([p]) => p.includes('segretaria-preparing-')), out);
  clock = NOW + 86400000; out = await tick();
  ok('il giorno dopo il caso è subito eleggibile senza modificare il limite configurato',
    out.prepared === 1 && aiHits === 1 && DB.get('settings/segretaria').dailyCap === 5, out);

  reset(); addCase(1, NOW - 2000); addCase(2, NOW - 1000);
  save('heartbeat/segretaria-preparations-2026-09-15', { count: 4 });
  out = await tick();
  ok('batch si arresta al limite esistente anche se restano candidati',
    out.prepared === 1 && out.checked === 2 && out.stoppedBy === 'daily_cap'
      && aiHits === 1 && count() === 5 && out.remaining === 2, out);

  reset(); addCase(1, NOW - 2000); listDelayMs = 30000;
  out = await tick();
  ok('budget include lettura della coda: 30s consumati impediscono la prima chiamata',
    out.checked === 0 && out.stoppedBy === 'time_budget' && out.remaining === 2 && aiHits === 0, out);
  reset(); addCase(1, NOW - 2000); aiHook = async () => { clock += 19000; };
  out = await tick();
  ok('budget condiviso impedisce seconda chiamata quando non resta il suo costo massimo',
    out.checked === 1 && out.prepared === 1 && out.stoppedBy === 'time_budget' && aiHits === 1, out);

  reset();
  revise(t => { t.preparationRetry = { messageId: 'm1', after: stamp(NOW + 600000) }; });
  out = await tick();
  ok('backoff resta visibile nel backlog ma non viene speso',
    out.queue.pending === 1 && out.queue.retrying === 1 && out.queue.eligible === 0
      && out.checked === 0 && aiHits === 0 && out.remaining === 1, out);
  revise(t => { t.followUp.lastMessageId = 'newer'; });
  save('messages/newer', { ...DB.get('messages/m1'), at: stamp(NOW) });
  out = await tick();
  ok('nuovo evento sfugge subito al backoff del precedente',
    out.prepared === 1 && out.queue.retrying === 0 && !task().preparationRetry, out);

  reset(); aiHook = async () => {
    revise(t => { t.followUp.lastMessageId = 'during-model'; });
    save('messages/during-model', { ...DB.get('messages/m1'), at: stamp(NOW) });
  };
  out = await tick();
  ok('evento cambiato durante il modello non riceve proposta o retry del vecchio',
    out.prepared === 0 && !task().preparation && !task().preparationRetry
      && !task().preparationCheckedAt, out);

  reset(); addCase(1, NOW - 2000);
  save('heartbeat/segretaria-preparer', { schedulerCursor: 1 });
  readHook = async path => { if (path === 'heartbeat/segretaria-preparer') throw new Error('fixture_monitor_unavailable'); };
  out = await tick();
  ok('heartbeat illeggibile degrada scheduler esplicitamente senza bloccare né sovrascrivere il cursore',
    out.httpCode === 200 && out.prepared === 2 && out.schedulerDegraded === true
      && !Object.hasOwn(out, 'schedulerCursor') && heartbeat().schedulerCursor === 1
      && out.errors.some(e => e.error === 'preparation_scheduler_unavailable'), out);

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
  for (let n = 1; n < 201; n++) addCase(n, NOW - n * 1000);
  listDelayMs = 30000; out = await tick();
  ok('limite della lettura è dichiarato: i conteggi non fingono una coda completa',
    out.incomplete === true && out.queue.openCases === 200 && out.queue.pending === 200 && aiHits === 0, out);

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
      { name: 'priorità agli eventi nuovi', from: "Number(b.reason === 'event') - Number(a.reason === 'event')", to: "Number(a.reason === 'event') - Number(b.reason === 'event')" },
      { name: 'equità fra run lenti', from: 'cursor === 2', to: 'false' },
      { name: 'batch limitato a tre', from: 'const MAX_CASES = 3;', to: 'const MAX_CASES = 4;' },
      { name: 'cache distinta da proposta nuova', from: 'if (result.cached) cached++; else prepared++;', to: 'prepared++;' },
      { name: 'lease concorrente non invalida il proprietario', from: "if (result.error === 'preparation_in_progress') continue;", to: '/* retry concorrente non protetto */' },
      { name: 'evento nuovo non eredita retry del vecchio', from: 'if (cur?.data.followUp?.lastMessageId === next.followUp.lastMessageId)', to: 'if (cur)' },
      { name: 'idle cancella esito precedente', from: 'let last = { id: null, code: null, error: null }', to: 'let last = null' },
      { name: 'aggiornamento contesto delle proposte non approvate',
        from: 'PROPOSTA.currentContext(task)', to: 'PROPOSTA.current(task)' },
      { name: 'guardia condivisa della versione contesto', file: 'js/segretaria-proposta-engine.js',
        from: '&& (!!task.preparation.approval || task.preparation.coverage?.version === CONTEXT_VERSION)', to: '' },
      { name: 'contesto corrente richiede proposta ancora valida', file: 'js/segretaria-proposta-engine.js',
        from: 'function currentContext(task) { return current(task)',
        to: 'function currentContext(task) { return true' },
      { name: 'approvazione preservata nel cambio contesto', file: 'js/segretaria-proposta-engine.js',
        from: '!!task.preparation.approval || task.preparation.coverage?.version === CONTEXT_VERSION',
        to: 'task.preparation.coverage?.version === CONTEXT_VERSION' },
      { name: 'approvazione vincolata allo stesso evento', file: 'js/segretaria-proposta-engine.js',
        from: 'function currentContext(task) { return current(task)',
        to: 'function currentContext(task) { return (current(task) || !!task?.preparation?.approval)' },
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
