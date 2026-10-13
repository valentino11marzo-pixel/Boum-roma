// IL PORTALE DELLA PROPRIETARIA (e le giunzioni dell'operatore attorno al
// Palazzo). Le funzioni sono quelle VERE di js/portal-app.js, estratte per
// nome e fatte girare in un contesto Node con Firestore, Storage e Auth finti
// che registrano letture e scritture. Ogni nome che il codice chiama e che
// qui non è definito diventa uno stub REGISTRATO — e alla fine si pretende
// che esista davvero in portal-app.js (mai un nome inventato che in
// produzione sarebbe un ReferenceError).
//
// Dati sintetici: nomi inventati, telefoni +39 000…, email @example.invalid.
//
// Cosa si prova (rilievi dell'audit del Palazzo):
//   8  carta e segnaposto non sono «da firmare»: niente Firma ora, niente link
//  10  il menu della proprietaria ha quattro porte, le rotte ritirate → Palazzo
//  11  il contratto per la proprietaria è l'interno nel Palazzo, mai il modale
//  15  modificare un contratto non collega mai un inquilino non scelto
//  19  il guasto da /guasto dice chi ha segnalato, il telefono e la foto
//  27  «Scrivi a BOOM» è WhatsApp/email con l'interno scritto
//  29  il carico della proprietaria a blocchi di 9, un guasto si dice
//  30  benvenuto in italiano, il link per la password riporta al Palazzo
//  31  Impostazioni si apre senza Notification (iPhone)
//  32  i documenti CONDIVISI dei suoi interni arrivano, gli annullati no
//  33  locatrice società: nessuna stima IRPEF/cedolare a nome della persona
//  58  una nota interna non porta contatto né proprietaria
//  59  sessione scaduta: si esce una volta, senza domande, e si torna lì
//  63  le proposte del palazzo lette mirate, non le «prime 150»
//  lacune 0 (email da un non-admin), 1 (letture mirate), 7 (Innesto), 16 (scansione)
// Seconda revisione: la scansione sul segnaposto si apre davvero, la card
// dell'Innesto dice il perché giusto, Chiudi contratto apre il modulo,
// «Scrivi a BOOM» non mostra il ripiego a scheda aperta, il saluto neutro,
// la cache della proprietaria senza l'Inbox.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CS = require('../../js/contract-state.js');
const RENT = require('../../js/rent-engine.js');
const PAL = require('../../js/palazzo-engine.js');
const TP = require('../../js/taxpack-engine.js');
const FX = require('../../js/fiscal-engine.js');
const DATAOPS = require('../../js/dataops-engine.js');

const SRC = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const MOBILE = readFileSync(new URL('../../js/portal-mobile.js', import.meta.url), 'utf8');

function extract(name, src = SRC) {
  let start = src.indexOf('\n    function ' + name + '(');
  if (start < 0) start = src.indexOf('\n    async function ' + name + '(');
  if (start < 0) throw Error('Missing ' + name);
  start += 1;
  const next = src.slice(start + 5).search(/\n    (?:async )?function /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 5 + next);
}
function region(a, b, src = SRC) {
  const i = src.indexOf(a), j = src.indexOf(b, i + 1);
  if (i < 0 || j < 0) throw Error('Missing region ' + a);
  return src.slice(i, j);
}

const NAMES = ['isAdmin', 'isLandlord', 'isTenant', 'contractIsPaper', 'contractIsPlaceholder', 'contractNotSignable', 'contractSigned',
  'awaitingDigitalSignature', 'contractSignBlock', 'contractTenantName', 'getMyProperties', 'getMyContracts', 'getMyPayments', 'getMyMaintenance',
  'getMyDocuments', 'isPaymentLate', 'isOverdue', 'daysUntil', 'esc', 'jsq', 'fmtDate', 'roleLabel',
  'goTo', 'buildNav', 'renderPage', 'checkSession', 'logout', 'fetchWhereInChunked', 'fetchByIdsChunked', 'loadDataScoped', 'loadDataFresh',
  'checkAlerts', 'viewContract', 'viewContractLandlord', 'viewMaintenance', 'openFirmaOra', 'openSignContractModal', 'generateContractPasses',
  'regenerateContractPDF', 'openShareHub', 'readContractPDF', 'settingsPage', 'sendMyPasswordLink', '_getOnboardingSteps', 'getModal', 'updateContract',
  'inboxLogMessage', 'inboxHomieBanner', 'commercialistaLocatore', 'commercialistaBuildingContracts', 'commercialistaTaxPayments', 'commercialistaProps', 'commercialistaLandlordLite', 'fiscalScadenzarioCard',
  'paymentAfterClose', 'isPaymentLateLive', 'commercialistaAdminFull', 'buildRiepilogoPDF', 'downloadTaxPackZip', 'pdfLatin', 'pdfWa',
  'burocraziaOutOfJourney', 'burocraziaPage', 'renderContractRow', 'myPaymentsPage', 'myDocumentsPage', 'boomEmailDenied', 'sendBoomEmail',
  'innestoPools', 'innestoLinkFor', 'innestoApply', 'innestoSkippedContractCard',
  'palazzoLinkOwner', 'palazzoImport', 'palazzoSaveLook', 'palazzoLogSent', 'palazzoSetRendiconto', 'palazzoSaveRataCard', 'palazzoUploadPaper',
  'palazzoSendPasswordLink'];
// Il blocco dell'adattatore del Palazzo e le sue funzioni di lettura (la
// stessa fetta che monta tests/palazzo/ui.mjs).
const CONFIG = region('    window.BOOM_PALAZZO_UI?.configure({', "    // L'unica scrittura della vista");
const CONSTS = region('    const BOOM_INTERNAL_EMAILS', '    function boomEmailDenied');
const PDFTXT = region('    const PDF_WIN_EXTRA', '    function pdfWa(');
const BASE_CODE = NAMES.map(n => extract(n)).join('\n') + '\n' + CONSTS + '\n' + PDFTXT + '\n' + CONFIG;

// I nomi del filone dei soldi (S4a): esistono o no a seconda del ramo.
const S4A = ['openRecordIncasso', 'undoIncasso', 'applyOneriFuture', 'applyRentFuture'];

// ── Firestore finto: query con where/in/==, doc get/update/set, add, batch ──
function makeDb(store, log, fail) {
  const match = (d, [f, op, v]) => {
    const val = f === '__name__' ? d.id : d[f];
    return op === 'in' ? v.includes(val) : op === '==' ? val === v : true;
  };
  function query(col, filters, lim) {
    return {
      where(f, op, v) { return query(col, filters.concat([[f, op, v]]), lim); },
      limit(n) { return query(col, filters, n); },
      orderBy() { return query(col, filters, lim); },
      onSnapshot() { log.listen.push(col); return () => {}; },
      async get() {
        log.reads.push({ col, filters });
        const err = fail && fail(col, filters);
        if (err) throw err;
        let rows = (store[col] || []).filter(d => filters.every(f => match(d, f)));
        if (lim) rows = rows.slice(0, lim);
        const docs = rows.map(d => ({ id: d.id, exists: true, data: () => JSON.parse(JSON.stringify(d)) }));
        return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) };
      }
    };
  }
  return {
    collection(col) {
      return Object.assign(query(col, []), {
        doc(id) {
          return {
            id, path: col + '/' + id,
            async get() { log.reads.push({ col, id }); const d = (store[col] || []).find(x => x.id === id); return { exists: !!d, id, data: () => d ? JSON.parse(JSON.stringify(d)) : undefined }; },
            async update(data) { log.writes.push(['update', col + '/' + id, data]); },
            async set(data) { log.writes.push(['set', col + '/' + id, data]); }
          };
        },
        async add(data) { log.writes.push(['add', col, data]); return { id: 'new-' + log.writes.length }; }
      });
    },
    batch() {
      const ops = [];
      return { update(ref, d) { ops.push(['update', ref.path, d]); }, set(ref, d) { ops.push(['set', ref.path, d]); }, async commit() { log.writes.push(...ops); } };
    },
    async runTransaction() { throw Error('transazione non prevista in questo test'); }
  };
}

function el(id) {
  return { id, innerHTML: '', textContent: '', value: '', style: {}, children: [], dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    insertAdjacentHTML(pos, html) { this.innerHTML = pos === 'afterbegin' ? html + this.innerHTML : this.innerHTML + html; },
    querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, remove() {}, closest() { return null; } };
}

// Un contesto: ruolo, stato, archivio Firestore, mutazione del sorgente.
function makeCtx({ role = 'admin', uid, profile = {}, state = {}, store = {}, fail, code = BASE_CODE, defs = {}, deny = ['Notification'], fetchResponse, confirmAnswer = true } = {}) {
  const id = uid || (role === 'admin' ? 'admin' : role === 'landlord' ? 'owner-demo' : 'tenant-demo');
  const log = { toast: [], stub: [], open: [], writes: [], reads: [], listen: [], fetch: [], confirm: [], storage: [], reset: [], replace: [], timers: [], stubNames: new Set() };
  const els = new Map();
  const getEl = k => { if (!els.has(k)) els.set(k, el(k)); return els.get(k); };
  const local = new Map();
  const S = Object.assign({ profile: Object.assign({ id, role, name: role === 'landlord' ? 'Chiara Demo' : 'Operatore Demo', email: id + '@example.invalid' }, profile),
    page: '', user: { uid: id }, properties: [], contracts: [], payments: [], maintenance: [], documents: [], users: [], deadlines: [], landlords: [] }, state);
  const auth = {
    languageCode: null,
    currentUser: { uid: id, email: S.profile.email, getIdToken: async () => 'tok-' + id },
    sendPasswordResetEmail: async (email, settings) => {
      log.reset.push({ email, settings, lang: auth.languageCode });
      if (auth.failContinue && settings) { const e = Error('continue'); e.code = 'auth/unauthorized-continue-uri'; throw e; }
    },
    signOut: async () => { log.reset.push({ signOut: true }); }
  };
  const PAL_UI = { ui: { key: '', selected: '' }, render: () => '<div class="plz">PALAZZO</div>', mount() {}, configure(a) { base.__adapter = a; } };
  const window = { BOOM_CONTRACT_STATE: CS, BOOM_RENT: RENT, BOOM_PALAZZO: PAL, BOOM_PALAZZO_UI: PAL_UI, BOOM_TAXPACK: TP, BOOM_FISCAL: FX, BOOM_DATAOPS: DATAOPS,
    location: { hash: '', href: '', search: '' }, open: (...a) => { log.open.push(a); return { location: {} }; }, scrollTo() {} };
  const document = { getElementById: getEl, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el('x'),
    body: el('body'), head: el('head'), activeElement: null, hidden: false, visibilityState: 'visible' };
  const base = {
    S, window, document, location: window.location, history: { replaceState: (a, b, h) => log.replace.push(h) },
    localStorage: { getItem: k => local.has(k) ? local.get(k) : null, setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k) },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TS', arrayUnion: (...x) => ({ __arrayUnion: x }) }, FieldPath: { documentId: () => '__name__' } }, auth: () => auth },
    db: makeDb(store, log, fail), auth,
    storage: { ref: path => ({ async put(file, meta) { log.storage.push({ path, meta, size: file.size }); return { ref: { getDownloadURL: async () => 'https://firebasestorage.googleapis.com/v0/b/demo/o/' + encodeURIComponent(path) + '?alt=media&token=t' } }; } }) },
    CONFIG: { SESSION_TIMEOUT: 30 * 60 * 1000 }, BOOM_INBOX: { preview: s => String(s).slice(0, 80) }, NOTIFY_OWNER: { email: 'valentino@boom-rome.com' },
    COMPANY: { email: 'info@example.invalid', phone: '+39 000 000 0000' }, STRIPE_CONFIG: { enabled: false },
    burocraziaTab: 'archivio', burocraziaFilter: 'all', burocraziaSearch: '', _cmState: { propertyId: null, year: 2026 }, onboardingStep: 0,
    _innesto: null, FormData: class { constructor(t) { this.t = t; } [Symbol.iterator]() { return Object.entries(this.t.values)[Symbol.iterator](); } },
    loadDismissedAlerts: () => new Set(), alertKey: n => n.id,
    toast: (...a) => log.toast.push(a), alert: m => log.toast.push(['alert', m]),
    confirm: m => { log.confirm.push(m); return confirmAnswer; },
    fetch: async (url, o) => { log.fetch.push([url, o && o.body ? JSON.parse(o.body) : null]); return fetchResponse ? fetchResponse(url, o) : { ok: true, status: 200, json: async () => ({ ok: true }) }; },
    setTimeout: (fn, ms) => { log.timers.push(ms); return 0; }, clearTimeout() {},
    console: { log() {}, info() {}, warn() {}, error() {} },
    __log: log, __els: els, __local: local
  };
  S4A.forEach(n => { base[n] = undefined; });
  Object.assign(base, defs);
  const denied = new Set(deny);
  const ctx = vm.createContext(new Proxy(base, {
    has(t, k) { return !denied.has(k); },
    get(t, k) {
      if (denied.has(k)) throw new ReferenceError(String(k) + ' is not defined');
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (k in globalThis) return globalThis[k];
      log.stubNames.add(k);
      return (...args) => { log.stub.push([k, args]); return ''; };
    }
  }));
  vm.runInContext(code, ctx);
  return { ctx, run: c => vm.runInContext(c, ctx), log, S, base, els, el: getEl, window, auth, local };
}

