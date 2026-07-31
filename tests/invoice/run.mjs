// tests/invoice/run.mjs — la fattura vera.
//
// Cosa protegge questa suite: che BOOM emetta un documento che lo SdI
// ACCETTA. Un PDF bello e uno scarto SdI sono lo scenario peggiore — il
// cliente ha in mano una fattura che fiscalmente non esiste.
//
//   node tests/invoice/run.mjs

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const INV = require('../../js/invoice-engine.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  [32m✓[0m ' + name); pass++; }
  catch (e) { console.log('  [31m✗[0m ' + name + '\n      ' + e.message); fail++; }
};
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'atteso true'); };

const SELLER = {
  name: 'Egidi Immobiliare S.r.l.',
  vat: '00743110157',
  regime: 'RF01',
  address: 'Via Nazionale', streetNumber: '12', zip: '00184', city: 'Roma', province: 'RM', country: 'IT',
  iban: 'IT60X0542811101000000123456',
  reaOffice: 'RM', reaNumber: '1723456',
};

const BUYER_B2B = {
  kind: 'company', name: 'Rossi Property Ltd', vat: '12345678903',
  address: 'Via Cavour', streetNumber: '3', zip: '00184', city: 'Roma', province: 'RM',
  country: 'IT', sdiCode: 'ABC1234',
};

const BUYER_B2C = {
  kind: 'person', firstName: 'Mary', lastName: 'Johnson', cf: 'JHNMRY85M41Z404Z',
  address: 'Via Merulana', zip: '00185', city: 'Roma', province: 'RM', country: 'IT', sdiCode: '0000000',
};

// ─── Aritmetica ─────────────────────────────────────────────────────────
console.log('\nARITMETICA — i centesimi non si perdono');

t('imponibile + IVA 22% su una provvigione da 1.383,33', () => {
  const r = INV.computeTotals({ lines: [{ description: 'Provvigione', qty: 1, unitPrice: 1383.33, vatRate: 22 }] });
  eq(r.taxable, 138333, 'imponibile');
  eq(r.vat, 30433, 'IVA');            // 1383.33 * 0.22 = 304.3326 → 304.33
  eq(r.total, 168766, 'totale');
});

t('l\'IVA si calcola sul TOTALE dell\'aliquota, non riga per riga', () => {
  // Tre righe da 0,10 al 22%: per riga sarebbero 3 × 0,02 = 0,06 (arrotondando
  // ciascuna); sul totale 0,30 × 22% = 0,066 → 0,07. Lo SdI vuole il secondo.
  const r = INV.computeTotals({
    lines: [0.10, 0.10, 0.10].map((p) => ({ description: 'x', qty: 1, unitPrice: p, vatRate: 22 })),
  });
  eq(r.taxable, 30);
  eq(r.vat, 7, 'IVA sul riepilogo, non somma delle righe');
});

t('float 0.1+0.2 non contamina il totale', () => {
  const r = INV.computeTotals({ lines: [
    { description: 'a', qty: 1, unitPrice: 0.1, vatRate: 0, nature: 'N2.2' },
    { description: 'b', qty: 1, unitPrice: 0.2, vatRate: 0, nature: 'N2.2' },
  ] });
  eq(r.taxable, 30);
  eq(r.eur.taxable, 0.3);
});

t('più aliquote → un riepilogo per aliquota, ordinato', () => {
  const r = INV.computeTotals({ lines: [
    { description: 'servizio', qty: 1, unitPrice: 100, vatRate: 22 },
    { description: 'anticipazione art.15', qty: 1, unitPrice: 50, vatRate: 0, nature: 'N1' },
    { description: 'altro servizio', qty: 2, unitPrice: 100, vatRate: 22 },
  ] });
  eq(r.vatSummary.length, 2);
  eq(r.vatSummary[0].rate, 22);
  eq(r.vatSummary[0].taxable, 30000);
  eq(r.vatSummary[0].vat, 6600);
  eq(r.vatSummary[1].nature, 'N1');
  eq(r.total, 30000 + 6600 + 5000);
});

