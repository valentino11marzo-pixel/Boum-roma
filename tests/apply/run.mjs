// tests/apply/run.mjs — chi fa APPLY dal sito arriva all'operatore.
//
// LA LEZIONE DEL 30 SETTEMBRE 2026 («chi fa apply per la casa non lo vedo:
// né nei lead del portal, né via email»). Letto nei log e nella casella: due
// candidature vere → 200, lead scritto, conferma partita al CANDIDATO. Tre
// buchi fra quel lead e l'operatore, tutti chiusi e tutti provati qui sui
// handler VERI (Firestore in memoria, Telegram e SMTP finti):
//
// 1. NESSUNA EMAIL A BOOM. La porta scriveva solo al candidato. Ora ogni
//    candidatura arriva anche all'operatore, con Reply-To sul candidato.
// 2. LA FINESTRA A CASO. Brain e notify-pending leggevano
//    `status == 'new', limit 50` SENZA ordine: Firestore restituisce allora
//    i primi 50 per id (casuale). Oltre 50 lead aperti, quello appena
//    arrivato poteva restare fuori per sempre: niente voto, niente card
//    Telegram. Il Firestore finto qui ordina per NOME come quello vero, e
//    la sezione 3 riproduce il difetto con la lettura vecchia.
// 3. IL PORTAL CIECO. I lead si leggevano una volta al boot: a portal
//    aperto la candidatura non compariva. Ora c'è il listener.
// Più: la pagina nuova manda reddito/garante come FASCE di testo e il numero
// dei firmatari — la porta li buttava via. Ora restano, dichiarati.
//
// Run: node tests/apply/run.mjs

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); }
};
const section = t => console.log('\n' + t);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.CRON_SECRET = 'cron-test';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
process.env.TELEGRAM_CHAT_ID = '42';
process.env.GMAIL_USER = 'valentino@boom-rome.com';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ADMIN_NOTIFY_EMAIL;
delete process.env.LEADS_NOTIFY_EMAIL;

