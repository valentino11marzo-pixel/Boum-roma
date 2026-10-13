// IL PALAZZO — il mese, gli arretrati, i numeri (filone S2).
// Il motore VERO (js/palazzo-engine.js) su palazzi sintetici costruiti per
// ogni rilievo dell'audit: rate dopo la chiusura, arretrati dei mesi prima,
// occupazione solo sui mesi di BOOM, ultimo mese di un contratto dal 15,
// cambio inquilino nello stesso mese, date in UTC, CSV per il commercialista,
// locatore società, testi per la proprietaria, annuncio su interno abitato,
// disdetta e scadenze, archivio letto in parte. Più /palazzo su Telegram
// (stesso motore) e le MUTAZIONI: rimesso il difetto, il controllo cade.
// Nomi, telefoni ed email inventati. Nessuna rete (Firestore finto in memoria).
// Uso: node tests/palazzo/model.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ENGINE = new URL('../../js/palazzo-engine.js', import.meta.url);
const P = require('../../js/palazzo-engine.js');
const SRC = readFileSync(ENGINE, 'utf8');
const jsRequire = createRequire(ENGINE);

let n = 0;
const ok = (label, cond, info) => { assert.ok(cond, label + (info !== undefined ? ' · ' + JSON.stringify(info) : '')); n++; console.log('✓ ' + label); };
// Confronto per valore (JSON): vale anche per gli oggetti di un motore
// mutante, che vive in un altro realm (prototipi diversi).
const same = (label, a, b) => { assert.equal(JSON.stringify(a), JSON.stringify(b), label); n++; console.log('✓ ' + label); };
const sameQ = (a, b, label) => assert.equal(JSON.stringify(a), JSON.stringify(b), label);

// Il motore con UN difetto rimesso: lo scenario deve cadere.
function mutant(from, to) {
  assert.ok(SRC.includes(from), 'bersaglio della mutazione: ' + from.slice(0, 60));
  const box = { module: { exports: {} }, require: jsRequire, URL, console };
  vm.runInNewContext(SRC.replace(from, to), box);
  return box.module.exports;
}
function bites(label, scenario, from, to) {
  scenario(P);                                   // col motore vero passa…
  const M = mutant(from, to);
  let fell = false;
  try { scenario(M); } catch (_) { fell = true; }
  ok('mutazione: ' + label, fell);               // …col difetto rimesso cade
}

const ADDR = 'Via Esempio 7, Roma';
const prop = (id, extra = {}) => ({ id, address: ADDR, interno: id.replace(/^u/, ''), floor: '2', ownerId: 'o1', name: 'Via Esempio 7 int. ' + id.replace(/^u/, ''), gestioneDal: '2026-10', ...extra });
const monthAdd = (m, k) => P.monthAdd(m, k);
// Rate mensili da `from` per `count` mesi: id del generatore, scadenza il 5.
function rates(cid, pid, from, count, amount, extra = {}) {
  return Array.from({ length: count }, (_, i) => {
    const mm = monthAdd(from, i);
    return { id: 'pay_' + cid + '_' + mm, contractId: cid, propertyId: pid, type: 'rent', amount, month: mm, coversTo: mm, dueDate: mm + '-05', status: 'pending', ...(typeof extra === 'function' ? extra(mm, i) : extra) };
  });
}
const users = [{ id: 'o1', role: 'landlord', name: 'Proprietaria Esempio', email: 'proprietaria@example.invalid' }];
function build(E, state, now) {
  const ctx = E.context({ users, ...state, now: new Date(now) });
  const key = E.buildings(ctx)[0].key;
  return { ctx, model: (mon, opts) => E.model(ctx, key, mon, opts) };
}
const unit = (m, id) => m.units.find(u => u.id === id);
const code = (m, c) => m.issues.find(i => i.code === c);