t('sconto di riga in percentuale', () => {
  const r = INV.computeTotals({ lines: [{ description: 'x', qty: 1, unitPrice: 1000, vatRate: 22, discountPct: 10 }] });
  eq(r.taxable, 90000);
  eq(r.vat, 19800);
});

t('quantità decimale (ore, mq)', () => {
  const r = INV.computeTotals({ lines: [{ description: 'ore', qty: 2.5, unitPrice: 40, vatRate: 22 }] });
  eq(r.taxable, 10000);
});

// ─── Bollo ──────────────────────────────────────────────────────────────
console.log('\nBOLLO — €2 solo dove è dovuto');

t('sopra €77,47 senza IVA: bollo dovuto', () => {
  const r = INV.computeTotals({ lines: [{ description: 'x', qty: 1, unitPrice: 500, vatRate: 0, nature: 'N2.2' }] });
  ok(r.stampDutyDue, 'bollo dovuto');
  eq(r.stampDuty, 200);
  eq(r.total, 50200, 'riaddebitato al cliente per default');
});

t('esattamente €77,47: NON dovuto (la soglia si supera, non si tocca)', () => {
  const r = INV.computeTotals({ lines: [{ description: 'x', qty: 1, unitPrice: 77.47, vatRate: 0, nature: 'N2.2' }] });
  ok(!r.stampDutyDue);
  eq(r.total, 7747);
});

t('con IVA esposta: mai bollo, a qualunque importo', () => {
  const r = INV.computeTotals({ lines: [{ description: 'x', qty: 1, unitPrice: 5000, vatRate: 22 }] });
  ok(!r.stampDutyDue);
});

t('bollo non riaddebitato: resta fuori dal totale documento', () => {
  const r = INV.computeTotals({
    lines: [{ description: 'x', qty: 1, unitPrice: 500, vatRate: 0, nature: 'N2.2' }],
    stampDuty: { auto: true, amount: 2, chargedToClient: false },
  });
  ok(r.stampDutyDue);
  eq(r.total, 50000);
});

// ─── Ritenuta ───────────────────────────────────────────────────────────
console.log('\nRITENUTA — il netto a pagare non è il totale');

t('ritenuta 23% su base 50% (provvigioni agente) = 11,5% effettivo', () => {
  const r = INV.computeTotals({
    lines: [{ description: 'Provvigioni', qty: 1, unitPrice: 1000, vatRate: 22 }],
    withholding: { enabled: true, type: 'RT02', rate: 23, basePct: 50, causale: 'R' },
  });
  eq(r.withholding, 11500);
  eq(r.total, 122000);
  eq(r.netToPay, 110500, 'il cliente bonifica il netto, l\'erario riceve il resto');
});

t('ritenuta solo sulle righe marcate', () => {
  const r = INV.computeTotals({
    lines: [
      { description: 'compenso', qty: 1, unitPrice: 1000, vatRate: 22, withholding: true },
      { description: 'rimborso spese', qty: 1, unitPrice: 200, vatRate: 22, withholding: false },
    ],
    withholding: { enabled: true, rate: 20, basePct: 100 },
  });
  eq(r.withholding, 20000, 'il rimborso spese non subisce ritenuta');
});

t('ritenuta disattivata → netto = totale', () => {
  const r = INV.computeTotals({
    lines: [{ description: 'x', qty: 1, unitPrice: 100, vatRate: 22 }],
    withholding: { enabled: false, rate: 20 },
  });
  eq(r.withholding, 0);
  eq(r.netToPay, r.total);
});

// ─── Numerazione ────────────────────────────────────────────────────────
console.log('\nNUMERAZIONE — progressiva, per anno, senza ripetizioni');

t('primo documento dell\'anno', () => {
  const n = INV.nextNumber([], { year: 2026 });
  eq(n.progressive, 1);
  eq(n.number, '1/2026');
});

t('riprende dal MASSIMO emesso, non dal conteggio', () => {
  // Il bug che sostituisce: contare i documenti (length+1) ripete il numero
  // appena se ne cancella uno. Qui 1,2,3 emessi e il 2 sparito → il prossimo
  // resta 4, mai un secondo "3".
  const n = INV.nextNumber([
    { number: '1/2026', progressive: 1, year: 2026, status: 'paid' },
    { number: '3/2026', progressive: 3, year: 2026, status: 'issued' },
  ], { year: 2026 });
  eq(n.progressive, 4);
});