// ── Firestore finto, fedele dove conta: tipi e ordine ─────────────────────
// I campi restano CODIFICATI (stringValue/timestampValue…): Firestore vero
// confronta per tipo, e un filtro timestamp non vede un createdAt stringa.
// Senza orderBy i risultati escono in ordine di NOME, come in produzione.
const DB = new Map(); // 'leads/<id>' -> { fields }
const NEXT_IDS = [];
let autoN = 0;
const TG = [];
const typeOf = v => (v ? Object.keys(v)[0] : undefined);
const valOf = v => {
  const t = typeOf(v);
  if (t === 'timestampValue') return Date.parse(v.timestampValue);
  if (t === 'integerValue') return Number(v.integerValue);
  if (t === 'doubleValue') return v.doubleValue;
  return v[t];
};
const sameKind = (a, b) => {
  const num = t => t === 'integerValue' || t === 'doubleValue';
  return typeOf(a) === typeOf(b) || (num(typeOf(a)) && num(typeOf(b)));
};
const getField = (fields, path) => path.split('.').reduce((cur, k) => {
  if (!cur) return undefined;
  const f = cur[k];
  return f && f.mapValue && path.indexOf(k) < path.length - k.length ? f.mapValue.fields : f;
}, fields);
function matches(fields, where) {
  if (!where) return true;
  if (where.compositeFilter) {
    const rs = where.compositeFilter.filters.map(f => matches(fields, f));
    return where.compositeFilter.op === 'OR' ? rs.some(Boolean) : rs.every(Boolean);
  }
  if (where.unaryFilter) {
    const v = getField(fields, where.unaryFilter.field.fieldPath);
    if (where.unaryFilter.op === 'IS_NULL') return !!v && typeOf(v) === 'nullValue';
    return true;
  }
  const f = where.fieldFilter;
  const actual = getField(fields, f.field.fieldPath);
  if (actual === undefined) return false;
  if (f.op === 'IN') return (f.value.arrayValue.values || []).some(x => sameKind(actual, x) && valOf(actual) === valOf(x));
  if (!sameKind(actual, f.value)) return false;
  const a = valOf(actual), b = valOf(f.value);
  switch (f.op) {
    case 'EQUAL': return a === b;
    case 'NOT_EQUAL': return a !== b;
    case 'GREATER_THAN': return a > b;
    case 'GREATER_THAN_OR_EQUAL': return a >= b;
    case 'LESS_THAN': return a < b;
    case 'LESS_THAN_OR_EQUAL': return a <= b;
    default: return false;
  }
}
const docOut = (path, fields) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields, updateTime: new Date().toISOString() });
const QUERIES = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit') || u.includes('securetoken')) return json({ idToken: 'fake', localId: 'admin', expiresIn: '3600' });
  if (u.includes('api.telegram.org')) {
    const b = opts.body ? JSON.parse(opts.body) : {};
    TG.push({ method: u.split('/').pop(), body: b });
    return json({ ok: true, result: { message_id: 1000 + TG.length } });
  }
  if (!u.includes('firestore.googleapis.com')) return json({});
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    QUERIES.push(q);
    const coll = q.from[0].collectionId;
    let rows = [...DB.entries()].filter(([k, d]) => k.startsWith(coll + '/') && k.split('/').length === 2 && matches(d.fields, q.where));
    const orderBy = q.orderBy || [];
    rows = rows.filter(([, d]) => orderBy.every(o => o.field.fieldPath === '__name__' || getField(d.fields, o.field.fieldPath) !== undefined));
    rows.sort(([ka, da], [kb, db]) => {
      for (const o of orderBy) {
        const dir = o.direction === 'DESCENDING' ? -1 : 1;
        const a = o.field.fieldPath === '__name__' ? ka : valOf(getField(da.fields, o.field.fieldPath));
        const b = o.field.fieldPath === '__name__' ? kb : valOf(getField(db.fields, o.field.fieldPath));
        if (a < b) return -dir; if (a > b) return dir;
      }
      return ka < kb ? -1 : ka > kb ? 1 : 0; // senza ordine: per NOME
    });
    rows = rows.slice(0, q.limit || 1000);
    return json(rows.map(([k, d]) => ({ document: docOut(k, d.fields) })));
  }
  if (u.includes(':commit') || u.includes(':batchGet')) return json({ writeResults: [] });
  const m = u.match(/documents\/([^?]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  const method = opts.method || 'GET';
  if (method === 'GET') {
    const d = DB.get(path);
    return d ? json(docOut(path, d.fields)) : json({ error: { code: 404 } }, 404);
  }
  if (method === 'POST') {
    const qid = u.match(/documentId=([^&]+)/);
    const id = qid ? decodeURIComponent(qid[1]) : (NEXT_IDS.shift() || 'auto' + String(++autoN).padStart(4, '0'));
    const key = `${path}/${id}`;
    if (DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, { fields: { ...(body.fields || {}) } });
    return json(docOut(key, DB.get(key).fields));
  }
  if (method === 'PATCH') {
    const exists = DB.has(path);
    if (u.includes('currentDocument.exists=false') && exists) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    const prev = exists ? DB.get(path).fields : {};
    DB.set(path, { fields: { ...prev, ...(body.fields || {}) } });
    return json(docOut(path, DB.get(path).fields));
  }
  if (method === 'DELETE') { DB.delete(path); return json({}); }
  return json({});
};

const plain = v => {
  const t = typeOf(v);
  if (t === 'mapValue') return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  if (t === 'arrayValue') return (v.arrayValue.values || []).map(plain);
  if (t === 'nullValue') return null;
  if (t === 'integerValue') return Number(v.integerValue);
  return v[t];
};
const docOf = path => { const d = DB.get(path); return d ? Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, plain(v)])) : null; };

const mockRes = () => {
  const r = { statusCode: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.statusCode = c; return r; };
  r.json = o => { r.body = o; return r; };
  r.end = () => r;
  return r;
};
let ipN = 0;
const post = (handler, body, headers = {}) => {
  const res = mockRes();
  return Promise.resolve(handler({ method: 'POST', body, headers: { 'x-forwarded-for': '10.0.0.' + (++ipN), ...headers }, query: {} }, res)).then(() => res);
};
const mails = () => globalThis.__mails || [];
const resetMails = () => { globalThis.__mails = []; };

const applyMod = await import('../../api/apply-lead.js');
const applyHandler = applyMod.default;
const { incomeOf, guarantorOf, signersOf, operatorEmail, applicantEmail } = applyMod;
const { pendingNewLeads } = await import('../../api/leads/_fresh.js');
const brainHandler = (await import('../../api/leads/brain.js')).default;
const notifyHandler = (await import('../../api/telegram/notify-pending.js')).default;