let count = 0;
const allStubs = new Set();
// I valori che escono dal contesto hanno i prototipi di un altro realm:
// si confrontano per contenuto.
const eqj = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
async function check(name, fn) {
  try { await fn(); count++; console.log('✓ ' + name); }
  catch (e) { console.error('✗ ' + name); throw e; }
}
// Mutazione: rimettere il difetto (sostituzione nel sorgente) deve far cadere
// la stessa verifica.
async function mutant(name, from, to, fn, base = BASE_CODE) {
  assert.ok(base.includes(from), 'mutazione senza bersaglio: ' + name);
  const code = base.split(from).join(to);
  let caught = false;
  try { await fn(code); } catch (_) { caught = true; }
  assert.ok(caught, 'la mutazione «' + name + '» non è stata presa');
  count++; console.log('✓ mutazione presa: ' + name);
}
const track = h => { h.log.stubNames.forEach(n => allStubs.add(n)); return h; };

// ── Fixture sintetica ────────────────────────────────────────────────────
const OWNER = { id: 'owner-demo', role: 'landlord', name: 'Chiara Demo', email: 'chiara@example.invalid' };
function fixture() {
  const props = [
    { id: 'p7', name: 'Piazzale Prova 42 int. 7', address: 'Piazzale Prova 42, Roma', interno: '7', ownerId: 'owner-demo', gestioneDal: '2026-05' },
    { id: 'p11', name: 'Piazzale Prova 42 int. 11', address: 'Piazzale Prova 42, Roma', interno: '11', ownerId: 'owner-demo' },
    { id: 'p13', name: 'Piazzale Prova 42 int. 13', address: 'Piazzale Prova 42, Roma', interno: '13', ownerId: 'owner-demo' },
    { id: 'pX', name: 'Via Altrove 1', address: 'Via Altrove 1, Roma', interno: '1', ownerId: 'other-owner' }
  ];
  const contracts = [
    { id: 'c7', propertyId: 'p7', status: 'active', signatureStatus: 'paper', source: 'palazzo-import', tenantName: 'Ada Demo', tenantPhone: '+39 000 000 0007',
      landlordName: 'Societa Prova S.R.L.', rent: 1500, deposit: 3000, startDate: '2026-01-01', endDate: '2027-06-30', type: 'studenti' },
    { id: 'c11', propertyId: 'p11', status: 'active', contractMissing: true, source: 'palazzo-import', tenantName: 'Gaia Demo' },
    { id: 'c13', propertyId: 'p13', status: 'active', signatureStatus: 'none', tenantId: 't13', rent: 1200, startDate: '2026-09-01', endDate: '2027-08-31' },
    { id: 'cX', propertyId: 'pX', status: 'active', signatureStatus: 'complete', tenantSignature: 'x', landlordSignature: 'y', tenantId: 'tX', rent: 900 }
  ];
  const payments = [
    { id: 'pay7-03', contractId: 'c7', propertyId: 'p7', month: '2026-03', dueDate: '2026-03-05', amount: 1500, status: 'pending' },
    { id: 'pay7-06', contractId: 'c7', propertyId: 'p7', month: '2026-06', dueDate: '2026-06-05', amount: 1500, status: 'pending' },
    { id: 'pay7-07', contractId: 'c7', propertyId: 'p7', month: '2026-07', dueDate: '2026-07-05', amount: 1500, status: 'paid', paidDate: '2026-07-04' }
  ];
  const users = [OWNER, { id: 't13', role: 'tenant', name: 'Tito Demo', email: 't13@example.invalid' }, { id: 'tX', role: 'tenant', name: 'Xeno Demo' }];
  return { properties: props, contracts, payments, users };
}

// ════════════════════════════════════════════════════════════════════════
// 8 — carta e segnaposto non sono «da firmare»
// ════════════════════════════════════════════════════════════════════════
{
  const F = fixture();
  const h = track(makeCtx({ role: 'admin', state: F }));
  await check('8 · firma digitale che aspetta: solo il contratto digitale non firmato (mai carta, segnaposto o completo)', () => {
    eqj(F.contracts.map(c => h.run(`awaitingDigitalSignature(S.contracts.find(x => x.id === '${c.id}'))`)), [false, false, true, false]);
    eqj(F.contracts.map(c => h.run(`contractSigned(S.contracts.find(x => x.id === '${c.id}'))`)), [true, false, false, true]);
  });
  await check('8 · la scheda contratto dell\'operatore: su carta niente Firma ora né Rigenera, c\'è «Allega contratto firmato»', () => {
    h.run(`viewContract('c7')`);
    const html = h.el('modals').innerHTML;
    assert.ok(html.includes('Firmato su carta') && html.includes('Allega contratto firmato') && html.includes('palazzoUploadPaper('), 'scansione proposta');
    assert.ok(!html.includes('openFirmaOra(') && !html.includes('regenerateContractPDF('), 'mai Firma ora / Rigenera su carta');
  });
  await check('8 · segnaposto: niente da firmare né PDF, il canone «non in archivio» (mai €undefined)', () => {
    h.run(`viewContract('c11')`);
    const html = h.el('modals').innerHTML;
    assert.ok(html.includes('Contratto da caricare') && html.includes('non in archivio'), html.slice(0, 400));
    assert.ok(!html.includes('openFirmaOra(') && !html.includes('downloadContractPDF(') && !/undefined/.test(html.replace(/onclick="[^"]*"/g, '')));
  });
  await check('lacuna 16 · segnaposto CON la scansione allegata: la scheda la apre (link, Anteprima, PDF), ancora niente Firma ora', () => {
    const G = fixture();
    const url = 'https://firebasestorage.googleapis.com/v0/b/demo/o/contracts%2Fc11%2Fcontratto-carta-1.pdf?alt=media&token=t';
    G.contracts.find(c => c.id === 'c11').paperPdfUrl = url;
    const g = track(makeCtx({ role: 'admin', state: G }));
    g.run(`viewContract('c11')`);
    const html = g.el('modals').innerHTML;
    assert.ok(html.includes(`href="${url.replace(/&/g, '&amp;')}"`) && html.includes('Apri la scansione'), 'link alla scansione');
    assert.ok(html.includes(`previewContractPDF('c11')`) && html.includes(`downloadContractPDF('c11')`), 'Anteprima e PDF');
    assert.ok(html.includes('Sostituisci la scansione') && html.includes('tabella del Palazzo'));
    assert.ok(!html.includes('openFirmaOra(') && !html.includes('regenerateContractPDF('));
  });
  await check('8 · il contratto digitale non firmato conserva Firma ora', () => {
    h.run(`viewContract('c13')`);
    assert.ok(h.el('modals').innerHTML.includes(`openFirmaOra('c13')`));
  });
  await mutant('Firma ora di nuovo su ogni contratto', '${contractNotSignable(c) ? \'\' : `<button class="btn btn-secondary btn-sm" onclick="openFirmaOra(',
    '${false ? \'\' : `<button class="btn btn-secondary btn-sm" onclick="openFirmaOra(', code => {
      const m = makeCtx({ role: 'admin', state: fixture(), code });
      m.run(`viewContract('c7')`);
      assert.ok(!m.el('modals').innerHTML.includes('openFirmaOra('));
    });
  await check('8 · Firma ora rifiuta carta e segnaposto con parole chiare, e NON chiede link al server', async () => {
    h.log.toast.length = 0; h.log.fetch.length = 0; h.log.stub.length = 0;
    await h.run(`openFirmaOra('c7')`);
    await h.run(`openFirmaOra('c11')`);
    eqj(h.log.toast.map(t => t[1]), ['Firmato su carta', 'Contratto da caricare']);
    assert.ok(/firmato su carta/i.test(h.log.toast[0][2]) && /tabella del Palazzo/.test(h.log.toast[1][2]));
    assert.equal(h.log.fetch.length, 0);
    assert.ok(!h.log.stub.some(s => s[0] === 'fetchSignLinks'), 'nessun link coniato');
  });
  await check('8 · Burocrazia: «Da firmare» conta solo il digitale; carta = firmato (da registrare), mai «onboarding incompleto»', () => {
    const html = h.run('burocraziaPage()');
    const kpi = label => (html.match(new RegExp('<div class="stat-label">' + label + '</div><div class="stat-value[^"]*">(\\d+)</div>')) || [])[1];
    assert.equal(kpi('Da firmare'), '1');
    assert.equal(kpi('Onboarding incompleto'), '1', 'solo cX (completo, senza welcome) — mai il contratto su carta');
    assert.equal(kpi('Da registrare'), '2', 'carta e completo si registrano');
    const row = h.run(`renderContractRow(S.contracts.find(c => c.id === 'c7'))`);
    assert.ok(row.includes('Firmato su carta') && !row.includes('T·') && !row.includes('Onboarding incompleto') && !row.includes('Ri-attiva onboarding'), row.slice(0, 600));
    const ph = h.run(`renderContractRow(S.contracts.find(c => c.id === 'c11'))`);
    assert.ok(ph.includes('Contratto da caricare') && ph.includes('Gaia Demo'));
  });
  await mutant('Burocrazia che conta di nuovo le firme mancanti', "const toSign = contracts.filter(c => c.status === 'active' && awaitingDigitalSignature(c));",
    "const toSign = contracts.filter(c => c.status === 'active' && (!c.tenantSignature || !c.landlordSignature));", code => {
      const m = makeCtx({ role: 'admin', state: fixture(), code });
      const html = m.run('burocraziaPage()');
      assert.ok(html.includes('<div class="stat-label">Da firmare</div><div class="stat-value text-orange">1</div>'));
    });
  await check('8 · la proprietaria che apre il modale di firma su carta: «Niente da firmare», nessuna finestra', () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture() }));
    o.run(`openSignContractModal('c7', 'landlord')`);
    assert.equal(o.log.toast[0][1], 'Niente da firmare');
    assert.equal(o.log.open.length, 0);
  });
  await check('8 · nessun conteggio di firme ignora più carta e segnaposto (sorgente)', () => {
    assert.ok(!/filter\(c => !c\.landlordSignature\)/.test(SRC) && !/filter\(c => !c\.tenantSignature\)/.test(SRC));
    assert.ok(!/contracts\.filter\(c => c\.status === 'active' && \(!c\.tenantSignature \|\| !c\.landlordSignature\)\)/.test(SRC));
  });
}