t('le bozze non consumano numero', () => {
  const n = INV.nextNumber([
    { number: '1/2026', progressive: 1, year: 2026, status: 'issued' },
    { progressive: 99, year: 2026, status: 'draft' },
  ], { year: 2026 });
  eq(n.progressive, 2);
});

t('l\'anno nuovo riparte da 1', () => {
  const prior = [{ number: '87/2025', progressive: 87, year: 2025, status: 'paid' }];
  eq(INV.nextNumber(prior, { year: 2026 }).progressive, 1);
});

t('sezionali indipendenti', () => {
  const prior = [
    { number: '5/2026', progressive: 5, year: 2026, sezionale: '', status: 'issued' },
    { number: '2-A/2026', progressive: 2, year: 2026, sezionale: 'A', status: 'issued' },
  ];
  eq(INV.nextNumber(prior, { year: 2026 }).progressive, 6);
  eq(INV.nextNumber(prior, { year: 2026, sezionale: 'A' }).number, '3-A/2026');
});

t('legge i documenti legacy BOOM-YYYY-NNNN', () => {
  const n = INV.nextNumber([{ number: 'BOOM-2026-0012', date: '2026-03-01', status: 'paid' }], { year: 2026 });
  eq(n.progressive, 13);
});

// ─── Validazione ────────────────────────────────────────────────────────
console.log('\nVALIDAZIONE — lo scarto SdI detto prima, non dopo');

const errs = (inv, seller) => INV.validate(inv, seller || SELLER).filter((e) => e.level === 'error');
const fields = (list) => list.map((e) => e.field);

t('fattura B2B completa: nessun errore', () => {
  const e = errs({
    docType: 'TD01', status: 'issued', number: '1/2026', date: '2026-07-31',
    buyer: BUYER_B2B, lines: [{ description: 'Provvigione', qty: 1, unitPrice: 1000, vatRate: 22 }],
  });
  eq(e.length, 0, JSON.stringify(e));
});

t('cliente con P.IVA senza codice destinatario né PEC → errore', () => {
  const b = { ...BUYER_B2B, sdiCode: '', pec: '' };
  ok(fields(errs({ date: '2026-07-31', buyer: b, lines: [{ description: 'x', unitPrice: 10, vatRate: 22 }] })).includes('buyer.sdiCode'));
});

t('privato senza P.IVA: 0000000 va benissimo', () => {
  const e = errs({
    number: '2/2026', status: 'issued', date: '2026-07-31', buyer: BUYER_B2C,
    lines: [{ description: 'Virtual viewing', qty: 1, unitPrice: 89, vatRate: 22 }],
  });
  eq(e.length, 0, JSON.stringify(e));
});

t('P.IVA: il checksum vero, non una lunghezza', () => {
  ok(INV.checkVat('00743110157'));
  ok(INV.checkVat('12345678903'));      // valore di test ufficiale AdE
  ok(!INV.checkVat('17546591001'));
  ok(!INV.checkVat('123456789'), 'lunghezza sbagliata');
  ok(fields(errs({ date: '2026-07-31', buyer: { ...BUYER_B2B, vat: '17546591001' }, lines: [{ description: 'x', unitPrice: 1, vatRate: 22 }] })).includes('buyer.vat'));
});

t('la P.IVA cablata in portal-app (17546591000) NON supera il checksum', () => {
  // Questo test è una campana, non un capriccio: quel numero è stampato oggi
  // su ogni PDF che il portale produce. Con quello nel CedentePrestatore lo
  // SdI scarta il file. Va corretto in Impostazioni → Dati fatturazione con
  // la P.IVA reale, e quando succede questo test va aggiornato di conseguenza.
  ok(!INV.checkVat('17546591000'));
});

t('aliquota 0 senza Natura → errore (scarto SdI 00400)', () => {
  const e = errs({ date: '2026-07-31', buyer: BUYER_B2B, lines: [{ description: 'x', unitPrice: 100, vatRate: 0 }] });
  ok(fields(e).some((f) => f.endsWith('.nature')));
});

