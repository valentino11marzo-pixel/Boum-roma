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
const { followUpDecisionHash, captureFollowUp } = await import('../../api/segretaria/_follow-up.js');
const { default: CALENDAR } = await import('../../js/segretaria-calendar-engine.js');
const { default: workerEndpoint, prepareNextCase } = await import('../../api/segretaria/worker.js');
const ID = 'sg_' + 'a'.repeat(32), ID2 = 'sg_' + 'b'.repeat(32), CID = 'conv_tenant_tenantA';
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

const { default: messageHandler } = await import('../../api/homie/message.js');
const { approvePreparation } = await import('../../api/segretaria/_dispatch.js');
const { default: PRIORITY } = await import('../../js/segretaria-priority-engine.js');
const { claimSegretariaDelivery, acknowledgeSegretariaDelivery } = await import('../../api/segretaria/_delivery-guard.js');
async function tracked() {
  reset();
  await captureFollowUp({cid:CID,conv:{contactName:'Fixture'},messageId:'m1',text:'Potete aggiornarmi sulla disponibilità del tecnico?',now:NOW-10000});
  revise(t => { Object.assign(t.followUp,{nextAction:'Verificare il documento',waitingOn:'client',waitingLabel:'Cliente fixture',
    confirmed:true,confirmedAt:stamp(NOW-5000),confirmedBy:'admin',checkAt:stamp(NOW+86400000),needsReview:false}); });
}
function message(mid, extra={}) {
  return endpoint(messageHandler,{headers:{'x-homie-secret':'fixture'},body:{contactType:'tenant',contactId:'tenantA',phone:PHONE,
    email:EMAIL,name:'Cliente fixture',channel:'whatsapp',direction:'out',body:'Ho controllato il documento e risolto la richiesta.',
    timestamp:stamp(clock+1000),messageId:mid,...extra}});
}
const copy = value => JSON.stringify(value);
try {
  await tracked();
  let prepared = await generate(), priorFollow = copy(task().followUp), priorProposal = copy(task().preparation);
  let out = await message('manual-out');
  ok('OUT invalida proposta senza cambiare ultimo inbound o decisione confermata',out.httpCode===200&&out.followUp?.tracked
    &&task().contextRevision===1&&!PROPOSTA.currentContext(task())&&copy(task().followUp)===priorFollow&&copy(task().preparation)===priorProposal,out);
  const stale = await approvePreparation({id:ID,revision:prepared.preparation.revision,lastMessageId:'m1',actor:'admin',now:clock});
  ok('conferma vecchia proposta rifiutata dopo OUT',stale.code===409&&stale.error==='preparation_sources_changed',stale);
  out = await tick();
  ok('worker rielabora OUT subito al ciclo successivo senza attendere la scadenza',out.prepared===1&&out.checked===1
    &&task().preparation.contextRevision===1&&PROPOSTA.currentContext(task())&&aiHits===2&&untouched(),out);
  out = await message('manual-out',{direction:'in',body:'REPLAY ALTERATO',timestamp:stamp(NOW+9000)});
  ok('replay OUT usa fonte persistita senza nuovo contesto né nuovo inbound',out.dedupHit&&task().contextRevision===1
    &&task().followUp.lastMessageId==='m1'&&rows('messages').length===2,out);

  await tracked(); await generate();
  revise(t=>{t.preparation.status='needs_context';t.preparationRetry=retryMarker(null,'review_required');});
  await message('out-after-review');
  ok('OUT supera needs_context e retry vecchi senza cambiare decisione',!PRIORITY.reviewCurrent(task(),{decisionFingerprint:followUpDecisionHash(task().followUp)})
    &&!PRIORITY.retryCurrent(task(),{decisionFingerprint:followUpDecisionHash(task().followUp)}));
  out=await tick();
  ok('review con nuove fonti torna al worker',out.prepared===1&&out.queue.awaitingReview===0&&task().preparationRetry===null,out);

  reset(); DB.delete('operatorTasks/'+ID);
  out=await message('only-out');
  ok('OUT da solo non crea un caso nemmeno con preparazione accesa',out.httpCode===200&&rows('operatorTasks').length===0&&!out.followUp,out);

  await tracked(); await generate(); priorFollow=copy(task().followUp);
  const replies=await Promise.all([message('same-out'),message('same-out')]);
  ok('due OUT uguali concorrenti: un messaggio e una invalidazione',replies.every(r=>r.httpCode===200&&r.followUp?.tracked)&&rows('messages').length===2
    &&task().contextRevision===1&&copy(task().followUp)===priorFollow,replies);

  await tracked();
  out=await message('recent-in',{direction:'in',timestamp:stamp(NOW+5000),body:'Fonte recente'});
  priorFollow=copy(task().followUp); const recentHead=DB.get('conversations/'+CID).lastMessageAt;
  await message('older-in',{direction:'in',timestamp:stamp(NOW+1000),body:'Fonte arrivata tardi'});
  ok('inbound tardivo resta in storia senza retrocedere testa o seguito',copy(task().followUp)===priorFollow
    &&DB.get('conversations/'+CID).lastMessageAt===recentHead&&rows('messages').length===3&&task().contextRevision===1);
  ok('inbound tardivo aggiunge unread senza perdere quelli più recenti',DB.get('conversations/'+CID).unread===2);
  await message('older-out',{timestamp:stamp(NOW),body:'Vecchia risposta'});
  ok('OUT tardivo non azzera unread successivi né sposta ultimo inbound',DB.get('conversations/'+CID).unread===2
    &&DB.get('conversations/'+CID).lastMessageAt===recentHead&&copy(task().followUp)===priorFollow);

  await tracked();
  const tied=await Promise.all([message('same-time-a',{direction:'in'}),message('same-time-b',{direction:'in'})]);
  ok('inbound distinti allo stesso timestamp non perdono messaggi o unread nelle corse',tied.every(r=>r.httpCode===200)
    &&rows('messages').length===3&&DB.get('conversations/'+CID).unread===2&&rows('operatorTasks').length===1,tied);
  const kept=task().followUp.lastMessageId;
  await message(kept==='same-time-a'?'same-time-b':'same-time-a',{direction:'in'});
  ok('replay di un pareggio non sostituisce testa o riconta unread',task().followUp.lastMessageId===kept&&DB.get('conversations/'+CID).unread===2);

  await tracked();
  const baseFetch=globalThis.fetch; let switched=false;
  globalThis.fetch=async (url,options={})=>{
    if(!switched&&String(url).includes('/documents/activityLog')&&options.method==='POST') {
      const data=JSON.parse(options.body);
      if(data.fields?.details?.mapValue?.fields?.preview?.stringValue==='Tie A') {
        switched=true; await message('tie-b',{direction:'in',body:'Tie B'});
      }
    }
    return baseFetch(url,options);
  };
  try {out=await message('tie-a',{direction:'in',body:'Tie A'});} finally {globalThis.fetch=baseFetch;}
  ok('tracking invertito dopo due commit primari con stesso timestamp conserva evento della testa',switched&&out.httpCode===200
    &&DB.get('conversations/'+CID).lastMessagePreview==='Tie B'&&task().followUp.lastMessageId==='tie-b'
    &&task().followUp.preview==='Tie B'&&rows('messages').length===3&&DB.get('conversations/'+CID).unread===2,out);
  const tieVersion=task().followUp.lastInboundVersion;
  await message('tie-a',{direction:'in',body:'REPLAY ALTERATO'});
  ok('retry del pareggio rilegge versione persistita senza retrocedere evento o versione',task().followUp.lastMessageId==='tie-b'
    &&task().followUp.lastInboundVersion===tieVersion&&DB.get('conversations/'+CID).unread===2);

  await tracked(); await generate();
  aiHook=async()=>{aiHook=null;await message('out-during-ai');};
  // Force a due recheck while generation is already looking at the old sources.
  revise(t=>{t.followUp.checkAt=stamp(NOW-1);});
  out=await generate();
  ok('OUT durante modello vince il CAS: nessuna proposta vecchia salvata',out.code===409&&out.error==='new_message_reload'
    &&task().contextRevision===1&&!PROPOSTA.currentContext(task()),out);

  await tracked();
  aiHook=async()=>{aiHook=null;await message('out-during-worker');};
  out=await tick();
  ok('worker concorrente non scrive retry del contesto precedente sul nuovo OUT',out.prepared===0&&task().contextRevision===1
    &&!task().preparationRetry&&!task().preparationCheckedAt&&out.queue.pending===1,out);

  await tracked(); await generate();
  const legacy=structuredClone(task()); delete legacy.contextRevision; delete legacy.preparation.contextRevision;
  ok('legacy zero resta corrente senza rigenerazione globale',PROPOSTA.currentContext(legacy));
  revise(t=>{t.preparation.approval={actionId:'fixture-approved',revision:t.preparation.revision,messageId:'m1'};});
  save('action_queue/fixture-approved',{status:'executed',payload:{channel:'whatsapp'},segretaria:{delivery:{state:'claimed'}}});
  priorProposal=copy(task().preparation); const action=copy(DB.get('action_queue/fixture-approved'));
  await message('own-echo',{body:task().preparation.draft.text});
  out=await generate();
  ok('eco/consegna in corso invalida fonti ma conserva ricevuta e azione approvata',out.error==='previous_delivery_unresolved'
    &&copy(task().preparation)===priorProposal&&copy(DB.get('action_queue/fixture-approved'))===action&&rows('operatorTasks').length===1,out);

  for (const alreadyClaimed of [false,true]) {
    await tracked(); const p=await generate();
    const approval=await approvePreparation({id:ID,revision:p.preparation.revision,lastMessageId:'m1',actor:'admin',now:clock});
    const actionId=task().preparation.approval?.actionId, approved=DB.get('action_queue/'+actionId);
    ok('approvazione reale prepara una sola consegna WhatsApp',approval.code===200&&approved?.status==='executed'&&rows('action_queue').length===1,approval);
    if(alreadyClaimed) {
      const claim=await claimSegretariaDelivery({id:actionId,action:approved,now:clock});
      ok('claim reale antecedente al ritorno echo',claim.allowed===true,claim);
    }
    const beforeApproval=copy(task().preparation.approval);
    await message(alreadyClaimed?'actual-echo':'actual-manual',{body:alreadyClaimed?p.preparation.draft.text:'Ho preso in carico io questa richiesta.'});
    if(alreadyClaimed) {
      const ack=await acknowledgeSegretariaDelivery({id:actionId,ok:true,now:clock});
      ok('echo durante consegna conserva approvazione e ACK terminale sulla stessa azione',ack.code===200&&ack.delivery==='sent'
        &&copy(task().preparation.approval)===beforeApproval&&rows('action_queue').length===1,ack);
    }else{
      const claim=await claimSegretariaDelivery({id:actionId,action:DB.get('action_queue/'+actionId),now:clock});
      ok('OUT prima del ritiro blocca la consegna vecchia senza revocare ricevute',claim.allowed===false&&claim.code===409
        &&copy(task().preparation.approval)===beforeApproval&&!DB.get('action_queue/'+actionId).segretaria.delivery,claim);
    }
  }

  await tracked();
  commitHook=async ops=>{if(ops.some(w=>w.update?.name.includes('/operatorTasks/')))throw new Error('secondary_fixture_failure');};
  out=await message('secondary-fails');
  ok('errore secondario conserva primaria atomica e dichiara seguito non aggiornato',out.httpCode===200&&!!out.followUp?.error&&rows('messages').length===2
    &&DB.get('conversations/'+CID).needsReply===false,out);
  commitHook=null; out=await message('secondary-fails',{body:'ALTERED RETRY'});
  ok('retry ripara solo il contesto secondario usando OUT persistito',out.dedupHit&&out.followUp?.tracked&&task().contextRevision===1
    &&task().followUp.lastMessageId==='m1'&&rows('messages').length===2,out);

  await tracked(); const beforeHead=copy(DB.get('conversations/'+CID));
  commitHook=async ops=>{if(ops.some(w=>w.update?.name.includes('/messages/')))throw new Error('primary_fixture_failure');};
  out=await message('primary-fails',{direction:'in'}); commitHook=null;
  ok('fallimento primaria non lascia header senza messaggio né incrementi unread',out.httpCode===500&&rows('messages').length===1
    &&copy(DB.get('conversations/'+CID))===beforeHead&&!task().contextRevision,out);

  await tracked();
  out=await message('first-acl',{contactUid:'new-user',assignedLandlordId:'new-owner'});
  const firstAccess=DB.get('messages/'+out.messageId);
  ok('prima associazione: chat e primo messaggio condividono le ACL finali',out.httpCode===200&&firstAccess?.contactUid==='new-user'
    &&firstAccess?.assignedLandlordId==='new-owner'&&DB.get('conversations/'+CID).contactUid==='new-user',out);

  await tracked(); save('conversations/'+CID,{...DB.get('conversations/'+CID),contactUid:'old-user'});
  commitHook=async ops=>{if(ops.some(w=>w.update?.name.includes('/messages/'))){commitHook=null;
    save('conversations/'+CID,{...DB.get('conversations/'+CID),contactUid:'new-user',assignedLandlordId:'new-owner'});}};
  out=await message('racing-acl',{contactUid:'old-user'});
  ok('identità cambiata durante ingest: CAS preserva ACL nuove su chat e messaggio',out.httpCode===200
    &&DB.get('conversations/'+CID).contactUid==='new-user'&&DB.get('messages/'+out.messageId)?.contactUid==='new-user'
    &&DB.get('messages/'+out.messageId)?.assignedLandlordId==='new-owner',out);

  if(!process.env.BOOM_FRESHNESS_MUTANT&&!fails){
    const fs=await import('node:fs/promises'),{fileURLToPath}=await import('node:url'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{spawnSync}=await import('node:child_process');
    const root=fileURLToPath(new URL('../../',import.meta.url));
    const mutants=[
      {name:'OUT invalida il contesto',file:'api/segretaria/_follow-up.js',from:"if (input.direction === 'out') return cursor ? invalidateTrackedContext(input) : null;",to:"if (input.direction === 'out') return null;"},
      {name:'ricevuta OUT idempotente',file:'api/segretaria/_follow-up.js',from:'if (await fsGet(receiptPath))',to:'if (false)'},
      {name:'attualità include revisione fonti',file:'js/segretaria-proposta-engine.js',from:"task.status === 'open' && contextCurrent(task)",to:"task.status === 'open'"},
      {name:'review include revisione fonti',file:'js/segretaria-priority-engine.js',from:'&& !task.preparation.approval && PROPOSTA.contextCurrent(task)',to:'&& !task.preparation.approval'},
      {name:'retry include revisione fonti',file:'js/segretaria-priority-engine.js',from:'&& PROPOSTA.contextCurrent(task, retry)',to:''},
      {name:'fonte tardiva non retrocede caso',file:'api/segretaria/_follow-up.js',from:'(current && Date.parse(current.data.followUp?.lastInboundAt) > now)',to:'false'},
      {name:'head atomica non retrocede',file:'api/homie/message.js',from:'currentAt <= incomingAt',to:'true'},
      {name:'unread letto dalla versione corrente',file:'api/homie/message.js',from:'if (current && !backlogReview && msg.direction',to:'if (false && !backlogReview && msg.direction'},
      {name:'proposta fotografa revisione fonti',file:'api/segretaria/_prepare.js',from:'contextRevision: PROPOSTA.contextRevision(task)',to:'contextRevision: 0'},
      {name:'retry worker legato al contesto letto',file:'api/segretaria/worker.js',from:'&& PROPOSTA.contextRevision(cur.data) === PROPOSTA.contextRevision(next)',to:''},
      {name:'ACL da unica identità finale',file:'api/homie/message.js',from:'contactUid: conversation.contactUid || null',to:'contactUid: current?.contactUid || null'},
      {name:'cambio ACL concorrente preservato',file:'api/homie/message.js',from:'if (current && fields && !backlogReview && (!initialConversation',to:'if (false && fields && !backlogReview && (!initialConversation'},
      {name:'parità legata al commit primario',file:'api/segretaria/_follow-up.js',from:'&& priorVersion > inboundVersion',to:'&& false'},
    ];
    for(const m of mutants){const scratch=await fs.mkdtemp(join(tmpdir(),'boom-freshness-mutant-'));try{
      await fs.cp(root+'api',scratch+'/api',{recursive:true});await fs.cp(root+'js',scratch+'/js',{recursive:true});
      await fs.mkdir(scratch+'/tests/segretaria',{recursive:true});await fs.cp(root+'tests/notify',scratch+'/tests/notify',{recursive:true});
      await fs.copyFile(root+'tests/segretaria/freshness.mjs',scratch+'/tests/segretaria/freshness.mjs');
      const path=scratch+'/'+m.file,source=await fs.readFile(path,'utf8');if(!source.includes(m.from))throw new Error('mutation_target_missing: '+m.name);
      await fs.writeFile(path,source.replace(m.from,m.to));const run=spawnSync(process.execPath,[scratch+'/tests/segretaria/freshness.mjs'],{encoding:'utf8',timeout:30000,env:{...process.env,BOOM_FRESHNESS_MUTANT:'1'}});
      ok('mutazione intercettata: '+m.name,run.status!==0&&/^FAIL /m.test(run.stdout),run.status===0?'mutation survived':run.stderr.slice(0,200));
    }finally{await fs.rm(scratch,{recursive:true,force:true});}}
  }
} finally {Date.now=realNow;}
console.log(`Freshness: ${checks-fails}/${checks} PASS`);if(fails)process.exitCode=1;