// Il corpo ESATTO che apartment-detail.html costruisce (d.get(...) = stringhe).
const pageBody = (over = {}) => ({
  name: 'Berk Namyeter', email: 'berk@example.com', phone: '+90 532 000 1122',
  listingId: 'cezFMXTWnHUDgb1H2WWm', listingName: 'Bilocale Trastevere', listingPrice: 1200, zone: 'Trastevere',
  kind: 'apply', waitlist: false,
  income: '1500-2500', guarantor: 'yes-italy', household: 'couple', occupation: 'relocating',
  moveIn: '2026-11-01', durationMonths: 12, signers: 2, company: '',
  ...over,
});

// ── 1. le fasce della pagina nuova non si perdono più ─────────────────────
section('1. La qualificazione dichiarata arriva intera');
{
  ok('fascia di reddito: resta testo, mai un numero inventato', JSON.stringify(incomeOf('1500-2500')) === JSON.stringify({ income: null, incomeBand: '1500-2500' }));
  ok('reddito numerico (pagina classica) resta un numero', incomeOf(2400).income === 2400 && incomeOf(2400).incomeBand === null);
  ok('reddito 0 = non dichiarato (la classica manda 0)', incomeOf(0).income === null);
  ok('fascia sconosciuta → niente', incomeOf('tanti').income === null && incomeOf('tanti').incomeBand === null);
  ok('garante "yes-italy" → true con il tipo', guarantorOf('yes-italy').guarantor === true && guarantorOf('yes-italy').guarantorType === 'yes-italy');
  ok('garante "prepay" → false con il tipo (non è un garante)', guarantorOf('prepay').guarantor === false && guarantorOf('prepay').guarantorType === 'prepay');
  ok('garante booleano (classica) ancora accettato', guarantorOf(true).guarantor === true && guarantorOf(false).guarantor === false);
  ok('firmatari: 1..10 interi, il resto null', signersOf(2) === 2 && signersOf('3') === 3 && signersOf(0) === null && signersOf(99) === null);
}

// ── 2. la candidatura: lead scritto, DUE email, timbri veri ──────────────
section('2. Una candidatura dalla pagina: lead + email al candidato E all\'operatore');
let berkId;
{
  resetMails();
  NEXT_IDS.push('zzBerk0001'); // id che ordina DOPO i vecchi lead: il caso peggiore
  const res = await post(applyHandler, pageBody());
  berkId = res.body && res.body.id;
  ok('200 con id', res.statusCode === 200 && berkId === 'zzBerk0001', res.body);
  const lead = docOf('leads/' + berkId);
  ok('lead status new, source web, intent apply', lead && lead.status === 'new' && lead.source === 'web' && lead.intent === 'apply');
  ok('raw porta fascia di reddito, tipo di garante e firmatari',
    lead.raw.incomeBand === '1500-2500' && lead.raw.guarantorType === 'yes-italy' && lead.raw.guarantor === true && lead.raw.signers === 2, lead.raw);
  ok('il messaggio del lead li dichiara', /income €1500–2500\/mo/.test(lead.message) && /guarantor in Italy/.test(lead.message) && /2 signers/.test(lead.message), lead.message);
  ok('createdAt è un timestamp (il portal ordina su questo)', typeOf(DB.get('leads/' + berkId).fields.createdAt) === 'timestampValue');

  const all = mails();
  ok('partono DUE email', all.length === 2, all.map(m => m.to));
  const toOp = all.find(m => m.to === 'valentino@boom-rome.com');
  const toApp = all.find(m => m.to === 'berk@example.com');
  ok('una all\'operatore (default valentino@boom-rome.com)', !!toOp);
  ok('una al candidato', !!toApp && /Received — your application/.test(toApp.subject));
  ok('operatore: Reply-To = candidato (Rispondi scrive a lui)', toOp && toOp.replyTo === 'berk@example.com');
  ok('operatore: oggetto con chi e quale casa', toOp && /Candidatura dal sito — Berk Namyeter → Bilocale Trastevere/.test(toOp.subject), toOp && toOp.subject);
  ok('operatore: il corpo porta fascia, garante, firmatari, ingresso', toOp
    && /€1\.500–2\.500\/mese/.test(toOp.html) && /sì, in Italia/.test(toOp.html) && />2</.test(toOp.html) && /01\/11\/2026/.test(toOp.html));
  ok('operatore: tasto WhatsApp verso il candidato, precompilato', toOp && /https:\/\/wa\.me\/905320001122\?text=Hi%20Berk/.test(toOp.html));
  ok('operatore: link al portal (www) e alla scheda', toOp && toOp.html.includes('https://www.boomrome.com/portal#leads')
    && toOp.html.includes('https://www.boomrome.com/listing/cezFMXTWnHUDgb1H2WWm'));
  const after = docOf('leads/' + berkId);
  ok('ackEmailAt e operatorEmailAt scritti', !!after.ackEmailAt && !!after.operatorEmailAt, Object.keys(after));
}