t('forfettario che espone IVA → errore', () => {
  const e = errs(
    { date: '2026-07-31', buyer: BUYER_B2B, lines: [{ description: 'x', unitPrice: 100, vatRate: 22 }] },
    { ...SELLER, regime: 'RF19' },
  );
  ok(fields(e).includes('lines'));
});

t('emittente senza dati fatturazione → blocco, non fattura muta', () => {
  const e = errs({ date: '2026-07-31', buyer: BUYER_B2B, lines: [{ description: 'x', unitPrice: 1, vatRate: 22 }] }, {});
  ok(fields(e).includes('seller.name'));
  ok(fields(e).includes('seller.vat'));
});

t('nessuna riga → errore', () => {
  ok(fields(errs({ date: '2026-07-31', buyer: BUYER_B2B, lines: [] })).includes('lines'));
});

t('cliente estero: XXXXXXX, CAP e provincia non pretesi', () => {
  const e = errs({
    number: '3/2026', status: 'issued', date: '2026-07-31',
    buyer: { kind: 'company', name: 'Berlin Rentals GmbH', country: 'DE', address: 'Kurfurstendamm 1', city: 'Berlin', zip: '10719', sdiCode: 'XXXXXXX' },
    lines: [{ description: 'Consulenza', qty: 1, unitPrice: 500, vatRate: 0, nature: 'N2.1' }],
  });
  eq(e.length, 0, JSON.stringify(e));
});

t('codice fiscale: checksum verificato', () => {
  ok(INV.checkCf('RSSMRA80A01H501U'));
  ok(INV.checkCf('JHNMRY85M41Z404Z'));
  ok(!INV.checkCf('RSSMRA80A01H501A'), 'carattere di controllo sbagliato');
  ok(!INV.checkCf('RSSMRA80A01H501'), 'troppo corto');
  ok(INV.checkCf('00743110157'), 'un CF numerico è una P.IVA');
});

// ─── XML FatturaPA ──────────────────────────────────────────────────────
console.log('\nXML FATTURAPA — il documento che vale davvero');

const XML_B2B = INV.buildXML({
  docType: 'TD01', number: '1/2026', progressive: 1, date: '2026-07-31', dueDate: '2026-08-30',
  buyer: BUYER_B2B,
  lines: [
    { description: 'Provvigione mediazione immobiliare — Via Cavour 3', qty: 1, unitPrice: 1383.33, vatRate: 22 },
  ],
  payment: { condition: 'TP02', method: 'MP05', iban: 'IT60 X054 2811 1010 0000 0123 456' },
  causale: 'Contratto di locazione transitoria del 15/07/2026',
}, SELLER);

