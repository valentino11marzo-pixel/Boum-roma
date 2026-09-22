// Real preparation, context, Persona and endpoints; only network boundaries are fake.
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
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
let sequence = 0, failingCollection = '', beforePatch = null, commitHook = null, queryHook = null;
let aiHits = 0, aiHook = null, aiBuilder = null, failFirstTaskReads = 0, listDelayMs = 0;
const aiInputs = [], aiRequests = [];
const enc = v => v == null ? { nullValue: null }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  : typeof v === 'string' ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = v => 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue
  : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
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
    if (queryHook) await queryHook(q, coll);
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
  if (!opts.method || opts.method === 'GET') reads.push(path);
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

const { default: CALENDAR } = await import('../../js/segretaria-calendar-engine.js');
const { prepareCase } = await import('../../api/segretaria/_prepare.js');
const { captureFollowUp } = await import('../../api/segretaria/_follow-up.js');
const { replyOwner } = await import('../../api/segretaria/_reply-owner.js');
const { claimSegretariaDelivery, canExpireUnclaimedSegretariaDelivery } = await import('../../api/segretaria/_delivery-guard.js');
const { readPreparationDelivery } = await import('../../api/segretaria/_dispatch.js');
const { default: prepareEndpoint } = await import('../../api/segretaria/prepare.js');
const { default: followUpEndpoint } = await import('../../api/segretaria/follow-up.js');
const { default: workerEndpoint, prepareNextCase } = await import('../../api/segretaria/worker.js');
const { personaDossier } = await import('../../api/segretaria/_persona.js');
const { loadCaseContext } = await import('../../api/segretaria/_context.js');
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
      checkAt: stamp(Date.parse(input.now) + 3600000), checkLocal: CALENDAR.romeLocalInstant(stamp(Date.parse(input.now) + 3600000)), practiceRef: input.existingFollowUp.practiceRef || null,
      sourceIds: ids, reason: 'La richiesta attende una disponibilità confermata.' },
    draft: { channel: input.channel, text: input.language === 'it'
      ? 'Ricevuto, verifichiamo la disponibilità e ti aggiorniamo.' : 'Thanks, we will check availability and update you.', sourceIds: ids },
    handoff: { needed: false, reason: 'La richiesta può essere preparata per la verifica.', sourceIds: ids } };
}
function reset({ role = 'tenant', text = 'Potete aggiornarmi sulla disponibilità del tecnico?' } = {}) {
  DB.clear(); versions.clear(); writes.length = 0; network.length = 0; reads.length = 0; globalThis.__mails.length = 0;
  aiInputs.length = 0; aiRequests.length = 0; aiHits = 0; aiHook = null; aiBuilder = null;
  sequence = 0; clock = NOW; failFirstTaskReads = 0; listDelayMs = 0; failingCollection = ''; beforePatch = null; commitHook = null; queryHook = null;
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
async function approvedDelivery({ futureCheck = false } = {}) {
  reset();
  if (futureCheck) aiBuilder = input => {
    const p = validProposal(input), checkAt = stamp(NOW + 100 * 3600000);
    p.nextAction.checkAt = checkAt; p.nextAction.checkLocal = CALENDAR.romeLocalInstant(checkAt);
    return p;
  };
  await generate();
  const response = await endpoint(prepareEndpoint, { body: { op: 'approve', id: ID,
    revision: task().preparation.revision, lastMessageId: 'm1' } });
  if (!response.actionId || response.delivery !== 'queued') throw new Error('expiry_fixture_not_queued: ' + JSON.stringify(response));
  const actionId = response.actionId;
  // Executor uses new Date(); this harness controls Date.now(), so align its timestamp.
  save('action_queue/' + actionId, { ...DB.get('action_queue/' + actionId), executedAt: stamp(NOW) });
  aiBuilder = null;
  return actionId;
}
async function closedDeliveryNextCase({ conversationId = CID, age = 49 * 3600000 } = {}) {
  const actionId = await approvedDelivery();
  const closed = await endpoint(followUpEndpoint, { body: { op: 'close', id: ID, lastMessageId: 'm1', outcome: 'Caso risolto internamente.' } });
  if (!closed.closed) throw new Error('fixture_close_failed');
  clock = NOW + age;
  if (conversationId !== CID) save('conversations/' + conversationId, structuredClone(DB.get('conversations/' + CID)));
  const text = 'Potete aggiornarmi sulla disponibilità del tecnico?';
  save('messages/m2', { conversationId, direction: 'in', channel: 'whatsapp', body: text, at: stamp(clock) });
  const next = await captureFollowUp({ cid: conversationId, conv: DB.get('conversations/' + conversationId), messageId: 'm2', text, now: clock });
  // Explicitly select the existing verified practice for the synthetic new case.
  revise(t => { t.followUp.practiceRef = 'contracts/cA'; }, next.id);
  return { actionId, id: next.id };
}
async function endpoint(handler, { method = 'POST', token = 'admin', body = {}, headers = {}, query = {} } = {}) {
  let code, out;
  await handler({ method, body, query, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers } }, {
    status(n) { code = n; return this; }, json(v) { out = v; return this; }, setHeader() {}, end() {},
  });
  return { httpCode: code, ...out };
}
function addSecond() {
  const t = structuredClone(task()); t.followUp.checkAt = stamp(NOW + 120000);
  save('operatorTasks/' + ID2, t);
}