// ── 2b. senza email: l'operatore la riceve comunque ──────────────────────
{
  resetMails();
  const res = await post(applyHandler, pageBody({ email: '', name: 'Solo Telefono' }));
  const all = mails();
  ok('solo telefono: 200 e UNA email, all\'operatore', res.statusCode === 200 && all.length === 1 && all[0].to === 'valentino@boom-rome.com', all.map(m => m.to));
  ok('solo telefono: niente Reply-To (non c\'è nessuno a cui rispondere)', all[0] && !('replyTo' in all[0]));
  const lead = docOf('leads/' + res.body.id);
  ok('solo telefono: operatorEmailAt sì, ackEmailAt no', !!lead.operatorEmailAt && !lead.ackEmailAt);
}

// ── 2c. honeypot, classica, escape, SMTP giù ─────────────────────────────
{
  resetMails();
  const before = DB.size;
  const res = await post(applyHandler, pageBody({ company: 'Bot Inc' }));
  ok('honeypot: 200 finto, nessuna scrittura, nessuna email', res.body.id === 'skip' && DB.size === before && mails().length === 0);

  resetMails();
  const r2 = await post(applyHandler, { name: 'Classica', email: 'c@example.com', listingName: 'X', kind: 'reserve', waitlist: false,
    income: 0, guarantor: false, household: '', occupation: '', moveIn: '', durationMonths: 12, company: '' });
  const l2 = docOf('leads/' + r2.body.id);
  ok('pagina classica: niente "income €0/mo" nel lead', !/income/.test(l2.message), l2.message);
  ok('pagina classica: intent reserve → «Prenotazione» all\'operatore', mails().some(m => /^Prenotazione dal sito/.test(m.subject)));

  const evil = operatorEmail({ name: '<img src=x onerror=alert(1)>', email: 'e@x.it', propertyTitle: '<b>Casa</b>', intent: 'apply', raw: {} }, 'L1');
  const evilApp = applicantEmail({ name: '<script>x</script>', email: 'e@x.it', propertyTitle: '<i>Casa</i>', intent: 'apply' });
  ok('testo del candidato ESCAPATO nell\'email all\'operatore', !evil.html.includes('<img src=x') && evil.html.includes('&lt;img'));
  ok('testo del candidato ESCAPATO nella conferma al candidato', !evilApp.html.includes('<script>') && !evilApp.html.includes('<i>Casa'));

  process.env.ADMIN_NOTIFY_EMAIL = 'ops@example.com';
  ok('ADMIN_NOTIFY_EMAIL sposta il destinatario', operatorEmail({ name: 'A', intent: 'apply', raw: {} }, 'L').to === 'ops@example.com');
  process.env.LEADS_NOTIFY_EMAIL = 'leads@example.com';
  ok('LEADS_NOTIFY_EMAIL vince per i lead', operatorEmail({ name: 'A', intent: 'apply', raw: {} }, 'L').to === 'leads@example.com');
  delete process.env.ADMIN_NOTIFY_EMAIL; delete process.env.LEADS_NOTIFY_EMAIL;

  // SMTP giù: la candidatura resta salvata, 200, e nessun timbro bugiardo.
  const orig = globalThis.__mails;
  const nm = (await import('nodemailer')).default;
  const t = nm.createTransport();
  const realSend = t.sendMail;
  t.sendMail = async () => { throw new Error('smtp down'); };
  const r3 = await post(applyHandler, pageBody({ name: 'Smtp Giu', email: 'g@example.com' }));
  t.sendMail = realSend; globalThis.__mails = orig;
  const l3 = docOf('leads/' + r3.body.id);
  ok('SMTP giù: 200, lead salvato', r3.statusCode === 200 && l3 && l3.status === 'new');
  ok('SMTP giù: nessun timbro di email mai partita', !l3.ackEmailAt && !l3.operatorEmailAt, l3);
}

