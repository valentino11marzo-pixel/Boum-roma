/* BOOM · Fattura Engine — FatturaPA, puro, senza dipendenze, testato.
 *
 * UN motore per DUE forme di documento, perché il gruppo emette da due
 * soggetti con aritmetiche diverse:
 *
 *   'provvigione' → TD01. Egidi Immobiliare S.r.l.: provvigioni sui
 *                   contratti e servizi BOOM. IVA 22%, nessuna cassa,
 *                   nessuna ritenuta (una S.r.l. non la subisce).
 *   'parcella'    → TD06. Studio legale: onorari + spese generali 15%
 *                   (DM 55/2014 art. 2) + CPA 4% (TC01, IMPONIBILE IVA
 *                   ex art. 11 L. 576/1980) + IVA 22%, spese anticipate
 *                   in nome e per conto ESCLUSE ex art. 15 DPR 633/72
 *                   (natura N1), ritenuta d'acconto 20% sui soli
 *                   compensi — MAI sulla CPA, MAI sull'art. 15.
 *
 * DUE REGOLE DURE, entrambe pinnate nei test:
 *
 *  1. TUTTA l'aritmetica gira in CENTESIMI INTERI. Un centesimo di scarto
 *     fra DatiRiepilogo e ImportoTotaleDocumento fa scartare il file dallo
 *     SdI (controlli 00419/00422/00423) e lo scarto arriva ore dopo, per
 *     email, senza dire quale riga. I float non entrano nel motore: si
 *     convertono alla porta e si formattano all'uscita.
 *
 *  2. Il motore NON INVENTA MAI un dato fiscale. P.IVA senza checksum
 *     valido, codice destinatario di lunghezza sbagliata, aliquota a zero
 *     senza natura → il documento è `ok:false` con l'elenco dei motivi, e
 *     nessun XML esce. Un XML formalmente valido con dentro una P.IVA
 *     sbagliata è peggio di nessun XML: viene accettato dallo SdI e
 *     recapitato al soggetto sbagliato.
 *
 * Il trasporto NON vive qui. L'XML prodotto è identico che finisca
 * importato nel gestionale (TIC/Zucchetti), spedito via PEC allo SdI o
 * passato a un provider via API: la porta è un adattatore, non una
 * variante del documento.
 *
 * Codice fiscale e IBAN NON si rivalidano qui: si delega a
 * js/dataops-engine.js (stesso pattern di radar-engine → market-engine),
 * che li valida gia' per l'Innesto — omocodia compresa. Una seconda copia
 * divergerebbe, e il giorno che diverge un CF valido viene rifiutato da una
 * porta e accettato dall'altra. La partita IVA invece nasce qui: nel repo
 * non esisteva.
 *
 * Esposto come window.BOOM_FATTURA (browser) e module.exports (Node/test).
 */
