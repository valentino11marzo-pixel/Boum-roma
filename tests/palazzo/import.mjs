// IL PALAZZO — la presa in carico dalla tabella (parseRentRoll + planImport).
// Ogni regola nasce da un caso visto nell'audit del Palazzo (ottobre 2026):
// reincollare che non diceva le differenze, il cambio d'inquilino che lasciava
// vivo il vecchio contratto, «Pagato il» che segnava il mese sbagliato, rate
// che scadevano prima del periodo, vie con un numero nel nome, interni doppi,
// titoli di Excel non riconosciuti, la riga TOTALE, il 29 febbraio, i numeri
// stranieri senza prefisso, la cedolare su una società, l'annuncio ancora
// pubblicato su un interno occupato. Dati inventati (+39 000…, example.invalid,
// IBAN di prova). Per ogni difetto importante, un controllo PER MUTAZIONE: si
// ricompila il motore col difetto rimesso e il controllo deve cadere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.env.TZ = 'Europe/Rome';
const require = createRequire(import.meta.url);
const ENGINE = fileURLToPath(new URL('../../js/palazzo-engine.js', import.meta.url));
const SRC = readFileSync(ENGINE, 'utf8');
const P = require(ENGINE);
let n = 0;
const ok = (label, cond, info) => { assert.ok(cond, label + (info !== undefined ? ' · ' + JSON.stringify(info) : '')); n++; console.log('✓ ' + label); };
const eq = (label, a, b) => { assert.deepEqual(a, b, label); n++; console.log('✓ ' + label); };

// Il motore ricompilato da una sorgente (per le mutazioni): stessa cartella,
// quindi rent-engine e contract-state si risolvono come nel vero.
function engineFrom(src) {
  const m = new Module(ENGINE, null);
  m.filename = ENGINE;
  m.paths = Module._nodeModulePaths(path.dirname(ENGINE));
  m._compile(src, ENGINE);
  return m.exports;
}
// Rimette un difetto e pretende che il controllo cada (e che col motore vero
// passi): la mutazione deve trovare il pezzo di codice, altrimenti il test
// non sta più guardando la cosa giusta.
function mutation(label, find, replace, check) {
  assert.ok(SRC.includes(find), 'mutazione «' + label + '»: il pezzo di codice da rompere non c\'è più');
  const bad = engineFrom(SRC.replace(find, replace));
  let caught = false;
  try { caught = !check(bad); } catch (_) { caught = true; }
  assert.ok(check(P), 'mutazione «' + label + '»: col motore vero il controllo deve passare');
  assert.ok(caught, 'mutazione «' + label + '»: rimesso il difetto, il controllo NON cade');
  n++; console.log('✓ mutazione: ' + label);
}

const ADDR = 'Piazzale Esempio 42, Roma';
const NOW = new Date('2026-10-12T10:00:00Z');
const plan = (E, text, state, opts = {}) => {
  const ctx = E.context({ now: opts.now || NOW, properties: [], contracts: [], payments: [], ...state });
  return E.planImport(E.parseRentRoll(text).rows, ctx, { address: ADDR, ownerId: 'owner-x', ownerName: 'Proprietaria Esempio', gestioneDal: '2026-10', ...opts });
};
// Il palazzo già caricato: si rilegge il piano come lo scriverebbe il portal.
const loadedFrom = (pl, extra = {}) => ({
  properties: pl.properties.map(x => ({ id: x.id, ...x.data })).concat(extra.properties || []),
  contracts: pl.contracts.map(x => ({ id: x.id, ...x.data })).concat(extra.contracts || []),
  payments: pl.payments.map(x => ({ id: x.id, ...x.data })).concat(extra.payments || [])
});
const H = 'Interno\tPiano\tInquilino\tCo-intestatari\tTelefono\tCanone\tOneri\tDal\tAl\tTipo\tCedolare\tPagato il\tLocatore\tIBAN';
const IBAN = 'IT60X0542811101000000123456';
const row = (o) => [o.int, o.piano ?? '1', o.inq ?? '', o.co ?? '', o.tel ?? '', o.can ?? '', o.oneri ?? '', o.dal ?? '', o.al ?? '', o.tipo ?? 'studenti', o.ced ?? 'no', o.pag ?? '', o.loc ?? 'Esempio Immobiliare S.r.l.', o.iban ?? IBAN].join('\t');
const base = [H,
  row({ int: '7', piano: '2', inq: 'Ada Uno', co: 'Bea Due', tel: '+90 533 000 0001', can: '1500', oneri: '120', dal: '15/09/2026', al: '14/08/2027' }),
  row({ int: '11', piano: '3', inq: 'Carlo Tre', tel: '+39 000 000 0011', can: '1600', dal: '01/10/2026', al: '30/09/2027' })].join('\n');
const first = plan(P, base, {});
const loaded = loadedFrom(first);

// ── 1. Reincollare: le differenze si DICONO, si scrivono solo se chieste ──
{
  const t = base.replace('\t1600\t', '\t1650\t').replace('Carlo Tre', 'Carlo Trè');
  const pl = plan(P, t, loaded);
  const d = pl.diffs.filter(x => x.interno === '11').map(x => [x.field, x.fromText, x.toText]);
  eq('canone 1600→1650 e nome corretto: due differenze dette, con prima → dopo', d, [['tenantName', 'Carlo Tre', 'Carlo Trè'], ['rent', '€1.600', '€1.650']]);
  ok('senza applyDiffs nessuna scrittura (né contratto né rate)', !pl.contracts.length && !pl.paymentUpdates.length && pl.counts.diffs === 2);
  ok('il piano lo conta (counts.diffs) e lo dice in una frase', pl.messages.some(m => /^2 differenze con l’archivio: non le applico finché non lo chiedi\.$/.test(m)), pl.messages);
  // Il 12/10 la rata di ottobre (scadenza il 5) è già scaduta: resta com'era.
  ok('la riga sa quante rate da pagare cambierebbero (e quante scadute restano)', pl.diffs.find(x => x.field === 'rent').rates === 11 && pl.diffs.find(x => x.field === 'rent').ratesKept === 1, pl.diffs.find(x => x.field === 'rent'));
  const ap = plan(P, t, loaded, { applyDiffs: true });
  const c11 = ap.contracts.find(x => x.interno === '11');
  eq('con applyDiffs il contratto prende canone e nome', [c11.exists, c11.data.rent, c11.data.tenantName], [true, 1650, 'Carlo Trè']);
  const ups = ap.paymentUpdates.filter(x => x.interno === '11');
  ok('…e le rate da pagare prendono il canone nuovo, importo = canone + oneri (la scaduta di ottobre no)', ups.length === 11 && !ups.some(u => u.month === '2026-10') && ups.every(u => u.data.amount === 1650 && u.data.rentAmount + u.data.oneriAmount === u.data.amount), ups[0]);
  ok('ogni aggiornamento porta lo stato atteso (il portal ricontrolla prima di scrivere)', ups.every(u => u.expect && u.expect.status === 'pending'));

  // Una rata pagata, una segnalata, una in corso: mai toccate.
  const pays = loaded.payments.map(p => p.contractId.includes('_11_') ? (
    p.month === '2026-10' ? { ...p, status: 'paid', paidDate: '2026-10-03' } :
    p.month === '2026-11' ? { ...p, tenantReported: true } :
    p.month === '2026-12' ? { ...p, sddPiId: 'pi_x', sddStatus: 'processing' } : p) : p);
  const ap2 = plan(P, t, { ...loaded, payments: pays }, { applyDiffs: true });
  const months = ap2.paymentUpdates.filter(x => x.interno === '11').map(x => x.month);
  ok('pagata, segnalata e in corso NON si ricalcolano', !months.includes('2026-10') && !months.includes('2026-11') && !months.includes('2026-12') && months.length === 9, months);

  mutation('reincollare scarta le differenze', 'if (rrSame(d.f, from, to)) return;', 'return;',
    E => plan(E, t, loaded).diffs.some(x => x.field === 'rent'));
  mutation('applyDiffs non applica', 'var applied = apply ? cmp.diffs.filter(function (d) { return !d.locked; }) : [];', 'var applied = [];',
    E => plan(E, t, loaded, { applyDiffs: true }).contracts.some(x => x.data.rent === 1650));
  mutation('le rate in corso si ricalcolano', "if (x.contractId !== cid || !x.isRent || (x.state !== 'due' && x.state !== 'overdue')) return;", 'if (x.contractId !== cid || !x.isRent) return;',
    E => plan(E, t, { ...loaded, payments: pays }, { applyDiffs: true }).paymentUpdates.every(u => !['2026-10', '2026-11', '2026-12'].includes(u.month) || !u.id.includes('_11_')));
}
// Oneri arrivati dopo, fine anticipata, contratto firmato digitalmente.
{
  const t = base.replace('\t1600\t\t01/10/2026', '\t1600\t80\t01/10/2026');
  const pl = plan(P, t, loaded);
  const d = pl.diffs.find(x => x.interno === '11' && x.field === 'oneriQuota');
  ok('oneri scritti dopo: il contratto si riempie, le rate col solo canone sono una differenza', d && d.fill && d.rates === 11 && d.ratesKept === 1 && pl.contracts.find(x => x.interno === '11').data.oneriQuota === 80, d);
  ok('…e il vecchio avviso «oneri:» resta per la vista di oggi', pl.notes.includes('oneri:11'));
  const ap = plan(P, t, loaded, { applyDiffs: true });
  const u = ap.paymentUpdates.find(x => x.interno === '11');
  eq('applicate: la rata diventa canone + oneri', [u.data.amount, u.data.rentAmount, u.data.oneriAmount], [1680, 1600, 80]);

  const short = base.replace('01/10/2026\t30/09/2027', '01/10/2026\t15/06/2027');
  const ps = plan(P, short, loaded, { applyDiffs: true });
  const can = ps.paymentUpdates.filter(x => x.interno === '11' && x.cancel).map(x => x.month);
  const jun = ps.paymentUpdates.find(x => x.interno === '11' && x.month === '2027-06');
  ok('fine anticipata: le rate dopo la nuova fine si annullano (con motivo e data)', JSON.stringify(can) === JSON.stringify(['2027-07', '2027-08', '2027-09']) &&
    ps.paymentUpdates.filter(x => x.cancel).every(x => x.data.status === 'cancelled' && x.data.cancelledReason && x.data.cancelledAt), can);
  eq('…e giugno si paga in proporzione (1–15 = 15/30)', [jun.data.amount, jun.data.periodTo, jun.data.prorated], [800, '2027-06-15', true]);

  const signed = { ...loaded, contracts: loaded.contracts.map(c => c.id.includes('_11_') ? { ...c, signatureStatus: 'complete', tenantSignature: { at: 'x' } } : c) };
  const t2 = base.replace('\t1600\t', '\t1650\t').replace('+39 000 000 0011', '+39 000 000 0099');
  const lk = plan(P, t2, signed, { applyDiffs: true });
  const c11 = lk.contracts.find(x => x.interno === '11');
  ok('contratto firmato digitalmente: il canone non si cambia da qui (differenza bloccata e detta), il telefono sì', lk.diffs.find(x => x.field === 'rent').locked && c11 && !('rent' in c11.data) && c11.data.tenantPhone === '+390000000099' && !lk.paymentUpdates.some(x => x.interno === '11' && x.data.amount), [c11, lk.messages]);
}