// ════════════════════════════════════════════════════════════════════════
// 10 · 11 · 27 · 34 — la proprietaria: quattro porte, il Palazzo, BOOM a un tocco
// ════════════════════════════════════════════════════════════════════════
{
  const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: Object.assign(fixture(), { properties: fixture().properties.filter(p => p.ownerId === 'owner-demo') }) }));
  await check('10 · il menu della proprietaria: Palazzo · Documenti · Commercialista · Impostazioni · Esci, e basta', () => {
    o.run('buildNav()');
    const nav = o.el('sidebar').innerHTML;
    const pages = [...nav.matchAll(/goTo\('([^']+)'\)/g)].map(m => m[1]);
    eqj(pages, ['palazzo', 'my-documents', 'commercialista', 'settings']);
    assert.ok(nav.includes('logout()') && !/Dashboard|Pagamenti|Contratti|Messaggi|Immobili/.test(nav), nav);
  });
  await check('10 · il badge dei ritardi sta sul Palazzo e NON conta i mesi prima della gestione BOOM', () => {
    // pay7-03 (marzo, prima della gestione da maggio) no; pay7-06 sì.
    eqj(o.run('landlordLatePayments().map(p => p.id)'), ['pay7-06']);
    o.run('buildNav()');
    assert.match(o.el('sidebar').innerHTML, /Il Palazzo <span class="nav-badge"[^>]*>1<\/span>/);
    o.run('checkAlerts()');
    eqj(o.run("S.notifications.filter(n => n.title === 'Pagamento in ritardo').map(n => n.id)"), ['pay7-06'], 'la campanella dice lo stesso');
  });
  await check('10 · ogni rotta ritirata (anche Messaggi, Contratti, Pagamenti…) porta al Palazzo e non si salva come ultima pagina', () => {
    for (const p of ['dashboard', 'my-properties', 'my-contracts', 'my-payments', 'my-maintenance', 'inbox', 'contracts', 'payments', 'market-intel', 'oggi']) {
      o.run(`goTo('${p}')`);
      assert.equal(o.S.page, 'palazzo', p);
      assert.equal(o.window.location.hash, 'palazzo');
      assert.equal(o.local.get('boom_lastPage'), 'palazzo');
    }
    o.run("goTo('documents')"); assert.equal(o.S.page, 'my-documents');
    o.run("goTo('commercialista')"); assert.equal(o.S.page, 'commercialista');
  });
  await check('10 · anche dal tasto indietro (hash scritto a mano) una pagina ritirata diventa il Palazzo', () => {
    o.S.page = 'my-payments';
    o.run('renderPage()');
    assert.equal(o.S.page, 'palazzo');
    assert.equal(o.log.replace.at(-1), '#palazzo');
    assert.ok(o.el('main').innerHTML.includes('PALAZZO'));
  });
  await mutant('le pagine ritirate di nuovo aperte', "if (['palazzo', 'my-documents', 'commercialista', 'settings'].includes(page)) return page;", 'return page;', code => {
    const m = makeCtx({ role: 'landlord', profile: OWNER, state: fixture(), code });
    m.run("goTo('my-payments')");
    assert.equal(m.S.page, 'palazzo');
    assert.equal(m.local.get('boom_lastPage'), 'palazzo');
  });
  await check('10 · nessun ✔ «segna pagato» per la proprietaria (la vecchia lista Pagamenti, se mai la vedesse)', () => {
    assert.ok(!o.run('myPaymentsPage()').includes('markPaymentPaid('));
  });
  await check('11 · «Contratto» per la proprietaria = l\'interno selezionato nel suo Palazzo, mai la cabina di regia', () => {
    o.el('modals').innerHTML = '';
    o.run(`viewContract('c7')`);
    assert.equal(o.el('modals').innerHTML, '');
    assert.equal(o.window.BOOM_PALAZZO_UI.ui.selected, 'p7');
    assert.equal(o.window.BOOM_PALAZZO_UI.ui.key, PAL.buildingKeyOf(o.S.properties.find(p => p.id === 'p7')));
    assert.equal(o.S.page, 'palazzo');
  });
  await mutant('viewContract di nuovo aperto a tutti', '        if (!isAdmin()) return viewContractLandlord(id);\n', '', code => {
    const m = makeCtx({ role: 'landlord', profile: OWNER, state: fixture(), code });
    m.run(`viewContract('c7')`);
    assert.equal(m.el('modals').innerHTML, '');
  });
  await check('11 · pass, firma, link, rigenera: per la proprietaria «Lo fa BOOM», nessuna chiamata', async () => {
    o.log.toast.length = 0; o.log.fetch.length = 0;
    await o.run(`generateContractPasses('c7')`);
    await o.run(`openFirmaOra('c13')`);
    await o.run(`openShareHub('c7')`);
    await o.run(`regenerateContractPDF('c7')`);
    eqj(o.log.toast.map(t => t[1]), ['Lo fa BOOM', 'Lo fa BOOM', 'Lo fa BOOM', 'Lo fa BOOM']);
    assert.equal(o.log.fetch.length, 0);
  });
  await check('27 · «Scrivi a BOOM» per la proprietaria: WhatsApp a BOOM con palazzo e interno già scritti, o l\'email', () => {
    o.log.open.length = 0;
    o.run(`palazzoWriteBoom('p7')`);
    const url = o.log.open[0][0];
    assert.ok(url.startsWith('https://wa.me/393313251961?text='), url);
    assert.match(decodeURIComponent(url.split('text=')[1]), /Piazzale Prova 42, int\. 7/);
    o.run(`palazzoWriteBoom('p7', 'email')`);
    assert.ok(o.window.location.href.startsWith('mailto:valentino@boom-rome.com?subject=') && decodeURIComponent(o.window.location.href).includes('int. 7'));
    eqj(o.run('palazzoCompany()'), { phone: '+393313251961', wa: '393313251961', email: 'valentino@boom-rome.com' });
  });
  // window.open come lo vuole la specifica HTML: con 'noopener' fra le opzioni
  // restituisce SEMPRE null, anche a scheda aperta.
  const writesBoom = async code => {
    const w = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture(), code }));
    let tab = null;
    w.window.open = (u, t, f) => { w.log.open.push([u, t, f]); return /noopener/.test(String(f || '')) ? null : (tab = { opener: 'portal' }); };
    w.run(`palazzoWriteBoom('p7')`);
    assert.equal(w.log.toast.length, 0, 'scheda aperta: nessun ripiego');
    assert.ok(tab && tab.opener === null, 'l\'opener si stacca a mano');
    w.window.open = (...x) => { w.log.open.push(x); return null; };
    w.run(`palazzoWriteBoom('p7')`);
    assert.equal(w.log.toast.at(-1)[1], 'Scrivi a BOOM', 'popup bloccato: numero ed email in chiaro');
    assert.match(w.log.toast.at(-1)[2], /393313251961|\+393313251961/);
  };
  await check('27 · «Scrivi a BOOM»: a scheda aperta nessun ripiego, a popup bloccato numero ed email', () => writesBoom());
  await mutant('window.open con \'noopener\' (null anche a scheda aperta)', "co.wa + '?text=' + encodeURIComponent(text), '_blank');",
    "co.wa + '?text=' + encodeURIComponent(text), '_blank', 'noopener');", writesBoom);
  await check('27 · per l\'operatore «Scrivi a BOOM» resta l\'Inbox', () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    a.run('buildNav = function () {}; renderPage = function () {};'); // il menu dell'operatore non è qui in prova
    a.run(`palazzoWriteBoom('p7')`);
    assert.equal(a.S.page, 'inbox');
    assert.equal(a.log.open.length, 0);
  });
  await check('34 · la tab bar della proprietaria: Palazzo · Documenti · Fisco, e «Studio» è solo dell\'operatore', () => {
    const pref = vm.runInNewContext(MOBILE.match(/var PREF_TABS = (\[[\s\S]*?\]);/)[1]);
    const labels = vm.runInNewContext('(' + MOBILE.match(/var TAB_LABELS = (\{[\s\S]*?\});/)[1] + ')');
    const tabLabel = vm.runInNewContext('(function(){ var TAB_LABELS = ' + JSON.stringify(labels) + '; function txt(s){ return String(s || "").replace(/\\s+/g, " ").trim(); } ' + MOBILE.match(/function tabLabel\(t, item\) \{[\s\S]*?\n    \}/)[0] + ' return tabLabel; })()');
    const sidebar = ['palazzo', 'my-documents', 'commercialista', 'settings'];
    eqj(pref.filter(t => sidebar.includes(t)).slice(0, 4).map(t => tabLabel(t, { textContent: '' })), ['Palazzo', 'Documenti', 'Fisco']);
    assert.equal(tabLabel('dashboard', { textContent: '📊 Dashboard' }), 'Home');
    assert.equal(tabLabel('dashboard', { textContent: '📊 Studio' }), 'Studio');
  });
  await check('34 · Documenti per la proprietaria in italiano («DA BOOM», mai «FROM BOOM»)', () => {
    o.S.documents = [{ id: 'd1', userId: 'admin', uploadedBy: 'admin', propertyId: 'p7', shared: true, name: 'Contratto int. 7', type: 'contract' }];
    const html = o.run('myDocumentsPage()');
    assert.ok(html.includes('DA BOOM') && !html.includes('FROM BOOM'));
  });
}

