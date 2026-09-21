// Real proposal approval, identity dossier and executor; only external I/O is fake.
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);
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
  if (failingCollection && (path === failingCollection || path.startsWith(failingCollection + '/'))) return json({ error: { status: 'UNAVAILABLE' } }, 503);
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
const { default: messagesSend } = await import('../../api/agent/messages.send.js');
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
async function callMessages(body) {
  let code, out;
  await messagesSend({ method: 'POST', body, headers: { 'x-homie-secret': 'fixture' } }, {
    status(n) { code = n; return this; }, json(v) { out = v; return this; }, setHeader() {}, end() {},
  });
  return { code, ...out };
}
const messageActivities = () => rows('activityLog').map(([, row]) => row).filter(row => row.category === 'message');

try {
  await reset();
  let r = await approvePreparation(args), action = DB.get('action_queue/' + r.actionId);
  const knownId = r.actionId;
  ok('conferma vera → executor vero → WhatsApp in consegna, mai dichiarato inviato', r.code === 200 && r.delivery === 'queued'
    && action?.status === 'executed' && action.segretaria.execution.state === 'started' && !action.waSentAt, r);
  ok('executor conserva link WhatsApp compatibile ma dichiara solo preparazione', action.executionResult.whatsapp.status === 'prepared'
    && action.executionResult.whatsapp.url.startsWith('https://wa.me/') && action.executionResult.whatsapp.to === conv.contactPhone
    && !action.executionResult.whatsapp.sent && __mails.length === 0);
  ok('registro messaggi e cronologia distinguono bozza WhatsApp da invio', rows('messageLog').length === 1
    && JSON.stringify(rows('messageLog')[0][1].delivery) === JSON.stringify({ whatsapp: 'prepared' })
    && messageActivities().length === 1 && messageActivities()[0].action === 'Bozza WhatsApp preparata (agent)'
    && JSON.stringify(messageActivities()[0].details.delivery) === JSON.stringify({ whatsapp: 'prepared' }));
  ok('seguito confermato resta aperto, collegato alla pratica e con responsabile e ricontrollo', task().status === 'open'
    && task().followUp.confirmed && task().followUp.practiceRef === 'contracts/cA' && task().followUp.propertyRef === 'properties/pA'
    && task().followUp.waitingOn === 'client' && task().followUp.checkAt === new Date(NOW + 86400000).toISOString());
  ok('ricevuta e unica azione hanno revisione, fonti minime e approvatore autenticato', rows('action_queue').length === 1
    && task().preparation.approval.actionId === knownId && action.approvedBy === args.actor
    && action.segretaria.reviewedRevision === args.revision && action.segretaria.sources.some(s => s.ref === 'contracts/cA')
    && !('text' in action.segretaria.sources[0]) && !action.autoApplied);
  r = await approvePreparation(args);
  ok('retry completato non crea né riesegue: stesso ID, stesso unico messageLog', r.cached && r.actionId === knownId
    && r.delivery === 'queued' && rows('messageLog').length === 1 && rows('action_queue').length === 1, r);
  save('action_queue/' + knownId, { ...action, waSentAt: new Date(NOW).toISOString() });
  r = await approvePreparation(args);
  ok('solo ricevuta WhatsApp reale mostra consegnato', r.delivery === 'sent');

  await reset();
  const concurrent = await Promise.all([approvePreparation(args), approvePreparation(args)]);
  ok('due approvazioni concorrenti creano una sola azione e un solo effetto', rows('action_queue').length === 1
    && rows('messageLog').length === 1 && concurrent.every(x => x.confirmed), concurrent);

  await reset(); revise(t => { t.preparation.draft = null; });
  r = await approvePreparation(args);
  ok('senza bozza conferma solo il seguito, zero azioni o invii', r.code === 200 && r.delivery === 'follow_up_only'
    && task().followUp.confirmed && rows('action_queue').length === 0 && rows('messageLog').length === 0 && __mails.length === 0, r);
  r = await approvePreparation(args);
  ok('anche conferma senza invio ha ricevuta idempotente', r.cached && r.delivery === 'follow_up_only');

  await reset(); r = await approvePreparation({ ...args, revision: 'old-revision' });
  ok('revisione superata rifiutata senza scrivere', r.code === 409 && r.error === 'preparation_changed' && writes.length === 0);
  await reset(); revise(t => { t.followUp.lastMessageId = 'new-message'; });
  r = await approvePreparation(args);
  ok('nuovo inbound già presente invalida la proposta', r.code === 409 && r.error === 'new_message_reload' && writes.length === 0);
  await reset(); revise(t => { t.preparation.status = 'needs_context'; });
  r = await approvePreparation(args);
  ok('contesto mancante non diventa approvazione', r.code === 409 && r.error === 'preparation_needs_context' && writes.length === 0);
  await reset(); revise(t => { t.status = 'done'; });
  r = await approvePreparation(args);
  ok('caso chiuso non viene riaperto dalla conferma', r.code === 409 && r.error === 'case_closed' && writes.length === 0);

  await reset();
  beforePatch = async () => revise(t => { t.followUp.lastMessageId = 'racing-inbound'; t.followUp.preview = 'Nuova richiesta'; });
  r = await approvePreparation(args);
  ok('inbound durante commit vince senza approvazione o azione parziale', r.code === 409 && !task().preparation.approval
    && task().followUp.lastMessageId === 'racing-inbound' && rows('action_queue').length === 0, r);

  await reset(); save('action_queue/' + knownId, { kind: 'reply', status: 'executed', payload: { draft: 'foreign' } });
  r = await approvePreparation(args);
  ok('collisione ID coda non viene scambiata per approvazione, commit intero annullato', r.code === 409
    && !task().preparation.approval && DB.get('action_queue/' + knownId).payload.draft === 'foreign' && rows('messageLog').length === 0, r);

  await reset(); save('users/conflicting', { role: 'tenant', phone: conv.contactPhone, email: 'different@example.test' });
  r = await approvePreparation(args);
  ok('identità contraddittoria impedisce invio e approvazione', r.code === 409 && r.error === 'identity_ambiguous'
    && rows('action_queue').length === 0, r);
  await reset(); save('conversations/' + CID, { ...DB.get('conversations/' + CID), conversationBindingConflict: 'multiple_established_conversations' });
  r = await approvePreparation(args);
  ok('conflitto CID esplicito impedisce invio e approvazione', r.code === 409 && r.error === 'conversation_binding_conflict'
    && rows('action_queue').length === 0 && !task().preparation.approval, r);
  await reset(); failingCollection = 'users'; r = await approvePreparation(args);
  ok('lettura identità fallita non diventa assenza di conflitti', r.code === 409 && r.error === 'identity_not_verified'
    && rows('action_queue').length === 0, r);
  await reset(); revise(t => { t.preparation.nextAction.practiceRef = 'contracts/foreign'; });
  r = await approvePreparation(args);
  ok('pratica modello inesistente o estranea rifiutata', r.code === 409 && r.error === 'practice_not_verified' && !rows('action_queue').length);
  await reset(); revise(t => { t.preparation.nextAction.practiceRef = null; });
  r = await approvePreparation(args);
  ok('invio con pratica non scelta resta bloccato', r.code === 409 && r.error === 'practice_selection_required' && !rows('action_queue').length);

  await reset(); save('contracts/cA', { ...DB.get('contracts/cA'), status: 'terminated' });
  r = await approvePreparation(args);
  ok('contratto cambiato dopo preparazione richiede nuova proposta', r.code === 409 && r.error === 'preparation_sources_changed'
    && !task().preparation.approval && !rows('action_queue').length, r);
  await reset(); save('messages/message-1', { ...DB.get('messages/message-1'), body: 'Correzione delle parole registrate' });
  r = await approvePreparation(args);
  ok('stesso message ID con parole diverse invalida le fonti', r.code === 409 && r.error === 'preparation_sources_changed', r);
  await reset(); revise(t => { delete t.preparation.sourceFingerprint; });
  r = await approvePreparation(args);
  ok('proposta senza impronta delle fonti non autorizza lavoro', r.code === 409 && r.error === 'preparation_sources_changed', r);

  await reset();
  save('conversations/' + CID, { ...conv, contactPhone: '+393339999999' });
  save('leads/leadA', { ...DB.get('leads/leadA'), phone: '+393339999999' });
  r = await approvePreparation(args);
  ok('nuovo recapito coerente ma diverso da quello mostrato richiede nuova preparazione', r.code === 409 && r.error === 'contact_changed'
    && !task().preparation.approval && !rows('action_queue').length, r);
  await reset(); revise(t => { t.preparation.recipientPreview.address = '+393339999999'; });
  r = await approvePreparation(args);
  ok('anteprima destinatario diversa dal contatto verificato non passa', r.code === 409 && r.error === 'contact_changed', r);

  await reset(); save('action_queue/other-reply', { kind: 'reply', status: 'pending', leadId: conv.leadId,
    proposedBy: 'commerciale', payload: { draft: 'Altro lavoro già preparato' } });
  r = await approvePreparation(args);
  ok('risposta di altro agente già pending blocca nuova autorizzazione', r.code === 409 && r.error === 'reply_already_managed'
    && !task().preparation.approval && rows('action_queue').length === 1, r);
  await reset(); save('conversations/' + CID, { ...conv, segretaria: true });
  r = await approvePreparation(args);
  ok('chat passata all’automatismo dopo prep non riceve seconda risposta', r.code === 409 && r.error === 'reply_already_managed'
    && !task().preparation.approval, r);
  await reset(); failingCollection = 'action_queue';
  r = await approvePreparation(args);
  ok('lettura delle risposte concorrenti incompleta non autorizza invio', r.code === 409 && r.error === 'reply_context_incomplete'
    && !task().preparation.approval, r);

  await reset(); revise(t => { t.preparation.recipientPreview = { channel: 'email', address: conv.contactEmail };
    t.preparation.draft = { channel: 'email', text: 'Confermo il ricontrollo di domani.', subject: 'Il seguito BOOM',
    to: 'attacker@example.test', phone: '+393399999999', html: '<b>injected</b>', sourceIds: ['source-1'] }; });
  r = await approvePreparation(args);
  ok('recapiti e HTML del modello ignorati: email solo al contatto verificato', r.delivery === 'sent' && __mails.length === 1
    && __mails[0].to === conv.contactEmail && __mails[0].text === task().preparation.draft.text
    && !__mails[0].html.includes('injected'), r);
  ok('email realmente inviata mantiene ricevuta e cronologia del solo canale email',
    DB.get('action_queue/' + r.actionId).executionResult.email.sent === true
    && JSON.stringify(rows('messageLog')[0][1].delivery) === JSON.stringify({ email: 'sent' })
    && messageActivities().length === 1 && messageActivities()[0].action === 'Email inviata (agent)'
    && JSON.stringify(messageActivities()[0].details.delivery) === JSON.stringify({ email: 'sent' }));
  await approvePreparation(args);
  ok('retry email realmente inviata non manda due volte', __mails.length === 1);

  await reset(); save('leads/leadA', { propertyId: 'pA' });
  r = await approvePreparation(args);
  ok('conversazione senza relazione con recapito documentato non basta per inviare', r.code === 409 && r.error === 'recipient_not_verified', r);

  await reset(); save('users/tenantA', { role: 'tenant', phone: conv.contactPhone, email: conv.contactEmail });
  r = await approvePreparation(args);
  ok('ruolo protetto non impedisce un messaggio preparato e approvato esplicitamente', r.code === 200 && r.delivery === 'queued', r);

  await reset(); failClaim = true;
  r = await approvePreparation(args);
  ok('guasto prima del dispatch conserva conferma e azione recuperabile', r.confirmed && r.delivery === 'pending_execution'
    && task().preparation.approval && rows('messageLog').length === 0, r);
  failClaim = false; r = await approvePreparation(args);
  ok('retry dopo guasto prima dell’effetto riprende unica azione', r.delivery === 'queued' && rows('action_queue').length === 1 && rows('messageLog').length === 1, r);

  await reset(); failClaim = true; await approvePreparation(args); failClaim = false;
  save('contracts/cA', { ...DB.get('contracts/cA'), status: 'terminated' });
  r = await callExecutor({ id: knownId });
  ok('executor ricontrolla fonti cambiate anche dopo approvazione', r.code === 409 && r.error === 'segretaria_sources_changed'
    && !rows('messageLog').length, r);

  await reset(); failClaim = true; await approvePreparation(args); failClaim = false;
  save('conversations/' + CID, { ...conv, contactPhone: '+393339999999' });
  save('leads/leadA', { ...DB.get('leads/leadA'), phone: '+393339999999' });
  r = await callExecutor({ id: knownId });
  ok('executor non sostituisce destinatario dopo approvazione', r.code === 409 && r.error === 'segretaria_recipient_changed'
    && !rows('messageLog').length, r);

  await reset(); failClaim = true; await approvePreparation(args); failClaim = false;
  save('action_queue/other-reply', { kind: 'reply', status: 'approved', leadId: conv.leadId, proposedBy: 'commerciale' });
  r = await callExecutor({ id: knownId });
  ok('executor riconosce lavoro affidato ad altro agente dopo conferma', r.code === 409 && r.error === 'reply_already_managed'
    && !rows('messageLog').length, r);

  await reset(); revise(t => { t.preparation.draft.channel = 'email'; t.preparation.draft.subject = 'Seguito BOOM';
    t.preparation.recipientPreview = { channel: 'email', address: conv.contactEmail }; });
  failResult = true; r = await approvePreparation(args);
  ok('email inviata ma esito non registrato resta incerto, seguito confermato', r.confirmed && r.delivery === 'needs_review'
    && __mails.length === 1 && task().preparation.approval, r);
  failResult = false; r = await approvePreparation(args);
  ok('retry esito incerto non reinvia email', __mails.length === 1 && r.delivery === 'needs_review', r);

  await reset(); failClaim = true; r = await approvePreparation(args); failClaim = false;
  revise(t => { t.followUp.preview = 'Correzione dello stesso ingresso'; });
  r = await callExecutor({ id: knownId });
  ok('guard confronta inputHash anche con stesso ID messaggio', r.code === 409 && r.error === 'segretaria_context_changed'
    && !rows('messageLog').length, r);

  await reset(); failClaim = true; r = await approvePreparation(args); failClaim = false;
  revise(t => { t.preparation.draft.text = 'Testo sostituito dopo approvazione'; });
  r = await callExecutor({ id: knownId });
  ok('contenuto preparato cambiato senza nuova revisione non passa', r.code === 409 && !rows('messageLog').length, r);

  await reset(); failClaim = true; r = await approvePreparation(args); failClaim = false;
  r = await callExecutor({ id: knownId, override: { to: 'attacker@example.test', channel: 'email' } });
  ok('vecchio endpoint executor non permette override di nuova proposta', r.code === 409 && r.error === 'segretaria_override_requires_review'
    && !rows('messageLog').length && !__mails.length, r);
  action = DB.get('action_queue/' + knownId); save('action_queue/' + knownId, { ...action, payload: { ...action.payload, phone: '+393399999999' } });
  r = await callExecutor({ id: knownId });
  ok('payload cambiato dopo approvazione non passa hash verificato', r.code === 409 && r.error === 'segretaria_approval_mismatch'
    && !rows('messageLog').length, r);

  await reset(); failClaim = true; await approvePreparation(args); failClaim = false;
  const competing = await Promise.all([callExecutor({ id: knownId }), callExecutor({ id: knownId })]);
  ok('due chiamate executor dirette concorrenti hanno un solo vincitore', rows('messageLog').length === 1
    && competing.some(x => x.code === 409), competing);

  await reset(); failClaim = true; await approvePreparation(args); failClaim = false;
  beforePatch = async () => revise(t => { t.followUp.lastMessageId = 'during-execution-claim'; });
  r = await callExecutor({ id: knownId });
  ok('inbound fra lettura e claim impedisce effetto esterno', r.code === 409 && !rows('messageLog').length
    && task().followUp.lastMessageId === 'during-execution-claim', r);

  await reset(); failClaim = true; await approvePreparation(args); failClaim = false;
  beforePatch = async () => save('conversations/' + CID, { ...conv, contactPhone: '+393339999999' });
  r = await callExecutor({ id: knownId });
  ok('recapito cambiato mentre si acquisisce invio fa fallire commit senza effetto', r.code === 409 && !rows('messageLog').length, r);

  await reset();
  save('action_queue/no-proof', { kind: 'reply', status: 'approved', proposedBy: 'segretaria-proposal', payload: { channel: 'whatsapp', phone: conv.contactPhone, draft: 'No proof' } });
  r = await callExecutor({ id: 'no-proof' });
  ok('nuova proposta senza metadati non evade guardia', r.code === 409 && r.error === 'segretaria_approval_missing' && !rows('messageLog').length);
  save('action_queue/legacy', { kind: 'reply', status: 'pending', proposedBy: 'legacy', payload: { channel: 'whatsapp', phone: conv.contactPhone, draft: 'Legacy' } });
  r = await callExecutor({ id: 'legacy' });
  ok('flusso storico non modificato dal gate delle nuove proposte', r.code === 200 && r.status === 'executed');

  await reset();
  r = await callMessages({ channel: 'both', to: conv.contactEmail, phone: conv.contactPhone,
    subject: 'Fixture esiti separati', body: 'Test dei due canali.' });
  ok('strumento both separa email inviata da WhatsApp preparato senza creare una coda', r.code === 200 && r.ok
    && r.email.sent === true && r.whatsapp.status === 'prepared' && __mails.length === 1 && !rows('action_queue').length
    && JSON.stringify(rows('messageLog')[0][1].delivery) === JSON.stringify({ email: 'sent', whatsapp: 'prepared' })
    && messageActivities()[0].action === 'Email inviata e bozza WhatsApp preparata (agent)'
    && JSON.stringify(messageActivities()[0].details.delivery) === JSON.stringify({ email: 'sent', whatsapp: 'prepared' }));

  await reset(); failingCollection = 'messageLog';
  r = await callMessages({ channel: 'whatsapp', phone: conv.contactPhone, body: 'Fixture registro non disponibile.' });
  ok('registro secondario indisponibile non perde link né inventa invio in cronologia', r.code === 200 && r.ok
    && r.whatsapp.status === 'prepared' && r.whatsapp.url.startsWith('https://wa.me/')
    && !rows('messageLog').length && messageActivities()[0].action === 'Bozza WhatsApp preparata (agent)'
    && messageActivities()[0].details.delivery.whatsapp === 'prepared' && !rows('action_queue').length && __mails.length === 0);

  await reset();
  r = await callMessages({ channel: 'whatsapp', body: 'Fixture senza destinatario.' });
  ok('WhatsApp non preparabile non produce falsa ricevuta o cronologia di invio', r.code === 400 && !r.ok
    && !rows('messageLog').length && !messageActivities().length && __mails.length === 0);

  ok('nessuna rete reale, AI, Telegram o secondo canale', network.length === 0, network);
} catch (e) {
  ok('suite completa senza eccezioni', false, e.stack);
} finally {
  Date.now = realNow;
  console.log(`\n${checks - fails}/${checks} PASS`);
  process.exitCode = fails ? 1 : 0;
}
