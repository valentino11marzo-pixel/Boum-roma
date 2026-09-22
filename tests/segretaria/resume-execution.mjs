// Real proposal approval, identity dossier and executor; only external I/O is fake.
import { register } from 'node:module';
register(new URL('../notify/loader.mjs', import.meta.url), import.meta.url);
import assert from 'node:assert/strict';
Object.assign(process.env, { FIREBASE_API_KEY: 'fixture', FIREBASE_ADMIN_EMAIL: 'admin@example.test',
  FIREBASE_ADMIN_PASS: 'fixture', HOMIE_SECRET: 'fixture' });

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
let sequence = 0, failingCollection = '', beforePatch = null, commitHook = null, failResult = false, failClaim = false;
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
const { approvePreparation } = await import('../../api/segretaria/_dispatch.js');
const { default: execute } = await import('../../api/agent/execute.js');
const { personaDossier } = await import('../../api/segretaria/_persona.js');
const { loadCaseContext, contextFingerprint, contactFingerprint } = await import('../../api/segretaria/_context.js');
const { followUpDecisionHash } = await import('../../api/segretaria/_follow-up.js');
const CID = 'conv_lead_leadA', ID = 'sg_' + 'a'.repeat(32);
const conv = { contactType: 'lead', contactId: 'leadA', leadId: 'leadA', contactName: 'Persona fixture',
  contactPhone: '+393331234567', contactEmail: 'client@example.test' };
