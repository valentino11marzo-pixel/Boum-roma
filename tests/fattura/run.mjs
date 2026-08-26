// tests/fattura/run.mjs
//
// Il motore fattura: DUE forme di documento da due soggetti diversi, e
// un file che lo SdI o accetta o scarta senza dirti quale riga è sbagliata.
//
// Cosa si difende qui, in ordine di quanto costa sbagliarlo:
//
//  1. LA QUADRATURA. Somma dei DatiRiepilogo (imponibile + imposta) ===
//     ImportoTotaleDocumento, al centesimo. È il controllo 00423 dello SdI:
//     un centesimo di scarto e il file torna indietro ore dopo, per email,
//     senza indicare la riga. È il motivo per cui il motore gira in
//     centesimi interi e non in float.
//
//  2. LA RITENUTA NON TOCCA LA CASSA. La rivalsa CPA 4% è imponibile IVA
//     (art. 11 L. 576/1980) ma NON subisce la ritenuta d'acconto. Calcolarla
//     sull'imponibile pieno gonfia la ritenuta di ~18€ su una parcella da
//     2.000€ — soldi veri trattenuti in più al professionista, e uno scarto
//     che nessun controllo automatico segnala perché il file è VALIDO.
//
//  3. L'ART. 15 NON È IMPONIBILE. Le spese anticipate in nome e per conto
//     escono a natura N1, fuori IVA e fuori dalla base della ritenuta.
//     Trattarle come compenso significa fatturare IVA su un anticipo.
//
//  4. IL MOTORE NON INVENTA. P.IVA che non passa il checksum, cliente senza
//     né P.IVA né CF, aliquota 0 senza natura → nessun XML. Un XML formalmente
//     valido con dentro una P.IVA sbagliata viene ACCETTATO dallo SdI e
//     recapitato al soggetto sbagliato: è il difetto peggiore possibile,
//     perché sembra riuscito.
//
//   node tests/fattura/run.mjs

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../../js/fattura-engine.js');

let pass = 0, fail = 0;
const ok = (c, what) => { if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); } };
const eq = (got, want, what) =>
  ok(got === want, `${what}${got === want ? '' : `  (atteso ${JSON.stringify(want)}, ottenuto ${JSON.stringify(got)})`}`);

// Estrattori minimi: si legge l'XML PRODOTTO, non lo stato interno del
// motore — è il file che va allo SdI, non l'oggetto.
const all = (xml, t) => [...String(xml || '').matchAll(new RegExp(`<${t}>([^<]*)</${t}>`, 'g'))].map(m => m[1]);
const one = (xml, t) => { const a = all(xml, t); return a.length ? a[0] : null; };
const blocks = (xml, t) => [...String(xml || '').matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'g'))].map(m => m[1]);
const cents = s => Math.round(parseFloat(s) * 100);

// ── Le due controparti reali ────────────────────────────────────────────
const STUDIO = {
  nome: 'Valentino', cognome: 'Egidi',
  partitaIva: '17322991005',            // P.IVA reale del gruppo (checksum ok)
  codiceFiscale: '17322991005',
  regimeFiscale: 'RF01',
  albo: 'Avvocati', provinciaAlbo: 'RM', numeroAlbo: 'A12345', dataAlbo: '2015-01-15',
  sede: { indirizzo: 'Viale Liegi', civico: '42', cap: '00198', comune: 'Roma', provincia: 'RM', nazione: 'IT' }
};
const EGIDI_SRL = {
  denominazione: 'Egidi Immobiliare S.r.l.',
  partitaIva: '17322991005',
  regimeFiscale: 'RF01',
  personaGiuridica: true,
  sede: { indirizzo: 'Viale Liegi', civico: '42', cap: '00198', comune: 'Roma', provincia: 'RM', nazione: 'IT' }
};
const CLIENTE_SRL = {
  denominazione: 'Acme Costruzioni S.r.l.',
  partitaIva: '00743110157',            // checksum valido
  codiceDestinatario: 'ABCDEFG',
  sede: { indirizzo: 'Via Milano', civico: '10', cap: '20121', comune: 'Milano', provincia: 'MI', nazione: 'IT' }
};
const CLIENTE_PRIVATO = {
  nome: 'Mario', cognome: 'Rossi',
  codiceFiscale: 'RSSMRA85M01H501Q',
  codiceDestinatario: '0000000',
  pec: 'mario.rossi@pec.it',
  sede: { indirizzo: 'Via Cavour', civico: '5', cap: '00184', comune: 'Roma', provincia: 'RM', nazione: 'IT' }
};