try {
  reset();
  let r = await endpoint(prepareEndpoint, { body: { op: 'generate', id: ID, actor: 'forged' } });
  ok('tenant: handler reale prepara pratica, responsabile e ricontrollo senza consegna preventiva', r.httpCode === 200
    && r.preparation.nextAction.practiceRef === 'contracts/cA' && r.preparation.nextAction.waitingOn === 'collaborator'
    && r.preparation.preparedBy === 'admin' && aiInputs[0].persona.roles.includes('tenant') && !DB.get('conversations/' + CID).segretaria, r);
  // Il recinto delle scritture ammesse: casi, battiti e — dal 22/09/2026 — il
  // contatore della Centrale AI (aiUsage/<giorno>), che ogni chiamata a un
  // modello scrive per costruzione. Tutto il resto resta vietato.
  ok('preparare non scrive coda, messaggi o notifiche, e non invia email/WhatsApp', untouched()
    && rows('messages').length === 1 && writes.every(w => /^(operatorTasks|heartbeat|aiUsage)\//.test(w.path)));
  ok('il modello vede capacità reali: proposta e seguito, nessun incarico, prenotazione, chiamata o invio già eseguito',
    aiInputs[0].executionCapabilities?.assignCollaborator === false
    && aiInputs[0].executionCapabilities?.bookMaintenance === false
    && aiInputs[0].executionCapabilities?.callPerson === false
    && aiInputs[0].executionCapabilities?.sendDuringPreparation === false
    && aiInputs[0].executionCapabilities?.afterApproval.join(',') === 'record_follow_up,queue_shown_draft'
    && aiInputs[0].executionCapabilities?.automaticRecheck === true
    && !aiRequests[0].tools && !aiRequests[0].tool_choice && untouched());
  ok('proposta conserva fonti e impronte, senza duplicare il testo delle fonti', r.preparation.sources.some(s => s.ref === 'messages/m1')
    && r.preparation.sourceFingerprint && r.preparation.contactFingerprint && r.preparation.sources.every(s => !s.text && s.hash));
  r = await generate();
  ok('stesso caso e stesse fonti restituiscono stessa proposta senza seconda spesa', r.cached && aiHits === 1 && count() === 1);

  for (const delta of [0, 1]) {
    reset(); revise(t => { t.followUp.checkAt = stamp(NOW - 60000); });
    await generate();
    const expired = structuredClone(task().preparation);
    clock = Date.parse(expired.nextAction.checkAt) + delta;
    r = await endpoint(prepareEndpoint, { body: { op: 'generate', id: ID } });
    ok('generate rielabora ready scaduta con stesso recheckFor, soglia ' + delta,
      r.httpCode === 200 && !r.cached && aiHits === 2 && count() === 2
      && r.preparation.revision !== expired.revision && Date.parse(r.preparation.nextAction.checkAt) > clock
      && r.preparation.recheckFor === expired.recheckFor && !r.preparation.approval && untouched(), r);
    const freshRevision = task().preparation.revision;
    r = await generate();
    ok('la proposta rielaborata ancora futura torna in cache, soglia ' + delta,
      r.code === 200 && r.cached && aiHits === 2 && r.preparation.revision === freshRevision && untouched(), r);
  }
  reset(); revise(t => { t.followUp.checkAt = stamp(NOW - 60000); });
  await generate(); revise(t => { t.preparation.status = 'needs_context'; });
  const expiredReview = JSON.stringify(task().preparation);
  clock = Date.parse(task().preparation.nextAction.checkAt);
  r = await generate();
  ok('needs_context scaduta resta in cache senza nuova preparazione o spesa',
    r.code === 200 && r.cached && aiHits === 1 && count() === 1
    && JSON.stringify(task().preparation) === expiredReview && untouched(), r);

  reset(); revise(t => { t.followUp.checkAt = stamp(NOW - 60000); });
  await generate();
  const beforeExpiredFailure = JSON.stringify(task()), beforeFailureWrites = writes.length;
  clock = Date.parse(task().preparation.nextAction.checkAt);
  aiHook = async () => { throw new Error('fixture_expired_preparation_failure'); };
  r = await endpoint(prepareEndpoint, { body: { op: 'generate', id: ID } });
  ok('AI indisponibile durante rielaborazione non altera proposta scaduta o seguito',
    r.httpCode === 503 && r.error === 'preparation_unavailable' && aiHits === 2
    && JSON.stringify(task()) === beforeExpiredFailure && untouched()
    && writes.slice(beforeFailureWrites).every(w => /^(heartbeat|aiUsage)\//.test(w.path)), r);

  for (const [local, reason, error] of [
    [undefined, null, 'calendar_check_local_missing'],
    [{ date: '2026-09-15', time: '11:00', timeZone: 'Europe/Rome' }, null, 'calendar_check_local_mismatch'],
    [{ date: '2026-09-15', time: '13:00', timeZone: 'UTC' }, null, 'calendar_check_local_zone_invalid'],
    [{ date: '2026-09-15', time: '13:00', timeZone: 'Europe/Rome' }, 'Ricontrollare poco dopo la visita.', 'calendar_relative_check_unquantified'],
  ]) {
    reset(); aiBuilder = input => { const p = validProposal(input); p.nextAction.checkLocal = local;
      if (reason) p.nextAction.reason = reason; return p; };
    r = await generate();
    ok('intenzione temporale da verificare: ' + error, r.code === 200 && r.preparation.status === 'needs_context'
      && r.preparation.draft === null && r.preparation.handoff.needed
      && r.preparation.nextAction.checkAt === '2026-09-15T11:00:00.000Z'
      && r.preparation.timingValidation.issues.some(x => x.code === error) && untouched(), r);
    const confirmation = await endpoint(prepareEndpoint, { body: { op: 'approve', id: ID,
      revision: r.preparation.revision, lastMessageId: 'm1' } });
    ok('orario incoerente non approvabile né accodabile: ' + error,
      confirmation.httpCode === 409 && !task().preparation.approval && untouched(), confirmation);
  }
  reset(); r = await generate();
  ok('ora italiana validata e dichiarazione del modello conservate con precisione ISO', r.preparation.timingValidation.ok
    && r.preparation.nextAction.checkLocal.time === '13:00'
    && r.preparation.timingValidation.declaredLocal.time === '13:00'
    && aiInputs[0].calendar.nowLocal.time === '12:00'
    && JSON.stringify(aiRequests[0].system).includes('checkLocal') && untouched(), r.preparation.timingValidation);

  reset(); await generate();
  revise(t => { t.preparation.version = 3; t.preparation.status = 'needs_context'; delete t.preparation.coverage.version; });
  const classifiedReview = JSON.stringify(task().preparation), reviewWrites = writes.length;
  clock = NOW + 60001; r = await generate();
  ok('revisione manuale conservata identica oltre versione, copertura e scadenza con stesse fonti e decisione',
    r.cached && aiHits === 1 && writes.length === reviewWrites && JSON.stringify(task().preparation) === classifiedReview && untouched(), r);
  revise(t => { t.followUp.nextAction = 'Verificare il nuovo dato confermato'; });
  r = await generate();
  ok('decisione nuova riapre revisione precedente sullo stesso evento', r.code === 200 && !r.cached && aiHits === 2
    && r.preparation.version === 4 && r.preparation.status === 'ready' && untouched(), r);
  reset(); await generate(); revise(t => { t.preparation.version = 3; t.preparation.status = 'needs_context'; });
  save('messages/m1', { ...DB.get('messages/m1'), body: 'Potete verificare anche la nuova perdita?' });
  r = await generate();
  ok('fonte corretta sullo stesso evento riapre revisione senza riciclare la vecchia interpretazione',
    r.code === 200 && !r.cached && aiHits === 2 && r.preparation.version === 4 && untouched(), r);

  for (const version of [undefined, 1]) {
    reset(); const original = await generate();
    revise(t => {
      if (version === undefined) delete t.preparation.coverage.version;
      else t.preparation.coverage.version = version;
    });
    r = await generate();
    ok('cache non riusa contesto ' + (version === undefined ? 'senza versione' : 'precedente') + ' anche con impronta fonti identica',
      r.code === 200 && r.cached === false && aiHits === 2 && count() === 2
        && r.preparation.coverage.version === 2
        && r.preparation.sourceFingerprint === original.preparation.sourceFingerprint && untouched(), r);
  }

  for (const version of [1, 2, 3]) {
    reset(); const oldPolicy = await generate();
    revise(t => { t.preparation.version = version; });
    r = await endpoint(prepareEndpoint, { body: { op: 'approve', id: ID, revision: oldPolicy.preparation.revision, lastMessageId: 'm1' } });
    ok('proposta v' + version + ' precedente ai nuovi controlli non può essere approvata né accodata', r.httpCode === 409
      && r.error === 'preparation_policy_changed' && !task().preparation.approval && untouched(), r);
    r = await generate();
    ok('proposta v' + version + ' obsoleta viene ricalcolata con stesse fonti ed evento senza una quota giornaliera', r.code === 200
      && !r.cached && aiHits === 2 && count() === 2 && r.preparation.version === 4 && untouched(), r);
  }

  reset({ text: 'Reacted 👍 to Hello, should we speak to Valentino?' });
  save('messages/italian', { conversationId: CID, direction: 'in', body: 'Buongiorno, vorrei organizzare un sopralluogo.', at: stamp(NOW - 60000) });
  save('messages/outEnglish', { conversationId: CID, direction: 'out', body: 'Hello, could you please confirm?', at: stamp(NOW - 20000) });
  r = await generate();
  ok('lingua dalla frase del contatto: reazione e testo inglese dell’operatore non sostituiscono l’italiano',
    r.code === 200 && aiInputs[0].language === 'it' && r.preparation.language.sourceId === 'messages/italian'
    && r.preparation.draft?.text.startsWith('Ricevuto') && !aiInputs[0].humanRequested && untouched(), r);
  reset({ text: 'Reacted 👍 to Thanks for the update.' });
  save('messages/italian', { conversationId: CID, direction: 'in', body: 'Buongiorno, vorrei organizzare un sopralluogo.', at: stamp(NOW - 120000) });
  save('messages/english', { conversationId: CID, direction: 'in', body: 'Hello, could you please continue in English?', at: stamp(NOW - 60000) });
  r = await generate();
  ok('un cambio di lingua reale del contatto prevale sulla storia precedente', r.code === 200
    && r.preparation.language.code === 'en' && r.preparation.language.sourceId === 'messages/english' && !!r.preparation.draft && untouched(), r);
  reset({ text: '👍' }); r = await generate();
  ok('sola reazione senza lingua verificabile conserva seguito interno e nessuna bozza', r.code === 200
    && r.preparation.language.basis === 'unverified' && r.preparation.draft === null && untouched(), r);
  reset(); aiBuilder = input => { const p = validProposal(input); p.draft.text = 'Hello, thanks for the update. Could you please confirm?'; return p; };
  r = await generate();
  ok('risposta inglese su fonti italiane rifiutata prima di salvare la proposta', r.code === 422
    && r.error === 'draft_language_mismatch' && !task().preparation && untouched(), r);

  reset({ text: 'Venerdì pomeriggio dovrei esserci.' });
  aiBuilder = input => { const p = validProposal(input); p.commitments[0].kind = 'explicit'; return p; };
  r = await generate();
  ok('dovrei esserci non diventa impegno certo grazie a una citazione letterale', r.code === 422
    && r.error === 'commitment_requires_confirmation' && !task().preparation && untouched(), r);
  reset({ text: 'Reacted 👍 to Venerdì pomeriggio dovrei esserci.' });
  aiBuilder = input => { const p = validProposal(input); p.commitments[0].kind = 'explicit'; return p; };
  r = await generate();
  ok('la reazione non conferma l’accordo citato', r.code === 422
    && r.error === 'commitment_requires_confirmation' && !task().preparation && untouched(), r);
  reset({ text: 'Venerdì pomeriggio dovrei esserci.' });
  aiBuilder = input => { const p = validProposal(input); p.commitments[0].status = 'unclear'; p.draft = null;
    p.summary = 'La presenza resta eventuale.'; p.commitments[0].text = 'Presenza possibile, ancora da confermare.'; return p; };
  r = await generate();
  ok('la stessa fonte può produrre una proposta utile che conserva l’incertezza', r.code === 200
    && r.preparation.commitments[0].kind === 'inferred' && r.preparation.commitments[0].status === 'unclear' && untouched(), r);
  reset({ text: 'Confermo la presenza alla visita, grazie.' });
  aiBuilder = input => { const p = validProposal(input); p.commitments[0].kind = 'explicit'; return p; };
  r = await generate();
  ok('una conferma testuale effettiva resta ammessa', r.code === 200
    && r.preparation.commitments[0].kind === 'explicit' && untouched(), r);
  reset({ text: 'Confermo la presenza alla visita. Forse verrò in metro.' });
  aiBuilder = input => { const p = validProposal(input); p.commitments[0].kind = 'explicit';
    p.commitments[0].quote = 'Confermo la presenza alla visita.'; return p; };
  r = await generate();
  ok('la logistica eventuale in una frase separata non invalida un accordo certo', r.code === 200
    && r.preparation.commitments[0].kind === 'explicit' && untouched(), r);
  reset({ text: 'Buongiorno, venerdì dovrei esserci.' });
  aiBuilder = input => { const p = validProposal(input); p.commitments[0].kind = 'explicit';
    p.commitments[0].quote = 'venerdì'; return p; };
  r = await generate();
  ok('citare solo il giorno non elimina il condizionale dalla frase', r.code === 422
    && r.error === 'commitment_requires_confirmation' && !task().preparation && untouched(), r);
  reset({ text: 'Buongiorno, venerdì dovrei esserci.' });
  aiBuilder = input => { const p = validProposal(input); p.commitments[0].status = 'satisfied'; return p; };
  r = await generate();
  ok('inferred non permette di segnare concluso un impegno ancora eventuale', r.code === 422
    && r.error === 'commitment_requires_confirmation' && !task().preparation && untouched(), r);
  reset({ text: 'Reacted 👍 to Venerdì pomeriggio dovrei esserci.' });
  save('messages/request', { conversationId: CID, direction: 'in', body: 'Buongiorno, vorrei organizzare un sopralluogo.', at: stamp(NOW - 120000) });
  save('messages/tentativeOut', { conversationId: CID, direction: 'out', body: 'Venerdì pomeriggio dovrei esserci.', at: stamp(NOW - 60000) });
  aiBuilder = input => { const p = validProposal(input); p.commitments = [{ text: 'Presenza da confermare', kind: 'inferred', status: 'unclear',
    quote: 'Venerdì pomeriggio dovrei esserci.', sourceIds: ['messages/tentativeOut'] }]; return p; };
  r = await generate();
  ok('una disponibilità BOOM ancora eventuale non produce già una bozza di organizzazione al cliente', r.code === 422
    && r.error === 'outgoing_commitment_unconfirmed' && !task().preparation && untouched(), r);
  reset({ text: 'Reacted 👍 to Ti può richiamare Valentino?' });
  save('messages/human', { conversationId: CID, direction: 'in', body: 'Buongiorno, voglio parlare con Valentino.', at: stamp(NOW - 60000) });
  r = await generate();
  ok('una reazione non cancella la precedente richiesta esplicita di parlare con Valentino', r.code === 200
    && aiInputs[0].humanRequested && r.preparation.handoff.needed && !r.preparation.draft
    && r.preparation.nextAction.waitingOn === 'valentino' && untouched(), r);
  reset({ text: '' });
  save('messages/m1', { ...DB.get('messages/m1'), channel: 'phone', source: 'phone',
    callerWords: 'Buongiorno, vorrei parlare con Valentino.' });
  r = await generate();
  ok('parole attribuite al chiamante restano valide anche senza un riepilogo testuale', r.code === 200
    && aiInputs[0].language === 'it' && aiInputs[0].humanRequested && r.preparation.handoff.needed
    && !r.preparation.draft && untouched(), r);

  for (const [summary, checkAt, expectedError] of [
    ['Visita giovedì 6 novembre 2026 alle 11:45.', '2026-11-04T11:00:00Z', 'calendar_weekday_date_conflict'],
    ['Visita giovedì 5 novembre 2026 alle 11:45.', '2026-11-05T11:15:00Z', 'calendar_check_not_before_event'],
    ['Visita giovedì 5 novembre 2026 alle 11:45.', '2026-11-04T11:00:00Z', null],
  ]) {
    reset({ text: 'What about Thursday at 11:45, Rome time?' }); clock = Date.parse('2026-11-04T09:00:00Z');
    save('messages/m1', { ...DB.get('messages/m1'), at: '2026-11-02T10:00:00Z' });
    aiBuilder = input => { const p = validProposal(input); p.summary = summary; p.draft = null;
      p.nextAction = { ...p.nextAction, text: 'Preparare la visita', waitingOn: 'valentino', waitingLabel: 'Valentino',
        checkAt, checkLocal: CALENDAR.romeLocalInstant(checkAt), reason: 'Ricontrollo il giorno prima della visita.' }; return p; };
    r = await generate();
    ok('handler calendario: ' + (expectedError || 'riferimento corretto ammesso'),
      (expectedError ? r.code === 422 && r.error === expectedError && !task().preparation : r.code === 200 && !!task().preparation)
      && aiInputs[0].calendar.references[0].date === '2026-11-05' && untouched(), r);
  }

  reset(); aiBuilder = input => { const p = validProposal(input); p.draft = null;
    p.nextAction.waitingOn = 'valentino'; p.nextAction.waitingLabel = 'Valentino'; return p; };
  const priorDecision = await generate();
  revise(t => { t.followUp.nextAction = 'Attendere i documenti del cliente'; t.followUp.waitingOn = 'client';
    t.followUp.waitingLabel = 'Cliente'; t.followUp.checkAt = stamp(NOW + 2 * 86400000); });
  r = await endpoint(prepareEndpoint, { body: { op: 'approve', id: ID, revision: priorDecision.preparation.revision, lastMessageId: 'm1' } });
  ok('decisione manuale successiva invalida approvazione della vecchia proposta senza sovrascriverla', r.httpCode === 409
    && task().followUp.nextAction === 'Attendere i documenti del cliente' && !task().preparation.approval && untouched(), r);
  r = await generate();
  ok('decisione manuale successiva invalida cache anche con stesso evento, fonti e pratica', r.code === 200 && !r.cached && aiHits === 2
    && r.preparation.followUpFingerprint && r.preparation.followUpFingerprint !== priorDecision.preparation.followUpFingerprint, r);

  reset(); aiBuilder = input => { const p = validProposal(input); p.draft = null;
    p.nextAction.waitingOn = 'valentino'; p.nextAction.waitingLabel = 'Valentino'; return p; };
  const approvedDecision = await generate();
  const approvedResult = await endpoint(prepareEndpoint, { body: { op: 'approve', id: ID,
    revision: approvedDecision.preparation.revision, lastMessageId: 'm1' } });
  r = await generate();
  ok('conferma applica la proposta e la sua impronta post-conferma resta cache valida senza altra spesa',
    approvedResult.httpCode === 200 && r.cached && aiHits === 1 && count() === 1 && untouched(), { approvedResult, cached: r.cached, aiHits });
  for (const version of [undefined, 1]) {
    revise(t => {
      t.preparation.version = 1;
      if (version === undefined) delete t.preparation.coverage.version;
      else t.preparation.coverage.version = version;
    });
    const approvedBefore = JSON.stringify(task().preparation), writeCount = writes.length;
    r = await generate();
    ok('cache conserva approvazione esistente con contesto ' + (version === undefined ? 'senza versione' : 'precedente'),
      r.code === 200 && r.cached === true && aiHits === 1 && count() === 1 && writes.length === writeCount
        && JSON.stringify(task().preparation) === approvedBefore && untouched(), r);
  }

  reset({ role: 'pfs' }); r = await generate();
  ok('PFS: prepara sul dossier reale e sulla pratica PFS senza inviare', r.code === 200
    && aiInputs[0].persona.roles.includes('pfs') && r.preparation.nextAction.practiceRef === 'pfsClients/pfsA' && untouched(), r);

  reset(); aiBuilder = input => { const p = validProposal(input); p.facts[0].quote = 'La luna è già stata consegnata al cliente'; return p; };
  r = await generate();
  ok('citazione inventata con ID di fonte vero è rifiutata', r.code === 422 && !task().preparation && untouched(), r);
  for (const section of ['commitments', 'uncertainties']) {
    reset(); aiBuilder = input => { const p = validProposal(input); delete p[section][0].quote; return p; };
    r = await generate(); ok(section + ': citazione obbligatoria anche fuori dai fatti', r.code === 422 && !task().preparation, r);
  }
  reset(); aiBuilder = input => { const p = validProposal(input); p.nextAction.practiceRef = 'contracts/foreign'; return p; };
  r = await generate(); ok('pratica altrui non diventa proposta valida', r.code === 422 && r.error === 'practice_requires_selection', r);
  for (const multiple of [false, true]) {
    reset();
    if (multiple) save('contracts/cB', { tenantId: 'tenantA', propertyId: 'pA', status: 'active' });
    aiBuilder = input => { const p = validProposal(input); p.nextAction.practiceRef = null; p.draft = null; return p; };
    r = await generate();
    ok('la pratica confermata non si perde se il modello omette il riferimento' + (multiple ? ' tra più candidati' : ''),
      r.code === 200 && r.preparation.nextAction.practiceRef === 'contracts/cA'
      && r.preparation.draft === null && untouched(), r);
  }
  reset(); DB.delete('contracts/cA');
  aiBuilder = input => { const p = validProposal(input); p.nextAction.practiceRef = null; return p; };
  r = await generate();
  ok('una pratica precedente non più verificabile non viene ripristinata e non abilita una bozza',
    r.code === 200 && r.preparation.nextAction.practiceRef === null && r.preparation.draft === null && untouched(), r);
  reset(); save('conversations/' + CID, { ...DB.get('conversations/' + CID), conversationBindingConflict: 'multiple_established_conversations' });
  aiBuilder = input => { const p = validProposal(input); p.nextAction.practiceRef = null; return p; };
  r = await generate();
  ok('conflitto CID blocca pratica e bozza pur mantenendo il seguito', r.code === 200 && r.preparation.identityBlocked
    && r.preparation.nextAction.practiceRef === null && r.preparation.draft === null && untouched(), r);
  reset(); save('users/conflict', { role: 'tenant', phone: PHONE, email: 'other@example.test' });
  aiBuilder = input => { const p = validProposal(input); p.nextAction.practiceRef = null; return p; };
  r = await generate();
  ok('nuova ambiguità identitaria prevale sulla pratica precedente anche se il modello la omette',
    r.code === 200 && r.preparation.nextAction.practiceRef === null && r.preparation.identityBlocked
    && r.preparation.draft === null && untouched(), r);
  reset(); save('contracts/cB', { tenantId: 'tenantA', propertyId: 'pA', status: 'active' });
  revise(t => { t.followUp.practiceRef = null; });
  aiBuilder = input => { const p = validProposal(input); p.nextAction.practiceRef = 'contracts/cB'; return p; };
  r = await generate(); ok('due pratiche senza selezione impediscono scelta arbitraria del modello', r.code === 422 && r.error === 'practice_requires_selection', r);
  reset(); save('contracts/cB', { tenantId: 'tenantA', propertyId: 'pA', status: 'active' });
  revise(t => { t.followUp.practiceRef = null; });
  r = await generate();
  ok('nessuna pratica selezionata: prepara seguito verificabile ma non una bozza non inviabile', r.code === 200
    && r.preparation.nextAction.practiceRef === null && r.preparation.draft === null && r.preparation.nextAction.text && untouched(), r);
  // Reproduce the real Opus output: it told us to ask a question but placed the
  // case on the customer for 36h, although no question or draft had been sent.
  reset({ text: 'Il rubinetto perde. Potete fare controllare dal tecnico? Non ho indicato quale dei miei due appartamenti.' });
  save('contracts/cB', { tenantId: 'tenantA', propertyId: 'pA', status: 'active' });
  revise(t => { t.followUp.practiceRef = null; });
  aiBuilder = input => {
    const p = validProposal(input);
    p.commitments = []; p.draft = null;
    p.nextAction = { ...p.nextAction,
      text: "Chiedere all'inquilino quale dei due appartamenti (Immobile sintetico A o B) presenta la perdita, poi valutare l'organizzazione del controllo tecnico.",
      waitingOn: 'client', waitingLabel: 'Inquilino', checkAt: stamp(NOW + 36 * 3600000), checkLocal: CALENDAR.romeLocalInstant(stamp(NOW + 36 * 3600000)),
      reason: "Serve sapere l'appartamento interessato prima di poter procedere; senza questa informazione non si può indirizzare l'intervento." };
    return p;
  };
  r = await generate();
  ok('output reale ambiguo: domanda mai inviata resta un passo dell’operatore, non attesa cliente di 36 ore', r.code === 200
    && r.preparation.nextAction.waitingOn === 'valentino' && r.preparation.nextAction.waitingLabel === 'Valentino'
    && r.preparation.nextAction.reason.startsWith('Richiesta o incarico da verificare:')
    && r.preparation.nextAction.checkAt === task().followUp.checkAt
    && r.preparation.status === 'needs_context' && r.preparation.nextAction.requiresReview
    && r.preparation.nextAction.text.startsWith('Verificare nelle fonti')
    && r.preparation.recommendation === r.preparation.nextAction.text && r.preparation.handoff.needed
    && r.preparation.nextAction.practiceRef === null && r.preparation.draft === null && untouched(), r);
  // Synthetic reproduction of the aggregate review finding. No private text
  // is needed: the actual pipeline must preserve a proven contact callback.
  const callbackProposal = input => {
    const p = validProposal(input), source = input.sources.find(s => s.id === input.coverage.lastEvent.sourceId);
    p.draft = null; p.uncertainties = [];
    p.commitments = [{ text: 'Il contatto ha promesso di richiamare.', sourceIds: [source.id],
      quote: source.analysisText || source.text, kind: 'explicit', status: 'pending' }];
    p.nextAction = { ...p.nextAction, text: 'Attendere il richiamo del contatto', waitingOn: 'client', waitingLabel: 'Cliente fixture',
      checkAt: stamp(NOW + 8 * 3600000), checkLocal: CALENDAR.romeLocalInstant(stamp(NOW + 8 * 3600000)), reason: 'Il prossimo passo spetta al contatto; ricontrollare questa sera.' };
    return p;
  };
  for (const actor of ['client', 'collaborator']) {
    reset({ text: 'Ti richiamo io più tardi.' });
    aiBuilder = input => { const p = callbackProposal(input); p.nextAction.waitingOn = actor; return p; };
    r = await generate();
    ok(actor + ': richiamo del contatto provato conserva attesa senza bozza o conferma manuale', r.code === 200
      && r.preparation.nextAction.waitingOn === actor && r.preparation.nextAction.waitingLabel === 'Cliente fixture'
      && r.preparation.nextAction.reason === 'Il prossimo passo spetta al contatto; ricontrollare questa sera.'
      && r.preparation.nextAction.checkAt === stamp(NOW + 8 * 3600000)
      && r.preparation.draft === null && !task().followUp.confirmed && untouched(), r);
  }
  for (const text of ['Ti richiamo appena finisco.', 'Appena ho finito ti richiamo.']) {
    reset({ text }); aiBuilder = callbackProposal; r = await generate();
    ok('richiamo con completamento temporale esplicito resta al contatto: ' + text, r.code === 200
      && r.preparation.nextAction.waitingOn === 'client' && !task().followUp.confirmed
      && r.preparation.draft === null && untouched(), r);
  }
  reset({ text: 'Ti richiamo non appena termino il lavoro.' });
  aiBuilder = callbackProposal; r = await generate();
  ok('promessa valida fuori grammatica resta da verificare con fonte e impegno conservati', r.code === 200
    && r.preparation.status === 'needs_context' && r.preparation.nextAction.requiresReview
    && r.preparation.nextAction.waitingOn === 'valentino' && r.preparation.handoff.needed
    && r.preparation.nextAction.text.startsWith('Verificare nelle fonti')
    && r.preparation.recommendation === r.preparation.nextAction.text
    && r.preparation.commitments[0].kind === 'explicit' && r.preparation.commitments[0].sourceIds.includes('messages/m1')
    && r.preparation.sources.some(s => s.id === 'messages/m1') && untouched(), r);
  r = await endpoint(prepareEndpoint, { body: { op: 'approve', id: ID, revision: r.preparation.revision, lastMessageId: 'm1' } });
  ok('promessa non riconosciuta non diventa attesa automaticamente confermabile', r.httpCode === 409
    && r.error === 'preparation_needs_context' && !task().preparation.approval && untouched(), r);
  reset({ text: 'Ti richiamo io più tardi.' });
  save('messages/later', { conversationId: CID, direction: 'in', channel: 'whatsapp',
    body: 'Annulla il richiamo, non serve più.', at: stamp(NOW - 1000) });
  aiBuilder = callbackProposal;
  r = await generate();
  ok('revoca successiva impedisce che vecchio richiamo citato mantenga attesa cliente', r.code === 200
    && r.preparation.nextAction.waitingOn === 'valentino' && untouched(), r);
  for (const attached of [false, true]) {
    reset({ text: 'Ti richiamo io più tardi.' });
    save('messages/later-ack', { conversationId: CID, direction: 'in', channel: 'whatsapp',
      body: 'Ok.', at: stamp(NOW - 1000), ...(attached ? { attachments: [{ type: 'audio', name: 'synthetic-audio.ogg' }] } : {}) });
    aiBuilder = callbackProposal; r = await generate();
    ok(attached ? 'riscontro con allegato non letto non prova che il richiamo sia ancora valido'
      : 'riscontro successivo di solo testo conserva la promessa di richiamo', r.code === 200
      && aiInputs[0].sources.find(s => s.id === 'messages/later-ack')?.messageKind === (attached ? 'attachment' : 'text')
      && r.preparation.nextAction.waitingOn === (attached ? 'valentino' : 'client') && untouched(), r);
  }
  for (const text of ['Attendere il pagamento dopo la chiamata', 'Attendere la chiamata di un altro tecnico']) {
    reset({ text: 'Ti richiamo io più tardi.' });
    aiBuilder = input => { const p = callbackProposal(input); p.nextAction.text = text; return p; };
    r = await generate();
    ok('richiamo citato non autorizza un passo operativo diverso: ' + text, r.code === 200
      && r.preparation.nextAction.waitingOn === 'valentino' && untouched(), r);
  }
  reset({ text: 'Ti richiamo io più tardi.' });
  save('messages/m1', { ...DB.get('messages/m1'), at: stamp(NOW - 110000) });
  save('messages/revoked-outside-window', { conversationId: CID, direction: 'in', channel: 'whatsapp',
    body: 'Annulla il richiamo, non serve più.', at: stamp(NOW - 105000) });
  for (let i = 0; i < 100; i++) save('messages/recent-ack-' + i, { conversationId: CID, direction: 'out', channel: 'whatsapp',
    body: 'Grazie.', at: stamp(NOW - (100 - i) * 1000) });
  aiBuilder = callbackProposal;
  r = await generate();
  ok('cronologia ordinata ma limitata non prova assenza di revoca fuori finestra', r.code === 200
    && aiInputs[0].coverage.history.ordered === true && aiInputs[0].coverage.history.limited === true
    && !aiInputs[0].sources.some(s => s.id === 'messages/revoked-outside-window')
    && aiInputs[0].sources.some(s => s.id === 'messages/m1')
    && r.preparation.nextAction.waitingOn === 'valentino' && untouched(), r);
  reset({ text: 'Ti richiamo io più tardi.' });
  save('messages/m1', { ...DB.get('messages/m1'), direction: 'out' });
  aiBuilder = callbackProposal;
  r = await generate();
  ok('promessa uscente non diventa impegno del contatto', r.code === 200
    && r.preparation.nextAction.waitingOn === 'valentino' && untouched(), r);
  reset({ text: 'Ti richiamo io più tardi.' });
  save('messages/m1', { ...DB.get('messages/m1'), at: stamp(NOW - 86400000) });
  aiBuilder = callbackProposal;
  r = await generate();
  ok('richiamo generico di un giorno precedente torna a verifica invece di attesa automatica', r.code === 200
    && r.preparation.nextAction.waitingOn === 'valentino' && untouched(), r);
  reset({ text: 'Ti richiamo io più tardi.' });
  aiBuilder = input => { const p = callbackProposal(input); p.commitments[0].status = 'satisfied'; return p; };
  r = await generate();
  ok('impegno marcato già soddisfatto non prova un richiamo ancora da attendere', r.code === 200
    && r.preparation.nextAction.waitingOn === 'valentino' && untouched(), r);
  reset();
  revise(t => { t.followUp.checkAt = stamp(NOW + 3 * 3600000); });
  aiBuilder = input => { const p = validProposal(input); p.draft = null;
    p.nextAction.checkAt = stamp(NOW + 8 * 3600000); p.nextAction.checkLocal = CALENDAR.romeLocalInstant(p.nextAction.checkAt); p.nextAction.reason = 'Aspettare il cliente e ricontrollare questa sera.'; return p; };
  r = await generate();
  ok('guardia che conserva controllo pomeridiano sostituisce motivazione serale incompatibile', r.code === 200
    && r.preparation.nextAction.checkAt === stamp(NOW + 3 * 3600000)
    && r.preparation.nextAction.checkLocal.time === '15:00' && r.preparation.timingValidation.ok
    && r.preparation.timingValidation.guardChangedTime && r.preparation.timingValidation.declaredLocal.time === '20:00'
    && !/questa sera|Aspettare il cliente/.test(r.preparation.nextAction.reason)
    && /ricontrollo interno precedente/.test(r.preparation.nextAction.reason) && untouched(), r);
  for (const actor of ['client', 'collaborator']) {
    reset();
    save('messages/oldOut', { conversationId: CID, direction: 'out', channel: 'whatsapp',
      body: 'Grazie, ho ricevuto la precedente comunicazione.', at: stamp(NOW - 86400000) });
    aiBuilder = input => { const p = validProposal(input); p.draft = null;
      p.nextAction.waitingOn = actor; p.nextAction.sourceIds.push('messages/oldOut'); return p; };
    r = await generate();
    ok(actor + ': un vecchio messaggio uscente citato non prova la nuova richiesta o l’incarico', r.code === 200
      && r.preparation.nextAction.waitingOn === 'valentino' && r.preparation.draft === null && untouched(), r);
  }
  reset();
  revise(t => { Object.assign(t.followUp, { confirmed: true, nextAction: 'Attendere la disponibilità del tecnico già incaricato',
    waitingOn: 'collaborator', waitingLabel: 'Tecnico BOOM' }); });
  aiBuilder = input => { const p = validProposal(input); p.draft = null;
    p.nextAction.text = input.existingFollowUp.nextAction; p.nextAction.waitingLabel = 'Tecnico BOOM'; return p; };
  r = await generate();
  ok('attesa corrispondente già confermata dall’operatore conserva il collaboratore senza nuovo invio', r.code === 200
    && r.preparation.nextAction.waitingOn === 'collaborator' && r.preparation.nextAction.waitingLabel === 'Tecnico BOOM'
    && r.preparation.draft === null && untouched(), r);
  reset();
  revise(t => { Object.assign(t.followUp, { confirmed: true, nextAction: 'Attendere una foto della serratura',
    waitingOn: 'collaborator', waitingLabel: 'Tecnico' }); });
  aiBuilder = input => { const p = validProposal(input); p.draft = null; return p; };
  r = await generate();
  ok('stesso collaboratore su un’attesa precedente diversa non prova il nuovo incarico', r.code === 200
    && r.preparation.nextAction.waitingOn === 'valentino' && r.preparation.draft === null && untouched(), r);
  reset();
  aiBuilder = input => { const p = validProposal(input); p.draft = null;
    p.nextAction.checkAt = stamp(NOW + 366 * 86400000); return p; };
  r = await generate();
  ok('correggere un’attesa non rende valido un ricontrollo del modello fuori limite', r.code === 422
    && r.error === 'invalid_preparation_time' && !task().preparation && untouched(), r);
  reset(); save('conversations/' + CID, { ...DB.get('conversations/' + CID), conversationBindingConflict: 'multiple_established_conversations' });
  aiBuilder = input => { const p = validProposal(input); p.nextAction.practiceRef = null; return p; };
  r = await generate();
  ok('conflitto CID blocca pratica e bozza pur mantenendo il seguito', r.code === 200 && r.preparation.identityBlocked
    && r.preparation.nextAction.practiceRef === null && r.preparation.draft === null && untouched(), r);
  reset(); save('users/conflict', { role: 'tenant', phone: PHONE, email: 'other@example.test' });
  r = await generate(); ok('identità contraddittoria impedisce proposta collegata al contratto', r.code === 422 && !task().preparation, r);

  reset(); save('conversations/' + CID, { ...DB.get('conversations/' + CID), segretaria: true });
  r = await generate();
  ok('chat già affidata alla Segretaria conversazionale prepara solo lavoro interno, senza seconda voce', r.code === 200
    && r.preparation.draft === null && r.preparation.routeOwner === 'segretaria:conversation'
    && aiInputs[0].replyOwnership?.owner === 'segretaria:conversation' && untouched(), r);
  reset(); await generate();
  save('conversations/' + CID, { ...DB.get('conversations/' + CID), segretaria: true });
  r = await generate();
  ok('attivare la voce conversazionale invalida anche una bozza già in cache', r.code === 200
    && r.preparation.draft === null && r.preparation.routeOwner === 'segretaria:conversation' && untouched(), r);

  reset(); aiHook = async () => save('conversations/' + CID, { ...DB.get('conversations/' + CID), segretaria: true });
  r = await generate();
  ok('attivazione della voce conversazionale durante AI impedisce salvataggio della seconda bozza',
    r.code === 409 && r.error === 'reply_owner_changed_reload' && !task().preparation && untouched(), r);

  for (const status of ['pending', 'approved', 'executed']) {
    reset();
    save('action_queue/otherReply', { kind: 'reply', status, proposedBy: 'commerciale',
      payload: { conversationId: CID, channel: 'whatsapp', phone: PHONE } });
    r = await generate();
    ok('risposta ' + status + ' di altro agente già in coda: solo seguito, niente doppia bozza o scrittura sulla sua azione',
      r.code === 200 && r.preparation.draft === null && r.preparation.replyOwnership?.blocked
      && r.preparation.replyOwnership?.actionId === 'otherReply' && rows('action_queue').length === 1
      && writes.every(w => /^(operatorTasks|heartbeat|aiUsage)\//.test(w.path)) && !network.length && !globalThis.__mails.length, r);
  }
  reset();
  aiHook = async () => save('action_queue/racingReply', { kind: 'reply', status: 'approved', proposedBy: 'gestore',
    payload: { conversationId: CID, channel: 'whatsapp', phone: PHONE } });
  r = await generate();
  ok('risposta concorrente entrata in coda durante AI invalida proposta senza toccare la coda', r.code === 409
    && r.error === 'reply_owner_changed_reload' && !task().preparation && rows('action_queue').length === 1
    && writes.every(w => /^(operatorTasks|heartbeat|aiUsage)\//.test(w.path)), r);
  reset(); failingCollection = 'action_queue'; r = await generate();
  ok('coda illeggibile resta verifica incompleta: nessuna bozza libera inventata', r.code === 200
    && r.preparation.draft === null && r.preparation.replyOwnership?.incomplete && untouched(), r);

  reset({ text: 'Buongiorno, voglio parlare con Valentino, per favore.' }); r = await generate();
  ok('richiesta umana forza richiamo di Valentino e nessuna bozza anche se il modello propone altro', r.code === 200
    && r.preparation.handoff.needed && r.preparation.draft === null && r.preparation.nextAction.waitingOn === 'valentino' && untouched(), r);
  for (const [text, owner] of [['Ho già fatto il bonifico del pagamento', 'payments'], ['Devo firmare il contratto', 'signature']]) {
    reset({ text }); r = await generate();
    ok(owner + ': resta al gestore specialista, senza secondo sollecito', r.code === 200
      && r.preparation.draft === null && r.preparation.routeOwner === 'gestore:' + owner && untouched(), r);
  }

  for (const [fieldName, phrase, owner] of [
    ['draft', 'Ti ricordo il pagamento da completare.', 'payments'],
    ['nextAction', 'Sollecitare la firma del contratto', 'signature'],
    ['commitments', 'È ancora atteso il bonifico concordato', 'payments'],
  ]) {
    reset({ text: 'Sì, grazie.' });
    aiBuilder = input => {
      const p = validProposal(input);
      if (fieldName === 'commitments') p.commitments[0].text = phrase;
      else p[fieldName].text = phrase;
      return p;
    };
    r = await generate();
    ok(fieldName + ': sollecito indiretto non aggira il gestore specialistico', r.code === 200
      && r.preparation.draft === null && r.preparation.routeOwner === 'gestore:' + owner && untouched(), r);
  }
  for (const invalidTime of ['2026-02-30T12:00:00Z', '2026-09-16T12:00:00', stamp(NOW - 1), stamp(NOW + 366 * 86400000)]) {
    reset(); aiBuilder = input => { const p = validProposal(input); p.nextAction.checkAt = invalidTime; return p; };
    r = await generate(); ok('ricontrollo non valido/fuori finestra rifiutato: ' + invalidTime,
      r.code === 422 && r.error === 'invalid_preparation_time' && !task().preparation, r);
  }

  reset(); save('messages/out1', { conversationId: CID, direction: 'out', fromMe: true, body: 'Certo, te lo confermo domani.',
    at: stamp(NOW - 5000), channel: 'whatsapp' });
  r = await generate();
  ok('fromMe senza autore non viene imparato come voce di Valentino', r.code === 200
    && aiInputs[0].style.basis === 'editorial_only' && aiInputs[0].style.limitations.some(s => s.includes('non identifica Valentino'))
    && !aiInputs[0].style.examples?.length, aiInputs[0]?.style);

  reset(); save('messages/m1', { conversationId: CID, direction: 'in', channel: 'phone', phoneCallId: 'phoneA',
    sourceRef: 'phoneCalls/phoneA', body: 'Agent: Vuoi parlare con Valentino per il pagamento?\nCaller: Can you arrange the maintenance visit?',
    callerWords: 'Can you arrange the maintenance visit?', analysisText: 'Can you arrange the maintenance visit?', at: stamp(NOW - 10000) });
  revise(t => { t.followUp.lastMessageId = 'phone:phoneA'; });
  save('phoneCalls/phoneA', { callerWords: 'Can you arrange the maintenance visit?', transcriptStatus: 'ok' });
  r = await generate();
  ok('telefonata: lingua e richiesta umana derivano dal chiamante, non dalle parole dell’agente', r.code === 200
    && aiInputs[0].language === 'en' && !aiInputs[0].humanRequested && !aiInputs[0].protectedTopic, aiInputs[0] && {
      language: aiInputs[0].language, humanRequested: aiInputs[0].humanRequested, protectedTopic: aiInputs[0].protectedTopic });

  reset(); save('messages/m1', { conversationId: CID, direction: 'in', channel: 'phone', phoneCallId: 'phoneA',
    sourceRef: 'phoneCalls/phoneA', body: 'Agent: Posso richiamarti domani.', at: stamp(NOW - 10000) });
  revise(t => { t.followUp.lastMessageId = 'phone:phoneA'; });
  save('phoneCalls/phoneA', { transcriptStatus: 'missing' });
  r = await generate();
  ok('chiamante non attribuibile richiede contesto e blocca bozza anche se il modello la propone', r.code === 200
    && r.preparation.status === 'needs_context' && r.preparation.handoff.needed && r.preparation.draft === null && untouched(), r);

  reset();
  const simultaneous = await Promise.all([generate(), generate()]);
  ok('due preparazioni contemporanee consumano una sola chiamata e un solo turno giornaliero', aiHits === 1 && count() === 1
    && simultaneous.some(x => x.code === 200) && simultaneous.every(x => x.code === 200 || x.code === 409), simultaneous.map(x => x.code));
  reset(); save('heartbeat/segretaria-preparing-' + ID, { busy: true, leaseId: 'other', expiresAt: stamp(NOW + 60000) });
  r = await generate(); ok('lease attiva rifiuta prima del modello e del contatore', r.code === 409 && aiHits === 0 && count() === 0, r);
  reset(); save('heartbeat/segretaria-preparing-' + ID, { busy: true, leaseId: 'expired', expiresAt: stamp(NOW - 1) });
  r = await generate(); ok('lease scaduta viene recuperata e rilasciata', r.code === 200 && aiHits === 1
    && DB.get('heartbeat/segretaria-preparing-' + ID).busy === false, r.code);
  for (const used of [5, 50, 5000]) {
    reset(); save('heartbeat/segretaria-preparations-2026-09-15', { count: used });
    r = await generate(); ok('preparazione continua dopo ' + used + ' tentativi: il contatore misura senza fermare',
      r.code === 200 && aiHits === 1 && count() === used + 1 && DB.get('settings/segretaria').dailyCap === 5 && untouched(), r);
  }
  for (const invalid of [-1, '5', null, 1.5, Number.MAX_SAFE_INTEGER]) {
    reset(); save('heartbeat/segretaria-preparations-2026-09-15', { count: invalid });
    r = await generate(); ok('contatore corrotto dichiarato senza modello o scrittura: ' + invalid,
      r.code === 503 && r.error === 'preparation_counter_invalid' && aiHits === 0 && !writes.length, r);
  }

  reset();
  commitHook = async operations => {
    if (operations.some(op => op.update?.fields?.busy?.booleanValue === true)) clock += 54000;
  };
  r = await generate();
  ok('budget consumato dopo controllo iniziale e acquisizione lease impedisce comunque partenza AI', r.code === 503
    && r.error === 'preparation_time_budget' && aiHits === 0 && !task().preparation
    && DB.get('heartbeat/segretaria-preparing-' + ID)?.busy === false, r);

  reset(); await generate();
  const oldProposal = structuredClone(task().preparation);
  save('messages/m1', { ...DB.get('messages/m1'), body: 'Potete confermare la disponibilità aggiornata?' });
  aiHook = async () => { throw new Error('fixture_model_unavailable'); };
  r = await generate();
  ok('errore modello mantiene esattamente la proposta precedente e libera la lease', r.code === 503
    && JSON.stringify(task().preparation) === JSON.stringify(oldProposal)
    && DB.get('heartbeat/segretaria-preparing-' + ID).busy === false, r);

  reset(); aiHook = async () => revise(t => { t.followUp.lastMessageId = 'm2'; });
  r = await generate(); ok('ultimo evento cambiato durante AI prevale e impedisce salvataggio', r.code === 409
    && !task().preparation && task().followUp.lastMessageId === 'm2', r);
  reset(); aiHook = async () => save('messages/m1', { ...DB.get('messages/m1'), body: 'Correzione del testo originale' });
  r = await generate(); ok('stesso evento con fonte cambiata durante AI non salva proposta superata', r.code === 409 && !task().preparation, r);
  reset(); aiHook = async () => save('contracts/cA', { ...DB.get('contracts/cA'), status: 'terminated' });
  r = await generate(); ok('pratica cambiata durante AI non salva proposta superata', r.code === 409 && !task().preparation, r);
  reset(); aiHook = async () => save('conversations/' + CID, { ...DB.get('conversations/' + CID), contactPhone: '+393339999999' });
  r = await generate(); ok('recapito cambiato durante AI non conserva destinatario obsoleto', r.code === 409 && !task().preparation, r);
  reset(); beforePatch = async () => revise(t => { t.followUp.lastMessageId = 'racing-final-commit'; });
  r = await generate(); ok('CAS finale impedisce sovrascrittura fra ultima lettura e commit', r.code === 409 && !task().preparation, r);

  reset(); await generate(); clock = NOW + 60001; r = await generate();
  const dueRevision = r.preparation?.revision;
  ok('scadenza del ricontrollo prepara una nuova proposta senza inviare', r.code === 200 && !r.cached && aiHits === 2
    && r.preparation.recheckFor === stamp(NOW + 60000) && untouched(), r);
  r = await generate(); ok('stesso ricontrollo già preparato non consuma altri turni', r.cached && aiHits === 2 && r.preparation.revision === dueRevision);
  reset(); await generate();
  revise(t => { t.preparation.approval = { actionId: 'pendingReply' }; });
  save('action_queue/pendingReply', { status: 'executed', payload: { channel: 'whatsapp' } });
  clock = NOW + 60001; r = await generate();
  ok('ricontrollo con consegna WhatsApp incerta non prepara un nuovo messaggio', r.code === 409
    && r.error === 'previous_delivery_unresolved' && aiHits === 1 && rows('action_queue').length === 1, r);

  reset(); await generate();
  revise(t => { t.preparation.approval = { actionId: 'pendingReply' }; t.followUp.lastMessageId = 'm2'; });
  save('messages/m2', { conversationId: CID, direction: 'in', channel: 'whatsapp', body: 'È arrivato un altro dettaglio.', at: stamp(NOW) });
  save('action_queue/pendingReply', { status: 'approved', payload: { channel: 'whatsapp' } });
  const pendingRevision = task().preparation.revision;
  r = await generate();
  ok('nuovo ingresso con azione precedente ancora pendente non crea una seconda proposta e conserva la ricevuta',
    r.code === 409 && r.error === 'previous_delivery_unresolved' && aiHits === 1
    && task().preparation.revision === pendingRevision && task().preparation.approval.actionId === 'pendingReply', r);

  let expiredId = await approvedDelivery();
  const oldApproval = structuredClone(task().preparation.approval), oldAction = structuredClone(DB.get('action_queue/' + expiredId));
  clock = NOW + 49 * 3600000;
  const expiredReceipt = await readPreparationDelivery(ID, expiredId);
  r = await generate();
  ok('consegna scaduta mai ritirata permette nuova proposta senza nuova azione o approvazione',
    expiredReceipt.error === 'whatsapp_delivery_expired' && r.code === 200 && !r.cached
    && !r.preparation.approval && aiHits === 2 && rows('action_queue').length === 1
    && DB.get('action_queue/' + expiredId).status === 'rejected', { expiredReceipt, result: r.code, error: r.error });
  const retired = DB.get('action_queue/' + expiredId), retained = { ...retired.segretaria }; delete retained.delivery;
  ok('ritiro scaduto conserva prova approvata, payload e audit senza inventare consegna',
    JSON.stringify(retained) === JSON.stringify(oldAction.segretaria) && retired.segretaria.delivery.state === 'expired'
    && JSON.stringify(retired.payload) === JSON.stringify(oldAction.payload) && !retired.waSentAt && !retired.waSendError);
  const newRevision = task().preparation.revision, afterExpiryWrites = writes.length;
  r = await generate();
  ok('retry dopo risoluzione scadenza usa cache e non riscrive azione o proposta', r.cached && aiHits === 2
    && task().preparation.revision === newRevision && writes.length === afterExpiryWrites, r);
  const retiredRead = await readPreparationDelivery(ID, expiredId);
  const latePickup = await claimSegretariaDelivery({ id: expiredId, action: retired, now: clock });
  r = await endpoint(prepareEndpoint, { body: { op: 'approve', id: ID, revision: oldApproval.revision, lastMessageId: 'm1' } });
  ok('vecchia azione resta scaduta consultabile e non riapprovabile o ritirabile',
    retiredRead.error === 'whatsapp_delivery_expired' && !latePickup.allowed && r.httpCode === 409
    && rows('action_queue').length === 1 && !task().preparation.approval, { retiredRead, latePickup, approval: r });

  expiredId = await approvedDelivery({ futureCheck: true }); clock = NOW + 48 * 3600000;
  r = await generate();
  ok('scadenza alla soglia supera cache ancora valida anche senza ricontrollo dovuto', r.code === 200 && !r.cached
    && aiHits === 2 && DB.get('action_queue/' + expiredId).status === 'rejected' && !r.preparation.approval, r.code);

  expiredId = await approvedDelivery(); clock = NOW + 49 * 3600000;
  save('messages/m2', { conversationId: CID, direction: 'in', channel: 'whatsapp', body: 'È arrivato un altro dettaglio.', at: stamp(clock) });
  revise(t => { t.followUp.lastMessageId = 'm2'; t.followUp.lastInboundAt = stamp(clock); t.followUp.preview = 'Nuovo dettaglio'; });
  r = await generate();
  ok('nuovo messaggio dopo invio mai ritirato conserva vecchia prova e riceve nuova proposta da approvare', r.code === 200
    && r.preparation.messageId === 'm2' && !r.preparation.approval && DB.get('action_queue/' + expiredId).status === 'rejected', r.code);

  for (const [label, change] of [
    ['legacy', a => { delete a.segretaria; delete a.proposedBy; }],
    ['istante assente', a => { delete a.executedAt; }],
    ['istante invalido', a => { a.executedAt = 'invalid'; }],
    ['ancora nella finestra', a => { a.executedAt = stamp(NOW + 2 * 3600000); }],
    ['approvata ma non eseguita', a => { a.status = 'approved'; }],
    ['ritiro incerto', a => { a.segretaria.delivery = { state: 'claimed', claimedAt: stamp(NOW) }; }],
    ['esito fallito', a => { a.waSendError = 'fixture_failure'; }],
    ['tentativo senza esito', a => { a.waSendAttemptAt = stamp(NOW); }],
    ['esecutore incerto', a => { delete a.segretaria.execution; }],
    ['altro caso', a => { a.segretaria.caseId = ID2; }],
    ['payload manomesso', a => { a.payload.draft = 'Testo non approvato'; }],
  ]) {
    expiredId = await approvedDelivery(); clock = NOW + 49 * 3600000;
    const changed = structuredClone(DB.get('action_queue/' + expiredId)); change(changed); save('action_queue/' + expiredId, changed);
    const before = JSON.stringify(changed), previousPreparation = JSON.stringify(task().preparation);
    r = await generate();
    ok('scadenza non risolve automaticamente stato non provato: ' + label, r.code === 409
      && r.error === 'previous_delivery_unresolved' && aiHits === 1 && JSON.stringify(task().preparation) === previousPreparation
      && JSON.stringify(DB.get('action_queue/' + expiredId)) === before, r);
  }
  expiredId = await approvedDelivery(); clock = NOW + 49 * 3600000;
  revise(t => { t.preparation.approval.approvedBy = 'another-admin'; });
  r = await generate();
  ok('ricevuta della vecchia approvazione discordante non può dismettere azione', r.code === 409
    && DB.get('action_queue/' + expiredId).status === 'executed' && aiHits === 1, r);

  expiredId = await approvedDelivery(); clock = NOW + 49 * 3600000;
  const beforeFailedModel = JSON.stringify(DB.get('action_queue/' + expiredId)), beforeFailedPreparation = JSON.stringify(task().preparation);
  aiHook = async () => { throw new Error('fixture_expiry_model_unavailable'); };
  r = await generate();
  ok('AI fallita non dismette azione scaduta e non perde approvazione precedente', r.code === 503
    && JSON.stringify(DB.get('action_queue/' + expiredId)) === beforeFailedModel
    && JSON.stringify(task().preparation) === beforeFailedPreparation, r);

  for (const race of ['claimed', 'ack', 'new_message', 'recipient']) {
    expiredId = await approvedDelivery(); clock = NOW + 49 * 3600000;
    const previousRevision = task().preparation.revision;
    commitHook = async operations => {
      if (!operations.some(op => op.update?.fields?.status?.stringValue === 'rejected')) return;
      commitHook = null;
      if (race === 'new_message') revise(t => { t.followUp.lastMessageId = 'racing-inbound'; });
      else if (race === 'recipient') save('conversations/' + CID, { ...DB.get('conversations/' + CID), contactPhone: '+393339999999' });
      else {
        const concurrent = structuredClone(DB.get('action_queue/' + expiredId));
        concurrent.segretaria.delivery = { state: race === 'claimed' ? 'claimed' : 'sent', claimedAt: stamp(clock - 1000) };
        if (race === 'ack') concurrent.waSentAt = stamp(clock);
        save('action_queue/' + expiredId, concurrent);
      }
    };
    r = await generate();
    const concurrent = DB.get('action_queue/' + expiredId);
    ok('CAS risoluzione scadenza conserva concorrente ' + race + ' e vecchia proposta', r.code === 409
      && task().preparation.revision === previousRevision && concurrent.status === 'executed'
      && (race !== 'claimed' || concurrent.segretaria.delivery.state === 'claimed')
      && (race !== 'ack' || !!concurrent.waSentAt)
      && (race !== 'new_message' || task().followUp.lastMessageId === 'racing-inbound')
      && (race !== 'recipient' || DB.get('conversations/' + CID).contactPhone === '+393339999999'), r);
  }

  let closedFixture = await closedDeliveryNextCase();
  const oldClosedCase = JSON.stringify(task()), closedActionBefore = DB.get('action_queue/' + closedFixture.actionId);
  ok('helper non ammette caso chiuso senza opzione esplicita', !canExpireUnclaimedSegretariaDelivery({ id: closedFixture.actionId,
    action: closedActionBefore, task: { ...task(), id: ID }, now: clock }));
  r = await generate({ id: closedFixture.id });
  ok('caso chiuso con vecchia risposta scaduta non blocca bozza del nuovo caso nella stessa chat',
    closedFixture.id !== ID && r.code === 200 && !!r.preparation.draft && !r.preparation.approval
    && DB.get('action_queue/' + closedFixture.actionId).status === 'rejected', { result: r.code,
      draft: !!r.preparation?.draft, owner: r.preparation?.replyOwnership, previousStatus: DB.get('action_queue/' + closedFixture.actionId).status });
  ok('risoluzione del caso vecchio conserva chiusura outcome e approvazione senza riaprirlo', JSON.stringify(task()) === oldClosedCase);
  const closedRead = await readPreparationDelivery(ID, closedFixture.actionId);
  const ownershipAfter = await replyOwner({ ...DB.get('conversations/' + CID), id: CID });
  ok('ricevuta vecchia resta scaduta e ownership effettiva coincide con proposta nuova', closedRead.error === 'whatsapp_delivery_expired'
    && !ownershipAfter.blocked && JSON.stringify(ownershipAfter) === JSON.stringify(r.preparation.replyOwnership), { closedRead, ownershipAfter });
  r = await endpoint(prepareEndpoint, { body: { op: 'approve', id: closedFixture.id, revision: r.preparation.revision, lastMessageId: 'm2' } });
  ok('approvazione umana di B accoda solo nuova risposta: A resta terminale senza consegna', r.httpCode === 200 && r.delivery === 'queued'
    && r.actionId !== closedFixture.actionId && rows('action_queue').length === 2
    && rows('action_queue').filter(([, a]) => a.status === 'executed').length === 1
    && DB.get('action_queue/' + closedFixture.actionId).status === 'rejected' && !DB.get('action_queue/' + closedFixture.actionId).waSentAt, r);

  closedFixture = await closedDeliveryNextCase({ age: 47 * 3600000 });
  r = await generate({ id: closedFixture.id });
  ok('prima delle48h la risposta del caso chiuso continua a bloccare altra bozza', r.code === 200 && !r.preparation.draft
    && r.preparation.replyOwnership.blocked && DB.get('action_queue/' + closedFixture.actionId).status === 'executed', r.code);
  clock = NOW + 49 * 3600000;
  r = await generate({ id: closedFixture.id });
  ok('proposta B già senza bozza per A si rigenera dopo scadenza owner', r.code === 200 && !r.cached && !!r.preparation.draft
    && DB.get('action_queue/' + closedFixture.actionId).status === 'rejected', r.code);

  closedFixture = await closedDeliveryNextCase({ conversationId: 'conv_same_phone_different_chat' });
  r = await generate({ id: closedFixture.id });
  ok('stesso telefono su altra conversazione non autorizza retirement del vecchio caso', r.code === 200 && !r.preparation.draft
    && r.preparation.replyOwnership.blocked && DB.get('action_queue/' + closedFixture.actionId).status === 'executed', r.code);

  for (const [label, change] of [
    ['claim incerto', a => { a.segretaria.delivery = { state: 'claimed', claimedAt: stamp(NOW) }; }],
    ['errore di invio', a => { a.waSendError = 'fixture_failure'; }],
    ['istante assente', a => { delete a.executedAt; }],
    ['legacy', a => { delete a.segretaria; delete a.proposedBy; }],
    ['approvata non eseguita', a => { a.status = 'approved'; }],
  ]) {
    closedFixture = await closedDeliveryNextCase();
    const changed = structuredClone(DB.get('action_queue/' + closedFixture.actionId)); change(changed);
    save('action_queue/' + closedFixture.actionId, changed);
    const before = JSON.stringify(changed);
    r = await generate({ id: closedFixture.id });
    ok('nuovo caso non aggira vecchio owner non risolvibile: ' + label, r.code === 200 && !r.preparation.draft
      && r.preparation.replyOwnership.blocked && JSON.stringify(DB.get('action_queue/' + closedFixture.actionId)) === before, r.code);
  }

  closedFixture = await closedDeliveryNextCase(); revise(t => { t.status = 'open'; t.followUp.open = true; });
  r = await generate({ id: closedFixture.id });
  ok('altro caso riaperto non viene dismesso dalla preparazione B', r.code === 200 && !r.preparation.draft
    && DB.get('action_queue/' + closedFixture.actionId).status === 'executed', r.code);
  closedFixture = await closedDeliveryNextCase(); save('conversations/' + CID, { ...DB.get('conversations/' + CID), segretaria: true });
  r = await generate({ id: closedFixture.id });
  ok('chat automatica resta owner e non avvia retirement', r.code === 200 && !r.preparation.draft
    && r.preparation.replyOwnership.owner === 'segretaria:conversation' && DB.get('action_queue/' + closedFixture.actionId).status === 'executed', r.code);
  closedFixture = await closedDeliveryNextCase();
  for (let i = 0; i < 21; i++) save('action_queue/history-' + i, { kind: 'reply', status: 'rejected', payload: { conversationId: CID, phone: PHONE } });
  r = await generate({ id: closedFixture.id });
  ok('copertura ownership incompleta non esclude owner scaduto e conserva veto', r.code === 200 && !r.preparation.draft
    && r.preparation.replyOwnership.incomplete && DB.get('action_queue/' + closedFixture.actionId).status === 'executed', r.code);

  closedFixture = await closedDeliveryNextCase();
  save('action_queue/' + closedFixture.actionId, { ...DB.get('action_queue/' + closedFixture.actionId), waSentAt: stamp(NOW) });
  r = await generate({ id: closedFixture.id });
  ok('consegna già riuscita non diventa expired e lascia preparare nuovo caso', r.code === 200 && !!r.preparation.draft
    && DB.get('action_queue/' + closedFixture.actionId).status === 'executed'
    && !DB.get('action_queue/' + closedFixture.actionId).segretaria.delivery
    && DB.get('action_queue/' + closedFixture.actionId).waSentAt === stamp(NOW), r.code);

  closedFixture = await closedDeliveryNextCase();
  let ownerQueries = 0;
  queryHook = async (_query, collection) => {
    if (collection === 'action_queue' && ++ownerQueries === 4) {
      for (let i = 0; i < 21; i++) save('action_queue/racing-history-' + i, { kind: 'reply', status: 'rejected', payload: { conversationId: CID, phone: PHONE } });
    }
  };
  r = await generate({ id: closedFixture.id });
  ok('copertura diventa incompleta dopo esclusione prospettica: retirement provato non sblocca bozza', r.code === 200
    && !r.preparation.draft && r.preparation.replyOwnership.incomplete && !r.preparation.approval
    && DB.get('action_queue/' + closedFixture.actionId).status === 'rejected', { code: r.code, draft: !!r.preparation?.draft,
      ownership: r.preparation?.replyOwnership, queries: ownerQueries });

  closedFixture = await closedDeliveryNextCase();
  const closedBeforeAi = JSON.stringify(task());
  aiHook = async () => { throw new Error('fixture_closed_expiry_ai_failure'); };
  r = await generate({ id: closedFixture.id });
  ok('fallimento AI di B non dismette risposta né riscrive caso chiuso', r.code === 503
    && JSON.stringify(task()) === closedBeforeAi && !task(closedFixture.id).preparation
    && DB.get('action_queue/' + closedFixture.actionId).status === 'executed', r);

  for (const race of ['old_case', 'old_preparation', 'claimed', 'ack', 'new_message', 'recipient']) {
    closedFixture = await closedDeliveryNextCase();
    commitHook = async operations => {
      if (!operations.some(op => op.update?.fields?.status?.stringValue === 'rejected')) return;
      commitHook = null;
      if (race === 'old_case') revise(t => { t.followUp.outcome = 'Esito corretto da operatore'; });
      else if (race === 'old_preparation') revise(t => { t.preparation.summary = 'Correzione operatore sulla proposta precedente'; });
      else if (race === 'new_message') revise(t => { t.followUp.lastMessageId = 'racing-inbound'; }, closedFixture.id);
      else if (race === 'recipient') save('conversations/' + CID, { ...DB.get('conversations/' + CID), contactPhone: '+393339999999' });
      else {
        const concurrent = structuredClone(DB.get('action_queue/' + closedFixture.actionId));
        concurrent.segretaria.delivery = { state: race === 'claimed' ? 'claimed' : 'sent', claimedAt: stamp(clock - 1000) };
        if (race === 'ack') concurrent.waSentAt = stamp(clock);
        save('action_queue/' + closedFixture.actionId, concurrent);
      }
    };
    r = await generate({ id: closedFixture.id });
    const oldAction = DB.get('action_queue/' + closedFixture.actionId);
    ok('CAS fra vecchio e nuovo caso conserva concorrente ' + race, r.code === 409 && !task(closedFixture.id).preparation
      && oldAction.status === 'executed' && task().status === 'done'
      && (race !== 'old_case' || task().followUp.outcome === 'Esito corretto da operatore')
      && (race !== 'old_preparation' || task().preparation.summary === 'Correzione operatore sulla proposta precedente')
      && (race !== 'claimed' || oldAction.segretaria.delivery.state === 'claimed')
      && (race !== 'ack' || !!oldAction.waSentAt)
      && (race !== 'new_message' || task(closedFixture.id).followUp.lastMessageId === 'racing-inbound')
      && (race !== 'recipient' || DB.get('conversations/' + CID).contactPhone === '+393339999999'), r);
  }
  closedFixture = await closedDeliveryNextCase();
  aiHook = async () => save('action_queue/other-owner', { kind: 'reply', status: 'approved', proposedBy: 'gestore',
    payload: { channel: 'whatsapp', conversationId: CID, phone: PHONE, draft: 'Altra risposta già affidata' } });
  r = await generate({ id: closedFixture.id });
  ok('nuovo owner durante AI impedisce esclusione e retirement del vecchio', r.code === 409
    && r.error === 'reply_owner_changed_reload' && !task(closedFixture.id).preparation
    && DB.get('action_queue/' + closedFixture.actionId).status === 'executed', r);

  closedFixture = await closedDeliveryNextCase();
  const siblingActionId = 'sgreply_' + 'b'.repeat(40), siblingTask = structuredClone(task());
  siblingTask.preparation.approval.actionId = siblingActionId;
  save('operatorTasks/' + ID2, siblingTask);
  const siblingAction = structuredClone(DB.get('action_queue/' + closedFixture.actionId));
  siblingAction.segretaria.caseId = ID2;
  save('action_queue/' + siblingActionId, siblingAction);
  r = await generate({ id: closedFixture.id });
  ok('più vecchi owner provati della stessa chat vengono dismessi insieme alla nuova proposta', r.code === 200 && !!r.preparation.draft
    && DB.get('action_queue/' + siblingActionId).status === 'rejected'
    && DB.get('action_queue/' + closedFixture.actionId).status === 'rejected'
    && task().status === 'done' && task(ID2).status === 'done', r.code);

  closedFixture = await closedDeliveryNextCase();
  r = await generate({ id: closedFixture.id, budget: { afford: () => false } });
  ok('ricerca vecchi owner rispetta budget senza retirement parziale o modello', r.code === 503
    && r.error === 'preparation_time_budget' && aiHits === 1 && !task(closedFixture.id).preparation
    && DB.get('action_queue/' + closedFixture.actionId).status === 'executed', r);

  closedFixture = await closedDeliveryNextCase();
  const competingCases = await Promise.all([generate({ id: closedFixture.id }), generate({ id: closedFixture.id })]);
  ok('due preparazioni B concorrenti dismettono A e preparano una sola volta', competingCases.filter(x => x.code === 200).length === 1
    && competingCases.filter(x => x.code === 409).length === 1 && aiHits === 2
    && DB.get('action_queue/' + closedFixture.actionId).status === 'rejected' && !!task(closedFixture.id).preparation.draft,
    competingCases.map(x => x.code));

  reset(); save('settings/segretaria', { enabled: true, prepareCases: false });
  r = await endpoint(workerEndpoint, { method: 'GET', token: 'fixture-cron' });
  ok('worker spento non legge casi, non spende e non modifica dati', r.httpCode === 200 && !r.enabled && !aiHits && !writes.length, r);
  reset(); save('settings/segretaria', { enabled: false, prepareCases: true });
  r = await generate(); ok('interruttore globale blocca anche generazione manuale', r.code === 409 && !aiHits && !writes.length, r);

  reset(); aiBuilder = () => ({ invalid: true });
  await prepareNextCase({ now: NOW });
  const reviewList = await endpoint(followUpEndpoint, { method: 'GET' });
  ok('output rifiutato dal worker diventa revisione visibile nel GET reale',
    task().preparationRetry?.state === 'review_required' && reviewList.rows[0].preparationReview?.reason === 'invalid_preparation', reviewList);
  aiBuilder = null;
  r = await generate();
  const repairedList = await endpoint(followUpEndpoint, { method: 'GET' });
  const repairedDetail = await endpoint(followUpEndpoint, { method: 'GET', query: { id: ID } });
  ok('preparazione manuale riuscita cancella atomicamente errore precedente ed espone la nuova proposta',
    r.code === 200 && r.preparation.status === 'ready' && task().preparationRetry === null && task().preparationError === null
    && repairedList.rows[0].preparationReview === null && repairedDetail.task.preparationReview === null
    && repairedDetail.task.preparation.revision === r.preparation.revision && untouched(), r);
  revise(t => { t.preparationRetry = { state: 'review_required', reason: 'invalid_preparation', messageId: 'm1',
    version: 4, followUpFingerprint: t.preparation.followUpFingerprint }; t.preparationError = 'invalid_preparation'; });
  const beforeRecoveryHits = aiHits, beforeRecoveryRevision = task().preparation.revision;
  r = await generate();
  ok('cache valida ripulisce marker obsoleto senza rigenerare o mutare la proposta', r.cached && aiHits === beforeRecoveryHits
    && r.preparation.revision === beforeRecoveryRevision && task().preparationRetry === null && task().preparationError === null && untouched(), r);
  revise(t => { t.preparationRetry = { state: 'retry_wait' }; });
  beforePatch = async () => revise(t => { t.followUp.lastMessageId = 'm2'; });
  r = await generate();
  ok('pulizia marker su cache protegge nuovo evento concorrente', r.code === 409 && r.error === 'new_message_reload'
    && task().followUp.lastMessageId === 'm2' && task().preparationRetry.state === 'retry_wait' && aiHits === beforeRecoveryHits, r);

  reset(); addSecond(); aiHook = async () => { if (aiHits === 1) throw new Error('fixture_first_failure'); };
  const first = await prepareNextCase({ now: NOW }), second = await prepareNextCase({ now: NOW });
  ok('fallimento del primo caso resta visibile e il secondo viene preparato nello stesso run senza altre spese al retry', first.prepared === 1
    && first.id === ID2 && first.errors?.some(e => e.id === ID && e.error === 'preparation_unavailable')
    && task().preparationRetry && second.prepared === 0 && aiHits === 2 && untouched(), { first, second });

  reset(); addSecond(); failFirstTaskReads = 1;
  const transientRuns = [];
  for (let i = 0; i < 2; i++) {
    try { transientRuns.push(await prepareNextCase({ now: NOW })); }
    catch (e) { transientRuns.push({ thrown: e.message }); }
  }
  ok('errore iniziale fuori dal try AI diventa retry dichiarato e non affama il secondo caso',
    transientRuns.every(x => !x.thrown) && !!task().preparationRetry && !!task(ID2).preparation && aiHits === 1, transientRuns);

  reset(); addSecond(); failFirstTaskReads = Infinity;
  const unreadableRuns = [];
  for (let i = 0; i < 2; i++) {
    try { unreadableRuns.push(await prepareNextCase({ now: NOW })); }
    catch (e) { unreadableRuns.push({ thrown: e.message }); }
  }
  ok('primo caso sempre illeggibile non blocca gli altri nemmeno quando il retry locale non è scrivibile',
    unreadableRuns.every(x => !x.thrown) && !!task(ID2).preparation && aiHits === 1
    && unreadableRuns.some(x => x.errors?.some(e => e.id === ID && e.error === 'preparation_retry_not_saved')), unreadableRuns);

  reset(); listDelayMs = 30000;
  try { r = await prepareNextCase({ now: NOW }); } catch (e) { r = { thrown: e.message }; }
  ok('worker include lettura iniziale nel budget condiviso: dopo 30s non avvia modello', !r.thrown && aiHits === 0
    && !task().preparation, r);

  reset(); r = await endpoint(prepareEndpoint, { token: null, body: { op: 'generate', id: ID } });
  ok('endpoint preparazione senza identità restituisce 401 prima della spesa', r.httpCode === 401 && !aiHits && !writes.length, r);
  r = await endpoint(prepareEndpoint, { token: 'tenant', body: { op: 'generate', id: ID } });
  ok('utente non admin riceve 403 prima della spesa', r.httpCode === 403 && !aiHits && !writes.length, r);
  r = await endpoint(prepareEndpoint, { method: 'GET', body: { op: 'generate', id: ID } });
  ok('GET preparazione non genera o esegue', r.httpCode === 405 && !aiHits && !writes.length, r);
  r = await endpoint(workerEndpoint, { method: 'GET', token: 'tenant' });
  ok('worker rifiuta autenticazione diversa dal segreto cron prima della spesa', r.httpCode === 401 && !aiHits && !writes.length, r);
  const conv = { id: CID, ...DB.get('conversations/' + CID) };
  const dossier = await personaDossier({ phone: PHONE, email: EMAIL, conversationId: CID });
  await loadCaseContext({ task: task(), conversation: conv, dossier, now: NOW });
  ok('lettura dossier e fonti non prepara e non invia', !aiHits && !writes.length && untouched());

  reset(); addSecond(); aiBuilder = input => { const p = validProposal(input); p.draft = null;
    p.nextAction.waitingOn = 'valentino'; p.nextAction.waitingLabel = 'Valentino'; return p; };
  const a = await generate(), b = await generate({ id: ID2 });
  r = await endpoint(prepareEndpoint, { body: { op: 'approve_batch', items: [
    { id: ID, revision: a.preparation.revision, lastMessageId: 'm1' },
    { id: ID2, revision: 'obsolete', lastMessageId: 'm1' },
  ] } });
  ok('batch parziale dichiara incompletezza e separa conferma riuscita da revisione scaduta', r.httpCode === 200
    && r.complete === false && r.results?.[0].code === 200 && r.results?.[1].code === 409
    && task().followUp.confirmed && !task(ID2).followUp.confirmed && untouched(), r);

  reset(); addSecond(); aiBuilder = input => { const p = validProposal(input); p.draft = null;
    p.nextAction.waitingOn = 'valentino'; p.nextAction.waitingLabel = 'Valentino'; return p; };
  const timeA = await generate(), timeB = await generate({ id: ID2 });
  commitHook = async operations => {
    if (operations.some(op => op.update?.name.endsWith('/operatorTasks/' + ID))) clock += 30000;
  };
  r = await endpoint(prepareEndpoint, { body: { op: 'approve_batch', items: [
    { id: ID, revision: timeA.preparation.revision, lastMessageId: 'm1' },
    { id: ID2, revision: timeB.preparation.revision, lastMessageId: 'm1' },
  ] } });
  ok('budget batch esaurito marca secondo elemento non iniziato, senza approvazione nascosta', r.httpCode === 200
    && r.complete === false && r.results?.[0].code === 200 && r.results?.[1].started === false
    && r.results?.[1].error === 'batch_time_budget' && !task(ID2).preparation.approval && untouched(), r);

  for (const [name, action, expected, error] of [
    ['ricevuta WhatsApp presente', { status: 'executed', waSentAt: stamp(NOW - 1) }, 'sent', null],
    ['WhatsApp recente senza ricevuta', { status: 'executed', executedAt: stamp(NOW - 1) }, 'queued', null],
    ['WhatsApp senza data di esecuzione', { status: 'executed' }, 'needs_review', 'whatsapp_delivery_time_invalid'],
    ['WhatsApp non ritirato alla soglia di 48 ore', { status: 'executed', executedAt: stamp(NOW - 48 * 3600 * 1000) }, 'needs_review', 'whatsapp_delivery_expired'],
    ['claim WhatsApp scaduto senza ricevuta', { status: 'executed', segretaria: { delivery: { state: 'claimed', claimedAt: stamp(NOW - 120001) } } }, 'needs_review', 'whatsapp_delivery_unconfirmed'],
    ['consegna bloccata prima della claim', { status: 'executed', segretariaDeliveryBlock: { reason: 'reply_owner_changed' } }, 'needs_review', 'reply_owner_changed'],
    ['azione approvata ancora da eseguire', { status: 'approved' }, 'pending_execution', null],
  ]) {
    reset();
    const actionId = 'sgreply_' + 'd'.repeat(40);
    revise(t => { t.preparation = { approval: { actionId } }; });
    save('action_queue/' + actionId, { kind: 'reply', payload: { channel: 'whatsapp', conversationId: CID, phone: PHONE }, ...action });
    const originalTask = JSON.stringify(task()), originalQueue = JSON.stringify(rows('action_queue'));
    r = await endpoint(followUpEndpoint, { method: 'GET', query: { id: ID } });
    ok('GET dettaglio rilegge ' + name + ' senza modello, executor o scrittura', r.httpCode === 200
      && r.task.deliveryResult?.delivery === expected && (!error || r.task.deliveryResult?.error === error)
      && aiHits === 0 && writes.length === 0 && !network.length && !globalThis.__mails.length
      && JSON.stringify(task()) === originalTask && JSON.stringify(rows('action_queue')) === originalQueue, r.task?.deliveryResult || r);
  }

  reset();
  const listBase = structuredClone(task());
  for (let i = 1; i <= 22; i++) {
    const id = 'sg_' + i.toString(16).padStart(32, '0'), actionId = 'sgreply_' + i.toString(16).padStart(40, '0');
    save('operatorTasks/' + id, { ...listBase, preparation: { approval: { actionId } } });
    save('action_queue/' + actionId, { kind: 'reply', status: 'executed', waSentAt: stamp(NOW - 1), payload: { channel: 'whatsapp' } });
  }
  r = await endpoint(followUpEndpoint, { method: 'GET' });
  const actionReads = reads.filter(p => p.startsWith('action_queue/')).length;
  ok('GET elenco limita a 20 letture di esito e dichiara i due rimanenti da verificare', r.httpCode === 200
    && r.rows.length === 23 && r.deliveryIncomplete === true && actionReads === 20
    && r.rows.filter(t => t.deliveryResult?.delivery === 'sent').length === 20
    && r.rows.filter(t => t.deliveryResult?.delivery === 'needs_review').length === 2
    && aiHits === 0 && writes.length === 0 && !network.length && !globalThis.__mails.length, { actionReads, incomplete: r.deliveryIncomplete });
  const beyondCap = r.rows.find(t => t.deliveryResult?.delivery === 'needs_review');
  r = await endpoint(followUpEndpoint, { method: 'GET', query: { id: beyondCap.id } });
  ok('GET dettaglio verifica anche un esito escluso dal limite dell’elenco', r.httpCode === 200
    && r.task.deliveryResult?.delivery === 'sent' && reads.filter(p => p.startsWith('action_queue/')).length === 21
    && aiHits === 0 && writes.length === 0, r.task?.deliveryResult || r);

  reset();
  const legacyBefore = JSON.stringify(task());
  r = await endpoint(followUpEndpoint, { method: 'GET', query: { id: ID } });
  ok('GET admin del seguito precedente alle proposte conserva forma e dati senza inventare consegne', r.httpCode === 200
    && !('deliveryResult' in r.task) && JSON.stringify(task()) === legacyBefore
    && reads.every(p => !p.startsWith('action_queue/')) && !writes.length && !aiHits, r.httpCode);
  r = await endpoint(followUpEndpoint, { method: 'GET', token: null, query: { id: ID } });
  ok('GET anonimo resta 401 e non legge esiti né produce effetti', r.httpCode === 401 && !writes.length && !aiHits, r);
  r = await endpoint(followUpEndpoint, { method: 'GET', token: 'tenant', query: { id: ID } });
  ok('GET non admin resta 403 senza effetti', r.httpCode === 403 && !writes.length && !aiHits, r);

  const historicalChat = PHONE.slice(1) + '@s.whatsapp.net';
  const historicalRef = 'minieraThreads/' + crypto.createHash('sha1').update(historicalChat).digest('hex');
  const seedHistorical = () => save(historicalRef, { chatId: historicalChat, phone: PHONE, msgCount: 800,
    firstTs: NOW - 200 * 86400000, lastTs: NOW - 100 * 86400000, syncedAt: stamp(NOW - 86400000),
    firstInText: 'Hello, I was looking for an apartment.', lastInText: 'Thanks.',
    lastOutText: 'Il tecnico è disponibile venerdì.', inSample: 'Cerco un appartamento vicino alla metro.' });
  reset(); seedHistorical(); r = await generate();
  const historySource = (await loadCaseContext({ task: task(), conversation: { id: CID, ...DB.get('conversations/' + CID) },
    dossier: await personaDossier({ phone: PHONE, email: EMAIL, conversationId: CID }), now: NOW })).sources.find(s => s.ref === historicalRef);
  ok('sommario Miniera resta in archivio e impronta, ma non entra nei fatti inviati al modello', r.code === 200
    && historySource?.kind === 'historical_whatsapp_summary' && DB.has(historicalRef)
    && !aiInputs[0].sources.some(s => s.kind === 'historical_whatsapp_summary')
    && !JSON.stringify(aiInputs[0]).includes('vicino alla metro')
    && aiInputs[0].sources.some(s => s.id === 'messages/m1')
    && aiInputs[0].sources.some(s => s.kind === 'practice_record')
    && aiInputs[0].language === 'it' && aiInputs[0].languageEvidence.sourceId === 'messages/m1'
    && !aiInputs[0].calendar.references.some(ref => ref.sourceId === historicalRef)
    && !r.preparation.sources.some(s => s.ref === historicalRef)
    && r.preparation.coverage.historical.status === 'excluded_from_preparation'
    && r.preparation.coverage.reasons.includes('historical_summary_excluded') && untouched(), r);
  const historicalRevision = r.preparation?.revision;
  save(historicalRef, { ...DB.get(historicalRef), lastOutText: 'Campione corretto successivamente.' });
  r = await endpoint(prepareEndpoint, { body: { op: 'approve', id: ID, revision: historicalRevision, lastMessageId: 'm1' } });
  ok('una memoria storica cambiata invalida la conferma come ogni altra fonte', r.httpCode === 409
    && r.error === 'preparation_sources_changed' && !task().preparation.approval && untouched(), r);

  for (const section of ['facts', 'commitments', 'uncertainties', 'nextAction', 'draft', 'handoff']) {
    reset(); seedHistorical();
    aiBuilder = input => {
      const p = validProposal(input), source = historySource;
      const statement = Array.isArray(p[section]) ? p[section][0] : p[section];
      statement.sourceIds = [source.id]; statement.quote = source.text.slice(0, 100);
      return p;
    };
    r = await generate();
    ok('campioni storici non possono sostenere ' + section + ' anche con citazione letterale', r.code === 422
      && !task().preparation && untouched(), r);
  }
  reset({ text: 'Potete verificare venerdì 18 settembre alle 15:00?' });
  for (let n = 0; n < 90; n++) save('messages/old' + n, { conversationId: CID, direction: 'in', channel: 'whatsapp',
    at: stamp(NOW - (n + 2) * 60000), body: 'Messaggio storico numero ' + n });
  r = await generate();
  ok('il calendario conserva l’evento attuale anche con 90 messaggi precedenti', r.code === 200
    && aiInputs[0].calendar.references.some(ref => ref.sourceId === 'messages/m1')
    && aiInputs[0].sources.filter(s => s.kind === 'message').length === 91 && untouched(), r);

  // Each mutation runs this same real-module suite in its own disposable tree.
  if (!process.env.BOOM_PREPARATION_MUTANT && !fails) {
    const fs = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const mutants = [
      { name: 'campioni storici non sono prove attuali', file: 'js/segretaria-proposta-engine.js',
        from: "sourceIds.filter(id => sourceKinds[id] !== 'historical_whatsapp_summary')", to: 'sourceIds' },
      { name: 'l’evento attuale precede la vecchia storia nel calendario', file: 'api/segretaria/_prepare.js',
        from: 'sources: calendarSources, now', to: 'sources: context.sources, now' },
      { name: 'calendario applicato alla proposta finale', file: 'api/segretaria/_prepare.js',
        from: 'if (!calendarCheck.ok)', to: 'if (false)' },
      { name: 'intenzione italiana incoerente resta in revisione', file: 'api/segretaria/_prepare.js',
        from: 'if (!timing.ok) {', to: 'if (false) {' },
      { name: 'guardia aggiorna la rappresentazione locale del controllo anticipato', file: 'api/segretaria/_prepare.js',
        from: '? CALENDAR.romeLocalInstant(proposal.nextAction.checkAt) : timing.checkLocal', to: '? timing.checkLocal : timing.checkLocal' },
      { name: 'revisioni precedenti non cancellate da una versione nuova', file: 'js/segretaria-proposta-engine.js',
        from: "|| task.preparation.status === 'needs_context')", to: ')' },
      { name: 'revisione non rigenerata solo perché ricontrollo scaduto', file: 'api/segretaria/_prepare.js',
        from: "task.preparation.status === 'needs_context' || !recheckFor", to: '!recheckFor' },
      { name: 'successo manuale elimina revisione fallita precedente', file: 'api/segretaria/_prepare.js',
        from: 'fields: { preparation, preparationError: null, preparationRetry: null }', to: 'fields: { preparation, preparationError: null }' },
      { name: 'impegno eventuale e reazioni', file: 'js/segretaria-proposta-engine.js',
        from: 'if (!evidence.ok) return evidence;', to: 'if (false) return evidence;' },
      { name: 'verifica interna prima della bozza', file: 'js/segretaria-proposta-engine.js',
        from: "if (raw.draft && Array.isArray(raw.commitments)", to: "if (false && raw.draft && Array.isArray(raw.commitments)" },
      { name: 'lingua dalle parole del contatto', file: 'api/segretaria/_prepare.js',
        from: 'preparationLanguage(context.sources)', to: "({ code: replyLang({ message: lastSource?.text }), basis: 'incoming_text', sourceId: lastSource?.id })" },
      { name: 'lingua della bozza', file: 'api/segretaria/_prepare.js',
        from: 'if (draftLanguage && draftLanguage !== language)', to: 'if (false)' },
      { name: 'approvazione proposta obsoleta', file: 'api/segretaria/_dispatch.js',
        from: 'if (p.version !== PROPOSTA.VERSION)', to: 'if (false)' },
      { name: 'ready scaduta non resta nella cache dello stesso ricontrollo', file: 'api/segretaria/_prepare.js',
        from: '&& !PROPOSTA.approvalExpired(task.preparation, now)', to: '' },
      { name: 'scadenza include lo stesso istante del ricontrollo', file: 'js/segretaria-proposta-engine.js',
        from: 'Number.isFinite(at) && at <= now', to: 'Number.isFinite(at) && at < now' },
      { name: 'citazione letterale', file: 'js/segretaria-proposta-engine.js',
        from: "!sourceIds.some(id => norm(sourceTexts[id]).includes(norm(quote)))", to: 'false' },
      { name: 'veto richiesta umana', file: 'js/segretaria-proposta-engine.js',
        from: 'if (identityBlocked || protectedTopic || humanRequested || !practiceRef) draft = null;', to: 'if (identityBlocked || protectedTopic || !practiceRef) draft = null;' },
      { name: 'veto pratica altrui/ambigua', file: 'js/segretaria-proposta-engine.js',
        from: 'if (practiceRef && (!allowed.has(practiceRef)', to: 'if (false && practiceRef && (!allowed.has(practiceRef)' },
      { name: 'continuità della pratica confermata', file: 'js/segretaria-proposta-engine.js',
        from: 'n.practiceRef || (!identityBlocked && allowed.has(confirmedPracticeRef) ? confirmedPracticeRef : null)', to: 'n.practiceRef || null' },
      { name: 'nessuna attesa senza richiesta o incarico', file: 'js/segretaria-proposta-engine.js',
        from: "if (proposal.draft || !['client', 'collaborator'].includes(n.waitingOn)) return n;",
        to: "if (true || proposal.draft || !['client', 'collaborator'].includes(n.waitingOn)) return n;" },
      { name: 'richiamo verificato non azzerato dalla guardia generica', file: 'js/segretaria-proposta-engine.js',
        from: 'confirmedWait || provenCallbackWait(proposal, { ...evidence, now })', to: 'confirmedWait' },
      { name: 'revoca successiva prevale sulla citazione di richiamo', file: 'js/segretaria-proposta-engine.js',
        from: 'if (!superseded) return true;', to: 'return true;' },
      { name: 'allegato non letto non diventa riscontro testuale puro', file: 'js/segretaria-proposta-engine.js',
        from: "s.messageKind === 'text' && readable(s)", to: 'readable(s)' },
      { name: 'promessa di richiamo prova soltanto la stessa attesa', file: 'js/segretaria-proposta-engine.js',
        from: '!CALLBACK_WAIT.test(callbackNorm(n.text))', to: 'false' },
      { name: 'finestra ordinata parziale non prova continuità della promessa', file: 'api/segretaria/_prepare.js',
        from: 'context.coverage.history?.ordered === true && context.coverage.history?.limited !== true',
        to: 'context.coverage.history?.ordered === true' },
      { name: 'motivazione coerente con ricontrollo anticipato', file: 'js/segretaria-proposta-engine.js',
        from: "(preserveEarlier ? ' Mantengo il ricontrollo interno precedente, più vicino.' : ' Il ricontrollo proposto resta una verifica interna.')",
        to: 'n.reason' },
      { name: 'attesa non provata richiede revisione prima di approvare', file: 'api/segretaria/_prepare.js',
        from: 'if (proposal.nextAction.requiresReview) {', to: 'if (false) {' },
      { name: 'sommario storico escluso anche da sintesi non citata', file: 'api/segretaria/_prepare.js',
        from: "context.sources.filter(s => s.kind !== 'historical_whatsapp_summary')", to: 'context.sources' },
      { name: 'risposta concorrente durante AI', file: 'api/segretaria/_prepare.js',
        from: 'if (sha(freshReplyOwner) !== replyOwnerFingerprint)', to: 'if (false)' },
      { name: 'cache della decisione manuale', file: 'api/segretaria/_prepare.js',
        from: '(task.preparation.approval?.followUpFingerprint || task.preparation.followUpFingerprint) === followUpFingerprint', to: 'true' },
      { name: 'cache richiede contesto corrente anche con impronta identica', file: 'api/segretaria/_prepare.js',
        from: 'PROPOSTA.currentContext(task)', to: 'PROPOSTA.current(task)' },
      { name: 'cache preserva proposte già approvate con contesto precedente', file: 'js/segretaria-proposta-engine.js',
        from: '!!task.preparation.approval || task.preparation.coverage?.version === CONTEXT_VERSION',
        to: 'task.preparation.coverage?.version === CONTEXT_VERSION' },
      { name: 'scadenza non resta nella cache approvata', file: 'api/segretaria/_prepare.js',
        from: 'if (!expiresUnclaimed && !retirements.length && PROPOSTA.currentContext(task)', to: 'if (!retirements.length && PROPOSTA.currentContext(task)' },
      { name: 'scadenza richiede azione mai ritirata', file: 'api/segretaria/_delivery-guard.js',
        from: "|| action.segretaria.execution?.state !== 'started' || action.segretaria.delivery", to: "|| action.segretaria.execution?.state !== 'started'" },
      { name: 'scadenza rispetta CAS azione concorrente', file: 'api/segretaria/_prepare.js',
        from: 'precondition: { updateTime: priorSnapshot.updateTime }', to: 'precondition: { exists: true }' },
      { name: 'scadenza richiede vecchia approvazione coerente', file: 'api/segretaria/_delivery-guard.js',
        from: '&& receipt.approvedBy === s.reviewedBy && receipt.approvedAt === s.reviewedAt', to: '' },
      { name: 'risoluzione vecchio caso richiede stessa conversazione', file: 'api/segretaria/_prepare.js',
        from: '|| action.data.segretaria.conversationId !== conversation.id', to: '' },
      { name: 'risoluzione vecchio caso conserva CAS della prova chiusa', file: 'api/segretaria/_prepare.js',
        from: 'precondition: { updateTime: retirement.task.updateTime }', to: 'precondition: { exists: true }' },
      { name: 'risoluzione vecchio caso conserva CAS della azione', file: 'api/segretaria/_prepare.js',
        from: 'precondition: { updateTime: retirement.action.updateTime }', to: 'precondition: { exists: true }' },
      { name: 'esclusione owner richiede dismissione nello stesso commit', file: 'api/segretaria/_prepare.js',
        from: "docPath: 'action_queue/' + retirement.id, fields: { status: 'rejected'", to: "docPath: 'action_queue/' + retirement.id, fields: { status: 'executed'" },
      { name: 'consegna precedente incerta', file: 'api/segretaria/_prepare.js',
        from: 'if (task.preparation?.approval?.actionId) {', to: 'if (false && task.preparation?.approval?.actionId) {' },
    ];
    for (const mutant of mutants) {
      const scratch = await fs.mkdtemp(join(tmpdir(), 'boom-preparation-mutation-'));
      try {
        await fs.cp(root + 'api', scratch + '/api', { recursive: true });
        await fs.cp(root + 'js', scratch + '/js', { recursive: true });
        await fs.mkdir(scratch + '/tests/segretaria', { recursive: true });
        await fs.cp(root + 'tests/notify', scratch + '/tests/notify', { recursive: true });
        await fs.copyFile(root + 'tests/segretaria/preparation.mjs', scratch + '/tests/segretaria/preparation.mjs');
        const path = scratch + '/' + mutant.file, source = await fs.readFile(path, 'utf8');
        if (!source.includes(mutant.from)) throw new Error('mutation_target_missing: ' + mutant.name);
        await fs.writeFile(path, source.replace(mutant.from, mutant.to));
        const run = spawnSync(process.execPath, [scratch + '/tests/segretaria/preparation.mjs'], {
          encoding: 'utf8', timeout: 30000, env: { ...process.env, BOOM_PREPARATION_MUTANT: '1' },
        });
        ok('mutazione intercettata: ' + mutant.name, run.status !== 0 && /^FAIL /m.test(run.stdout), run.status === 0 ? 'mutation survived' : run.stderr.slice(0, 200));
      } finally { await fs.rm(scratch, { recursive: true, force: true }); }
    }
  }
} catch (error) { ok('nessuna eccezione fuori contratto', false, { message: error.message, stack: error.stack }); }
finally { Date.now = realNow; }
console.log(`\nPreparation: ${checks - fails}/${checks} PASS`);
process.exitCode = fails ? 1 : 0;
