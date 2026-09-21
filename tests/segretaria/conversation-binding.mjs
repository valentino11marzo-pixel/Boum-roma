// Real WhatsApp/email handlers + real MIME parser; only network transports fake.
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);
const imapSource = `export class ImapFlow {
  constructor() { globalThis.__imap.connections++; }
  async connect() {}
  async getMailboxLock() { return { release() {} }; }
  async search({ from }) {
    globalThis.__imap.searches.push(from);
    return globalThis.__imap.messages.filter(m => m.from === from).map(m => m.uid);
  }
  async fetchOne(uid) {
    const message = globalThis.__imap.messages.find(m => m.uid === Number(uid));
    return message ? { source: Buffer.from(message.raw) } : null;
  }
  async logout() {}
}`;
const imapURL = 'data:text/javascript,' + encodeURIComponent(imapSource);
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next) {
  if(s==='imapflow') return {url:${JSON.stringify(imapURL)},shortCircuit:true};
  return next(s,c);
}`), import.meta.url);
Object.assign(process.env, { FIREBASE_API_KEY: 'fixture', FIREBASE_ADMIN_EMAIL: 'admin@example.test',
  FIREBASE_ADMIN_PASS: 'fixture', HOMIE_SECRET: 'fixture', CRON_SECRET: 'fixture',
  PFS_IMAP_USER: 'operator@example.test', PFS_IMAP_PASS: 'fixture', ANTHROPIC_API_KEY: 'fixture',
  TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_CHAT_ID: '42' });

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
let messageCommitHook = null, recoveryCommitHook = null, failBindingMarker = false;
let sequence = 0, failingCollection = '', beforePatch = null, failCommit = false, bindingHook = null;
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
    if (failCommit && body.writes?.some(w => w.update?.name.includes('/operatorTasks/'))) return json({ error: { status: 'UNAVAILABLE' } }, 503);
    const operations = body.writes || [];
    if (recoveryCommitHook && operations.some(w => w.update?.fields?.conversationBindingConflict?.nullValue !== undefined)) {const hook=recoveryCommitHook;recoveryCommitHook=null;await hook();}
    if (failBindingMarker && operations.some(w => w.update?.fields?.conversationBindingStatus)) return json({error:{status:'UNAVAILABLE'}},503);
    if (messageCommitHook && operations.some(w => w.update?.name.includes('/messages/'))) {const hook=messageCommitHook;messageCommitHook=null;await hook();}
    if (bindingHook && operations.some(w => w.update?.name.includes('/leads/'))) { const hook=bindingHook; bindingHook=null; await hook(); }
    const taskWrite = operations.find(w => w.update?.name.includes('/operatorTasks/'));
    if (beforePatch && taskWrite) {
      const hook = beforePatch; beforePatch = null;
      await hook(taskWrite.update.name.split('/documents/')[1]);
    }
    // Validate EVERY precondition first; a failed commit changes no document.
    for (const operation of operations) {
      const path = (operation.update?.name || operation.delete)?.split('/documents/')[1];
      if (!path) throw new Error('unsupported_commit_shape');
      const condition = operation.currentDocument || {};
      if ((condition.exists === false && DB.has(path)) || (condition.exists === true && !DB.has(path))
        || (condition.updateTime && versions.get(path) !== condition.updateTime)) {
        return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      }
    }
    const results = [];
    for (const operation of operations) {
      if (operation.delete) { results.push({}); continue; }
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

const { captureFollowUp, refreshTrackedFollowUp } = await import('../../api/segretaria/_follow-up.js');
const { default: messageHandler } = await import('../../api/homie/message.js');
const { default: scanHandler } = await import('../../api/segretaria/scan-replies.js');
const CID = 'conv_lead_leadA';
const conv = { contactType: 'lead', contactId: 'leadA', leadId: 'leadA', contactName: 'Cliente fixture',
  contactPhone: '+393331234567', contactEmail: 'client@example.test', segretaria: false, needsReply: false, unread: 0 };
function reset() {
  DB.clear(); versions.clear(); writes.length = 0;
  sequence = 0; failingCollection = ''; beforePatch = null; failCommit = false;
  globalThis.__imap = { connections: 0, searches: [], messages: [] };
  save('conversations/' + CID, { ...conv });
  save('leads/leadA', { phone: conv.contactPhone, email: conv.contactEmail, propertyId: 'pA', status: 'contacted' });
  save('properties/pA', { name: 'Immobile fixture' });
}
async function call(handler, body = {}, query = {}) {
  let code, output;
  await handler({ method: 'POST', body, query, headers: { 'x-homie-secret': 'fixture', authorization: 'Bearer fixture' } }, {
    status(value) { code = value; return this; }, json(value) { output = value; return this; }, setHeader() {}, end() {},
  });
  return { code, ...output };
}
async function followed() {
  const task = await captureFollowUp({ cid: CID, conv, messageId: 'initial-event', text: 'Documento da controllare', now: NOW - 1000 });
  const path = 'operatorTasks/' + task.id;
  save(path, { ...DB.get(path), followUp: { ...task.followUp, practiceRef: 'contracts/verified', propertyRef: 'properties/pA',
    nextAction: 'Controllare la ricevuta', waitingOn: 'client', waitingLabel: 'Cliente fixture',
    checkAt: '2026-09-15T10:00:00.000Z', needsReview: false, confirmed: true } });
  return path;
}
const inbound = (mid, extra = {}) => ({ direction: 'in', channel: 'whatsapp', contactType: 'lead', contactId: 'leadA',
  phone: conv.contactPhone, email: conv.contactEmail, name: conv.contactName, body: 'Ecco il dettaglio richiesto',
  messageId: mid, timestamp: new Date(NOW).toISOString(), ...extra });
function mail(uid, id, from = conv.contactEmail, text = 'Here is the receipt.\r\n\r\nOn Monday we wrote:\r\n> Old quoted thread') {
  globalThis.__imap.messages.push({ uid, from, raw: `From: Client <${from}>\r\nTo: Operator <operator@example.test>\r\nDate: Mon, 14 Sep 2026 12:00:00 +0200\r\nMessage-ID: <${id}@fixture.test>\r\nSubject: Re: Receipt\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}` });
}
const messages = () => [...DB].filter(([p]) => p.startsWith('messages/'));
const tasks = () => [...DB].filter(([p, row]) => p.startsWith('operatorTasks/') && row.followUp);
const preserved = row => row.followUp.practiceRef === 'contracts/verified' && row.followUp.nextAction === 'Controllare la ricevuta'
  && row.followUp.waitingOn === 'client' && row.followUp.checkAt === '2026-09-15T10:00:00.000Z';

const { default: conversationHandler } = await import('../../api/homie/conversation.js');
const { resolveLeadConversation } = await import('../../api/homie/_conversation.js');
const { handoverSegretaria, segretariaOpen } = await import('../../api/segretaria/_core.js');
const { default: inboxSync } = await import('../../api/homie/inbox-sync.js');
const PHONE='+393330001111', WA='conv_whatsapp_393330001111', LID='lead-fixture', PRIMARY='conv_lead_'+LID;
const rows=coll=>[...DB].filter(([p])=>p.startsWith(coll+'/'));
function blank(){DB.clear();versions.clear();writes.length=0;network.length=0;sequence=0;bindingHook=null;messageCommitHook=null;recoveryCommitHook=null;failBindingMarker=false;failingCollection='';failCommit=false;
  globalThis.__imap={connections:0,searches:[],messages:[]};save('users/admin',{role:'admin'});
  save('settings/segretaria',{enabled:true,prepareCases:true,prepareSince:'2026-01-01T00:00:00Z',automaticReplies:false});}
const raw=(id,extra={})=>({direction:'in',channel:'whatsapp',phone:PHONE,email:'client@example.test',name:'Synthetic Fixture',
  body:'Cerco una stanza a Roma per tre mesi',messageId:id,timestamp:new Date(NOW).toISOString(),...extra});
async function api(leadId=LID,token='admin') {let code,out;await conversationHandler({method:'POST',headers:{authorization:'Bearer '+token},body:{leadId}},
  {setHeader(){},status(n){code=n;return this;},json(v){out=v;return this;}});return {code,...out};}
function legacy({ref=true,backlink=true}={}){save('leads/'+LID,{phone:PHONE,email:'client@example.test',...(ref?{conversationId:WA}:{})});
  save('conversations/'+WA,{contactType:'whatsapp',contactId:PHONE.slice(1),contactPhone:PHONE,contactEmail:'client@example.test',
    contactName:'Synthetic Fixture',...(backlink?{leadId:LID}:{}),channel:'whatsapp',unread:0});}
async function dual(){legacy();save('conversations/'+PRIMARY,{contactType:'lead',contactId:LID,leadId:LID,contactPhone:PHONE,contactEmail:'client@example.test',segretaria:true});
  save('messages/history-wa',{conversationId:WA,at:new Date(NOW-1000).toISOString(),direction:'in',body:'Old WA'});
  save('messages/history-primary',{conversationId:PRIMARY,at:new Date(NOW-1000).toISOString(),direction:'in',body:'Old primary'});
  await captureFollowUp({cid:WA,conv:DB.get('conversations/'+WA),messageId:'history-wa',text:'Old WA',now:NOW-1000});
  await captureFollowUp({cid:PRIMARY,conv:DB.get('conversations/'+PRIMARY),messageId:'history-primary',text:'Old primary',now:NOW-1000});}
try{
  blank();let a=await call(messageHandler,raw('first')),b=await call(messageHandler,raw('second',{body:'Posso vedere la stanza domani?'}));
  ok('sconosciuto diventa lead: secondo inbound stesso CID e stesso caso',a.code===200&&b.code===200&&a.conversationId===WA&&b.conversationId===WA
    &&tasks().length===1&&tasks()[0][1].followUp.lastMessageId==='second'&&rows('leads').length===1&&!DB.has('conversations/conv_lead_'+a.leadId),{a,b});
  ok('riferimenti lead e chat persistiti nello stesso legame',DB.get('leads/'+a.leadId).conversationId===WA&&DB.get('conversations/'+WA).leadId===a.leadId);
  let endpoint=await api(a.leadId);ok('apertura admin riusa WA verificata senza nuova chat',endpoint.code===200&&endpoint.status==='bound'&&endpoint.cid===WA&&rows('conversations').length===1,endpoint);
  const beforeLead=a.leadId;DB.delete('leads/'+beforeLead);
  b=await call(messageHandler,raw('first',{contactType:'lead',contactId:'changed-contact',phone:'+393339999999',body:'REPLAY'}));
  ok('retry risolve prima fonte persistita e non nuova identità del payload',b.code===200&&b.dedupHit&&b.conversationId===WA&&rows('conversations').length===1,b);

  blank();const firstRace=await Promise.all([call(messageHandler,raw('race-first')),call(messageHandler,raw('race-second'))]);
  ok('primi messaggi concorrenti creano un solo lead con backlink atomico',firstRace.every(r=>r.code===200)&&rows('leads').length===1
    &&DB.get('conversations/'+WA).leadId===rows('leads')[0][0].split('/')[1]&&rows('leads')[0][1].conversationId===WA,firstRace);

  blank();a=await call(messageHandler,raw('hello',{body:'Ciao'}));b=await call(messageHandler,raw('substantive'));
  ok('saluto prima del lead conserva chat e caso quando arriva richiesta sostanziale',a.conversationId===b.conversationId&&tasks().length===1&&rows('leads').length===1);

  blank();legacy({backlink:false});a=await call(messageHandler,raw('binding-repair'));
  ok('finestra lead creato prima del backlink riparata sulla stessa chat',a.code===200&&a.conversationId===WA&&DB.get('conversations/'+WA).leadId===LID&&rows('conversations').length===1,a);
  blank();legacy({ref:false});endpoint=await api();
  ok('backlink verificato completa reference mancante senza migrare messaggi',endpoint.code===200&&endpoint.cid===WA&&DB.get('leads/'+LID).conversationId===WA,endpoint);

  blank();save('leads/'+LID,{phone:PHONE,email:'client@example.test'});
  const concurrent=await Promise.all([api(),api()]);
  ok('due aperture admin concorrenti creano una sola chat e un solo legame',concurrent.every(r=>r.code===200)&&rows('conversations').length===1
    &&DB.get('leads/'+LID).conversationId===PRIMARY&&concurrent.every(r=>r.cid===PRIMARY),concurrent);
  ok('endpoint creazione non inventa messaggi, casi o invii',messages().length===0&&tasks().length===0&&rows('action_queue').length===0);

  blank();await dual();const count=writes.length;endpoint=await api();
  ok('due chat con storia: 409 senza fusione, nuove chat o scritture',endpoint.code===409&&endpoint.status==='conflict'&&writes.length===count&&rows('conversations').length===2,endpoint);
  save('settings/segretaria',{enabled:true,prepareCases:true,prepareSince:'2026-01-01T00:00:00Z',automaticReplies:true});
  a=await call(messageHandler,raw('dual-new'));
  ok('ingest dual storico conserva primaria su percorso esistente e dichiara conflitto',a.code===200&&a.conversationId===PRIMARY
    &&a.conversationStatus==='conflict'&&rows('conversations').length===2&&tasks().length===2&&messages().length===3,a);
  ok('conflitto non sposta caso storico né avvia turno automatico',tasks().some(([,t])=>t.followUp.conversationId===WA&&t.followUp.lastMessageId==='history-wa')
    &&rows('action_queue').length===0&&network.length===0&&DB.get('leads/'+LID).conversationId===WA);
  b=await call(messageHandler,raw('dual-new'));ok('retry conserva dichiarazione conflitto',b.dedupHit&&b.conversationStatus==='conflict',b);

  blank();legacy({ref:false,backlink:false});endpoint=await api();
  ok('raw WA senza legame non genera primaria parallela per un lead esterno',endpoint.code===409&&endpoint.reason==='unbound_whatsapp_conversation'&&rows('conversations').length===1&&!DB.get('leads/'+LID).conversationId,endpoint);

  blank();legacy();messageCommitHook=()=>save('leads/'+LID,{...DB.get('leads/'+LID),conversationId:'conv_lead_other'});
  a=await call(messageHandler,raw('changed-pointer'));
  ok('riferimento lead cambia prima della primaria: vecchia rotta non scritta',a.code===503&&messages().length===0&&DB.get('leads/'+LID).conversationId==='conv_lead_other',a);

  blank();legacy();messageCommitHook=()=>save('conversations/'+WA,{...DB.get('conversations/'+WA),contactType:'tenant',contactId:'foreign',contactUid:'foreign',leadId:'foreign-lead'});
  a=await call(messageHandler,raw('changed-chat'));
  ok('identità chat cambia durante primaria: nessun messaggio esposto a utente estraneo',a.code===503&&messages().length===0&&DB.get('conversations/'+WA).contactUid==='foreign',a);

  for(const mode of [null,'backlog_review']) {blank();await dual();save('conversations/'+PRIMARY,{...DB.get('conversations/'+PRIMARY),lastMessageAt:new Date(NOW+10000).toISOString(),lastMessagePreview:'newer'});
    a=await call(messageHandler,raw('late-conflict'+mode,{...(mode?{intakeMode:mode}:{})}));
    ok('conflitto resta visibile su chat anche senza avanzare head '+mode,a.code===200&&a.conversationStatus==='conflict'
      &&DB.get('conversations/'+PRIMARY).conversationBindingConflict&&DB.get('conversations/'+PRIMARY).lastMessagePreview==='newer',a);
  }

  blank();save('conversations/'+WA,{contactType:'whatsapp',contactId:PHONE.slice(1),contactPhone:PHONE,contactEmail:'client@example.test',segretaria:true});
  save('settings/segretaria',{enabled:true,prepareCases:true,prepareSince:'2026-01-01T00:00:00Z',automaticReplies:true});
  messageCommitHook=()=>{save('leads/'+LID,{phone:PHONE,conversationId:PRIMARY,createdAt:new Date(NOW).toISOString()});save('conversations/'+PRIMARY,{contactType:'lead',contactId:LID,leadId:LID,contactPhone:PHONE});};
  a=await call(messageHandler,raw('prior-conflict'));
  ok('lead concorrente con altro binding preserva primaria ma dichiara conflitto senza falso dedup',a.code===200&&a.conversationId===WA&&a.conversationStatus==='conflict'&&!a.leadDeduped
    &&messages().length===1&&tasks().length===0&&network.length===0&&DB.get('conversations/'+WA).conversationBindingConflict, a);
  b=await call(messageHandler,raw('prior-conflict'));ok('retry del conflitto post-primary non iscrive caso né avvia turno',b.conversationStatus==='conflict'&&tasks().length===0&&network.length===0,b);

  blank();save('conversations/'+WA,{contactType:'whatsapp',contactId:PHONE.slice(1),contactPhone:PHONE,segretaria:true});
  messageCommitHook=()=>{save('leads/'+LID,{phone:PHONE,conversationId:PRIMARY,createdAt:new Date(NOW).toISOString()});save('conversations/'+PRIMARY,{contactType:'lead',contactId:LID,leadId:LID,contactPhone:PHONE});};
  failBindingMarker=true;a=await call(messageHandler,raw('marker-failure'));
  ok('marker indisponibile dopo primaria restituisce retry senza seguito completato',a.code===503&&a.followUp?.tracked===false&&messages().length===1&&tasks().length===0&&network.length===0,a);
  b=await call(messageHandler,raw('marker-failure'));
  ok('retry con marker ancora indisponibile non iscrive caso',b.code===503&&b.retryable&&b.conversationStatus==='conflict'&&tasks().length===0,b);
  const originalVersion=versions.get('messages/'+a.messageId);
  failBindingMarker=false;b=await call(messageHandler,raw('marker-failure',{phone:'+393339999999'}));
  ok('retry ricostruisce conflitto dal CID persistito e salva marker senza nuova iscrizione',b.code===200&&b.dedupHit&&b.conversationId===WA&&b.conversationStatus==='conflict'
    &&DB.get('conversations/'+WA).conversationBindingConflict&&tasks().length===0&&messages().length===1,b);

  b=await call(messageHandler,raw('marker-failure'));
  ok('marker e suoi retry conservano versione primaria per ordinare timestamp pari',DB.get('messages/'+a.messageId).ingestVersion===originalVersion);

  for (const recovery of ['retry','new-inbound']) {
    blank();messageCommitHook=()=>{failingCollection='users';};a=await call(messageHandler,raw('transient'));
    const originalMid=a.messageId, originalIngest=DB.get('messages/'+originalMid).ingestVersion;
    ok('errore post-primary marcato unavailable '+recovery,a.code===200&&a.conversationStatus==='unavailable'&&messages().length===1&&tasks().length===0,a);
    failingCollection='';b=await call(messageHandler,raw(recovery==='retry'?'transient':'after-transient'));
    ok('letture recuperate rimuovono solo unavailable sullo stesso CID '+recovery,b.code===200&&!b.conversationStatus&&b.conversationId===WA&&rows('leads').length===1
      &&tasks().length===1&&!DB.get('conversations/'+WA).conversationBindingConflict&&messages().length===(recovery==='retry'?1:2),b);
    const replay=await call(messageHandler,raw('transient'));
    ok('retry successivo non duplica né cambia ordine primario '+recovery,replay.code===200&&!replay.conversationStatus&&DB.get('messages/'+originalMid).ingestVersion===originalIngest
      &&tasks().length===1&&rows('leads').length===1,replay);
  }

  blank();messageCommitHook=()=>{failingCollection='users';};a=await call(messageHandler,raw('recover-race'));failingCollection='';
  recoveryCommitHook=()=>save('conversations/'+WA,{...DB.get('conversations/'+WA),conversationBindingConflict:'new_persisted_conflict',conversationBindingStatus:'conflict'});
  b=await call(messageHandler,raw('recover-race'));
  ok('conflitto vero sopraggiunto durante recupero non cancellato dal CAS',b.code===200&&b.conversationStatus==='conflict'&&b.conversationReason==='new_persisted_conflict'
    &&DB.get('conversations/'+WA).conversationBindingConflict==='new_persisted_conflict'&&tasks().length===0,b);

  blank();failingCollection='leads';a=await call(messageHandler,raw('resolution-failure'));
  ok('lettura identità fallita prima del CID non crea fallback raw',a.code===503&&messages().length===0&&rows('conversations').length===0,a);failingCollection='';

  blank();legacy();save('leads/other',{phone:PHONE});endpoint=await api();
  ok('telefono condiviso non autorizza fusione o primo risultato arbitrario',endpoint.code===409&&endpoint.reason==='shared_contact_identity'&&rows('conversations').length===1,endpoint);
  blank();legacy();save('users/a',{role:'admin',phone:PHONE});save('users/b',{role:'admin',phone:PHONE});save('users/hidden',{role:'tenant',phone:PHONE});endpoint=await api();
  ok('pagina piena con ruoli ignorabili non certifica identità unica',endpoint.code===503&&endpoint.reason==='identity_scan_incomplete',endpoint);
  blank();legacy();const deniedWrites=writes.length;endpoint=await api(LID,'tenant');
  ok('apertura lead richiede admin e non scrive senza ruolo',endpoint.code===403&&writes.length===deniedWrites,endpoint);
  blank();legacy();failingCollection='conversations';endpoint=await api();a=await call(messageHandler,raw('unreadable'));
  ok('lettura fallita: 503 senza creare fallback o dichiarare assenza',endpoint.code===503&&a.code===503&&rows('conversations').length===1&&messages().length===0,{endpoint,a});failingCollection='';
  blank();legacy();save('conversations/'+WA,{...DB.get('conversations/'+WA),leadId:'different-person'});endpoint=await api();
  ok('riferimento contraddittorio non sovrascrive identità esistente',endpoint.code===409&&DB.get('conversations/'+WA).leadId==='different-person',endpoint);

  blank();save('leads/'+LID,{phone:PHONE,convertedUserId:'tenant-new',conversationId:'conv_tenant_tenant-new'});
  save('users/tenant-new',{role:'tenant',phone:PHONE});save('conversations/conv_tenant_tenant-new',{contactType:'tenant',contactId:'tenant-new',contactUid:'tenant-new',contactPhone:PHONE,leadId:LID});
  a=await call(messageHandler,raw('converted'));
  ok('relazione convertedUserId conserva CID e ruolo senza riscrivere ACL storiche',a.code===200&&a.conversationId==='conv_tenant_tenant-new'
    &&DB.get('messages/'+a.messageId)?.contactUid==='tenant-new'&&DB.get('conversations/'+a.conversationId).contactType==='tenant',a);

  blank();legacy({ref:false});save('messages/old-wa',{conversationId:WA});
  bindingHook=()=>{save('conversations/'+PRIMARY,{contactType:'lead',contactId:LID,leadId:LID,contactPhone:PHONE});save('messages/old-primary',{conversationId:PRIMARY});};
  endpoint=await api();
  ok('alternativa comparsa durante CAS resta intatta e impedisce nuovo binding',endpoint.code===409&&!DB.get('leads/'+LID).conversationId
    &&DB.has('conversations/'+PRIMARY)&&messages().length===2,endpoint);

  blank();save('leads/'+LID,{phone:PHONE});save('conversations/'+PRIMARY,{contactType:'lead',contactId:LID,contactPhone:PHONE,unread:3});
  bindingHook=()=>save('conversations/'+PRIMARY,{...DB.get('conversations/'+PRIMARY),contactId:'foreign',contactUid:'foreign'});
  endpoint=await api();
  ok('cambio identità durante binding vince CAS: nessun riferimento vecchio scritto',endpoint.code===409&&!DB.get('leads/'+LID).conversationId
    &&DB.get('conversations/'+PRIMARY).contactUid==='foreign',endpoint);

  blank();legacy();let handover=await handoverSegretaria(LID);
  ok('handover usa lo stesso CID senza creare primaria alternativa',handover.ok&&handover.cid===WA&&DB.get('conversations/'+WA).segretaria===true&&rows('conversations').length===1,handover);
  save('settings/segretaria',{enabled:true,automaticReplies:true});save('conversations/'+WA,{...DB.get('conversations/'+WA),segretariaTurns:1});
  const opening=await segretariaOpen(LID,NOW);ok('apertura legge turno della chat realmente consegnata',opening.acted===false&&opening.why==='conversazione già avviata',opening);
  let sync=await call(inboxSync,{updates:[{contactType:'lead',contactId:LID,urgency:'high'}]});
  ok('inbox-sync per lead aggiorna la chat legata',sync.code===200&&sync.updated===1&&DB.get('conversations/'+WA).urgency==='high'&&rows('conversations').length===1,sync);

  blank();legacy();save('conversations/'+WA,{...DB.get('conversations/'+WA),segretaria:true});
  mail(1,'stable-email');let scan=await call(scanHandler);
  ok('email della chat consegnata conserva stesso CID',scan.code===200&&scan.processed===1&&messages().length===1&&messages()[0][1].conversationId===WA,scan);
  ok('resolver e aperture non hanno avviato rete esterna o notifiche',network.length===0&&rows('action_queue').length===0,network);

  if(!process.env.BOOM_CONVERSATION_MUTANT&&!fails){
    const fs=await import('node:fs/promises'),{fileURLToPath}=await import('node:url'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{spawnSync}=await import('node:child_process');
    const root=fileURLToPath(new URL('../../',import.meta.url));
    const mutants=[
      {name:'binding persistito governa CID',from:'binding || attachCid || aliases[0]?.id || primaryId',to:'primaryId'},
      {name:'due chat storiche restano distinte',from:'if (primary) {',to:'if (false) {'},
      {name:'identità condivisa blocca scelta arbitraria',from:'const identity = await sharedIdentity(lead);',to:'const identity = null;'},
      {name:'assenza alternativa verificata nello stesso CAS',from:"{ docPath: 'conversations/' + primaryId, assertAbsent: true }",to:"{ docPath: 'conversations/' + candidateId, fields, precondition: guard(candidate) }"},
      {name:'rotta legata alla versione lead nella primaria',file:'api/homie/message.js',from:'if (bindingGuard) writes.push(bindingGuard);',to:'/* stale route allowed */'},
      {name:'identità chat protetta nei retry primari',file:'api/homie/message.js',from:'if (bindingIdentity && bindingIdentityChanged(current, bindingIdentity))',to:'if (false)'},
      {name:'conflitto marcato anche senza avanzare head',file:'api/homie/message.js',from:'if (msg.conversationBindingConflict) fields =',to:'if (false) fields ='},
      {name:'binding secondario fallito vieta nuovo turno',file:'api/homie/message.js',from:'if (leadInfo?.bindingStatus)',to:'if (false)'},
      {name:'retry ricostruisce conflitto post-primary',file:'api/homie/message.js',from:'if (!bindingConflict) {',to:'if (false) {'},
      {name:'marker preserva versione originale del messaggio',file:'api/homie/message.js',from:'snapshots[i].data.ingestVersion || snapshots[i].updateTime',to:'snapshots[i].updateTime'},
      {name:'unavailable temporaneo recupera sul retry',file:'api/homie/message.js',from:"if (bindingConflict && bindingStatus === 'unavailable')",to:'if (false)'},
      {name:'recupero non cancella conflitto concorrente',file:'api/homie/message.js',from:"row.data.conversationBindingStatus !== 'unavailable'",to:'false'},
      {name:'binding CAS protegge identità concorrente',from:'precondition: guard(candidate)',to:'precondition: { exists: !!candidate }'},
    ];
    for(const m of mutants){const scratch=await fs.mkdtemp(join(tmpdir(),'boom-cid-mutant-'));try{
      await fs.cp(root+'api',scratch+'/api',{recursive:true});await fs.cp(root+'js',scratch+'/js',{recursive:true});
      await fs.mkdir(scratch+'/tests/segretaria',{recursive:true});await fs.cp(root+'tests/notify',scratch+'/tests/notify',{recursive:true});
      await fs.copyFile(root+'tests/segretaria/conversation-binding.mjs',scratch+'/tests/segretaria/conversation-binding.mjs');
      await fs.symlink(root+'node_modules',scratch+'/node_modules');
      const path=scratch+'/'+(m.file||'api/homie/_conversation.js'),source=await fs.readFile(path,'utf8');if(!source.includes(m.from))throw new Error('mutation_target_missing: '+m.name);
      await fs.writeFile(path,source.replace(m.from,m.to));const run=spawnSync(process.execPath,[scratch+'/tests/segretaria/conversation-binding.mjs'],{encoding:'utf8',timeout:30000,env:{...process.env,BOOM_CONVERSATION_MUTANT:'1'}});
      ok('mutazione intercettata: '+m.name,run.status!==0&&/^FAIL /m.test(run.stdout),run.status===0?'mutation survived':run.stderr.slice(0,200));
    }finally{await fs.rm(scratch,{recursive:true,force:true});}}
  }
}finally{Date.now=realNow;}
console.log(`Conversation binding: ${checks-fails}/${checks} PASS`);if(fails)process.exitCode=1;