// ════════════════════════════════════════════════════════════════════════
// L'adattatore del Palazzo: chi scrive è solo l'operatore; le azioni del
// filone dei soldi si cablano coi nomi del contratto e, se mancano, lo dicono
// ════════════════════════════════════════════════════════════════════════
{
  const WRITES = [
    ['rent', ['p7', '2026-10'], 'openRentUnit'], ['edit', [{ id: 'p7' }], 'openModal'], ['payLink', ['pay7-06'], 'showPaymentLink'],
    ['rli', ['c7'], 'markRliRegistered'], ['aspi', ['c7'], 'openAspi'], ['fiscale', ['c7'], 'openFascicolo'], ['arpe', ['c7'], 'openSchedaArpe']
  ];
  await check('adattatore · per la proprietaria ogni azione che scrive dice «Lo fa BOOM» e non parte', async () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture() }));
    const A = o.base.__adapter.actions;
    for (const [name, args, fn] of WRITES) {
      o.log.toast.length = 0; o.log.stub.length = 0;
      await A[name](...args);
      assert.ok(!o.log.stub.some(s => s[0] === fn), name + ' → ' + fn + ' non deve partire');
      assert.equal(o.log.toast[0] && o.log.toast[0][1], 'Lo fa BOOM', name);
    }
    for (const name of ['record', 'undoRecord', 'applyOneri', 'setRent', 'terminate', 'linkOwner', 'importRoll', 'saveLook']) {
      o.log.toast.length = 0;
      const r = await A[name]('x', 1);
      assert.ok(!r && o.log.toast[0][1] === 'Lo fa BOOM', name);
    }
    for (const name of ['logRataSent', 'setRendiconto', 'saveRataCard', 'uploadPaperContract', 'sendPasswordLink', 'loadBuilding']) {
      const r = await A[name](name === 'saveRataCard' ? ['p7'] : 'p7', {});
      assert.ok(!r, name);
    }
    assert.equal(o.log.writes.length, 0, 'nessuna scrittura');
    eqj(o.base.__adapter.company(), { phone: '+393313251961', wa: '393313251961', email: 'valentino@boom-rome.com' });
  });
  await check('adattatore · per l\'operatore le stesse azioni arrivano alle funzioni del portal', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    const A = a.base.__adapter.actions;
    for (const [name, args, fn] of WRITES) {
      a.log.stub.length = 0;
      await A[name](...args);
      assert.ok(a.log.stub.some(s => s[0] === fn), name + ' → ' + fn);
    }
  });
  await check('adattatore · incasso/oneri/canone/annulla del filone soldi: se mancano lo dicono, se ci sono ricevono gli argomenti', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    const A = a.base.__adapter.actions;
    a.log.stub.length = 0;
    await A.record('pay7-06');
    assert.ok(a.log.stub.some(s => s[0] === 'confirmRentPayment' && s[1][0] === 'pay7-06'), 'senza il modale: il percorso di prima');
    a.log.toast.length = 0;
    await A.undoRecord('pay7-07'); await A.applyOneri('c7', 120); await A.setRent('c7', 1600);
    eqj(a.log.toast.map(t => t[1]), ['Annulla incasso: non ancora disponibile', 'Oneri sulle rate future: non ancora disponibile', 'Canone sulle rate future: non ancora disponibile']);
    const got = [];
    const b = makeCtx({ role: 'admin', state: fixture(), defs: { openRecordIncasso: id => got.push(['record', id]), undoIncasso: id => got.push(['undo', id]),
      applyOneriFuture: (c, n) => got.push(['oneri', c, n]), applyRentFuture: (c, n) => got.push(['rent', c, n]) } });
    const B = b.base.__adapter.actions;
    await B.record('pay7-06'); await B.undoRecord('pay7-07'); await B.applyOneri('c7', 120); await B.setRent('c7', 1600);
    eqj(got, [['record', 'pay7-06'], ['undo', 'pay7-07'], ['oneri', 'c7', 120], ['rent', 'c7', 1600]]);
    assert.ok(!b.log.stub.some(s => s[0] === 'confirmRentPayment'), 'col modale non si passa più dal percorso vecchio');
  });
  // Chiudi contratto: dal Palazzo arriva un id. terminateContract(e, id) di
  // questo ramo è il gestore del FORM (e.preventDefault()): chiamato con un id
  // lanciava TypeError senza un toast. Qui il gestore ha quella forma.
  const formHandler = { terminateContract: async (e, id) => { e.preventDefault(); return id; } };
  const terminates = async code => {
    const a = makeCtx({ role: 'admin', state: fixture(), defs: formHandler, code });
    const A = a.base.__adapter.actions;
    assert.equal(await A.terminate('c7'), true);
    const m = a.log.stub.find(s => s[0] === 'openModal');
    assert.ok(m && m[1][0] === 'terminateContract' && m[1][1].id === 'c7', 'si apre il modulo col contratto');
    a.log.stub.length = 0;
    assert.equal(await A.terminate('nessuno'), false);
    assert.equal(a.log.toast.at(-1)[1], 'Contratto non trovato');
    a.S.contracts.find(c => c.id === 'c7').status = 'terminated';
    assert.equal(await A.terminate('c7'), false);
    assert.equal(a.log.toast.at(-1)[1], 'Contratto già chiuso');
    assert.ok(!a.log.stub.some(s => s[0] === 'openModal'));
  };
  await check('adattatore · Chiudi contratto dal Palazzo apre il modulo del contratto (mai il gestore del form con un id)', () => terminates());
  await mutant('terminate che chiama il gestore del form con l\'id', "            terminate: id => palazzoAdminOnly() && palazzoTerminate(id),",
    "            terminate: id => palazzoAdminOnly() && palazzoMissing(typeof terminateContract === 'function' ? terminateContract : null, 'Chiudi contratto', id),", terminates);
  await check('adattatore · tutte le chiavi del contratto fra i filoni (§2) ci sono', () => {
    const a = makeCtx({ role: 'admin', state: fixture() });
    const ad = a.base.__adapter;
    for (const k of ['record', 'undoRecord', 'applyOneri', 'setRent', 'logRataSent', 'setRendiconto', 'saveRataCard', 'uploadPaperContract', 'terminate', 'reload', 'loadBuilding'])
      assert.equal(typeof ad.actions[k], 'function', k);
    for (const k of ['company', 'documents', 'proposals', 'state', 'isAdmin']) assert.equal(typeof ad[k], 'function', k);
  });
}

