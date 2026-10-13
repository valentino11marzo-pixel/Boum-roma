// LE PAROLE DEL PALAZZO, senza browser: i piccoli pezzi della vista che
// decidono cosa legge la proprietaria e cosa parte su WhatsApp (js/palazzo.js
// caricato come in portal.html, BOOM_PALAZZO_UI._t). Ogni regola ha la sua
// mutazione: rimessa la riga vecchia, il controllo deve cadere.
//   - un importo scritto all'italiana («1.050») è mille e cinquanta, mai 1,05;
//   - un numero ambiguo (fisso o estero senza prefisso) si scrive com'è stato
//     dato e non diventa un WhatsApp;
//   - «1 rata», «1 giorno», «1 mese»: mai «1 rate»;
//   - il segnaposto non dà «occupato 12 mesi su 12»;
//   - il messaggio inglese scrive €1,000 (e i centesimi solo se ci sono);
//   - il rendiconto dice a chi è partito, o perché non è partito niente.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = f => readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8');
let n = 0;
const ok = (label, fn) => { fn(); n++; console.log('✓ ' + label); };

function load(viewSrc) {
  const win = { Intl, Date, Math, JSON, console, URL, Number, String, Array, Object, RegExp, isFinite, isNaN, parseFloat, parseInt, setTimeout, clearTimeout };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const [f, s] of [['contract-state.js', read('contract-state.js')], ['rent-engine.js', read('rent-engine.js')], ['palazzo-engine.js', read('palazzo-engine.js')], ['palazzo.js', viewSrc || read('palazzo.js')]]) {
    vm.runInContext(s, ctx, { filename: f });
  }
  return win.BOOM_PALAZZO_UI._t;
}
const T = load();
const plain = x => JSON.parse(JSON.stringify(x));   // oggetti di un altro «realm» (vm)
const mutate = (from, to) => {
  const src = read('palazzo.js');
  assert.ok(src.includes(from), 'la riga da mutare esiste: ' + from);
  return load(src.replace(from, to));
};

ok('euroInput: «1.050» è 1050, «950,5» è 950,5; testo e numeri storti non passano', () => {
  const cases = [['1.050', 1050], ['1.050,50', 1050.5], ['€ 1.200', 1200], ['950', 950], ['950,5', 950.5], ['1050.5', 1050.5], ['0', 0]];
  for (const [i, o] of cases) assert.equal(T.euroInput(i), o, i);
  for (const bad of ['abc', '1,2,3', '', '12.34.5', '-50']) assert.ok(Number.isNaN(T.euroInput(bad)), bad);
});
ok('mutazione: senza la regola delle migliaia «1.050» diventa 1,05 — il controllo cade', () => {
  const M = mutate("if (/^\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?$/.test(t)) t = t.replace(/\\./g, '').replace(',', '.');", 'if (false) {}');
  assert.notEqual(M.euroInput('1.050'), 1050);
});

ok('telefoni: il cellulare italiano col prefisso, l\'estero col suo, l\'ambiguo com\'è stato dato', () => {
  assert.equal(T.fmtPhone('+393331234567'), '+39 333 123 4567');
  assert.equal(T.fmtPhone('333 123 4567'), '+39 333 123 4567');
  assert.ok(T.fmtPhone('+90 532 123 4567').startsWith('+90 '), T.fmtPhone('+90 532 123 4567'));
  assert.equal(T.fmtPhone('0532 123 45 67'), '0532 123 45 67');
  assert.equal(T.fmtPhone(''), '');
  assert.equal(T.waNumber('+90 532 123 4567'), '905321234567');
  assert.equal(T.waNumber('333 123 4567'), '393331234567');
  assert.equal(T.waNumber('0532 123 45 67'), '', 'un fisso (o un estero senza prefisso) non è un WhatsApp');
  assert.equal(T.waNumber('06 1234'), '');
});
ok('mutazione: l\'ambiguo formattato col +39 — il controllo cade', () => {
  const M = mutate('if (!r.e164 || r.ambiguous) return', 'if (!r.e164) return');
  assert.notEqual(M.fmtPhone('0532 123 45 67'), '0532 123 45 67');
});

ok('debiti: da quando, quanti giorni, quante rate — al singolare quando è una', () => {
  assert.equal(T.debtNote({ oldestMonth: '2026-08', oldestDays: 69, count: 3 }), 'da agosto 2026 · 69 giorni · 3 rate');
  assert.equal(T.debtNote({ oldestMonth: '2026-10', oldestDays: 1, count: 1 }), 'da ottobre 2026 · 1 giorno');
  assert.equal(T.debtNote({ oldestMonth: '2026-09', oldestDays: 40, count: 2, unknownAmounts: 1, previousContract: true }), 'da settembre 2026 · 40 giorni · 2 rate · un importo da verificare · contratto precedente');
});