// ════════════════════════════════════════════════════════════════════════
console.log('\n▸ 1 · La parcella forense — l\'aritmetica, a mano');
//
//   onorari                              2.000,00
//   spese generali 15%                     300,00
//   ─────────────────────────────────────────────
//   base CPA                             2.300,00
//   CPA 4%                                  92,00
//   ─────────────────────────────────────────────
//   imponibile IVA                       2.392,00
//   IVA 22%                                526,24
//   spese anticipate art. 15               145,00   (fuori IVA, natura N1)
//   ─────────────────────────────────────────────
//   TOTALE DOCUMENTO                     3.063,24
//   ritenuta 20% su 2.300,00              -460,00   (NON su 2.392,00)
//   ─────────────────────────────────────────────
//   NETTO A PAGARE                       2.603,24

const parcella = F.compute({
  kind: 'parcella',
  righe: [
    { descrizione: 'Assistenza giudiziale — causa Rossi/Bianchi, primo grado', imponibile: 2000 },
    { descrizione: 'Contributo unificato anticipato', imponibile: 145, art15: true }
  ]
});

ok(parcella.ok, 'la parcella è valida');
eq(parcella.tipoDocumento, 'TD06', 'tipo documento TD06 (parcella)');
eq(parcella.totali.compensi, 200000, 'compensi 2.000,00');
eq(parcella.totali.speseGenerali, 30000, 'spese generali 15% = 300,00');
eq(parcella.cassa.imponibile, 230000, 'base CPA = onorari + spese generali = 2.300,00');
eq(parcella.cassa.importo, 9200, 'CPA 4% = 92,00');
eq(parcella.cassa.tipo, 'TC01', 'tipo cassa TC01 (Cassa Forense)');
eq(parcella.totali.imponibile, 253700, 'imponibile totale = 2.392,00 + 145,00 art.15 = 2.537,00');
eq(parcella.totali.imposta, 52624, 'IVA 22% su 2.392,00 = 526,24');
eq(parcella.totali.totaleDocumento, 306324, 'TOTALE DOCUMENTO 3.063,24');
eq(parcella.ritenuta.base, 230000, 'base ritenuta = 2.300,00 — la CPA resta fuori');
eq(parcella.ritenuta.importo, 46000, 'ritenuta 20% = 460,00');
eq(parcella.totali.nettoAPagare, 260324, 'NETTO A PAGARE 2.603,24');

// La regola 2, detta al contrario: se la ritenuta si calcolasse
// sull'imponibile IVA pieno uscirebbe 478,40 — 18,40 in più, ogni parcella.
ok(parcella.ritenuta.importo !== F.pctOf(239200, 20),
   'la ritenuta NON è il 20% dell\'imponibile IVA (sarebbe 478,40: +18,40 a parcella)');

console.log('\n▸ 2 · Le spese anticipate ex art. 15 restano fuori da tutto');
const art15 = parcella.lines.find(l => l.art15);
eq(art15.aliquotaIva, 0, 'art. 15 → aliquota 0%');
eq(art15.natura, 'N1', 'art. 15 → natura N1');
eq(art15.ritenuta, false, 'art. 15 → esclusa dalla base della ritenuta');
const riepN1 = parcella.riepiloghi.find(r => r.natura === 'N1');
eq(riepN1.imponibile, 14500, 'riepilogo N1 = 145,00');
eq(riepN1.imposta, 0, 'riepilogo N1 → imposta zero');
ok(parcella.bollo && parcella.bollo.importo === 200,
   'bollo €2 dovuto: importi fuori IVA (145,00) oltre la soglia di 77,47');

console.log('\n▸ 3 · La quadratura — il controllo 00423 dello SdI');
const xmlP = F.buildXML(parcella, STUDIO, CLIENTE_PRIVATO, {
  numero: 'PA-2026-0001', data: '2026-08-26',
  causale: 'Prestazioni professionali rese nell\'interesse del cliente',
  pagamento: { iban: 'IT60X0542811101000000123456', scadenza: '2026-09-25' }
});
ok(xmlP.ok, 'l\'XML esce: ' + (xmlP.errors.join('; ') || 'nessun errore'));

const sommaRiep = blocks(xmlP.xml, 'DatiRiepilogo')
  .reduce((s, b) => s + cents(one(b, 'ImponibileImporto')) + cents(one(b, 'Imposta')), 0);
eq(sommaRiep, cents(one(xmlP.xml, 'ImportoTotaleDocumento')),
   'Σ(ImponibileImporto + Imposta) === ImportoTotaleDocumento');
eq(one(xmlP.xml, 'ImportoTotaleDocumento'), '3063.24', 'ImportoTotaleDocumento = 3063.24 (lordo)');
eq(one(xmlP.xml, 'ImportoPagamento'), '2603.24', 'ImportoPagamento = netto dopo ritenuta');