// ════════════════════════════════════════════════════════════════════════
// 29 · 32 — il carico della proprietaria: blocchi da 9, guasti detti,
// documenti condivisi
// ════════════════════════════════════════════════════════════════════════
{
  const props = Array.from({ length: 20 }, (_, i) => ({ id: 'q' + i, ownerId: 'owner-demo', address: 'Via Prova 9', interno: String(i + 1) }));
  const store = {
    properties: props.concat([{ id: 'qX', ownerId: 'other-owner' }]),
    contracts: [{ id: 'k3', propertyId: 'q3', status: 'active' }, { id: 'k15', propertyId: 'q15', status: 'active' }],
    payments: [{ id: 'r3', propertyId: 'q3', contractId: 'k3', status: 'pending', dueDate: '2099-01-01', amount: 900 }],
    maintenance: [],
    documents: [
      { id: 'own', userId: 'owner-demo', name: 'Mio' },
      { id: 'sh', userId: 'admin', propertyId: 'q15', shared: true, name: 'Scansione contratto' },
      { id: 'hidden', userId: 'admin', propertyId: 'q15', shared: false, name: 'Nota interna' },
      { id: 'void', userId: 'admin', propertyId: 'q3', shared: true, voided: true, name: 'Ricevuta annullata' },
      { id: 'other', userId: 'admin', propertyId: 'qX', shared: true, name: 'Di un altro' }
    ],
    conversations: [{ id: 'conv1', assignedLandlordId: 'owner-demo' }]
  };
  await check('29 · 20 interni: ogni lettura IN della proprietaria a blocchi di al più 9 (le get() delle rules), mai l\'Inbox', async () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, store }));
    await o.run('loadDataScoped(true, 0)');
    const ins = o.log.reads.filter(r => r.filters && r.filters.some(f => f[1] === 'in'));
    assert.ok(ins.length >= 12, 'quattro collezioni × tre blocchi');
    for (const r of ins) assert.ok(r.filters.find(f => f[1] === 'in')[2].length <= 9, r.col);
    eqj([...new Set(ins.map(r => r.col))].sort(), ['contracts', 'documents', 'maintenance', 'payments']);
    assert.ok(ins.filter(r => r.col === 'documents').every(r => r.filters.some(f => f[0] === 'shared' && f[2] === true)), 'documenti: solo shared == true');
    assert.ok(!o.log.reads.some(r => r.col === 'conversations' || r.col === 'messages'), 'l\'Inbox non si legge');
    eqj(o.S.contracts.map(c => c.id).sort(), ['k15', 'k3']);
    assert.equal(o.S.scopedLoadError, null);
  });
  await mutant('blocchi da 30 per la proprietaria', 'const LANDLORD_IN_CHUNK = 9;', 'const LANDLORD_IN_CHUNK = 30;', async code => {
    const o = makeCtx({ role: 'landlord', profile: OWNER, store, code });
    await o.run('loadDataScoped(true, 0)');
    for (const r of o.log.reads.filter(r => r.filters && r.filters.some(f => f[1] === 'in'))) assert.ok(r.filters.find(f => f[1] === 'in')[2].length <= 9);
  });
  await check('29 · una lettura rifiutata NON svuota il Palazzo: le rate di prima restano e l\'errore si dice, con «Riprova»', async () => {
    const fail = (col, filters) => col === 'payments' && filters.find(f => f[1] === 'in')[2].includes('q12') ? Object.assign(Error('Missing or insufficient permissions'), { code: 'permission-denied' }) : null;
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, store, fail, state: { payments: [{ id: 'cached', propertyId: 'q3', contractId: 'k3', status: 'paid' }] } }));
    await o.run('loadDataScoped(false, 0)');
    eqj(o.S.payments.map(p => p.id), ['cached'], 'restano le rate che c\'erano');
    assert.equal(o.S.contracts.length, 2, 'le altre letture arrivano');
    assert.match(o.S.scopedLoadError, /rate/);
    assert.ok(!/permission/i.test(o.S.scopedLoadError), 'mai il messaggio grezzo di Firebase');
    assert.ok(o.log.toast.some(t => t[1] === 'Dati incompleti'));
    o.S.page = 'my-documents';
    o.run('renderPage()');
    const main = o.el('main').innerHTML;
    assert.ok(main.startsWith('<div class="card" role="alert" data-scoped-error') && main.includes('palazzoReload()'), main.slice(0, 200));
  });
  await check('32 · Documenti: i suoi, quelli CONDIVISI dei suoi interni; mai un non condiviso, un annullato o un altro immobile', async () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, store }));
    await o.run('loadDataScoped(true, 0)');
    eqj(o.run('getMyDocuments().map(d => d.id).sort()'), ['own', 'sh']);
    const viaAdapter = await o.base.__adapter.documents(['q15', 'q3', 'qX']);
    eqj(viaAdapter.map(d => d.id), ['sh'], 'adattatore: solo shared, mai annullati, mai un immobile non suo');
    const docReads = o.log.reads.filter(r => r.col === 'documents' && r.filters.some(f => f[1] === 'in')).at(-1);
    eqj(docReads.filters.find(f => f[1] === 'in')[2], ['q15', 'q3'], 'qX non si chiede nemmeno');
  });
  await check('63 · lacuna 1 · Palazzo dell\'operatore riletto mirato: contratti, rate (per immobile E contratto), guasti, proposte; fuse in S', async () => {
    const st = {
      contracts: [{ id: 'c7', propertyId: 'p7', status: 'active', rent: 1500 }],
      payments: [{ id: 'far', contractId: 'c7', status: 'pending', amount: 1500, dueDate: '2099-02-05' }, { id: 'pay7-06', propertyId: 'p7', contractId: 'c7', status: 'pending', dueDate: '2099-06-05' }],
      maintenance: [{ id: 'm1', propertyId: 'p7', status: 'open' }],
      preAgreements: [{ id: 'pa1', propertyId: 'p11', status: 'accepted' }, { id: 'paX', propertyId: 'pX', status: 'sent' }]
    };
    const a = track(makeCtx({ role: 'admin', state: { properties: fixture().properties, contracts: [], payments: [] }, store: st }));
    const r = await a.run(`palazzoLoadBuilding(['p7', 'p11', 'p13'])`);
    eqj([r.contracts, r.payments, r.maintenance, r.proposals], [1, 2, 1, 1]);
    eqj(a.S.payments.map(p => p.id).sort(), ['far', 'pay7-06'], 'anche la rata senza propertyId, letta per contratto');
    eqj(a.S.preAgreements.map(p => p.id), ['pa1']);
    assert.ok(a.log.reads.some(x => x.col === 'payments' && x.filters[0][0] === 'contractId'));
    // Un ascolto realtime al tetto riscrive S.payments senza la rata lontana
    // e con pay7-06 già pagata: tornano SOLO le righe che mancano.
    a.S.palazzoTruncated = true;
    a.S.payments = [{ id: 'pay7-06', propertyId: 'p7', contractId: 'c7', status: 'paid' }];
    assert.equal(a.run('palazzoRemerge()'), 1);
    eqj(a.S.payments.map(p => [p.id, p.status]).sort(), [['far', 'pending'], ['pay7-06', 'paid']].sort(), 'mai sopra una copia più fresca');
    a.S.palazzoTruncated = false;
    a.S.payments = [];
    assert.equal(a.run('palazzoRemerge()'), 0, 'archivio completo: niente da rimettere (mai resuscitare un documento cancellato)');
    const props = await a.base.__adapter.proposals(['p11', 'pX']);
    eqj(props.map(p => p.id).sort(), ['pa1', 'paX']);
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, store: st }));
    assert.equal(await o.run(`palazzoLoadBuilding(['p7'])`), null);
    eqj(await o.base.__adapter.proposals(['p11']), [], 'le proposte restano all\'operatore');
    assert.equal(o.log.reads.length, 0);
  });
  await check('lacuna 1 · vista e portal chiedono insieme: UNA lettura; dalla memoria changed 0 (mai un giro di render); fresh rilegge', async () => {
    const st = { contracts: [{ id: 'c7', propertyId: 'p7', status: 'active' }], payments: [{ id: 'n1', propertyId: 'p7', contractId: 'c7', status: 'pending', dueDate: '2099-01-05' }], maintenance: [], preAgreements: [] };
    const a = track(makeCtx({ role: 'admin', state: { properties: fixture().properties, contracts: [], payments: [] }, store: st }));
    a.run('var __renders = 0; renderPage = function () { __renders++; };');
    a.S.page = 'palazzo';
    a.window.BOOM_PALAZZO_UI.ui.key = PAL.buildingKeyOf(fixture().properties[0]);
    a.run('palazzoEnsureBuilding()');
    const fromView = a.base.__adapter.actions.loadBuilding(['p13', 'p7', 'p11']);
    a.run('palazzoEnsureBuilding()');
    const r = await fromView;
    await new Promise(res => setImmediate(res));
    const reads = () => a.log.reads.filter(x => x.filters && x.filters.length).length;
    assert.equal(reads(), 5, 'quattro collezioni per immobile + le rate per contratto, una volta');
    assert.equal(r.changed, 2);
    assert.equal(a.run('__renders'), 1, 'ridisegna una volta, quando arriva');
    const again = await a.base.__adapter.actions.loadBuilding(['p7', 'p11', 'p13']);
    a.run('palazzoEnsureBuilding()');
    await new Promise(res => setImmediate(res));
    eqj([again.changed, again.cached, reads(), a.run('__renders')], [0, true, 5, 1]);
    await a.run(`palazzoLoadBuilding(['p7', 'p11', 'p13'], { fresh: true })`);
    assert.equal(reads(), 10);
  });
  await mutant('due letture dello stesso palazzo in volo', '            if (prev.promise) return prev.promise;\n', '', async code => {
    const st = { contracts: [{ id: 'c7', propertyId: 'p7' }], payments: [], maintenance: [], preAgreements: [] };
    const a = makeCtx({ role: 'admin', state: { properties: fixture().properties }, store: st, code });
    const [one, two] = await Promise.all([a.run(`palazzoLoadBuilding(['p7'])`), a.run(`palazzoLoadBuilding(['p7'])`)]);
    assert.equal(a.log.reads.length, 5);
    eqj([one.contracts, two.contracts, two.changed], [1, 1, 1], 'chi arriva mentre è in volo riceve la STESSA lettura, non un vuoto');
  });
  await check('63 · lacuna 1 · il Palazzo non legge più le «prime 150» proposte e l\'archivio troncato si segnala (sorgente)', () => {
    const palazzoCase = region("            case 'palazzo':", "            case 'my-properties':");
    assert.ok(!/preAgreements'\)\.limit\(150\)/.test(palazzoCase) && palazzoCase.includes('palazzoEnsureBuilding()'));
    assert.match(SRC, /S\.palazzoTruncated = props\.size >= 400 \|\| contracts\.size >= 800 \|\| payments\.size >= 3000/);
  });
}