// ═══ 1. Rilievo 2 — chiuso il contratto, le rate dopo non sono un ritardo ═══
const scenA = E => {
  const pays = rates('c7', 'u7', '2026-10', 12, 1500, (mm) => mm === '2026-10' ? { status: 'paid', paidDate: '2026-10-04' }
    : mm === '2026-12' ? { status: 'paid', paidDate: '2026-12-03' } : mm === '2027-01' ? { status: 'cancelled', cancelledAt: '2026-12-01', cancelledReason: 'contratto chiuso' } : {});
  const c = { id: 'c7', propertyId: 'u7', status: 'terminated', terminatedAt: '2026-11-30', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Ada Esempio', rent: 1500, signatureStatus: 'paper' };
  const S = build(E, { properties: [prop('u7')], contracts: [c], payments: pays }, '2027-02-10T10:00:00Z');
  const m = S.model('2027-02'), u = unit(m, 'u7');
  sameQ([u.month.state, u.month.occupied, u.month.tenants], ['vacant', false, []], 'febbraio: libero, nessun inquilino');
  sameQ([u.arrears.count, u.arrears.amount, u.arrears.oldestMonth], [1, 1500, '2026-11'], 'arretrato: solo novembre');
  const ac = code(m, 'afterClose');
  sameQ([ac.open, ac.paid, ac.paymentIds.includes('pay_c7_2027-02'), ac.paidIds], [8, 1, true, ['pay_c7_2026-12']], 'rate dopo la chiusura');
  sameQ(E.unitMonth(S.ctx, S.ctx.properties[0], '2027-01').state, 'vacant', 'gennaio (rata annullata): libero');
  sameQ(m.brief, ['Febbraio 2027: 0 interni su 1 sono pieni, 1 libero.', 'Ancora da pagare dai mesi precedenti: int. 7 (novembre 2026, €1.500).'], 'la frase');
  return m;
};
{
  const m = scenA(P);
  ok('chiuso il 30/11: a febbraio l’interno è LIBERO, nessun inquilino inventato, e la rata di febbraio non è un ritardo', unit(m, 'u7').month.state === 'vacant');
  ok('gli arretrati restano quelli VERI (novembre, prima della chiusura)', unit(m, 'u7').arrears.amount === 1500);
  const ac = code(m, 'afterClose');
  ok('Da sistemare: 8 rate aperte dopo la chiusura da annullare, 1 pagata da verificare', ac.open === 8 && ac.paid === 1 && ac.count === 9, ac);
  ok('una rata annullata (cancelled) non conta mai: né occupato né ritardo', !m.units[0].month.rows.some(r => r.state === 'cancelled'));
  bites('le rate dopo la chiusura tornano a tenere occupato l’interno e in ritardo', scenA, 'if (cEnd && pStart && pStart > cEnd) {', 'if (false) {');
}

// ═══ 2. Rilievo 3 — chi non ha pagato novembre a dicembre è ancora in ritardo ═══
const contrB = [
  { id: 'cA', propertyId: 'u11', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Bea Esempio', rent: 1600 },
  { id: 'cB', propertyId: 'u12', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Ciro Esempio', rent: 1500 },
  { id: 'cC', propertyId: 'u13', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Dina Esempio', rent: 1550 }];
const paysB = (decPaid) => [
  ...rates('cA', 'u11', '2026-10', 3, 1600, mm => mm === '2026-10' ? { status: 'paid', paidDate: '2026-10-04' } : {}),
  ...rates('cB', 'u12', '2026-10', 3, 1500, mm => mm < '2026-12' || decPaid ? { status: 'paid', paidDate: mm + '-04' } : {}),
  ...rates('cC', 'u13', '2026-10', 3, 1550, mm => mm < '2026-12' || decPaid ? { status: 'paid', paidDate: mm + '-04' } : {})];
const propsB = [prop('u11'), prop('u12'), prop('u13')];
const scenB = E => {
  const S = build(E, { properties: propsB, contracts: contrB, payments: paysB(false) }, '2026-12-03T10:00:00Z');
  const m = S.model('2026-12');
  sameQ(m.debtors.map(d => [d.interno, d.amount, d.count, d.oldestMonth, d.payRow && d.payRow.id]), [['11', 1600, 1, '2026-11', 'pay_cA_2026-11']], 'debitori');
  ok('la frase NON dice «Nessun ritardo» con novembre aperto', !m.brief.includes('Nessun ritardo.') && m.brief.includes('Ancora da pagare dai mesi precedenti: int. 11 (novembre 2026, €1.600).'), m.brief);
  const owner = E.brief(m, { owner: true });
  ok('…né alla proprietaria', !owner.includes('Nessun ritardo.') && owner.some(x => /int\. 11 \(novembre 2026, €1\.600\)/.test(x)), owner);
  return m;
};
{
  const m = scenB(P), u = unit(m, 'u11');
  same('la barra delle rate porta anche la rata scaduta del mese prima', [u.month.rows.map(r => r.month), u.month.pastDue.map(r => r.id)], [['2026-12'], ['pay_cA_2026-11']]);
  same('il ritardo è del contratto della rata', [u.month.lateContractId, u.month.lateTenants, u.month.lateFromPrevious], ['cA', ['Bea Esempio'], false]);
  same('totali dei debitori nel modello', [m.totals.debtors, m.totals.debtorsAmount, m.totals.debtorsOldest, m.debtorsRef], [1, 1600, '2026-11-05', '2026-12-03']);
  same('la puntualità sa che c’è una rata aperta (mai «puntuale» con due mesi aperti)', [u.time.overdueCount, u.time.overdueOldest, u.time.expectedCount], [1, '2026-11-05', 2]);
  bites('«Nessun ritardo» torna anche con novembre aperto', scenB, "if (!lateNow.length && !olderParts.length && (payers > 0 || carriedU.length)) out.push('Nessun ritardo.');", "if (!lateNow.length && (payers > 0 || carriedU.length)) out.push('Nessun ritardo.');");
  // Dopo la scadenza di dicembre: in ritardo questo mese, e il totale dice tutto.
  const S2 = build(P, { properties: propsB, contracts: contrB, payments: paysB(true) }, '2026-12-08T10:00:00Z');
  const d = S2.model('2026-12');
  same('a dicembre scaduto: la cifra del mese nella frase, e novembre dello STESSO interno detto a parte (mai sparito, mai contato due volte)', d.brief.filter(x => /ritardo|Arretrati|Ancora/.test(x)),
    ['1 è in ritardo per €1.600: int. 11.', 'Ancora da pagare dai mesi precedenti: int. 11 (novembre 2026, €1.600).']);
  same('il debitore porta il totale e la rata più vecchia', [d.debtors[0].amount, d.debtors[0].count, d.debtors[0].oldestMonth, d.debtors[0].thisMonth, d.debtors[0].older], [3200, 2, '2026-11', { count: 1, amount: 1600 }, { count: 1, amount: 1600, unknownAmounts: 0, oldestMonth: '2026-11' }]);
  const scenPast = E => {
    const S = build(E, { properties: propsB, contracts: contrB, payments: paysB(true) }, '2026-12-08T10:00:00Z');
    const nov = S.model('2026-11');
    sameQ(nov.debtors.map(x => [x.interno, x.amount]), [['11', 1600]], 'novembre: solo le rate fino a novembre');
  };
  scenPast(P); ok('guardando novembre i debitori sono quelli fino a novembre (dicembre non c’è ancora)', true);
  bites('i debitori di un mese passato contano anche le rate dei mesi dopo', scenPast, 'if (limit && r.month && r.month > limit) return;', '');
}

// ═══ 3. Rilievi 54 + 72 — il cambio inquilino nello stesso mese ═══
const contrC = [
  { id: 'cOld', propertyId: 'u21', status: 'expired', startDate: '2026-10-01', endDate: '2027-09-15', tenantName: 'Ivo Vecchio', rent: 1600 },
  { id: 'cNew', propertyId: 'u21', status: 'active', startDate: '2027-09-16', endDate: '2028-09-15', tenantName: 'Nora Nuova', rent: 1650 }];
const paysC = [
  { id: 'pay_cOld_2027-09', contractId: 'cOld', propertyId: 'u21', type: 'rent', amount: 800, month: '2027-09', coversTo: '2027-09', dueDate: '2027-09-05', status: 'pending', prorated: true },
  { id: 'pay_cNew_2027-09', contractId: 'cNew', propertyId: 'u21', type: 'rent', amount: 1650, month: '2027-09', coversTo: '2027-09', dueDate: '2027-09-16', status: 'paid', paidDate: '2027-09-16' }];
const scenC = E => {
  const S = build(E, { properties: [prop('u21')], contracts: contrC, payments: paysC }, '2027-09-20T10:00:00Z');
  const m = S.model('2027-09'), um = unit(m, 'u21').month;
  sameQ([um.state, um.tenants, um.contractId], ['late', ['Nora Nuova'], 'cNew'], 'chi abita oggi');
  sameQ([um.lateContractId, um.lateTenants, um.lateFromPrevious], ['cOld', ['Ivo Vecchio'], true], 'di chi è il ritardo');
  sameQ([m.debtors[0].tenants, m.debtors[0].contractId, m.debtors[0].previousContract], [['Ivo Vecchio'], 'cOld', true], 'il debitore');
  ok('nessuna falsa sovrapposizione', !code(m, 'overlap'), m.issues.map(i => i.code));
  return m;
};
{
  const m = scenC(P);
  ok('cambio inquilino al 16: il ritardo del vecchio resta del vecchio (nome e contratto della RATA)', m.debtors[0].tenants[0] === 'Ivo Vecchio');
  const C = x => P.CSV_HEAD.indexOf(x);
  const rows = P.csvRows(m).filter(r => r[1] === '21');
  same('CSV: una riga per contratto, il debito sul vecchio e il pagato sul nuovo', rows.map(r => [r[C('Inquilino')], r[C('Dovuto nel mese')], r[C('Stato')]]),
    [['Ivo Vecchio', '800,00', 'Non ha pagato'], ['Nora Nuova', '1650,00', 'Pagato']]);
  bites('il sollecito torna a puntare al conduttore di oggi', scenC, "lateContractId: lateRow ? lateRow.contractId : ''", 'lateContractId: contractId');
  bites('la sovrapposizione torna a contarsi per MESE', scenC, "return sb <= (ea || '9999-12-31') && sa <= (eb || '9999-12-31');", 'return true;');
  const real = build(P, { properties: [prop('u21')], contracts: [...contrC, { id: 'cX', propertyId: 'u21', status: 'active', startDate: '2027-09-01', endDate: '2028-08-31', tenantName: 'Zeno Doppio', rent: 900 }], payments: paysC }, '2027-09-20T10:00:00Z');
  ok('una sovrapposizione VERA di giorni resta in Da sistemare', !!code(real.model('2027-09'), 'overlap'));
}

// ═══ 4. Rilievo 53 — l'ultimo mese di un contratto dal 15 ═══
const contrD = [{ id: 'cM', propertyId: 'u31', status: 'active', startDate: '2026-09-15', endDate: '2027-08-14', tenantName: 'Ugo Esempio', rent: 1000, type: 'studenti' }];
const lease15 = (withPeriod) => rates('cM', 'u31', '2026-09', 11, 1000, (mm, i) => ({ status: 'paid', paidDate: mm + '-14', dueDate: mm + '-15',
  ...(withPeriod ? { periodFrom: mm + '-15', periodTo: monthAdd(mm, 1) + '-14' } : {}) }));
const scenD = E => {
  for (const withPeriod of [true, false]) {
    const S = build(E, { properties: [prop('u31', { gestioneDal: '2026-09' })], contracts: contrD, payments: lease15(withPeriod) }, '2027-08-10T10:00:00Z');
    const m = S.model('2027-08'), um = unit(m, 'u31').month;
    sameQ([um.state, um.carried, um.expected, !!code(m, 'norate')], ['paid', true, 0, false], 'agosto ' + (withPeriod ? 'con periodTo' : 'periodo ricavato'));
    sameQ(S.model('2027-09').units[0].month.state, 'vacant', 'settembre libero');
  }
};
{
  scenD(P);
  ok('dal 15/09 al 14/08: agosto è coperto dalla rata di luglio (mai «rata non registrata»), con o senza periodTo scritto', true);
  const S = build(P, { properties: [prop('u31', { gestioneDal: '2026-09' })], contracts: contrD, payments: lease15(false) }, '2027-08-10T10:00:00Z');
  const m = S.model('2027-08'), C = x => P.CSV_HEAD.indexOf(x), row = P.csvRows(m)[0];
  same('CSV di agosto: coperto dalla rata di luglio, nessun importo contato due volte', [row[C('Dovuto nel mese')], row[C('Stato')]], ['', 'Pagato · coperto dalla rata di luglio 2027']);
  same('il periodo ricavato dal giorno di decorrenza', [m.units[0].month.rows[0].periodFrom, m.units[0].month.rows[0].periodTo, m.units[0].month.rows[0].periodDerived], ['2027-07-15', '2027-08-14', true]);
  ok('alla proprietaria nessun pagamento «in verifica» inventato', !P.brief(m, { owner: true }).some(x => /in verifica/.test(x)), P.brief(m, { owner: true }));
  bites('agosto torna «rata non registrata»', scenD, 'if (!monthRows.length && lease) {\n      var cr = carriedRows(rows, month)', 'if (false) {\n      var cr = carriedRows(rows, month)');
}

// ═══ 5. Rilievo 6 — occupazione solo sui mesi di BOOM, segnaposto = non noto ═══
const propsE = ['u41', 'u42', 'u43', 'u44', 'u45'].map(id => prop(id));
const contrE = [
  { id: 'c41', propertyId: 'u41', status: 'active', startDate: '2026-09-15', endDate: '2027-08-14', tenantName: 'Eva Uno', rent: 1500, signatureStatus: 'paper', source: 'palazzo-import' },
  { id: 'c42', propertyId: 'u42', status: 'active', startDate: '2026-10-01', endDate: '2027-09-15', tenantName: 'Fabio Due', rent: 1600, signatureStatus: 'paper', source: 'palazzo-import' },
  { id: 'c43', propertyId: 'u43', status: 'active', startDate: '2025-10-20', endDate: '2027-09-19', tenantName: 'Gina Tre', rent: 1550, signatureStatus: 'paper', source: 'palazzo-import' },
  { id: 'c44', propertyId: 'u44', status: 'active', contractMissing: true, tenantName: 'Hugo Quattro', source: 'palazzo-import' },
  { id: 'c45', propertyId: 'u45', status: 'active', contractMissing: true, tenantName: 'Iris Cinque', source: 'palazzo-import' }];
const paysE = [...rates('c41', 'u41', '2026-10', 10, 1500), ...rates('c42', 'u42', '2026-10', 12, 1600), ...rates('c43', 'u43', '2026-10', 12, 1550)];
const scenE = E => {
  const day1 = build(E, { properties: propsE, contracts: contrE, payments: paysE }, '2026-10-12T10:00:00Z').model('2026-10');
  const A = day1.analytics;
  sameQ([A.occupancy12, A.vacantMonths, A.occupancyMonths, A.occupancyMinMonths], [null, 0, 1, 3], 'il primo giorno: nessuna percentuale, zero sfitto inventato');
  sameQ([unit(day1, 'u43').time.windowMonths, unit(day1, 'u43').time.occupiedMonths, unit(day1, 'u43').time.since], [1, 1, '2026-10'], 'contratto del 2025: misurato da ottobre 2026');
  sameQ([unit(day1, 'u44').time.unknownMonths, unit(day1, 'u44').time.occupiedMonths, unit(day1, 'u44').time.measuredMonths], [1, 0, 0], 'segnaposto: non noto, mai pieno');
  const later = build(E, { properties: propsE, contracts: contrE, payments: paysE }, '2027-01-20T10:00:00Z').model('2027-01').analytics;
  sameQ([later.occupancy12, later.vacantMonths, later.occupancyMonths, later.occupancyUnknown, later.occupancySince], [100, 0, 4, 8, '2026-10'], 'dopo quattro mesi');
};
{
  scenE(P);
  ok('palazzo preso in carico oggi: niente «48% · 31 mesi di sfitto», l’occupazione non c’è finché non c’è un campione', true);
  ok('dopo quattro mesi: 100% sui mesi di BOOM, i due segnaposto dichiarati come non noti (8 mesi-interno)', true);
  const fut = build(P, { properties: propsE, contracts: contrE, payments: paysE }, '2026-10-12T10:00:00Z').model('2027-06');
  same('scegliendo un mese futuro la finestra resta su oggi (12 mesi FINO A OGGI)', [unit(fut, 'u41').time.to, fut.analytics.months[11].month, fut.series[11].month], ['2026-10', '2026-10', '2027-06']);
  bites('i mesi prima di BOOM tornano nella misura', scenE, 'var start = gd && gd > from ? gd : from;', 'var start = from;');
  bites('il segnaposto torna «occupato 12 su 12»', scenE, 'if (um.placeholder) { unknown++; continue; }', '');
}

// ═══ 6. Rilievo 73 — le date con l'ora sono istanti, letti a Roma ═══
const scenF = E => {
  sameQ([E.day('2026-11-05T23:30:00.000Z'), E.day('2026-12-31T23:30:00Z'), E.day('2026-06-30T22:30:00+00:00'), E.day('2026-11-05'), E.day('2026-11-05T10:00')],
    ['2026-11-06', '2027-01-01', '2026-07-01', '2026-11-05', '2026-11-05'], 'day()');
  sameQ([E.paidDayOf({ paidAt: '2026-11-05T23:30:00.000Z', paidDate: '2026-11-05' }), E.paidDayOf({ paidAt: '2026-11-10T09:00:00Z', paidDate: '2026-11-07' }), E.paidDayOf({ paidDate: '2026-11-05T23:30:00.000Z' })],
    ['2026-11-06', '2026-11-07', '2026-11-06'], 'paidDayOf');
  const S = build(E, { properties: [prop('u7')], contracts: [{ id: 'c7', propertyId: 'u7', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Tea Esempio', rent: 1500 }],
    payments: [{ id: 'pay_c7_2026-11', contractId: 'c7', propertyId: 'u7', type: 'rent', amount: 1500, month: '2026-11', coversTo: '2026-11', dueDate: '2026-11-05', status: 'paid', paidDate: '2026-11-05T23:30:00.000Z' }] }, '2026-11-12T10:00:00Z');
  const t = S.model('2026-11').units[0].time;
  sameQ([t.avgDelay, t.onTime], [1, 0], 'puntualità a Roma');
};
{
  scenF(P);
  ok('«Registra incasso» alle 00:30 del 6/11 a Roma è del 6, non del 5 (e non è puntuale); il 31/12 alle 23:30 UTC è già il nuovo anno', true);
  ok('una data di accredito dichiarata vince sull’istante della registrazione; quella ricavata da paidAt (Stripe) no', true);
  bites('day() torna a tagliare i primi dieci caratteri in UTC', scenF, 'if (INSTANT_RE.test(s0)) {', 'if (false) {');
}

// ═══ 7. Rilievi 18, 20, 33 — il foglio per il commercialista e le righe rata ═══
{
  const props = [prop('u7', { floor: '1' }), prop('u8', { floor: '1' }), prop('u9', { floor: '1' }), prop('u14', { floor: '1' })];
  const contracts = [
    { id: 'c7', propertyId: 'u7', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Ada Esempio', rent: 1500, oneriQuota: 120, type: 'studenti',
      landlordName: 'Esempio Immobili S.r.l.', cedolareSecca: 'no', signatureStatus: 'paper', source: 'palazzo-import' },
    { id: 'c8', propertyId: 'u8', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: '=HYPERLINK("x")', rent: 1000, landlordName: 'Mario Esempio' },
    { id: 'c9', propertyId: 'u9', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Bruno Esempio', rent: 1500, oneriQuota: 120, signatureStatus: 'complete' },
    { id: 'c14', propertyId: 'u14', status: 'active', contractMissing: true, tenantName: 'Gaia Esempio', source: 'palazzo-import' }];
  const payments = [
    { id: 'pay_c7_2026-10', contractId: 'c7', propertyId: 'u7', type: 'rent', amount: 1620, rentAmount: 1500, oneriAmount: 120, month: '2026-10', dueDate: '2026-10-05', status: 'paid',
      paidDate: '2026-10-08', paidVia: 'bonifico', paidEvidence: 'estratto-conto-locatore', receiptUrl: 'https://example.invalid/ricevuta-7.pdf' },
    { id: 'pay_c8_2026-10', contractId: 'c8', propertyId: 'u8', type: 'rent', amount: 1000, month: '2026-10', dueDate: '2026-10-05', status: 'paid', paidDate: '2026-10-03',
      paidVia: 'dichiarato', paidSource: 'tabella della proprietaria', receiptUrl: 'http://example.invalid/insicura.pdf' },
    // Totale che non torna con canone + oneri del contratto: non si divide a occhio.
    { id: 'pay_c9_2026-10', contractId: 'c9', propertyId: 'u9', type: 'rent', amount: 1700, month: '2026-10', dueDate: '2026-10-05', status: 'paid',
      paidAt: '2026-10-04T22:30:00.000Z', paidDate: '2026-10-04', paidVia: 'stripe' }];
  const S = build(P, { properties: props, contracts, payments }, '2026-10-20T10:00:00Z');
  const m = S.model('2026-10'), C = x => P.CSV_HEAD.indexOf(x);
  ok('le colonne nuove: Locatore, Oneri mensili, canone e oneri incassati separati, Modalità, Fonte prova', ['Locatore', 'Oneri mensili', 'Incassato canone', 'Incassato oneri', 'Modalità', 'Fonte prova'].every(x => C(x) > 0));
  const rows = P.csvRows(m), by = Object.fromEntries(rows.map(r => [r[1], r]));
  const pick = (r, cols) => cols.map(x => r[C(x)]);
  same('int. 7: canone e oneri in colonne separate (gli oneri non sono reddito), bonifico al locatore visto sul suo estratto conto',
    pick(by['7'], ['Locatore', 'Contratto', 'Canone mensile', 'Oneri mensili', 'Dovuto nel mese', 'Incassato canone', 'Incassato oneri', 'Incassato nel mese', 'Modalità', 'Fonte prova', 'Stato']),
    ['Esempio Immobili S.r.l.', 'Studenti universitari', '1500,00', '120,00', '1620,00', '1500,00', '120,00', '1620,00', 'Bonifico al locatore', 'Estratto conto del locatore', 'Pagato']);
  same('int. 8: pagato dichiarato dalla tabella della proprietaria (lo si dice), senza oneri la colonna resta vuota', pick(by['8'], ['Incassato oneri', 'Modalità', 'Fonte prova']), ['', 'Dichiarato dalla proprietaria', 'Tabella della proprietaria']);
  same('int. 9: un totale che non si divide resta intero, canone e oneri VUOTI (mai una cifra a occhio); la carta passa da Stripe; il giorno è quello di Roma',
    pick(by['9'], ['Incassato canone', 'Incassato oneri', 'Incassato nel mese', 'Modalità', 'Fonte prova', 'Pagato il']), ['', '', '1700,00', 'Carta (via BOOM)', 'Stripe', '05/10/2026']);
  same('int. 14 (contratto non in archivio): parole, non zeri', pick(by['14'], ['Contratto', 'Registrazione', 'Canone mensile', 'Dovuto nel mese', 'Incassato nel mese', 'Stato']),
    ['Contratto da caricare', '', '', '', '', 'Contratto da caricare']);
  const own = Object.fromEntries(P.csvRows(m, { owner: true }).map(r => [r[1], r]));
  same('…e alla proprietaria «Contratto in arrivo da BOOM» (mai «In verifica» su un contratto che non c’è)', pick(own['14'], ['Contratto', 'Registrazione', 'Stato']), ['Contratto in arrivo da BOOM', '', 'Contratto in arrivo da BOOM']);
  const csv = P.toCsv(rows);
  ok('toCsv: un nome che sembra una formula resta testo', csv.includes(';"\'=HYPERLINK(""x"")";') || csv.includes(";'=HYPERLINK"), csv.slice(0, 400));
  const r7 = unit(m, 'u7').month.rows[0], r8 = unit(m, 'u8').month.rows[0];
  same('le righe rata espongono ricevuta (solo https), modalità e prova', [r7.receiptUrl, r7.paidVia, r7.paidEvidence, r8.receiptUrl, r7.rentPart, r7.oneriPart],
    ['https://example.invalid/ricevuta-7.pdf', 'bonifico', 'estratto-conto-locatore', '', 1500, 120]);
  same('e il mese separa canone e oneri (null se non si divide)', [unit(m, 'u7').month.collectedRent, unit(m, 'u7').month.collectedOneri, unit(m, 'u9').month.collectedRent], [1500, 120, null]);
  same('gli oneri dell’anno per il conguaglio: solo le quote certe, le altre contate a parte', [unit(m, 'u7').oneri, unit(m, 'u9').oneri],
    [{ year: '2026', collected: 120, expected: 120, rows: 1, unknown: 0 }, { year: '2026', collected: 0, expected: 0, rows: 0, unknown: 1 }]);
  ok('un contratto non in archivio non ha registrazione né cedolare da raccontare', unit(m, 'u14').paper === null && unit(m, 'u7').paper.cedolare === false);
  same('rilievo 33: il locatore del contratto e se è una società', [unit(m, 'u7').landlordName, unit(m, 'u7').landlordIsCompany, unit(m, 'u8').landlordIsCompany], ['Esempio Immobili S.r.l.', true, false]);
  same('isCompanyName: forma giuridica o sigla puntata, mai un nome di persona',
    ['ROSSI SRL', 'Esempio Immobiliare', 'Società Agricola Esempio', 'A.B.C.D.', 'Esempio S.p.A.', 'Mario Rossi', 'J.R. Tolkien', 'Sa Mario', ''].map(P.isCompanyName),
    [true, true, true, true, true, false, false, false, false]);
  // Rilievo 8: che contratto è (carta, segnaposto, digitale), e nessuna
  // voce «da firmare» nel Palazzo.
  same('rilievo 8: contractKind per interno', ['u7', 'u8', 'u9', 'u14'].map(id => unit(m, id).contractKind), ['paper', 'digital', 'digital', 'placeholder']);
  ok('…e nessuna voce di Da sistemare chiede una firma', !m.issues.some(i => /sign|firm/i.test(i.code)), m.issues.map(i => i.code));
}

// ═══ 8. Rilievi 34, 49, 50, 70 — le parole per la proprietaria ═══
{
  const props = ['u1', 'u2', 'u3'].map(id => prop(id));
  const contracts = props.map((p, i) => ({ id: 'c' + (i + 1), propertyId: p.id, status: 'active', startDate: '2025-09-01', endDate: '2027-08-31', tenantName: 'Inq ' + (i + 1), rent: 1000 }));
  const S = build(P, { properties: props, contracts, payments: [] }, '2026-10-12T10:00:00Z');
  const sep = S.model('2026-09');
  same('un mese tutto prima di BOOM: allBefore, nessun «pieno»', [sep.allBefore, sep.beforeCount, sep.totals.managed, sep.totals.occupied], [true, 3, 0, 0]);
  same('…e la frase lo dice in una riga sola, a lei come all’operatore', P.brief(sep, { owner: true }),
    ['Settembre 2026: prima della gestione BOOM (che parte da ottobre 2026): pagamenti e occupazione di questo mese non sono in archivio.']);
  const mixed = build(P, { properties: [prop('u1', { gestioneDal: '2026-09' }), prop('u2'), prop('u3')], contracts, payments: [] }, '2026-10-12T10:00:00Z').model('2026-09');
  same('un mese misto: «su N gestiti da BOOM», e chi era prima lo dice', [mixed.allBefore, mixed.brief[0], mixed.brief.some(x => /2 interni erano prima della gestione BOOM/.test(x))],
    [false, 'Settembre 2026: 1 interno su 1 gestito da BOOM è pieno.', true]);
  const one = build(P, { properties: [prop('u5', { address: 'Via Sola 1' })], contracts: [{ id: 'c5', propertyId: 'u5', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Lia', rent: 1500.5 }],
    payments: [{ id: 'pay_c5_2026-10', contractId: 'c5', propertyId: 'u5', type: 'rent', amount: 1500.5, month: '2026-10', dueDate: '2026-10-05', status: 'paid', paidDate: '2026-10-04' }] }, '2026-10-12T10:00:00Z').model('2026-10');
  same('singolare e centesimi: «1 interno su 1 è pieno», «€1.500,50» come nella scheda', one.brief.slice(0, 2), ['Ottobre 2026: 1 interno su 1 è pieno.', '1 ha pagato su 1 (€1.500,50 di €1.500,50).']);
  const zero = build(P, { properties: [prop('u6', { address: 'Via Sola 2' })], contracts: [{ id: 'c6', propertyId: 'u6', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Mia', rent: 1500 }],
    payments: [{ id: 'pay_c6_2026-10', contractId: 'c6', propertyId: 'u6', type: 'rent', amount: 'mille', month: '2026-10', dueDate: '2026-10-05', status: 'pending' }] }, '2026-10-12T10:00:00Z').model('2026-10');
  ok('un importo illeggibile non diventa mai «in ritardo per €0»', zero.brief.includes('1 è in ritardo per un importo da verificare: int. 6.') && !zero.brief.some(x => /€0\b/.test(x)), zero.brief);
  same('rilievo 50: prima di «Invia a lei», ciò che il disegno non sa è in Da sistemare', code(S.model('2026-10'), 'lookMissing').missing, ['ultimoPiano', 'intonaco', 'persiane']);
  const dressed = build(P, { properties: [prop('u1', { ultimoPiano: 5, palazzoIntonaco: 'rosachiaro', palazzoPersiane: 'verdegrigio' }), prop('u2'), prop('u3')], contracts, payments: [] }, '2026-10-12T10:00:00Z').model('2026-10');
  ok('…e dichiarato l’aspetto la voce sparisce', !code(dressed, 'lookMissing'));
}

// ═══ 9. Lacuna 9 — disdetta, rinnovo tacito, scaduti senza chiusura ═══
{
  const NOW9 = '2027-05-01T10:00:00Z';
  const props = ['u51', 'u52', 'u53', 'u54', 'u55', 'u56', 'u57', 'u58', 'u59'].map(id => prop(id, { gestioneDal: '2024-08' }));
  const c = (id, pid, start, end, extra = {}) => ({ id, propertyId: pid, status: 'active', startDate: start, endDate: end, tenantName: 'T ' + id, rent: 1000, ...extra });
  const contracts = [
    c('c51', 'u51', '2026-09-15', '2027-08-14', { type: 'studenti' }),
    c('c52', 'u52', '2026-07-01', '2027-06-30', { type: 'transitorio' }),
    c('c53', 'u53', '2026-08-01', '2027-07-31'),
    c('c54', 'u54', '2024-11-01', '2027-10-31', { type: '3+2' }),
    c('c55', 'u55', '2026-08-01', '2027-07-31', { type: 'studenti', disdettaAt: '2027-04-20' }),
    c('c56', 'u56', '2026-08-01', '2027-07-31', { type: 'studenti' }), c('c56b', 'u56', '2027-08-01', '2028-07-31', { type: 'studenti', status: 'pending' }),
    c('c57', 'u57', '2025-09-01', '2027-04-10', { type: 'studenti', status: 'expired' }),
    c('c58', 'u58', '2026-04-16', '2027-04-15'),
    c('c59', 'u59', '2025-09-01', '2027-04-10', { type: 'studenti', status: 'expired', terminatedAt: '2027-04-10' })];
  const S = build(P, { properties: props, contracts, payments: [] }, NOW9);
  const m = S.model('2027-05');
  const nd = code(m, 'noticeDue'), items = Object.fromEntries(nd.items.map(x => [x.unitId, x]));
  same('in finestra: studenti, tipo non indicato, 3+2 (mai il transitorio, chi ha già disdetto, chi ha già il contratto dopo)', Object.keys(items).sort(), ['u51', 'u53', 'u54']);
  same('studenti: entro tre mesi prima della fine, poi si rinnova da solo (dal modello)', [items.u51.by, items.u51.months, items.u51.renews, items.u51.source, items.u51.passed, items.u51.daysToBy], ['2027-05-14', 3, 'tacito', 'modello', false, 13]);
  same('tipo non indicato: tre mesi IPOTIZZATI e dichiarati', [items.u53.by, items.u53.assumed, items.u53.passed, items.u53.source], ['2027-04-30', true, true, 'ipotesi']);
  same('3+2: sei mesi, proroga biennale', [items.u54.by, items.u54.months, items.u54.renews], ['2027-04-30', 6, 'proroga']);
  ok('transitorio: cessa senza disdetta (la regola è scritta sull’interno)', unit(m, 'u52').notice.months === 0 && /cessa alla scadenza senza bisogno di disdetta/.test(unit(m, 'u52').notice.rule));
  ok('la disdetta ricevuta si legge (disdettaAt)', unit(m, 'u55').notice.received === '2027-04-20');
  const ex = code(m, 'expiredStillIn');
  same('scaduto e mai chiuso (studenti: forse rinnovato tacitamente) — non quello chiuso per iscritto', ex.contracts.map(x => [x.id, x.renews]), [['c57', 'tacito']]);
  same('l’«attivo ma scaduto» porta la stessa informazione', code(m, 'staleActive').items.map(x => [x.id, x.renews]), [['c58', '']]);
  ok('per le date l’interno resta libero: il motore non decide, lo dice', unit(m, 'u57').month.state === 'vacant');
}

// ═══ 10. Lacuna 8 — annuncio pubblicato su un interno abitato ═══
{
  const props = [prop('u61', { listingId: 'l61' }), prop('u62', { listingId: 'l62' }), prop('u63', { listingId: 'l63' }), prop('u64', { listingId: 'l64' })];
  const contracts = ['u61', 'u62', 'u63'].map(id => ({ id: 'c' + id, propertyId: id, status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'X ' + id, rent: 1000 }));
  const listings = [{ id: 'l61', status: 'available' }, { id: 'l62', status: 'waitlist', availableFrom: '2027-10-01' }, { id: 'l63', status: 'waitlist', availableFrom: '2027-08-01' }, { id: 'l64', status: 'available' }];
  const m = build(P, { properties: props, contracts, payments: [], listings }, '2027-05-01T10:00:00Z').model('2027-05');
  const ll = code(m, 'listingLive');
  same('pubblicato «libero ora» su una casa abitata, o con una data prima della fine: in Da sistemare; il pre-blocco vero no; il libero no',
    ll.items.map(x => [x.unitId, x.why]), [['u61', 'now'], ['u63', 'early']]);
}

// ═══ 11. Lacuna 1 — archivio letto in parte ═══
{
  const props = ['u1', 'u2', 'u3'].map(id => prop(id));
  const S = build(P, { properties: props, contracts: [], payments: [] }, '2026-10-12T10:00:00Z');
  const m = S.model('2026-10', { partial: ['rate'] });
  same('il modello dichiara il troncamento', [m.partial, code(m, 'partial').collections], [['rate'], ['rate']]);
  ok('la frase lo dice all’operatore…', m.brief.at(-1) === 'Archivio letto in parte (rate): i numeri possono essere incompleti.', m.brief);
  ok('…e alla proprietaria con parole sue', P.brief(m, { owner: true }).at(-1) === 'Alcuni dati sono ancora in arrivo: i numeri di questo riepilogo potrebbero essere incompleti.');
  ok('senza tetto nessun avviso', !S.model('2026-10').partial && !code(S.model('2026-10'), 'partial'));
}

// ═══ 11b. Mutazioni sul foglio, sulla disdetta e sull'annuncio ═══
{
  const scenCsv = E => {
    const S = build(E, { properties: [prop('u7'), prop('u14')], contracts: [
      { id: 'c7', propertyId: 'u7', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Ada Esempio', rent: 1500, oneriQuota: 120 },
      { id: 'c14', propertyId: 'u14', status: 'active', contractMissing: true, tenantName: 'Gaia Esempio' }],
    payments: [{ id: 'pay_c7_2026-10', contractId: 'c7', propertyId: 'u7', type: 'rent', amount: 1620, rentAmount: 1500, oneriAmount: 120, month: '2026-10', dueDate: '2026-10-05', status: 'paid', paidDate: '2026-10-04' }] }, '2026-10-20T10:00:00Z');
    const m = S.model('2026-10'), C = x => E.CSV_HEAD.indexOf(x), by = Object.fromEntries(E.csvRows(m).map(r => [r[1], r]));
    sameQ([by['7'][C('Incassato canone')], by['7'][C('Incassato oneri')], by['14'][C('Stato')], by['14'][C('Dovuto nel mese')]], ['1500,00', '120,00', 'Contratto da caricare', ''], 'foglio');
  };
  bites('il canone incassato torna a comprendere gli oneri', scenCsv, 'return r.rentPart; })) :', 'return r.amount; })) :');
  bites('il contratto da caricare torna «Senza rata» nel foglio', scenCsv, "if (lease && CS.isPlaceholder(lease) && st === 'norate') return owner ? 'Contratto in arrivo da BOOM' : 'Contratto da caricare';", '');
  const scenNotice = E => {
    const S = build(E, { properties: [prop('u51', { gestioneDal: '2024-08' })], contracts: [{ id: 'c51', propertyId: 'u51', status: 'active', startDate: '2026-09-15', endDate: '2027-08-14', tenantName: 'T51', rent: 1000, type: 'studenti' }], payments: [] }, '2027-05-01T10:00:00Z');
    const nd = code(S.model('2027-05'), 'noticeDue');
    sameQ(nd && nd.items[0].by, '2027-05-14', 'disdetta');
  };
  bites('la data limite della disdetta sparisce', scenNotice, 'var by = N.months && !terminated ? leaseMonth(end, -N.months) : \'\';', 'var by = \'\';');
  const scenListing = E => {
    const S = build(E, { properties: [prop('u62', { listingId: 'l62' })], contracts: [{ id: 'c62', propertyId: 'u62', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'T62', rent: 1000 }],
      payments: [], listings: [{ id: 'l62', status: 'waitlist', availableFrom: '2027-10-01' }] }, '2027-05-01T10:00:00Z');
    sameQ(!!code(S.model('2027-05'), 'listingLive'), false, 'pre-blocco vero');
  };
  bites('il pre-blocco vero (data dopo la fine del contratto) diventa un falso allarme', scenListing, 'if (lFrom && end && lFrom > end) return;', '');
}

// ═══ 12. /palazzo su Telegram — lo stesso motore ═══
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
const TG = await import('../../api/telegram/_palazzo.js');
{
  const mA = scenA(P), mC = scenC(P);
  const sA = TG.palazzoSummary(mA), sC = TG.palazzoSummary(mC);
  ok('Telegram: chi non ha pagato dai mesi precedenti c’è (novembre, a febbraio)', /🔴 <b>Non hanno pagato<\/b>\n• int\. 7 · Ada Esempio · €1\.500 · \d+ giorni/.test(sA), sA);
  ok('Telegram: le rate dopo la chiusura da annullare', sA.includes('🧾 <b>Rate dopo la chiusura del contratto</b>: 8 rate da annullare (int. 7)'), sA);
  ok('Telegram: il debito del vecchio inquilino col SUO nome, mai quello del nuovo', /• int\. 21 · Ivo Vecchio · €800 · \d+ giorni · contratto precedente/.test(sC) && !/Non hanno pagato<\/b>\n[^\n]*Nora Nuova/.test(sC), sC);
  const props = ['u51', 'u57'].map(id => prop(id, { gestioneDal: '2024-08' }));
  const m9 = build(P, { properties: props, contracts: [
    { id: 'c51', propertyId: 'u51', status: 'active', startDate: '2026-09-15', endDate: '2027-08-14', tenantName: 'T51', rent: 1000, type: 'studenti' },
    { id: 'c57', propertyId: 'u57', status: 'expired', startDate: '2025-09-01', endDate: '2027-04-10', tenantName: 'T57', rent: 1000, type: 'studenti' }], payments: [] }, '2027-05-01T10:00:00Z').model('2027-05');
  const s9 = TG.palazzoSummary(m9);
  ok('Telegram: la disdetta con la data e cosa succede senza', s9.includes('📅 <b>Disdetta</b>\n• int. 51 · entro il 14/05/2027 · scade il 14/08/2027 · senza disdetta si rinnova per uguale periodo'), s9);
  ok('Telegram: lo scaduto senza chiusura, con la domanda del SUO modello', s9.includes('⚠️ <b>Scaduti senza chiusura</b> (l’inquilino è ancora dentro?)\n• int. 57 · scaduto il 10/04/2027 · studenti: senza disdetta si è rinnovato da solo?'), s9);
  ok('Telegram: mai un recapito', !/\+39|@/.test(sA + sC + s9));
}
{
  // Il modulo VERO su un Firestore finto: le rate del palazzo superano il
  // tetto della lettura → il messaggio dice che l'archivio è letto in parte.
  const props = ['u71', 'u72', 'u73'].map(id => prop(id));
  const store = { properties: props, contracts: [{ id: 'c71', propertyId: 'u71', status: 'active', startDate: '2026-10-01', endDate: '2027-09-30', tenantName: 'Ola', rent: 900 }],
    payments: Array.from({ length: 1500 }, (_, i) => ({ id: 'p' + i, propertyId: 'u71', contractId: 'c71', type: 'deposit-balance', amount: 1, status: 'paid', dueDate: '2026-10-05' })) };
  const toFs = v => v === null || v === undefined ? { nullValue: null } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
  const fromFs = v => v.stringValue !== undefined ? v.stringValue : v.arrayValue ? (v.arrayValue.values || []).map(fromFs) : null;
  const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url.includes('identitytoolkit') || url.includes('securetoken')) return json({ idToken: 't', localId: 't', expiresIn: '3600' });
    if (url.includes(':batchGet')) return json(JSON.parse(opts.body).documents.map(d => ({ missing: d })));
    if (url.endsWith(':runQuery')) {
      const q = JSON.parse(opts.body).structuredQuery, coll = q.from[0].collectionId, ff = q.where && q.where.fieldFilter;
      let docs = (store[coll] || []).slice();
      if (ff) { const want = fromFs(ff.value), f = ff.field.fieldPath; docs = docs.filter(d => ff.op === 'IN' ? want.includes(d[f]) : d[f] === want); }
      docs = docs.slice(0, q.limit || 50);
      return json(docs.map(d => { const { id, ...rest } = d; const fields = {}; for (const [k, v] of Object.entries(rest)) fields[k] = toFs(v); return { document: { name: 'projects/test-proj/databases/(default)/documents/' + coll + '/' + id, fields } }; }));
    }
    throw new Error('rete inattesa: ' + url);
  };
  const { msg } = await TG.palazzoMessage('', { now: new Date('2026-10-12T10:00:00Z') });
  ok('Telegram: una lettura che tocca il tetto lo DICE (archivio letto in parte), mai un palazzo «in regola» su dati mancanti', msg.includes('Archivio letto in parte (rate): i numeri possono essere incompleti.'), msg);
}

console.log(`\n${n} check passati — il mese, gli arretrati, i numeri (motore vero, mutazioni, Telegram su Firestore finto).`);