// ── 2. Chi incolla solo i telefoni (o nome + telefono) ────────────────────
{
  const pl = plan(P, 'Interno\tTelefono\n7\t+90 533 000 0077', loaded);
  ok('tabella Interno + Telefono: il telefono diverso è una differenza sul contratto vivo, mai un «contratto da caricare»', pl.rows[0].action === 'contacts' && pl.diffs.some(d => d.field === 'tenantPhone') && !pl.contracts.some(c => c.data.contractMissing));
  const empty = { ...loaded, contracts: loaded.contracts.map(c => ({ ...c, tenantPhone: '' })) };
  const pe = plan(P, 'Interno\tTelefono\n7\t+90 533 000 0077', empty);
  eq('…e su un contratto senza telefono si scrive (fill-only)', pe.contracts.map(c => [c.interno, c.data]), [['7', { tenantPhone: '+905330000077' }]]);
  const ni = 'Interno\tInquilino\tTelefono\n7\tAda Uno\t+90 533 000 0077\n11\tCarlo Tre\t';
  const pn = plan(P, ni, empty);
  ok('Interno + Inquilino + Telefono: nessun «contratto da caricare» sugli interni che il contratto ce l\'hanno', pn.rows.every(r => r.action === 'contacts') && !pn.rows.some(r => r.warnings.some(w => /contratto da caricare/.test(w))) && pn.contracts.length === 1 && pn.contracts[0].data.tenantPhone === '+905330000077', pn.rows);
  const other = plan(P, 'Interno\tInquilino\tTelefono\n7\tNina Altra\t+90 533 000 0078', empty);
  ok('un nome DIVERSO: niente contatti scritti sul contratto di un\'altra persona (lo si dice)', !other.contracts.length && other.diffs.some(d => d.field === 'tenantName') && other.rows[0].notes.some(x => /un’altra persona/.test(x)), other.rows[0]);
  const otherAp = plan(P, 'Interno\tInquilino\tTelefono\n7\tNina Altra\t+90 533 000 0078', empty, { applyDiffs: true });
  ok('…nemmeno con applyDiffs: senza date può essere un cambio d\'inquilino (differenza bloccata, «persona»)', !otherAp.contracts.length && otherAp.diffs.every(d => d.locked && d.lockReason === 'persona') &&
    otherAp.messages.some(m => /riguarda il contratto di un’altra persona/.test(m)), [otherAp.contracts, otherAp.messages]);
  const fix = plan(P, [H, row({ int: '7', piano: '2', inq: 'Ada Unò', co: 'Bea Due', tel: '+90 533 000 0001', can: '1500', oneri: '120', dal: '15/09/2026', al: '14/08/2027' })].join('\n'), loaded, { applyDiffs: true });
  eq('il nome si corregge con la riga completa (stessa decorrenza = stesso contratto)', fix.contracts.map(c => c.data.tenantName), ['Ada Unò']);
  mutation('i contatti si scrivono sul contratto di un\'altra persona con applyDiffs', 'var lockPerson = !person && !rrPlaceholder(c);', 'var lockPerson = false;',
    E => !plan(E, 'Interno\tInquilino\tTelefono\n7\tNina Altra\t+90 533 000 0078', empty, { applyDiffs: true }).contracts.length);
  const nocol = plan(P, 'Interno\tInquilino\n9\tZeno Nove', {});
  ok('senza le colonne Canone/Dal/Al e senza contratto in archivio: nessun contratto inventato, lo si dice', nocol.rows[0].action === 'none' && !nocol.contracts.length && nocol.rows[0].warnings.some(w => /non ha le colonne Canone, Dal e Al/.test(w)));
  const libero = plan(P, 'Interno\tInquilino\n7\t', loaded);
  ok('la tabella lo dà libero ma in archivio è occupato: avviso, niente chiuso da qui', libero.rows[0].warnings.some(w => /la tabella lo dà libero, ma in archivio c’è il contratto di Ada Uno fino al 14\/08\/2027/.test(w)) && !libero.contracts.length);
  mutation('senzaContratto senza le colonne del contratto', 'var contractCols = has.canone && has.dal && has.al;', 'var contractCols = true;',
    E => !plan(E, 'Interno\tInquilino\n9\tZeno Nove', {}).contracts.length);
}

// ── 3. Cambio d'inquilino e decorrenza diversa: mai due contratti vivi ────
{
  const sub = [H, row({ int: '7', inq: 'Nuovo Inquilino', can: '1550', dal: '01/12/2026', al: '30/11/2027' })].join('\n');
  const pl = plan(P, sub, loaded);
  ok('un inquilino diverso dentro le date del contratto vivo: errore di riga che dice chi e fino a quando', pl.rows[0].action === 'error' && /c’è già il contratto di Ada Uno \(dal 15\/09\/2026 al 14\/08\/2027\): chiudilo prima/.test(pl.rows[0].errors[0]) && pl.errors.includes('row:2'), pl.rows[0]);
  ok('…e la riga non scrive niente (né interno né contratto né rate)', !pl.properties.length && !pl.contracts.length && !pl.payments.length && pl.counts.rowErrors === 1);
  const dd = plan(P, [H, row({ int: '7', inq: 'Ada Uno', can: '1500', dal: '01/10/2026', al: '30/09/2027' })].join('\n'), loaded);
  ok('stessa persona, decorrenza diversa: «è un nuovo contratto? chiudi prima il vecchio»', /decorrenza diversa \(01\/10\/2026 in tabella, 15\/09\/2026 in archivio\): è un nuovo contratto\? chiudi prima il vecchio/.test(dd.rows[0].errors[0]), dd.rows[0].errors);
  const after = plan(P, [H, row({ int: '7', inq: 'Nuovo Inquilino', can: '1550', dal: '15/08/2027', al: '14/08/2028' })].join('\n'), loaded);
  ok('dopo la fine del vecchio, il nuovo contratto nasce con TUTTE le sue rate', after.contracts.length === 1 && after.payments.length === 12 && after.payments[0].data.month === '2027-08', after.payments.map(x => x.data.month));
  mutation('il cambio d\'inquilino passa', '} else if (overlap.length) {', '} else if (false) {', E => plan(E, sub, loaded).rows[0].action === 'error');
  // Le rate per CONTRATTO: un vecchio contratto che finisce il 10 e un nuovo
  // che entra l'11 hanno ognuno la sua rata di agosto.
  const st = plan(P, [H, row({ int: '5', inq: 'Vecchio Cinque', can: '1000', dal: '01/09/2026', al: '10/08/2027' })].join('\n'), {});
  const st2 = [H, row({ int: '5', inq: 'Nuovo Cinque', can: '1100', dal: '11/08/2027', al: '10/08/2028' })].join('\n');
  const nx = plan(P, st2, loadedFrom(st));
  ok('il contratto che entra a metà mese ha la sua rata del mese, anche se il vecchio ne ha una', nx.payments[0] && nx.payments[0].data.month === '2027-08' && nx.payments[0].data.contractId.endsWith('2027-08-11'), nx.payments.slice(0, 2));
  mutation('rate contate per interno invece che per contratto', 'if (x.contractId !== cid || !x.month) return;', 'if (!x.month) return;',
    E => plan(E, st2, loadedFrom(st)).payments.some(x => x.data.month === '2027-08'));
}

// ── 4. Le scadenze: mai prima del periodo; le rate già scadute si dicono ──
{
  const pl = plan(P, base, {});
  const r7 = pl.payments.filter(x => x.interno === '7').map(x => x.data);
  ok('contratto dal 15: OGNI rata scade all\'inizio del suo periodo, mai il 5', r7.every(x => x.dueDate >= x.periodFrom) && r7[0].dueDate === '2026-10-15' && r7[1].dueDate === '2026-11-15', r7.slice(0, 2));
  eq('il 12/10 la rata di ottobre del 15/09 NON è in ritardo; quella dell\'int. 11 (dal 1°) sì, e lo si dice', pl.overdueNow.map(x => [x.interno, x.month, x.dueDate]), [['11', '2026-10', '2026-10-05']]);
  ok('la frase: singolare, con interno, mese e scadenza', pl.messages.some(m => m === '1 rata risulta già scaduta oggi (int. 11 · ottobre 2026, scadenza 05/10/2026): se è stata pagata, scrivi «Pagato il» nella tabella o registra l’incasso dopo il carico.'), pl.messages);
  const two = plan(P, base, {}, { now: new Date('2026-11-20T10:00:00Z'), gestioneDal: '2026-10' });
  ok('…e al plurale con due rate', two.messages.some(m => /^\d+ rate risultano già scadute oggi/.test(m)) && two.counts.overdueNow > 1, two.messages);
  mutation('scadenza corretta solo per la prima rata', 'if (due < ps) due = ps;', 'if (k === 0 && due < dal) due = dal;',
    E => plan(E, base, {}).payments.every(x => x.data.dueDate >= x.data.periodFrom));
  mutation('le rate già scadute non si dicono', "if (x.data.status === 'pending' && x.data.dueDate < today) plan.overdue.push", "if (false) plan.overdue.push",
    E => plan(E, base, {}).overdueNow.length === 1);
  // Parità col generatore del portal (generateMonthlyPayments, estratto dal
  // sorgente vero): stessi mesi, stesse scadenze, stessi importi pieni.
  const app = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  const at = app.indexOf('async function generateMonthlyPayments(contractId, contract) {');
  let depth = 0, end = at;
  for (let i = app.indexOf('{', at); i < app.length; i++) { if (app[i] === '{') depth++; else if (app[i] === '}') { depth--; if (!depth) { end = i + 1; break; } } }
  const gen = new Function('db', 'firebase', 'return ' + app.slice(at, end));
  const sets = [];
  const fakeDb = { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }), doc: id => ({ id }) }),
    batch: () => ({ set: (ref, d) => sets.push({ id: ref.id, ...d }), commit: async () => {} }) };
  const fb = { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } };
  const g = gen(fakeDb, fb);
  for (const [dal, al] of [['2026-09-15', '2027-09-14'], ['2026-10-01', '2027-09-30'], ['2026-10-20', '2027-10-19'], ['2027-01-31', '2028-01-30']]) {
    sets.length = 0;
    const log = console.log; console.log = () => {};
    try { await g('cx', { startDate: dal, endDate: al, rent: 1000, paymentDay: 5, installmentMonths: 1, propertyId: 'p' }); } finally { console.log = log; }
    const mine = P.rrSchedule(dal, al, 1000, 0, 5).map(e => [e.month, e.due, e.amount]);
    eq('parità col portal (' + dal + ' → ' + al + '): mesi, scadenze, importi', mine, sets.map(s => [s.month, s.dueDate, s.amount]));
  }
}

