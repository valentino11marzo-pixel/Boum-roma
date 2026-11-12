// tests/caselle/run.mjs — NESSUNA EMAIL VERSO UNA CASELLA CHE NON ESISTE.
//
// Il 5/11/2026 la casella valentino@boom-rome.com era piena di «Delivery
// Status Notification»: le copie «[Portal] 💰 Pagamento ricevuto» andavano a
// valentino@ sul dominio boomrome.com, SENZA trattino. Quel dominio è il sito
// e non ha un server di posta: nessun MX, Gmail bussa agli IP di Vercel, va
// in timeout (4.4.1), riprova per 48 ore e poi rinuncia. Letto nelle DSN, non
// dedotto: le copie del portal rimbalzavano almeno da metà luglio, e fra
// aprile e giugno erano rimbalzati circa 200 «New lead.» del modulo intake,
// mandati a info@ sullo stesso dominio. Nessuno se n'è accorto perché una DSN
// finisce fra gli «Aggiornamenti», da leggere.
//
// L'indirizzo morto stava in quattro file diversi (portal, avvisi PFS, il
// mandato di Homie, un commento delle env) e in due ruoli (destinatario e
// Reply-To). Per questo la guardia non è una lista di file da controllare:
// legge TUTTO ciò che può finire in produzione o in mano a un agente, e un
// file nuovo che sbaglia cade da solo. Le poche eccezioni sono nominate, col
// perché, e un'eccezione che non serve più fa cadere il test anche lei.
//
// Poi le porte VERE, con la rete finta: chi riceve la copia per l'operatore
// e a chi arriva una risposta, dal portal fino al `to` di nodemailer.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import nodemailer from 'nodemailer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

const OPERATOR = 'valentino@boom-rome.com';

// ─── 1) la guardia di classe ────────────────────────────────────────────────
// Una casella sul dominio del sito (o su un suo sottodominio). Un URL del sito
// (https://www.boomrome.com/…) e una casella del dominio vero (boom-rome.com)
// non sono casi da segnalare.
const DEAD = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*boomrome\.com\b/gi;
const deadIn = (s) => [...String(s).matchAll(DEAD)].map((m) => m[0].toLowerCase());

ok(deadIn('a valentino@boomrome.com b').length === 1, 'la guardia vede una casella sul dominio del sito');
ok(deadIn('x@mail.boomrome.com').length === 1, 'anche su un sottodominio');
ok(deadIn('valentino@boom-rome.com hello@boom-rome.com').length === 0, 'una casella di boom-rome.com non è un caso');
ok(deadIn('https://www.boomrome.com/portal · boomrome.com').length === 0, 'un URL del sito non è una casella');

// Le eccezioni: indirizzi che NON sono destinatari. Ognuna vale per UNA riga,
// riconosciuta da `on`: la stessa casella su un'altra riga dello stesso file
// (il GMAIL_USER accanto al FIREBASE_ADMIN_EMAIL, per esempio) cade comunque.
const ALLOWED = [
  { file: 'api/reminder-cron.js', address: 'valentino@boomrome.com', on: 'FIREBASE_ADMIN_EMAIL',
    why: 'il login Firebase del server: un identificativo, non una casella' },
  { file: 'api/agent/_lib.js', address: 'valentino@boomrome.com', on: 'ADMIN_EMAILS is a comma-separated',
    why: 'esempio di AGENT_ADMIN_EMAILS: i login ammessi ad approvare, non destinatari' },
  { file: 'bot/README.md', address: 'valentino@boomrome.com', on: 'same email/password pattern',
    why: "l'account admin con cui il bot entra in Firestore: il login, non una casella" },
  { file: 'cockpit-preview.html', address: 'valentino@boomrome.com', on: 'whitelist:',
    why: 'whitelist dei login admin, con le due grafie' },
  { file: 'sign.html', address: 'demo@boomrome.com', on: "name:'Demo Tenant'",
    why: 'il firmatario finto di /sign?demo=1: in demo non parte nessuna email' },
  { file: 'sign.html', address: 'landlord@boomrome.com', on: "name:'Giulia Bianchi'",
    why: 'il locatore finto della stessa demo' },
  { file: 'design/pages-deco/case-full.json', address: 'valentino@boomrome.com', on: '"photosEnhancedBy"',
    why: 'fotografia di dati: la firma di chi ha curato le foto, non un destinatario' },
];

