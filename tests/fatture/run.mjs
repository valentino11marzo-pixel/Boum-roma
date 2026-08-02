// tests/fatture/run.mjs — il registro fatture, blindato sui NUMERI VERI.
//
// Motore PURO (js/invoice-engine.js): niente rete, niente Firestore.
// Le fixture sono il registro TIC 2023-2026 e la coda incassi reali, con
// SOLO i nomi e le email sostituiti: importi, date, numeri e stati SDI sono
// quelli veri, perché è su quelli che il calcolo può sbagliare. (I dati
// personali dei clienti non stanno in un repo git.)
//
// Le tre ancore che rendono questa suite una prova e non un'opinione:
//   1. la somma degli IMPONIBILI 2025 fa 17.298,76 = la voce "Ricavi" del
//      bilancio Studio Cardarelli. Se il motore contasse il lordo darebbe
//      21.104,49 e il commercialista non ci si ritroverebbe;
//   2. l'IVA Q2 2026 fa 2.103,42 = la scadenza del 20/08/2026 nella
//      specifica, che si ottiene SOLO scorporando dal lordo E togliendo le
//      tre fatture scartate;
//   3. il prossimo numero libero è 24 — su un registro con buchi (2025 n.4
//      e 5 mai esistiti) e numeri bruciati (2026 n.1, 17, 22 scartati).
//
// Uso: node tests/fatture/run.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import E from '../../js/invoice-engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(join(HERE, 'fixtures', n), 'utf8');

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const near = (a, b, tol = 0.005) => Math.abs(Number(a) - Number(b)) < tol;

// ═══ 1. Scorporo IVA — la regola che vale più di tutte ═══
{
  const s = E.splitVat(350);
  check('scorporo: 350 lordo → 286,89 + 63,11', near(s.imponibile, 286.89) && near(s.iva, 63.11));
  check('scorporo: imponibile + IVA torna SEMPRE al lordo', near(s.imponibile + s.iva, s.lordo));

  const big = E.splitVat(10687.20);
  check('scorporo: 10.687,20 → 8.760,00 + 1.927,20 (la Bonventre)', near(big.imponibile, 8760) && near(big.iva, 1927.20));

  // L'errore che la specifica dice di non ripetere (§2.1): il lordo trattato
  // come imponibile. Su tutta la coda vale 1.217,69 di IVA inventata.
  const coda = E.parseInvoiceCsv(fixture('coda.csv')).rows;
  const lordoTot = coda.reduce((s, r) => s + r.lordo, 0);
  const ivaVera = E.round2(coda.reduce((s, r) => s + r.iva, 0));
  check('scorporo: 22% sul lordo ≠ IVA vera (l\'errore da 1.217,69)',
    near(E.round2(lordoTot * 0.22) - ivaVera, 1217.69, 0.05));

  // L'arrotondamento sta sull'imponibile e l'IVA si ricava per differenza.
  // Su 0,01 di lordo il contrario darebbe imponibile+IVA ≠ lordo.
  const odd = E.splitVat(350.01);
  check('scorporo: 350,01 → 286,89 + 63,12 (i centesimi reali di TIC)',
    near(odd.imponibile, 286.89) && near(odd.iva, 63.12) && near(odd.imponibile + odd.iva, 350.01));

  // Il percorso inverso riproduce il difetto di TIC invece di "correggerlo":
  // digitando 286,89 come importo unitario il totale ESCE 350,01. È così che
  // sono state emesse le fatture 3-20 del 02/04/2026.
  const back = E.fromImponibile(286.89);
  check('inverso: da imponibile 286,89 TIC ricalcola un totale di 350,01', near(back.lordo, 350.01));
}

