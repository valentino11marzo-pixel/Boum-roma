// Real post-call bridge and phone callbacks; only external I/O is fake.
import crypto from 'node:crypto';
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
let sequence = 0, failingCollection = '', beforePatch = null, failMessages = false, failFollowUp = false;
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
    if (failFollowUp && operations.some(w => w.update?.name.includes('/operatorTasks/'))) return json({ error: { status: 'UNAVAILABLE' } }, 503);
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
  if (opts.method === 'POST') {
    if (failMessages && path === 'messages') return json({ error: { status: 'UNAVAILABLE' } }, 503);
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

const { syncCallCase } = await import('../../api/segretaria/_callcase.js');
const { default: elevenlabs } = await import('../../api/phone/elevenlabs.js');
const { default: recording } = await import('../../api/phone/recording.js');
process.env.ELEVENLABS_WEBHOOK_SECRET = 'fixture-signing';
const CID = 'conv_lead_existing';
const FROM = '+393331234567';
const lead = { name: 'Caller fixture', phone: FROM, email: 'caller@example.test' };
const conv = { contactType: 'lead', contactId: 'existing', leadId: 'existing', contactUid: 'keep-uid',
  contactPhone: FROM, contactEmail: lead.email, contactName: lead.name, segretaria: true, unread: 0,
  lastMessageAt: new Date(NOW - 10000).toISOString(), lastMessagePreview: 'old preview' };
function reset() {
  DB.clear(); versions.clear(); writes.length = 0; sequence = 0;
  failingCollection = ''; beforePatch = null; failMessages = failFollowUp = false;
  for (const key of ['ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']) delete process.env[key];
  save('leads/existing', { ...lead });
  save('conversations/' + CID, { ...conv });
}
function saved(id = 'el_callA', patch = {}) {
  const row = { source: 'elevenlabs', status: 'received', createdAt: new Date(NOW).toISOString(),
    processedAt: new Date(NOW + 1000).toISOString(), from: FROM, callerType: 'lead', callerId: 'existing', leadId: 'existing',
    callerName: 'Caller fixture', transcript: '🤖 Buongiorno, rispondo in italiano.\n👤 Please call me tomorrow.',
    callerWords: 'Please call me tomorrow.', ...patch };
  save('phoneCalls/' + id, row); return row;
}
const messages = () => [...DB].filter(([p]) => p.startsWith('messages/'));
const tasks = () => [...DB].filter(([p]) => p.startsWith('operatorTasks/'));
const sourceMessageId = id => 'phone_' + crypto.createHash('sha256').update(id).digest('hex');
async function request(handler, body, headers = {}) {
  let code, output;
  await handler({ method: 'POST', body, headers }, { status(c) { code = c; return this; },
    json(out) { output = out; return this; }, setHeader() {}, end() {} });
  return { code, ...output };
}
const twilio = (callSid, extra = {}) => request(recording, { CallSid: callSid, RecordingStatus: 'completed', ...extra }, { 'x-homie-secret': 'fixture' });
function eleven(id = 'callA', extra = {}) {
  const body = JSON.stringify({ type: 'post_call_transcription', data: { conversation_id: id,
    metadata: { phone_call: { external_number: '+393339999999' } },
    transcript: [{ role: 'user', message: 'TAMPERED RETRY' }], ...extra } });
  const t = Math.floor(NOW / 1000);
  const signature = crypto.createHmac('sha256', 'fixture-signing').update(t + '.' + body).digest('hex');
  return request(elevenlabs, body, { 'elevenlabs-signature': `t=${t},v0=${signature}` });
}
try {
  reset(); saved();
  let result = await syncCallCase('el_callA');
  ok('chiamata salvata con unico CID verificato entra nell’Inbox esistente', result.ok && result.conversationId === CID
    && messages().length === 1 && tasks().length === 1, result);
  let msg = messages()[0][1], task = DB.get('operatorTasks/' + result.taskId);
  ok('messaggio conserva fonte stabile, evento telefonico e dialogo etichettato', msg.phoneCallId === 'el_callA'
    && msg.sourceRef === 'phoneCalls/el_callA' && msg.eventId === 'phone:el_callA' && msg.channel === 'phone'
    && msg.body.includes('🤖 Buongiorno') && msg.body.includes('👤 Please call') && msg.at === new Date(NOW).toISOString());
  ok('analisi e anteprima seguito vedono solo il chiamante, non la voce dell’agente', msg.callerWords === 'Please call me tomorrow.'
    && msg.analysisText === msg.callerWords && task.followUp.preview === msg.callerWords && !task.followUp.preview.includes('italiano'));
  ok('pratica non inventata e identità/autonomia della chat non riscritte', task.followUp.practiceRef === null
    && task.followUp.lastMessageId === 'phone:el_callA' && task.calendarize === false
    && DB.get('conversations/' + CID).segretaria === true && DB.get('conversations/' + CID).contactUid === 'keep-uid'
    && DB.get('conversations/' + CID).leadId === 'existing' && !writes.some(w => w.path.startsWith('leads/')));
  const oldWrites = writes.length;
  await syncCallCase('el_callA');
  ok('retry completo non scrive di nuovo header, messaggio o seguito', writes.length === oldWrites && messages().length === 1 && tasks().length === 1);

  reset(); saved(); failMessages = true;
  result = await syncCallCase('el_callA');
  ok('messaggio secondario fallito lascia chiamata autorevole ed errore visibile', !result.ok && !!DB.get('phoneCalls/el_callA').followUpError
    && DB.get('phoneCalls/el_callA').transcript.includes('Please call') && messages().length === 0 && tasks().length === 0);
  failMessages = false;
  // A processed callback must skip every original side effect, even configured.
  Object.assign(process.env, { ANTHROPIC_API_KEY: 'fixture', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_CHAT_ID: '42' });
  result = await eleven();
  ok('callback ElevenLabs processedAt recupera dal salvato, non dal payload alterato', result.code === 200 && result.duplicate === true
    && result.followUp.ok && result.followUp.conversationId === CID && messages().length === 1 && tasks().length === 1
    && messages()[0][1].callerWords === 'Please call me tomorrow.' && !messages()[0][1].body.includes('TAMPERED')
    && DB.get('conversations/' + CID).unread === 1 && DB.get('phoneCalls/el_callA').followUpError === null, result);

  reset(); saved('CA_saved', { source: 'twilio', callerWords: null, transcript: 'Richiesta dal chiamante.' }); failFollowUp = true;
  result = await twilio('CA_saved', { From: '+393339999999', RecordingUrl: 'https://invalid.test/never-download' });
  ok('callback Twilio fallisce solo sul seguito: niente seconda trascrizione o notifica', result.code === 200 && result.duplicate
    && !result.followUp.ok && messages().length === 1 && tasks().length === 0 && !!DB.get('phoneCalls/CA_saved').followUpError, result);
  failFollowUp = false;
  result = await twilio('CA_saved');
  ok('retry Twilio recupera stesso messaggio e crea una sola card', result.followUp.ok && messages().length === 1 && tasks().length === 1
    && messages()[0][1].body === '👤 Richiesta dal chiamante.' && messages()[0][1].analysisText === 'Richiesta dal chiamante.');

  reset(); saved();
  const parallel = await Promise.all([syncCallCase('el_callA'), syncCallCase('el_callA')]);
  ok('due callback concorrenti: binding CAS, un messaggio/un caso e un unread', parallel.every(r => r.ok)
    && parallel[0].conversationId === parallel[1].conversationId && messages().length === 1 && tasks().length === 1
    && DB.get('conversations/' + CID).unread === 1, parallel);

  reset(); saved('el_A'); saved('el_B');
  save('conversations/conv_other', { ...conv, contactId: 'other', leadId: 'other', contactUid: 'another' });
  const ambiguous = await Promise.all([syncCallCase('el_A'), syncCallCase('el_B')]);
  ok('due chiamate stesso numero ambiguo riusano intake telefonico e caso, mai due chat', ambiguous.every(r => r.ok)
    && ambiguous[0].conversationId === ambiguous[1].conversationId && ambiguous[0].conversationId.startsWith('conv_phone_')
    && messages().length === 2 && tasks().length === 1, ambiguous);
  let intake = DB.get('conversations/' + ambiguous[0].conversationId);
  ok('intake non verifica la persona né associa lead/contratto; candidati espliciti', intake.identityStatus === 'caller_unverified'
    && intake.identityAmbiguous === true && intake.candidateConversationIds.length === 2
    && intake.leadId === null && intake.contactUid === null && intake.segretaria === false
    && tasks()[0][1].followUp.practiceRef === null && DB.get('conversations/' + CID).unread === 0);

  reset(); saved();
  save('leads/existing', { ...lead, phone: '+393339999999' });
  result = await syncCallCase('el_callA');
  ok('leadId della pipeline non aggira identità discordante, anche con un solo CID candidato', result.ok
    && result.conversationId.startsWith('conv_phone_') && DB.get('conversations/' + result.conversationId).identityAmbiguous
    && DB.get('conversations/' + CID).unread === 0, result);

  reset(); saved('el_unknownA', { from: '+393334444444', leadId: null }); saved('el_unknownB', { from: '+393334444444', leadId: null });
  const unknownA = await syncCallCase('el_unknownA'), unknownB = await syncCallCase('el_unknownB');
  ok('numero sconosciuto resta un intake comune senza inventare nuovi lead', unknownA.ok && unknownB.ok
    && unknownA.conversationId === unknownB.conversationId && tasks().length === 1
    && [...DB.keys()].filter(k => k.startsWith('leads/')).length === 1);

  reset(); saved('el_anonA', { from: null, leadId: null }); saved('el_anonB', { from: null, leadId: null });
  const anonA = await syncCallCase('el_anonA'), anonB = await syncCallCase('el_anonB');
  ok('anonimi senza identificatore non vengono fusi fra loro', anonA.ok && anonB.ok && anonA.conversationId !== anonB.conversationId && tasks().length === 2);

  reset(); saved('el_noWords', { callerWords: null, transcript: '🤖 Valentino ti chiamerà oggi.' });
  result = await syncCallCase('el_noWords');
  ok('senza parole del chiamante non usa promesse dell’agente come intento/lingua', result.ok && messages()[0][1].analysisText === null
    && messages()[0][1].callerWords === null && tasks()[0][1].followUp.preview === '');

  reset(); saved();
  save('messages/' + sourceMessageId('el_callA'), { conversationId: 'foreign', body: 'existing unrelated data' });
  result = await syncCallCase('el_callA');
  ok('collisione 409 verifica contenuto e identità: non sovrascrive né riconosce un falso successo', !result.ok
    && messages()[0][1].body === 'existing unrelated data' && tasks().length === 0 && !!DB.get('phoneCalls/el_callA').followUpError);

  reset(); saved();
  save('conversations/' + CID, { ...conv, lastMessageAt: new Date(NOW + 86400000).toISOString(), lastMessagePreview: 'newer message' });
  result = await syncCallCase('el_callA');
  ok('chiamata recuperata vecchia non riporta indietro l’anteprima più recente', result.ok
    && DB.get('conversations/' + CID).lastMessagePreview === 'newer message' && DB.get('conversations/' + CID).needsReply === true);
  save('conversations/conv_late', { ...conv });
  const boundAgain = await syncCallCase('el_callA');
  ok('binding di una singola chiamata immutabile quando cambiano i candidati al retry', boundAgain.ok && boundAgain.conversationId === CID
    && tasks().length === 1 && messages().length === 1 && ![...DB.keys()].some(k => k.startsWith('conversations/conv_phone_')));

  reset(); saved(); failingCollection = 'conversations';
  result = await syncCallCase('el_callA');
  ok('query CID fallita non tratta una lista parziale come identificazione', !result.ok && messages().length === 0 && tasks().length === 0
    && !!DB.get('phoneCalls/el_callA').followUpError);

  reset(); saved('pending', { processedAt: null });
  const pendingWrites = writes.length;
  result = await syncCallCase('pending');
  ok('chiamata non ancora elaborata non viene anticipata dall’intake', result.skipped === 'call_not_processed' && writes.length === pendingWrites);

  reset();
  result = await eleven('fresh', { metadata: { phone_call: { external_number: FROM } },
    transcript: [{ role: 'agent', message: 'Ciao!' }, { role: 'user', message: 'Please call me tomorrow.' }] });
  ok('callback iniziale ElevenLabs salva prima phoneCall poi rende richiesta centrale', result.code === 200 && result.followUp?.ok
    && DB.has('phoneCalls/el_fresh') && messages().length === 1 && tasks().length === 1
    && messages()[0][1].analysisText === 'Please call me tomorrow.', result);

  reset(); save('phoneCalls/CA_fresh', { callSid: 'CA_fresh', from: FROM, createdAt: new Date(NOW).toISOString(), status: 'in-progress' });
  result = await twilio('CA_fresh');
  ok('callback iniziale Twilio senza audio preserva fonte mancante e apre richiesta da verificare', result.code === 200
    && result.followUp?.ok && messages().length === 1 && messages()[0][1].analysisText === null && tasks().length === 1, result);

  ok('nessun modello, audio download, Telegram, chiamata o invio cliente nei recuperi', network.length === 0 && globalThis.__mails.length === 0, network);
} finally { Date.now = realNow; }
console.log(`${checks} check callcase, ${fails} falliti`);
process.exit(fails ? 1 : 0);