// Si legge tutto il repository tranne .git, le dipendenze e le suite (le
// fixture usano indirizzi finti apposta). I file binari si saltano per nome e,
// se il nome mente, per il byte nullo.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tests']);
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|docx?|xlsx?|shortcut|pkpass|woff2?|ttf|otf|eot|mp[34]|m4a|wav|ogg|mov|webm|heic|p12)$/i;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(abs); continue; }
    if (BINARY.test(name) || st.size > 16 * 1024 * 1024) continue;
    files.push(relative(ROOT, abs).split(sep).join('/'));
  }
})(ROOT);

const found = [];
for (const f of files) {
  const buf = readFileSync(join(ROOT, f));
  if (buf.includes(0)) continue;
  buf.toString('utf8').split('\n').forEach((text, i) => {
    for (const address of deadIn(text)) found.push({ file: f, address, line: i + 1, text });
  });
}

ok(files.length > 500, `la guardia legge il repository (${files.length} file): un elenco vuoto passerebbe sempre`);
for (const f of ['js/portal-app.js', 'api/portal/_notify.js', 'api/notify/send.js', 'api/notify-viewing-created.js',
  'api/reminder-cron.js', 'homie-bridge/boom', 'homie-bridge/HOMIE.md', 'bot/HOMIE.md', 'CLAUDE.md']) {
  ok(files.includes(f), `fra i file letti c'è ${f}`);
}

const excuses = (a, x) => a.file === x.file && a.address === x.address && x.text.includes(a.on);
const unexpected = found.filter((x) => !ALLOWED.some((a) => excuses(a, x)));
for (const x of unexpected) console.log(`   ${x.file}:${x.line} → ${x.address}`);
ok(unexpected.length === 0,
  'nessuna casella sul dominio del sito (boomrome.com non riceve posta): destinatari, Reply-To, esempi e mandati usano boom-rome.com');
const stale = ALLOWED.filter((a) => !found.some((x) => excuses(a, x)));
for (const a of stale) console.log(`   eccezione che non serve più: ${a.file} → ${a.address} (${a.on})`);
ok(stale.length === 0, "ogni eccezione serve ancora: un'eccezione inutile si toglie dall'elenco");

// Il mandato di Homie è un'istruzione eseguita ogni mattina, non prosa.
ok(/boom digest --email valentino@boom-rome\.com/.test(read('homie-bridge/HOMIE.md')),
  'il digest del mattino di Homie va alla casella vera');

// ─── 2) le porte vere, con la rete finta ────────────────────────────────────
delete process.env.ADMIN_NOTIFY_EMAIL;
process.env.FIREBASE_API_KEY = 'synthetic';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@example.invalid';
process.env.FIREBASE_ADMIN_PASS = 'synthetic';
process.env.GMAIL_USER = 'sender@example.invalid';
// La vecchia manopola, anche se fosse rimasta su Vercel col valore morto,
// non decide più niente.
process.env.NOTIFY_OWNER_EMAIL = 'valentino' + '@boomrome.com';

const mails = [], emailjs = [];
let role = 'admin';
nodemailer.createTransport = () => ({ sendMail: async (m) => { mails.push(m); return { messageId: 'smtp-' + mails.length }; } });
const { toFsFields, FS_BASE } = await import('../../api/homie/_lib.js');
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const json = (status, v) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://api.emailjs.com/')) { emailjs.push(JSON.parse(init.body)); return new Response('OK', { status: 200 }); }
  if (url.includes('accounts:lookup')) return json(200, { users: [{ localId: 'admin', email: 'admin@example.invalid' }] });
  if (url.includes('accounts:signInWithPassword')) return json(200, { idToken: 'synthetic-admin', expiresIn: '3600' });
  if (url === FS_BASE + '/users/admin') return json(200, { name: 'projects/test/databases/(default)/documents/users/admin', fields: toFsFields({ role }) });
  throw new Error('Unmocked external IO: ' + url);
};