// ═══ 2. Il registro reale ═══
const registro = E.parseInvoiceCsv(fixture('registro.csv'));
{
  check('parser: riconosce il registro emesse dall\'intestazione', registro.kind === 'emesse');
  check('parser: 46 fatture 2023-2026', registro.rows.length === 46);
  const inv = registro.rows.map(E.normalize);

  // ── L'ancora contabile: imponibile 2025 = ricavi di bilancio ──
  const y2025 = inv.filter(i => i.anno === 2025);
  check('ancora: imponibile 2025 = 17.298,76 (= "Ricavi" Studio Cardarelli)',
    near(y2025.reduce((s, i) => s + i.imponibile, 0), 17298.76));
  check('ancora: il lordo 2025 è un ALTRO numero (21.104,49) — non confondibile',
    near(y2025.reduce((s, i) => s + i.lordo, 0), 21104.49));

  // ── Lo stato SDI è un asse ortogonale all'incasso ──
  const scartate = inv.filter(i => i.statoSdi === E.SDI.SCARTATO);
  const mancate = inv.filter(i => i.statoSdi === E.SDI.MANCATA_CONSEGNA);
  check('SDI: 3 scartate nel registro', scartate.length === 3);
  check('SDI: una SCARTATA non è emessa (rientra nelle cose da fare)',
    scartate.every(i => !E.isIssued(i) && E.needsAction(i)));
  check('SDI: una MANCATA CONSEGNA è emessa e valida (nulla da fare)',
    mancate.length === 7 && mancate.every(i => E.isIssued(i) && !E.needsAction(i)));
  check('SDI: scartate = 11.687,20 lordi che NON sono ricavo',
    near(scartate.reduce((s, i) => s + i.lordo, 0), 11687.20));
}

// ═══ 3. Liquidazione IVA — data fattura, scartate escluse ═══
{
  const led = E.vatLedger(registro.rows, 2026);
  check('IVA Q2 2026 = 2.103,42 (la scadenza del 20/08)', near(led.byQuarter[2].iva, 2103.42));
  check('IVA Q2 2026: 19 fatture valide su 22 datate nel trimestre', led.byQuarter[2].count === 19);
  check('IVA Q3 2026 = 290,40', near(led.byQuarter[3].iva, 290.40));
  check('IVA 2026 totale = 2.393,82', near(led.total.iva, 2393.82));
  check('le scartate finiscono in `esclusi`, non nel nulla',
    led.esclusi.count === 3 && near(led.esclusi.iva, 2107.53));

  // Il numero che il portale mostrava: lordo × 22% con le scartate dentro.
  const comeFacevaIlPortal = E.round2(
    registro.rows.map(E.normalize).filter(i => i.anno === 2026)
      .reduce((s, i) => s + i.lordo, 0) * 0.22);
  check('regressione: il vecchio calcolo dava 5.491,62 — 2,3× il dovuto',
    near(comeFacevaIlPortal, 5491.61, 0.05) && comeFacevaIlPortal > led.total.iva * 2);

  // Scadenze di versamento
  check('scadenza Q1 = 16 maggio', E.vatDueDate(2026, 1) === '2026-05-16');
  check('scadenza Q2 = 20 agosto', E.vatDueDate(2026, 2) === '2026-08-20');
  check('scadenza Q3 = 16 novembre', E.vatDueDate(2026, 3) === '2026-11-16');
  check('scadenza Q4 = 16 MARZO dell\'anno dopo (il portale aveva febbraio)',
    E.vatDueDate(2026, 4) === '2027-03-16');
  check('interessi 1% sul trimestrale: Q1-Q3 sì, Q4 no',
    near(E.interesseTrimestrale(1000, 2), 10) && E.interesseTrimestrale(1000, 4) === 0);

  // Una fattura valida NON incassata deve comunque l'IVA. È la n.23 del
  // 28/07: il Contabile la faceva sparire filtrando `status === 'paid'`.
  const soloIncassate = registro.rows.map(E.normalize)
    .filter(i => i.anno === 2026 && i.incassato === false);
  const ledQ3 = E.vatLedger(registro.rows, 2026).byQuarter[3];
  check('IVA: il trimestre lo fa la data fattura, non l\'incasso', ledQ3.count === 1 && near(ledQ3.iva, 290.40));
  check('IVA: nessuna fattura valida sparisce per mancato incasso', soloIncassate.length === 0 || ledQ3.count === 1);
}

// ═══ 4. Numerazione: buchi e numeri bruciati insieme ═══
{
  const a26 = E.numberingAudit(registro.rows, 2026);
  check('numerazione: prossimo libero 2026 = 24', a26.next === 24);
  check('numerazione: 1, 17 e 22 sono BRUCIATI (esistono ma scartati)',
    a26.burned.join(',') === '1,17,22');
  check('numerazione: nessun buco nel 2026', a26.holes.length === 0);
  check('numerazione: nessun duplicato nel registro', a26.duplicates.length === 0);

  const a25 = E.numberingAudit(registro.rows, 2025);
  check('numerazione: nel 2025 i buchi 4 e 5 sono VISTI, non riempiti',
    a25.holes.join(',') === '4,5' && a25.next === 13);

  // La regressione che conta: `length + 1` (quello che faceva il portale)
  // avrebbe proposto 47 su questo registro.
  check('regressione: il vecchio "length+1" avrebbe dato 47, non 24',
    registro.rows.length + 1 === 47 && a26.next === 24);
}