// ── 5. «Pagato il»: solo la rata nella cui finestra cade la data ──────────
{
  const t = (pag, gd) => plan(P, [H, row({ int: '11', inq: 'Carlo Tre', can: '1600', dal: '01/10/2026', al: '30/09/2027', pag })].join('\n'), {}, { gestioneDal: gd, now: new Date('2026-11-02T10:00:00Z'), by: 'uid-admin' });
  const okp = t('03/10/2026', '2026-10');
  const paid = okp.payments.filter(x => x.data.status === 'paid').map(x => x.data);
  eq('03/10 con gestione da ottobre: pagata la rata di OTTOBRE, con data, canale, prova e chi', paid.map(x => [x.month, x.paidDate, x.paidVia, x.paidEvidence, x.paidRecordedBy]), [['2026-10', '2026-10-03', 'dichiarato', 'conferma-proprietaria', 'uid-admin']]);
  eq('il piano dice quale rata ha segnato', okp.paidMarks.map(x => [x.interno, x.month, x.paidDate]), [['11', '2026-10', '2026-10-03']]);
  const nov = t('03/10/2026', '2026-11');
  ok('03/10 con gestione da novembre: nessuna rata segnata (era ottobre), e lo si dice', !nov.payments.some(x => x.data.status === 'paid') && nov.rows[0].warnings.some(w => /pagamento del 03\/10\/2026: è prima della rata di novembre 2026 \(si paga dal 01\/11\/2026\)/.test(w)) && !nov.rows[0].paid, nov.rows[0].warnings);
  const late = t('01/11/2026', '2026-10');
  ok('01/11 con gestione da ottobre: NON segna novembre (può essere ottobre in ritardo), lo dice', !late.paidMarks.length && late.rows[0].warnings.some(w => /pagamento del 01\/11\/2026: cade nella rata di novembre 2026, ma «Pagato il» vale per la prima rata \(ottobre 2026\)/.test(w)), late.rows[0].warnings);
  mutation('«Pagato il» su una rata successiva alla prima', 'var hit = made.length && inWin(made[0]) ? made[0] : null;', 'var hit = made.find(inWin) || null;',
    E => !plan(E, [H, row({ int: '11', inq: 'Carlo Tre', can: '1600', dal: '01/10/2026', al: '30/09/2027', pag: '01/11/2026' })].join('\n'), {}, { gestioneDal: '2026-10', now: new Date('2026-11-02T10:00:00Z') }).paidMarks.length);
  const fut = t('03/12/2026', '2026-10');
  ok('una data futura non segna niente', !fut.paidMarks.length && fut.rows[0].warnings.some(w => /data futura/.test(w)));
  const si = plan(P, [H, row({ int: '11', inq: 'Carlo Tre', can: '1600', dal: '01/10/2026', al: '30/09/2027', pag: 'sì' })].join('\n'), {});
  ok('«sì» senza data: nessuna rata segnata, e la riga chiede la data', !si.paidMarks.length && si.rows[0].warnings.some(w => /senza data: nessuna rata segnata pagata/.test(w)));
  const hdr = P.parseRentRoll('Interno\tInquilino\tCanone\tDal\tAl\tUltimo pagamento\n11\tCarlo Tre\t1600\t01/10/2026\t30/09/2027\t03/10/2026');
  ok('«Ultimo pagamento» non è più «Pagato il» (colonna non riconosciuta, detta)', hdr.columns.pagato == null && hdr.unknownColumns.some(u => u.name === 'Ultimo pagamento' && u.looks === 'date'));
  mutation('«Pagato il» segna il primo mese qualunque sia la data', 'var inWin = function (x) { var w = rrPaidWindow(x.e, today); return r.pagato >= w.from && r.pagato <= w.to; };', 'var inWin = function () { return true; };',
    E => !plan(E, [H, row({ int: '11', inq: 'Carlo Tre', can: '1600', dal: '01/10/2026', al: '30/09/2027', pag: '03/10/2026' })].join('\n'), {}, { gestioneDal: '2026-11', now: new Date('2026-11-02T10:00:00Z') }).paidMarks.length);
}

// ── 6. «Gestione BOOM dal» dell'interno non si riscrive mai ───────────────
{
  const ph = plan(P, 'Interno\tInquilino\tCanone\tDal\tAl\n14\tGaia Sette\t\t\t', {});
  const st = loadedFrom(ph);
  const done = plan(P, 'Interno\tInquilino\tCanone\tDal\tAl\n14\tGaia Sette\t1500\t01/09/2026\t31/08/2027', st, { gestioneDal: '2026-11', now: new Date('2026-11-02T10:00:00Z') });
  ok('completato a novembre col mese proposto: le rate partono da OTTOBRE (la gestione dell\'interno), nessun buco', done.payments[0].data.month === '2026-10' && done.contracts[0].data.paymentsFrom === '2026-10' && !done.properties.some(p => p.data.gestioneDal), done.payments.map(x => x.data.month).slice(0, 2));
  ok('…e il piano lo dice con la preposizione giusta («da ottobre»)', done.messages.some(m => m === 'Per l’interno 14, già in archivio, la gestione resta da ottobre 2026; il mese scelto vale per gli interni nuovi.'), done.messages);
  mutation('le rate partono dal mese del modulo', 'var unitGd = (prop && monthOf(prop.gestioneDal)) || gd;', 'var unitGd = gd;',
    E => plan(E, 'Interno\tInquilino\tCanone\tDal\tAl\n14\tGaia Sette\t1500\t01/09/2026\t31/08/2027', st, { gestioneDal: '2026-11', now: new Date('2026-11-02T10:00:00Z') }).payments[0].data.month === '2026-10');
  // La scadenza prima del periodo, in archivio (rate nate col difetto): si ripara.
  const old = { ...loaded, payments: loaded.payments.map(p => p.contractId.includes('_7_') ? { ...p, dueDate: p.month + '-05' } : p) };
  const rp = plan(P, base, old);
  const due = rp.diffs.find(d => d.field === 'dueDate');
  ok('rate in archivio che scadono prima del periodo: proposta di riparazione, con quante (10: da ottobre a luglio)', due && due.rates === 10 && /10 rate scadono prima dell’inizio del periodo/.test(due.fromText), due);
  const rpA = plan(P, base, old, { applyDiffs: true });
  ok('applicata: SOLO la scadenza cambia (gli importi ritoccati a mano restano)', rpA.paymentUpdates.length === 10 && rpA.paymentUpdates.every(u => Object.keys(u.data).join() === 'dueDate' && u.data.dueDate.endsWith('-15')), rpA.paymentUpdates[0]);
}

// ── 7. Il civico: vie con un numero nel nome, abbreviazioni, bis ──────────
{
  const same = (a, b) => P.streetKey(a) === P.streetKey(b);
  eq('Via 4 Novembre 96 / 12: due palazzi, il civico è il 96', [P.streetKey('Via 4 Novembre 96'), P.streetKey('Via 4 Novembre 12, Roma')], ['via 4 novembre 96', 'via 4 novembre 12']);
  ok('XX Settembre = 20 Settembre, IV Novembre = 4 Novembre', same('Via XX Settembre 98/F', 'Via 20 Settembre 98F') && same('Via IV Novembre 96', 'Via 4 Novembre 96'));
  eq('Viale 21 Aprile 12 e Largo 16 Ottobre 1943 5', [P.streetKey('Viale 21 Aprile 12'), P.streetKey('Largo 16 Ottobre 1943 5')], ['viale 21 aprile 12', 'largo 16 ottobre 1943 5']);
  ok('Piazzale: P.le, P.zle, Pzle, civ., n°, CAP, virgola', ['P.le Esempio 42', 'P.zle Esempio 42', 'Pzle Esempio, 42 int. 3', 'Piazzale Esempio civ. 42', 'Piazzale Esempio n°42, 00177 Roma'].every(a => P.streetKey(a) === 'piazzale esempio 42'));
  ok('42 bis è un altro portone, 42-44 è il 42', P.streetKey('Piazzale Esempio 42 bis') === 'piazzale esempio 42bis' && P.streetKey('Piazzale Esempio 42-44') === 'piazzale esempio 42');
  ok('i romani di un re restano lettere (Vittorio Emanuele II 18)', P.streetKey('Corso Vittorio Emanuele II 18') === 'corso vittorio emanuele ii 18');
  const ctx = P.context({ now: NOW, properties: [{ id: 'a', address: 'Via 4 Novembre 96', interno: '1', ownerId: 'o1' }, { id: 'b', address: 'Via 4 Novembre 12', interno: '1', ownerId: 'o2' }] });
  eq('i due palazzi restano due (prima: uno solo, «Via 4», con due proprietari)', P.buildings(ctx).map(b => b.label).sort(), ['Via 4 Novembre 12', 'Via 4 Novembre 96']);
  const imp = P.planImport(P.parseRentRoll('Interno\tInquilino\tCanone\tDal\tAl\n1\tMario Esempio\t900\t01/10/2026\t30/09/2027').rows, ctx, { address: 'Via 4 Novembre 96', ownerId: 'o1', gestioneDal: '2026-10' });
  ok('…e la presa in carico del 96 aggancia l\'interno del 96, mai quello del 12', imp.rows[0].propertyId === 'a' && !imp.errors.length, imp.rows[0]);
  ok('un numero nel nome che non è una data (Via 4 Fontane 20): il civico è il 20', P.streetKey('Via 4 Fontane 20') === 'via 4 fontane 20');
  mutation('il civico è il primo numero', 'out.push(civico); civico = \'\';', 'break;', E => E.streetKey('Via 4 Fontane 20') === 'via 4 fontane 20');
  mutation('la data nel nome della via (16 Ottobre 1943)', "(MONTH_WORDS.indexOf(next) >= 0 || (/^(1[89]|20)\\d\\d$/.test(w) && MONTH_WORDS.indexOf(prev) >= 0))", 'false',
    E => E.streetKey('Largo 16 Ottobre 1943 5') === 'largo 16 ottobre 1943 5');
  mutation('P.zle non è Piazzale', "\\bp\\.\\s*(?:zz?a?)?le\\b|\\bpzz?a?le\\b", "\\bp\\.\\s*le\\b", E => E.streetKey('P.zle Esempio 42') === 'piazzale esempio 42');
}