// ── 3. la finestra a caso: riprodotta, poi chiusa ────────────────────────
section('3. Il lead appena arrivato entra SEMPRE nella finestra di Brain e Telegram');
{
  // 60 lead aperti più vecchi, già votati e già notificati, con id che
  // ordinano PRIMA di quello di Berk — l'archivio vero dopo qualche mese.
  const old = new Date(Date.now() - 20 * 86400000);
  for (let i = 0; i < 60; i++) {
    DB.set('leads/a' + String(i).padStart(4, '0'), { fields: {
      status: { stringValue: 'new' }, name: { stringValue: 'Vecchio ' + i }, grade: { stringValue: 'C' },
      telegramNotifiedAt: { timestampValue: old.toISOString() }, createdAt: { timestampValue: old.toISOString() },
      message: { stringValue: 'old' },
    } });
  }
  // un recupero Stripe: createdAt STRINGA (payments/recover-checkouts)
  DB.set('leads/strec_x', { fields: { status: { stringValue: 'new' }, name: { stringValue: 'Recupero' },
    createdAt: { stringValue: new Date().toISOString() }, message: { stringValue: 'checkout' } } });

  const { fsList } = await import('../../api/homie/_lib.js');
  const legacy = await fsList('leads', { filter: { field: 'status', op: 'EQUAL', value: 'new' }, limit: 50 });
  ok('RIPRODOTTO: la lettura vecchia (status new, limit 50, senza ordine) NON contiene Berk',
    !legacy.some(l => l.id === berkId) && legacy.length === 50);

  const fresh = await pendingNewLeads({ days: 7 });
  ok('pendingNewLeads contiene Berk', fresh.some(l => l.id === berkId));
  ok('…e i più recenti vengono PRIMA', fresh.findIndex(l => l.id === berkId) < fresh.findIndex(l => l.id === 'a0000'));
  ok('…e il createdAt stringa (recupero Stripe) non si perde', fresh.some(l => l.id === 'strec_x'));
  ok('…e la vecchia lettura resta nell\'unione (niente di ciò che partiva smette)', fresh.some(l => l.id === 'a0000'));
  ok('solo status new', fresh.every(l => l.status === 'new'));

  const failing = async (_c, o) => { if (o.orderBy) throw new Error('index'); return fsList('leads', o); };
  const partial = await pendingNewLeads({ days: 7, list: failing });
  ok('una lettura che fallisce non spegne le altre', partial.length === 50);
  let threw = false;
  try { await pendingNewLeads({ list: async () => { throw new Error('down'); } }); } catch { threw = true; }
  ok('tutte le letture giù → errore (chi chiama decide), mai un vuoto silenzioso', threw);
}

// ── 4. il Brain vota Berk ────────────────────────────────────────────────
section('4. Il Lead Brain vota la candidatura nuova (handler vero)');
{
  const res = mockRes();
  await brainHandler({ method: 'POST', headers: { authorization: 'Bearer cron-test' }, query: {} }, res);
  ok('brain: 200', res.statusCode === 200, res.body);
  const lead = docOf('leads/' + berkId);
  ok('brain: Berk ha un voto', !!lead.grade, lead.grade);
  ok('brain: voto A (telefono, email, reddito, garante, inglese)', lead.grade === 'A', lead.gradeReason);
}

// ── 5. la card Telegram parte ────────────────────────────────────────────
section('5. notify-pending manda la card di Berk (handler vero)');
{
  TG.length = 0;
  const res = mockRes();
  await notifyHandler({ method: 'GET', headers: { authorization: 'Bearer cron-test' }, query: {} }, res);
  ok('notify-pending: 200', res.statusCode === 200, res.body);
  const card = TG.find(t => t.method === 'sendMessage' && /Berk Namyeter/.test(t.body.text || ''));
  ok('notify-pending: la card di Berk è partita', !!card, TG.map(t => (t.body.text || '').slice(0, 60)));
  ok('notify-pending: Berk marcato notificato', !!docOf('leads/' + berkId).telegramNotifiedAt);
  ok('notify-pending: i vecchi già notificati NON ripartono', !TG.some(t => /Vecchio \d/.test(t.body.text || '')));
}