// ═══ 5. La coda: incassato ma non fatturato ═══
const coda = E.parseInvoiceCsv(fixture('coda.csv'));
{
  check('parser: riconosce la coda dall\'intestazione', coda.kind === 'da_emettere');
  check('coda: 34 incassi senza fattura', coda.rows.length === 34);

  const q = E.billingQueue(coda.rows, '2026-08-02');
  check('coda: 30.692,20 lordi', near(q.totali.lordo, 30692.20));
  check('coda: 25.157,61 imponibili', near(q.totali.imponibile, 25157.61));
  check('coda: 5.534,59 di IVA latente', near(q.totali.iva, 5534.59, 0.02));
  check('coda: ordinata dal più vecchio (il 09/01, 205 giorni)',
    q.items[0].dataIncasso === '2026-01-09' && q.oldestDays === 205);
  check('coda: ogni riga nasce NON emessa', q.items.every(i => !E.isIssued(i)));

  // La domanda che il portale non sapeva formulare.
  const proj = E.projectVat(coda.rows, '2026-09-15');
  check('proiezione: emettendo a settembre l\'IVA cade in Q3, scadenza 16/11',
    proj.trimestre === 3 && proj.scadenza === '2026-11-16' && near(proj.iva, 5534.59, 0.02));
  const projOra = E.projectVat(coda.rows, '2026-08-02');
  check('proiezione: emettendo entro giugno sarebbe caduta in Q2 (20/08)',
    E.projectVat(coda.rows, '2026-06-30').scadenza === '2026-08-20' && projOra.scadenza === '2026-11-16');
  check('proiezione: gli interessi 1% del trimestrale sono una voce a parte',
    near(projOra.interessi, 55.35, 0.05) && near(projOra.daVersare, projOra.iva + projOra.interessi));
}

// ═══ 6. Il legacy non mente e non viene inventato ═══
{
  // Un doc del vecchio schema porta UN importo, senza dire se è lordo o
  // imponibile. Il motore lo tratta come lordo (la cifra che una persona
  // digita) MA alza `needsReview`: fingere di sapere è il difetto che
  // stiamo togliendo.
  const legacy = E.normalize({ id: 'x', number: 'BOOM-2026-0007', amount: 350, status: 'paid', date: '2026-04-02' });
  check('legacy: `amount` letto come lordo', near(legacy.lordo, 350) && near(legacy.imponibile, 286.89));
  check('legacy: marcato needsReview — il motore dichiara di non sapere', legacy.needsReview === true);
  check('legacy: BOOM-2026-0007 → numero 7', legacy.numero === 7 && legacy.anno === 2026);
  check('legacy: status paid → incassato', legacy.incassato === true);
  check('legacy: senza stato SDI, una fattura con data si presume consegnata',
    legacy.statoSdi === E.SDI.CONSEGNATO);

  // parseInt era la perdita silenziosa: 1.446,69 → 1446.
  check('regressione: parseInt avrebbe perso 0,69 su 1.446,69',
    parseInt('1446.69', 10) === 1446 && near(E.normalize({ lordo: 1446.69 }).lordo, 1446.69));

  // Un doc v2 completo non viene ricalcolato: i centesimi reali restano.
  const v2 = E.normalize({ lordo: 350.01, imponibile: 286.89, iva: 63.12, statoSdi: 'CONSEGNATO' });
  check('v2: la terna del registro non viene "corretta"', near(v2.iva, 63.12) && v2.needsReview === false);
}