ok('puntualità: senza rate in scadenza non è «nessuna pagata»; una rata è «1 rata»', () => {
  assert.equal(T.punctuality({ paidCount: 0, overdueCount: 0, expectedCount: 0, since: '2026-10' }), 'Nessuna rata ancora in scadenza da ottobre 2026');
  assert.equal(T.punctuality({ paidCount: 0, overdueCount: 0, expectedCount: 2 }), 'Nessuna rata pagata negli ultimi 12 mesi');
  assert.equal(T.punctuality({ paidCount: 0, overdueCount: 1, overdueOldest: '2026-09-05', expectedCount: 1 }), '1 rata aperta, la più vecchia scaduta il 5 set 2026');
  assert.equal(T.punctuality({ paidCount: 1, onTime: 1, avgDelay: -2 }), 'Paga in media 2 giorni prima · 1 su 1 rata puntuale');
  assert.equal(T.punctuality({ paidCount: 6, onTime: 5, avgDelay: 1.5, since: '2026-05', overdueCount: 2, overdueOldest: '2026-08-05' }),
    'Paga in media 1,5 giorni dopo · 5 su 6 rate puntuali da maggio 2026 · 2 rate aperte, la più vecchia scaduta il 5 ago 2026');
  assert.equal(T.punctuality(null), '—');
});

ok('12 mesi: solo i mesi misurati; il segnaposto dà «—», mai «12 su 12»', () => {
  assert.equal(T.occupiedText({ measuredMonths: 0, unknownMonths: 4, occupiedMonths: 0 }), '— (contratto non ancora in archivio)');
  assert.equal(T.occupiedText({ measuredMonths: 3, occupiedMonths: 1, since: '2026-08' }), 'occupato 1 mese su 3 (da agosto 2026)');
  assert.equal(T.occupiedText({ measuredMonths: 12, occupiedMonths: 10, unknownMonths: 1 }), 'occupato 10 mesi su 12 · 1 mese senza contratto in archivio');
});
ok('mutazione: il segnaposto contato come occupato — il controllo cade', () => {
  const M = mutate("if (!t.measuredMonths) return t.unknownMonths ? '— (contratto non ancora in archivio)' : '—';", '');
  assert.notEqual(M.occupiedText({ measuredMonths: 0, unknownMonths: 4, occupiedMonths: 0 }), '— (contratto non ancora in archivio)');
});

ok('periodo della rata: si scrive solo quando non è un mese di calendario', () => {
  assert.equal(T.periodText({ periodFrom: '2026-10-01', periodTo: '2026-10-31' }), '');
  assert.equal(T.periodText({ periodFrom: '2026-09-15', periodTo: '2026-10-14' }), 'dal 15 set 2026 al 14 ott 2026');
  assert.equal(T.periodText({ periodFrom: '2027-08-01', periodTo: '2027-08-14' }), 'dal 1 ago 2027 al 14 ago 2027');
  assert.equal(T.periodText({}), '');
});

ok('il messaggio in inglese: €1,000 e i centesimi solo se ci sono; la lingua sul link', () => {
  assert.equal(T.eurEn(1000), '€1,000');
  assert.equal(T.eurEn(933.33), '€933.33');
  assert.equal(T.eurEn(1000.5), '€1,000.50');
  assert.equal(T.eurEn(null), '');
  assert.equal(T.withLang('https://www.boomrome.com/rata?id=p1&t=x', 'en'), 'https://www.boomrome.com/rata?id=p1&t=x&lang=en');
  assert.equal(T.withLang('https://www.boomrome.com/guasto', 'it'), 'https://www.boomrome.com/guasto?lang=it');
  assert.equal(T.withLang('', 'en'), '');
});

ok('rendiconto: a chi è partito, o perché non è partito niente — mai un «fatto» generico', () => {
  assert.deepEqual(plain(T.rendOutcome({ ok: true, label: 'Settembre 2026', counts: { previews: 1 }, results: [{ to: 'valentino@boom-rome.com' }] }, 'preview')),
    { ok: true, msg: 'Anteprima di Settembre 2026 mandata a BOOM (valentino@boom-rome.com): lei non riceve niente.' });
  assert.deepEqual(plain(T.rendOutcome({ ok: true, label: 'Settembre 2026', counts: { sent: 1 }, results: [{ to: 'owner@example.invalid' }] }, 'force')),
    { ok: true, msg: 'Rendiconto di Settembre 2026 mandato a owner@example.invalid.' });
  assert.equal(T.rendOutcome({ ok: true, label: 'Settembre 2026', counts: {}, results: [{ skipped: 'no_email' }] }, 'preview').msg, 'Niente di partito per Settembre 2026: nel suo profilo non c’è un’email.');
  assert.equal(T.rendOutcome({ ok: true, label: 'Settembre 2026', counts: { failed: 1 }, results: [{ failed: 'smtp' }] }, 'force').ok, false);
  assert.equal(T.rendOutcome({ ok: false, error: 'forbidden' }, 'preview').msg, 'Non è partito: forbidden. Riprova fra un attimo.');
});