t('intestazione FPR12 e namespace corretti', () => {
  ok(XML_B2B.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  ok(XML_B2B.includes('versione="FPR12"'));
  ok(XML_B2B.includes('http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2'));
});

t('i blocchi obbligatori ci sono tutti', () => {
  ['DatiTrasmissione', 'CedentePrestatore', 'CessionarioCommittente', 'DatiGeneraliDocumento',
   'DettaglioLinee', 'DatiRiepilogo', 'DatiPagamento'].forEach((b) => {
    ok(XML_B2B.includes('<' + b + '>'), 'manca ' + b);
  });
});

t('totale documento = imponibile + IVA, al centesimo', () => {
  ok(XML_B2B.includes('<ImponibileImporto>1383.33</ImponibileImporto>'));
  ok(XML_B2B.includes('<Imposta>304.33</Imposta>'));
  ok(XML_B2B.includes('<ImportoTotaleDocumento>1687.66</ImportoTotaleDocumento>'));
});

t('IBAN normalizzato (senza spazi, maiuscolo)', () => {
  ok(XML_B2B.includes('<IBAN>IT60X0542811101000000123456</IBAN>'));
});

t('codice destinatario del cliente, non un default', () => {
  ok(XML_B2B.includes('<CodiceDestinatario>ABC1234</CodiceDestinatario>'));
});

t('REA presente per la S.r.l. (obbligatorio per le società di capitali)', () => {
  ok(XML_B2B.includes('<IscrizioneREA>'));
  ok(XML_B2B.includes('<NumeroREA>1723456</NumeroREA>'));
  ok(XML_B2B.includes('<StatoLiquidazione>LN</StatoLiquidazione>'));
});

t('B2C: nome e cognome separati, 0000000, PEC quando c\'è', () => {
  const xml = INV.buildXML({
    number: '2/2026', progressive: 2, date: '2026-07-31',
    buyer: { ...BUYER_B2C, pec: 'mary@pec.it' },
    lines: [{ description: 'Virtual viewing', qty: 1, unitPrice: 89, vatRate: 22 }],
  }, SELLER);
  ok(xml.includes('<Nome>Mary</Nome>'));
  ok(xml.includes('<Cognome>Johnson</Cognome>'));
  ok(xml.includes('<CodiceDestinatario>0000000</CodiceDestinatario>'));
  ok(xml.includes('<PECDestinatario>mary@pec.it</PECDestinatario>'));
  ok(!xml.includes('<IdFiscaleIVA>\n<IdPaese>IT</IdPaese>\n<IdCodice>' + BUYER_B2C.cf));
});

t('forfettario: Natura N2.2 + riferimento normativo + bollo', () => {
  const seller19 = { ...SELLER, regime: 'RF19' };
  const inv = {
    number: '1/2026', progressive: 1, date: '2026-07-31', buyer: BUYER_B2B,
    lines: [{ description: 'Consulenza', qty: 1, unitPrice: 500, vatRate: 0, nature: 'N2.2' }],
  };
  const xml = INV.buildXML(inv, seller19);
  ok(xml.includes('<RegimeFiscale>RF19</RegimeFiscale>'));
  ok(xml.includes('<Natura>N2.2</Natura>'));
  ok(xml.includes('<RiferimentoNormativo>Operazione non soggetta a IVA ai sensi'));
  ok(xml.includes('<BolloVirtuale>SI</BolloVirtuale>'));
  ok(xml.includes('<ImportoBollo>2.00</ImportoBollo>'));
  ok(xml.includes('<ImportoTotaleDocumento>502.00</ImportoTotaleDocumento>'));
});

t('ritenuta: blocco DatiRitenuta e ImportoPagamento = netto', () => {
  const xml = INV.buildXML({
    number: '4/2026', progressive: 4, date: '2026-07-31', buyer: BUYER_B2B,
    lines: [{ description: 'Provvigioni', qty: 1, unitPrice: 1000, vatRate: 22 }],
    withholding: { enabled: true, type: 'RT02', rate: 23, basePct: 50, causale: 'R' },
  }, SELLER);
  ok(xml.includes('<TipoRitenuta>RT02</TipoRitenuta>'));
  ok(xml.includes('<ImportoRitenuta>115.00</ImportoRitenuta>'));
  ok(xml.includes('<AliquotaRitenuta>11.50</AliquotaRitenuta>'));
  ok(xml.includes('<CausalePagamento>R</CausalePagamento>'));
  ok(xml.includes('<ImportoPagamento>1105.00</ImportoPagamento>'), 'si bonifica il netto');
});

t('caratteri illegali: & e < non rompono l\'XML, l\'emoji sparisce', () => {
  const xml = INV.buildXML({
    number: '5/2026', progressive: 5, date: '2026-07-31',
    buyer: { ...BUYER_B2B, name: 'Rossi & Figli <SRL>' },
    lines: [{ description: '🏠 Provvigione «Trastevere»', qty: 1, unitPrice: 100, vatRate: 22 }],
  }, SELLER);
  ok(xml.includes('Rossi &amp; Figli &lt;SRL&gt;'));
  ok(!xml.includes('🏠'), 'gli emoji non passano il charset SdI');
  ok(xml.includes('Provvigione'));
});

t('causale > 200 char: si spezza, non si tronca', () => {
  const long = 'Provvigione per l\'attivita di mediazione immobiliare svolta '.repeat(6);
  const xml = INV.buildXML({
    number: '6/2026', progressive: 6, date: '2026-07-31', buyer: BUYER_B2B,
    lines: [{ description: 'x', qty: 1, unitPrice: 10, vatRate: 22 }], causale: long,
  }, SELLER);
  const parts = [...xml.matchAll(/<Causale>([^<]*)<\/Causale>/g)].map((m) => m[1]);
  ok(parts.length > 1, 'la causale lunga occupa più tag Causale');
  // Il limite di 200 è sul VALORE, non sui byte escapati: &apos; vale 1 char.
  parts.forEach((c) => ok(c.replace(/&\w+;/g, 'x').length <= 200, 'segmento troppo lungo'));
  ok(parts.join(' ').includes('mediazione immobiliare'), 'la coda non viene persa');
});

t('data: la stringa passa intatta, il Date si formatta in ora locale', () => {
  // toISOString() è UTC: alle 00:30 di Roma darebbe il giorno prima, e la
  // fattura finirebbe datata nell'anno fiscale sbagliato. isoDate legge i
  // campi locali del Date, e una 'YYYY-MM-DD' già scritta non la tocca.
  eq(INV.isoDate('2026-01-01'), '2026-01-01');
  eq(INV.isoDate('2026-01-01T23:30:00'), '2026-01-01');
  const d = new Date(2026, 0, 1, 0, 30);   // 1 gennaio, ora locale
  eq(INV.isoDate(d), '2026-01-01');
  ok(d.toISOString().slice(0, 10) !== '2026-01-01' || true);
});

t('nome file conforme allo SdI', () => {
  eq(INV.xmlFilename(SELLER, 7), 'IT00743110157_00007.xml');
  eq(INV.xmlFilename({ vat: '00743110157', country: 'IT' }, 12345), 'IT00743110157_12345.xml');
});

// ─── Nota di credito ────────────────────────────────────────────────────
console.log('\nNOTA DI CREDITO — una fattura emessa non si cancella');

t('TD04 collegata al documento originale', () => {
  const orig = {
    id: 'x1', number: '9/2026', progressive: 9, date: '2026-05-10', status: 'paid',
    buyer: BUYER_B2B, lines: [{ description: 'Provvigione', qty: 1, unitPrice: 1000, vatRate: 22 }],
  };
  const nc = INV.creditNoteFrom(orig, { reason: 'contratto risolto' });
  eq(nc.docType, 'TD04');
  eq(nc.status, 'draft');
  eq(nc.number, undefined, 'la nota prende un numero nuovo, non quello della fattura');
  eq(nc.relatedDoc.number, '9/2026');
  ok(nc.causale.includes('contratto risolto'));
  const xml = INV.buildXML({ ...nc, number: '10/2026', progressive: 10 }, SELLER);
  ok(xml.includes('<TipoDocumento>TD04</TipoDocumento>'));
  ok(xml.includes('<DatiFattureCollegate>'));
  ok(xml.includes('<IdDocumento>9/2026</IdDocumento>'));
});

t('lo storno non muta l\'originale', () => {
  const orig = { number: '9/2026', status: 'paid', buyer: BUYER_B2B, lines: [{ description: 'a', unitPrice: 100, vatRate: 22 }] };
  INV.creditNoteFrom(orig).lines[0].description = 'MODIFICATA';
  eq(orig.lines[0].description, 'a');
});

// ─── Default ────────────────────────────────────────────────────────────
console.log('\nDEFAULT — l\'editor si apre già corretto');

t('regime ordinario → 22%, scadenza a 30 giorni', () => {
  const inv = INV.emptyInvoice(SELLER);
  eq(inv.lines[0].vatRate, 22);
  eq(inv.payment.iban, SELLER.iban);
  eq(inv.dueDate, INV.addDays(inv.date, 30));
});

t('regime forfettario → 0% con N2.2 già impostata', () => {
  const inv = INV.emptyInvoice({ ...SELLER, regime: 'RF19' });
  eq(inv.lines[0].vatRate, 0);
  eq(inv.lines[0].nature, 'N2.2');
});

console.log('\n' + (fail ? '[31m' : '[32m') + pass + ' passati, ' + fail + ' falliti[0m\n');
process.exit(fail ? 1 : 0);
