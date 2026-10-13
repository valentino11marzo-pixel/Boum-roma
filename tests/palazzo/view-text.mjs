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

console.log(`\n${n} check — le parole del Palazzo, senza browser.`);