// ── Revisione del filone S3 (secondo giro) ─────────────────────────────
const U12 = { interno: '12', name: 'Viale Esempio 12 int. 12', month: { lease: null, incoming: null, tenants: [] }, property: {} };
const DEP = { id: 'dep12', state: 'overdue', isRent: false, type: 'deposit-balance', month: '2026-09', amount: 400, dueDate: '2026-09-10' };
const RENT_ROW = { id: 'p12', state: 'overdue', isRent: true, type: 'rent', month: '2026-10', amount: 800, dueDate: '2026-10-07' };
ok('il saldo del deposito si chiama così: mai «la rata di settembre» nel messaggio né nella riga', () => {
  assert.equal(T.rowKind(DEP), 'deposit');
  assert.equal(T.rowKind(RENT_ROW), 'rent');
  assert.equal(T.rowKind({ isRent: false, type: 'utility' }), 'other');
  assert.equal(T.rowKind({ month: '2026-10' }), 'rent', 'una rata senza tipo resta canone (come rent-engine)');
  assert.equal(T.rowName(DEP), 'Saldo deposito');
  const en = T.rataText(U12, DEP, 'https://www.boomrome.com/rata?id=dep12&t=x&lang=en', 'Lea Demo', 'en', 'sollecito', false);
  assert.ok(en.includes('a reminder about the deposit balance (unit 12): €400, due on 10 Sep') && !/\brent\b/.test(en), en);
  const it = T.rataText(U12, DEP, 'https://www.boomrome.com/rata?id=dep12&t=x&lang=it', 'Lea Demo', 'it', 'sollecito', false);
  assert.ok(it.includes('ti ricordo il saldo del deposito (int. 12): €400, scaduto il 10 set 2026 e non ci risulta ancora arrivato') && !/\brata\b/.test(it.split('/rata?')[0]), it);
  const rent = T.rataText(U12, RENT_ROW, 'https://x/rata', 'Lea Demo', 'en', 'sollecito', false);
  assert.ok(rent.includes('a reminder about the October 2026 rent'), rent);
  assert.equal(T.debtNote({ oldestMonth: '2026-09', oldestDays: 33, count: 2, rows: [DEP, RENT_ROW] }), 'da settembre 2026 · 33 giorni · 1 rata + saldo deposito');
});
ok('mutazione: senza rowKind il saldo del deposito torna «the September 2026 rent» — il controllo cade', () => {
  const M = mutate("if (!r || r.isRent !== false) return 'rent';", "return 'rent';");
  const en = M.rataText(U12, DEP, 'https://x/rata', 'Lea Demo', 'en', 'sollecito', false);
  assert.ok(/September 2026 rent/.test(en), en);
});

ok('un importo che manca non è «€0»', () => {
  assert.equal(T.amtText(950), '€950');
  assert.equal(T.amtText(0), 'importo da verificare');
  assert.equal(T.amtText(null), 'importo da verificare');
});
ok('mutazione: amtText che scrive eur(v) — €0 torna, il controllo cade', () => {
  const M = mutate("function amtText(v) { return Number(v) > 0 ? eur(v) : 'importo da verificare'; }", 'function amtText(v) { return eur(v || 0); }');
  assert.equal(M.amtText(0), '€0');
});

ok('numero ambiguo alla proprietaria: niente «fisso», niente telefonata a Ferrara', () => {
  const ph = T.phoneOf('0532 123 45 67');
  assert.equal(T.phoneWhy(ph, false), 'numero da verificare con BOOM: niente WhatsApp');
  assert.ok(/estero senza prefisso/.test(T.phoneWhy(ph, true)), 'all\'operatore cosa fare');
  assert.equal(T.telOf(ph), '', 'senza adattatore = vista della proprietaria: nessun tel:');
  assert.equal(T.telOf(T.phoneOf('+90 532 123 4567')), 'tel:+905321234567');
});
ok('mutazione: il tel: anche sull\'ambiguo — il controllo cade', () => {
  const M = mutate("return ph && ph.e164 && !(ph.ambiguous && !viewAdmin()) ? 'tel:' + ph.e164 : '';", "return ph && ph.e164 ? 'tel:' + ph.e164 : '';");
  assert.equal(M.telOf(M.phoneOf('0532 123 45 67')), 'tel:+3905321234567');
});

ok('carta su /rata: per i contratti non presi in carico la carta c\'è già, e lo si dice', () => {
  assert.ok(T.cardEffect({ on: false }, { any: 3, imported: 0, notImported: 3 }).startsWith('Contratti non presi in carico: su /rata la carta c’è già'));
  const mixed = T.cardEffect({ on: true, mandateAt: '' }, { any: 3, imported: 1, notImported: 2 });
  assert.ok(mixed.includes('Senza la data del mandato') && mixed.includes('Gli altri 2 interni, non presi in carico, hanno già la carta'), mixed);
  assert.equal(T.cardEffect({ on: false }, { any: 2, imported: 2, notImported: 0 }), 'Su /rata gli inquilini degli interni presi in carico vedono solo il bonifico al conto del locatore.');
});