// L'imponibile del 22% deve contenere la cassa: 2000 + 300 + 92.
const riep22 = blocks(xmlP.xml, 'DatiRiepilogo').find(b => one(b, 'AliquotaIVA') === '22.00');
eq(one(riep22, 'ImponibileImporto'), '2392.00', 'la CPA è DENTRO l\'imponibile del 22%, non un extra');
eq(one(riep22, 'Imposta'), '526.24', 'imposta = 22% dell\'imponibile dichiarato');

console.log('\n▸ 4 · Il blocco cassa e il blocco ritenuta, come li legge l\'XSD');
eq(one(xmlP.xml, 'TipoCassa'), 'TC01', 'TipoCassa TC01');
eq(one(xmlP.xml, 'AlCassa'), '4.00', 'AlCassa 4.00');
eq(one(xmlP.xml, 'ImportoContributoCassa'), '92.00', 'ImportoContributoCassa 92.00');
eq(one(xmlP.xml, 'ImponibileCassa'), '2300.00', 'ImponibileCassa 2300.00');
ok(!/<DatiCassaPrevidenziale>[\s\S]*?<Ritenuta>[\s\S]*?<\/DatiCassaPrevidenziale>/.test(xmlP.xml),
   '<Ritenuta> ASSENTE dentro DatiCassaPrevidenziale (la CPA forense non la subisce)');
eq(one(xmlP.xml, 'TipoRitenuta'), 'RT01', 'TipoRitenuta RT01 (persona fisica)');
eq(one(xmlP.xml, 'AliquotaRitenuta'), '20.00', 'AliquotaRitenuta 20.00');
eq(one(xmlP.xml, 'CausalePagamento'), 'A', 'CausalePagamento A (lavoro autonomo abituale)');
eq(one(xmlP.xml, 'BolloVirtuale'), 'SI', 'bollo virtuale dichiarato');

// L'ORDINE dentro DatiGeneraliDocumento è una sequenza imposta dall'XSD:
// invertirlo produce uno scarto formale, non un avviso.
const dgd = blocks(xmlP.xml, 'DatiGeneraliDocumento')[0];
const order = ['TipoDocumento','Divisa','Data','Numero','DatiRitenuta','DatiBollo','DatiCassaPrevidenziale','ImportoTotaleDocumento','Causale']
  .map(t => dgd.indexOf('<' + t + '>'));
ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])),
   'DatiGeneraliDocumento rispetta la sequenza dell\'XSD (ritenuta → bollo → cassa → totale → causale)');

console.log('\n▸ 5 · Il destinatario privato: 0000000 pretende la PEC');
eq(one(xmlP.xml, 'CodiceDestinatario'), '0000000', 'codice destinatario 0000000');
eq(one(xmlP.xml, 'PECDestinatario'), 'mario.rossi@pec.it', 'PEC del destinatario presente');
const senzaPec = F.buildXML(parcella, STUDIO,
  { ...CLIENTE_PRIVATO, pec: null }, { numero: 'PA-2026-0002', data: '2026-08-26' });
ok(!senzaPec.ok && senzaPec.errors.some(e => /non verrebbe recapitata/.test(e)),
   '0000000 senza PEC → rifiutato, e dice perché');

console.log('\n▸ 6 · La provvigione Egidi S.r.l. — la forma semplice');
const prov = F.compute({
  kind: 'provvigione',
  righe: [{ descrizione: 'Provvigione di intermediazione — Via Appennini 33', imponibile: 1500 }]
});
eq(prov.tipoDocumento, 'TD01', 'tipo documento TD01');
eq(prov.cassa, null, 'nessuna cassa previdenziale');
eq(prov.ritenuta, null, 'nessuna ritenuta: una S.r.l. non la subisce');
eq(prov.totali.speseGenerali, 0, 'nessuna spesa generale forfettaria');
eq(prov.totali.imponibile, 150000, 'imponibile 1.500,00');
eq(prov.totali.imposta, 33000, 'IVA 22% = 330,00');
eq(prov.totali.totaleDocumento, 183000, 'totale 1.830,00');
eq(prov.totali.nettoAPagare, 183000, 'netto = totale (niente da trattenere)');
eq(prov.bollo, null, 'niente bollo: tutto imponibile IVA');