// 2a) /api/notify/send risolve «operator» con la convenzione ADMIN_NOTIFY_EMAIL
const { default: notifySend, OPERATOR_TO } = await import('../../api/notify/send.js');
async function post(body) {
  const res = { code: 200, status(n) { this.code = n; return this; }, setHeader() {}, json(v) { this.body = v; return this; }, end() { return this; } };
  await notifySend({ method: 'POST', headers: { authorization: 'Bearer synthetic' }, body }, res);
  return res;
}
const payment = { heading: '[Portal] 💰 Pagamento ricevuto', intro: 'Elsa ha pagato €1400 per Bologna Double' };
let r = await post({ to: OPERATOR_TO, params: payment });
ok(r.code === 200 && mails.at(-1)?.to === OPERATOR, `to:'operator' arriva a ${OPERATOR} senza ADMIN_NOTIFY_EMAIL`);
process.env.ADMIN_NOTIFY_EMAIL = 'ops@example.com';
r = await post({ to: OPERATOR_TO, params: payment });
ok(r.code === 200 && mails.at(-1)?.to === 'ops@example.com', "ADMIN_NOTIFY_EMAIL sposta la copia per l'operatore");
delete process.env.ADMIN_NOTIFY_EMAIL;
r = await post({ to: 'tenant@example.com', params: payment });
ok(r.code === 200 && mails.at(-1)?.to === 'tenant@example.com', 'un indirizzo vero non viene toccato');
const before = mails.length; role = 'tenant';
r = await post({ to: OPERATOR_TO, params: payment });
ok(r.code === 403 && mails.length === before, 'la copia per l\'operatore resta dietro lo stesso controllo dei ruoli');
role = 'admin';

// 2b) il portal: le funzioni VERE di js/portal-app.js, eseguite in una vm
const src = read('js/portal-app.js');
function named(name) {
  let start = src.indexOf('    function ' + name + '(');
  if (start < 0) start = src.indexOf('    async function ' + name + '(');
  if (start < 0) return null;
  const next = src.slice(start + 5).search(/\n    (?:async )?function /);
  return src.slice(start, next < 0 ? undefined : start + 5 + next);
}
const ownerBlock = (src.match(/    const NOTIFY_OWNER = \{[\s\S]*?\n    \};/) || [])[0];
const fns = ['sendBoomEmail', 'createNotification', 'forwardNotificationToOwner', '_ifSubmit'].map(named);
ok(Boolean(ownerBlock) && fns.every(Boolean), 'le funzioni del portal si estraggono dal file vero');