// ═══ 7. Export TIC ═══
{
  const inv = E.normalize({
    anno: 2026, numero: 24, dataFattura: '2026-09-15', clienteNome: 'Test Cliente',
    paese: 'Turchia', paeseRegime: 'EE', pivaCliente: '00000000001',
    lordo: 350, imponibile: 286.89, iva: 63.11, descrizione: 'PROTECTION FEE',
    competenzaAnno: 2025,
  });
  const row = E.ticRow(inv);
  check('TIC: l\'importo unitario è l\'IMPONIBILE, mai il lordo', row['Importo unitario'] === '286,89');
  check('TIC: il totale è il lordo', row['Totale'] === '350,00');
  check('TIC: data in formato italiano', row['Data'] === '15/09/2026' && row['Scadenza'] === '15/09/2026');
  check('TIC: paese col regime', row['Paese'] === 'TURCHIA (EE)');
  check('TIC: articolo costante PROVVIGIONE', row['Articolo'] === 'PROVVIGIONE' && row['Unita'] === 'N');
  check('TIC: la competenza 2025 finisce in descrizione da sola (§2.4)',
    /— COMPETENZA 2025$/.test(row['Descrizione']));
  check('TIC: nessuna dicitura competenza quando coincide con l\'anno fattura',
    !/COMPETENZA/.test(E.ticRow(E.normalize({ anno: 2026, dataFattura: '2026-09-15', competenzaAnno: 2026, descrizione: 'X', lordo: 100 }))['Descrizione']));

  // Banca e IBAN li fornisce il chiamante server-side. Se un giorno qualcuno
  // li "comodizza" dentro il motore finiscono in un bundle JS pubblico, che è
  // la ragione per cui le coordinate del canone stanno in `payout/` e non in
  // `settings/`. La regola si asserisce sulla SORGENTE, non sul risultato.
  check('IBAN: ticRow senza opzioni non stampa coordinate bancarie',
    row['Banca'] === '' && row['IBAN'] === '');
  check('IBAN: fornito dal chiamante finisce nell\'export',
    E.ticRow(inv, { banca: 'Banca Sella', iban: 'IT00X0000000000000000000000' })['IBAN'].startsWith('IT00X'));
  check('IBAN: nessun IBAN cablato nel motore servito al browser',
    !/\bIT\d{2}[A-Z]\d{10,}/.test(readFileSync(join(HERE, '../../js/invoice-engine.js'), 'utf8')));

  const csv = E.toCsvIt([row], E.TIC_COLUMNS);
  check('CSV: separatore ; e decimale , (Excel italiano)', csv.includes(';') && csv.includes('286,89'));
  check('CSV: BOM UTF-8 per gli accenti', csv.charCodeAt(0) === 0xFEFF);
  check('CSV: colonne nell\'ordine di inserimento su TIC',
    csv.split('\r\n')[0].replace('﻿', '') === E.TIC_COLUMNS.join(';'));

  // P.IVA privati esteri: undici zeri + progressivo che PROSEGUE (§2.2)
  check('P.IVA estera: 1 → 00000000001', E.pivaEstera(1) === '00000000001');
  check('P.IVA estera: il progressivo non riparte tra un batch e l\'altro',
    E.nextPivaEstera([{ pivaCliente: '00000000001' }, { pivaCliente: '00000000007' }]) === '00000000008');
  check('P.IVA estera: una P.IVA italiana reale non entra nel progressivo',
    E.nextPivaEstera([{ pivaCliente: '17322991005' }]) === '00000000001');
}

// ═══ 6bis. Le ricevute di canone non sono fatture ═══
{
  /* La collection `invoices` ospita anche le ricevute che il portale genera
     quando un inquilino paga l'affitto. Contarle come fatture sarebbe grave
     due volte: il canone abitativo è ESENTE IVA (art. 10 n.8) e quei soldi
     non sono nemmeno ricavo di Egidi — transitano verso il proprietario. */
  const ricevuta = E.normalize({
    id: 'r1', number: 'RIC-2026-07-abcd', tipoDoc: 'ricevuta', paymentId: 'pay_1',
    lordo: 1400, imponibile: 1400, iva: 0, aliquota: 0,
    dataFattura: '2026-07-05', incassato: true,
  });
  check('ricevuta: riconosciuta dal tipo dichiarato', !E.isFattura(ricevuta));
  check('ricevuta: NON concorre alla liquidazione IVA', !E.countsForVat(ricevuta));
  check('ricevuta: non chiede nessuna azione', !E.needsAction(ricevuta));

  // I documenti già scritti dal portale non portano `tipoDoc`: si
  // riconoscono perché sono agganciati a una rata.
  const legacyRic = E.normalize({ id: 'r2', number: 'BOOM-2026-0007', paymentId: 'pay_9', amount: 1400, date: '2026-07-05', status: 'paid' });
  check('ricevuta: i doc già scritti si riconoscono dalla rata agganciata', !E.isFattura(legacyRic));
  check('ricevuta: non consuma il progressivo delle fatture (serie diverse)', legacyRic.numero === null);

  // Il conto che conta: una ricevuta da 1.400 non deve spostare l'IVA.
  const conRicevute = E.vatLedger(registro.rows.concat([
    { tipoDoc: 'ricevuta', lordo: 1400, imponibile: 1400, iva: 0, dataFattura: '2026-05-05', anno: 2026 },
    { number: 'X', paymentId: 'p2', amount: 2200, date: '2026-05-06', status: 'paid' },
  ]), 2026);
  check('ricevuta: l\'IVA Q2 resta 2.103,42 con due ricevute in mezzo',
    near(conRicevute.byQuarter[2].iva, 2103.42));
  check('ricevuta: non finisce nemmeno tra le "escluse" (non è uno scarto)',
    conRicevute.esclusi.count === 3);
  check('ricevuta: non entra nella coda "da fatturare"',
    E.billingQueue([{ tipoDoc: 'ricevuta', lordo: 1400, dataIncasso: '2026-05-05' }], '2026-08-02').count === 0);
  check('ricevuta: non sposta il prossimo numero libero',
    E.numberingAudit(registro.rows.concat([{ number: 'BOOM-2026-0099', paymentId: 'p3', amount: 900, date: '2026-06-01' }]), 2026).next === 24);
}