// ── Il Palazzo DISEGNATO senza browser: render() della vista vera ─────
// (correttore finale) La vista caricata come in portal.html, un adattatore
// finto, l'HTML che la pagina scriverebbe. Date relative a OGGI (render usa
// l'ora vera): CUR è il mese corrente.
function loadWin(viewSrc) {
  class U extends URL {}
  U.createObjectURL = () => 'blob:demo'; U.revokeObjectURL = () => {};
  const win = { Intl, Date, Math, JSON, console, URL: U, Number, String, Array, Object, RegExp, isFinite, isNaN, parseFloat, parseInt, setTimeout, clearTimeout, Promise };
  win.Blob = class { constructor(parts) { win.__csv = parts.join(''); } };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const [f, s] of [['contract-state.js', read('contract-state.js')], ['rent-engine.js', read('rent-engine.js')], ['palazzo-engine.js', read('palazzo-engine.js')], ['palazzo.js', viewSrc || read('palazzo.js')]]) {
    vm.runInContext(s, ctx, { filename: f });
  }
  return win;
}
const W0 = loadWin(), E0 = W0.BOOM_PALAZZO;
const CUR = E0.context({ properties: [] }).month, MM = k => E0.monthAdd(CUR, k);
const OWNER = { id: 'o1', role: 'landlord', name: 'Proprietaria Esempio' };
const P0 = (id, extra = {}) => ({ id, address: 'Viale Prova 3, Roma', interno: id.replace(/^u/, ''), floor: '2', ownerId: 'o1', name: 'Viale Prova 3 int. ' + id.replace(/^u/, ''), ...extra });
function draw(state, setup, viewSrc, actions) {
  const W = viewSrc ? loadWin(viewSrc) : loadWin();
  const UI = W.BOOM_PALAZZO_UI;
  const st = { profile: { id: 'adm', role: 'admin' }, users: [OWNER], maintenance: [], listings: [], preAgreements: [], ...state };
  UI.configure({ state: () => st, isAdmin: () => st.profile.role === 'admin', actions: actions || {}, rataLinks: async () => ({}), links: async () => ({}) });
  if (setup) setup(UI.ui);
  return { html: UI.render(), UI, W };
}
const unesc = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const waLinks = html => [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"[^>]*>WhatsApp: ([^<]+)</g)].map(m => ({ who: m[2], text: decodeURIComponent(unesc(m[1]).split('text=')[1] || '') }));

// 1. L'informativa privacy arriva a OGNI intestatario, anche dopo il primo invio.
const scenPriv = viewSrc => {
  const pay = { id: 'p9', contractId: 'c9', propertyId: 'u9', type: 'rent', month: CUR, amount: 900, dueDate: CUR + '-01', status: 'pending',
    // Il messaggio al titolare è già partito (palazzoLogSent): la rata lo ricorda.
    dunningHistory: [{ kind: 'sollecito', at: new Date().toISOString(), channel: 'whatsapp' }] };
  const { html } = draw({ properties: [P0('u9')], contracts: [{ id: 'c9', propertyId: 'u9', status: 'active', startDate: MM(-1) + '-01', endDate: MM(10) + '-28', tenantName: 'Chiara Demo', coTenants: [{ name: 'Coinquilino Demo' }], rent: 900 }], payments: [pay] },
    ui => { ui.selected = 'u9'; ui.view = 'simple'; ui.month = CUR; ui.rata.urls.p9 = 'https://www.boomrome.com/rata?id=p9&t=demo'; ui.rata.open = 'p9';
      ui.contacts.byId.c9 = [{ name: 'Chiara Demo', phone: '+39 000 000 0009' }, { name: 'Coinquilino Demo', phone: '+39 000 000 0019' }]; }, viewSrc);
  const w = waLinks(html);
  assert.equal(w.length, 2, 'due intestatari, due WhatsApp');
  for (const x of w) assert.ok(x.text.includes('https://www.boomrome.com/privacy-inquilini?lang=en'), x.who + ': ' + x.text);
  assert.ok(/Copia messaggio/.test(html) && /privacy-inquilini/.test(unesc(html.split('data-plz="copy-link"')[1] || '')), 'anche «Copia messaggio»');
};
ok('rata: l’informativa privacy arriva al co-intestatario anche dopo il messaggio al titolare (e nel «Copia messaggio»)', () => scenPriv());
ok('informativa: il link porta la lingua del messaggio (IT → ?lang=it, EN → ?lang=en)', () => {
  assert.equal(T.privacyLine('it'), 'Come BOOM tratta i tuoi dati: https://www.boomrome.com/privacy-inquilini?lang=it');
  assert.equal(T.privacyLine('en'), 'How BOOM handles your data: https://www.boomrome.com/privacy-inquilini?lang=en');
});
ok('mutazione: l’informativa «solo al primo messaggio del contratto» — il co-intestatario la perde, il controllo cade', () => {
  const src = read('palazzo.js');
  const from = "'. ' + howEn + url + '\\n' + privacyLine('en');";
  assert.ok(src.includes(from), 'la riga da mutare esiste');
  const bad = src.replace(from, "'. ' + howEn + url + (!(adapter.state().payments || []).some(function (p) { return p && p.contractId === r.contractId && Array.isArray(p.dunningHistory) && p.dunningHistory.length; }) ? '\\n' + privacyLine('en') : '');");
  assert.throws(() => scenPriv(bad), { name: 'AssertionError' });
});

// 2. Il link dei guasti: in un mese passato col contratto chiuso, mai il link di chi abita lì oggi.
const scenSeat = (viewSrc, seats) => {
  const st = { properties: [P0('u6')], payments: [],
    contracts: [{ id: 'c6old', propertyId: 'u6', status: 'expired', startDate: MM(-14) + '-01', endDate: E0.day(new Date(Date.UTC(+MM(-3).slice(0, 4), +MM(-3).slice(5, 7), 0))), tenantName: 'Uscito Demo', rent: 800 },
      { id: 'c6new', propertyId: 'u6', status: 'active', startDate: MM(-2) + '-01', endDate: MM(10) + '-28', tenantName: 'Nuova Demo', rent: 850 }] };
  const NEW = 'https://www.boomrome.com/guasto?t=u6.NUOVO';
  const set = month => ui => { ui.selected = 'u6'; ui.view = 'simple'; ui.month = month; ui.links = { u6: NEW }; ui.linksBy = {}; if (seats) ui.linksSeat = { u6: 'c6new' };
    ui.contacts.byId.c6old = [{ name: 'Uscito Demo', phone: '+39 000 000 0006' }]; ui.contacts.byId.c6new = [{ name: 'Nuova Demo', phone: '+39 000 000 0016' }]; };
  const past = draw(st, set(MM(-4)), viewSrc).html;
  assert.ok(!past.includes('u6.NUOVO') && !/WhatsApp: Uscito/.test(past), 'mese passato: niente link (né WhatsApp) all’ex inquilino');
  assert.ok(past.includes('Il contratto di questo mese è chiuso'), 'e lo si dice');
  assert.ok(!/data-plz="maint-link"/.test(past), 'niente «Link per l’inquilino» sul contratto chiuso');
  const now = draw(st, set(CUR), viewSrc).html;
  assert.ok(now.includes('u6.NUOVO') && /WhatsApp: Nuova/.test(now), 'mese corrente: il link alla nuova inquilina');
};
ok('guasti: in un mese passato il link della NUOVA inquilina non parte all’ex inquilino (posto dal motore)', () => scenSeat());
ok('…e lo stesso coi posti detti dal server (seats)', () => scenSeat(null, true));
ok('mutazione: il link dell’interno a chiunque sia nel mese — il controllo cade', () => {
  const src = read('palazzo.js');
  const from = 'var live = liveToday(u), url0 = live ? guastoUrlFor(u) : \'\';';
  assert.ok(src.includes(from), 'la riga da mutare esiste');
  assert.throws(() => scenSeat(src.replace(from, "var live = true, url0 = (ui.links && ui.links[u.id]) || '';")), { name: 'AssertionError' });
});

// 3. Il mese coperto dalla rata del mese prima: le schede dicono 2/2, come la frase.
const scenKpi = viewSrc => {
  const c31 = { id: 'c31', propertyId: 'u31', status: 'active', startDate: MM(-11) + '-15', endDate: CUR + '-14', tenantName: 'Ugo Demo', rent: 1000, type: 'studenti' };
  const others = ['u32', 'u33'].map(pid => ({ id: 'c' + pid, propertyId: pid, status: 'active', startDate: MM(-11) + '-01', endDate: MM(5) + '-28', tenantName: 'Inq ' + pid, rent: 750 }));
  const pays = [];
  for (let k = -11; k <= -1; k++) pays.push({ id: 'pay_c31_' + MM(k), contractId: 'c31', propertyId: 'u31', type: 'rent', month: MM(k), coversTo: MM(k), amount: 1000, dueDate: MM(k) + '-15', status: 'paid', paidDate: MM(k) + '-14' });
  for (const c of others) pays.push({ id: 'pay_' + c.id + '_' + CUR, contractId: c.id, propertyId: c.propertyId, type: 'rent', month: CUR, coversTo: CUR, amount: 750, dueDate: CUR + '-01', status: 'paid', paidDate: CUR + '-01' });
  const st = { properties: ['u31', 'u32', 'u33'].map(id => P0(id, { gestioneDal: MM(-11) })), contracts: [c31, ...others], payments: pays };
  const list = draw(st, ui => { ui.view = 'list'; ui.month = CUR; }, viewSrc).html, simple = draw(st, ui => { ui.view = 'simple'; ui.month = CUR; }, viewSrc).html;
  const kpi = /Hanno pagato · [^<]+<\/span><strong>(\d+)<small>\/(\d+)<\/small>/.exec(list);
  assert.deepEqual([kpi[1], kpi[2]], ['2', '2'], 'la scheda in alto: 2/2');
  assert.ok(simple.includes('2 hanno pagato su 2'), 'la frase dice lo stesso');
  for (const html of [list, simple]) {
    assert.ok(/Coperti dalla rata del mese prima <b>1<\/b>/.test(html) && /rata di [a-z]+ \d{4} · pagata il/.test(html), 'il mese coperto ha la sua riga');
    assert.ok(/Hanno pagato <b>2<\/b>/.test(html), 'fra chi ha pagato: due');
    assert.ok(!/importo da verificare/.test(html), 'mai «importo da verificare» sulla rata che c’è');
  }
};
ok('mese coperto dalla rata precedente: «Hanno pagato 2/2» come la frase, la sua riga con l’importo vero', () => scenKpi());
ok('mutazione: la scheda torna a contare t.paid (3/3 sopra «2 su 2») — il controllo cade', () => {
  const src = read('palazzo.js');
  const from = 'var payers = t.payers != null ? t.payers : t.paid + t.late + t.due + t.review + t.unknown, paidN = t.paidPayers != null ? t.paidPayers : t.paid;';
  assert.ok(src.includes(from));
  assert.throws(() => scenKpi(src.replace(from, 'var payers = t.paid + t.late + t.due + t.review + t.unknown, paidN = t.paid;')), { name: 'AssertionError' });
});

// 4. La rata annullata a mano: filtro, scheda e motivo.
const scenWaived = viewSrc => {
  const c = { id: 'c51', propertyId: 'u51', status: 'active', startDate: CUR + '-01', endDate: MM(10) + '-28', tenantName: 'Ada Demo', rent: 1000 };
  const pays = [{ id: 'pay_c51_' + CUR, contractId: 'c51', propertyId: 'u51', type: 'rent', month: CUR, amount: 1000, dueDate: CUR + '-05', status: 'cancelled', cancelledAt: CUR + '-02', cancelledReason: 'mese condonato per il guasto' }];
  const st = { properties: [P0('u51')], contracts: [c], payments: pays };
  const list = draw(st, ui => { ui.view = 'list'; ui.month = CUR; }, viewSrc).html;
  const simple = draw(st, ui => { ui.view = 'simple'; ui.month = CUR; }, viewSrc).html;
  const card = draw(st, ui => { ui.view = 'simple'; ui.month = CUR; ui.selected = 'u51'; }, viewSrc).html;
  assert.ok(/data-f="waived"/.test(list), 'il filtro «Rata annullata» c’è');
  for (const html of [list, simple]) assert.ok(/Rata annullata <b>1<\/b>/.test(html) && html.includes('annullata · mese condonato per il guasto'), 'la scheda del mese');
  assert.ok(card.includes('annullata il ') && card.includes(': non è dovuta'), 'la riga della rata col motivo');
  for (const html of [list, simple, card]) assert.ok(!/Rata non registrata|In verifica da BOOM/.test(html), 'mai «rata non registrata»');
};
ok('rata annullata su un contratto in corso: filtro, scheda e riga col motivo, mai «rata non registrata»', () => scenWaived());
ok('mutazione: senza la chiave del filtro la rata annullata non ha il suo filtro — il controllo cade', () => {
  const src = read('palazzo.js'), from = ", prima: 'before', annullata: 'waived' }[t.key]";
  assert.ok(src.includes(from));
  assert.throws(() => scenWaived(src.replace(from, ", prima: 'before' }[t.key]")), { name: 'AssertionError' });
});
ok('il foglio di stile ha la luce della rata annullata (facciata, cubi, legenda)', () => {
  const css = readFileSync(new URL('../../css/palazzo.css', import.meta.url), 'utf8');
  for (const sel of ['.plz-win[data-state="waived"]', '.plz-unit[data-state="waived"]', '.plz-key[data-state="waived"]', '.plz .plz-s-waived', '.plz-f-waived']) assert.ok(css.includes(sel), sel);
});

// 5. Il segnaposto non offre l'Innesto (che lì non crea il contratto).
const scenPh = viewSrc => {
  const { html } = draw({ properties: [P0('u14')], contracts: [{ id: 'c14', propertyId: 'u14', status: 'active', contractMissing: true, tenantName: 'Gaia Demo' }], payments: [] },
    ui => { ui.view = 'simple'; ui.month = CUR; ui.selected = 'u14'; }, viewSrc, { innesto: () => true, uploadPaperContract: () => true });
  assert.ok(/data-plz="load-contract"/.test(html), 'Carica il contratto c’è');
  assert.ok(!/data-plz="innesto"/.test(html), 'niente «Da un PDF (Innesto)»');
};
ok('segnaposto: «Carica il contratto», mai «Da un PDF (Innesto)» anche con l’Innesto disponibile', () => scenPh());
ok('mutazione: il tasto Innesto rimesso sul segnaposto — il controllo cade', () => {
  const src = read('palazzo.js'), from = "groups.push(['Contratto', b('load-contract', 'Carica il contratto', ' data-id=\"' + esc(u.id) + '\"', true) +";
  assert.ok(src.includes(from));
  assert.throws(() => scenPh(src.replace(from, from + "\n        (A.innesto ? b('innesto', 'Da un PDF (Innesto)', ' data-id=\"' + esc(u.id) + '\"') : '') +")), { name: 'AssertionError' });
});

// 6. Il CSV dell'anno parte dalla gestione BOOM.
const scenCsv = (viewSrc, month) => {
  const gd = MM(-2);
  const c = { id: 'c71', propertyId: 'u71', status: 'active', startDate: MM(-20) + '-01', endDate: MM(10) + '-28', tenantName: 'Ada Uno', rent: 1500, landlordName: 'Esempio Immobiliare S.r.l.' };
  const { UI, W } = draw({ properties: [P0('u71', { gestioneDal: gd })], contracts: [c], payments: [] }, ui => { ui.view = 'simple'; ui.month = month || CUR; }, viewSrc);
  UI._t.exportCsv(true);
  const lines = String(W.__csv || '').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1);
  return { lines, gd };
};
ok('CSV dell’anno: dal primo mese di gestione, mai mesi di righe vuote prima', () => {
  const { lines, gd } = scenCsv();
  const months = lines.map(l => l.split(';')[0]);
  const y = CUR.slice(0, 4), first = gd.slice(0, 4) === y ? gd : y + '-01';
  assert.equal(months[0], first, lines[0]);
  assert.ok(!lines.some(l => /Prima della gestione BOOM/.test(l)) || first === y + '-01', lines.join('\n'));
});
ok('CSV di un anno tutto prima della gestione: UNA riga che lo dice', () => {
  const y0 = String(+CUR.slice(0, 4) - 2);
  const { lines } = scenCsv(null, y0 + '-06');
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.ok(lines[0].startsWith(y0 + ';') && /Prima della gestione BOOM \(da [a-z]+ \d{4}\): nessun mese di \d{4} in archivio/.test(lines[0]), lines[0]);
});
ok('mutazione: il CSV dell’anno torna a partire da gennaio — il controllo cade', () => {
  const src = read('palazzo.js'), from = "var start = gd0 && gd0 > y + '-01' ? gd0 : y + '-01';";
  assert.ok(src.includes(from));
  const y0 = String(+CUR.slice(0, 4) - 2);
  assert.ok(scenCsv(src.replace(from, "var start = y + '-01';"), y0 + '-06').lines.length === 12);
});