// ── 8. Interni e scale: «07» = «7», Via della Scala non è una scala ───────
{
  eq('Via della Scala 5 (e Via Scala 5): nessuna scala', [P.scalaOf({ address: 'Via della Scala 5 int 2' }), P.scalaOf({ address: 'Via Scala 5 int 2' }), P.scalaOf({ address: 'Via della Scala 5 sc. B int 2' })], ['', '', 'B']);
  eq('la chiave dell\'interno', ['07', 'int. 7', 'Interno 7', '12/B', '12 b', '0'].map(P.unitKey), ['7', '7', '7', '12b', '12b', '0']);
  const props = [{ id: 'a', address: ADDR, interno: '7', ownerId: 'owner-x' }, { id: 'b', address: ADDR, name: 'Esempio int. 11', ownerId: 'owner-x' },
    { id: 'c', address: 'Piazzale Esempio 42 scala A', interno: '13', ownerId: 'owner-x' }, { id: 'g', address: 'Via della Scala 5', interno: '2', ownerId: 'o4' }];
  const pl = plan(P, 'Interno\tInquilino\tCanone\tDal\tAl\n07\tA Uno\t900\t01/10/2026\t30/09/2027\nint. 11\tB Due\t900\t01/10/2026\t30/09/2027\n13\tC Tre\t900\t01/10/2026\t30/09/2027', { properties: props });
  eq('«07» trova il 7, «int. 11» trova quello col nome, il 13 di scala A senza colonna Scala: unico candidato', pl.rows.map(r => [r.interno, r.propertyId, r.exists]), [['07', 'a', true], ['11', 'b', true], ['13', 'c', true]]);
  ok('nessun interno doppio nasce', pl.counts.create === 0 && pl.rows.every(r => r.existsAs));
  const scala = P.planImport(P.parseRentRoll('Interno\tInquilino\tCanone\tDal\tAl\n2\tMario\t900\t01/10/2026\t30/09/2027').rows, P.context({ now: NOW, properties: props }), { address: 'Via della Scala 5', ownerId: 'o4', gestioneDal: '2026-10' });
  eq('Via della Scala 5 int. 2 è quello in archivio, non un doppione «scala 5»', [scala.rows[0].propertyId, scala.counts.create], ['g', 0]);
  const two = [{ id: 'x', address: ADDR, interno: '7', scala: 'A', ownerId: 'owner-x' }, { id: 'y', address: ADDR, interno: '7', scala: 'B', ownerId: 'owner-x' }];
  const amb = plan(P, 'Interno\tInquilino\tCanone\tDal\tAl\n7\tA Uno\t900\t01/10/2026\t30/09/2027', { properties: two });
  ok('due interni 7 (scale A e B) e la tabella senza scala: la riga si ferma e chiede la colonna Scala', amb.rows[0].action === 'error' && /aggiungi la colonna Scala/.test(amb.rows[0].errors[0]), amb.rows[0].errors);
  const dup = P.parseRentRoll('Interno\tInquilino\n7\tA\n07\tB');
  ok('«7» e «07» nella stessa tabella: interno ripetuto (dupUnit)', dup.rows[1].errors.some(e => /ripetuto \(riga 2\)/.test(e)) && dup.rows[1].dupUnit === 2);
  mutation('scalaOf senza le preposizioni', 'if ((t[i] === \'scala\' || t[i] === \'sc\') && isScalaMarker(t[i - 1] || \'\', t[i + 1] || \'\')) return', 'if ((t[i] === \'scala\' || t[i] === \'sc\') && t[i + 1]) return',
    E => E.scalaOf({ address: 'Via della Scala 5 int 2' }) === '');
  mutation('«07» ≠ «7»', ".replace(/^0+(?=\\d)/, '');\n  }", ";\n  }",
    E => E.planImport(E.parseRentRoll('Interno\tInquilino\tCanone\tDal\tAl\n07\tA Uno\t900\t01/10/2026\t30/09/2027').rows, E.context({ now: NOW, properties: props }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10' }).rows[0].propertyId === 'a');
  mutation('senza scala in tabella non si aggancia l\'unico candidato', 'if (same.length === 1) return { prop: same[0] };', '',
    E => E.planImport(E.parseRentRoll('Interno\tInquilino\tCanone\tDal\tAl\n13\tC Tre\t900\t01/10/2026\t30/09/2027').rows, E.context({ now: NOW, properties: props }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10' }).rows[0].propertyId === 'c');
}

// ── 9. I titoli di Excel, la riga TOTALE, righe vuote, celle su più righe ─
{
  const R = P.parseRentRoll('N°;Nominativo;Cellulare;Canone mensile €;Oneri condominiali;Deposito €;Inizio locazione;Data di fine contratto;Note\n' +
    '7;Ada Uno;+90 533 000 0001;1.500,00 €;120;3000;15/09/2026;14/08/2027;ok\n;;;;;;;;\nTOTALE;;;3.100;;;;;\n');
  eq('i titoli si riconoscono (alias e parola chiave)', ['interno', 'inquilino', 'telefono', 'canone', 'oneri', 'deposito', 'dal', 'al'].map(k => R.columns[k]), [0, 1, 2, 3, 4, 5, 6, 7]);
  eq('la riga TOTALE e quella vuota non diventano interni; la colonna ignota si dice', [R.rows.length, R.ignored.map(x => [x.line, x.reason]), R.unknown], [1, [[4, 'totale']], ['Note']]);
  const pl = P.planImport(R.rows, P.context({ now: NOW, properties: [] }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10' });
  ok('il piano dice la riga saltata e la colonna non letta, in frasi giuste', pl.messages.includes('Riga 4 saltata: è la riga dei totali, non un interno.') && pl.messages.includes('Colonna non riconosciuta: «Note». Non la carico: se serve, rinominala come nel modello.'), pl.messages);
  eq('canone 1.500,00 € letto, mai un rent 0 inventato', [R.rows[0].canone, pl.properties[0].data.rent], [1500, 1500]);
  const free = plan(P, 'Interno\tPiano\n2\t1', {});
  ok('un interno libero senza canone nasce SENZA canone (mai 0)', !('rent' in free.properties[0].data));
  const unk = P.parseRentRoll('Interno;Inquilino;Importo mensile;Data stipula;Data uscita\n7;Ada;1500;15/09/2026;14/08/2027');
  ok('colonne con date che non riconosco e Dal/Al assenti: la riga si ferma (mai un interno senza contratto per un titolo strano)', unk.rows[0].errors.some(e => /la colonna «Data stipula» ha date che non so leggere/.test(e)), unk.rows[0].errors);
  const multi = P.parseRentRoll('Interno;Inquilino;Co-intestatari\n7;Ada Uno;"Bea Due\nCia Tre"\n8;Dino;');
  eq('una cella con un a capo (fra virgolette) resta UNA cella', [multi.rows.length, multi.rows[0].coinquilini, multi.rows[1].line], [2, ['Bea Due', 'Cia Tre'], 4]);
  const plural = P.parseRentRoll('Interno;Conduttori\n7;Ada Uno / Bea Due');
  eq('«Conduttori» al plurale: il primo è l\'intestatario, gli altri co-intestatari', [plural.rows[0].inquilino, plural.rows[0].coinquilini], ['Ada Uno', ['Bea Due']]);
  const cm = P.parseRentRoll('Interno,Inquilino,Canone,Dal,Al\n7,"Rossi, Mario","1,500",15/09/2026,14/08/2027\n8,Bea,"1500,50",15/09/2026,14/08/2027\n9,Cia,15,15/09/2026,14/08/2027');
  eq('«1,500» in un CSV con le virgole è 1500 (mai €1,50); «1500,50» è 1500,50', [cm.rows[0].inquilino, cm.rows[0].canone, cm.rows[1].canone], ['Rossi, Mario', 1500, 1500.5]);
  ok('un canone di €15 si carica ma si chiede se è davvero mensile', cm.rows[2].warnings.some(w => /letto come €15: è davvero il canone MENSILE/.test(w)) && !cm.rows[2].errors.length);
  const nc = P.parseRentRoll('Interno;Nome;Cognome\n7;Ada;Uno');
  eq('Nome e Cognome in due colonne', nc.rows[0].inquilino, 'Ada Uno');
  const bad = P.parseRentRoll('Interno;Inquilino\nCanone pagato a mano;Ada');
  ok('un «interno» che è una frase: errore chiaro', bad.rows[0].errors.some(e => /non sembra un interno/.test(e)));
  mutation('la riga TOTALE diventa un interno', 'if (tot) { meta.ignored.push', 'if (false) { meta.ignored.push',
    E => E.parseRentRoll('Interno;Canone\n7;1500\nTOTALE;1500').rows.length === 1);
  mutation('niente parola chiave per i titoli', 'for (var i = 0; i < RR_GUESS.length; i++)', 'for (var i = 0; i < 0; i++)',
    E => E.parseRentRoll('Interno;Data di fine contratto\n7;14/08/2027').columns.al === 1);
  mutation('rent 0 inventato', 'if (r.canone != null) pdata.rent = r.canone;', 'pdata.rent = r.canone || 0;',
    E => !('rent' in plan(E, 'Interno\tPiano\n2\t1', {}).properties[0].data));
}

// ── 10. Il 29 febbraio, il 31: niente rata di un giorno ──────────────────
{
  const sch = P.rrSchedule('2028-02-29', '2029-02-28', 1500, 0, 5);
  eq('dal 29/02/2028 al 28/02/2029: dodici rate da €1.500, l\'ultima fino al 28/02', [sch.length, sch.reduce((a, e) => a + e.amount, 0), sch.at(-1).periodTo, sch.at(-1).f], [12, 18000, '2029-02-28', 1]);
  eq('dal 31/01 al 28/02: un mese, non uno più un giorno', P.rrSchedule('2027-01-31', '2027-02-28', 1000, 0, 5).map(e => [e.periodFrom, e.periodTo, e.amount]), [['2027-01-31', '2027-02-28', 1000]]);
  eq('i casi già giusti restano giusti (31/01 → 30/01, 15/09 → 14/08)', [P.rrSchedule('2028-01-31', '2029-01-30', 1, 0, 5).length, P.rrSchedule('2026-09-15', '2027-08-14', 1, 0, 5).length], [12, 11]);
  mutation('la tredicesima rata di un giorno', 'if (nx === al && +nx.slice(8, 10) < +dal.slice(8, 10)) full = al;', '',
    E => E.rrSchedule('2028-02-29', '2029-02-28', 1500, 0, 5).length === 12);
}

// ── 11. Telefoni stranieri, cedolare su società, IBAN, piano: si DICONO ───
{
  const R = P.parseRentRoll('Interno;Inquilino;Telefono\n1;A;0532 123 45 67\n2;B;8 916 123-45-67\n3;C;532 123 4567\n4;D;+90 532 123 45 67\n5;E;333 000 0000');
  eq('senza prefisso e non chiaramente italiano: avviso (il numero resta com\'è)', R.rows.map(r => [r.telefono, r.warnings.some(w => /senza prefisso internazionale, scrivilo con \+/.test(w))]),
    [['05321234567', true], ['89161234567', true], ['5321234567', true], ['+905321234567', false], ['3330000000', false]]);
  mutation('nessun avviso sui numeri senza prefisso', "if (ph && (ph.kind === 'unknown' || ph.ambiguous))", 'if (false)',
    E => E.parseRentRoll('Interno;Telefono\n1;532 123 4567').rows[0].warnings.length === 1);
  const C = P.parseRentRoll('Interno;Inquilino;Canone;Dal;Al;Cedolare;Locatore\n7;Ada;1500;15/09/2026;14/08/2027;sì;Esempio Immobiliare S.r.l.\n8;Bea;1500;15/09/2026;14/08/2027;si;Mario Esempio\n9;Cia;1500;15/09/2026;14/08/2027;no;Esempio S.A.S.');
  eq('cedolare «sì» con un locatore società: avviso FORTE (alerts), solo lì', C.rows.map(r => r.alerts.length), [1, 0, 0]);
  ok('…e il testo dice perché', /la cedolare secca è solo per le persone fisiche/.test(C.rows[0].alerts[0]));
  eq('le forme di società (coi punti o senza), mai un cognome che ci somiglia', ['Soc. Coop. Casa', 'Esempio S.p.A.', 'Rossi & C. sas', 'Esempio srls', 'Sasso Mario', 'Spadoni Anna'].map(x => P.parseRentRoll('Interno;Inquilino;Cedolare;Locatore\n7;Ada;sì;' + x).rows[0].alerts.length), [1, 1, 1, 1, 0, 0]);
  mutation('cedolare su società senza avviso', 'return COMPANY_WORDS.indexOf(', 'return false && COMPANY_WORDS.indexOf(',
    E => E.parseRentRoll('Interno;Inquilino;Cedolare;Locatore\n7;Ada;sì;Esempio S.r.l.').rows[0].alerts.length === 1);
  ok('il modello da scaricare è coerente con sé stesso (società senza cedolare, niente avvisi né errori)', P.parseRentRoll(P.RR_TEMPLATE).rows.every(r => !r.errors.length && !r.alerts.length));
  const pl = plan(P, [H, row({ int: '7', piano: '', inq: 'Ada Uno', can: '1500', dal: '15/09/2026', al: '14/08/2027' }), row({ int: '8', piano: '2', inq: 'Bea Due', can: '1500', dal: '15/09/2026', al: '14/08/2027', iban: 'IT00X0000000000000000000000' })].join('\n'), {});
  const r7 = pl.rows[0], r8 = pl.rows[1];
  eq('l\'anteprima ha per riga locatore, IBAN (valido o no), tipo, cedolare, deposito', [r7.locatore, r7.iban, r7.ibanValid, r7.ibanMasked, r7.tipo, r7.cedolare, r8.iban, r8.ibanValid],
    ['Esempio Immobiliare S.r.l.', IBAN, true, 'IT60 … 3456', 'studenti', 'no', '', false]);
  ok('piano vuoto: avviso «piano non indicato» sulla riga e una frase', r7.floorMissing && r7.warnings.some(w => /piano non indicato/.test(w)) && pl.messages.includes('1 interno senza piano (7): resta fuori dalla facciata finché non lo indichi.'), [r7.warnings, pl.messages]);
  eq('i conti, raccolti: quale IBAN per quali interni', pl.accounts.map(a => [a.ibanMasked, a.ibanValid, a.interni]), [['IT60 … 3456', true, ['7']], ['IT00 … 0000', false, ['8']]]);
}

// ── 12. L'annuncio allo stesso civico e interno ──────────────────────────
{
  const L = [{ id: 'L7', name: 'Bilocale Esempio int. 7', address: 'P.le Esempio 42, Roma', status: 'available' },
    { id: 'L9', name: 'Trilocale Esempio', address: ADDR, status: 'waitlist' }, { id: 'Lz', name: 'Altro int. 7', address: 'Via Altra 3', status: 'available' }];
  const pl = plan(P, [H, row({ int: '7', inq: 'Ada Uno', can: '1500', dal: '15/09/2026', al: '14/08/2027' })].join('\n'), { properties: [{ id: 'p7', address: ADDR, interno: '7', ownerId: 'owner-x', gestioneDal: '2026-10' }] }, { listings: L });
  eq('l\'annuncio dell\'int. 7 si aggancia all\'interno (solo il campo vuoto), lo stato dell\'annuncio non si tocca', [pl.properties[0].data.listingId, pl.listingLinks.map(x => [x.listingId, x.published, x.occupied])], ['L7', [['L7', true, true]]]);
  ok('…e se è ancora «disponibile» su un interno occupato, avviso forte', pl.rows[0].alerts.some(a => /ancora pubblicato come disponibile ma l’interno risulta occupato/.test(a)));
  ok('l\'annuncio allo stesso civico SENZA interno non si indovina: si dice', pl.messages.some(m => /1 annuncio allo stesso civico senza interno \(«Trilocale Esempio»\): agganciarlo a mano/.test(m)), pl.messages);
  const linked = plan(P, [H, row({ int: '7', inq: 'Ada Uno', can: '1500', dal: '15/09/2026', al: '14/08/2027' })].join('\n'), { properties: [{ id: 'p7', address: ADDR, interno: '7', ownerId: 'owner-x', gestioneDal: '2026-10', listingId: 'Lold' }] }, { listings: L });
  ok('un interno che ha già il suo annuncio non viene riagganciato', !linked.properties.some(p => 'listingId' in p.data));
  mutation('l\'annuncio non si aggancia', 'pdata.listingId = str(l0.id);', '',
    E => plan(E, [H, row({ int: '7', inq: 'Ada Uno', can: '1500', dal: '15/09/2026', al: '14/08/2027' })].join('\n'), { properties: [{ id: 'p7', address: ADDR, interno: '7', ownerId: 'owner-x', gestioneDal: '2026-10' }] }, { listings: L }).properties[0].data.listingId === 'L7');
}

// ── 13. Le frasi: singolari, plurali, preposizioni ────────────────────────
{
  const many = plan(P, ['Interno\tPiano\tInquilino\tTelefono', '7\t\tAda\t', '8\t\tBea\t', 'TOTALE\t\t\t', 'Totali\t\t\t'].join('\n'), {});
  ok('due righe dei totali: «Righe 4 e 5 saltate»', many.messages.includes('Righe 4 e 5 saltate: sono righe dei totali, non interni.'), many.messages);
  ok('due interni senza piano: plurale e «restano»', many.messages.includes('2 interni senza piano (7 e 8): restano fuori dalla facciata finché non lo indichi.'), many.messages);
  const props = [{ id: 'a', address: ADDR, interno: '7', ownerId: 'owner-x', gestioneDal: '2026-09', floor: '1' }, { id: 'b', address: ADDR, interno: '8', ownerId: 'owner-x', gestioneDal: '2026-09', floor: '1' }];
  const gm = plan(P, 'Interno\tPiano\n7\t1\n8\t1', { properties: props });
  ok('gestione già scritta su due interni: «da settembre 2026», mai «dal settembre»', gm.messages.includes('Per gli interni 7 e 8, già in archivio, la gestione resta quella scritta (settembre 2026); il mese scelto vale per gli interni nuovi.'), gm.messages);
  ok('nessuna frase dice «1 rate» o «1 interni»', [first, many, gm].every(p => p.messages.concat(...p.rows.map(r => r.warnings.concat(r.notes))).every(m => !/\b1 (rate|interni|differenze|righe)\b/.test(m))));
}

// ── 14. Il «contratto da caricare» che arriva, e il pagamento già in archivio
{
  const st = { properties: [{ id: 'p14', address: ADDR, interno: '14', floor: '4', ownerId: 'owner-x', gestioneDal: '2026-10' }],
    contracts: [{ id: 'c_p14_da-caricare', propertyId: 'p14', status: 'active', contractMissing: true, tenantName: 'Gaia Sette', oneriQuota: 120, tenantPhone: '' }] };
  const t = 'Interno\tInquilino\tTelefono\tCanone\tOneri\tDal\tAl\n14\tGaia Sette\t+39 000 000 0014\t1500\t130\t01/10/2026\t30/09/2027';
  const pl = plan(P, t, st);
  const c = pl.contracts[0];
  ok('si completa LO STESSO contratto (mai un secondo vivo), col telefono che mancava', pl.contracts.length === 1 && c.id === 'c_p14_da-caricare' && c.exists && c.data.contractMissing === false && c.data.tenantPhone === '+390000000014' && pl.rows[0].action === 'placeholder-complete');
  ok('oneri diversi dal segnaposto: differenza detta, e le rate nascono con gli oneri IN ARCHIVIO (contratto e rate non si contraddicono)', !('oneriQuota' in c.data) && pl.payments[0].data.oneriAmount === 120 && pl.diffs.some(d => d.field === 'oneriQuota'), [c.data, pl.payments[0].data]);
  const ap = plan(P, t, st, { applyDiffs: true });
  eq('…applicate: contratto e rate con i nuovi oneri', [ap.contracts[0].data.oneriQuota, ap.payments[0].data.oneriAmount, ap.payments[0].data.amount], [130, 130, 1630]);
  const other = plan(P, t.replace('Gaia Sette', 'Nina Altra'), st);
  ok('il segnaposto è di un\'altra persona: non si completa da solo, lo si dice', other.rows[0].action === 'placeholder-hold' && !other.contracts.length && !other.payments.length && other.rows[0].notes.some(x => /a nome di Gaia Sette, la tabella dice Nina Altra/.test(x)), other.rows[0]);
  const ph = plan(P, 'Interno\tInquilino\tTelefono\tCanone\tDal\tAl\n14\tGaia Sette\t+39 000 000 0014\t\t\t', st);
  eq('ricaricare il «contratto da caricare» coi soli contatti: si riempie il telefono, nessun secondo segnaposto', ph.contracts.map(x => [x.id, x.exists, x.data]), [['c_p14_da-caricare', true, { tenantPhone: '+390000000014' }]]);
  mutation('le rate del segnaposto con gli oneri della tabella anche non applicati', 'newRates(str(ph.id), updateExisting(ph, cmpP, fillP), ph);',
    "updateExisting(ph, cmpP, fillP); newRates(str(ph.id), { start: r.dal, end: r.al, rent: r.canone, oneri: r.oneri != null ? r.oneri : money(ph.oneriQuota), day: r.giorno });",
    E => plan(E, t, st).payments[0].data.oneriAmount === 120);
  // «Pagato il» per una rata già in archivio: non la si tocca da qui.
  const pg = plan(P, base.replace('\t\tEsempio Immobiliare S.r.l.\t' + IBAN + '\n11', '\t\tEsempio Immobiliare S.r.l.\t' + IBAN + '\n11').replace(/(\t01\/10\/2026\t30\/09\/2027\tstudenti\tno\t)/, '$1' + '05/10/2026'), loaded);
  ok('pagamento di una rata già in archivio: nessuna scrittura, «registra l\'incasso dal Palazzo»', !pg.payments.length && pg.rows.find(r => r.interno === '11').warnings.some(w => /la rata di ottobre 2026 è già in archivio, registra l’incasso dal Palazzo/.test(w)), pg.rows.find(r => r.interno === '11').warnings);
}

// ── 15. La stessa tabella ricaricata: niente da fare, niente da dire ────
{
  const t = [H, row({ int: '7', piano: '2', inq: 'Ada Uno', co: 'Bea Due', tel: '+90 533 000 0001', can: '1500', oneri: '120', dal: '15/09/2026', al: '14/08/2027', pag: '16/10/2026' }),
    row({ int: '11', piano: '3', inq: 'Carlo Tre', tel: '+39 000 000 0011', can: '1600', dal: '01/10/2026', al: '30/09/2027', pag: '04/10/2026' })].join('\n');
  const now = new Date('2026-11-02T10:00:00Z');
  const p1 = plan(P, t, {}, { now });
  eq('prima volta: due rate di ottobre segnate pagate dalla tabella', p1.paidMarks.map(x => [x.interno, x.month]), [['7', '2026-10'], ['11', '2026-10']]);
  const p2 = plan(P, t, loadedFrom(p1), { now });
  const c = p2.counts;
  eq('ricaricata: zero interni, contratti, rate, differenze', [c.create, c.update, c.contracts, c.contractUpdates, c.payments, c.diffs, c.paymentUpdates], [0, 0, 0, 0, 0, 0, 0]);
  ok('…e nessun avviso sul pagamento già registrato', p2.rows.every(r => !r.warnings.some(w => /pagament|pagato/.test(w))), p2.rows.map(r => r.warnings));
}

// ── 16. Il civico resta il civico: un dettaglio dopo il numero non fa un ──
//        altro palazzo (seconda revisione, regressione del rilievo 55)
{
  const same42 = ['Piazzale Prenestino 42', 'Piazzale Prenestino 42 terzo piano', 'Piazzale Prenestino 42 primo piano', 'Piazzale Prenestino 42 PT',
    'Piazzale Prenestino 42 attico', 'Piazzale Prenestino 42 Pigneto', 'Piazzale Prenestino 42 stanza 2', 'Piazzale Prenestino 42 camera 2',
    'Piazzale Prenestino 42 appartamento 3', 'Piazzale Prenestino 42 app. 3', 'Piazzale Prenestino 42 palazzina B', 'Piazzale Prenestino 42 lotto 2',
    'Piazzale Prenestino 42 seminterrato', 'Piazzale Prenestino 42 piano rialzato', 'Piazzale Prenestino 42 (Pigneto)', 'Piazzale Prenestino 42 Pigneto, Roma 00176',
    'P.le Prenestino 42 int 7', 'Piazzale Prenestino 42 - Roma', 'Piazzale Prenestino 42 Pigneto 2'];
  eq('quartiere, piano, stanza, appartamento dopo il civico: tutti «piazzale prenestino 42»', same42.filter(a => P.streetKey(a) !== 'piazzale prenestino 42'), []);
  eq('…mentre i numeri nel nome della via restano nel nome', ['Via 4 Fontane 20', 'Via 4 Novembre 96', 'Via 4 Novembre 12, Roma', 'Viale 21 Aprile 12', 'Largo 16 Ottobre 1943 5',
    'Piazza 2 Giugno 4', 'Via XX Settembre 98', 'Corso Vittorio Emanuele II 18', 'Piazzale Esempio 42 bis', 'Piazzale Esempio 42-44', 'Via della Scala 5, int 2',
    'Viale dei 4 Venti 30', 'Via 4 Fontane'].map(P.streetKey),
  ['via 4 fontane 20', 'via 4 novembre 96', 'via 4 novembre 12', 'viale 21 aprile 12', 'largo 16 ottobre 1943 5', 'piazza 2 giugno 4', 'via 20 settembre 98',
    'corso vittorio emanuele ii 18', 'piazzale esempio 42bis', 'piazzale esempio 42', 'via della scala 5', 'viale dei 4 venti 30', 'via 4 fontane']);
  // Tre interni allo stesso civico scritti in tre modi: un palazzo, nessun doppione.
  const props = [{ id: 'u3', address: 'Piazzale Prenestino 42 terzo piano', interno: '3', floor: '3', ownerId: 'owner-x' },
    { id: 'u5', address: 'Piazzale Prenestino 42 stanza 2', interno: '5', ownerId: 'owner-x' }, { id: 'u7', address: 'Piazzale Prenestino 42', interno: '7', ownerId: 'owner-x' }];
  const ctx = P.context({ now: NOW, properties: props });
  eq('il Palazzo vede UN palazzo', P.buildings(ctx).map(b => b.key), ['a:piazzale prenestino 42']);
  const t3 = 'Interno;Inquilino;Canone;Dal;Al\n3;Ada Prova;900;01/10/2026;30/09/2027\n5;Bea Prova;900;01/10/2026;30/09/2027\n7;Cia Prova;900;01/10/2026;30/09/2027';
  const run3 = E => E.planImport(E.parseRentRoll(t3).rows, E.context({ now: NOW, properties: props }), { address: 'Piazzale Prenestino 42, Roma', ownerId: 'owner-x', gestioneDal: '2026-10' });
  eq('la presa in carico aggancia i tre interni in archivio (zero nuovi)', run3(P).properties.map(p => [p.id, p.exists]), [['u3', true], ['u5', true], ['u7', true]]);
  mutation('un quartiere dopo il civico rimanda il numero nella via', "if (!out.every(function (x) { return STREET_TYPES.indexOf(x) >= 0 || PREP.indexOf(x) >= 0 || CITY.indexOf(x) >= 0; })) break;", '',
    E => E.streetKey('Piazzale Prenestino 42 Pigneto') === 'piazzale prenestino 42' && E.streetKey('Piazzale Prenestino 42 Pigneto 2') === 'piazzale prenestino 42');
  // Anche dove il nome della via è il solo tipo di strada, un dettaglio
  // dopo il numero non entra nel nome («Vicolo 9 stanza 2» è il 9).
  mutation('un dettaglio dopo il civico entra nel nome della via', 'if (CITY.indexOf(w) >= 0 || isNum(w) || DETAIL.indexOf(w) >= 0) break;', 'if (CITY.indexOf(w) >= 0 || isNum(w)) break;',
    E => E.streetKey('Vicolo 9 stanza 2') === 'vicolo 9' && E.streetKey('Vicolo 9 terzo piano') === 'vicolo 9');
  // Le due guardie tolte insieme: il difetto della revisione, tale e quale.
  mutation('i tre interni dello stesso civico diventano doppioni',
    "if (CITY.indexOf(w) >= 0 || isNum(w) || DETAIL.indexOf(w) >= 0) break;\n        if (!out.every(function (x) { return STREET_TYPES.indexOf(x) >= 0 || PREP.indexOf(x) >= 0 || CITY.indexOf(x) >= 0; })) break;",
    'if (CITY.indexOf(w) >= 0 || isNum(w)) break;',
    E => run3(E).properties.every(p => p.exists) && E.buildings(E.context({ now: NOW, properties: props })).length === 1);
}

// ── 17. Un contratto firmato non si riempie dalla tabella ───────────────
{
  const st = { properties: [{ id: 'u7', address: ADDR, interno: '7', floor: '2', ownerId: 'owner-x', gestioneDal: '2026-10' }],
    contracts: [{ id: 'c7', propertyId: 'u7', status: 'active', tenantName: 'Ada Uno', rent: 1500, startDate: '2026-10-01', endDate: '2027-09-30',
      signatureStatus: 'tenant_signed', tenantSignature: 'data:image/png;base64,xx', signedTermsHash: 'h', type: '', cedolareSecca: '', deposit: null }] };
  const t = 'Interno;Inquilino;Telefono;Canone;Dal;Al;Tipo;Deposito;Cedolare\n7;Ada Uno;+39 000 000 0007;1500;01/10/2026;30/09/2027;studenti;3000;no';
  const pl = plan(P, t, st);
  const w = pl.contracts.find(c => c.id === 'c7');
  eq('tenant_signed: deposito, tipo e cedolare NON si scrivono (cambierebbero l\'impronta delle firme)', w ? Object.keys(w.data).filter(k => ['deposit', 'type', 'cedolareSecca'].includes(k)) : [], []);
  ok('…il telefono (non è un termine) sì', w && w.data.tenantPhone === '+390000000007', w);
  eq('…e restano differenze BLOCCATE «firmato», dette', pl.diffs.filter(d => d.fill).map(d => [d.field, d.locked, d.lockReason, d.fromText]),
    [['deposit', true, 'firmato', 'non indicato'], ['type', true, 'firmato', 'non indicato'], ['cedolareSecca', true, 'firmato', 'non indicato']]);
  ok('il piano lo conta e lo dice', pl.counts.diffsLocked === 3 && pl.messages.some(m => /contratti firmati digitalmente/.test(m)), pl.messages);
  const ap = plan(P, t, st, { applyDiffs: true });
  ok('nemmeno con applyDiffs', !ap.contracts.some(c => c.id === 'c7' && ['deposit', 'type', 'cedolareSecca'].some(k => k in c.data)), ap.contracts);
  const paper = plan(P, t, { ...st, contracts: [{ ...st.contracts[0], signatureStatus: 'paper', tenantSignature: null, signedTermsHash: null }] });
  eq('un contratto su carta invece si completa (fill-only)', ['deposit', 'type', 'cedolareSecca'].map(k => paper.contracts[0].data[k]), [3000, 'studenti', 'no']);
  mutation('il fill riempie i termini di un contratto firmato', 'if (rrEmpty(from) && d.terms && locked) {', 'if (false) {',
    E => !plan(E, t, st).contracts.some(c => 'deposit' in c.data || 'type' in c.data || 'cedolareSecca' in c.data));
}

// ── 18. Oneri su un contratto con rate del portal: lo si dice ───────────
{
  const st = { properties: [{ id: 'u7', address: ADDR, interno: '7', floor: '2', ownerId: 'owner-x', gestioneDal: '2026-10' }],
    contracts: [{ id: 'c7', propertyId: 'u7', status: 'active', tenantName: 'Ada Uno', rent: 1500, startDate: '2026-10-01', endDate: '2027-09-30', signatureStatus: 'paper' }],
    // Le rate del portal (generateMonthlyPayments): niente periodFrom, niente source.
    payments: Array.from({ length: 12 }, (_, i) => { const m = new Date(Date.UTC(2026, 9 + i, 5)).toISOString().slice(0, 7);
      return { id: 'pay_c7_' + m, contractId: 'c7', propertyId: 'u7', type: 'rent', amount: 1500, month: m, dueDate: m + '-05', status: 'pending', installmentMonths: 1, coversTo: m }; }) };
  const t = 'Interno;Inquilino;Canone;Oneri;Dal;Al\n7;Ada Uno;1500;120;01/10/2026;30/09/2027';
  const pl = plan(P, t, st);
  eq('gli oneri entrano nel contratto (campo vuoto)', pl.contracts.map(c => [c.id, c.data]), [['c7', { oneriQuota: 120 }]]);
  ok('…e la vista riceve l\'avviso «oneri:7»', pl.notes.includes('oneri:7'), pl.notes);
  ok('…la riga dice che 12 rate del portal non cambiano da qui', pl.rows[0].notes.some(x => /^gli oneri \(€120\) entrano nel contratto, ma 12 rate da pagare non seguono il calendario della presa in carico e da qui non cambiano: correggile da Gestisci canoni$/.test(x)), pl.rows[0].notes);
  ok('nessuna rata del portal riscritta, nessuna rata nuova', !pl.paymentUpdates.length && !pl.payments.length);
  mutation('oneri riempiti in silenzio sulle rate del portal', '|| rec.skipped.length)) out.notes.push(\'oneri:\' + r.interno);', ')) out.notes.push(\'oneri:\' + r.interno);',
    E => plan(E, t, st).notes.includes('oneri:7'));
}

// ── 19. Rate ogni N mesi e rate che coprono più mesi ────────────────────
{
  const prop = { id: 'u7', address: ADDR, interno: '7', floor: '2', ownerId: 'owner-x', gestioneDal: '2026-10' };
  const c7 = { id: 'c7', propertyId: 'u7', status: 'active', tenantName: 'Ada Uno', rent: 1500, startDate: '2026-10-01', endDate: '2027-09-30', signatureStatus: 'paper' };
  const quarterly = ['2026-10', '2027-01', '2027-04', '2027-07'].map(m => ({ id: 'pay_c7_' + m, contractId: 'c7', propertyId: 'u7', type: 'rent', amount: 4500, month: m,
    coversTo: new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) + 1, 1)).toISOString().slice(0, 7), dueDate: m + '-05', status: 'pending', installmentMonths: 3 }));
  const t = 'Interno;Inquilino;Canone;Dal;Al;Pagato il\n7;Ada Uno;1500;01/10/2026;30/09/2027;03/10/2026';
  const q = plan(P, t, { properties: [prop], contracts: [{ ...c7, installmentMonths: 3 }], payments: quarterly });
  ok('contratto trimestrale: nessuna rata mensile dalla tabella (prima: 8 canoni chiesti due volte)', q.payments.length === 0, q.payments.map(x => x.data.month));
  ok('…la riga lo dice, e «Pagato il» non segna niente da qui', q.rows[0].notes.includes('il contratto ha rate ogni 3 mesi: le rate mancanti si generano da Gestisci canoni') &&
    q.rows[0].warnings.some(w => /con rate ogni 3 mesi non lo segno da qui/.test(w)), q.rows[0]);
  // La cadenza scritta solo sulle rate (il contratto non la porta) vale lo stesso.
  const q2 = plan(P, t, { properties: [prop], contracts: [c7], payments: quarterly });
  ok('…anche quando la cadenza sta solo sulle rate', q2.payments.length === 0 && q2.rows[0].notes.some(x => /rate ogni 3 mesi/.test(x)));
  mutation('un contratto trimestrale riceve rate mensili', 'if (every > 1) {', 'if (false) {',
    E => plan(E, t, { properties: [prop], contracts: [{ ...c7, installmentMonths: 3 }], payments: quarterly }).rows[0].notes.some(x => /rate ogni 3 mesi/.test(x)));
  // Una rata mensile che copre due mesi (scritta a mano): il secondo mese non riceve una rata.
  const cover = [{ id: 'pay_c7_2026-10', contractId: 'c7', propertyId: 'u7', type: 'rent', amount: 3000, month: '2026-10', coversTo: '2026-11', dueDate: '2026-10-05', status: 'paid', installmentMonths: 1 }];
  const t2 = 'Interno;Inquilino;Canone;Dal;Al\n7;Ada Uno;1500;01/10/2026;30/09/2027';
  const cv = plan(P, t2, { properties: [prop], contracts: [c7], payments: cover });
  eq('il mese coperto da una rata in archivio non riceve un\'altra rata', cv.payments.map(x => x.data.month).slice(0, 2), ['2026-12', '2027-01']);
  mutation('coversTo ignorato', 'for (var m = x.month, g = 0; m && m <= last && g < 24; m = monthAdd(m, 1), g++) have[m] = 1;', 'have[x.month] = 1;',
    E => !plan(E, t2, { properties: [prop], contracts: [c7], payments: cover }).payments.some(x => x.data.month === '2026-11'));
}

// ── 20. I titoli dell'inquilino, e la tabella senza nomi ────────────────
{
  const cols = ['Nome inquilino', 'Nome conduttore', 'Nome e cognome inquilino', 'Cognome e nome conduttore', 'Nome dell\'inquilino', 'Inquilino attuale', 'Conduttore/i']
    .map(h => P.parseRentRoll('Interno;' + h + ';Canone;Dal;Al\n7;Ada Prova;900;01/10/2026;30/09/2027').columns.inquilino);
  eq('«Nome inquilino», «Nome conduttore», «Nome e cognome inquilino»… sono la colonna Inquilino', cols, [1, 1, 1, 1, 1, 1, 1]);
  const run = (E, t) => E.planImport(E.parseRentRoll(t).rows, E.context({ now: NOW, properties: [] }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10' });
  const occ = run(P, 'Interno;Occupante;Canone;Dal;Al\n7;Ada Prova;900;01/10/2026;30/09/2027\n8;Bea Prova;900;01/10/2026;30/09/2027');
  ok('un titolo che non riconosco con canone e date: le righe si fermano (mai un interno «libero» con dentro qualcuno)', occ.rows.every(r => r.action === 'error' && r.errors.some(e => /la tabella non ha la colonna Inquilino/.test(e))) && !occ.properties.length, occ.rows.map(r => r.errors));
  eq('…e plan.errors le conta', [occ.errors, occ.counts.rowErrors], [['row:2', 'row:3'], 2]);
  const ask = run(P, 'Interno;Piano;Canone\n9;2;900');
  ok('una tabella senza nomi col solo canone (richiesta di un libero) resta valida: interno nuovo, nessuno stato inventato', !ask.errors.length && ask.rows[0].action === 'property' && !('availabilityStatus' in ask.properties[0].data) && ask.properties[0].data.rent === 900, ask.rows[0]);
  mutation('senza la colonna dei nomi le date passano', '} else if (!r.inquilino && !tenantCol && (', '} else if (false && (',
    E => run(E, 'Interno;Occupante;Canone;Dal;Al\n7;Ada Prova;900;01/10/2026;30/09/2027').rows[0].action === 'error');
}

// ── 21. Le righe ferme alla lettura contano come le altre; esiti onesti ─
{
  const dup = plan(P, 'Interno;Inquilino\n9;Ada Prova\n09;Bea Prova', {});
  eq('interno ripetuto: plan.errors e counts.rowErrors lo contano', [dup.errors, dup.counts.rowErrors, dup.rows[1].action], [['row:3'], 1, 'error']);
  mutation('le righe ferme alla lettura fuori da plan.errors', "out.errors.push('row:' + r.line); out.skipped.push(r.line); out.counts.rowErrors++; return; }", 'out.skipped.push(r.line); return; }',
    E => plan(E, 'Interno;Inquilino\n9;Ada Prova\n09;Bea Prova', {}).errors.length === 1);
  const fl = plan(P, 'Interno;Piano\n9;2', {});
  ok('«Interno;Piano»: l\'interno si crea, ma non è «libero» (la tabella non lo dice)', fl.rows[0].action === 'property' && !('availabilityStatus' in fl.properties[0].data), [fl.rows[0].action, fl.properties[0].data]);
  const flEx = plan(P, 'Interno;Piano\n9;2', { properties: [{ id: 'u9', address: ADDR, interno: '9', floor: '2', ownerId: 'owner-x', gestioneDal: '2026-10' }] });
  eq('…e su un interno che ha già tutto: niente da fare', flEx.rows[0].action, 'none');
  const sc = plan(P, 'Interno;Inquilino;Telefono\n9;Ada Prova;+39 000 000 0009', {});
  ok('solo contatti per un interno nuovo: niente «occupato» senza contratto', sc.rows[0].action === 'none' && !('availabilityStatus' in sc.properties[0].data) && !sc.contracts.length, [sc.rows[0], sc.properties[0].data]);
  const z = plan(P, 'Interno\tInquilino\tCanone\tDal\tAl\n9\tAda Prova\t0\t01/11/2026\t31/10/2027', {});
  ok('canone 0 con inquilino: errore di riga, mai dodici rate da €0', z.rows[0].action === 'error' && z.rows[0].errors.some(e => /^canone 0:/.test(e)) && !z.payments.length && z.errors.length === 1, z.rows[0].errors);
  const zf = plan(P, 'Interno\tPiano\tInquilino\tCanone\n9\t1\t\t0', {});
  ok('canone 0 su un interno libero: avviso, nessun rent', !zf.errors.length && !('rent' in zf.properties[0].data) && zf.rows[0].warnings.some(w => /canone 0 su un interno libero/.test(w)), zf.rows[0]);
  // Tre rate già scadute: «Pagato il» non basta, lo si dice giusto.
  const od = plan(P, 'Interno\tPiano\tInquilino\tCanone\tDal\tAl\n9\t1\tAda Prova\t900\t01/09/2026\t31/08/2027', {}, { gestioneDal: '2026-09', now: new Date('2026-11-12T10:00:00Z') });
  ok('più rate scadute: «registra l\'incasso di ciascuna», «Pagato il» vale per la prima', od.messages.some(m => /^3 rate risultano già scadute oggi .*se sono state pagate, registra l’incasso di ciascuna dal Palazzo dopo il carico \(«Pagato il» vale solo per la prima rata di ogni interno\)\.$/.test(m)), od.messages);
  const od1 = plan(P, 'Interno\tPiano\tInquilino\tCanone\tDal\tAl\n9\t1\tAda Prova\t900\t01/10/2026\t30/09/2027', {});
  ok('una sola rata scaduta: la frase al singolare', od1.messages.some(m => /^1 rata risulta già scaduta oggi .*se è stata pagata, scrivi «Pagato il» nella tabella/.test(m)), od1.messages);
}

// ── 22. Correttore finale: scadute, interni nuovi, segnaposto, chiusure ──
{
  // 22.1 — reincollare con «Applica le differenze» non ricalcola la scaduta
  // già sollecitata: la leva «Cambia canone» e la tabella, una regola sola.
  const t = base.replace('\t1600\t', '\t1650\t');
  const sol = loaded.payments.map(p => p.contractId.includes('_11_') && p.month === '2026-10'
    ? { ...p, dunningHistory: [{ kind: 'sollecito', at: '2026-10-09T09:00:00Z', channel: 'whatsapp' }] } : p);
  const keepCheck = E => {
    const ap = E.planImport(E.parseRentRoll(t).rows, E.context({ now: NOW, ...loaded, payments: sol }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10', applyDiffs: true });
    const oct = ap.paymentUpdates.find(x => x.interno === '11' && x.month === '2026-10');
    return !oct && ap.counts.paymentUpdates === 11 && ap.counts.paymentUpdatesOverdue === 1 &&
      ap.messages.some(m => m === '1 rata già scaduta resta all’importo di prima (int. 11 · ottobre 2026, sollecitata il 09/10/2026 a €1.600): è un arretrato che l’inquilino ha visto così. Se va corretto, da Gestisci canoni.') &&
      ap.messages.some(m => /11 rate da pagare cambiano/.test(m));
  };
  ok('applica le differenze: la rata scaduta e sollecitata resta a €1.600 e lo si dice, le 11 da pagare cambiano', keepCheck(P));
  const inc = P.planImport(P.parseRentRoll(t).rows, P.context({ now: NOW, ...loaded, payments: sol }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10', applyDiffs: true, includeOverdue: true });
  ok('…solo con includeOverdue (scelta esplicita) la scaduta si ricalcola', inc.paymentUpdates.some(x => x.interno === '11' && x.month === '2026-10' && x.data.amount === 1650) && !inc.overdueKept.length);
  // Il portal rifiuta di ricalcolare una rata scaduta nel frattempo se il
  // piano la vedeva ancora da pagare: per saperlo, ogni aggiornamento porta
  // lo stato visto dal piano.
  const ap0 = P.planImport(P.parseRentRoll(t).rows, P.context({ now: NOW, ...loaded, payments: sol }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10', applyDiffs: true });
  ok('ogni aggiornamento porta lo stato visto dal piano (expect.state): da pagare, e «overdue» solo con includeOverdue',
    ap0.paymentUpdates.length > 0 && ap0.paymentUpdates.every(x => x.expect && x.expect.state === 'due')
    && inc.paymentUpdates.some(x => x.interno === '11' && x.month === '2026-10' && x.expect.state === 'overdue'));
  mutation('la scaduta torna a essere ricalcolata', "} else if (keepOver && u.x.state === 'overdue' && (u.why.indexOf('amount') >= 0 || u.why.indexOf('period') >= 0)) {", "} else if (false) {", keepCheck);

  // 22.2 — un interno NUOVO che eredita la gestione del palazzo mesi dopo.
  const now2 = new Date('2027-01-20T10:00:00Z');
  const row6 = 'Interno\tPiano\tInquilino\tCanone\tDal\tAl\n6\t3\tNina Sei\t1300\t01/09/2026\t31/08/2027';
  const newCheck = E => {
    const ctx = E.context({ now: now2, ...loaded });
    const pl = E.planImport(E.parseRentRoll(row6).rows, ctx, { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10' });
    const r = pl.rows[0];
    return r.gestioneInherited === true && r.alerts.some(a => /^interno nuovo: le rate partono da ottobre 2026 \(la gestione del palazzo\) e 4 risultano già scadute; se BOOM gestisce questo interno solo da gennaio 2027, cambia «Gestione BOOM dal» prima di caricare/.test(a)) &&
      pl.messages.some(m => /^4 rate di interni nuovi risultano già scadute oggi .*cambia «Gestione BOOM dal» prima di caricare\.$/.test(m)) &&
      !pl.messages.some(m => /registra l’incasso di ciascuna/.test(m));
  };
  ok('interno nuovo con la gestione del palazzo: 4 rate già scadute dette come data da cambiare, non come incassi da registrare', newCheck(P));
  const jan = P.planImport(P.parseRentRoll(row6).rows, P.context({ now: now2, ...loaded }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2027-01' });
  ok('…con «Gestione BOOM dal» gennaio: prima rata a gennaio, nessun avviso', jan.payments[0].data.month === '2027-01' && !jan.rows[0].gestioneInherited && !jan.rows[0].alerts.length, jan.payments[0]);
  mutation('l’interno nuovo torna a ereditare in silenzio', 'if (!info.errors.length && !prop && existing.length && plan.overdue.length && gd < ctx.month) {', 'if (false) {', newCheck);

  // 22.3 — la tabella dà libero il segnaposto: lo si dice.
  const stPh = { properties: [{ id: 'p14', address: ADDR, interno: '14', floor: '2', ownerId: 'owner-x', gestioneDal: '2026-10' }],
    contracts: [{ id: 'c_p14_da-caricare', propertyId: 'p14', status: 'active', contractMissing: true, tenantName: 'Gaia Sette' }] };
  const freeCheck = (E, apply) => {
    const pl = E.planImport(E.parseRentRoll('Interno\tInquilino\tCanone\tDal\tAl\n14\t\t\t\t').rows, E.context({ now: NOW, ...stPh }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10', applyDiffs: apply });
    const r = pl.rows[0];
    return r.action === 'free' && !pl.contracts.length && r.warnings.some(w => /^la tabella lo dà libero, ma in archivio l’interno è occupato da Gaia Sette \(contratto da caricare\): da qui non lo chiudo/.test(w));
  };
  ok('segnaposto dato libero dalla tabella: nessuna scrittura, ma l’avviso nomina chi risulta dentro (con e senza applica)', freeCheck(P, false) && freeCheck(P, true));
  mutation('il segnaposto dato libero torna muto', 'if (has && has.inquilino && cur0.c && rrPlaceholder(cur0.c)) {', 'if (false) {', E => freeCheck(E, false));

  // 22.4 — reincollare dopo una chiusura anticipata.
  const closed = { ...loaded, contracts: loaded.contracts.map(c => c.id.includes('_11_') ? { ...c, status: 'terminated', terminatedAt: '2026-10-31' } : c) };
  const termCheck = E => [false, true].every(apply => {
    const pl = E.planImport(E.parseRentRoll(base).rows, E.context({ now: new Date('2026-11-12T10:00:00Z'), ...closed }), { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10', applyDiffs: apply });
    const r = pl.rows.find(x => x.interno === '11');
    return r.warnings.includes('in archivio il contratto di Carlo Tre è chiuso al 31/10/2026 (la tabella dice fino al 30/09/2027): non lo riapro da qui, correggi la tabella della proprietaria') &&
      !pl.contracts.some(x => x.interno === '11') && !pl.payments.some(x => x.interno === '11');
  });
  ok('contratto chiuso in archivio e vivo in tabella: lo si dice, niente si riapre né nasce', termCheck(P));
  mutation('la chiusura torna muta', "if (closedForReal(dup) && endD && r.al && r.al > endD) {", 'if (false) {', termCheck);

  // 22.5 — il segnaposto CHIUSO non diventa il contratto di chi arriva dopo.
  const stOut = { ...stPh, contracts: [{ ...stPh.contracts[0], status: 'terminated', terminatedAt: '2026-11-10' }] };
  const nextCheck = E => {
    const pl = E.planImport(E.parseRentRoll('Interno\tInquilino\tCanone\tDal\tAl\n14\tNina Nuova\t1300\t15/11/2026\t14/11/2027').rows, E.context({ now: new Date('2026-11-12T10:00:00Z'), ...stOut }),
      { address: ADDR, ownerId: 'owner-x', gestioneDal: '2026-10', applyDiffs: true });
    const c = pl.contracts[0];
    return pl.rows[0].action === 'contract-new' && c && c.id !== 'c_p14_da-caricare' && !c.exists && c.data.tenantName === 'Nina Nuova';
  };
  ok('il segnaposto chiuso (Gaia è uscita): la nuova inquilina ha il SUO contratto, quello di Gaia resta chiuso', nextCheck(P));
  mutation('il segnaposto chiuso torna a essere completato a nome di un’altra', 'return rrPlaceholder(c) && !day(c.startDate) && !closedForReal(c);', 'return rrPlaceholder(c) && !day(c.startDate);', nextCheck);
}

console.log('\n' + n + ' check passati — presa in carico, nessuna rete.');
