// Real mailbox/auth/identity/atomic import. Synthetic IMAP and Firestore only.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reset, call } from './fixture.mjs';
let checks = 0, failed = 0;
const check = (name, pass, detail) => { checks++; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${!pass ? ' ' + JSON.stringify(detail) : ''}`); if (!pass) failed++; };
const CID = 'existing-email', contact = 'client@example.invalid', MID = '<mail-24@fixture.invalid>';
const messageId = 'segretaria_mail_' + createHash('sha256').update(MID).digest('hex');
const mailText = 'Richiesta sintetica: gennaio 2027, 8–12 mesi, due persone.\n\nNessuna casa associata.';
const base = { contactType: 'email', contactId: 'client-existing', contactEmail: contact, contactName: 'Persona sintetica', segretaria: false, status: 'open' };
function setup() {
  const io = reset();
  io.put('conversations/' + CID, base);
  const row = io.rows[23];
  row.envelope = { from: [{ address: 'notifiche@idealista.it' }], replyTo: [{ address: contact }], date: new Date(Date.now() - 60000) };
  row.structure = { type: 'text/plain', encoding: '8bit', parameters: { charset: 'utf-8' }, size: Buffer.byteLength(mailText) };
  row.parts.TEXT = mailText;
  return io;
}
const source = async () => (await call()).items[0].messageRef;
const read = ref => call({ action: 'read', messageRef: ref });
const ingest = (ref, more = {}, options) => call({ action: 'import', messageRef: ref, conversationId: CID, ...more }, options);
const messages = io => [...io.db].filter(([path]) => path.startsWith('messages/'));
const SEG = (await import('../../js/segretaria-engine.js')).default;
const { loadCaseContext, contextFingerprint } = await import('../../api/segretaria/_context.js');
const { default: followUpHandler } = await import('../../api/segretaria/follow-up.js');
async function takeCharge() {
  let code = 200, data;
  await followUpHandler({ method: 'POST', headers: { authorization: 'Bearer valid' },
    body: { op: 'start', conversationId: CID, messageId } },
  { setHeader() {}, status(n) { code = n; return this; }, json(d) { data = d; return this; } });
  return { code, ...data };
}
const caseContext = (io, task = { followUp: { conversationId: CID, lastMessageId: 'mail_' + SEG.textHash(MID) } }) =>
  loadCaseContext({ task, conversation: { id: CID, ...io.db.get('conversations/' + CID) },
    dossier: { identityIncomplete: false, identityAmbiguous: false, incomplete: false, ambiguous: false, practices: [], properties: [] } });
let io = setup(), ref = await source(), r = await read(ref);
check('read espone Reply-To e idoneità dalla fonte senza scrivere', r.message?.replyTo[0]?.address === contact && r.message.importable === true && r.message.importBlockReason === null && io.writes.length === 0, r);
r = await ingest(ref, { body: 'testo contraffatto', from: contact, propertyId: 'invented' });
check('import Idealista usa corpo e Reply-To riletti, ID compatibile con cron', r.code === 200 && r.imported && !r.duplicate && r.conversationId === CID && r.messageId === messageId && messages(io).length === 1, r);
const stored = io.db.get('messages/' + messageId);
check('fonte integrale e provenienza conservate, nessuna identità/casa dedotta', stored?.body === mailText && stored.mailboxSource.text === mailText && stored.mailboxSource.from[0].address === 'notifiche@idealista.it' && stored.mailboxSource.mode === 'manual' && !stored.propertyId && io.db.get('conversations/' + CID).contactEmail === contact, stored);
check('solo messaggio e intestazione: nessun lead, caso, coda o provider', io.writes.every(w => w.path === 'conversations/' + CID || w.path === 'messages/' + messageId) && io.forbidden.length === 0 && io.locks.every(l => l.options.readOnly === true), io.writes);
r = await ingest(ref); check('retry restituisce stesso messaggio senza duplicare', r.code === 200 && !r.imported && r.duplicate && messages(io).length === 1, r);

io = setup(); delete io.rows[23].envelope.replyTo; io.rows[23].envelope.from = [{ address: ' CLIENT@EXAMPLE.INVALID ' }]; ref = await source(); r = await ingest(ref);
check('email diretta ammessa con From esatto normalizzato e target esplicito', r.code === 200 && r.imported, r);
io = setup(); io.put('conversations/' + CID, { ...base, contactType: 'lead', contactId: 'leadA', leadId: 'leadA' });
io.put('leads/leadA', { email: contact, conversationId: CID }); ref = await source(); r = await ingest(ref);
check('lead esistente mantiene binding reciproco con guardia atomica', r.code === 200 && r.imported && io.db.get('leads/leadA').conversationId === CID && io.writes.filter(w => w.path === 'leads/leadA').every(w => Object.keys(w.fields).length === 0), r);

for (const [name, mutate, error] of [
  ['Reply-To multiplo', row => row.envelope.replyTo.push({ address: 'second@example.invalid' }), 'email_sender_ambiguous'],
  ['From multiplo', row => row.envelope.from.push({ address: 'second@example.invalid' }), 'email_sender_ambiguous'],
  ['mittente BOOM', row => row.envelope.from = [{ address: 'operator@example.invalid' }], 'email_not_inbound'],
  ['Reply-To BOOM', row => row.envelope.replyTo = [{ address: 'operator@example.invalid' }], 'email_not_inbound'],
  ['mail inviata a terzi', row => row.envelope.to = [{ address: 'elsewhere@example.invalid' }], 'email_not_inbound'],
  ['senza Message-ID', row => row.envelope.messageId = '', 'email_message_id_missing'],
  ['data invalida', row => row.envelope.date = 'invalid-date', 'email_date_invalid'],
  ['data futura', row => row.envelope.date = new Date(Date.now() + 86400000), 'email_date_invalid'],
  ['testo parziale', row => { row.structure.size = 400000; row.parts.TEXT = 'x'.repeat(400000); }, 'email_body_incomplete'],
  ['solo allegato', row => row.structure = { type: 'application/pdf', disposition: 'attachment', size: 90 }, 'email_body_incomplete'],
]) {
  io = setup(); mutate(io.rows[23]); ref = await source(); const preview = await read(ref); r = await ingest(ref);
  check(name + ': read blocca e import non scrive', !preview.message.importable && preview.message.importBlockReason === error && r.code === 409 && r.error === error && io.writes.length === 0, { preview: preview.message?.importBlockReason, code: r.code, error: r.error });
}
io = setup(); io.rows[23].structure = { type: 'text/plain', encoding: '8bit', parameters: { charset: 'iso-8859-1' }, size: 150000 }; io.rows[23].parts.TEXT = Buffer.alloc(150000, 0xe9); ref = await source(); r = await read(ref);
check('limite corpo conta bytes UTF-8 dopo decodifica e segnala taglio', r.message.truncated && !r.message.importable && Buffer.byteLength(r.message.text) <= 262144, { truncated: r.message.truncated, length: Buffer.byteLength(r.message.text) });
r = await ingest(ref); check('testo decodificato oltre limite non importato', r.code === 409 && r.error === 'email_body_incomplete' && io.writes.length === 0, r);
io = setup(); io.rows[23].parts.TEXT = 'Fatti verificati. '.repeat(160); io.rows[23].structure.size = Buffer.byteLength(io.rows[23].parts.TEXT); ref = await source(); r = await ingest(ref);
check('body canonico limitato conserva originale completo in provenienza', r.code === 200 && io.db.get('messages/' + messageId).body.length === 2000 && io.db.get('messages/' + messageId).mailboxSource.text === io.rows[23].parts.TEXT, r);

io = setup();
const request = 'Verificare il documento entro domani alle 10:00.';
const currentText = 'Dettaglio sintetico. '.repeat(110) + request;
const quotedText = '\nOn Monday someone wrote:\nRichiesta vecchia: entro oggi alle 09:00.';
io.rows[23].parts.TEXT = currentText + quotedText;
io.rows[23].structure.size = Buffer.byteLength(io.rows[23].parts.TEXT);
ref = await source(); r = await ingest(ref);
let context = await caseContext(io), evidence = context.sources.find(s => s.ref === 'messages/' + messageId);
check('import → contesto conserva richiesta oltre 2000 senza il thread citato', r.code === 200 && evidence?.text.endsWith(request)
  && !evidence.text.includes('Richiesta vecchia') && !evidence.textTruncated && evidence.omittedCharacters === 0, evidence);
const enrolled = await takeCharge(), timing = enrolled.task?.followUp?.intakeTiming;
check('import → presa in carico legge orario oltre 2000 e mantiene fonte e controllo', enrolled.code === 200
  && timing?.status === 'resolved' && timing.quote === request.slice(0, -1) && timing.sourceMessageId === 'mail_' + SEG.textHash(MID)
  && Date.parse(enrolled.task.followUp.checkAt) <= Date.parse(timing.requestedAt)
  && enrolled.task.followUp.checkBasis.includes('entro l’orario richiesto'), enrolled);
check('presa in carico esplicita conserva body dedupe e HOLD senza provider o coda', io.db.get('messages/' + messageId).body === SEG.stripQuoted(currentText + quotedText)
  && io.db.get('conversations/' + CID).segretaria === false && io.forbidden.length === 0
  && io.writes.every(w => /^(messages|conversations|heartbeat|operatorTasks)\//.test(w.path)), io.writes.map(w => w.path));
const importedEmail = io.db.get('messages/' + messageId);
check('testo integrale riservato a email inbound con provenienza manuale; altre fonti conservate', [
  { ...importedEmail, direction: 'out' }, { ...importedEmail, channel: 'whatsapp' },
  { ...importedEmail, source: 'other' }, { ...importedEmail, mailboxSource: { text: currentText } },
].every(row => SEG.messageText(row) === importedEmail.body) && SEG.messageText({ body: '  testo originario  ' }) === '  testo originario  ');

io = setup();
const overContext = 'Dettaglio sintetico. '.repeat(330) + 'DATO_FINALE_DA_CONSULTARE';
io.rows[23].parts.TEXT = overContext + quotedText;
io.rows[23].structure.size = Buffer.byteLength(io.rows[23].parts.TEXT);
ref = await source(); r = await ingest(ref); context = await caseContext(io);
evidence = context.sources.find(s => s.ref === 'messages/' + messageId);
check('evento oltre 6000 dichiara taglio finale e quantità omessa dal testo corrente', r.code === 200 && evidence?.text.length === 6000
  && evidence.textTruncated && evidence.omittedCharacters === overContext.length - 6000
  && context.coverage.reasons.includes('message_text_truncated'), evidence);
const priorFingerprint = contextFingerprint(context), fullMessage = io.db.get('messages/' + messageId);
io.put('messages/' + messageId, { ...fullMessage, mailboxSource: { ...fullMessage.mailboxSource, text: overContext.replace('DATO_FINALE', 'DATO_CAMBIATO') + quotedText } });
const changedContext = await caseContext(io);
check('correzione oltre limite visibile cambia impronta del contesto', contextFingerprint(changedContext) !== priorFingerprint
  && changedContext.sources[0].text === context.sources[0].text);
io.put('messages/newer', { conversationId: CID, direction: 'in', body: 'Messaggio più recente.', at: new Date().toISOString() });
context = await caseContext(io, { followUp: { conversationId: CID, lastMessageId: 'newer' } });
evidence = context.sources.find(s => s.ref === 'messages/' + messageId);
check('mail storica conserva limite 1200 e taglio dichiarato del testo corrente', evidence?.text.length === 1200
  && evidence.textTruncated && evidence.omittedCharacters === overContext.replace('DATO_FINALE', 'DATO_CAMBIATO').length - 1200, evidence);

for (const [name, mutate, expected] of [
  ['target inesistente', io => io.db.delete('conversations/' + CID), 'conversation_not_found'],
  ['contatto diverso', io => io.put('conversations/' + CID, { ...base, contactEmail: 'wrong@example.invalid' }), 'email_contact_mismatch'],
  ['conversazione affidata', io => io.put('conversations/' + CID, { ...base, segretaria: true }), 'conversation_automated'],
  ['binding in conflitto', io => io.put('conversations/' + CID, { ...base, conversationBindingConflict: 'email_conflict' }), 'conversation_identity_changed'],
  ['binding indisponibile', io => io.put('conversations/' + CID, { ...base, conversationBindingStatus: 'unavailable' }), 'conversation_identity_changed'],
  ['email duplicata normalizzata', io => io.put('conversations/other', { ...base, contactId: 'other', contactEmail: ' CLIENT@EXAMPLE.INVALID ' }), 'email_identity_ambiguous'],
  ['scansione identità incompleta', io => { for (let i = 0; i < 499; i++) io.put('conversations/other-' + i, { contactEmail: `other${i}@example.invalid` }); }, 'email_identity_scan_incomplete'],
]) {
  io = setup(); ref = await source(); mutate(io); r = await ingest(ref);
  check(name + ': nessuna scrittura', r.error === expected && r.code >= 400 && io.writes.length === 0, r);
}
io = setup(); ref = await source(); const [payload, signature] = ref.split('.'), proof = JSON.parse(Buffer.from(payload, 'base64url')); proof.uid = 1;
r = await ingest(Buffer.from(JSON.stringify(proof)).toString('base64url') + '.' + signature);
check('import non accetta fonte alterata', r.code === 400 && r.error === 'invalid_reference' && io.writes.length === 0, r);
io.validity = 456n; r = await ingest(ref); check('import non accetta UIDVALIDITY superata', r.code === 409 && r.error === 'mailbox_changed' && io.writes.length === 0, r);
io.validity = 123n; io.uid = 'other-admin'; r = await ingest(ref); check('import non usa riferimento di altro admin', r.code === 400 && io.writes.length === 0, r);
io = setup(); ref = await source(); for (const role of ['tenant', 'owner', 'landlord']) { io.role = role; r = await ingest(ref); check('import escluso al ruolo ' + role, r.code === 403 && io.writes.length === 0, r); }
io = setup(); ref = await source(); r = await ingest(ref, { conversationId: '../users/admin' }); check('riferimento target fuori scope respinto', r.code === 400 && io.writes.length === 0, r);

for (const [name, change, expected] of [
  ['affidamento concorrente', { segretaria: true }, 'conversation_automated'],
  ['identità concorrente', { contactEmail: 'changed@example.invalid' }, 'conversation_identity_changed'],
]) {
  io = setup(); ref = await source(); io.beforeCommit = () => io.put('conversations/' + CID, { ...base, ...change }); r = await ingest(ref);
  check(name + ' invalida CAS e retry senza messaggio orfano', r.error === expected && io.writes.length === 0 && messages(io).length === 0, r);
}
io = setup(); ref = await source();
const newer = { lastMessageAt: new Date().toISOString(), lastDirection: 'out', needsReply: false, lastMessagePreview: 'Risposta più recente' };
io.beforeCommit = () => io.put('conversations/' + CID, { ...base, ...newer }); r = await ingest(ref);
check('risposta concorrente resta più recente dopo retry atomico', r.code === 200 && r.imported && Object.entries(newer).every(([k,v]) => io.db.get('conversations/' + CID)[k] === v), r);
io = setup(); ref = await source(); io.loseAck = true; r = await ingest(ref);
check('ack perso è errore esplicito con unica scrittura persistita', r.code === 503 && messages(io).length === 1, r);
r = await ingest(ref); check('retry dopo ack perso recupera ricevuta senza duplicare', r.code === 200 && r.duplicate && messages(io).length === 1, r);
io = setup(); ref = await source(); const originalAt = new Date(Date.now() - 500000).toISOString();
io.put('messages/' + messageId, { conversationId: CID, direction: 'in', channel: 'email', emailMessageId: MID, body: mailText, at: originalAt });
r = await ingest(ref);
check('duplicato cron acquisisce ricevuta manuale e fonte integrale senza cambiare evento', r.code === 200 && r.duplicate
  && messages(io).length === 1 && io.db.get('messages/' + messageId).at === originalAt
  && io.db.get('messages/' + messageId).mailboxSource.text === mailText, r);
io = setup(); ref = await source(); io.put('messages/' + messageId, { conversationId: 'other', emailMessageId: MID, body: mailText }); r = await ingest(ref);
check('Message-ID assegnato altrove non viene spostato', r.code === 409 && r.error === 'email_message_identity_conflict' && io.writes.length === 0, r);
io = setup(); ref = await source(); io.put('messages/' + messageId, { conversationId: CID, emailMessageId: MID, body: 'Corpo diverso' }); r = await ingest(ref);
check('Message-ID con corpo diverso resta conflitto esplicito', r.code === 409 && r.error === 'email_message_identity_conflict' && io.writes.length === 0, r);
io = setup(); ref = await source(); const pair = await Promise.all([ingest(ref), ingest(ref)]);
check('due conferme concorrenti importano un solo messaggio', pair.every(x => x.code === 200) && pair.filter(x => x.imported).length === 1 && pair.filter(x => x.duplicate).length === 1 && messages(io).length === 1, pair);
io = setup(); ref = await source(); const now = Date.now;
try {
  Date.now = () => now() + 16 * 60000; r = await ingest(ref);
  check('riferimento scaduto non abilita importazione', r.code === 400 && r.error === 'invalid_reference' && io.writes.length === 0, r);
} finally { Date.now = now; }
io = setup(); ref = await source(); let elapsed = 0;
try {
  Date.now = () => now() + elapsed;
  io.afterRead = async path => { if (path === 'messages/' + messageId) elapsed = 21000; };
  r = await ingest(ref);
  check('deadline trascorsa durante lettura atomica impedisce commit tardivo', r.code === 504 && r.error === 'mailbox_timeout' && io.writes.length === 0, r);
} finally { Date.now = now; }

if (!process.env.BOOM_MAILBOX_MUTATION) for (const mutation of ['import_contact', 'import_complete', 'import_reply', 'import_manual', 'import_atomic', 'manual_context', 'manual_intake']) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, BOOM_MAILBOX_MUTATION: mutation }, encoding: 'utf8', timeout: 20000 });
  check('mutazione intercettata ' + mutation, child.status !== 0 && child.stdout.includes('FAIL') && !child.stderr.includes('Mutation boundary missing'));
}
console.log(`\n${checks - failed}/${checks} PASS`); process.exitCode = failed ? 1 : 0;
