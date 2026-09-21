// Real approval, executor and outbox handlers; only external I/O is fake.
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);
Object.assign(process.env, { FIREBASE_API_KEY: 'fixture', FIREBASE_ADMIN_EMAIL: 'admin@example.test',
  FIREBASE_ADMIN_PASS: 'fixture', HOMIE_SECRET: 'fixture', FIREBASE_PROJECT_ID: 'p' });

const NOW = Date.parse('2026-09-14T10:00:00Z');
const realNow = Date.now;
Date.now = () => NOW;
const DB = new Map(), versions = new Map(), writes = [], allWrites = [], network = [];
globalThis.__mails = [];
let sequence = 0, failingCollection = '', beforePatch = null, commitHook = null, queryHook = null, failResult = false, failClaim = false;
const queries = [];
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
    if (commitHook) await commitHook(operations);
    if (failClaim && operations.some(w => w.update?.fields?.segretaria?.mapValue?.fields?.execution)) return json({ error: { status: 'UNAVAILABLE' } }, 503);
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
    queries.push(coll);
    if (queryHook) await queryHook(q, coll);
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
    const value = (entry, key) => key === '__name__' ? doc(entry[0]).name : field(entry[1], key);
    for (const sort of [...(q.orderBy || [])].reverse()) entries.sort((a, b) =>
      String(value(a, sort.field.fieldPath)).localeCompare(String(value(b, sort.field.fieldPath))) * (sort.direction === 'DESCENDING' ? -1 : 1));
    if (q.startAt) {
      const cursor = q.startAt.values[0].referenceValue;
      entries = entries.filter(entry => q.startAt.before ? doc(entry[0]).name >= cursor : doc(entry[0]).name > cursor);
    }
    return json(entries.slice(0, q.limit || 1000).map(([p]) => ({ document: doc(p) })));
  }
  const path = decodeURIComponent(url.pathname.split('/documents/')[1] || '');
  if (failingCollection && path.startsWith(failingCollection + '/')) return json({ error: { status: 'UNAVAILABLE' } }, 503);
  if (failResult && path.startsWith('action_queue/') && opts.method === 'PATCH' && dec(body.fields?.status || {nullValue:null}) === 'executed') return json({error:{status:'UNAVAILABLE'}}, 503);
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

const { default: PROPOSTA } = await import('../../js/segretaria-proposta-engine.js');
const { approvePreparation, readPreparationDelivery } = await import('../../api/segretaria/_dispatch.js');
const { default: execute } = await import('../../api/agent/execute.js');
const { personaDossier } = await import('../../api/segretaria/_persona.js');
const { loadCaseContext, contextFingerprint, contactFingerprint } = await import('../../api/segretaria/_context.js');
const { followUpDecisionHash } = await import('../../api/segretaria/_follow-up.js');
const { executionPayloadHash } = await import('../../api/segretaria/_execution-guard.js');
const CID = 'conv_lead_leadA', ID = 'sg_' + 'a'.repeat(32);
const conv = { contactType: 'lead', contactId: 'leadA', leadId: 'leadA', contactName: 'Persona fixture',
  contactPhone: '+393331234567', contactEmail: 'client@example.test' };
const args = { id: ID, revision: 'revision-1', lastMessageId: 'message-1', actor: 'admin-fixture', now: NOW };
const rows = collection => [...DB].filter(([p]) => p.startsWith(collection + '/'));
const task = () => DB.get('operatorTasks/' + ID);
function revise(fn) { const t = structuredClone(task()); fn(t); save('operatorTasks/' + ID, t); }
async function reset() {
  Date.now = () => NOW;
  DB.clear(); versions.clear(); writes.length = 0; network.length = 0; globalThis.__mails.length = 0;
  sequence = 0; failingCollection = ''; beforePatch = null; commitHook = null; queryHook = null; queries.length = 0; failResult = false; failClaim = false;
  save('conversations/' + CID, { ...conv });
  save('messages/message-1', { conversationId: CID, direction: 'in', body: 'Verificare il seguito', at: new Date(NOW).toISOString() });
  save('leads/leadA', { phone: conv.contactPhone, email: conv.contactEmail, propertyId: 'pA' });
  save('properties/pA', { name: 'Immobile fixture', status: 'available' });
  save('contracts/cA', { linkedLeadId: 'leadA', propertyId: 'pA', status: 'active' });
  save('operatorTasks/' + ID, { source: 'segretaria', status: 'open', calendarize: false,
    followUp: { open: true, conversationId: CID, lastMessageId: args.lastMessageId,
      lastInboundAt: new Date(NOW).toISOString(), preview: 'Verificare il seguito', needsReview: true },
    preparation: { version: PROPOSTA.VERSION, revision: args.revision, messageId: args.lastMessageId, status: 'ready', createdAt: new Date(NOW).toISOString(),
      summary: 'Aggiornare il cliente sul seguito', recommendation: 'Confermare il ricontrollo concordato', identityBlocked: false,
      contactFingerprint: contactFingerprint(conv), recipientPreview: { channel: 'whatsapp', address: conv.contactPhone, name: conv.contactName },
      nextAction: { text: 'Verificare la risposta del cliente', waitingOn: 'client', waitingLabel: 'Cliente',
        checkAt: new Date(NOW + 86400000).toISOString(), practiceRef: 'contracts/cA', sourceIds: ['source-1'] },
      draft: { channel: 'whatsapp', text: 'Ricevuto, ricontrolliamo domani.', sourceIds: ['source-1'] },
      handoff: { needed: false, reason: '' }, sources: [{ id: 'source-1', ref: 'contracts/cA', at: new Date(NOW).toISOString(), hash: 'fixture-source' }] } });
  const dossier = await personaDossier({ phone: conv.contactPhone, email: conv.contactEmail, leadId: conv.leadId, conversationId: CID });
  const context = await loadCaseContext({ task: task(), conversation: { id: CID, ...conv }, dossier, now: NOW });
  revise(t => { t.preparation.sourceFingerprint = contextFingerprint(context);
    t.preparation.followUpFingerprint = followUpDecisionHash(t.followUp); });
}
async function callExecutor(body) {
  let code, out;
  await execute({ method: 'POST', body, headers: { 'x-homie-secret': 'fixture' } }, {
    status(n) { code = n; return this; }, json(v) { out = v; return this; }, setHeader() {}, end() {},
  });
  return { code, ...out };
}

const { default: single } = await import('../../api/homie/wa-outbox-single.js');
async function callSingle(body, { method = 'POST', headers = { 'x-homie-secret': 'fixture' } } = {}) {
  let code, output;
  await single({ method, body, headers }, {
    status(n) { code = n; return this; }, json(v) { output = v; return this; }, setHeader() {}, end() {},
  });
  return { code, ...output };
}
async function ready({ text } = {}) {
  await reset();
  if (text !== undefined) revise(t => { t.preparation.draft.text = text; });
  const result = await approvePreparation(args);
  if (result.delivery !== 'queued') throw new Error('fixture approval failed: ' + JSON.stringify(result));
  return result.actionId;
}
function setHooks(hooks = {}) {
  if ('beforePatch' in hooks) beforePatch = hooks.beforePatch;
  if ('commitHook' in hooks) commitHook = hooks.commitHook;
  if ('queryHook' in hooks) queryHook = hooks.queryHook;
  if ('failingCollection' in hooks) failingCollection = hooks.failingCollection;
}
export { ready, reset, callSingle, single, callExecutor, approvePreparation, args, DB, versions, save,
  task, revise, conv, CID, ID, NOW, realNow, queries, writes, allWrites, network, setHooks, executionPayloadHash };