// ════════════════════════════════════════════════════════════════════════
// Le scritture del Palazzo (solo admin) col contratto fra i filoni
// ════════════════════════════════════════════════════════════════════════
{
  await check('palazzoLogSent · il link mandato resta SULLA RATA: dunningHistory + lastReminderDate (ora di Roma)', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    assert.equal(await a.run(`palazzoLogSent('pay7-06', { channel: 'whatsapp', kind: 'rata-link', month: '2026-06' })`), true);
    const [kind, path, data] = a.log.writes[0];
    assert.equal(kind + ' ' + path, 'update payments/pay7-06');
    const entry = data.dunningHistory.__arrayUnion[0];
    eqj([entry.channel, entry.kind, entry.month, entry.by], ['whatsapp', 'rata-link', '2026-06', 'admin']);
    assert.match(data.lastReminderDate, /^\d{4}-\d{2}-\d{2}$/);
    await a.run(`palazzoLogSent('pay7-06', { channel: 'piccione', kind: 'boh', month: 'x' })`);
    const e2 = a.log.writes[1][2].dunningHistory.__arrayUnion[0];
    eqj([e2.channel, e2.kind, e2.month], ['whatsapp', 'rata-link', '2026-06'], 'canale e mese ignoti: i default, mai un valore inventato');
  });
  await check('palazzoSetRendiconto · solo off/preview/auto, sul profilo della proprietaria, con conferma', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    assert.equal(await a.run(`palazzoSetRendiconto('owner-demo', 'sempre')`), false);
    assert.equal(a.log.writes.length, 0);
    assert.equal(await a.run(`palazzoSetRendiconto('owner-demo', 'preview')`), true);
    assert.equal(a.log.writes[0][1], 'users/owner-demo');
    assert.equal(a.log.writes[0][2].rendicontoMode, 'preview');
    assert.ok(a.log.confirm[0].includes('SOLO a BOOM'));
  });
  await check('palazzoSaveRataCard · la carta su /rata: senza data del mandato resta spenta, commissione assorbita di default', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    await a.run(`palazzoSaveRataCard(['p7', 'p11'], { on: true })`);
    eqj(a.log.writes.map(w => w[1]), ['properties/p7', 'properties/p11']);
    const v = a.log.writes[0][2].rataCard;
    eqj([v.on, v.mandateAt, v.fee], [true, null, 'absorbed']);
    assert.ok(a.log.confirm[0].includes('ancora SPENTA'));
    await a.run(`palazzoSaveRataCard(['p7'], { on: true, mandateAt: '2026-10-01', fee: 'surcharge', note: 'mandato firmato' })`);
    eqj([a.log.writes[2][2].rataCard.mandateAt, a.log.writes[2][2].rataCard.fee], ['2026-10-01', 'surcharge']);
    await a.run(`palazzoSaveRataCard(['p7'], { on: true, mandateAt: '1/10/2026' })`);
    assert.equal(a.log.writes[3][2].rataCard.mandateAt, null, 'una data non ISO non vale come mandato');
  });
  const pdfFile = (bytes, size) => ({ size: size || bytes.length, slice: (a, b) => ({ arrayBuffer: async () => Uint8Array.from(bytes.slice(a, b)).buffer }) });
  const PDF = [...Buffer.from('%PDF-1.7 demo')];
  await check('lacuna 16 · la scansione del contratto su carta: solo PDF veri, fino a 15 MB, in contracts/<id>/contratto-carta-<ts>.pdf', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    a.ctx.__file = pdfFile([...Buffer.from('\xFF\xD8\xFF\xE0 jpeg')]);
    assert.equal(await a.run(`palazzoUploadPaper('c7', __file)`), null);
    assert.equal(a.log.toast.at(-1)[1], 'Serve un PDF');
    a.ctx.__file = pdfFile(PDF, 15 * 1024 * 1024 + 1);
    assert.equal(await a.run(`palazzoUploadPaper('c7', __file)`), null);
    assert.equal(a.log.toast.at(-1)[1], 'File troppo grande');
    assert.equal(a.log.storage.length, 0);
    a.ctx.__file = pdfFile(PDF);
    const url = await a.run(`palazzoUploadPaper('c7', __file)`);
    assert.match(a.log.storage[0].path, /^contracts\/c7\/contratto-carta-\d+\.pdf$/);
    assert.equal(a.log.storage[0].meta.contentType, 'application/pdf');
    const w = a.log.writes.find(x => x[1] === 'contracts/c7');
    eqj(Object.keys(w[2]).sort(), ['paperPdfAt', 'paperPdfBy', 'paperPdfUrl']);
    assert.equal(w[2].paperPdfUrl, url);
    assert.equal(a.S.contracts.find(c => c.id === 'c7').paperPdfUrl, url);
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture() }));
    o.ctx.__file = pdfFile(PDF);
    assert.equal(await o.run(`palazzoUploadPaper('c7', __file)`), null);
    assert.equal(o.log.storage.length + o.log.writes.length, 0);
  });
  await check('lacuna 16 · il PDF di un contratto su carta è la SCANSIONE (anche «firmato»); senza scansione lo si dice; il segnaposto non ne ha', async () => {
    const st = { contracts: [
      { id: 'c7', signatureStatus: 'paper', paperPdfUrl: 'https://firebasestorage.googleapis.com/scan.pdf', generatedPDF: 'https://firebasestorage.googleapis.com/model.pdf' },
      { id: 'c8', signatureStatus: 'paper', generatedPDF: 'https://firebasestorage.googleapis.com/model.pdf' },
      { id: 'c11', contractMissing: true }] };
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, store: st }));
    const r = await o.run(`readContractPDF('c7', true)`);
    eqj([r.url, r.signed], ['https://firebasestorage.googleapis.com/scan.pdf', true]);
    // Senza scansione: il PDF generato resta consultabile (l'ordine del
    // contratto fra i filoni) ma MAI come «firmato»; chi chiede il firmato
    // si sente dire che la scansione non c'è ancora.
    const gen = await o.run(`readContractPDF('c8')`);
    eqj([gen.url, gen.signed], ['https://firebasestorage.googleapis.com/model.pdf', false]);
    assert.equal(await o.run(`readContractPDF('c8', true)`), null, 'mai il modello BOOM spacciato per il contratto firmato a penna');
    assert.match(o.log.toast.at(-1)[1], /firmato su carta/i);
    assert.equal(await o.run(`readContractPDF('c11')`), null);
    assert.match(o.log.toast.at(-1)[1], /non è ancora in archivio/);
  });
  const SCAN = 'https://firebasestorage.googleapis.com/v0/b/demo/o/contracts%2Fc11%2Fcontratto-carta-1.pdf?alt=media&token=t';
  const scanStore = () => ({ contracts: [{ id: 'c11', propertyId: 'p11', contractMissing: true, paperPdfUrl: SCAN }, { id: 'c12', propertyId: 'p11', contractMissing: true }] });
  const readsScan = async code => {
    for (const role of ['admin', 'landlord']) {
      const h = makeCtx({ role, profile: role === 'landlord' ? OWNER : {}, state: fixture(), store: scanStore(), code });
      const r = await h.run(`readContractPDF('c11')`);
      assert.ok(r && r.url === SCAN && r.signed === true, role + ': la scansione è il PDF del segnaposto');
      assert.equal(await h.run(`readContractPDF('c12')`), null, role + ': senza scansione resta «non in archivio»');
      assert.match(h.log.toast.at(-1)[1], /non (è )?ancora in archivio/);
    }
  };
  await check('lacuna 16 · segnaposto con la scansione: readContractPDF (e quindi il PDF del Palazzo) la dà all\'operatore e alla proprietaria', () => readsScan());
  await mutant('la scansione letta solo sui contratti «paper»', "const paper = (contract.signatureStatus === 'paper' || contract.contractMissing === true)",
    "const paper = (contract.signatureStatus === 'paper')", readsScan);
  await check('lacuna 16 · la scansione si carica sul segnaposto (lo si dice: canone e date restano da fare), mai su un contratto digitale', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    a.ctx.__file = pdfFile(PDF);
    const url = await a.run(`palazzoUploadPaper('c11', __file)`);
    assert.ok(url && a.log.writes.some(w => w[1] === 'contracts/c11' && w[2].paperPdfUrl === url));
    assert.match(a.log.toast.at(-1)[2], /Canone e date restano da completare/);
    a.log.storage.length = 0; a.log.writes.length = 0;
    assert.equal(await a.run(`palazzoUploadPaper('c13', __file)`), null);
    assert.equal(a.log.toast.at(-1)[1], 'Contratto digitale');
    assert.equal(a.log.storage.length + a.log.writes.length, 0, 'su un contratto digitale niente Storage né scritture');
  });
  await check('30 · il link per la password: in italiano, riporta al Palazzo; con dominio di ritorno rifiutato parte comunque', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    assert.equal(await a.run(`palazzoSendPasswordLink('owner-demo')`), true);
    eqj(a.log.reset[0], { email: 'chiara@example.invalid', settings: { url: 'https://www.boomrome.com/login?next=%2Fportal%23palazzo' }, lang: 'it' });
    assert.equal(a.auth.languageCode, null, 'la lingua del portale torna com\'era');
    a.auth.failContinue = true;
    assert.equal(await a.run(`palazzoSendPasswordLink('owner-demo')`), true);
    eqj(a.log.reset.slice(1).map(x => !!x.settings), [true, false]);
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture() }));
    assert.equal(await o.run(`palazzoSendPasswordLink('owner-demo')`), false);
    assert.equal(o.log.reset.length, 0);
    const noMail = track(makeCtx({ role: 'admin', state: { users: [{ id: 'owner-x', role: 'landlord', name: 'Senza Email' }] } }));
    assert.equal(await noMail.run(`palazzoSendPasswordLink('owner-x')`), false);
    assert.equal(noMail.log.toast[0][1], 'Email mancante');
  });
}