const args = { id: ID, revision: 'revision-1', lastMessageId: 'message-1', actor: 'admin-fixture', now: NOW };
const rows = collection => [...DB].filter(([p]) => p.startsWith(collection + '/'));
const task = () => DB.get('operatorTasks/' + ID);
function revise(fn) { const t = structuredClone(task()); fn(t); save('operatorTasks/' + ID, t); }
async function reset() {
  DB.clear(); versions.clear(); writes.length = 0; network.length = 0; globalThis.__mails.length = 0;
  sequence = 0; failingCollection = ''; beforePatch = null; commitHook = null; failResult = false; failClaim = false;
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


const { readPreparationDelivery } = await import('../../api/segretaria/_dispatch.js');
const { postinoTick } = await import('../../api/telegram/_postino.js');
const { prepareNextCase } = await import('../../api/segretaria/worker.js');
const fs = await import('node:fs');
const vm = await import('node:vm');

await reset();
revise(t => { t.preparation.coverage = {version:PROPOSTA.CONTEXT_VERSION}; });
failClaim=true;
const failed=await approvePreparation(args);
failClaim=false;
assert.equal(failed.delivery,'pending_execution');
assert.equal(rows('messageLog').length,0);
const uiSource=fs.readFileSync(process.env.BOOM_UI_SOURCE || new URL('../../js/portal-app.js',import.meta.url),'utf8');
const helperStart=uiSource.indexOf('    function oggiSegretariaCanResume(');
const helperEnd=uiSource.indexOf('    function oggiSegretariaRecipient(',helperStart);
const uiStart=uiSource.indexOf('    async function oggiSegretariaPrepare(operation)');
const uiEnd=uiSource.indexOf('    async function oggiSegretariaSave()',uiStart);
assert.ok(helperStart>0&&helperEnd>helperStart&&uiStart>0&&uiEnd>uiStart);
const {default: EXECUTION}=await import('../../js/segretaria-esecuzione-engine.js');
const current=async()=>({task:{...structuredClone(task()),id:ID,deliveryResult:await readPreparationDelivery(ID,task().preparation.approval.actionId,true)},dossier:{}});
let postCalls=0,getCalls=0,preflight=null;
const ui={window:{BOOM_SEGRETARIA_ESECUZIONE:EXECUTION},oggiSegretaria:{modal:{...(await current()),id:ID,mode:'execute',busy:false},receipts:{},rows:[]},
 oggiSegretariaLegacyCap:()=>false,oggiSegretariaPreparation:t=>t?.preparation,
 oggiSegretariaRequest:async(id,payload)=>{
  if(!payload){getCalls++;return preflight?preflight():current()}
  postCalls++;assert.equal(payload.op,'approve');assert.equal(payload.id,ID);assert.equal(payload.revision,args.revision);assert.equal(payload.lastMessageId,args.lastMessageId);
  return approvePreparation({...payload,actor:args.actor,now:NOW});
 },oggiSegretariaRecipient:()=>true,oggiSegretariaModalRender:()=>{},oggiSegretariaRender:()=>{},oggiSegretariaLoad:()=>{},oggiSegretariaError:e=>String(e?.code)};
vm.createContext(ui);vm.runInContext(uiSource.slice(helperStart,helperEnd)+'\n'+uiSource.slice(uiStart,uiEnd),ui);
assert.equal(ui.oggiSegretariaCanResume(ui.oggiSegretaria.modal),true);
await ui.oggiSegretariaPrepare('resume');
assert.equal(postCalls,1);assert.equal(getCalls,2);
assert.equal(rows('action_queue').length,1);assert.equal(rows('messageLog').length,1);
assert.equal(ui.oggiSegretaria.modal.task.deliveryResult.delivery,'queued');
assert.equal(ui.oggiSegretariaCanResume(ui.oggiSegretaria.modal),false);
console.log('PASS pre-claim failure resumes the same approval through the real executor: one action, one effect');
const base=structuredClone(ui.oggiSegretaria.modal);
base.task.deliveryResult={...failed,delivery:'pending_execution'};
const cases=[
 ['queued',m=>m.task.deliveryResult.delivery='queued'],
 ['sent',m=>m.task.deliveryResult.delivery='sent'],
 ['needs_review',m=>m.task.deliveryResult.delivery='needs_review'],
 ['claimed',m=>m.task.deliveryResult.delivery='claimed'],
 ['unknown',m=>m.task.deliveryResult=null],
 ['timeout',m=>m.uncertain=true],
 ['different_action',m=>m.task.deliveryResult.actionId='other'],
 ['different_case',m=>m.task.deliveryResult.id='other'],
 ['unconfirmed',m=>m.task.deliveryResult.confirmed=false],
 ['new_message',m=>m.task.followUp.lastMessageId='new'],
 ['new_revision',m=>m.task.preparation.revision='new'],
 ['closed',m=>m.task.status='closed'],
 ['regenerate',m=>m.mustRegenerate=true],
];
for(const[label,mutate]of cases){
 ui.oggiSegretaria.modal=structuredClone(base);mutate(ui.oggiSegretaria.modal);
 assert.equal(ui.oggiSegretariaCanResume(ui.oggiSegretaria.modal),false,label);
 const before=postCalls+getCalls;await ui.oggiSegretariaPrepare('resume');assert.equal(postCalls+getCalls,before,label+' must not request execution');
}
console.log('PASS 13 unsafe, stale, or mismatched receipts expose no retry and perform no request');
ui.oggiSegretaria.modal=structuredClone(base);
const before=postCalls;await ui.oggiSegretariaPrepare('resume');
assert.equal(postCalls,before);assert.match(ui.oggiSegretaria.modal.notice,/stato è cambiato/);
console.log('PASS pending receipt raced by another tab is refreshed to queued before any POST');
ui.oggiSegretaria.modal=structuredClone(base);preflight=()=>{throw {code:'timeout'}};
await ui.oggiSegretariaPrepare('resume');assert.equal(postCalls,before);assert.equal(ui.oggiSegretaria.modal.uncertain,true);
console.log('PASS failed freshness check requires reload and never retries the executor');
assert.equal(network.length,0);assert.equal(globalThis.__mails.length,0);
Date.now=realNow;
console.log('All resume checks passed with real handlers and UI functions; external I/O disabled.');