(function (root) {
  'use strict';

  var DO = (typeof module !== 'undefined' && module.exports)
    ? require('./dataops-engine.js')
    : (root && root.BOOM_DATAOPS);
  if (!DO) throw new Error('fattura-engine richiede dataops-engine (BOOM_DATAOPS)');

  // ─── Costanti normative (default; ogni voce è una manopola) ──────────
  var DEFAULTS = {
    aliquotaIva: 22,          // %  aliquota ordinaria
    speseGeneraliPct: 15,     // %  su onorari — DM 55/2014 art. 2
    cassaPct: 4,              // %  CPA Cassa Forense — L. 576/1980
    ritenutaPct: 20,          // %  acconto IRPEF — DPR 600/73 art. 25
    bolloEur: 2,              // €  imposta di bollo
    bolloSogliaEur: 77.47     // €  soglia oltre la quale il bollo è dovuto
  };

  var TIPO_CASSA_FORENSE = 'TC01';
  var CAUSALE_RIT_AUTONOMO = 'A';   // lavoro autonomo abituale
  var NATURA_ART15 = 'N1';          // escluse ex art. 15
  var RIFNORM_ART15 = 'Escluse ex art. 15 DPR 633/72';

  // ─── Denaro: centesimi interi, arrotondamento half-up ────────────────
  function toCents(v) {
    if (v === null || v === undefined || v === '') return 0;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n)) return 0;
    return Math.round(n * 100);
  }
  function pctOf(cents, pct) {
    // half-up esplicito: Math.round(-0.5) = -0 in JS, e una nota di
    // credito ha importi negativi.
    var raw = cents * pct / 100;
    return raw >= 0 ? Math.floor(raw + 0.5) : -Math.floor(-raw + 0.5);
  }
  function eur(cents) {
    var neg = cents < 0, a = Math.abs(cents);
    return (neg ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
  }
  function dec2(n) { return (Math.round(Number(n) * 100) / 100).toFixed(2); }

  // ─── Validatori (nessuno "aggiusta": o passa o dice perché) ──────────
  function validPIva(s) {
    var v = String(s || '').replace(/\s/g, '');
    if (!/^\d{11}$/.test(v)) return false;
    var sum = 0;
    for (var i = 0; i < 11; i++) {
      var d = v.charCodeAt(i) - 48;
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10 === 0;
  }

  // Il codice fiscale di una societa' E' la sua partita IVA (11 cifre) —
  // caso che dataops non copre perche' l'Innesto vede solo persone fisiche.
  // Le 16 posizioni, omocodia inclusa, restano di la'.
  function validCF(s) {
    var v = String(s || '').toUpperCase().replace(/\s/g, '');
    if (/^\d{11}$/.test(v)) return validPIva(v);
    return DO.validateCF(v).valid === true;
  }

  // Codice destinatario: 7 caratteri per i privati, 6 per la PA.
  // '0000000' = nessun canale telematico → serve la PEC del destinatario.
  function validCodiceDest(s) { return /^[A-Z0-9]{6,7}$/.test(String(s || '').toUpperCase()); }
  function validIban(s) { return DO.validateIBAN(s).valid === true; }

  // ─── Il calcolo ──────────────────────────────────────────────────────
  //
  // input = {
  //   kind: 'provvigione' | 'parcella',
  //   righe: [{ descrizione, imponibile, quantita?, aliquotaIva?, natura?,
  //             art15?:bool, ritenuta?:bool }],
  //   cfg?: { …DEFAULTS },
  //   speseGenerali?: bool | number   // parcella: true = 15% sugli onorari,
  //                                   // un numero = percentuale esplicita,
  //                                   // false/0 = non addebitate
  //   cassa?: bool,       // default: true su parcella, false su provvigione
  //   ritenuta?: bool,    // default: true su parcella, false su provvigione
  // }
  function compute(input) {
    input = input || {};
    var cfg = Object.assign({}, DEFAULTS, input.cfg || {});
    var kind = input.kind === 'parcella' ? 'parcella' : 'provvigione';
    var isParcella = kind === 'parcella';
    var errors = [];

    var righe = Array.isArray(input.righe) ? input.righe : [];
    if (!righe.length) errors.push('Nessuna riga: un documento senza righe non esiste.');

    var wantCassa    = input.cassa    === undefined ? isParcella : !!input.cassa;
    var wantRitenuta = input.ritenuta === undefined ? isParcella : !!input.ritenuta;

    var sgPct = 0;
    if (isParcella && input.speseGenerali !== false && input.speseGenerali !== 0) {
      sgPct = (typeof input.speseGenerali === 'number')
        ? input.speseGenerali
        : (input.speseGenerali === true || input.speseGenerali === undefined ? cfg.speseGeneraliPct : 0);
    }

    // 1. Le righe, normalizzate. Una riga art.15 è per costruzione a
    //    aliquota 0 con natura N1 e fuori dalla base della ritenuta.
    var lines = [];
    righe.forEach(function (r, i) {
      var art15 = !!r.art15;
      var qta = (r.quantita === undefined || r.quantita === null) ? null : Number(r.quantita);
      var unit = toCents(r.imponibile);
      var tot = qta === null ? unit : pctOf(unit * qta, 100);
      var desc = String(r.descrizione || '').trim();
      if (!desc) errors.push('Riga ' + (i + 1) + ': descrizione mancante.');
      var aliq = art15 ? 0 : (r.aliquotaIva === undefined ? cfg.aliquotaIva : Number(r.aliquotaIva));
      var natura = art15 ? NATURA_ART15 : (r.natura || null);
      if (aliq === 0 && !natura) {
        errors.push('Riga ' + (i + 1) + ': aliquota 0% senza codice Natura — lo SdI scarta (00429).');
      }
      lines.push({
        n: lines.length + 1,
        descrizione: desc.slice(0, 1000),
        quantita: qta,
        prezzoUnitario: unit,
        prezzoTotale: tot,
        aliquotaIva: aliq,
        natura: natura,
        art15: art15,
        // Sulla parcella onorari e spese generali subiscono la ritenuta;
        // le spese anticipate no. Un flag esplicito vince sempre.
        ritenuta: r.ritenuta !== undefined ? !!r.ritenuta : (wantRitenuta && !art15)
      });
    });

    // 2. Spese generali forfettarie — calcolate sui soli compensi
    //    (righe non-art.15), come riga propria e visibile.
    var compensiCents = lines.reduce(function (s, l) { return l.art15 ? s : s + l.prezzoTotale; }, 0);
    var speseGeneraliCents = 0;
    if (sgPct > 0) {
      speseGeneraliCents = pctOf(compensiCents, sgPct);
      lines.push({
        n: lines.length + 1,
        descrizione: 'Spese generali ' + dec2(sgPct) + '% (art. 2 DM 55/2014)',
        quantita: null,
        prezzoUnitario: speseGeneraliCents,
        prezzoTotale: speseGeneraliCents,
        aliquotaIva: cfg.aliquotaIva,
        natura: null,
        art15: false,
        ritenuta: wantRitenuta
      });
    }

    // 3. Cassa 4% su (compensi + spese generali). NON è una riga: viaggia
    //    in DatiCassaPrevidenziale e si somma all'imponibile del riepilogo.
    var baseCassa = compensiCents + speseGeneraliCents;
    var cassaCents = wantCassa ? pctOf(baseCassa, cfg.cassaPct) : 0;

    // 4. Riepiloghi per (aliquota, natura). La cassa entra nel riepilogo
    //    della propria aliquota IVA — è imponibile, non un extra.
    var buckets = {};
    function bucket(aliq, natura) {
      var k = dec2(aliq) + '|' + (natura || '');
      if (!buckets[k]) buckets[k] = { aliquotaIva: aliq, natura: natura || null, imponibile: 0, imposta: 0 };
      return buckets[k];
    }
    lines.forEach(function (l) { bucket(l.aliquotaIva, l.natura).imponibile += l.prezzoTotale; });
    if (cassaCents) bucket(cfg.aliquotaIva, null).imponibile += cassaCents;

    var riepiloghi = Object.keys(buckets).map(function (k) { return buckets[k]; });
    riepiloghi.forEach(function (b) { b.imposta = pctOf(b.imponibile, b.aliquotaIva); });
    riepiloghi.sort(function (a, b) { return b.aliquotaIva - a.aliquotaIva; });

    var imponibileTot = riepiloghi.reduce(function (s, b) { return s + b.imponibile; }, 0);
    var impostaTot    = riepiloghi.reduce(function (s, b) { return s + b.imposta; }, 0);

    // 5. Ritenuta d'acconto — sui soli compensi assoggettati.
    //    MAI sulla cassa (rivalsa CPA esclusa), MAI sull'art. 15.
    var baseRitenuta = lines.reduce(function (s, l) { return l.ritenuta ? s + l.prezzoTotale : s; }, 0);
    var ritenutaCents = wantRitenuta ? pctOf(baseRitenuta, cfg.ritenutaPct) : 0;

    // 6. Bollo — dovuto sugli importi NON soggetti a IVA oltre soglia.
    var fuoriIvaCents = riepiloghi.reduce(function (s, b) {
      return b.aliquotaIva === 0 ? s + b.imponibile : s;
    }, 0);
    var bolloDovuto = input.bollo !== undefined
      ? !!input.bollo
      : fuoriIvaCents > toCents(cfg.bolloSogliaEur);
    var bolloCents = bolloDovuto ? toCents(cfg.bolloEur) : 0;

    // 7. Totali. ImportoTotaleDocumento è il LORDO (imponibile + IVA);
    //    la ritenuta si sottrae nel pagamento, non nel documento.
    var totaleDocumento = imponibileTot + impostaTot;
    var nettoAPagare = totaleDocumento - ritenutaCents;

    return {
      ok: errors.length === 0,
      errors: errors,
      kind: kind,
      tipoDocumento: isParcella ? 'TD06' : 'TD01',
      cfg: cfg,
      lines: lines,
      riepiloghi: riepiloghi,
      cassa: cassaCents ? {
        tipo: TIPO_CASSA_FORENSE, aliquota: cfg.cassaPct,
        imponibile: baseCassa, importo: cassaCents, aliquotaIva: cfg.aliquotaIva
      } : null,
      ritenuta: ritenutaCents ? {
        aliquota: cfg.ritenutaPct, base: baseRitenuta, importo: ritenutaCents,
        causale: CAUSALE_RIT_AUTONOMO
      } : null,
      bollo: bolloCents ? { importo: bolloCents, virtuale: true } : null,
      totali: {
        compensi: compensiCents,
        speseGenerali: speseGeneraliCents,
        imponibile: imponibileTot,
        imposta: impostaTot,
        totaleDocumento: totaleDocumento,
        ritenuta: ritenutaCents,
        nettoAPagare: nettoAPagare
      }
    };
  }

  // ─── XML ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function tag(name, val) { return '<' + name + '>' + esc(val) + '</' + name + '>'; }
  function opt(name, val) {
    return (val === null || val === undefined || val === '') ? '' : tag(name, val);
  }

  function anagrafica(p) {
    if (p.denominazione) return tag('Denominazione', String(p.denominazione).slice(0, 80));
    return tag('Nome', String(p.nome || '').slice(0, 60)) +
           tag('Cognome', String(p.cognome || '').slice(0, 60));
  }
  function sede(s) {
    s = s || {};
    return '<Sede>' +
      tag('Indirizzo', String(s.indirizzo || '').slice(0, 60)) +
      opt('NumeroCivico', s.civico) +
      tag('CAP', String(s.cap || '')) +
      tag('Comune', String(s.comune || '').slice(0, 60)) +
      opt('Provincia', s.provincia ? String(s.provincia).toUpperCase().slice(0, 2) : '') +
      tag('Nazione', s.nazione || 'IT') +
      '</Sede>';
  }

  // Il progressivo di invio deve essere unico per trasmittente: si DERIVA
  // dal numero documento, così un rinvio dello stesso documento produce
  // lo stesso progressivo e non nasce un doppione allo SdI.
  function progressivo(numero) {
    var h = 0, s = String(numero || '');
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h.toString(36).toUpperCase().padStart(5, '0').slice(-5);
  }

  function validateParties(emit, cli) {
    var e = [];
    if (!validPIva(emit.partitaIva)) e.push('Partita IVA emittente non valida (checksum): ' + (emit.partitaIva || '—'));
    if (!emit.regimeFiscale) e.push('Regime fiscale emittente mancante (es. RF01).');
    if (!(emit.sede && emit.sede.cap && emit.sede.comune)) e.push('Sede emittente incompleta (CAP/Comune).');
    if (!(emit.denominazione || (emit.nome && emit.cognome))) e.push('Denominazione o nome+cognome emittente mancanti.');

    var hasPiva = !!cli.partitaIva, hasCf = !!cli.codiceFiscale;
    if (!hasPiva && !hasCf) e.push('Cliente senza P.IVA né codice fiscale: lo SdI scarta (00417).');
    if (hasPiva && !validPIva(cli.partitaIva)) e.push('Partita IVA cliente non valida (checksum): ' + cli.partitaIva);
    if (hasCf && !validCF(cli.codiceFiscale)) e.push('Codice fiscale cliente non valido: ' + cli.codiceFiscale);
    if (!(cli.denominazione || (cli.nome && cli.cognome))) e.push('Denominazione o nome+cognome cliente mancanti.');
    if (!(cli.sede && cli.sede.cap && cli.sede.comune)) e.push('Sede cliente incompleta (CAP/Comune).');

    var cd = String(cli.codiceDestinatario || '').toUpperCase();
    if (!validCodiceDest(cd)) {
      e.push('Codice destinatario assente o di lunghezza errata (7 caratteri, o 0000000 con PEC).');
    } else if (cd === '0000000' && !cli.pec) {
      e.push('Codice destinatario 0000000 senza PEC: la fattura non verrebbe recapitata.');
    }
    return e;
  }

  // doc = risultato di compute(); meta = { numero, data, causale?, pagamento? }
  function buildXML(doc, emittente, cliente, meta) {
    emittente = emittente || {}; cliente = cliente || {}; meta = meta || {};
    var errors = (doc && doc.errors ? doc.errors.slice() : []).concat(validateParties(emittente, cliente));
    if (!meta.numero) errors.push('Numero documento mancante.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.data || ''))) errors.push('Data documento assente o non in formato YYYY-MM-DD.');
    if (errors.length) return { ok: false, errors: errors, xml: null, filename: null };

    var cd = String(cliente.codiceDestinatario).toUpperCase();
    var prog = progressivo(meta.numero);
    var trasmittenteId = emittente.partitaIva;

    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<p:FatturaElettronica versione="FPR12"' +
      ' xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
      ' xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2' +
      ' http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2.2/Schema_del_file_xml_FatturaPA_versione_1.2.2.xsd">');

    // ── Header
    out.push('<FatturaElettronicaHeader>');
    out.push('<DatiTrasmissione>');
    out.push('<IdTrasmittente>' + tag('IdPaese', 'IT') + tag('IdCodice', trasmittenteId) + '</IdTrasmittente>');
    out.push(tag('ProgressivoInvio', prog));
    out.push(tag('FormatoTrasmissione', 'FPR12'));
    out.push(tag('CodiceDestinatario', cd));
    if (cd === '0000000' && cliente.pec) out.push(tag('PECDestinatario', cliente.pec));
    out.push('</DatiTrasmissione>');

    out.push('<CedentePrestatore><DatiAnagrafici>');
    out.push('<IdFiscaleIVA>' + tag('IdPaese', 'IT') + tag('IdCodice', emittente.partitaIva) + '</IdFiscaleIVA>');
    out.push(opt('CodiceFiscale', emittente.codiceFiscale));
    out.push('<Anagrafica>' + anagrafica(emittente) + '</Anagrafica>');
    // Albo professionale: obbligatorio di fatto sulla parcella forense.
    out.push(opt('AlboProfessionale', emittente.albo));
    out.push(opt('ProvinciaAlbo', emittente.provinciaAlbo));
    out.push(opt('NumeroIscrizioneAlbo', emittente.numeroAlbo));
    out.push(opt('DataIscrizioneAlbo', emittente.dataAlbo));
    out.push(tag('RegimeFiscale', emittente.regimeFiscale));
    out.push('</DatiAnagrafici>' + sede(emittente.sede) + '</CedentePrestatore>');

    out.push('<CessionarioCommittente><DatiAnagrafici>');
    if (cliente.partitaIva) {
      out.push('<IdFiscaleIVA>' + tag('IdPaese', cliente.paese || 'IT') + tag('IdCodice', cliente.partitaIva) + '</IdFiscaleIVA>');
    }
    out.push(opt('CodiceFiscale', cliente.codiceFiscale ? String(cliente.codiceFiscale).toUpperCase() : ''));
    out.push('<Anagrafica>' + anagrafica(cliente) + '</Anagrafica>');
    out.push('</DatiAnagrafici>' + sede(cliente.sede) + '</CessionarioCommittente>');
    out.push('</FatturaElettronicaHeader>');

    // ── Body — l'ORDINE degli elementi è imposto dall'XSD: cambiarlo
    //    produce uno scarto formale, non un avviso.
    out.push('<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento>');
    out.push(tag('TipoDocumento', doc.tipoDocumento));
    out.push(tag('Divisa', 'EUR'));
    out.push(tag('Data', meta.data));
    out.push(tag('Numero', meta.numero));
    if (doc.ritenuta) {
      out.push('<DatiRitenuta>' +
        tag('TipoRitenuta', emittente.personaGiuridica ? 'RT02' : 'RT01') +
        tag('ImportoRitenuta', eur(doc.ritenuta.importo)) +
        tag('AliquotaRitenuta', dec2(doc.ritenuta.aliquota)) +
        tag('CausalePagamento', doc.ritenuta.causale) +
        '</DatiRitenuta>');
    }
    if (doc.bollo) {
      out.push('<DatiBollo>' + tag('BolloVirtuale', 'SI') + tag('ImportoBollo', eur(doc.bollo.importo)) + '</DatiBollo>');
    }
    if (doc.cassa) {
      // <Ritenuta>SI</Ritenuta> qui significherebbe "la rivalsa CPA subisce
      // la ritenuta": per la Cassa Forense NON è così, quindi si omette.
      out.push('<DatiCassaPrevidenziale>' +
        tag('TipoCassa', doc.cassa.tipo) +
        tag('AlCassa', dec2(doc.cassa.aliquota)) +
        tag('ImportoContributoCassa', eur(doc.cassa.importo)) +
        tag('ImponibileCassa', eur(doc.cassa.imponibile)) +
        tag('AliquotaIVA', dec2(doc.cassa.aliquotaIva)) +
        '</DatiCassaPrevidenziale>');
    }
    out.push(tag('ImportoTotaleDocumento', eur(doc.totali.totaleDocumento)));
    if (meta.causale) {
      String(meta.causale).match(/.{1,200}/g).forEach(function (c) { out.push(tag('Causale', c)); });
    }
    out.push('</DatiGeneraliDocumento></DatiGenerali>');

    out.push('<DatiBeniServizi>');
    doc.lines.forEach(function (l) {
      out.push('<DettaglioLinee>' +
        tag('NumeroLinea', l.n) +
        tag('Descrizione', l.descrizione) +
        (l.quantita !== null ? tag('Quantita', dec2(l.quantita)) : '') +
        tag('PrezzoUnitario', eur(l.prezzoUnitario)) +
        tag('PrezzoTotale', eur(l.prezzoTotale)) +
        tag('AliquotaIVA', dec2(l.aliquotaIva)) +
        (l.ritenuta ? tag('Ritenuta', 'SI') : '') +
        (l.natura ? tag('Natura', l.natura) : '') +
        '</DettaglioLinee>');
    });
    doc.riepiloghi.forEach(function (b) {
      out.push('<DatiRiepilogo>' +
        tag('AliquotaIVA', dec2(b.aliquotaIva)) +
        (b.natura ? tag('Natura', b.natura) : '') +
        tag('ImponibileImporto', eur(b.imponibile)) +
        tag('Imposta', eur(b.imposta)) +
        (b.natura === NATURA_ART15 ? tag('RiferimentoNormativo', RIFNORM_ART15) : '') +
        '</DatiRiepilogo>');
    });
    out.push('</DatiBeniServizi>');

    var pag = meta.pagamento || {};
    if (pag.modalita !== false) {
      var iban = pag.iban ? String(pag.iban).toUpperCase().replace(/[\s-]/g, '') : '';
      out.push('<DatiPagamento>' + tag('CondizioniPagamento', pag.condizioni || 'TP02') +
        '<DettaglioPagamento>' +
        tag('ModalitaPagamento', pag.modalita || 'MP05') +
        opt('DataScadenzaPagamento', pag.scadenza) +
        // Il netto a pagare, non il lordo: è la cifra che il cliente bonifica.
        tag('ImportoPagamento', eur(doc.totali.nettoAPagare)) +
        (iban && validIban(iban) ? tag('IBAN', iban) : '') +
        '</DettaglioPagamento></DatiPagamento>');
    }
    out.push('</FatturaElettronicaBody></p:FatturaElettronica>');

    return {
      ok: true,
      errors: [],
      xml: out.join(''),
      filename: 'IT' + trasmittenteId + '_' + prog + '.xml',
      progressivo: prog
    };
  }

  // Scorciatoia: calcola e impagina in un colpo.
  function emit(input, emittente, cliente, meta) {
    var doc = compute(input);
    var xml = buildXML(doc, emittente, cliente, meta);
    return Object.assign({ doc: doc }, xml);
  }

  var API = {
    DEFAULTS: DEFAULTS,
    compute: compute, buildXML: buildXML, emit: emit,
    toCents: toCents, eur: eur, pctOf: pctOf, dec2: dec2,
    validPIva: validPIva, validCF: validCF, validIban: validIban,
    validCodiceDest: validCodiceDest, validateParties: validateParties,
    progressivo: progressivo
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_FATTURA = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
