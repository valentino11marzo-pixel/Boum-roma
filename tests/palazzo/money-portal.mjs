// I soldi nel portal: incasso registrato, rate, ricevute (filone S4a).
// Si guidano le funzioni VERE di js/portal-app.js (estratte per regione) su un
// Firestore finto in memoria con transazioni, uno Storage finto e la posta
// intercettata a /api/notify/send. Nessuna rete. Dati inventati.
//
// Cosa si pretende:
//  · «Registra incasso» scrive la data dell'ACCREDITO (mai il clic), il canale
//    e la fonte della prova; la data di Roma, non UTC; il modulo prima di tutto.
//  · la proprietaria riceve una notifica nel portale, MAI un'email (e mai una
//    riga IBAN), col nome del conduttore dal contratto e il mese a parole.
//  · l'inquilino senza profilo riceve davvero la conferma in inglese, col link
//    all'attestazione, se il contratto ha la sua email; altrimenti nessuna promessa.
//  · l'attestazione è intestata al locatore, canone e oneri separati, periodo vero,
//    numero da tutto l'id, nomi turchi e cirillici traslitterati (mai vuoti).
//  · «Annulla incasso» riporta la rata da pagare e annulla l'attestazione.
//  · la modifica della rata tiene i centesimi e la coerenza canone + oneri.
//  · chiudere un contratto annulla nella stessa transazione le rate dopo l'uscita.
//  · canone/oneri nuovi ricalcolano solo le rate da pagare.
//  · il generatore delle rate non fa scadere una rata prima del suo periodo, in
//    nessun fuso orario del browser.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const SRC0 = fs.readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const RENT = require('../../js/rent-engine.js');

function region(src, from, to) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error('regione mancante: ' + from);
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error('fine regione mancante: ' + to);
  return src.slice(a, b);
}
function fnSrc(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('funzione mancante: ' + name);
  const start = src.lastIndexOf('\n', at) + 1;
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) break; } }
  return src.slice(start, i + 1);
}
const romeDay = (d = new Date()) => {
  const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
};

// ── Il generatore delle rate in un fuso orario dato (processo figlio) ──────
// Il fuso del browser è del processo: lo si prova lanciando questo stesso file
// con TZ diverso. MUTATE=old rimette la lettura `new Date('2026-09-15')`.
if (process.argv.includes('--gen-child')) {
  let src = SRC0;
  if (process.env.MUTATE === 'old') {
    src = src.replace("const start = civil(contract.startDate);", "const start = new Date(contract.startDate);")
      .replace("let due = new Date(periodStart.getFullYear(), periodStart.getMonth(), Math.min(payDay, monthLen));", "let due = new Date(periodStart.getFullYear(), periodStart.getMonth(), payDay);");
  }
  const writes = [];
  const db = {
    collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }), doc: id => ({ id }), add: async d => { writes.push({ id: 'bulk' + writes.length, data: d }); return { id: 'x' }; } }),
    batch: () => ({ set: (ref, data) => writes.push({ id: ref.id, data }), commit: async () => {} }),
  };
  const ctx = vm.createContext({ db, firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } }, console: { log() {}, warn() {} },
    S: { contracts: [{ id: 'cb', rent: 950.5, tenantId: 't', propertyId: 'p' }], payments: [] }, toast() {}, refresh: async () => {}, refreshOnly: async () => {}, closeModal() {}, logActivity() {} });
  vm.runInContext(region(src, '    const INCASSO_VIA =', '    // Ogni strada passa dal modulo') + '\n' + region(src, '    async function generateMonthlyPayments(', '    const MS_FIELD_TYPES') + '\n' + fnSrc(src, 'generateBulkPayments'), ctx);
  const out = {};
  await vm.runInContext(`generateMonthlyPayments('c1', { startDate: '2026-09-15', endDate: '2027-08-14', rent: 1600, paymentDay: 5 })`, ctx);
  out.mid = writes.splice(0).map(w => ({ id: w.id, month: w.data.month, dueDate: w.data.dueDate, periodFrom: w.data.periodFrom, periodTo: w.data.periodTo }));
  await vm.runInContext(`generateMonthlyPayments('c2', { startDate: '2027-01-31', endDate: '2027-05-30', rent: 1000, paymentDay: 31 })`, ctx);
  out.endOfMonth = writes.splice(0).map(w => ({ month: w.data.month, dueDate: w.data.dueDate, periodFrom: w.data.periodFrom }));
  await vm.runInContext(`generateBulkPayments({ preventDefault() {}, target: null })`, Object.assign(ctx, { FormData: function () { return [['contractId', 'cb'], ['startMonth', '2026-10'], ['numMonths', '3'], ['dueDay', '5'], ['amount', '950.50']]; } }));
  out.bulk = writes.splice(0).map(w => ({ month: w.data.month, dueDate: w.data.dueDate, amount: w.data.amount }));
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ── Il contesto: Firestore finto con transazioni ───────────────────────────
function build(src = SRC0) {
  const store = new Map(), writes = [], mails = [], toasts = [], confirms = [], puts = [], texts = [], activity = [];
  const el = new Map();
  const getEl = id => { if (!el.has(id)) el.set(id, { innerHTML: '', textContent: '', value: '', checked: false, disabled: false }); return el.get(id); };
  let auto = 0;
  const DEL = { __delete: true };
  const hooks = { beforeTx: null };
  const apply = (cur, data) => {
    const out = structuredClone(cur || {});
    for (const [k, v] of Object.entries(data)) {
      if (v === DEL) { delete out[k]; continue; }
      if (v && v.__union) { out[k] = [...(out[k] || []), ...v.__union]; continue; }
      if (k.includes('.')) { const [a, b] = k.split('.'); out[a] = { ...(out[a] || {}), [b]: v }; continue; }
      out[k] = structuredClone(v);
    }
    return out;
  };
  const snap = path => ({ id: path.split('/')[1], exists: store.has(path), data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined) });
  const ref = path => ({ id: path.split('/')[1], path,
    get: async () => snap(path),
    update: async d => { if (!store.has(path)) throw new Error('not_found ' + path); store.set(path, apply(store.get(path), d)); writes.push(['update', path, d]); },
    set: async d => { store.set(path, apply({}, d)); writes.push(['set', path, d]); } });
  const db = {
    collection(col) {
      return {
        doc: id => ref(col + '/' + (id || 'auto' + (++auto))),
        add: async d => { const id = col.slice(0, 3) + (++auto); store.set(col + '/' + id, apply({}, d)); writes.push(['add', col + '/' + id, d]); return { id }; },
        where(f, op, v) {
          const filters = [[f, v]];
          const q = { where(f2, o2, v2) { filters.push([f2, v2]); return q; }, limit() { return q; }, orderBy() { return q; },
            async get() { return { docs: [...store.keys()].filter(k => k.startsWith(col + '/') && filters.every(([ff, vv]) => store.get(k)[ff] === vv)).map(snap) }; } };
          return q;
        },
      };
    },
    async runTransaction(fn) {
      if (hooks.beforeTx) { const h = hooks.beforeTx; hooks.beforeTx = null; h(); }
      const staged = [];
      const res = await fn({ get: async r => snap(r.path), update: (r, d) => staged.push(['update', r.path, d]), set: (r, d) => staged.push(['set', r.path, d]) });
      for (const [k, p, d] of staged) {
        if (k === 'update') { if (!store.has(p)) throw new Error('not_found ' + p); store.set(p, apply(store.get(p), d)); } else store.set(p, apply({}, d));
        writes.push([k, p, d]);
      }
      return res;
    },
  };
  const storage = { ref: path => ({ async put(blob) { puts.push({ path, size: blob.size }); return { ref: { getDownloadURL: async () => 'https://firebasestorage.googleapis.com/v0/b/test/o/' + encodeURIComponent(path) + '?alt=media&token=t' } }; } }) };
  const { jsPDF: RealPDF } = require('jspdf');
  function SpyPDF(...a) { const d = new RealPDF(...a); const t = d.text.bind(d); d.text = (s, ...r) => { texts.push(Array.isArray(s) ? s.join(' ') : String(s)); return t(s, ...r); }; return d; }
  const S = { profile: { id: 'admin', role: 'admin', name: 'Operatore' }, users: [], properties: [], contracts: [], payments: [], documents: [], invoices: [], activityLog: [], page: 'palazzo' };
  const ctx = vm.createContext({
    S, db, storage, URL, setTimeout, clearTimeout, structuredClone, console: { log() {}, warn() {}, error() {} },
    window: { BOOM_RENT: RENT, jspdf: { jsPDF: SpyPDF }, location: { origin: 'https://www.boomrome.com', pathname: '/portal' } },
    document: { getElementById: getEl, body: { classList: { add() {}, remove() {} } }, querySelectorAll: () => [] },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS', delete: () => DEL, arrayUnion: (...v) => ({ __union: v }) } } },
    auth: { currentUser: { uid: 'admin', getIdToken: async () => 'tok' } },
    fetch: async (url, opts) => { if (String(url).includes('/api/notify/send')) { mails.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ ok: true }) }; } throw new Error('rete non prevista: ' + url); },
    toast: (...a) => toasts.push(a), confirm: msg => { confirms.push(msg); return ctx.__confirmAnswer !== false; },
    logActivity: async (...a) => { activity.push(a); }, refresh: async () => {}, refreshOnly: async () => {}, renderPage() {}, buildNav() {}, checkAlerts() {},
    closeModal() {}, openModal: (type, data) => { getEl('modals').innerHTML = type === 'terminateContract' ? vm.runInContext('terminateContractModal', ctx)(data) : 'modal:' + type; },
    isAdmin: () => true, generateDocHash: async v => require('node:crypto').createHash('sha256').update(String(v)).digest('hex').slice(0, 16), sendBrowserNotification() {},
    daysSince: d => Math.round((Date.now() - new Date(d).getTime()) / 864e5), goTo() {},
    COMPANY: { name: 'BOOM', legal: 'Egidi Immobiliare S.r.l.', website: 'boomrome.com', email: 'info@example.invalid', phone: '+39 000 000 0000', iban: 'IT00X0000000000000000000000' },
    NOTIFY_OWNER: { enabled: false, email: 'operatore@example.invalid', phone: '390000000000' }, EMAILJS_CONFIG: { templates: { notification: 'tpl' } },
  });
  const code = [
    region(src, '    const paymentFilters =', '    async function sendPaymentReminder('),
    region(src, '    async function sendPaymentReminder(', '    function refreshPaymentsView('),
    region(src, '    async function savePayment(', '    // opts = { paidDate'),
    region(src, '    async function markPaymentPaid(', '    // ── Next invoice number'),
    region(src, '    // ── Next invoice number', '    async function payWithStripe('),
    region(src, '    // ═══ CHIUSURA DEL CONTRATTO', '    async function generateBulkPayments('),
    region(src, '    async function notifyPaymentReceived(', '    async function notifyPaymentDueSoon('),
    region(src, '    async function createNotification(', '    async function notifyMultipleUsers('),
    fnSrc(src, 'sendBoomEmail'),
    region(src, '    async function sendPaymentReminderEmail(', '    // Compute the dunning level'),
    region(src, '    function suggestedDunningLevel(', '    function whatsappReminderText('),
    region(src, '    async function sendPaymentConfirmEmail(', '    // ═══ 🖊 FIRMA ORA'),
    region(src, '    function _buildReceiptDoc(', '    function downloadInvoicePDF('),
    fnSrc(src, 'esc'), fnSrc(src, 'jsq'), fnSrc(src, 'fmtDate'), fnSrc(src, 'numberToWords'),
  ].join('\n');
  vm.runInContext(code, ctx);
  const run = c => vm.runInContext(c, ctx);
  const seed = data => {
    store.clear();
    for (const k of ['users', 'properties', 'contracts', 'payments', 'documents', 'invoices']) {
      S[k] = structuredClone(data[k] || []);
      for (const d of S[k]) store.set(k + '/' + d.id, structuredClone(Object.fromEntries(Object.entries(d).filter(([kk]) => kk !== 'id'))));
    }
  };
  const doc = p => store.get(p);
  return { ctx, run, store, doc, writes, mails, toasts, confirms, puts, texts, activity, getEl, seed, hooks, S, DEL };
}