const posted = [], toasts = [];
const ctx = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  S: { users: [
    { id: 'tenant', name: 'Elsa Sample', email: 'elsa@example.com' },
    { id: 'op', name: 'Valentino', email: OPERATOR },
  ] },
  db: { collection: () => ({ add: async () => ({ id: 'n1' }), doc: () => ({ update: async () => {} }) }) },
  firebase: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
  auth: { currentUser: { getIdToken: async () => 'synthetic' } },
  fetch: async (url, init) => { posted.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; },
  logActivity: () => {}, toast: (...a) => toasts.push(a),
  EMAILJS_CONFIG: { templates: { notification: 'boom_notification' } },
  _getNotificationEmailConfig: (type, title) => ({ heading: title, intro: title }),
  ID: { name: 'Flo', email: 'flo@example.com', phone: '15550001234', budget: '2000', arrival: '', months: '', situation: 'student',
    zone: '', furnished: 'either', pets: 'no', musthaves: '', notes: '', source: 'google' },
  IK: 'pfs', IS: 0, _ifRender: () => {},
});
const tick = () => new Promise((res) => setTimeout(res, 0));
if (ownerBlock && fns.every(Boolean)) {
  vm.runInContext(ownerBlock + '\n' + fns.join('\n')
    + '\nglobalThis.__t = { createNotification, _ifSubmit, NOTIFY_OWNER };', ctx);
  const t = ctx.__t;

  await t.createNotification('tenant', 'payment', '💰 Pagamento ricevuto', 'Elsa ha pagato €1400 per Bologna Double', {});
  await tick();
  const tos = posted.map((p) => p.body.to);
  ok(tos.length === 2 && tos[0] === 'elsa@example.com' && tos[1] === OPERATOR_TO,
    `una notifica parte al destinatario e la copia a 'operator' (${tos.join(', ')})`);
  const copy = posted.find((p) => p.body.to === OPERATOR_TO);
  ok(copy && copy.url === '/api/notify/send' && copy.body.params.heading === '[Portal] 💰 Pagamento ricevuto',
    'la copia «[Portal]» passa dal ponte del server');
  // Il giro intero: ciò che il portal manda è ciò che il server consegna.
  if (copy) {
    r = await post(copy.body);
    ok(r.code === 200 && mails.at(-1)?.to === OPERATOR && mails.at(-1)?.subject === '[Portal] 💰 Pagamento ricevuto',
      `dal portal a nodemailer: la copia del pagamento arriva a ${OPERATOR}`);
  }

  posted.length = 0;
  await t.createNotification('op', 'payment', '💰 Pagamento ricevuto', 'x', {});
  await tick();
  ok(posted.length === 1 && posted[0].body.to === OPERATOR, "se il destinatario è già l'operatore, una email sola");

  posted.length = 0;
  await t._ifSubmit();
  await tick();
  ok(posted.length === 1 && posted[0].body.to === OPERATOR_TO && /New lead/.test(posted[0].body.params.heading),
    "il «New lead.» del modulo intake va all'operatore, non al contatto aziendale");
  ok(toasts.length === 0, 'nessun errore mostrato');
}
ok(!/sendBoomEmail\([^,]+,\s*COMPANY\.email/.test(src),
  "nessuna email del portal usa il contatto aziendale come casella dell'operatore");

// 2c) gli avvisi PFS (api/portal/_notify.js, via EmailJS)
const { notifyOperator, notifyClient } = await import('../../api/portal/_notify.js');
const lastTp = () => emailjs.at(-1)?.template_params || {};
await notifyOperator({ kind: 'message', client: { name: 'Anna', email: 'anna@example.com', portalAccessCode: 'BM1' }, text: 'Ciao' });
ok(lastTp().to_email === OPERATOR, `l'avviso PFS va a ${OPERATOR}, anche con NOTIFY_OWNER_EMAIL rimasto sul valore morto`);
ok(lastTp().reply_to === 'anna@example.com', "«Rispondi» dall'avviso arriva al cliente che ha scritto");
await notifyOperator({ kind: 'viewing', client: { name: 'Bo', email: 'non è una email' }, property: { address: 'Via X 1' }, preference: 'mattina' });
ok(lastTp().reply_to === OPERATOR, "senza un indirizzo valido del cliente il Reply-To è l'operatore, mai una casella morta");
process.env.ADMIN_NOTIFY_EMAIL = 'ops@example.com';
await notifyOperator({ kind: 'message', client: { name: 'Anna', email: 'anna@example.com' }, text: 'Ciao' });
ok(lastTp().to_email === 'ops@example.com', 'gli avvisi PFS seguono ADMIN_NOTIFY_EMAIL');
delete process.env.ADMIN_NOTIFY_EMAIL;
await notifyClient({ kind: 'viewing', client: { name: 'Anna Rossi', email: 'anna@example.com', portalAccessCode: 'BM1', portalLang: 'en' }, property: { address: 'Via X 1' } });
ok(lastTp().to_email === 'anna@example.com' && lastTp().reply_to === OPERATOR,
  'la conferma al cliente PFS: quando risponde, la risposta arriva a Valentino');

// 2d) la notifica di una visita prenotata (api/notify-viewing-created.js)
const { default: viewingCreated } = await import('../../api/notify-viewing-created.js');
let ip = 0;
const callViewing = async (body) => {
  const res = { code: 200, status(n) { this.code = n; return this; }, setHeader() {}, json(v) { this.body = v; return this; }, end() { return this; } };
  await viewingCreated({ method: 'POST', headers: { 'x-forwarded-for': '10.0.0.' + (++ip) }, body }, res);
  return res;
};
await callViewing({ clientName: 'Anna', clientEmail: 'anna@example.com', listingName: 'Bologna Double', requestedDate: '2026-11-10' });
ok(lastTp().to_email === OPERATOR && lastTp().reply_to === 'anna@example.com', 'visita prenotata: a Valentino, Reply-To il cliente');
await callViewing({ clientName: 'Bo', listingName: 'Bologna Double' });
ok(lastTp().reply_to === OPERATOR, "visita senza email del cliente: il Reply-To è l'operatore");
await callViewing({ clientName: 'Bo', clientEmail: 'scrivimi su whatsapp' });
ok(lastTp().reply_to === OPERATOR, 'un testo che non è una email non diventa un Reply-To');

// 2e) in nessun messaggio uscito c'è una casella morta
const outgoing = [...mails.map((m) => [m.to, m.cc, m.replyTo, m.from].join(' ')),
  ...emailjs.map((e) => JSON.stringify(e.template_params))];
ok(outgoing.length > 10 && outgoing.every((s) => deadIn(s).length === 0),
  `nessuno dei ${outgoing.length} messaggi usciti nomina una casella su boomrome.com`);

console.log(`\n${fail ? '✗' : '✓'} caselle: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