// ── 6. il portal vede il lead senza ricaricare ───────────────────────────
section('6. Il portal: listener vivo sui lead');
{
  const src = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  const a = src.indexOf('    function startLeadsListener() {');
  const b0 = src.indexOf('    function stopLeadsListener() {');
  const b = src.indexOf('\n    }\n', b0) + 7;
  ok('startLeadsListener esiste', a > -1 && b0 > a);
  const setup = src.slice(src.indexOf('    function setupApp() {'), src.indexOf('    function buildNav()'));
  ok('setupApp lo avvia', /startLeadsListener\(\);/.test(setup));
  const logout = src.slice(src.indexOf('    async function logout() {'), src.indexOf('    async function forceRefreshData()'));
  ok('logout lo ferma', /stopLeadsListener\(\);/.test(logout));

  const calls = { toast: [], notif: [], render: 0, oggi: 0, nav: 0 };
  let cb = null, query = null;
  const S = { profile: { id: 'admin', role: 'admin' }, page: 'oggi', leads: [{ id: 'x1', status: 'new' }] };
  const ctx = vm.createContext({
    S, isAdmin: () => true, console,
    toast: (...a2) => calls.toast.push(a2), sendBrowserNotification: (...a2) => calls.notif.push(a2),
    buildNav: () => calls.nav++, oggiScheduleUpdate: () => calls.oggi++, renderPage: () => calls.render++,
    setTimeout: () => 0, document: { hidden: true, getElementById: () => null },
    db: { collection: (name) => { query = { name }; const q = {
      orderBy: (f, d) => { query.orderBy = [f, d]; return q; },
      limit: n => { query.limit = n; return q; },
      onSnapshot: (next) => { cb = next; return () => { query.stopped = true; }; },
    }; return q; } },
  });
  vm.runInContext(src.slice(a, b), ctx);
  vm.runInContext('startLeadsListener()', ctx);
  ok('stessa query del boot: leads per createdAt desc, 100', query.name === 'leads' && query.orderBy[0] === 'createdAt' && query.orderBy[1] === 'desc' && query.limit === 100);
  const snap = rows => ({ docs: rows.map(r => ({ id: r.id, data: () => r })) });
  cb(snap([{ id: 'x1', status: 'new', name: 'Vecchio' }]));
  ok('primo snapshot: nessun avviso (arretrato al login)', calls.toast.length === 0);
  cb(snap([{ id: 'b1', status: 'new', name: 'Berk', propertyTitle: 'Bilocale Trastevere' }, { id: 'x1', status: 'new', name: 'Vecchio' }]));
  ok('lead nuovo: toast con nome e casa', calls.toast.length === 1 && /Berk → Bilocale Trastevere/.test(calls.toast[0][2]), calls.toast);
  ok('lead nuovo a scheda nascosta: notifica del browser', calls.notif.length === 1);
  ok('S.leads aggiornato', S.leads[0].id === 'b1');
  ok('su Oggi: aggiorna le regioni, NON ridisegna la pagina intera', calls.oggi >= 2 && calls.render === 0);
  S.page = 'leads';
  cb(snap([{ id: 'b1', status: 'new', name: 'Berk' }, { id: 'x1', status: 'new' }]));
  ok('sulla pagina Lead: ridisegna, senza un secondo avviso', calls.render === 1 && calls.toast.length === 1);
  cb(snap([{ id: 'd1', status: 'archived', name: 'Morto' }, { id: 'b1', status: 'new' }]));
  ok('un lead archiviato non fa suonare nulla', calls.toast.length === 1);
  vm.runInContext('stopLeadsListener()', ctx);
  ok('stop: listener staccato', query.stopped === true);
}

// ── 7. giunzioni sulla sorgente ──────────────────────────────────────────
section('7. Nessuno torna alla lettura a caso');
{
  const brain = readFileSync(new URL('../../api/leads/brain.js', import.meta.url), 'utf8');
  const notif = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  const raw = /fsList\('leads',\s*\{\s*filter:\s*\{\s*field:\s*'status'/;
  ok('brain legge da pendingNewLeads, non da status==new nudo', /pendingNewLeads\(/.test(brain) && !raw.test(brain));
  ok('notify-pending legge da pendingNewLeads, non da status==new nudo', /pendingNewLeads\(/.test(notif) && !raw.test(notif));
  const apply = readFileSync(new URL('../../api/apply-lead.js', import.meta.url), 'utf8');
  const iCreate = apply.indexOf("fsCreate('leads'");
  const iMail = apply.indexOf('operatorEmail(lead, id)');
  ok('apply-lead: l\'email all\'operatore parte DOPO la scrittura (mai un avviso di un lead perso)', iCreate > -1 && iMail > iCreate);
}

console.log(`\n\x1b[1m${fail ? '\x1b[31m' : '\x1b[32m'}Apply: ${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail ? 1 : 0);