// ── I dati: un palazzo inventato ──────────────────────────────────────────
const FIX = () => ({
  users: [
    { id: 'own1', role: 'landlord', name: 'Chiara Esempio', email: 'proprietaria@example.invalid' },
    { id: 't9', role: 'tenant', name: 'Profilo Inquilino', email: 'profilo@example.invalid' },
  ],
  properties: [
    { id: 'p7', name: 'Int. 7', address: 'Piazzale Esempio 42, Roma', interno: '7', ownerId: 'own1' },
    { id: 'p8', name: 'Int. 8', address: 'Piazzale Esempio 42, Roma', interno: '8', ownerId: 'own1' },
    { id: 'p9', name: 'Int. 9', address: 'Piazzale Esempio 42, Roma', interno: '9', ownerId: 'own1' },
  ],
  contracts: [
    { id: 'c7', propertyId: 'p7', status: 'active', tenantName: 'Şükrü Yılmaz', tenantEmail: 'sukru@example.invalid', tenantPhone: '+39 000 000 0007',
      coTenants: [{ name: 'Иван Петров' }], landlordName: 'Società Esempio S.r.l.', landlordIban: 'IT60X0542811101000000123456',
      startDate: '2026-09-15', endDate: '2027-08-14', rent: 1600, oneriQuota: 120, paymentDay: 5, source: 'palazzo-import', signatureStatus: 'paper' },
    { id: 'c8', propertyId: 'p8', status: 'active', tenantName: 'Mario Prova', startDate: '2026-10-01', endDate: '2027-03-15', rent: 1000, paymentDay: 5,
      canone: { monthly: 1000, installments: 6, total: 6000 }, source: 'palazzo-import' },
    { id: 'c9', propertyId: 'p9', tenantId: 't9', status: 'active', tenantName: 'Profilo Inquilino', startDate: '2026-10-01', endDate: '2027-09-30', rent: 900 },
  ],
  payments: [
    { id: 'pay_c7_2026-10', contractId: 'c7', propertyId: 'p7', type: 'rent', month: '2026-10', amount: 1720, rentAmount: 1600, oneriAmount: 120,
      dueDate: '2026-10-15', periodFrom: '2026-10-15', periodTo: '2026-11-14', status: 'pending', tenantReported: true, tenantReportDate: '2026-10-03',
      proofUrl: 'https://files.example.invalid/prova.pdf', source: 'palazzo-import' },
    { id: 'pay_c8_2026-10', contractId: 'c8', propertyId: 'p8', type: 'rent', month: '2026-10', amount: 1000, dueDate: '2026-10-05', status: 'pending' },
    { id: 'pay_c9_2026-10', contractId: 'c9', propertyId: 'p9', tenantId: 't9', type: 'rent', month: '2026-10', amount: 900, dueDate: '2026-10-05', status: 'pending' },
  ],
});