// ═══ 7bis. Un solo formato per lo stesso importo ═══
{
  // Gli allarmi li compone il SERVER (Node), i totali il BROWSER: le due
  // stringhe finiscono affiancate. In italiano il default CLDR non raggruppa
  // i numeri a quattro cifre e le implementazioni non concordano, così lo
  // stesso 5534,59 usciva "€5534,59" da Node e "€5.534,59" da Chrome.
  check('formato: le migliaia si raggruppano sempre, anche a 4 cifre',
    E.fmtEuro(5534.59) === '€5.534,59');
  check('formato: due decimali sempre, anche sullo zero',
    E.fmtEuro(350) === '€350,00' && E.fmtEuro(0) === '€0,00');
  check('formato: cinque cifre invariate', E.fmtEuro(30692.20) === '€30.692,20');
}

// ═══ 8. La diagnostica che accende gli allarmi ═══
{
  const audit = E.registryAudit(registro.rows, 2026, coda.rows, '2026-08-02');
  const keys = audit.alerts.map(a => a.key);
  check('audit: segnala i 34 incassi senza fattura', keys.includes('da_fatturare'));
  check('audit: segnala le 3 scartate', keys.includes('scartate'));
  check('audit: l\'allarme più grave è primo', audit.alerts[0].key === 'da_fatturare');
  check('audit: nessun falso allarme sui buchi noti del 2025',
    !E.registryAudit(registro.rows, 2025, [], '2026-08-02').alerts.some(a => a.key === 'duplicati'));
  check('audit: la liquidazione viaggia con la diagnostica', near(audit.ledger.byQuarter[2].iva, 2103.42));

  // Un registro sano non inventa allarmi.
  const pulito = E.registryAudit([{ anno: 2026, numero: 1, dataFattura: '2026-01-10', lordo: 100, imponibile: 81.97, iva: 18.03, statoSdi: 'CONSEGNATO', incassato: true }], 2026, [], '2026-08-02');
  check('audit: registro sano → nessun allarme', pulito.alerts.length === 0);
}

// ═══ 9. Parser tollerante (i file nascono da esportazioni diverse) ═══
{
  const it = E.parseInvoiceCsv('data_incasso;cliente;lordo\r\n21/01/2026;Tizio;"1.234,56"\r\n');
  check('parser: separatore ; e importo italiano 1.234,56',
    it.rows.length === 1 && near(it.rows[0].lordo, 1234.56) && it.rows[0].dataIncasso === '2026-01-21');
  check('parser: numero tecnico 1234.56 letto uguale', near(E.parseNum('1234.56'), 1234.56));
  check('parser: un\'intestazione sconosciuta è un errore, non righe a caso',
    !!E.parseInvoiceCsv('foo,bar\n1,2').error);
  check('parser: una riga senza importo viene scartata con motivo',
    E.parseInvoiceCsv('data_incasso,cliente,lordo\n2026-01-01,X,\n').errors.length === 1);
}

console.log('\n' + (failed ? '❌' : '✅') + ` ${passed} passed, ${failed} failed`);
if (failed) { console.log('Falliti:\n  - ' + bad.join('\n  - ')); process.exit(1); }
