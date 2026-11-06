// Real mailbox/auth/admission/seguito handlers. Only IMAP and Firestore are fake.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reset, call } from './fixture.mjs';
// Load after the fixture installed transport/mutation hooks, not alongside its
// top-level initialization (ESM can otherwise preload these modules unmutated).
const { emailConversationId } = await import('../../api/mailbox/_admission.js');
const { personaDossier } = await import('../../api/segretaria/_persona.js');
const { default: followUpHandler } = await import('../../api/segretaria/follow-up.js');
let checks = 0, failed = 0;
const check = (name, pass, detail) => { checks++; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${!pass ? ' ' + JSON.stringify(detail) : ''}`); if (!pass) failed++; };
const CONTACT = 'client@example.invalid', CID = emailConversationId(CONTACT), MID = '<mail-24@fixture.invalid>';
const MESSAGE = 'segretaria_mail_' + createHash('sha256').update(MID).digest('hex');
const text = 'Dettaglio sintetico. '.repeat(115) + 'Verificare i documenti entro domani alle 10:00.';
const rawText = text + '\nOn Monday someone wrote:\nRichiesta precedente.';
function setup() {
  const io = reset(), row = io.rows[23];
  row.envelope = { from: [{ name: 'Portale sintetico', address: 'portal@example.invalid' }],
    replyTo: [{ name: 'Nome non certificato', address: CONTACT }], date: new Date(Date.now() - 60000) };
  row.parts.TEXT = rawText;
  row.structure = { type: 'text/plain', encoding: '8bit', parameters: { charset: 'utf-8' }, size: Buffer.byteLength(rawText) };
  return io;
}
const source = async () => (await call()).items[0].messageRef;
const admit = (ref, more = {}, options) => call({ action: 'admit', messageRef: ref, confirmedEmail: CONTACT, ...more }, options);
const docs = (io, prefix) => [...io.db].filter(([p]) => p.startsWith(prefix + '/'));
async function follow(body, query, method = 'POST') {
  let code = 200, data;
  await followUpHandler({ method, body, query, headers: { authorization: 'Bearer valid' } },
    { setHeader() {}, status(n) { code = n; return this; }, json(d) { data = d; return this; } });
  return { code, ...data };
}

let io = setup(), ref = await source(), r = await call({ action: 'read', messageRef: ref });
check('lettura espone il recapito di Reply-To server, senza scritture', r.message?.importContact === CONTACT && io.writes.length === 0, r);
r = await admit(ref, { contactName: 'Persona confermata', body: 'contraffatto', propertyId: 'casa-inventata', leadId: 'lead-inventato', confirmed: true });
const stored = io.db.get('messages/' + MESSAGE), conv = io.db.get('conversations/' + CID);
check('ammissione crea una conversazione email e fonte insieme', r.code === 200 && r.created && r.imported && !r.duplicate && r.conversationId === CID && r.messageId === MESSAGE, r);
check('identità è recapito confermato, senza ruolo/account/lead/casa dedotti', conv?.contactType === 'email' && conv.contactEmail === CONTACT
  && conv.contactName === 'Persona confermata' && conv.segretaria === false && !conv.contactUid && !conv.leadId && !conv.assignedLandlordId
  && !conv.propertyId && !conv.contactPhone && conv.mailboxAdmission.actor === 'admin', conv);
check('fonte oltre 2k è integra, testo e provenienza client non possono alterarla', stored?.mailboxSource.text === rawText && stored.body.length === 2000
  && stored.mailboxSource.replyTo[0].address === CONTACT && stored.mailboxSource.from[0].address === 'portal@example.invalid' && !stored.propertyId, stored);
check('solo fonte e header, nessun lead/caso/invio/flag IMAP', io.writes.every(w => /^(messages|conversations)\//.test(w.path))
  && io.forbidden.length === 0 && io.locks.every(l => l.options.readOnly), io.writes);
const dossier = await personaDossier({ conversationId: CID });
check('conversazione raw riusa dossier senza inventare pratica', !dossier.identityIncomplete && !dossier.identityAmbiguous && !dossier.practices.length, dossier);
let started = await follow({ op: 'start', conversationId: CID, messageId: MESSAGE });
check('presa in carico usa fonte oltre 2k senza modello né invio', started.code === 200 && started.task?.followUp.intakeTiming?.quote.includes('entro domani')
  && !started.task.followUp.propertyRef && !started.task.followUp.practiceRef, started);
const task = started.task;
const next = { op: 'confirm', id: task.id, lastMessageId: task.followUp.lastMessageId,
  nextAction: 'Verificare i documenti ricevuti', waitingOn: 'valentino', waitingLabel: 'Valentino',
  checkAt: new Date(Date.now() + 3600000).toISOString(), practiceRef: null };
const decision = await follow(next);
const reopened = await follow(null, { id: task.id }, 'GET');
check('prossimo passo persiste a rilettura, pratica resta non assegnata', decision.code === 200 && reopened.code === 200
  && reopened.task.followUp.nextAction === next.nextAction && reopened.task.followUp.checkAt === next.checkAt
  && reopened.task.followUp.confirmedBy === 'admin' && !reopened.task.followUp.practiceRef && reopened.task.followUp.needsReview, { decision, reopened });
r = await admit(ref, { contactName: 'Nome che non deve sovrascrivere' });
check('retry stesso evento non duplica né sovrascrive nome/seguito', r.code === 200 && !r.created && r.duplicate && docs(io, 'messages').length === 1
  && docs(io, 'conversations').length === 1 && io.db.get('conversations/' + CID).contactName === 'Persona confermata'
  && io.db.get('operatorTasks/' + task.id).followUp.nextAction === next.nextAction, r);
check('giro completo conserva zero provider/coda/lead e HOLD', io.forbidden.length === 0 && !docs(io, 'leads').length
  && !docs(io, 'action_queue').length && io.db.get('conversations/' + CID).segretaria === false, io.forbidden);

for (const [name, body, code] of [
  ['consenso recapito assente', { confirmedEmail: undefined }, 'email_contact_confirmation_required'],
  ['consenso altro recapito', { confirmedEmail: 'another@example.invalid' }, 'email_confirmation_changed'],
  ['nome non testuale', { contactName: { name: 'test' } }, 'invalid_contact_name'],
  ['nome fuori limite', { contactName: 'x'.repeat(151) }, 'invalid_contact_name'],
  ['nome controllo', { contactName: 'Persona\nRuolo inventato' }, 'invalid_contact_name'],
]) {
  io = setup(); ref = await source(); r = await admit(ref, body);
  check(name + ': zero scritture', r.error === code && io.writes.length === 0, r);
}
io = setup(); ref = await source(); r = await admit(ref, { confirmedEmail: ' CLIENT@EXAMPLE.INVALID ' });
check('recapito confermato normalizzato, nome predefinito è email', r.code === 200 && io.db.get('conversations/' + CID).contactName === CONTACT, r);
for (const role of ['tenant', 'landlord', 'owner']) {
  io = setup(); ref = await source(); io.role = role; r = await admit(ref);
  check('ammissione admin-only: ' + role, r.code === 403 && io.writes.length === 0, r);
}
for (const [name, change, code] of [
  ['source troncata', row => row.structure.size = 400000, 'email_body_incomplete'],
  ['source mittente multiplo', row => row.envelope.from.push({ address: CONTACT }), 'email_sender_ambiguous'],
  ['source Reply-To mutato dopo lettura', row => row.envelope.replyTo = [{ address: 'other@example.invalid' }], 'email_confirmation_changed'],
  ['source solo allegato', row => row.structure = { type: 'application/pdf', disposition: 'attachment' }, 'email_body_incomplete'],
]) {
  io = setup(); ref = await source(); change(io.rows[23]); r = await admit(ref);
  check(name + ': nessuna nuova richiesta', r.error === code && io.writes.length === 0, r);
}
io = setup(); ref = await source(); io.validity = 222n; r = await admit(ref);
check('UIDVALIDITY cambiato impedisce ammissione', r.error === 'mailbox_changed' && io.writes.length === 0, r);
io = setup(); ref = await source(); const [payload, sig] = ref.split('.'); const proof = JSON.parse(Buffer.from(payload, 'base64url')); proof.uid = 2;
r = await admit(Buffer.from(JSON.stringify(proof)).toString('base64url') + '.' + sig);
check('source firmata non falsificabile', r.error === 'invalid_reference' && io.writes.length === 0, r);

io = setup(); io.put('conversations/existing', { contactEmail: ' CLIENT@EXAMPLE.INVALID ', contactName: 'Esistente', contactType: 'client', contactId: 'known' });
ref = await source(); r = await admit(ref);
check('esistente richiede scelta esplicita, senza creare né importare', r.code === 409 && r.error === 'email_conversation_exists'
  && r.conversation?.id === 'existing' && r.conversation.email === CONTACT && io.writes.length === 0, r);
io.put('conversations/other', { contactEmail: CONTACT, contactType: 'client', contactId: 'second' }); r = await admit(ref);
check('due conversazioni stessa email non vengono fuse', r.error === 'email_identity_ambiguous' && io.writes.length === 0, r);
io = setup(); io.put('conversations/' + CID, { contactType: 'email', contactEmail: CONTACT, contactId: CID.slice(11) }); ref = await source(); r = await admit(ref);
check('ID deterministico preesistente non prova ammissione nostra', r.error === 'email_conversation_exists' && io.writes.length === 0, r);
io = setup(); for (let i = 0; i < 450; i++) io.put('conversations/a' + String(i).padStart(4, '0'), { contactEmail: `other${i}@example.invalid` });
io.put('conversations/zz-known', { contactEmail: CONTACT, contactType: 'client', contactId: 'known' }); ref = await source(); r = await admit(ref);
check('scansione oltre prime due pagine trova esistente normalizzato', r.error === 'email_conversation_exists' && r.conversation?.id === 'zz-known' && io.writes.length === 0, r);
io = setup(); for (let i = 0; i < 550; i++) io.put('conversations/a' + String(i).padStart(4, '0'), { contactEmail: `other${i}@example.invalid` });
io.rows[22].envelope = { ...io.rows[23].envelope, date: new Date(Date.now() - 120000) };
io.rows[22].parts = { ...io.rows[23].parts }; io.rows[22].structure = { ...io.rows[23].structure };
const pagedSources = (await call()).items; const firstAdmitted = await admit(pagedSources[0].messageRef);
r = await call({ action: 'import', conversationId: CID, messageRef: pagedSources[1].messageRef });
check('oltre500: prima email ammessa e seconda importata con identica copertura', firstAdmitted.code === 200 && firstAdmitted.created
  && r.code === 200 && r.imported && docs(io, 'messages').length === 2 && docs(io, 'conversations').length === 551, { firstAdmitted, r });
io = setup(); for (let i = 0; i < 2000; i++) io.put('conversations/a' + String(i).padStart(4, '0'), { contactEmail: `other${i}@example.invalid` });
ref = await source(); r = await admit(ref);
check('limite scansione non viene scambiato per assenza', r.error === 'email_identity_scan_incomplete' && io.writes.length === 0, r);

io = setup(); ref = await source(); const results = await Promise.all([admit(ref), admit(ref)]);
check('due conferme simultanee producono un header e un messaggio', results.every(v => v.code === 200)
  && results.filter(v => v.created).length === 1 && docs(io, 'messages').length === 1 && docs(io, 'conversations').length === 1, results);
io = setup(); const second = io.rows[22]; second.envelope = { ...io.rows[23].envelope, date: new Date(Date.now() - 120000) };
second.parts = { ...io.rows[23].parts }; second.structure = { ...io.rows[23].structure };
const sources = (await call()).items; const parallel = await Promise.all([admit(sources[0].messageRef), admit(sources[1].messageRef)]);
check('due email simultanee stesso recapito condividono conversazione', parallel.every(v => v.code === 200)
  && docs(io, 'conversations').length === 1 && docs(io, 'messages').length === 2 && io.db.get('conversations/' + CID).lastMessageAt === io.rows[23].envelope.date.toISOString(), parallel);
io = setup(); ref = await source(); io.loseAck = true; const lost = await admit(ref); r = await admit(ref);
check('ack perso riprende fonte salvata senza seconda copia', lost.code === 503 && r.code === 200 && r.duplicate && !r.created
  && docs(io, 'messages').length === 1 && docs(io, 'conversations').length === 1, { lost, r });
io = setup(); ref = await source(); await admit(ref); io.rows[23].parts.TEXT = 'Testo diverso con stesso Message-ID';
io.rows[23].structure.size = Buffer.byteLength(io.rows[23].parts.TEXT); r = await admit(ref);
check('replay Message-ID con testo mutato non riscrive fonte', r.error === 'email_message_identity_conflict'
  && io.db.get('messages/' + MESSAGE).mailboxSource.text === rawText && docs(io, 'messages').length === 1, r);
io = setup(); ref = await source(); await admit(ref); io.put('conversations/' + CID, { ...io.db.get('conversations/' + CID), segretaria: true });
r = await admit(ref);
check('retry non aggira affidamento alla Segretaria', r.error === 'conversation_automated' && docs(io, 'messages').length === 1, r);
io = setup(); ref = await source(); await admit(ref); io.put('conversations/' + CID, { ...io.db.get('conversations/' + CID), leadId: 'new-binding' });
r = await admit(ref);
check('retry non adotta identità collegata successivamente', r.code === 409 && docs(io, 'messages').length === 1, r);
io = setup(); ref = await source(); io.error = 'commit'; r = await admit(ref);
check('errore prima commit non lascia header orfano', r.code === 503 && docs(io, 'conversations').length === 0 && docs(io, 'messages').length === 0, r);
io = setup(); ref = await source(); io.beforeCommit = () => io.put('conversations/' + CID, { contactEmail: 'changed@example.invalid', contactType: 'client', contactId: 'changed' });
r = await admit(ref);
check('CAS non sovrascrive riassegnazione concorrente stesso ID', r.code === 409 && io.db.get('conversations/' + CID).contactEmail === 'changed@example.invalid'
  && docs(io, 'messages').length === 0, r);
io = setup(); ref = await source(); io.beforeCommit = () => io.put('conversations/legacy-concurrent', { contactEmail: CONTACT, contactType: 'client', contactId: 'another' });
r = await admit(ref);
check('writer legacy concorrente rilevato dopo commit: fonte preservata, identità da verificare', r.error === 'email_admission_review_required'
  && r.sourceSaved && r.conversationId === CID && io.db.get('messages/' + MESSAGE)?.mailboxSource.text === rawText
  && io.db.get('conversations/' + CID).conversationBindingConflict === 'email_admission_conflict', r);
started = await follow({ op: 'start', conversationId: CID, messageId: MESSAGE });
check('conflitto rilevato impedisce presa in carico', started.error === 'identity_not_verified' && !docs(io, 'operatorTasks').length, started);
io = setup(); ref = await source(); io.beforeCommit = () => { io.error = 'query'; }; r = await admit(ref);
check('verifica postcommit fallita dichiara fonte salvata senza falso successo', r.error === 'email_admission_verification_failed'
  && r.sourceSaved && docs(io, 'messages').length === 1, r);
io.error = null; r = await admit(ref);
check('retry verifica incompleta recupera stessa fonte', r.code === 200 && r.duplicate && docs(io, 'messages').length === 1, r);

io = setup(); io.put('users/person-a', { role: 'tenant', email: CONTACT, phone: '+393331111111' });
io.put('clients/person-b', { email: CONTACT, phone: '+393332222222' }); ref = await source(); r = await admit(ref);
const ambiguous = await personaDossier({ conversationId: CID });
check('record persone discordanti restano ambigui nel dossier, raw non li fonde', r.code === 200 && ambiguous.identityAmbiguous
  && !io.db.get('conversations/' + CID).contactUid && !io.db.get('conversations/' + CID).leadId && !io.db.get('conversations/' + CID).assignedLandlordId, ambiguous);
started = await follow({ op: 'start', conversationId: CID, messageId: MESSAGE });
check('richiesta raw con identità personale ambigua richiede verifica prima del seguito', started.error === 'identity_not_verified'
  && !docs(io, 'operatorTasks').length && io.db.get('messages/' + MESSAGE).mailboxSource.text === rawText, started);
io = setup(); io.put('users/person-a', { role: 'tenant', email: CONTACT, phone: '+39 333 1111111' });
io.put('clients/person-b', { email: CONTACT, phone: '00393331111111' }); ref = await source(); r = await admit(ref);
const equivalent = await personaDossier({ conversationId: CID });
started = await follow({ op: 'start', conversationId: CID, messageId: MESSAGE });
check('stesso telefono normalizzato tra schede non inventa ambiguità', !equivalent.identityAmbiguous && !equivalent.identityIncomplete
  && started.code === 200 && !started.task.followUp.practiceRef && !started.task.followUp.propertyRef, { equivalent, started });
io = setup(); io.put('clients/person-a', { email: CONTACT, phone: '+393331111111' });
io.put('users/person-b', { role: 'tenant', email: 'other@example.invalid', phone: '+393331111111' });
const phoneAmbiguous = await personaDossier({ phone: '+393331111111' });
check('recapito solo telefono con email personali discordanti resta ambiguo', phoneAmbiguous.identityAmbiguous
  && phoneAmbiguous.evidence.some(e => e.reason === 'shared_phone_distinct_emails'), phoneAmbiguous);

if (!process.env.BOOM_MAILBOX_MUTATION) for (const mutation of ['admission_confirm', 'admission_atomic', 'admission_scan', 'admission_dossier', 'admission_takecharge']) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, BOOM_MAILBOX_MUTATION: mutation }, encoding: 'utf8', timeout: 30000 });
  check('mutazione rilevata: ' + mutation, result.status !== 0 && result.stdout.includes('FAIL'), { status: result.status, tail: result.stdout.slice(-300), stderr: result.stderr.slice(-300) });
}
console.log(`\n${checks - failed}/${checks} checks passed`);
if (failed) process.exitCode = 1;