// 7. La presa in carico: «Gestione BOOM dal» propone oggi; le scadute dette.
ok('presa in carico: «Gestione BOOM dal» propone il mese di oggi anche in un palazzo gestito da mesi', () => {
  const { UI } = draw({ properties: [P0('u81', { gestioneDal: MM(-4) })], contracts: [], payments: [] }, ui => { ui.view = 'simple'; ui.month = CUR; });
  assert.equal(UI._t.impDefaults(UI._t.last()).from, CUR);
});
ok('presa in carico: interno nuovo con rate già scadute — «interno nuovo» nell’elenco, il rimedio giusto, «gestione BOOM da» per ogni interno', () => {
  const gd = MM(-3);
  const props = [P0('u81', { gestioneDal: gd })];
  const text = 'Interno\tPiano\tInquilino\tCanone\tDal\tAl\n82\t3\tNina Demo\t1300\t' + ('01/' + MM(-6).slice(5, 7) + '/' + MM(-6).slice(0, 4)) + '\t' + ('28/' + MM(6).slice(5, 7) + '/' + MM(6).slice(0, 4));
  const { html } = draw({ properties: props, contracts: [], payments: [] }, ui => {
    ui.view = 'simple'; ui.month = CUR;
    const ctx = E0.context({ properties: props });
    const parsed = E0.parseRentRoll(text);
    ui.imp = { address: 'Viale Prova 3, Roma', ownerId: 'o1', from: gd, text, parsed, plan: E0.planImport(parsed.rows, ctx, { address: 'Viale Prova 3, Roma', ownerId: 'o1', gestioneDal: gd }), applyDiffs: false };
  });
  assert.ok(/interno nuovo/.test(html) && /Interni nuovi: le rate partono da «Gestione BOOM dal»/.test(html), 'il riquadro delle scadute');
  assert.ok(/gestione BOOM da [a-z]+ \d{4}/.test(html), 'gestione per l’interno nuovo');
  assert.ok(/⚠ interno nuovo: le rate partono da/.test(html), 'l’avviso sulla riga');
});
// 8. ASPI su un contratto già registrato: la leva dice «solo attestazione».
const scenAspi = (viewSrc, reg) => {
  const c = { id: 'c91', propertyId: 'u91', status: 'active', startDate: MM(-3) + '-01', endDate: MM(9) + '-28', tenantName: 'Reg Demo', rent: 900, ...reg };
  const { html } = draw({ properties: [P0('u91')], contracts: [c], payments: [] }, ui => { ui.selected = 'u91'; ui.view = 'simple'; ui.month = CUR; }, viewSrc);
  const m = /data-plz="aspi"[^>]*>([^<]+)</.exec(html);
  return m ? m[1] : '';
};
ok('ASPI: su un contratto registrato la leva dice «solo attestazione»; su uno da registrare resta «Invia ad ASPI»', () => {
  assert.equal(scenAspi(null, { rliRegisteredAt: MM(-2) + '-20' }), 'Invia ad ASPI · solo attestazione');
  assert.equal(scenAspi(null, { registrationStatus: 'registered' }), 'Invia ad ASPI · solo attestazione');
  assert.equal(scenAspi(null, {}), 'Invia ad ASPI');
});
ok('mutazione: la leva ASPI che non guarda la registrazione — il controllo cade', () => {
  const src = read('palazzo.js'), from = "b('aspi', registered ? 'Invia ad ASPI · solo attestazione' : 'Invia ad ASPI'";
  assert.ok(src.includes(from));
  assert.notEqual(scenAspi(src.replace(from, "b('aspi', 'Invia ad ASPI'"), { rliRegisteredAt: MM(-2) + '-20' }), 'Invia ad ASPI · solo attestazione');
});
// 9. La segnalazione di bonifico ANNULLATA: barrata e detta annullata, mai attiva.
const scenWd = (viewSrc, pay, role = 'admin') => {
  const base = { id: 'p95', contractId: 'c95', propertyId: 'u95', type: 'rent', month: CUR, amount: 1720, dueDate: CUR + '-01', status: 'pending' };
  const { html } = draw({ profile: { id: role === 'admin' ? 'adm' : 'o1', role }, properties: [P0('u95')], contracts: [{ id: 'c95', propertyId: 'u95', status: 'active', startDate: MM(-2) + '-01', endDate: MM(9) + '-28', tenantName: 'Wanda Demo', rent: 1720 }],
    payments: [{ ...base, ...pay }] }, ui => { ui.selected = 'u95'; ui.view = 'simple'; ui.month = CUR; }, viewSrc);
  const li = (/<li data-pay="p95">([\s\S]*?)<\/li>/.exec(html) || [])[1] || '';
  return unesc(li.replace(/<(?!\/?s>)[^>]+>/g, ' '));
};
const D1 = CUR + '-02', D2 = CUR + '-03';
ok('segnalazione annullata dall’inquilino (una sola): la rata torna da pagare, la segnalazione si vede BARRATA e annullata', () => {
  const t = scenWd(null, { tenantReported: false, tenantReportWithdrawnAt: D2 + 'T10:00:00Z', tenantReportWithdrawn: { at: D2 + 'T10:00:00Z', reports: [{ date: D1, amount: 1720 }] } });
  assert.ok(/<s>bonifico segnalato del [^<]+<\/s> · segnalazione annullata dall’inquilino il /.test(t), t);
  assert.ok(!/Segnalato · da verificare/.test(t), t);
});
ok('due co-intestatari, uno annulla la sua: l’altra resta attiva, quella annullata barrata', () => {
  const t = scenWd(null, { tenantReported: true, tenantReportedAt: D1 + 'T09:00:00Z', tenantReportDate: D1,
    tenantReports: [{ at: D1 + 'T09:00:00Z', date: D1, amount: 860 }],
    tenantReportWithdrawn: { at: D2 + 'T10:00:00Z', reports: [{ at: D1 + 'T09:30:00Z', date: D2, amount: 860 }] } });
  assert.ok(/Segnalato · da verificare/.test(t) && /(^|[^>])bonifico segnalato del /.test(t.replace(/<s>[^<]*<\/s>/g, '')), 'la segnalazione rimasta è attiva: ' + t);
  assert.ok(/<s>bonifico segnalato del [^<]+<\/s> · segnalazione annullata dall’inquilino/.test(t), t);
});
ok('una segnalazione NUOVA dopo l’annullo: la storia superata non si mostra; revocata da BOOM → alla proprietaria «non confermata da BOOM»', () => {
  const t = scenWd(null, { tenantReported: true, tenantReportedAt: CUR + '-05T09:00:00Z', tenantReportDate: CUR + '-05', tenantReports: [{ date: CUR + '-05' }],
    tenantReportWithdrawn: { at: D2 + 'T10:00:00Z', reports: [{ date: D1 }] } });
  assert.ok(!/<s>/.test(t) && !/annullata/.test(t), t);
  const o = scenWd(null, { tenantReported: false, tenantReportWithdrawn: { at: D2 + 'T10:00:00Z', by: 'admin', reason: 'nessun accredito', reports: [{ date: D1 }] } }, 'landlord');
  assert.ok(/segnalazione non confermata da BOOM/.test(o) && !/nessun accredito/.test(o), o);
});
ok('mutazione: la storia dell’annullo ignorata — il controllo cade', () => {
  const src = read('palazzo.js'), from = '    withdrawnLines(p, r, admin).forEach(function (x) { subs.push(x); });\n';
  assert.ok(src.includes(from));
  const t = scenWd(src.replace(from, ''), { tenantReported: false, tenantReportWithdrawn: { at: D2 + 'T10:00:00Z', reports: [{ date: D1 }] } });
  assert.ok(!/annullata dall’inquilino/.test(t));
});
console.log(`\n${n} check — le parole del Palazzo, senza browser.`);
