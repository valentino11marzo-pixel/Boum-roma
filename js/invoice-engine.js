/* BOOM · Invoice Engine — pure, framework-free, unit-tested.
 *
 * IL PUNTO: in Italia una fattura NON è un PDF. È il file XML FatturaPA che
 * viaggia sullo SdI (obbligatorio B2B/B2C dal 2019, esteso a TUTTI i
 * forfettari dal 1/1/2024). Il PDF è la "copia di cortesia": vale zero
 * fiscalmente. Il portale finora sapeva stampare solo ricevute — una ricevuta
 * di pigione documenta un incasso di canone, non è mai il documento con cui
 * BOOM fattura una provvigione o un servizio.
 *
 * Questo motore fa i tre pezzi che mancavano, e li fa in modo che siano
 * VERIFICABILI: aritmetica in centesimi (mai float che perdono i 50 cent),
 * numerazione progressiva senza buchi, e l'XML FatturaPA 1.2.2 (FPR12) con i
 * campi che lo SdI scarta se mancano.
 *
 * Arrotondamento: come vuole l'AdE — si arrotonda la RIGA (qty × prezzo −
 * sconto) e poi l'IMPOSTA sul riepilogo per aliquota, non riga per riga.
 * Sommare imposte di riga dà scarti da 1-2 cent che lo SdI rifiuta.
 *
 * Espone window.BOOM_INVOICE (browser) e module.exports (Node/test).
 */