const xmlS = F.buildXML(prov, EGIDI_SRL, CLIENTE_SRL, { numero: 'BOOM-2026-0042', data: '2026-08-26' });
ok(xmlS.ok, 'l\'XML della provvigione esce');
ok(!/<DatiRitenuta>/.test(xmlS.xml), 'nessun blocco DatiRitenuta nell\'XML');
ok(!/<DatiCassaPrevidenziale>/.test(xmlS.xml), 'nessun blocco cassa nell\'XML');
eq(one(xmlS.xml, 'Denominazione'), 'Egidi Immobiliare S.r.l.', 'emittente per denominazione');
eq(one(xmlS.xml, 'CodiceDestinatario'), 'ABCDEFG', 'codice destinatario a 7 caratteri');
ok(!/<PECDestinatario>/.test(xmlS.xml), 'nessuna PEC quando c\'è il codice destinatario');
eq(xmlS.filename, 'IT17322991005_' + xmlS.progressivo + '.xml', 'nome file nella convenzione SdI');
eq(F.progressivo('BOOM-2026-0042'), xmlS.progressivo,
   'il progressivo è DERIVATO dal numero: rimandare lo stesso documento non ne crea un secondo');

console.log('\n▸ 7 · Il motore non inventa mai un dato fiscale');
const pivaRotta = F.buildXML(prov, { ...EGIDI_SRL, partitaIva: '17322991004' }, CLIENTE_SRL,
  { numero: 'X-1', data: '2026-08-26' });
ok(!pivaRotta.ok && pivaRotta.errors.some(e => /checksum/.test(e)),
   'P.IVA emittente che non passa il checksum → nessun XML');
eq(pivaRotta.xml, null, 'e non esce nemmeno un XML parziale');

const nudo = F.buildXML(prov, EGIDI_SRL,
  { denominazione: 'Ignoto', codiceDestinatario: 'ABCDEFG', sede: CLIENTE_SRL.sede },
  { numero: 'X-2', data: '2026-08-26' });
ok(!nudo.ok && nudo.errors.some(e => /00417/.test(e)), 'cliente senza P.IVA né CF → rifiutato (00417)');

const cfRotto = F.buildXML(prov, EGIDI_SRL,
  { ...CLIENTE_PRIVATO, codiceFiscale: 'RSSMRA85M01H501Z' },
  { numero: 'X-3', data: '2026-08-26' });
ok(!cfRotto.ok && cfRotto.errors.some(e => /Codice fiscale cliente non valido/.test(e)),
   'codice fiscale col carattere di controllo sbagliato → rifiutato');

const zeroSenzaNatura = F.compute({
  kind: 'provvigione',
  righe: [{ descrizione: 'Voce esente', imponibile: 100, aliquotaIva: 0 }]
});
ok(!zeroSenzaNatura.ok && zeroSenzaNatura.errors.some(e => /Natura/.test(e)),
   'aliquota 0% senza Natura → rifiutata (sarebbe scarto 00429)');

const senzaData = F.buildXML(prov, EGIDI_SRL, CLIENTE_SRL, { numero: 'X-4', data: '26/08/2026' });
ok(!senzaData.ok && senzaData.errors.some(e => /YYYY-MM-DD/.test(e)),
   'data in formato italiano → rifiutata (l\'XSD vuole YYYY-MM-DD)');

console.log('\n▸ 8 · I centesimi interi, dove i float sbagliano');
// 333,33 × 3 righe: in virgola mobile la somma esce 999.9899999999999.
const drift = F.compute({
  kind: 'parcella',
  righe: [
    { descrizione: 'Fase di studio', imponibile: 333.33 },
    { descrizione: 'Fase introduttiva', imponibile: 333.33 },
    { descrizione: 'Fase decisionale', imponibile: 333.33 }
  ]
});
eq(drift.totali.compensi, 99999, 'tre righe da 333,33 fanno esattamente 999,99');
eq(drift.totali.speseGenerali, 15000, 'spese generali 15% = 150,00 (half-up su 149,9985)');
eq(drift.cassa.importo, 4600, 'CPA 4% su 1.149,99 = 46,00 (half-up su 45,9996)');
const xmlD = F.buildXML(drift, STUDIO, CLIENTE_PRIVATO, { numero: 'PA-2026-0003', data: '2026-08-26' });
const sommaD = blocks(xmlD.xml, 'DatiRiepilogo')
  .reduce((s, b) => s + cents(one(b, 'ImponibileImporto')) + cents(one(b, 'Imposta')), 0);
eq(sommaD, cents(one(xmlD.xml, 'ImportoTotaleDocumento')), 'quadra al centesimo anche sui terzi');
ok(!/\d\.\d{3,}/.test(xmlD.xml), 'nessun importo con più di due decimali nell\'XML');