// ════════════════════════════════════════════════════════════════════════
// 15 · 19 · 30 · 31 · 33 · 58 · 59 · lacune 0 e 7
// ════════════════════════════════════════════════════════════════════════
{
  await check('15 · Modifica contratto: un\'opzione vuota per l\'inquilino, selezionata se il contratto non ne ha', () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    const html = a.run(`getModal('editContract', S.contracts.find(c => c.id === 'c7'))`);
    assert.match(html, /<select class="form-select" name="tenantId"><option value="" selected>— nessun profilo collegato \(Ada Demo\) —<\/option>/);
    const linked = a.run(`getModal('editContract', S.contracts.find(c => c.id === 'c13'))`);
    assert.match(linked, /<option value="t13" selected>Tito Demo<\/option>/);
  });
  const form = vals => ({ preventDefault() {}, target: { values: Object.assign({ propertyId: 'p7', startDate: '2026-01-01', endDate: '2027-06-30', type: 'studenti', status: 'active', notes: 'nota',
    rent: '', deposit: '', tenantId: '', canoneTotal: '', canoneInstallments: '' }, vals) } });
  await check('15 · salvare la modifica non collega un inquilino non scelto e non scrive €0 su canone/deposito vuoti', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    a.ctx.__e = form({});
    await a.run(`updateContract(__e, 'c7')`);
    const w = a.log.writes.find(x => x[1] === 'contracts/c7')[2];
    assert.ok(!('tenantId' in w) && !('rent' in w) && !('deposit' in w), JSON.stringify(w));
    a.ctx.__e = form({ tenantId: 't13', rent: '1500', deposit: '3000' });
    await a.run(`updateContract(__e, 'c7')`);
    const w2 = a.log.writes.filter(x => x[1] === 'contracts/c7').at(-1)[2];
    eqj([w2.tenantId, w2.rent, w2.deposit], ['t13', 1500, 3000]);
  });
  await mutant('l\'inquilino scritto sempre (il primo dell\'elenco)', '            if (data.tenantId && data.tenantId !== _existingContract.tenantId) updatePayload.tenantId = data.tenantId;',
    '            updatePayload.tenantId = data.tenantId;', async code => {
      const a = makeCtx({ role: 'admin', state: fixture(), code });
      a.ctx.__e = form({});
      await a.run(`updateContract(__e, 'c7')`);
      assert.ok(!('tenantId' in a.log.writes.find(x => x[1] === 'contracts/c7')[2]));
    });
  await check('19 · il guasto dal link /guasto: chi ha segnalato, il telefono con Chiama e WhatsApp, la foto, il canale — mai «N/A»', () => {
    const a = track(makeCtx({ role: 'admin', state: Object.assign(fixture(), { maintenance: [{ id: 'g1', propertyId: 'p7', interno: '7', title: 'Perdita lavandino', status: 'open', priority: 'high', category: 'plumbing',
      userId: null, tenantName: 'Ada Demo', reporter: { role: 'tenant', name: 'Ada Demo', phone: '+39 000 000 0007', via: 'link' },
      photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/guasto.jpg', description: 'Perde acqua sotto il lavandino' }] }) }));
    a.run(`viewMaintenance('g1')`);
    const html = a.el('modals').innerHTML;
    const ph = CS.phoneIntl('+39 000 000 0007');
    assert.ok(html.includes('Ada Demo') && html.includes('inquilino') && html.includes('Link /guasto (senza accesso)'));
    assert.ok(html.includes('+39 000 000 0007'));
    if (ph.e164) assert.ok(html.includes('tel:' + ph.e164));
    if (ph.wa) assert.ok(html.includes('https://wa.me/' + ph.wa));
    assert.ok(html.includes('<img src="https://firebasestorage.googleapis.com/v0/b/demo/o/guasto.jpg"'));
    assert.ok(!html.includes('N/A'));
  });
  await check('30 · il primo ingresso della proprietaria: due passi in italiano verso il Palazzo, niente promesse in inglese', () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture() }));
    const steps = o.run(`_getOnboardingSteps(null, S.properties[0])`);
    assert.equal(steps.length, 2);
    assert.ok(steps[0].title.startsWith('Buongiorno, Chiara') && steps[1].btn === 'Apri il Palazzo', steps[0].title);
    assert.ok(!/Benvenut[ao]\b/.test(steps[0].title), 'un saluto che non presume il genere');
    assert.ok(!/Dashboard|Track rent|Welcome|Get Started/.test(JSON.stringify(steps)));
  });
  await check('31 · Impostazioni si apre senza Notification (iPhone fuori PWA); alla proprietaria Cambia password e Scrivi a BOOM, niente Firebase', () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture() }));
    const html = o.run('settingsPage()');
    assert.ok(html.includes('Cambia password') && html.includes('Scrivi a BOOM') && html.includes('https://wa.me/393313251961'));
    assert.ok(!html.includes('console.firebase.google.com') && !html.includes('Lingua Documenti'));
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    assert.ok(a.run('settingsPage()').includes('console.firebase.google.com'));
  });
  await mutant('Notification letta senza guardia', "const pushOn = typeof Notification !== 'undefined' && Notification.permission === 'granted';",
    "const pushOn = Notification?.permission === 'granted';", code => {
      makeCtx({ role: 'landlord', profile: OWNER, state: fixture(), code }).run('settingsPage()');
    });
  await check('33 · locatrice società: niente stima IRPEF/cedolare né «Cedolare vs IRPEF» a nome della persona, lo dice', () => {
    eqj(vm.runInNewContext(extract('commercialistaLocatore') + '\n;[commercialistaLocatore([{ landlordName: "Societa Prova S.R.L." }], { name: "Chiara Demo" }), commercialistaLocatore([{ landlordName: "Chiara Demo" }], { name: "Chiara Demo" }), commercialistaLocatore([{ landlordName: "Mario Bianchi" }], { name: "Chiara Demo" })]'),
      [{ name: 'Societa Prova S.R.L.', other: true, company: true }, { name: 'Chiara Demo', other: false, company: false }, { name: 'Mario Bianchi', other: true, company: false, soft: true }]);
    const F = fixture();
    F.payments.forEach(p => { p.status = 'paid'; p.paidDate = '2026-0' + p.month.slice(6) + '-04'; });
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: F, defs: { _cmState: { propertyId: 'p7', year: 2026 } } }));
    o.window._cmExpanded = true;
    const html = o.run('commercialistaLandlordLite(false)');
    assert.ok(html.includes('Locatore: <strong>Societa Prova S.R.L.</strong>') && html.includes('della società'), html.slice(0, 300));
    assert.ok(!/IRPEF stimato|cedolare stimata|Cedolare vs IRPEF/.test(html));
    // Gli adempimenti sono della SRL: alla persona l'archivio si offre, non si
    // impone (mai «N documenti da caricare», mai il rosso «0% completo»).
    assert.ok(!/documenti da caricare|Carica i documenti mancanti/.test(html), 'la checklist della società presentata come dovere suo');
    assert.ok(html.includes('Archivio documenti per il commercialista della società') && html.includes('Carica una copia') && html.includes('Facoltativo'));
    // Un segnaposto dello stesso palazzo, senza landlordName: niente
    // scadenzario personale accanto agli interni della società.
    const ph = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture(), defs: { _cmState: { propertyId: 'p11', year: 2026 } } }));
    const phHtml = ph.run('commercialistaLandlordLite(false)');
    assert.ok(!phHtml.includes('Scadenzario fiscale') && phHtml.includes('della società'), 'il segnaposto riporta la locatrice in prima persona');
    assert.ok(!/documenti da caricare/.test(phHtml));
    const same = fixture();
    same.contracts[0].landlordName = 'Chiara Demo';
    // Rate con gli oneri dentro (amount = canone + oneri): il reddito stimato
    // è il SOLO canone.
    same.payments.forEach(p => { p.status = 'paid'; p.paidDate = '2026-0' + p.month.slice(6) + '-04'; p.rentAmount = 1500; p.oneriAmount = 120; p.amount = 1620; });
    const s = track(makeCtx({ role: 'landlord', profile: OWNER, state: same, defs: { _cmState: { propertyId: 'p7', year: 2026 } } }));
    s.window._cmExpanded = true;
    const mine = s.run('commercialistaLandlordLite(false)');
    assert.ok(mine.includes('Cedolare vs IRPEF'), 'se il locatore è lei la stima resta');
    assert.ok(mine.includes("Quest'anno hai incassato <strong>" + TP.fmtEuro(4500) + '</strong>') && !mine.includes(TP.fmtEuro(4860)), 'gli oneri non sono reddito');
  });
  // Chi è il locatore, quando lo dice solo il nome: un diminutivo, un titolo,
  // un profilo senza nome non tolgono a una locatrice in prima persona le sue
  // scadenze; il codice fiscale, quando c'è, decide lui.
  const LOC = (contracts, profile) => JSON.parse(JSON.stringify(vm.runInNewContext(extract('commercialistaLocatore') + '\n;commercialistaLocatore(__c, __p)', { __c: contracts, __p: profile })));
  await check('33b · locatore: diminutivi, titoli, particelle e profilo senza nome non sono «un altro»; il codice fiscale decide', () => {
    assert.equal(LOC([{ landlordName: 'Giovanni Verdi' }], { name: 'Gio Verdi' }).other, false);
    assert.equal(LOC([{ landlordName: 'Giovanna Verdi' }], { name: 'Sig.ra Verdi' }).other, false);
    assert.equal(LOC([{ landlordName: 'Anna Rossi' }], { name: '' }).other, false, 'profilo senza nome: indeterminato, non «altro»');
    assert.equal(LOC([{ landlordName: 'Anna Maria Rossi' }], { name: 'Anna Rossi' }).other, false);
    assert.equal(LOC([{ landlordName: 'Paolo Di Stefano' }], { name: 'Dott. Paolo Di Stefano' }).other, false);
    eqj(LOC([{ landlordName: 'Giovanni Verdi', landlordCF: 'VRDGNN70A01H501X' }], { name: 'Mario Altro', codiceFiscale: 'VRDGNN70A01H501X' }), { name: 'Mario Altro', other: false, company: false }, 'CF uguale, nome diverso: è lei');
    const diff = LOC([{ landlordName: 'Chiara Demo', landlordCF: 'DMOCHR80A41H501Y' }], { name: 'Chiara Demo', codiceFiscale: 'VRDGNN70A01H501X' });
    assert.ok(diff.other && !diff.soft, 'CF diverso con lo stesso nome: è un altro, provato');
    const soft = LOC([{ landlordName: 'Mario Bianchi' }], { name: 'Chiara Demo' });
    assert.ok(soft.other && soft.soft, 'solo il nome non torna: avviso, non verdetto');
    // La pagina: col solo nome diverso la stima e lo scadenzario restano, con la nota.
    const G = fixture();
    G.contracts[0].landlordName = 'Mario Bianchi';
    G.payments.forEach(p => { p.status = 'paid'; p.paidDate = '2026-0' + p.month.slice(6) + '-04'; });
    const g = track(makeCtx({ role: 'landlord', profile: OWNER, state: G, defs: { _cmState: { propertyId: 'p7', year: 2026 } } }));
    g.window._cmExpanded = true;
    const h = g.run('commercialistaLandlordLite(false)');
    assert.ok(h.includes('Cedolare vs IRPEF') && /Quest'anno hai incassato/.test(h), 'la stima resta');
    assert.ok(h.includes('Sul contratto il locatore è <strong style="color:var(--text)">Mario Bianchi</strong>'), 'la nota non assertiva');
  });
  await mutant('il locatore deciso dal solo nome (Gio ≠ Giovanni nasconde lo scadenzario)', 'const same = shortT.length > 0 && shortT.every(w => longT.some(v => tokMatch(w, v)));',
    'const same = shortT.length > 0 && shortT.every(w => longT.includes(w));', code => {
      const r = JSON.parse(JSON.stringify(vm.runInNewContext(extract('commercialistaLocatore', code) + '\n;commercialistaLocatore(__c, __p)', { __c: [{ landlordName: 'Giovanni Verdi' }], __p: { name: 'Gio Verdi' } })));
      assert.equal(r.other, false);
    }, SRC);
  // Il pacchetto per il commercialista e la pagina dell'operatore: stessi
  // numeri e stesso locatore della pagina della proprietaria.
  function fakePdfZip() {
    const texts = [], files = [];
    function FakePDF() {
      return { setFont() {}, setFontSize() {}, setTextColor() {}, setDrawColor() {}, setLineWidth() {}, line() {}, addPage() {}, setPage() {},
        text(s) { texts.push(Array.isArray(s) ? s.join(' ') : String(s)); }, internal: { getNumberOfPages: () => 1 }, output: () => new Blob(['pdf']) };
    }
    function FakeZip() {
      const mk = p => ({ folder: n => mk(p + n + '/'), file: (n, b) => { files.push(p + n); } });
      return Object.assign(mk(''), { generateAsync: async () => new Blob(['zip']) });
    }
    return { texts, files, FakePDF, FakeZip };
  }
  const SRL_FIX = () => {
    const F = fixture();
    F.payments.forEach(p => { p.status = 'paid'; p.paidDate = '2026-0' + p.month.slice(6) + '-04'; p.rentAmount = 1500; p.oneriAmount = 120; p.amount = 1620; });
    return F;
  };
  await check('33c · pacchetto fiscale (ZIP): locatore la SRL, canoni senza oneri, nessuna stima IRPEF né «Quadro RB»', async () => {
    const z = fakePdfZip();
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: SRL_FIX(), defs: { JSZip: z.FakeZip } }));
    o.window.JSZip = z.FakeZip; o.window.jspdf = { jsPDF: z.FakePDF };
    await o.run("downloadTaxPackZip('p7', 2026)");
    const all = z.texts.join(' | ');
    assert.ok(z.texts.includes('Societa Prova S.R.L.'), 'il LOCATORE stampato è la società: ' + all.slice(0, 400));
    assert.ok(!z.texts.includes('Chiara Demo'), 'mai la persona al posto del locatore');
    assert.ok(z.texts.includes('Ada Demo'), 'il conduttore dal contratto, anche senza profilo');
    assert.ok(/Canoni incassati: \| € 4\.?500/.test(all) && !/4\.?860/.test(all), 'canoni senza oneri: ' + all);
    assert.ok(!/Imponibile IRPEF|Quadro RB|Cedolare stimata/.test(all), 'nessuna stima a nome di nessuno');
    assert.ok(/della società/.test(all));
  });
  await check('33d · pagina Commercialista dell’operatore: niente «Imponibile (95%)» né 4.860 su un palazzo della SRL', () => {
    const a = track(makeCtx({ role: 'admin', state: SRL_FIX(), defs: { _cmState: { propertyId: 'p7', year: 2026 } } }));
    const h = a.run('commercialistaAdminFull()');
    assert.ok(h.includes(TP.fmtEuro(4500)) && !h.includes(TP.fmtEuro(4860)), 'gli oneri non sono canoni');
    assert.ok(!/Imponibile \(95%\)|Cedolare stimata|Cedolare vs IRPEF/.test(h));
    assert.ok(h.includes('Societa Prova S.R.L.') && h.includes('della società'));
  });
  await check('58 · una nota interna non porta né il contatto né la proprietaria; un messaggio vero sì', async () => {
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    const conv = { id: 'conv1', contactUid: 'owner-demo', assignedLandlordId: 'owner-demo' };
    a.ctx.__conv = conv;
    await a.run(`inboxLogMessage(__conv, { body: 'Cliente difficile, attenzione', direction: 'note' })`);
    await a.run(`inboxLogMessage(__conv, { body: 'Buongiorno', direction: 'out', channel: 'whatsapp' })`);
    const msgs = a.log.writes.filter(w => w[0] === 'add' && w[1] === 'messages').map(w => w[2]);
    eqj(msgs.map(m => [m.direction, m.contactUid, m.assignedLandlordId]), [['note', null, null], ['out', 'owner-demo', 'owner-demo']]);
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture() }));
    assert.equal(o.run(`inboxHomieBanner({ aiSummary: 'Riassunto', suggestedReply: 'Bozza', needsReply: true })`), '');
  });
  // La cache del dispositivo (boom_data_cache) scritta da una versione che
  // leggeva le conversazioni della proprietaria: al boot non tornano in
  // memoria e la cache si riscrive subito senza, anche se il carico fresco
  // poi fallisce. L'operatore le tiene.
  const CACHE_CODE = BASE_CODE + '\n' + extract('loadData') + '\n' + extract('cacheData');
  const bootFromCache = (role, code) => {
    const profile = role === 'landlord' ? OWNER : { id: 'admin', role: 'admin' };
    const h = makeCtx({ role, profile, state: fixture(), code: code || CACHE_CODE, defs: { requestIdleCallback: fn => fn() } });
    h.local.set('boom_data_cache', JSON.stringify({ timestamp: Date.now() - 60000, uid: profile.id, role,
      data: { properties: fixture().properties, conversations: [{ id: 'conv1', aiSummary: 'Analisi interna', suggestedReply: 'Bozza' }] } }));
    return h.run('loadData()').then(() => h);
  };
  const dropsInbox = async code => {
    const o = await bootFromCache('landlord', code);
    eqj(o.S.conversations, [], 'in memoria niente Inbox');
    const saved = JSON.parse(o.local.get('boom_data_cache'));
    eqj(saved.data.conversations, [], 'la cache si riscrive senza');
    assert.equal(saved.data.properties.length, 4, 'il resto della cache resta');
  };
  await check('58 · cache di prima: le conversazioni non tornano alla proprietaria e la cache si riscrive senza; l\'operatore le tiene', async () => {
    await dropsInbox();
    const a = await bootFromCache('admin');
    assert.equal(a.S.conversations.length, 1);
    assert.equal(JSON.parse(a.local.get('boom_data_cache')).data.conversations.length, 1);
  });
  await mutant('cache della proprietaria con l\'Inbox di prima', "if (role === 'landlord' && data) { data.conversations = []; data.messages = []; }", '', dropsInbox, CACHE_CODE);
  await check('58 · il carico fresco della proprietaria svuota comunque le conversazioni lette da una cache', async () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, store: { properties: fixture().properties.slice(0, 3) }, state: { conversations: [{ id: 'conv1' }], messages: [{ id: 'm1' }] } }));
    await o.run('loadDataScoped(true, 0)');
    eqj([o.S.conversations, o.S.messages], [[], []]);
  });
  await check('59 · sessione scaduta: si esce SENZA domanda, una volta sola, e il login riporta alla pagina dov\'eri', async () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: Object.assign(fixture(), { page: 'palazzo', lastActivity: Date.now() - 31 * 60 * 1000 }) }));
    await o.run('checkSession()');
    await new Promise(r => setImmediate(r));
    assert.equal(o.log.confirm.length, 0, 'mai «Vuoi uscire?» da un timer');
    assert.equal(o.window.location.href, '/login?next=%2Fportal%23palazzo&expired=1');
    o.window.location.href = '';
    await o.run('checkSession()');
    assert.equal(o.window.location.href, '', 'non si ripete ogni minuto');
    assert.ok(/document\.addEventListener\('pointerdown', updateActivity/.test(SRC) && /addEventListener\('scroll', updateActivity/.test(SRC));
  });
  await mutant('il confirm dentro il timer della sessione', "            logout({ silent: true, reason: 'expired' });", '            logout();', async code => {
    const o = makeCtx({ role: 'landlord', profile: OWNER, state: Object.assign(fixture(), { page: 'palazzo', lastActivity: Date.now() - 31 * 60 * 1000 }), code });
    await o.run('checkSession()');
    assert.equal(o.log.confirm.length, 0);
  });
  await check('lacuna 0 · email da un non-admin verso terzi: non parte e lo si dice UNA volta; verso BOOM sì; un 403 non è un guasto', async () => {
    const o = track(makeCtx({ role: 'landlord', profile: OWNER, state: fixture(), fetchResponse: () => ({ ok: false, status: 403, json: async () => ({}) }) }));
    assert.equal(await o.run(`sendBoomEmail('x', 'inquilino@example.invalid', {})`), false);
    assert.equal(await o.run(`sendBoomEmail('x', 'altro@example.invalid', {})`), false);
    assert.equal(o.log.fetch.length, 0);
    eqj(o.log.toast.map(t => t[1]), ['Email non inviata da qui']);
    assert.equal(await o.run(`sendBoomEmail('x', 'valentino@boom-rome.com', {})`), false);
    assert.equal(o.log.fetch.length, 1, 'verso BOOM si prova');
    assert.ok(!o.log.toast.some(t => t[1] === 'Email non inviata'), 'il 403 di una porta ristretta non è un errore tecnico');
    const a = track(makeCtx({ role: 'admin', state: fixture() }));
    assert.equal(await a.run(`sendBoomEmail('x', 'inquilino@example.invalid', {})`), true);
    assert.equal(a.log.fetch[0][1].to, 'inquilino@example.invalid');
  });
  await check('lacuna 7 · Innesto: sull\'interno col contratto «da caricare» (o un contratto vivo) NON nasce un secondo contratto, nessuna scrittura', async () => {
    const F = fixture();
    const a = track(makeCtx({ role: 'admin', state: F }));
    const pools = a.run('innestoPools()');
    assert.equal(pools.liveContract('p11', { startDate: '2026-10-01', endDate: '2027-09-30' }).id, 'c11', 'segnaposto vivo');
    assert.equal(pools.liveContract('p7', { startDate: '2026-10-01', endDate: '2027-09-30' }).id, 'c7', 'contratto attivo sovrapposto');
    assert.equal(pools.liveContract('p7', { startDate: '2027-07-01', endDate: '2028-06-30' }), null, 'dopo la fine: libero');
    a.S.contracts.find(c => c.id === 'c11').status = 'terminated';
    assert.equal(pools.liveContract('p11', { startDate: '2026-10-01' }), null, 'segnaposto chiuso: libero');
    a.S.contracts.find(c => c.id === 'c11').status = 'active';
    const proposal = { property: { address: 'Piazzale Prova 42, Roma', interno: '11' }, tenant: { name: 'Gaia Demo', email: 'gaia@example.invalid' },
      contract: { startDate: '2026-10-01', endDate: '2027-09-30', rent: 1100, type: 'transitorio', durationMonths: 12 } };
    a.ctx._innesto = { proposal, links: { property: 'p11' }, skipContract: false, busy: false, create: {}, readDocs: [], archive: false, diffs: {}, expanded: {} };
    assert.ok(DATAOPS.validateProposal(proposal).ok, 'la proposta è valida: si ferma per il contratto, non per un errore');
    await a.run('innestoApply()');
    const t = a.log.toast.at(-1);
    assert.equal(t[1], 'L’interno ha già un contratto', t.join(' | '));
    assert.match(t[2], /tabella del Palazzo/);
    assert.equal(a.log.writes.length, 0);
    assert.equal(a.run('_innesto.busy'), false);
  });
  await mutant('Innesto senza la guardia del contratto vivo', '            if (clash) {\n                toast(\'error\', \'L’interno ha già un contratto\'',
    '            if (false) {\n                toast(\'error\', \'L’interno ha già un contratto\'', async code => {
      const a = makeCtx({ role: 'admin', state: fixture(), code });
      a.ctx._innesto = { proposal: { property: { address: 'Piazzale Prova 42, Roma', interno: '11' }, tenant: { name: 'Gaia Demo' }, contract: { startDate: '2026-10-01', endDate: '2027-09-30', rent: 1100, type: 'transitorio' } },
        links: { property: 'p11' }, skipContract: false, busy: false, create: {}, readDocs: [], archive: false, diffs: {}, expanded: {} };
      try { await a.run('innestoApply()'); } catch (_) { /* senza guardia si prosegue verso le scritture */ }
      assert.equal(a.log.toast.at(-1)[1], 'L’interno ha già un contratto');
    });
  // La card «Contratto non creato da qui» dice il PERCHÉ vero, e la scelta si
  // può sempre togliere.
  const skippedCards = code => {
    const a = makeCtx({ role: 'admin', state: fixture(), code });
    const card = st => { a.ctx._innesto = Object.assign({ skipContract: true, pa: null, skipReason: null }, st); return a.run('innestoSkippedContractCard({})'); };
    const undo = '_innesto.skipContract=false;_innesto.skipReason=null;renderPage()';
    const clash = card({ skipReason: 'clash' });
    assert.ok(/già un contratto/.test(clash) && /tabella del Palazzo/.test(clash) && !/proposta nel console/.test(clash), 'il contratto vivo, non una proposta che non c\'è');
    assert.ok(clash.includes(undo) && clash.includes('Annulla la scelta'), 'la scelta si toglie');
    const pa = card({ skipReason: 'pa', pa: { found: { id: 'pa1', status: 'accepted' } } });
    assert.ok(/proposta nel console/.test(pa) && pa.includes('Crealo comunque da qui') && pa.includes(undo));
    const done = card({ skipReason: 'pa', pa: { found: { id: 'pa1', contractId: 'cZ' } } });
    assert.ok(/esiste già/.test(done) && !done.includes(undo), 'contratto della proposta già nato: niente «crealo»');
    const bare = card({});
    assert.ok(!/proposta nel console/.test(bare) && bare.includes(undo), 'senza motivo noto: mai una proposta inventata');
  };
  await check('lacuna 7 · Innesto: la card del contratto saltato per il contratto già vivo lo dice, e la spunta si toglie', () => skippedCards());
  await mutant('card del contratto saltato che ignora il perché', "            : _innesto.skipReason === 'clash'\n", "            : false\n", skippedCards);
  await check('lacuna 7 · la spunta del riquadro «già un contratto» registra il perché (sorgente)', () => {
    assert.ok(SRC.includes("onchange=\"_innesto.skipContract=this.checked;_innesto.skipReason=this.checked?'clash':null;renderPage()\"> non creare il contratto da qui (aggiorna solo persone e immobile)"));
  });
  await check('lacuna 7 · la guardia sta PRIMA di ogni scrittura dell\'Innesto (sorgente)', () => {
    const body = extract('innestoApply');
    const guard = body.indexOf('clashPools.liveContract('), firstWrite = body.search(/_innesto\.busy = true|\.update\(|\.set\(|\.add\(|runTransaction/);
    assert.ok(guard > 0 && guard < firstWrite, 'guardia ' + guard + ' / prima scrittura ' + firstWrite);
  });
}

// Ogni nome che il codice ha chiamato senza che il test lo definisse deve
// esistere davvero in portal-app.js: altrimenti in produzione sarebbe un
// ReferenceError che qui lo stub avrebbe nascosto.
await check('nessuno stub nasconde un nome inesistente in portal-app.js', () => {
  const missing = [...allStubs].filter(n => !new RegExp('(?:function\\s+|const\\s+|let\\s+|var\\s+)' + n.replace(/\$/g, '\\$') + '\\b').test(SRC));
  eqj(missing, []);
});

console.log(`\n${count} check — il portale della proprietaria e le giunzioni del Palazzo, funzioni vere, dati sintetici, nessuna rete.`);
