// Real approval, executor and outbox handlers; only external I/O is fake.
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
const { approvePreparation, readPreparationDelivery } = await import('../../api/segretaria/_dispatch.js');
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

const { default: outbox } = await import('../../api/homie/wa-outbox.js');
const { postinoTick } = await import('../../api/telegram/_postino.js');

async function callOutbox(body = { op: 'pull' }) {
  let code, output;
  await outbox({ method: 'POST', body, headers: { 'x-homie-secret': 'fixture' } }, {
    status(n) { code = n; return this; }, json(v) { output = v; return this; }, setHeader() {}, end() {},
  });
  return { code, ...output };
}
async function ready() { await reset(); const r = await approvePreparation(args); if (r.delivery !== 'queued') throw new Error('fixture approval failed: ' + JSON.stringify(r)); return r.actionId; }

try {
  let actionId = await ready(), r = await callOutbox();
  ok('pull vero ricontrolla e consegna al Mac solo testo e destinatario approvati', r.code === 200 && r.messages.length === 1
    && r.messages[0].actionId === actionId && r.messages[0].phone === conv.contactPhone
    && r.messages[0].text === task().preparation.draft.text, r);
  ok('claim persistito PRIMA del ritorno al Mac, senza dichiarare invio', DB.get('action_queue/' + actionId).segretaria.delivery.state === 'claimed'
    && !DB.get('action_queue/' + actionId).waSentAt && !DB.get('action_queue/' + actionId).waSendError);
  r = await callOutbox();
  ok('secondo pull senza ack non restituisce di nuovo la stessa azione', r.messages.length === 0, r);
  Date.now = () => NOW + 6 * 60000;
  r = await callOutbox();
  ok('nessun ack: claim non scade e non abilita un reinvio automatico', r.messages.length === 0);
  r = await approvePreparation({ ...args, now: NOW + 6 * 60000 });
  ok('Oggi vede esito incerto dopo ritiro senza ack, non un nuovo invio', r.delivery === 'needs_review'
    && r.error === 'whatsapp_delivery_unconfirmed', r);
  Date.now = () => NOW;

  actionId = await ready();
  const simultaneous = await Promise.all([callOutbox(), callOutbox()]);
  ok('due pull contemporanei: un solo claim e un solo payload restituito', simultaneous.reduce((sum, x) => sum + x.messages.length, 0) === 1, simultaneous);
  ok('il pull perdente non aggiunge un blocco al claim vincente', !DB.get('action_queue/' + actionId).segretariaDeliveryBlock);

  actionId = await ready();
  revise(t => { t.followUp.lastMessageId = 'new-inbound'; t.followUp.preview = 'Nuova istruzione'; });
  r = await callOutbox();
  ok('nuovo inbound dopo autorizzazione blocca il messaggio vecchio al pull', r.messages.length === 0
    && !DB.get('action_queue/' + actionId).segretaria.delivery, r);
  actionId = await ready(); revise(t => { t.status = 'done'; t.followUp.open = false; });
  r = await callOutbox();
  ok('caso chiuso non produce consegna tardiva', r.messages.length === 0);
  actionId = await ready(); revise(t => { t.followUp.nextAction = 'Richiamare io, non mandare più la risposta'; t.followUp.waitingOn = 'valentino'; });
  r = await callOutbox();
  ok('decisione manuale cambiata dopo approvazione blocca il pull', r.messages.length === 0);
  actionId = await ready(); save('contracts/cA', { ...DB.get('contracts/cA'), status: 'terminated' });
  r = await callOutbox();
  ok('fonti cambiate prima del ritiro invalidano consegna', r.messages.length === 0);
  let current = DB.get('action_queue/' + actionId);
  ok('diniego fonti resta visibile senza inventare un tentativo di invio', current.segretariaDeliveryBlock?.reason === 'segretaria_sources_changed'
    && current.segretariaDeliveryBlock?.at === new Date(NOW).toISOString() && !current.segretaria.delivery && !current.waSentAt && !current.waSendError, current.segretariaDeliveryBlock);
  const beforeRead = writes.length;
  r = await readPreparationDelivery(ID, actionId);
  ok('stato letto dopo refresh mostra da verificare e non esegue azioni', r.delivery === 'needs_review'
    && r.error === 'segretaria_sources_changed' && writes.length === beforeRead, r);
  r = await approvePreparation(args);
  ok('conferma ripetuta espone il blocco della consegna senza rimandare', r.cached && r.delivery === 'needs_review'
    && r.error === 'segretaria_sources_changed', r);
  save('contracts/cA', { linkedLeadId: 'leadA', propertyId: 'pA', status: 'active' });
  r = await callOutbox();
  ok('ripristino verificato delle fonti acquisisce il claim e toglie solo il vecchio marker', r.messages.length === 1
    && DB.get('action_queue/' + actionId).segretaria.delivery?.state === 'claimed' && !DB.get('action_queue/' + actionId).segretariaDeliveryBlock, r);
  actionId = await ready();
  save('conversations/' + CID, { ...conv, contactPhone: '+393339999999' });
  save('leads/leadA', { ...DB.get('leads/leadA'), phone: '+393339999999' });
  r = await callOutbox();
  ok('recapito cambiato coerentemente non sostituisce quello approvato', r.messages.length === 0);
  actionId = await ready(); save('users/conflict', { role: 'tenant', phone: conv.contactPhone, email: 'other@example.test' });
  r = await callOutbox();
  ok('nuova ambiguità di identità ferma consegna', r.messages.length === 0);

  actionId = await ready(); save('action_queue/other-reply', { kind: 'reply', status: 'pending', leadId: conv.leadId, proposedBy: 'commerciale' });
  r = await callOutbox();
  ok('altra risposta pending intervenuta prima del pull impedisce seconda consegna', r.messages.length === 0);
  ok('risposta già gestita lascia un motivo leggibile sulla stessa azione', DB.get('action_queue/' + actionId).segretariaDeliveryBlock?.reason === 'reply_already_managed');
  actionId = await ready(); save('conversations/' + CID, { ...conv, segretaria: true });
  r = await callOutbox();
  ok('chat automatica intervenuta prima del pull impedisce risposta duplicata', r.messages.length === 0);

  actionId = await ready();
  beforePatch = async () => revise(t => { t.followUp.lastMessageId = 'racing-inbound'; });
  r = await callOutbox();
  ok('inbound durante claim atomico non viene perso e il payload non esce', r.messages.length === 0
    && task().followUp.lastMessageId === 'racing-inbound' && !DB.get('action_queue/' + actionId).segretaria.delivery);
  actionId = await ready();
  beforePatch = async () => save('conversations/' + CID, { ...conv, contactPhone: '+393339999999' });
  r = await callOutbox();
  ok('cambio destinatario durante claim atomico non produce payload', r.messages.length === 0
    && !DB.get('action_queue/' + actionId).segretaria.delivery);

  actionId = await ready(); save('contracts/cA', { ...DB.get('contracts/cA'), status: 'terminated' });
  commitHook = async operations => {
    if (!operations.some(w => w.update?.fields?.segretariaDeliveryBlock)) return;
    commitHook = null;
    const action = structuredClone(DB.get('action_queue/' + actionId));
    action.segretaria.delivery = { state: 'claimed', claimedAt: new Date(NOW).toISOString() };
    save('action_queue/' + actionId, action);
  };
  r = await callOutbox();
  ok('CAS del marker non sovrascrive un ritiro acquisito tra lettura e scrittura', r.messages.length === 0
    && DB.get('action_queue/' + actionId).segretaria.delivery?.state === 'claimed' && !DB.get('action_queue/' + actionId).segretariaDeliveryBlock);

  actionId = await ready();
  const secondId = 'sgreply_' + 'b'.repeat(40);
  save('action_queue/' + secondId, { ...structuredClone(DB.get('action_queue/' + actionId)), id: secondId, leadId: 'other-lead',
    payload: { channel: 'whatsapp', phone: '+393338888888', draft: 'Seconda proposta da verificare' } });
  save('action_queue/legacy-budget', { kind: 'reply', status: 'executed', executedAt: new Date(NOW).toISOString(),
    payload: { channel: 'whatsapp', phone: '+393337777777', draft: 'Messaggio legacy' } });
  r = await callOutbox();
  ok('un solo controllo di nuova proposta per pull, conservando i messaggi legacy', r.messages.length === 2
    && r.messages.some(m => m.actionId === actionId) && r.messages.some(m => m.actionId === 'legacy-budget')
    && !DB.get('action_queue/' + secondId).segretariaDeliveryBlock, r);

  actionId = await ready(); save('contracts/cA', { ...DB.get('contracts/cA'), status: 'terminated' });
  save('action_queue/' + secondId, { ...structuredClone(DB.get('action_queue/' + actionId)), id: secondId, leadId: 'other-lead',
    payload: { channel: 'whatsapp', phone: '+393338888888', draft: 'Seconda proposta da verificare' } });
  r = await callOutbox();
  ok('anche un diniego consuma l’unico controllo ammesso nel pull', r.messages.length === 0
    && DB.get('action_queue/' + actionId).segretariaDeliveryBlock?.reason === 'segretaria_sources_changed'
    && !DB.get('action_queue/' + secondId).segretariaDeliveryBlock, r);

  actionId = await ready();
  save('action_queue/legacy-budget', { kind: 'reply', status: 'executed', executedAt: new Date(NOW).toISOString(),
    payload: { channel: 'whatsapp', phone: '+393337777777', draft: 'Messaggio legacy' } });
  queries.length = 0;
  queryHook = async (q, coll) => {
    if (coll === 'action_queue' && q.where?.fieldFilter?.field.fieldPath === 'status') Date.now = () => NOW + 20000;
  };
  r = await callOutbox();
  ok('query iniziale lenta non lascia iniziare un controllo che non entra nel budget', r.messages.length === 1
    && r.messages[0].actionId === 'legacy-budget' && queries.length === 1
    && !DB.get('action_queue/' + actionId).segretaria.delivery && !DB.get('action_queue/' + actionId).segretariaDeliveryBlock, { r, queries });
  Date.now = () => NOW;

  await reset();
  for (let n = 0; n < 11; n++) save('action_queue/legacy-' + n, { kind: 'reply', status: 'executed', executedAt: new Date(NOW).toISOString(),
    payload: { channel: 'whatsapp', phone: conv.contactPhone, draft: 'Messaggio legacy ' + n } });
  r = await callOutbox();
  ok('limite storico di dieci messaggi per pull invariato', r.messages.length === 10);

  actionId = await ready();
  r = await callOutbox({ op: 'ack', actionId, ok: true });
  ok('ack senza ritiro registrato non inventa una consegna', r.code === 409 && r.error === 'delivery_not_claimed'
    && !DB.get('action_queue/' + actionId).waSentAt, r);
  const unknown = 'sgreply_' + 'f'.repeat(40);
  r = await callOutbox({ op: 'ack', actionId: unknown, ok: true });
  ok('ack nuova azione inesistente non crea un documento', r.code === 404 && !DB.has('action_queue/' + unknown), r);

  await callOutbox();
  r = await callOutbox({ op: 'ack', actionId, ok: true });
  ok('ack coerente registra esito sullo stesso documento e mantiene caso aperto', r.code === 200 && r.delivery === 'sent'
    && DB.get('action_queue/' + actionId).waSentAt && task().status === 'open', r);
  const sentAt = DB.get('action_queue/' + actionId).waSentAt;
  r = await callOutbox({ op: 'ack', actionId, ok: true });
  ok('retry ack positivo è cached e non riscrive data', r.code === 200 && r.cached && DB.get('action_queue/' + actionId).waSentAt === sentAt, r);
  r = await callOutbox({ op: 'ack', actionId, ok: false, error: 'late failure' });
  ok('ack negativo tardivo non sovrascrive successo', r.code === 409 && DB.get('action_queue/' + actionId).waSentAt === sentAt
    && !DB.get('action_queue/' + actionId).waSendError, r);

  actionId = await ready(); await callOutbox();
  r = await callOutbox({ op: 'ack', actionId, ok: false, error: 'outcome unknown' });
  ok('ack fallito parcheggia esito sullo stesso documento', r.code === 200 && r.delivery === 'failed'
    && DB.get('action_queue/' + actionId).waSendError === 'outcome unknown', r);
  r = await callOutbox({ op: 'ack', actionId, ok: false, error: 'another error' });
  ok('retry ack fallito conserva primo esito', r.code === 200 && r.cached
    && DB.get('action_queue/' + actionId).waSendError === 'outcome unknown', r);
  r = await callOutbox({ op: 'ack', actionId, ok: true });
  ok('ack positivo tardivo non cancella esito fallito o incerto', r.code === 409 && !DB.get('action_queue/' + actionId).waSentAt
    && DB.get('action_queue/' + actionId).waSendError === 'outcome unknown', r);
  r = await callOutbox();
  ok('esito fallito non torna mai nel pull automatico', r.messages.length === 0);

  actionId = await ready(); await callOutbox();
  const acknowledgements = await Promise.all([callOutbox({ op: 'ack', actionId, ok: true }), callOutbox({ op: 'ack', actionId, ok: false, error: 'different outcome' })]);
  ok('ack concorrenti discordanti hanno un solo esito vincente', acknowledgements.filter(x => x.code === 200).length === 1
    && acknowledgements.filter(x => x.code === 409).length === 1, acknowledgements);

  actionId = await ready(); await callOutbox();
  revise(t => { t.followUp.lastMessageId = 'after-pickup'; });
  r = await callOutbox({ op: 'ack', actionId, ok: true });
  ok('ack resta registrazione di un ritiro reale anche se poi arriva un inbound', r.code === 200
    && task().followUp.lastMessageId === 'after-pickup' && DB.get('action_queue/' + actionId).waSentAt, r);

  actionId = await ready(); await callOutbox();
  const postino = await postinoTick({ chatId: 'fixture-chat', now: NOW + 6 * 60000 });
  ok('Postino non offre reinvio manuale del nuovo messaggio dall’esito incerto', postino.stalled === 0 && network.length === 0
    && !DB.get('action_queue/' + actionId).waStallNotifiedAt, postino);

  await reset();
  save('action_queue/legacy', { kind: 'reply', status: 'executed', executedAt: new Date(NOW).toISOString(),
    payload: { channel: 'whatsapp', phone: conv.contactPhone, draft: 'Messaggio legacy' } });
  r = await callOutbox();
  ok('payload del protocollo Mac resta uguale per messaggi storici', r.messages.length === 1
    && Object.keys(r.messages[0]).sort().join(',') === 'actionId,leadId,phone,text', r);
  r = await callOutbox({ op: 'ack', actionId: 'legacy', ok: true });
  ok('ack legacy resta compatibile senza token nuovi', r.code === 200 && DB.get('action_queue/legacy').waSentAt, r);
  ok('nessuna chiamata esterna reale o nuovo messaggio', network.length === 0 && __mails.length === 0, network);
} catch (e) {
  ok('suite completa senza eccezioni', false, e.stack);
} finally {
  Date.now = realNow;
  console.log(`\n${checks - fails}/${checks} PASS`);
  process.exitCode = fails ? 1 : 0;
}
