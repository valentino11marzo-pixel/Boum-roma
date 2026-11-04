// Actual mailbox read/import/admission; only mailbox and database transports fake.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reset, call } from './fixture.mjs';

const PRIMARY = 'valentino@boom-rome.com';
const ALIASES = ['hello', 'affitti', 'proprietari', 'documenti', 'amministrazione', 'assistenza'].map(x => x + '@boom-rome.com');
const CONTACT = 'client@example.invalid';
let checks = 0, failed = 0;
function check(name, pass, detail) {
  checks++; if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : ' ' + JSON.stringify(detail)}`);
}
function setup(recipient, field = 'to', account = PRIMARY) {
  const io = reset(); process.env.GMAIL_USER = account;
  const row = io.rows[23];
  row.envelope = { from: [{ address: CONTACT }], to: [], cc: [], [field]: [{ address: recipient }], date: new Date(Date.now() - 60000) };
  row.parts.TEXT = 'Richiesta sintetica: vorrei un contatto per una casa a Roma.';
  row.structure = { type: 'text/plain', encoding: '8bit', size: Buffer.byteLength(row.parts.TEXT) };
  return io;
}
const source = async () => (await call()).items[0].messageRef;
const read = ref => call({ action: 'read', messageRef: ref });
const admit = ref => call({ action: 'admit', messageRef: ref, confirmedEmail: CONTACT });
const docs = (io, collection) => [...io.db].filter(([path]) => path.startsWith(collection + '/'));

for (const recipient of [PRIMARY, ...ALIASES]) {
  for (const field of ['to', 'cc']) {
    const io = setup(recipient, field), ref = await source(), preview = await read(ref);
    check(`${field} ${recipient}: richiesta leggibile e importabile`, preview.message?.importable === true && preview.message?.importContact === CONTACT && io.writes.length === 0, preview);
    const first = await admit(ref), retry = await admit(ref);
    const messages = docs(io, 'messages'), conversations = docs(io, 'conversations');
    check(`${field} ${recipient}: una fonte, una conversazione, retry senza invii`, first.code === 200 && first.created && retry.duplicate
      && messages.length === 1 && conversations.length === 1 && conversations[0][1].segretaria === false
      && io.writes.every(w => /^(messages|conversations)\//.test(w.path)) && io.forbidden.length === 0
      && io.locks.every(l => l.options.readOnly), { first, retry });
    check(`${field} ${recipient}: destinatario originale conservato`, messages[0]?.[1]?.mailboxSource?.[field]?.[0]?.address === recipient);
  }
}

let io = setup(' HELLO@BOOM-ROME.COM ', 'cc', ' VALENTINO@BOOM-ROME.COM '), ref = await source(), r = await read(ref);
check('indirizzi esatti normalizzati per maiuscole e spazi', r.message?.importable === true, r);
for (const account of ['operator@example.invalid', 'other@boom-rome.com', 'valentino@boom-rome.com.attacker.invalid']) {
  io = setup(ALIASES[0], 'to', account); ref = await source(); r = await admit(ref);
  check('alias BOOM non autorizza altra casella: ' + account, r.code === 409 && r.error === 'email_not_inbound' && io.writes.length === 0, r);
}
for (const recipient of ['hello@boom-rome.com.attacker.invalid', 'xhello@boom-rome.com', 'unknown@boom-rome.com', 'hello+tag@boom-rome.com', 'hello@boomrome.com']) {
  io = setup(recipient); ref = await source(); r = await admit(ref);
  check('nessun dominio, suffisso o alias presunto: ' + recipient, r.code === 409 && r.error === 'email_not_inbound' && io.writes.length === 0, r);
}
for (const address of [PRIMARY, ...ALIASES]) {
  for (const field of ['from', 'replyTo']) {
    io = setup(ALIASES[0]); io.rows[23].envelope[field] = [{ address }];
    if (field === 'from') io.rows[23].envelope.replyTo = [{ address: CONTACT }];
    ref = await source(); r = await admit(ref);
    check(`${field} interno ${address}: non diventa contatto cliente`, r.code === 409 && r.error === 'email_not_inbound' && io.writes.length === 0, r);
  }
}
io = setup(ALIASES[0]); io.put('conversations/existing', { contactType: 'email', contactEmail: CONTACT, segretaria: false });
ref = await source(); r = await call({ action: 'import', messageRef: ref, conversationId: 'existing' });
check('alias collega fonte anche a conversazione esistente', r.code === 200 && r.imported && docs(io, 'conversations').length === 1 && docs(io, 'messages').length === 1, r);
io = setup(ALIASES[0]); ref = await source(); await admit(ref);
io.rows[23].envelope.to = [{ address: ALIASES[1] }];
r = await admit(ref);
check('stesso Message-ID su altro alias resta un messaggio, fonte originale preservata', r.code === 200 && r.duplicate
  && docs(io, 'messages').length === 1 && docs(io, 'conversations').length === 1
  && docs(io, 'messages')[0][1].mailboxSource.to[0].address === ALIASES[0], r);
io = setup(ALIASES[0]); ref = await source(); io.rows[23].envelope.to = [{ address: 'stranger@example.invalid' }]; r = await admit(ref);
check('destinatari riletti al momento della presa in carico', r.code === 409 && r.error === 'email_not_inbound' && io.writes.length === 0, r);
io = setup(ALIASES[0]); io.rows[23].envelope.to = []; ref = await source(); r = await admit(ref);
check('Ccn non attribuito per supposizione', r.code === 409 && r.error === 'email_not_inbound' && io.writes.length === 0, r);

if (!process.env.BOOM_MAILBOX_MUTATION && !process.env.BOOM_ALIAS_REPRO) {
  for (const mutation of ['alias_scope', 'alias_recipient', 'alias_self_from', 'alias_self_reply']) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, BOOM_MAILBOX_MUTATION: mutation }, encoding: 'utf8', timeout: 20000
    });
    check('difetto reintrodotto intercettato: ' + mutation, result.status !== 0 && result.stdout.includes('FAIL') && !result.stderr.includes('Mutation boundary missing'), result.stderr);
  }
}
console.log(`\n${checks - failed}/${checks} PASS`); process.exitCode = failed ? 1 : 0;