(function (root) {
  'use strict';

  // ─── Tabelle ufficiali FatturaPA v1.2.2 ────────────────────────────────
  var DOC_TYPES = {
    TD01: 'Fattura',
    TD04: 'Nota di credito',
    TD05: 'Nota di debito',
    TD06: 'Parcella',
    TD24: 'Fattura differita',
  };

  var REGIMI = {
    RF01: 'Ordinario',
    RF02: 'Contribuenti minimi (art.1 c.96-117 L.244/07)',
    RF04: 'Agricoltura e attività connesse',
    RF16: 'IVA per cassa P.A. (art.6 c.5 DPR 633/72)',
    RF17: 'IVA per cassa (art.32-bis DL 83/2012)',
    RF19: 'Regime forfettario (art.1 c.54-89 L.190/2014)',
    RF18: 'Altro',
  };

  // Natura: obbligatoria quando AliquotaIVA = 0. Senza, lo SdI scarta (codice 00400).
  var NATURE = {
    'N1':   'Escluse ex art. 15 DPR 633/72',
    'N2.1': 'Non soggette ad IVA — art. da 7 a 7-septies DPR 633/72',
    'N2.2': 'Non soggette — altri casi',
    'N3.1': 'Non imponibili — esportazioni',
    'N3.2': 'Non imponibili — cessioni intracomunitarie',
    'N3.5': 'Non imponibili — a seguito di dichiarazioni d\'intento',
    'N4':   'Esenti ex art. 10 DPR 633/72',
    'N5':   'Regime del margine / IVA non esposta',
    'N6.9': 'Inversione contabile — altri casi',
    'N7':   'IVA assolta in altro Stato UE',
  };

  // Riferimento normativo suggerito per le nature che lo richiedono in pratica.
  var NATURA_NORMA = {
    'N2.2': 'Operazione non soggetta a IVA ai sensi dell\'art. 1, commi 54-89, della Legge n. 190/2014 e successive modificazioni',
    'N4':   'Operazione esente ai sensi dell\'art. 10 del DPR 633/72',
    'N1':   'Somme escluse dalla base imponibile ai sensi dell\'art. 15 del DPR 633/72',
  };

  var TIPI_RITENUTA = {
    RT01: 'Ritenuta persone fisiche',
    RT02: 'Ritenuta persone giuridiche',
    RT03: 'Contributo INPS',
    RT04: 'Contributo ENASARCO',
    RT06: 'Altro contributo previdenziale',
  };

  var COND_PAGAMENTO = { TP01: 'A rate', TP02: 'Pagamento completo', TP03: 'Anticipo' };

  var MOD_PAGAMENTO = {
    MP01: 'Contanti', MP02: 'Assegno', MP05: 'Bonifico',
    MP08: 'Carta di pagamento', MP12: 'RIBA', MP19: 'SEPA Direct Debit',
  };

  // Imposta di bollo: €2 sulle fatture SENZA IVA di importo > €77,47
  // (DPR 642/1972, Tariffa art. 13). Sotto soglia non è dovuta.
  var BOLLO_AMOUNT = 2.00;
  var BOLLO_THRESHOLD = 77.47;

  // ─── Aritmetica in centesimi ───────────────────────────────────────────
  // Il bug che questo previene: 0.1 + 0.2 !== 0.3. Su una fattura con 12
  // righe lo scarto arriva a qualche centesimo e lo SdI rifiuta il documento
  // perché ImportoTotaleDocumento non torna con i DatiRiepilogo.
  function cents(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v == null ? 0 : v).replace(',', '.'));
    if (!isFinite(n)) n = 0;
    return Math.round(n * 100);
  }
  function eur(c) { return Math.round(c) / 100; }
  function fmtEur(c) {
    return (Math.round(c) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dec2(c) { return (Math.round(c) / 100).toFixed(2); }

  // ─── Totali ────────────────────────────────────────────────────────────
  /**
   * computeTotals(inv) — l'unica aritmetica della fattura.
   * Ritorna tutto in centesimi (interi) + `vatSummary`, il riepilogo per
   * aliquota che finisce identico nell'XML e nel PDF: se PDF e XML calcolano
   * per conto loro prima o poi divergono, e il cliente riceve due documenti
   * con due totali.
   */
  function computeTotals(inv) {
    var lines = (inv && inv.lines) || [];
    var buckets = {};   // key = rate|natura
    var taxable = 0;

    var rows = lines.map(function (l, i) {
      var qty = (l.qty === '' || l.qty == null) ? 1 : (parseFloat(String(l.qty).replace(',', '.')) || 0);
      var unit = cents(l.unitPrice);
      var discPct = parseFloat(String(l.discountPct || 0).replace(',', '.')) || 0;
      var gross = Math.round(unit * qty);
      var disc = Math.round(gross * discPct / 100);
      var total = gross - disc;
      var rate = parseFloat(String(l.vatRate == null ? 0 : l.vatRate).replace(',', '.')) || 0;
      var natura = rate === 0 ? (l.nature || 'N2.2') : '';
      var key = rate.toFixed(2) + '|' + natura;
      if (!buckets[key]) buckets[key] = { rate: rate, nature: natura, taxable: 0, vat: 0 };
      buckets[key].taxable += total;
      taxable += total;
      return {
        n: i + 1,
        description: l.description || '',
        qty: qty, unitPrice: unit, discountPct: discPct,
        total: total, vatRate: rate, nature: natura,
        withholding: !!l.withholding,
      };
    });

    // Imposta calcolata sul TOTALE dell'aliquota, non sulle singole righe.
    var vatSummary = Object.keys(buckets).map(function (k) {
      var b = buckets[k];
      b.vat = Math.round(b.taxable * b.rate) / 100;
      b.vat = Math.round(b.vat);
      return b;
    }).sort(function (a, b) { return b.rate - a.rate; });

    var vat = vatSummary.reduce(function (s, b) { return s + b.vat; }, 0);

    // Ritenuta d'acconto: aliquota su una QUOTA dell'imponibile
    // (es. agenti: 23% su 50% delle provvigioni = 11,5% effettivo).
    var wh = inv && inv.withholding;
    var withholdingAmount = 0;
    if (wh && wh.enabled) {
      var whBaseRows = rows.filter(function (r) { return r.withholding; });
      var whTaxable = whBaseRows.length
        ? whBaseRows.reduce(function (s, r) { return s + r.total; }, 0)
        : taxable;
      var sharePct = wh.basePct == null ? 100 : (parseFloat(String(wh.basePct).replace(',', '.')) || 0);
      var ratePct = parseFloat(String(wh.rate || 0).replace(',', '.')) || 0;
      withholdingAmount = Math.round(whTaxable * sharePct / 100 * ratePct / 100);
    }

    // Bollo: solo se NON c'è IVA esposta e l'imponibile supera la soglia.
    var bollo = 0;
    var bolloDue = vat === 0 && taxable > cents(BOLLO_THRESHOLD);
    var st = (inv && inv.stampDuty) || {};
    if (st.auto === false) bolloDue = !!st.enabled;
    if (bolloDue) bollo = cents(st.amount == null ? BOLLO_AMOUNT : st.amount);

    // Il bollo entra nel totale documento SOLO se riaddebitato al cliente.
    var bolloCharged = bolloDue && st.chargedToClient !== false ? bollo : 0;

    var total = taxable + vat + bolloCharged;
    var netToPay = total - withholdingAmount;

    return {
      rows: rows,
      vatSummary: vatSummary,
      taxable: taxable,
      vat: vat,
      withholding: withholdingAmount,
      stampDuty: bollo,
      stampDutyCharged: bolloCharged,
      stampDutyDue: bolloDue,
      total: total,
      netToPay: netToPay,
      // comodità per chi salva su Firestore in euro
      eur: {
        taxable: eur(taxable), vat: eur(vat), withholding: eur(withholdingAmount),
        stampDuty: eur(bollo), total: eur(total), netToPay: eur(netToPay),
      },
    };
  }

  // ─── Numerazione ───────────────────────────────────────────────────────
  /**
   * nextNumber(invoices, opts) — progressivo per ANNO e per SEZIONALE.
   *
   * La numerazione dev'essere progressiva e senza buchi nell'anno solare
   * (art. 21 c.2 lett. b DPR 633/72). Contare i documenti esistenti (quello
   * che faceva il portale: `S.invoices.length + 1`) sbaglia appena si
   * cancella una bozza: il numero si RIPETE. Qui si legge il massimo
   * progressivo effettivamente emesso, per anno e sezionale.
   *
   * Le bozze non consumano numero: un documento prende il numero quando viene
   * EMESSO, non quando viene aperto l'editor.
   */
  function nextNumber(invoices, opts) {
    opts = opts || {};
    var year = opts.year || new Date().getFullYear();
    var sez = (opts.sezionale || '').trim();
    var max = 0;
    (invoices || []).forEach(function (inv) {
      if (!inv) return;
      if (inv.status === 'draft' || inv.status === 'void') return;
      var y = inv.year || (inv.date ? parseInt(String(inv.date).slice(0, 4), 10) : null);
      if (!y && inv.number) { var m0 = String(inv.number).match(/(20\d\d)/); if (m0) y = parseInt(m0[1], 10); }
      if (y !== year) return;
      if ((inv.sezionale || '').trim() !== sez) return;
      var p = inv.progressive;
      if (p == null && inv.number) {
        var m = String(inv.number).match(/(\d+)\s*$/) || String(inv.number).match(/^(\d+)/);
        if (m) p = parseInt(m[1], 10);
      }
      p = parseInt(p, 10);
      if (isFinite(p) && p > max) max = p;
    });
    var progressive = max + 1;
    return {
      progressive: progressive,
      year: year,
      sezionale: sez,
      // Formato AdE-friendly: "12/2026" o "12-A/2026" col sezionale.
      number: progressive + (sez ? '-' + sez : '') + '/' + year,
    };
  }

  // ─── Validazione ───────────────────────────────────────────────────────
  // Partita IVA italiana: 11 cifre, checksum Luhn a pesi alternati.
  function checkVat(v) {
    var s = String(v || '').replace(/[^0-9]/g, '');
    if (s.length !== 11) return false;
    var sum = 0;
    for (var i = 0; i < 11; i++) {
      var d = s.charCodeAt(i) - 48;
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10 === 0;
  }

  var CF_ODD = { '0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,
    'A':1,'B':0,'C':5,'D':7,'E':9,'F':13,'G':15,'H':17,'I':19,'J':21,'K':2,'L':4,
    'M':18,'N':20,'O':11,'P':3,'Q':6,'R':8,'S':12,'T':14,'U':16,'V':10,'W':22,'X':25,'Y':24,'Z':23 };
  function checkCf(cf) {
    var s = String(cf || '').toUpperCase().replace(/\s/g, '');
    if (/^\d{11}$/.test(s)) return checkVat(s);         // CF numerico = P.IVA
    if (!/^[A-Z0-9]{16}$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 15; i++) {
      var ch = s[i];
      if (i % 2 === 0) sum += CF_ODD[ch];
      else { var v = /\d/.test(ch) ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 65; sum += v; }
    }
    return String.fromCharCode(65 + (sum % 26)) === s[15];
  }

  /**
   * validate(inv, seller) — cosa lo SdI scarterebbe, DETTO PRIMA.
   * Uno scarto SdI arriva giorni dopo via PEC e va gestito a mano: molto
   * meglio bloccare qui. `error` impedisce l'emissione, `warn` no.
   */
  function validate(inv, seller) {
    var out = [];
    var E = function (field, msg) { out.push({ level: 'error', field: field, msg: msg }); };
    var W = function (field, msg) { out.push({ level: 'warn', field: field, msg: msg }); };
    inv = inv || {}; seller = seller || {};
    var b = inv.buyer || {};

    // Emittente
    if (!seller.name) E('seller.name', 'Manca la denominazione dell\'emittente (Impostazioni → Dati fatturazione)');
    if (!seller.vat) E('seller.vat', 'Manca la Partita IVA dell\'emittente');
    else if ((seller.country || 'IT') === 'IT' && !checkVat(seller.vat)) E('seller.vat', 'Partita IVA emittente non valida (checksum)');
    if (!seller.address || !seller.zip || !seller.city) E('seller.sede', 'Sede dell\'emittente incompleta (indirizzo, CAP, comune)');
    if ((seller.country || 'IT') === 'IT' && !/^\d{5}$/.test(String(seller.zip || ''))) E('seller.zip', 'CAP emittente: 5 cifre');
    if (!seller.regime) W('seller.regime', 'Regime fiscale non impostato — si assume RF01 ordinario');

    // Destinatario
    var foreign = (b.country || 'IT') !== 'IT';
    if (!buyerName(b)) E('buyer.name', 'Manca il nome/denominazione del cliente');
    if (!foreign && !b.vat && !b.cf) E('buyer.cf', 'Il cliente deve avere Partita IVA o Codice Fiscale');
    if (b.vat && !foreign && !checkVat(b.vat)) E('buyer.vat', 'Partita IVA cliente non valida (checksum)');
    if (b.cf && !foreign && !checkCf(b.cf)) W('buyer.cf', 'Codice fiscale cliente non valido (checksum) — verificare');
    if (!b.address || !b.city) E('buyer.sede', 'Sede del cliente incompleta (indirizzo, comune)');
    if (!foreign && !/^\d{5}$/.test(String(b.zip || ''))) E('buyer.zip', 'CAP cliente: 5 cifre');

    // Recapito elettronico
    var sdi = String(b.sdiCode || '').trim().toUpperCase();
    if (foreign) {
      if (sdi && sdi !== 'XXXXXXX') W('buyer.sdiCode', 'Cliente estero: il codice destinatario deve essere XXXXXXX');
    } else if (b.vat) {
      // B2B: serve un recapito, altrimenti la fattura resta nel cassetto fiscale
      if (!sdi && !b.pec) E('buyer.sdiCode', 'Cliente con P.IVA: serve il Codice Destinatario (7 caratteri) o la PEC');
      else if (sdi && sdi !== '0000000' && !/^[A-Z0-9]{6,7}$/.test(sdi)) E('buyer.sdiCode', 'Codice Destinatario: 7 caratteri alfanumerici (6 per la P.A.)');
    } else {
      // B2C: 0000000 è corretto, la fattura finisce nel cassetto fiscale
      if (sdi && sdi !== '0000000' && !/^[A-Z0-9]{6,7}$/.test(sdi)) E('buyer.sdiCode', 'Codice Destinatario non valido');
    }

    // Documento
    if (!inv.date) E('date', 'Manca la data del documento');
    if (!inv.number && inv.status && inv.status !== 'draft') E('number', 'Manca il numero del documento');
    var lines = inv.lines || [];
    if (!lines.length) E('lines', 'La fattura non ha righe');
    lines.forEach(function (l, i) {
      if (!l.description) E('lines[' + i + '].description', 'Riga ' + (i + 1) + ': manca la descrizione');
      var rate = parseFloat(l.vatRate);
      if (!isFinite(rate)) E('lines[' + i + '].vatRate', 'Riga ' + (i + 1) + ': aliquota IVA mancante');
      else if (rate === 0 && !l.nature) E('lines[' + i + '].nature', 'Riga ' + (i + 1) + ': aliquota 0% richiede il codice Natura');
      if (!cents(l.unitPrice)) W('lines[' + i + '].unitPrice', 'Riga ' + (i + 1) + ': importo a zero');
    });

    // Coerenza regime ↔ aliquote: il forfettario che espone IVA viene scartato.
    if (seller.regime === 'RF19' && lines.some(function (l) { return parseFloat(l.vatRate) > 0; })) {
      E('lines', 'Regime forfettario (RF19): nessuna riga può esporre IVA — usare aliquota 0% con Natura N2.2');
    }

    var t = computeTotals(inv);
    if (t.stampDutyDue && !inv.stampDuty) W('stampDuty', 'Documento senza IVA sopra €77,47: dovuta l\'imposta di bollo da €2,00');
    if (t.total <= 0 && inv.docType !== 'TD04') W('total', 'Totale documento non positivo');

    return out;
  }

  function buyerName(b) {
    b = b || {};
    if (b.name) return String(b.name).trim();
    var n = [b.firstName, b.lastName].filter(Boolean).join(' ').trim();
    return n || '';
  }

  // ─── XML FatturaPA 1.2.2 ───────────────────────────────────────────────
  function xesc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  // Lo SdI accetta un sottoinsieme latino: gli accenti passano, gli emoji no.
  function xtext(s, max) {
    var v = String(s == null ? '' : s).replace(/[ -]/g, ' ')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/\s+/g, ' ').trim();
    if (max && v.length > max) v = v.slice(0, max);
    return xesc(v);
  }
  function tag(name, value) { return '<' + name + '>' + value + '</' + name + '>'; }

  /**
   * buildXML(inv, seller, opts) → stringa XML FatturaPA (FPR12).
   *
   * È il documento fiscale vero. Il PDF che il portale già stampava è la
   * copia di cortesia — senza questo file non è mai stata emessa una fattura.
   */
  function buildXML(inv, seller, opts) {
    opts = opts || {};
    inv = inv || {}; seller = seller || {};
    var b = inv.buyer || {};
    var t = computeTotals(inv);
    var sellerCountry = seller.country || 'IT';
    var buyerCountry = b.country || 'IT';
    var foreign = buyerCountry !== 'IT';

    var progressivo = opts.progressivo || toBase36(inv.progressive || 1);
    var sdi = String(b.sdiCode || '').trim().toUpperCase();
    if (foreign) sdi = 'XXXXXXX';
    else if (!sdi) sdi = '0000000';

    var x = [];
    x.push('<?xml version="1.0" encoding="UTF-8"?>');
    x.push('<p:FatturaElettronica versione="FPR12" ' +
      'xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 ' +
      'http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2.2/Schema_del_file_xml_FatturaPA_v1.2.2.xsd">');

    // ── Header ──
    x.push('<FatturaElettronicaHeader>');
    x.push('<DatiTrasmissione>');
    x.push('<IdTrasmittente>' + tag('IdPaese', sellerCountry) +
      tag('IdCodice', xtext(seller.vat, 28)) + '</IdTrasmittente>');
    x.push(tag('ProgressivoInvio', xtext(progressivo, 10)));
    x.push(tag('FormatoTrasmissione', 'FPR12'));
    x.push(tag('CodiceDestinatario', xtext(sdi, 7)));
    if (sdi === '0000000' && b.pec) x.push(tag('PECDestinatario', xtext(b.pec, 256)));
    x.push('</DatiTrasmissione>');

    // Cedente/prestatore (chi emette)
    x.push('<CedentePrestatore><DatiAnagrafici>');
    x.push('<IdFiscaleIVA>' + tag('IdPaese', sellerCountry) + tag('IdCodice', xtext(seller.vat, 28)) + '</IdFiscaleIVA>');
    if (seller.cf && seller.cf !== seller.vat) x.push(tag('CodiceFiscale', xtext(seller.cf, 16)));
    x.push('<Anagrafica>' + tag('Denominazione', xtext(seller.name, 80)) + '</Anagrafica>');
    x.push(tag('RegimeFiscale', seller.regime || 'RF01'));
    x.push('</DatiAnagrafici>');
    x.push(sede(seller));
    if (seller.reaNumber && seller.reaOffice) {
      x.push('<IscrizioneREA>' + tag('Ufficio', xtext(seller.reaOffice, 2).toUpperCase()) +
        tag('NumeroREA', xtext(seller.reaNumber, 20)) +
        (seller.shareCapital ? tag('CapitaleSociale', dec2(cents(seller.shareCapital))) : '') +
        (seller.soleShareholder ? tag('SocioUnico', seller.soleShareholder) : '') +
        tag('StatoLiquidazione', seller.liquidation || 'LN') + '</IscrizioneREA>');
    }
    if (seller.phone || seller.email) {
      x.push('<Contatti>' + (seller.phone ? tag('Telefono', xtext(seller.phone, 12)) : '') +
        (seller.email ? tag('Email', xtext(seller.email, 256)) : '') + '</Contatti>');
    }
    x.push('</CedentePrestatore>');

    // Cessionario/committente (il cliente)
    x.push('<CessionarioCommittente><DatiAnagrafici>');
    if (b.vat) x.push('<IdFiscaleIVA>' + tag('IdPaese', buyerCountry) + tag('IdCodice', xtext(b.vat, 28)) + '</IdFiscaleIVA>');
    if (b.cf && b.cf !== b.vat) x.push(tag('CodiceFiscale', xtext(b.cf, 16)));
    if (b.firstName && b.lastName && !b.name) {
      x.push('<Anagrafica>' + tag('Nome', xtext(b.firstName, 60)) + tag('Cognome', xtext(b.lastName, 60)) + '</Anagrafica>');
    } else {
      x.push('<Anagrafica>' + tag('Denominazione', xtext(buyerName(b), 80)) + '</Anagrafica>');
    }
    x.push('</DatiAnagrafici>');
    x.push(sede(b));
    x.push('</CessionarioCommittente>');
    x.push('</FatturaElettronicaHeader>');

    // ── Body ──
    x.push('<FatturaElettronicaBody>');
    x.push('<DatiGenerali><DatiGeneraliDocumento>');
    x.push(tag('TipoDocumento', inv.docType || 'TD01'));
    x.push(tag('Divisa', inv.currency || 'EUR'));
    x.push(tag('Data', isoDate(inv.date)));
    x.push(tag('Numero', xtext(inv.number, 20)));
    if (t.withholding > 0) {
      var wh = inv.withholding || {};
      var effRate = t.taxable ? (t.withholding / t.taxable * 100) : 0;
      x.push('<DatiRitenuta>' +
        tag('TipoRitenuta', wh.type || 'RT02') +
        tag('ImportoRitenuta', dec2(t.withholding)) +
        tag('AliquotaRitenuta', (Math.round(effRate * 100) / 100).toFixed(2)) +
        tag('CausalePagamento', wh.causale || 'A') + '</DatiRitenuta>');
    }
    if (t.stampDutyDue) {
      x.push('<DatiBollo>' + tag('BolloVirtuale', 'SI') + tag('ImportoBollo', dec2(t.stampDuty)) + '</DatiBollo>');
    }
    x.push(tag('ImportoTotaleDocumento', dec2(t.total)));
    causaleLines(inv).forEach(function (c) { x.push(tag('Causale', xtext(c, 200))); });
    x.push('</DatiGeneraliDocumento>');
    if (inv.relatedDoc && inv.relatedDoc.number) {
      x.push('<DatiFatture' + 'Collegate>' + tag('IdDocumento', xtext(inv.relatedDoc.number, 20)) +
        (inv.relatedDoc.date ? tag('Data', isoDate(inv.relatedDoc.date)) : '') + '</DatiFattureCollegate>');
    }
    x.push('</DatiGenerali>');

    x.push('<DatiBeniServizi>');
    t.rows.forEach(function (r) {
      x.push('<DettaglioLinee>');
      x.push(tag('NumeroLinea', r.n));
      x.push(tag('Descrizione', xtext(r.description, 1000)));
      x.push(tag('Quantita', r.qty.toFixed(2)));
      x.push(tag('PrezzoUnitario', dec2(r.unitPrice)));
      if (r.discountPct) {
        x.push('<ScontoMaggiorazione>' + tag('Tipo', 'SC') + tag('Percentuale', r.discountPct.toFixed(2)) + '</ScontoMaggiorazione>');
      }
      x.push(tag('PrezzoTotale', dec2(r.total)));
      x.push(tag('AliquotaIVA', r.vatRate.toFixed(2)));
      if (r.vatRate === 0) x.push(tag('Natura', r.nature || 'N2.2'));
      if (r.withholding && t.withholding > 0) x.push(tag('Ritenuta', 'SI'));
      x.push('</DettaglioLinee>');
    });
    t.vatSummary.forEach(function (b2) {
      x.push('<DatiRiepilogo>');
      x.push(tag('AliquotaIVA', b2.rate.toFixed(2)));
      if (b2.rate === 0) x.push(tag('Natura', b2.nature || 'N2.2'));
      x.push(tag('ImponibileImporto', dec2(b2.taxable)));
      x.push(tag('Imposta', dec2(b2.vat)));
      x.push(tag('EsigibilitaIVA', inv.vatExigibility || 'I'));
      if (b2.rate === 0) {
        var norma = (inv.naturaNorma && inv.naturaNorma[b2.nature]) || NATURA_NORMA[b2.nature];
        if (norma) x.push(tag('RiferimentoNormativo', xtext(norma, 100)));
      }
      x.push('</DatiRiepilogo>');
    });
    x.push('</DatiBeniServizi>');

    var pay = inv.payment || {};
    x.push('<DatiPagamento>');
    x.push(tag('CondizioniPagamento', pay.condition || 'TP02'));
    x.push('<DettaglioPagamento>');
    x.push(tag('ModalitaPagamento', pay.method || 'MP05'));
    if (inv.dueDate) x.push(tag('DataScadenzaPagamento', isoDate(inv.dueDate)));
    x.push(tag('ImportoPagamento', dec2(t.netToPay)));
    if (pay.iban) x.push(tag('IBAN', String(pay.iban).replace(/\s/g, '').toUpperCase()));
    if (pay.bank) x.push(tag('IstitutoFinanziario', xtext(pay.bank, 80)));
    x.push('</DettaglioPagamento>');
    x.push('</DatiPagamento>');

    x.push('</FatturaElettronicaBody>');
    x.push('</p:FatturaElettronica>');
    return x.join('\n');
  }

  function sede(p) {
    p = p || {};
    var s = '<Sede>';
    s += tag('Indirizzo', xtext(p.address, 60));
    if (p.streetNumber) s += tag('NumeroCivico', xtext(p.streetNumber, 8));
    s += tag('CAP', xtext(String(p.zip || '00000').replace(/\D/g, '').padStart(5, '0').slice(0, 5), 5));
    s += tag('Comune', xtext(p.city, 60));
    if (p.province && (p.country || 'IT') === 'IT') s += tag('Provincia', xtext(p.province, 2).toUpperCase());
    s += tag('Nazione', (p.country || 'IT').toUpperCase());
    s += '</Sede>';
    return s;
  }

  function causaleLines(inv) {
    var raw = (inv && (inv.causale || inv.notes)) || '';
    if (!raw) return [];
    // Il campo Causale è limitato a 200 char e può ripetersi: si spezza
    // invece di troncare, così la nota al cliente non perde la coda.
    var words = String(raw).replace(/\s+/g, ' ').trim().split(' ');
    var out = [], cur = '';
    words.forEach(function (w) {
      if ((cur + ' ' + w).trim().length > 195) { out.push(cur.trim()); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if (cur) out.push(cur);
    return out.slice(0, 10);
  }

  function isoDate(d) {
    if (!d) return new Date().toISOString().slice(0, 10);
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    var dt = d && d.toDate ? d.toDate() : new Date(d);
    if (isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
    // Data locale, non UTC: una fattura emessa alle 01:00 del 1° gennaio a
    // Roma non deve datarsi 31 dicembre dell'anno prima.
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }

  function toBase36(n) {
    return String(Number(n) || 1).padStart(5, '0').slice(-5);
  }

  /**
   * xmlFilename(seller, progressive) — nome file richiesto dallo SdI:
   * IT<identificativo>_<progressivo alfanumerico>.xml
   */
  function xmlFilename(seller, progressive) {
    var id = String((seller && (seller.vat || seller.cf)) || '00000000000').replace(/[^A-Za-z0-9]/g, '');
    var country = ((seller && seller.country) || 'IT').toUpperCase();
    return country + id + '_' + toBase36(progressive) + '.xml';
  }

  // ─── Default sensati ───────────────────────────────────────────────────
  function emptyInvoice(seller, opts) {
    opts = opts || {};
    seller = seller || {};
    var forfettario = seller.regime === 'RF19' || seller.regime === 'RF02';
    var today = isoDate(new Date());
    return {
      docType: 'TD01',
      status: 'draft',
      date: today,
      dueDate: opts.dueDate || addDays(today, seller.paymentTermsDays == null ? 30 : seller.paymentTermsDays),
      currency: 'EUR',
      sezionale: seller.sezionale || '',
      buyer: { country: 'IT', kind: 'company', sdiCode: '', pec: '' },
      lines: [{
        description: '', qty: 1, unitPrice: '',
        vatRate: forfettario ? 0 : (seller.defaultVatRate == null ? 22 : seller.defaultVatRate),
        nature: forfettario ? 'N2.2' : '',
        withholding: false,
      }],
      withholding: { enabled: false, type: 'RT02', rate: 20, basePct: 100, causale: 'A' },
      stampDuty: { auto: true, amount: BOLLO_AMOUNT, chargedToClient: true },
      payment: {
        condition: 'TP02',
        method: seller.defaultPaymentMethod || 'MP05',
        iban: seller.iban || '',
        bank: seller.bank || '',
      },
      causale: '', notes: '',
    };
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + (Number(n) || 0));
    return isoDate(d);
  }

  /**
   * creditNoteFrom(inv) — nota di credito TD04 che STORNA la fattura.
   * Una fattura emessa non si cancella e non si modifica: si storna. Il
   * portale finora offriva 🗑 Elimina su un documento fiscale — che è
   * esattamente la cosa da non fare.
   */
  function creditNoteFrom(inv, opts) {
    opts = opts || {};
    var src = JSON.parse(JSON.stringify(inv || {}));
    delete src.id; delete src.number; delete src.progressive;
    src.docType = 'TD04';
    src.status = 'draft';
    src.date = opts.date || isoDate(new Date());
    src.dueDate = null;
    src.relatedDoc = { number: inv.number, date: isoDate(inv.date) };
    src.causale = opts.reason
      ? 'Storno fattura n. ' + inv.number + ' — ' + opts.reason
      : 'Storno totale fattura n. ' + inv.number;
    if (opts.partialLines) src.lines = opts.partialLines;
    src.paidDate = null;
    return src;
  }

  var API = {
    DOC_TYPES: DOC_TYPES, REGIMI: REGIMI, NATURE: NATURE, NATURA_NORMA: NATURA_NORMA,
    TIPI_RITENUTA: TIPI_RITENUTA, COND_PAGAMENTO: COND_PAGAMENTO, MOD_PAGAMENTO: MOD_PAGAMENTO,
    BOLLO_AMOUNT: BOLLO_AMOUNT, BOLLO_THRESHOLD: BOLLO_THRESHOLD,
    cents: cents, eur: eur, fmtEur: fmtEur, dec2: dec2,
    computeTotals: computeTotals, nextNumber: nextNumber, validate: validate,
    checkVat: checkVat, checkCf: checkCf, buyerName: buyerName,
    buildXML: buildXML, xmlFilename: xmlFilename, isoDate: isoDate, addDays: addDays,
    emptyInvoice: emptyInvoice, creditNoteFrom: creditNoteFrom,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_INVOICE = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