console.log('\n▸ 9 · Le manopole: quando la regola non è quella di default');
const senzaSpese = F.compute({
  kind: 'parcella', speseGenerali: false,
  righe: [{ descrizione: 'Consulenza stragiudiziale', imponibile: 1000 }]
});
eq(senzaSpese.totali.speseGenerali, 0, 'spese generali disattivabili per il singolo incarico');
eq(senzaSpese.cassa.imponibile, 100000, 'senza spese generali la base CPA è il solo onorario');
eq(senzaSpese.ritenuta.base, 100000, 'e anche la base della ritenuta');

const cassaCustom = F.compute({
  kind: 'parcella', speseGenerali: 10, cfg: { cassaPct: 5 },
  righe: [{ descrizione: 'Incarico', imponibile: 1000 }]
});
eq(cassaCustom.totali.speseGenerali, 10000, 'percentuale spese generali esplicita (10%)');
eq(cassaCustom.cassa.importo, 5500, 'aliquota cassa configurabile (5% su 1.100,00)');

const esente = F.compute({
  kind: 'provvigione',
  righe: [{ descrizione: 'Operazione non imponibile', imponibile: 500, aliquotaIva: 0, natura: 'N3.4' }]
});
ok(esente.ok, 'aliquota 0 CON natura dichiarata passa');
eq(esente.totali.imposta, 0, 'nessuna imposta sull\'operazione non imponibile');
ok(esente.bollo && esente.bollo.importo === 200, 'e il bollo scatta sopra i 77,47 fuori IVA');

console.log('\n▸ 10 · I validatori, presi uno per uno');
ok(F.validPIva('17322991005'), 'P.IVA reale del gruppo: valida');
ok(!F.validPIva('12345678901'), 'P.IVA con checksum errato: rifiutata');
ok(!F.validPIva('1732299100'), 'P.IVA di 10 cifre: rifiutata');
ok(F.validCF('RSSMRA85M01H501Q'), 'CF persona fisica valido');
ok(F.validCF('17322991005'), 'CF di società = P.IVA');
ok(!F.validCF('RSSMRA85M01H501Z'), 'CF col carattere di controllo sbagliato: rifiutato');
ok(F.validCF('RSSMRA85M0LH501U'),
   'omocodia (cifre sostituite da lettere) accettata — arriva dal validatore CONDIVISO di dataops,\n     non da una seconda copia scritta qui');
ok(F.validIban('IT60X0542811101000000123456'), 'IBAN valido');
ok(!F.validIban('IT60X0542811101000000123457'), 'IBAN con una cifra cambiata: rifiutato');
ok(F.validCodiceDest('ABCDEFG') && F.validCodiceDest('0000000'), 'codice destinatario a 7');
ok(!F.validCodiceDest('ABCDE'), 'codice destinatario a 5: rifiutato');
eq(F.eur(-46000), '-460.00', 'gli importi negativi (note di credito) si formattano col segno');
eq(F.pctOf(-100000, 20), -20000, 'e l\'arrotondamento half-up regge anche in negativo');

console.log('\n▸ 11 · L\'XML è ben formato e non perde caratteri');
const conAmp = F.emit(
  { kind: 'provvigione', righe: [{ descrizione: 'Consulenza <Rossi & Bianchi> — "mandato"', imponibile: 100 }] },
  EGIDI_SRL, CLIENTE_SRL, { numero: 'BOOM-2026-0043', data: '2026-08-26' });
ok(conAmp.ok, 'documento con caratteri speciali nella descrizione: esce');
ok(conAmp.xml.includes('&lt;Rossi &amp; Bianchi&gt;'), '&, < e > escapati nell\'XML');
ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(conAmp.xml), 'nessuna & non escapata rimasta');
// Annidamento vero, a pila — non un conteggio di tag: un conteggio pari
// passa anche su <A><B></A></B>, che nessun parser accetterebbe.
const wellFormed = (xml) => {
  const stack = [], re = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g;
  const body = String(xml).replace(/<\?[\s\S]*?\?>/g, '');
  let m;
  while ((m = re.exec(body))) {
    if (m[4] === '/') continue;                       // self-closing
    if (m[1] === '/') { if (stack.pop() !== m[2]) return `chiusura fuori posto: </${m[2]}>`; }
    else stack.push(m[2]);
  }
  return stack.length ? `mai chiusi: ${stack.join(', ')}` : null;
};
eq(wellFormed(conAmp.xml), null, 'l\'XML è ben annidato (verifica a pila, non un conteggio)');
eq(wellFormed(xmlP.xml), null, 'e lo è anche la parcella, col blocco cassa e la ritenuta');

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passati, ${fail} falliti\n`);
process.exit(fail === 0 ? 0 : 1);