let count = 0;
async function check(name, fn) { await fn(); count++; console.log('✓ ' + name); }
const today = romeDay();

// ═══ 1. Registra incasso: il modulo, la data dell'accredito, la fonte ═══════
{
  const T = build(); T.seed(FIX());
  T.run("openRecordIncasso('pay_c7_2026-10')");
  const html = T.getEl('modals').innerHTML;
  await check('il modulo propone la data del bonifico segnalato, mai oltre oggi (Roma), e chiede la fonte', () => {
    assert.match(html, /id="incDate" value="2026-10-03" max="\d{4}-\d{2}-\d{2}"/);
    assert.ok(html.includes(`max="${today}"`));
    assert.match(html, /<option value="">Scegli…<\/option>/);
    assert.match(html, /BOOM non vede il conto del locatore/);
    assert.match(html, /prova l’ordine, non l’accredito/);
    assert.match(html, /canone 1\.?600,00.€ \+ oneri 120,00.€/);
    assert.match(html, /notifica nel portale, nessuna email/);
    assert.match(html, /sukru@example\.invalid<\/strong> \(in inglese\)/);
  });
  T.run("openRecordIncasso('pay_c8_2026-10')");
  await check('senza segnalazione la data proposta è OGGI a Roma; senza email nessuna conferma promessa', () => {
    const h = T.getEl('modals').innerHTML;
    assert.ok(h.includes(`id="incDate" value="${today}"`));
    assert.match(h, /Nessuna email all’inquilino/);
    assert.ok(!h.includes('id="incSend"'));
  });
  await check('la scadenza proposta da «Registra Pagamento»: il giorno N del mese dopo a Roma, mai oltre la fine del mese', () => {
    const t = today, y = +t.slice(0, 4), m = +t.slice(5, 7);
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    assert.equal(T.run('incassoNextDue(5)'), `${ny}-${String(nm).padStart(2, '0')}-05`);
    assert.equal(T.run('incassoNextDue(31)'), `${ny}-${String(nm).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
  });
  await check('il giorno di Roma, non quello UTC (mezzanotte e capodanno)', () => {
    assert.equal(T.run("incassoRomeDay(new Date('2026-11-05T23:30:00Z'))"), '2026-11-06');
    assert.equal(T.run("incassoRomeDay(new Date('2026-12-31T23:30:00Z'))"), '2027-01-01');
    assert.equal(T.run("incassoDay('2026-11-05T23:30:00Z')"), '2026-11-06');
    assert.equal(T.run("incassoDay('2026-11-05')"), '2026-11-05');
    assert.equal(T.run("incassoDay('2026-02-30')"), '');
  });
  // Il modulo senza fonte non parte; nel futuro nemmeno.
  T.run("openRecordIncasso('pay_c7_2026-10')");
  Object.assign(T.getEl('incDate'), { value: '2026-10-03' }); Object.assign(T.getEl('incVia'), { value: 'bonifico' });
  Object.assign(T.getEl('incEvidence'), { value: '' }); Object.assign(T.getEl('incSend'), { checked: true });
  const before = T.writes.length;
  await T.run("submitRecordIncasso('pay_c7_2026-10')");
  await check('senza la fonte della prova non si scrive niente', () => { assert.equal(T.writes.length, before); assert.match(T.getEl('incError').textContent, /Indica da dove/); });
  Object.assign(T.getEl('incEvidence'), { value: 'estratto-conto-locatore' }); Object.assign(T.getEl('incDate'), { value: '2999-01-01' });
  await T.run("submitRecordIncasso('pay_c7_2026-10')");
  await check('una data nel futuro non passa', () => { assert.equal(T.writes.length, before); assert.match(T.getEl('incError').textContent, /futuro/); });
  Object.assign(T.getEl('incDate'), { value: '2026-10-03' }); T.getEl('incNote').value = 'Visto sull’estratto della società';
  const ok = await T.run("submitRecordIncasso('pay_c7_2026-10')");
  const pay = T.doc('payments/pay_c7_2026-10');
  await check('la rata pagata porta la data dell’ACCREDITO, il canale, la fonte e chi l’ha registrata', () => {
    assert.equal(ok, true);
    assert.equal(pay.status, 'paid'); assert.equal(pay.paidDate, '2026-10-03');
    assert.equal(pay.paidVia, 'bonifico'); assert.equal(pay.paidEvidence, 'estratto-conto-locatore');
    assert.equal(pay.paidRecordedBy, 'admin'); assert.match(pay.paidRecordedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(pay.paidNote, 'Visto sull’estratto della società');
    assert.equal(T.S.payments.find(p => p.id === 'pay_c7_2026-10').paidDate, '2026-10-03');
  });
  await check('la proprietaria: notifica nel portale col nome del contratto e il mese a parole, NESSUNA email', () => {
    const n = [...T.store.entries()].filter(([k, v]) => k.startsWith('notifications/') && v.userId === 'own1').map(([, v]) => v);
    assert.equal(n.length, 1);
    assert.equal(n[0].message, 'Şükrü Yılmaz ha pagato €1.720,00 per Int. 7 — ottobre 2026 (accredito del 03/10/2026)');
    assert.equal(n[0].data.skipEmail, true);
    assert.ok(!T.mails.some(m => m.to === 'proprietaria@example.invalid'));
    assert.ok(!T.mails.some(m => JSON.stringify(m).includes('IBAN')));
  });
  await check('l’attestazione è archiviata sotto il contratto (inquilino senza profilo) e collegata alla rata', () => {
    const d = T.doc('documents/rent-receipt-pay_c7_2026-10');
    assert.ok(d); assert.equal(d.type, 'receipt'); assert.equal(d.userId, null); assert.equal(d.contractId, 'c7'); assert.equal(d.paymentId, 'pay_c7_2026-10');
    assert.ok(T.puts.some(p => /^contracts\/c7\/ricevute\/RIC-[0-9A-Z]{11}_[0-9a-f]{16}\.pdf$/.test(p.path)));
    assert.equal(d.fileName, T.run("incassoReceiptNumber('pay_c7_2026-10')") + '.pdf');
    assert.equal(pay.receiptDocId, 'rent-receipt-pay_c7_2026-10'); assert.match(pay.receiptUrl, /^https:\/\/firebasestorage/);
  });
  await check('l’inquilino senza profilo riceve DAVVERO la conferma, in inglese, col link all’attestazione', () => {
    const m = T.mails.filter(x => x.to === 'sukru@example.invalid');
    assert.equal(m.length, 1);
    assert.equal(m[0].params.heading, 'Payment received.');
    assert.equal(m[0].params.r1_value, '€1,720.00');
    assert.equal(m[0].params.r2_value, '15 Oct 2026 – 14 Nov 2026');
    assert.equal(m[0].params.r3_value, '3 Oct 2026');
    assert.equal(m[0].params.portal_link, pay.receiptUrl);
    assert.ok(!JSON.stringify(m[0]).includes('/casa'));
    assert.equal(pay.tenantConfirmTo, 'sukru@example.invalid'); assert.match(pay.tenantConfirmSentAt, /T/);
  });
  await check('l’attestazione: locatore, BOOM come gestore, conduttore e cointestatario traslitterati, canone e oneri separati', () => {
    const t = T.texts;
    for (const s of ['ATTESTAZIONE DI PAGAMENTO', "Data dell'accredito: 03/10/2026", 'Società Esempio S.r.l.', 'Sukru Yilmaz', 'in solido con: Ivan Petrov',
      'dal 15/10/2026 al 14/11/2026', 'Canone di locazione', 'EUR 1.600,00', 'Oneri accessori (quota fissa, salvo conguaglio)', 'EUR 120,00', 'EUR 1.720,00',
      "Canale: bonifico bancario - verifica dell'accredito: estratto conto del locatore"]) assert.ok(t.includes(s), 'manca: ' + s);
    assert.ok(t.some(s => /tramite Egidi Immobiliare S\.r\.l\. \(BOOM\), che gestisce la locazione per conto del locatore/.test(s)));
    assert.ok(!t.some(s => /[^\x00-\xFF€–—‘’“”…•]/.test(s)), 'nessun carattere fuori WinAnsi nel PDF');
    assert.ok(!t.some(s => /RICEVUTO DA/.test(s)));
    // Attesta ciò che è stato verificato, e dice cosa NON è.
    const all = t.join(' ');
    assert.match(all, /risulta ricevuto alla data dell'accredito, secondo la verifica indicata/);
    assert.match(all, /Non è una fattura e non sostituisce la quietanza del locatore/);
  });
}

// ═══ 2. La ricevuta: numero, traslitterazione, PDF vero ════════════════════
{
  const T = build();
  await check('il numero viene da TUTTO l’id: due interni dello stesso mese non lo condividono più', () => {
    const a = T.run("incassoReceiptNumber('pay_c_plz_test_int7_2026-10-15_2026-10')"), b = T.run("incassoReceiptNumber('pay_c_plz_test_int8_2026-10-15_2026-10')");
    assert.match(a, /^RIC-[0-9A-Z]{11}$/); assert.notEqual(a, b);
    assert.equal(a, T.run("incassoReceiptNumber('pay_c_plz_test_int7_2026-10-15_2026-10')"));
    // Il difetto: le ultime 8 cifre erano identiche.
    assert.equal('RIC-' + 'pay_c_plz_test_int7_2026-10-15_2026-10'.slice(-8).toUpperCase(), 'RIC-' + 'pay_c_plz_test_int8_2026-10-15_2026-10'.slice(-8).toUpperCase());
  });
  await check('la traslitterazione: turco e cirillico in latino, le parole WinAnsi intatte, mai un nome vuoto', () => {
    assert.equal(T.run("pdfLatin('Şükrü Yılmaz')"), 'Sukru Yilmaz');
    assert.equal(T.run("pdfLatin('Ayşe Doğan')"), 'Ayse Dogan');
    assert.equal(T.run("pdfLatin('Иван Петров')"), 'Ivan Petrov');
    assert.equal(T.run("pdfLatin('Жанна Щукина')"), 'Zhanna Shchukina');
    assert.equal(T.run("pdfLatin('Nicolò Müller-Lüdenscheidt')"), 'Nicolò Müller-Lüdenscheidt');
    assert.equal(T.run("pdfLatin('Gülşen Çelik')"), 'Gulsen Celik');
    assert.equal(T.run("pdfLatin('王伟')"), '');
    T.texts.length = 0;
    T.run("_buildReceiptDoc({id:'x1',amount:500,type:'rent',month:'2026-10',paidDate:'2026-10-05'},{id:'c',tenantName:'王伟'},{id:'p',name:'Int. 1',address:'Roma'},null)");
    assert.ok(T.texts.includes('Conduttore indicato nel contratto'));
  });
  await check('il PDF vero (jsPDF) stampa i nomi traslitterati, non simboli', () => {
    const { jsPDF } = require('jspdf');
    const doc = T.run("_buildReceiptDoc({id:'pay_x_2026-10',amount:1720,rentAmount:1600,oneriAmount:120,type:'rent',month:'2026-10',periodFrom:'2026-10-15',periodTo:'2026-11-14',paidDate:'2026-10-03',paidVia:'bonifico',paidEvidence:'conferma-proprietaria'},{id:'c',tenantName:'Şükrü Yılmaz',landlordName:'Società Esempio S.r.l.',coTenants:[{name:'Иван Петров'}]},{id:'p',name:'Int. 7',address:'Piazzale Esempio 42'},null)");
    assert.ok(doc instanceof jsPDF || typeof doc.output === 'function');
    const out = path.join(os.tmpdir(), 'boom-s4a-' + process.pid + '.pdf');
    fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
    const r = spawnSync('pdftotext', [out, '-'], { encoding: 'utf8' });
    fs.unlinkSync(out);
    if (r.error) { console.log('  (pdftotext assente: verificato solo il testo passato a jsPDF)'); return; }
    assert.match(r.stdout, /Sukru Yilmaz/); assert.match(r.stdout, /Ivan Petrov/); assert.match(r.stdout, /Società Esempio S\.r\.l\./);
    assert.ok(!/Y1lmaz|\^ükrü/.test(r.stdout));
  });
}

// ═══ 3. Incasso con transazione: carta o SEPA nel mezzo vincono ═══════════
{
  const T = build(); T.seed(FIX());
  T.hooks.beforeTx = () => T.store.set('payments/pay_c8_2026-10', { ...T.doc('payments/pay_c8_2026-10'), sddPiId: 'pi_x', sddStatus: 'processing' });
  const r = await T.run("markPaymentPaid('pay_c8_2026-10',{paidDate:'2026-10-04',paidVia:'bonifico',paidEvidence:'conferma-proprietaria'})");
  await check('un addebito SEPA arrivato fra lettura e scrittura: nessun incasso', () => { assert.equal(r, false); assert.notEqual(T.doc('payments/pay_c8_2026-10').status, 'paid'); });
  const before = T.writes.length;
  const r2 = await T.run("markPaymentPaid('pay_c9_2026-10')");
  await check('senza i dati dell’incasso nessuna scrittura: si apre il modulo (Oggi, Recupero, ✔)', () => { assert.equal(r2, false); assert.equal(T.writes.length, before); assert.match(T.getEl('modals').innerHTML, /Data dell’accredito/); });
}

// ═══ 4. Inquilino col profilo; nessuna email quando l'operatore la toglie ═══
{
  const T = build(); T.seed(FIX());
  await T.run("markPaymentPaid('pay_c9_2026-10',{paidDate:'2026-10-06',paidVia:'contanti',paidEvidence:'conferma-proprietaria',notifyTenant:false})");
  await check('con la spunta tolta non parte nessuna email; la ricevuta del canone nasce per chi ha il profilo', () => {
    assert.equal(T.mails.length, 0);
    assert.ok([...T.store.keys()].some(k => k.startsWith('invoices/')));
    assert.ok(T.puts.some(p => p.path.startsWith('documents/t9/archive/')));
  });
  const T2 = build(); T2.seed(FIX());
  await T2.run("markPaymentPaid('pay_c9_2026-10',{paidDate:'2026-10-06',paidVia:'contanti',paidEvidence:'conferma-proprietaria'})");
  await check('chi ha il profilo riceve la conferma all’indirizzo del profilo, col link all’attestazione', () => {
    assert.equal(T2.mails.length, 1); assert.equal(T2.mails[0].to, 'profilo@example.invalid');
    assert.match(T2.mails[0].params.portal_link, /^https:\/\/firebasestorage/);
  });
}

// ═══ 4b. Il link nell'email: mai troncato ═══════════════════════════════════
{
  const T = build(); T.seed(FIX());
  await check('il link del PDF sotto un contratto dall’id lungo sta nei 300 caratteri del bottone (bucket vero)', () => {
    const cid = 'c_plz_piazzale-della-lungaretta-di-santa-cecilia-142_int-17_2026-09-15';
    const path = `contracts/${cid}/ricevute/${T.run("incassoReceiptNumber('pay_" + cid + "_2026-10')")}_0123456789abcdef.pdf`;
    const url = 'https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/' + encodeURIComponent(path) + '?alt=media&token=' + '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12);
    assert.ok(url.length <= 300, 'link di ' + url.length + ' caratteri');
    // Con il vecchio nome (receipt_<id della rata>) non ci stava.
    const old = 'https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/' + encodeURIComponent(`contracts/${cid}/ricevute/receipt_pay_${cid}_2026-10_0123456789abcdef.pdf`) + '?alt=media&token=' + '0'.repeat(36);
    assert.ok(old.length > 300);
  });
  const long = 'https://firebasestorage.googleapis.com/v0/b/x/o/' + 'a'.repeat(300) + '?alt=media&token=t';
  await T.run(`sendPaymentConfirmEmail({name:'Mario Prova',email:'mario@example.invalid'},null,null,{amount:1000,month:'2026-10',paidDate:'2026-10-04'},{receiptUrl:'${long}',hasProfile:false})`);
  await check('un link più lungo di 300 caratteri non entra nell’email (arriverebbe troncato): niente tasto, la conferma resta', () => {
    const m = T.mails.at(-1);
    assert.equal(m.to, 'mario@example.invalid');
    assert.ok(!JSON.stringify(m).includes(long));
    assert.equal(m.params.portal_link, '');
    assert.match(m.params.closing, /Keep this email/);
  });
}

// ═══ 5. Annulla incasso, poi registralo di nuovo ═════════════════════════
{
  const T = build(); T.seed(FIX());
  await T.run("markPaymentPaid('pay_c7_2026-10',{paidDate:'2026-10-03',paidVia:'bonifico',paidEvidence:'ricevuta-inquilino'})");
  const r = await T.run("undoIncasso('pay_c7_2026-10')");
  const p = T.doc('payments/pay_c7_2026-10'), d = T.doc('documents/rent-receipt-pay_c7_2026-10');
  await check('la rata torna da pagare (segnalata, come prima), puliti data/canale/fonte/ricevuta, resta la storia', () => {
    assert.equal(r, true);
    assert.equal(p.status, 'pending');
    for (const k of ['paidDate', 'paidVia', 'paidEvidence', 'receiptUrl', 'receiptDocId', 'paidRecordedAt', 'tenantConfirmSentAt']) assert.ok(!(k in p), k + ' ancora presente');
    assert.equal(p.incassoAnnullato.by, 'admin'); assert.equal(p.incassoAnnullato.was.paidDate, '2026-10-03'); assert.equal(p.incassoAnnullato.was.paidVia, 'bonifico');
    assert.equal(RENT.paymentState(p), 'reported');
  });
  await check('l’attestazione resta in archivio ANNULLATA; la proprietaria riceve la correzione nel portale', () => {
    assert.equal(d.voided, true); assert.match(d.name, /^\[ANNULLATA\] /);
    const n = [...T.store.values()].filter(v => v.userId === 'own1' && v.title === '↩ Correzione incasso');
    assert.equal(n.length, 1); assert.equal(n[0].data.skipEmail, true);
    assert.ok(T.confirms.at(-1).includes('era partita una conferma a sukru@example.invalid: avvisalo tu'));
  });
  await T.run("markPaymentPaid('pay_c7_2026-10',{paidDate:'2026-10-05',paidVia:'bonifico',paidEvidence:'estratto-conto-locatore',notifyTenant:false})");
  const p2 = T.doc('payments/pay_c7_2026-10');
  await check('registrata di nuovo: una NUOVA attestazione, mai quella annullata', () => {
    assert.equal(p2.status, 'paid'); assert.equal(p2.paidDate, '2026-10-05');
    assert.notEqual(p2.receiptDocId, 'rent-receipt-pay_c7_2026-10');
    assert.ok(p2.receiptDocId.startsWith('rent-receipt-pay_c7_2026-10-'));
    assert.ok(!T.doc('documents/' + p2.receiptDocId).voided);
    assert.equal(T.doc('documents/rent-receipt-pay_c7_2026-10').voided, true);
    // Il file dell'attestazione annullata non si riscrive: un altro percorso.
    assert.notEqual(T.doc('documents/' + p2.receiptDocId).fileUrl, T.doc('documents/rent-receipt-pay_c7_2026-10').fileUrl);
    assert.equal(new Set(T.puts.map(x => x.path)).size, T.puts.length, 'nessun file caricato due volte sullo stesso percorso');
  });
  // Stesso accredito ri-registrato (stessa data): ancora un file diverso.
  await new Promise(r => setTimeout(r, 5));
  await T.run("undoIncasso('pay_c7_2026-10')");
  await T.run("markPaymentPaid('pay_c7_2026-10',{paidDate:'2026-10-05',paidVia:'bonifico',paidEvidence:'estratto-conto-locatore',notifyTenant:false})");
  await check('la stessa data ri-registrata dopo un annullamento non sovrascrive il file annullato', () => {
    assert.equal(new Set(T.puts.map(x => x.path)).size, T.puts.length);
    assert.equal(T.puts.length, 3);
  });
  // Un incasso con carta non si annulla da qui.
  T.store.set('payments/pay_c8_2026-10', { ...T.doc('payments/pay_c8_2026-10'), status: 'paid', paidDate: '2026-10-04', paidVia: 'stripe', stripeSessionId: 'cs_test' });
  const r3 = await T.run("undoIncasso('pay_c8_2026-10')");
  await check('un incasso con carta (Stripe) non si annulla dal portale', () => { assert.equal(r3, false); assert.equal(T.doc('payments/pay_c8_2026-10').status, 'paid'); });
}

// ═══ 6. Il dettaglio della rata: centesimi, canone + oneri, Annullata ══════
{
  const T = build(); T.seed(FIX());
  const h = T.run("editPaymentModal(S.payments.find(p=>p.id==='pay_c7_2026-10'))");
  await check('il modale accetta i centesimi, separa canone e oneri e non offre «Pagato» (l’incasso ha il suo modulo)', () => {
    assert.match(h, /name="rentAmount" step="0\.01"/); assert.match(h, /name="oneriAmount" step="0\.01"/);
    assert.ok(!/value="paid"/.test(h));
    assert.match(h, /Registra incasso/);
  });
  const h8 = T.run("editPaymentModal(S.payments.find(p=>p.id==='pay_c8_2026-10'))");
  await check('lo stato offre «Annullata (non più dovuta)»', () => { assert.match(h8, /<option value="cancelled" >Annullata \(non più dovuta\)<\/option>/); assert.match(h8, /name="amount" step="0\.01"/); });
  const submit = async (id, fields) => T.run(`updatePayment({preventDefault(){},target:null},'${id}')`);
  T.ctx.FormData = function () { return Object.entries(T.ctx.__form); };
  T.ctx.__form = { contractId: 'c8', month: '2026-10', dueDate: '2026-10-05', amount: '1234.56', status: 'pending', notes: '' };
  await submit('pay_c8_2026-10');
  await check('l’importo tiene i centesimi (mai parseInt)', () => assert.equal(T.doc('payments/pay_c8_2026-10').amount, 1234.56));
  T.ctx.__form = { contractId: 'c7', month: '2026-10', dueDate: '2026-10-15', rentAmount: '1650.5', oneriAmount: '120', notes: '' };
  await submit('pay_c7_2026-10');
  await check('canone e oneri restano coerenti col totale', () => { const p = T.doc('payments/pay_c7_2026-10'); assert.equal(p.amount, 1770.5); assert.equal(p.rentAmount, 1650.5); assert.equal(p.oneriAmount, 120); });
  T.ctx.__form = { contractId: 'c7', month: '2026-10', dueDate: '2026-10-15', rentAmount: '1650.5', oneriAmount: '120', status: 'cancelled', notes: '' };
  await submit('pay_c7_2026-10');
  await check('una rata segnalata dall’inquilino non si annulla', () => assert.equal(T.doc('payments/pay_c7_2026-10').status, 'pending'));
  T.ctx.__form = { contractId: 'c8', month: '2026-10', dueDate: '2026-10-05', amount: '1234.56', status: 'cancelled', notes: 'uscito prima' };
  await submit('pay_c8_2026-10');
  await check('una rata da pagare si annulla con data, motivo e autore; e si riapre', async () => {
    let p = T.doc('payments/pay_c8_2026-10');
    assert.equal(p.status, 'cancelled'); assert.equal(p.cancelledReason, 'annullata a mano'); assert.equal(p.cancelledBy, 'admin');
    assert.equal(RENT.paymentState(p), 'cancelled');
    T.ctx.__form = { contractId: 'c8', month: '2026-10', dueDate: '2026-10-05', amount: '1234.56', status: 'pending', notes: '' };
    await submit('pay_c8_2026-10');
    p = T.doc('payments/pay_c8_2026-10');
    assert.equal(p.status, 'pending'); assert.ok(!('cancelledAt' in p)); assert.equal(p.reopenedBy, 'admin');
  });
  T.store.set('payments/pay_c9_2026-10', { ...T.doc('payments/pay_c9_2026-10'), status: 'paid', paidDate: '2026-10-06' });
  T.ctx.__form = { notes: 'nota' }; // i campi disabilitati non arrivano nel FormData
  await submit('pay_c9_2026-10');
  await check('su una rata pagata si correggono solo le note', () => { const p = T.doc('payments/pay_c9_2026-10'); assert.equal(p.status, 'paid'); assert.equal(p.amount, 900); assert.equal(p.notes, 'nota'); });
}

// ═══ 7. Chiudere un contratto annulla le rate dopo l'uscita ═══════════════
{
  const T = build();
  const f = FIX();
  const mk = (m, extra = {}) => {
    const [y, mo] = m.split('-').map(Number);
    const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    return { id: 'pay_c7_' + m, contractId: 'c7', propertyId: 'p7', type: 'rent', month: m, amount: 1720, rentAmount: 1600, oneriAmount: 120,
      dueDate: m + '-15', periodFrom: m + '-15', periodTo: next + '-14', status: 'pending', ...extra };
  };
  f.payments = [mk('2026-10', { status: 'paid', paidDate: '2026-10-14' }), mk('2026-11'), mk('2026-12', { tenantReported: true }), mk('2027-01'), mk('2027-02', { status: 'paid', paidDate: '2027-01-20' }), mk('2027-03'), mk('2027-04'),
    { id: 'depbal_c7', contractId: 'c7', propertyId: 'p7', type: 'deposit-balance', month: '2027-05', amount: 500, dueDate: '2027-05-01', status: 'pending' }];
  T.seed(f);
  T.run("openModal('terminateContract', S.contracts.find(c=>c.id==='c7'))");
  T.run("terminateContractPreview('c7','2026-11-30')");
  await check('il modulo dice PRIMA quante rate si annullano', () => {
    const t = T.getEl('termPreview').innerHTML;
    assert.match(t, /Si annullano 3 rate non pagate con il periodo dopo il 30\/11\/2026 \(gennaio 2027 – aprile 2027 · €5\.160,00\)/);
    assert.match(t, /2 rate dopo la chiusura sono pagate, segnalate o in corso/);
    assert.match(t, /La rata di novembre 2026 copre anche giorni dopo la chiusura/);
  });
  // A metà strada una rata viene pagata con carta: resta pagata.
  T.hooks.beforeTx = () => T.store.set('payments/pay_c7_2027-04', { ...T.doc('payments/pay_c7_2027-04'), status: 'paid', paidDate: '2026-11-29', paidVia: 'stripe' });
  T.ctx.FormData = function () { return Object.entries({ terminationDate: '2026-11-30', terminationReason: 'tenant_request', terminationNotes: '', depositReturned: '1500.50', depositWithheld: '0' }); };
  await T.run("terminateContract({preventDefault(){},target:null},'c7')");
  const c = T.doc('contracts/c7');
  await check('contratto e rate nella stessa transazione: dopo l’uscita «Annullata · contratto chiuso», mai pagate o segnalate', () => {
    assert.equal(c.status, 'terminated'); assert.equal(c.terminatedAt, '2026-11-30'); assert.equal(c.depositReturned, 1500.5);
    assert.equal(T.doc('payments/pay_c7_2027-01').status, 'cancelled'); assert.equal(T.doc('payments/pay_c7_2027-01').cancelledReason, 'contratto chiuso');
    assert.equal(T.doc('payments/pay_c7_2027-03').status, 'cancelled');
    assert.equal(T.doc('payments/pay_c7_2027-04').status, 'paid', 'pagata nel mezzo: resta');
    assert.equal(T.doc('payments/pay_c7_2026-12').status, 'pending'); assert.equal(T.doc('payments/pay_c7_2026-12').tenantReported, true);
    assert.equal(T.doc('payments/pay_c7_2027-02').status, 'paid');
    assert.equal(T.doc('payments/pay_c7_2026-11').status, 'pending', 'la rata a cavallo resta intera');
    assert.equal(T.doc('payments/depbal_c7').status, 'pending', 'il saldo deposito non è un canone');
    assert.match(T.confirms.at(-1), /Chiudo il contratto di Şükrü Yılmaz al 30\/11\/2026/);
  });
  await check('dopo l’uscita il Palazzo non vede più un interno pieno e moroso (motore vero)', () => {
    const Pz = require('../../js/palazzo-engine.js');
    const read = col => [...T.store.entries()].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ ...v, id: k.split('/')[1] }));
    const ctxP = Pz.context({ now: new Date('2027-03-20T10:00:00Z'), properties: read('properties'), contracts: read('contracts'), payments: read('payments'), users: read('users') });
    const u = Pz.unitMonth(ctxP, read('properties').find(p => p.id === 'p7'), '2027-03');
    assert.notEqual(u.state, 'late');
    assert.ok(!u.occupied);
  });
  // Dal Palazzo arriva solo l'id: si apre il modulo.
  T.getEl('modals').innerHTML = '';
  T.run("terminateContract('c8')");
  await check('terminateContract(id) dal Palazzo apre il modulo con l’anteprima', () => assert.match(T.getEl('modals').innerHTML, /id="termPreview"/));
  // Rate senza periodo dichiarato (generatore magic-sign): il periodo parte dal giorno del contratto.
  await check('senza periodFrom il periodo si deduce dal giorno di decorrenza (mesi di contratto)', () => {
    assert.equal(T.run("ratePeriodStart({month:'2027-01'},{startDate:'2026-09-15'})"), '2027-01-15');
    assert.equal(T.run("ratePeriodStart({month:'2027-02'},{startDate:'2026-08-31'})"), '2027-02-28');
    assert.equal(T.run("ratePeriodEnd({month:'2027-01'},{startDate:'2026-09-15'})"), '2027-02-14');
    assert.equal(T.run("ratePeriodEnd({month:'2026-10',installmentMonths:3},{startDate:'2026-10-01'})"), '2026-12-31');
  });
}

// ═══ 8. Canone e oneri nuovi sulle rate future ═══════════════════════════
{
  const T = build();
  const f = FIX();
  const mk = (m, from, to, extra = {}) => ({ id: 'pay_c8_' + m, contractId: 'c8', propertyId: 'p8', type: 'rent', month: m, amount: 1000, dueDate: m + '-05', periodFrom: from, periodTo: to, status: 'pending', ...extra });
  f.payments = [mk('2026-10', '2026-10-01', '2026-10-31', { status: 'paid', paidDate: '2026-10-04' }), mk('2026-11', '2026-11-01', '2026-11-30', { tenantReported: true }),
    mk('2026-12', '2026-12-01', '2026-12-31'), mk('2027-01', '2027-01-01', '2027-01-31'), mk('2027-02', '2027-02-01', '2027-02-28'),
    mk('2027-03', '2027-03-01', '2027-03-15', { amount: 483.87, prorated: true })];
  T.seed(f);
  await T.run("applyOneriFuture('c8', 150)");
  await check('oneri nuovi: SOLO le rate da pagare, canone + oneri col totale, l’ultima in proporzione', () => {
    assert.match(T.confirms.at(-1), /Nuovi oneri accessori: €150,00 al mese/);
    assert.match(T.confirms.at(-1), /4 rate non pagate \(dicembre 2026 – marzo 2027\): rata nuova €1\.150,00, quella in proporzione €556,45/);
    assert.match(T.confirms.at(-1), /1 rata segnalata dall’inquilino o in corso resta come è/);
    const d = T.doc('payments/pay_c8_2026-12');
    assert.equal(d.amount, 1150); assert.equal(d.rentAmount, 1000); assert.equal(d.oneriAmount, 150); assert.equal(d.amountChange.was, 1000);
    const m = T.doc('payments/pay_c8_2027-03');
    assert.equal(m.oneriAmount, 72.58); assert.equal(m.rentAmount, 483.87); assert.equal(m.amount, 556.45);
    assert.equal(T.doc('payments/pay_c8_2026-10').amount, 1000, 'pagata: non cambia');
    assert.equal(T.doc('payments/pay_c8_2026-11').amount, 1000, 'segnalata: non cambia');
    assert.equal(T.doc('contracts/c8').oneriQuota, 150);
    assert.equal(T.doc('contracts/c8').termsHistory[0].field, 'oneriQuota');
  });
  T.hooks.beforeTx = () => T.store.set('payments/pay_c8_2027-02', { ...T.doc('payments/pay_c8_2027-02'), tenantReported: true });
  await T.run("applyRentFuture('c8', 1100, {fromMonth:'2027-01'})");
  await check('canone nuovo da un mese: contratto (anche canone.monthly/total) e rate da quel mese, oneri intatti; una segnalata nel mezzo resta', () => {
    assert.equal(T.doc('payments/pay_c8_2026-12').rentAmount, 1000);
    assert.equal(T.doc('payments/pay_c8_2027-02').amount, 1150);
    assert.match(T.toasts.at(-1)[2], /1 cambiate nel frattempo/);
    const j = T.doc('payments/pay_c8_2027-01'); assert.equal(j.rentAmount, 1100); assert.equal(j.oneriAmount, 150); assert.equal(j.amount, 1250);
    const m = T.doc('payments/pay_c8_2027-03'); assert.equal(m.rentAmount, 532.26); assert.equal(m.amount, 604.84);
    const c = T.doc('contracts/c8'); assert.equal(c.rent, 1100); assert.equal(c.canone.monthly, 1100); assert.equal(c.canone.total, 6600);
  });
  T.ctx.__confirmAnswer = false;
  const before = JSON.stringify([...T.store.entries()]);
  await T.run("applyOneriFuture('c8', 200)");
  T.ctx.__confirmAnswer = true;
  await check('senza conferma non cambia niente', () => assert.equal(JSON.stringify([...T.store.entries()]), before));
  const r = await T.run("applyRentFuture('c8', 'abc')");
  await check('un importo non valido si rifiuta', () => assert.equal(r, false));
}

// ═══ 9. Solleciti: un bonifico segnalato si verifica, non si sollecita ═════
{
  const T = build(); T.seed(FIX());
  await T.run("sendPaymentReminder('pay_c7_2026-10')");
  await check('rata segnalata: nessun sollecito, nessuna scrittura, nessuna email', () => {
    assert.equal(T.mails.length, 0); assert.equal(T.writes.length, 0);
    assert.match(T.toasts.at(-1)[1], /segnalato/);
  });
  await T.run("sendPaymentReminder('pay_c8_2026-10')");
  await check('inquilino senza profilo: niente email del portale, rimando al link della rata dal Palazzo', () => {
    assert.equal(T.mails.length, 0);
    assert.match(T.toasts.at(-1)[2], /link della rata dal Palazzo/);
  });
  await check('il livello di sollecito vede le rate rinominate «overdue» in memoria, mai le segnalate', () => {
    const late = new Date(Date.now() - 20 * 864e5);
    const ds = late.toISOString().slice(0, 10);
    assert.equal(T.run(`suggestedDunningLevel({status:'overdue',amount:100,dueDate:'${ds}'})`), 2);
    assert.equal(T.run(`suggestedDunningLevel({status:'overdue',amount:100,dueDate:'${ds}',tenantReported:true})`), 0);
  });
}

// ═══ 10. Una rata nata «pagata» passa dal modulo ═════════════════════════
{
  const T = build(); T.seed(FIX());
  T.ctx.FormData = function () { return Object.entries({ contractId: 'c8', month: '2026-11', amount: '987.65', dueDate: '2026-11-05', status: 'paid' }); };
  await T.run("savePayment({preventDefault(){},target:null})");
  const created = [...T.store.entries()].find(([k, v]) => k.startsWith('payments/') && v.month === '2026-11' && v.contractId === 'c8');
  await check('«Registra Pagamento» non scrive più la data del clic: nasce da pagare, coi centesimi', () => {
    assert.ok(created); assert.equal(created[1].status, 'pending'); assert.equal(created[1].paidDate, null); assert.equal(created[1].amount, 987.65);
  });
}

// ═══ 11. Il generatore in tre fusi orari (processo figlio) ═══════════════
const gen = (tz, mutate) => {
  const r = spawnSync(process.execPath, [SELF, '--gen-child'], { env: { ...process.env, TZ: tz, MUTATE: mutate || '' }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('figlio ' + tz + ': ' + r.stderr);
  return JSON.parse(r.stdout);
};
for (const tz of ['Europe/Rome', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
  const out = gen(tz);
  await check(`generatore (${tz}): 11 periodi dal 15, nessuna rata scade prima del suo periodo`, () => {
    assert.equal(out.mid.length, 11);
    assert.equal(out.mid[0].periodFrom, '2026-09-15'); assert.equal(out.mid.at(-1).month, '2027-07'); assert.equal(out.mid.at(-1).periodTo, '2027-08-14');
    for (const r of out.mid) { assert.ok(r.dueDate >= r.periodFrom, r.month + ' scade ' + r.dueDate + ' prima di ' + r.periodFrom); assert.equal(r.periodFrom.slice(8), '15'); }
    for (const r of out.endOfMonth) assert.equal(r.dueDate.slice(0, 7), r.month, 'il 31 di febbraio non diventa marzo');
    assert.deepEqual(out.bulk.map(b => b.dueDate), ['2026-10-05', '2026-11-05', '2026-12-05']);
    assert.ok(out.bulk.every(b => b.amount === 950.5));
  });
}

// ═══ 12. Mutazioni: rimesso il difetto, il controllo deve cadere ══════════
async function mutant(label, from, to, probe) {
  const pairs = Array.isArray(from) ? from : [[from, to]];
  let src = SRC0;
  for (const [a, b] of pairs) { assert.ok(src.includes(a), 'mutazione non applicabile: ' + label); src = src.replace(a, b); }
  if (Array.isArray(from)) probe = to;
  const T = build(src); T.seed(FIX());
  let caught = false;
  // Preso vuol dire: la verifica cade (AssertionError), non che il codice esplode.
  let why = '';
  try { await probe(T); } catch (e) { caught = !!e && e.code === 'ERR_ASSERTION'; why = e && e.message; }
  if (!caught && why) console.log('  mutazione caduta per un altro motivo: ' + why);
  await check('mutazione presa: ' + label, () => assert.ok(caught));
}
await mutant('la data del clic al posto dell’accredito', "status: 'paid', paidDate: opts.paidDate,", "status: 'paid', paidDate: new Date().toISOString(),", async T => {
  await T.run("markPaymentPaid('pay_c8_2026-10',{paidDate:'2026-10-04',paidVia:'bonifico',paidEvidence:'conferma-proprietaria'})");
  assert.equal(T.doc('payments/pay_c8_2026-10').paidDate, '2026-10-04');
});
await mutant('l’email automatica alla proprietaria', "{ paymentId: paymentData.id, propertyId: property.id, amount: paymentData.amount, skipEmail: true }\n            );\n        }\n        // L'inquilino", "{ paymentId: paymentData.id, propertyId: property.id, amount: paymentData.amount }\n            );\n        }\n        // L'inquilino", async T => {
  await T.run("markPaymentPaid('pay_c8_2026-10',{paidDate:'2026-10-04',paidVia:'bonifico',paidEvidence:'conferma-proprietaria'})");
  assert.ok(!T.mails.some(m => m.to === 'proprietaria@example.invalid'));
});
await mutant('parseInt sull’importo della rata', "const a = incassoNum(data.amount);", "const a = parseInt(data.amount);", async T => {
  T.ctx.FormData = function () { return Object.entries({ contractId: 'c8', month: '2026-10', dueDate: '2026-10-05', amount: '1234.56', notes: '' }); };
  await T.run("updatePayment({preventDefault(){},target:null},'pay_c8_2026-10')");
  assert.equal(T.doc('payments/pay_c8_2026-10').amount, 1234.56);
});
await mutant('la chiusura che lascia aperte le rate', "tx.update(db.collection('payments').doc(plan.cancel[i].id), cancel);", "void 0;", async T => {
  T.ctx.FormData = function () { return Object.entries({ terminationDate: '2026-09-30' }); };
  await T.run("terminateContract({preventDefault(){},target:null},'c8')");
  assert.equal(T.doc('payments/pay_c8_2026-10').status, 'cancelled');
});
await mutant('le rate segnalate ricalcolate col canone nuovo', "if ((st !== 'due' && st !== 'overdue') || amt == null) { skipped.push(p); return; }", "if (amt == null) { skipped.push(p); return; }", async T => {
  assert.equal(T.run("incassoFuturePlan(S.contracts.find(c=>c.id==='c7'), S.payments, 'oneri', 200, '').rows.length"), 0);
});
await mutant('il numero dalle ultime 8 cifre', "return 'RIC-' + (4294967296", "return 'RIC-' + String(id).slice(-8).toUpperCase() || (4294967296", async T => {
  assert.notEqual(T.run("incassoReceiptNumber('pay_c_a_int7_2026-10')"), T.run("incassoReceiptNumber('pay_c_a_int8_2026-10')"));
});
await mutant('i nomi turchi stampati senza traslitterare', ".map(tr).join('')", ".join('')", async T => {
  assert.equal(T.run("pdfLatin('Şükrü Yılmaz')"), 'Sukru Yilmaz');
});
await mutant('l’attestazione annullata riusata', [["&& !d.voided && !!safeUrl(d.fileUrl)", "&& !!safeUrl(d.fileUrl)"], ["if (!pay.receiptDocId && existing.exists && (existing.data() || {}).voided) {", "if (false) {"]], async T => {
  await T.run("markPaymentPaid('pay_c8_2026-10',{paidDate:'2026-10-04',paidVia:'bonifico',paidEvidence:'conferma-proprietaria',notifyTenant:false})");
  await T.run("undoIncasso('pay_c8_2026-10')");
  await T.run("markPaymentPaid('pay_c8_2026-10',{paidDate:'2026-10-05',paidVia:'bonifico',paidEvidence:'conferma-proprietaria',notifyTenant:false})");
  assert.ok(!T.doc('documents/' + T.doc('payments/pay_c8_2026-10').receiptDocId).voided);
});
await mutant('un bonifico segnalato sollecitato', "if (st !== 'overdue' && st !== 'due') return toast('info'", "if (false) return toast('info'", async T => {
  T.S.users.push({ id: 't7', role: 'tenant', name: 'Profilo Sette', email: 'sette@example.invalid' });
  T.S.contracts.find(c => c.id === 'c7').tenantId = 't7';
  await T.run("sendPaymentReminder('pay_c7_2026-10')");
  assert.equal(T.mails.length, 0);
});
await mutant('il link troncato nel bottone dell’email', "&& String(x.receiptUrl).length <= 300 ?", "?", async T => {
  const long = 'https://firebasestorage.googleapis.com/v0/b/x/o/' + 'a'.repeat(300);
  await T.run(`sendPaymentConfirmEmail({name:'Mario Prova',email:'mario@example.invalid'},null,null,{amount:1000,month:'2026-10'},{receiptUrl:'${long}',hasProfile:false})`);
  assert.equal(T.mails.at(-1).params.portal_link, '');
});
await mutant('il file dell’attestazione annullata riscritto dallo stesso accredito', "+(pay.paidRecordedAt ? '|'+pay.paidRecordedAt : '')", "", async T => {
  const go = () => T.run("markPaymentPaid('pay_c8_2026-10',{paidDate:'2026-10-04',paidVia:'bonifico',paidEvidence:'conferma-proprietaria',notifyTenant:false})");
  await go();
  // registrato in un altro istante (l'operatore riprova il giorno dopo)
  await new Promise(r => setTimeout(r, 5));
  await T.run("undoIncasso('pay_c8_2026-10')");
  await go();
  assert.equal(new Set(T.puts.map(x => x.path)).size, T.puts.length);
});
{
  const r = gen('America/Los_Angeles', 'old');
  let caught = false;
  try { for (const x of r.mid) assert.ok(x.dueDate >= x.month + '-15'); } catch (_) { caught = true; }
  let caught2 = false;
  try { for (const x of r.endOfMonth) assert.equal(x.dueDate.slice(0, 7), x.month); } catch (_) { caught2 = true; }
  caught = caught && caught2;
  await check('mutazione presa: il vecchio `new Date(startDate)` a Los Angeles e il 31 di febbraio', () => assert.ok(caught));
}

console.log(`\n${count} check — incassi, rate e ricevute del portal su Firestore finto, nessuna rete.`);
