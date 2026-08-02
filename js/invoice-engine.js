/* BOOM · Invoice Engine — il registro fatture di Egidi Immobiliare, in codice.
 *
 * PERCHÉ ESISTE. Il portale conosceva UN campo, `amount`, e UNO stato,
 * `pending|paid`. Sui dati veri (registro TIC 2023-2026 + incassi Stripe e
 * Banca Sella) quel modello non regge, e non di poco:
 *
 *   • `amount` non dice se è LORDO o IMPONIBILE. In banca e su Stripe arriva
 *     sempre il LORDO; il commercialista conta l'IMPONIBILE. La prova sta nei
 *     dati: la somma degli imponibili 2025 fa 17.298,76 — esattamente la voce
 *     "Ricavi" del bilancio Studio Cardarelli. Trattare il lordo come
 *     imponibile gonfia l'IVA del 22% (§2.1 della specifica).
 *   • `pending|paid` è l'asse INCASSO. Lo SDI è un asse ORTOGONALE, e i due
 *     non si possono fondere: `SCARTATO` significa che la fattura non è
 *     giuridicamente emessa (l'operazione risulta NON fatturata e rientra
 *     nelle cose da fare), `MANCATA_CONSEGNA` significa che è valida e non
 *     c'è nulla da fare. Opposti.
 *   • Non esisteva lo stato che descrive il problema vero: INCASSATO MA NON
 *     FATTURATO. È il buco da cui sono passate 34 fatture per 30.692,20
 *     senza che nessuno se ne accorgesse per quattro mesi.
 *
 * Motore PURO: niente rete, niente Firestore, niente DOM. Lo leggono il
 * portale (vista Egidi + pagina Fatture), la console /fatturazione, il
 * Contabile e lo scadenzario — così non possono più dare tre numeri diversi
 * per la stessa IVA, che è esattamente quello che facevano.
 *
 * NON è consulenza fiscale: sono importi che la commercialista valida.
 * window.BOOM_FATTURE + module.exports (root package.json è commonjs).
 */
(function (root) {
  'use strict';

  var ALIQUOTA_STD = 22;

  // ─── Stato SDI — l'asse EMISSIONE ────────────────────────────────────
  // NON_INVIATA  → compilata, mai trasmessa allo SDI
  // CONSEGNATO   → emessa e recapitata (incluso "Consegnato No SDI" del
  //                registro TIC, cioè fuori canale telematico)
  // MANCATA_CONSEGNA → EMESSA E VALIDA. Lo SDI non è riuscito a recapitarla,
  //                il cliente la trova nel cassetto fiscale. Nulla da fare.
  // SCARTATO     → NON emessa. L'operazione risulta non fatturata: va
  //                riemessa, e l'IVA non è dovuta finché non lo è.
  var SDI = {
    NON_INVIATA: 'NON_INVIATA',
    CONSEGNATO: 'CONSEGNATO',
    CONSEGNATO_NO_SDI: 'CONSEGNATO_NO_SDI',
    MANCATA_CONSEGNA: 'MANCATA_CONSEGNA',
    SCARTATO: 'SCARTATO',
  };
  // Etichette e semantica in un posto solo: la console e il portale non
  // possono descrivere lo stesso stato in due modi diversi.
  var SDI_META = {
    NON_INVIATA:       { label: 'Non inviata',      short: 'DA INVIARE', tone: 'amber', issued: false, todo: true,  hint: 'Compilata ma mai trasmessa allo SDI.' },
    CONSEGNATO:        { label: 'Consegnato',       short: 'OK',         tone: 'green', issued: true,  todo: false, hint: 'Emessa e recapitata.' },
    CONSEGNATO_NO_SDI: { label: 'Consegnato (fuori SDI)', short: 'OK',   tone: 'green', issued: true,  todo: false, hint: 'Emessa fuori dal canale telematico.' },
    MANCATA_CONSEGNA:  { label: 'Mancata consegna', short: 'VALIDA',     tone: 'grey',  issued: true,  todo: false, hint: 'Valida a tutti gli effetti: lo SDI non l\'ha recapitata, il cliente la trova nel cassetto fiscale. Nulla da fare.' },
    SCARTATO:          { label: 'Scartata',         short: 'NON EMESSA', tone: 'red',   issued: false, todo: true,  hint: 'Rifiutata dallo SDI: l\'operazione risulta NON fatturata. Va riemessa — oltre i 5 giorni dalla notifica non si conservano data e numero.' },
  };

  var REGIME = { TRIMESTRALE: 'trimestrale', MENSILE: 'mensile' };
  var PAESE_REGIME = { IT: 'IT', CE: 'CE', EE: 'EE' };
  var CANALI = ['STRIPE', 'BONIFICO', 'ASSEGNO', 'ALTRO'];
  var TIPI_SERVIZIO = ['PFS', 'DAS', 'PP', 'ALTRO'];

  // ─── Aritmetica del denaro ───────────────────────────────────────────
  function round2(n) {
    // Arrotondamento half-up su valori monetari. `Math.round` da solo
    // sbaglia su 1.005 per rappresentazione binaria: +Number.EPSILON lo
    // corregge senza introdurre una dipendenza decimale.
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }

  /* Scorporo IVA dal LORDO — la regola che vale più di tutte le altre.
     L'arrotondamento va fatto SULL'IMPONIBILE e l'IVA ricavata per
     DIFFERENZA (§2.1). Il contrario (arrotondare l'IVA e sottrarla) fa sì
     che imponibile + IVA non torni al lordo incassato, e in banca il lordo
     è un fatto, non una stima. */
  function splitVat(lordo, aliquota) {
    var a = Number(aliquota);
    if (!isFinite(a) || a < 0) a = ALIQUOTA_STD;
    var g = round2(lordo);
    var imponibile = round2(g / (1 + a / 100));
    return { lordo: g, imponibile: imponibile, iva: round2(g - imponibile), aliquota: a };
  }

  /* Il percorso inverso: da imponibile a lordo. È quello che fa TIC quando
     gli si digita l'importo unitario — ed è il motivo per cui le fatture
     n.3-20 del 02/04/2026 hanno totale 350,01 invece di 350,00. Un
     centesimo, ma spiega i valori strani nel registro e va riprodotto, non
     "corretto": quelle fatture sono state emesse così. */
  function fromImponibile(imponibile, aliquota) {
    var a = Number(aliquota);
    if (!isFinite(a) || a < 0) a = ALIQUOTA_STD;
    var i = round2(imponibile);
    var iva = round2(i * a / 100);
    return { lordo: round2(i + iva), imponibile: i, iva: iva, aliquota: a };
  }

  // ─── Date: stringhe YYYY-MM-DD, mai oggetti Date con fuso ────────────
  function isoDate(d) {
    if (!d) return null;
    if (typeof d === 'string') {
      var s = d.trim();
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return m[1] + '-' + m[2] + '-' + m[3];
      // DD/MM/YYYY — il formato dei registri e degli estratti italiani
      var it = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
      if (it) return it[3] + '-' + pad2(it[2]) + '-' + pad2(it[1]);
      var p = new Date(s);
      return isNaN(p.getTime()) ? null : p.toISOString().slice(0, 10);
    }
    if (typeof d.toDate === 'function') return isoDate(d.toDate());
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    if (typeof d === 'number') return isoDate(new Date(d));
    if (d.seconds) return isoDate(new Date(d.seconds * 1000));
    return null;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function yearOf(d) { var s = isoDate(d); return s ? Number(s.slice(0, 4)) : null; }
  function quarterOf(d) {
    var s = isoDate(d);
    if (!s) return null;
    return Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1;
  }
  function fmtIt(d) { var s = isoDate(d); return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  /* `useGrouping` va FISSATO. In italiano il default CLDR è
     minimumGroupingDigits=2, cioè i numeri a quattro cifre non si
     raggruppano — e le implementazioni non concordano: lo stesso 5534.59
     esce "5534,59" da Node e "5.534,59" da Chrome. Le stringhe di questo
     motore nascono in ENTRAMBI (gli allarmi li compone il server, i totali
     il browser) e finivano affiancate sulla stessa schermata: due formati
     per lo stesso importo, su una pagina che parla di soldi. */
  function fmtEuro(n) {
    return '€' + (Number(n) || 0).toLocaleString('it-IT', {
      minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true,
    });
  }

  /* Scadenze di versamento IVA (§2.3).
     Q1 → 16 maggio · Q2 → 20 agosto · Q3 → 16 novembre
     Q4 → 16 MARZO dell'anno successivo, con la dichiarazione annuale.
     Il portale aveva 16 febbraio: un mese di anticipo su una scadenza vera.
     Nota: sul trimestrale l'1% di interessi si applica a Q1-Q3, NON al Q4
     che si versa con la dichiarazione. Lo teniamo separato dall'imposta. */
  function vatDueDate(anno, q, regime) {
    var y = Number(anno);
    if (regime === REGIME.MENSILE) return null; // mensile: il 16 del mese dopo
    return ({
      1: y + '-05-16',
      2: y + '-08-20',
      3: y + '-11-16',
      4: (y + 1) + '-03-16',
    })[Number(q)] || null;
  }
  function lipeDueDate(anno, q) {
    var y = Number(anno);
    return ({ 1: y + '-05-31', 2: y + '-09-30', 3: y + '-11-30', 4: (y + 1) + '-02-28' })[Number(q)] || null;
  }
  function interesseTrimestrale(iva, q) {
    // 1% sull'imposta dovuta, Q1-Q3. Sul Q4 non si applica.
    return Number(q) === 4 ? 0 : round2((Number(iva) || 0) * 0.01);
  }

  // ─── Normalizzazione: legge il vecchio e il nuovo senza migrazioni ────
  /* Un doc `invoices` può essere:
       legacy → { number:'BOOM-2026-0001', amount:350, status:'paid', date, service }
       v2     → { anno, numero, lordo, imponibile, iva, statoSdi, dataFattura… }
     Sul legacy `amount` è ambiguo per costruzione. Lo trattiamo come LORDO
     (è la cifra che una persona digita pensando "la fattura è di 350") e
     alziamo `needsReview`: il motore non può sapere, e fingere di sapere è
     il difetto che stiamo eliminando. La UI lo mostra come da verificare. */
  function normalize(doc) {
    var d = doc || {};
    var v2 = d.lordo != null || d.statoSdi != null || d.numero != null;

    var aliquota = Number(d.aliquota) || ALIQUOTA_STD;
    var money, needsReview = false;
    if (d.lordo != null) {
      // Se il documento porta già la terna, la si rispetta (il registro reale
      // contiene i centesimi di TIC che un ricalcolo cancellerebbe).
      var L = round2(d.lordo);
      var hasSplit = d.imponibile != null && d.iva != null;
      money = hasSplit
        ? { lordo: L, imponibile: round2(d.imponibile), iva: round2(d.iva), aliquota: aliquota }
        : splitVat(L, aliquota);
    } else if (d.imponibile != null) {
      money = fromImponibile(d.imponibile, aliquota);
    } else {
      money = splitVat(d.amount, aliquota);
      needsReview = Number(d.amount) > 0;
    }

    var dataFattura = isoDate(d.dataFattura || d.date || d.createdAt) || null;
    var dataIncasso = isoDate(d.dataIncasso || d.paidDate) || null;
    var anno = Number(d.anno) || yearOf(dataFattura) || null;

    var numero = d.numero != null ? Number(d.numero) : parseLegacyNumber(d.number);
    var statoSdi = normalizeSdi(d.statoSdi || d.sdi);
    if (!statoSdi) statoSdi = dataFattura ? SDI.CONSEGNATO : SDI.NON_INVIATA;

    var incassato = d.incassato != null
      ? !!d.incassato
      : (d.status === 'paid' || !!dataIncasso);

    return {
      id: d.id || null,
      anno: anno,
      numero: isFinite(numero) ? numero : null,
      numeroLabel: anno && isFinite(numero) ? numero + '/' + anno : (d.number || '—'),
      dataFattura: dataFattura,
      dataIncasso: dataIncasso,
      clienteNome: d.clienteNome || d.cliente || d.recipientName || d.clientName || '',
      clienteId: d.clienteId || d.recipientId || d.clientId || null,
      // §5.2 — intestatario ≠ pagante. La fattura va intestata a chi ha
      // stipulato il contratto, non a chi passa la carta (caso Gürcan:
      // fattura a Gülfem Irmak Gürcan, carta di Dilek Diren Gurcan).
      pagante: d.pagante || null,
      email: d.email || d.clienteEmail || d.recipientEmail || null,
      paese: d.paese || null,
      paeseRegime: d.paeseRegime || null,
      pivaCliente: d.pivaCliente || d.piva || null,
      indirizzo: d.indirizzo || null,
      descrizione: d.descrizione || d.description || d.service || '',
      tipoServizio: d.tipoServizio || d.tipo || null,
      canale: d.canale || null,
      competenzaAnno: d.competenzaAnno != null ? Number(d.competenzaAnno) : null,
      lordo: money.lordo,
      imponibile: money.imponibile,
      iva: money.iva,
      aliquota: money.aliquota,
      statoSdi: statoSdi,
      dataInvioSdi: isoDate(d.dataInvioSdi) || null,
      incassato: incassato,
      note: d.note || d.notes || '',
      needsReview: needsReview || !!d.needsReview,
      legacy: !v2,
      _raw: d,
    };
  }

  function normalizeSdi(v) {
    if (!v) return null;
    var s = String(v).toUpperCase().replace(/[\s-]+/g, '_');
    if (SDI_META[s]) return s;
    if (/SCART/.test(s)) return SDI.SCARTATO;
    if (/MANCAT/.test(s)) return SDI.MANCATA_CONSEGNA;
    if (/NO_SDI/.test(s)) return SDI.CONSEGNATO_NO_SDI;
    if (/CONSEGN/.test(s)) return SDI.CONSEGNATO;
    if (/NON_INVIAT|BOZZA|DRAFT/.test(s)) return SDI.NON_INVIATA;
    return null;
  }

  // 'BOOM-2026-0007' / 'n.7' / '7' → 7
  function parseLegacyNumber(n) {
    if (n == null) return NaN;
    if (typeof n === 'number') return n;
    var m = String(n).match(/(\d+)\s*$/);
    return m ? Number(m[1]) : NaN;
  }

  function meta(inv) { return SDI_META[inv && inv.statoSdi] || SDI_META.NON_INVIATA; }
  function isIssued(inv) { return meta(inv).issued; }      // giuridicamente emessa
  function countsForVat(inv) { return meta(inv).issued; }  // concorre alla liquidazione
  function needsAction(inv) { return meta(inv).todo; }

  // ─── Numerazione ─────────────────────────────────────────────────────
  /* `MAX(numero)+1` non basta e `length+1` è peggio (il portale generava
     BOOM-2026-0048 su un registro il cui prossimo numero libero è 24).
     Il registro reale ha DUE anomalie da reggere insieme (§5.1):
       • buchi: nel 2025 i numeri 4 e 5 non sono mai esistiti;
       • numeri OCCUPATI MA NON VALIDI: nel 2026 l'1, il 17 e il 22 esistono
         e sono scartati — il numero è bruciato, non riutilizzabile.
     Quindi: il prossimo è max(usati)+1 contando ANCHE gli scartati, e i
     buchi si segnalano senza riempirli (un controllo di contiguità cieco
     genererebbe un falso allarme su una situazione nota e chiusa). */
  function numberingAudit(invoices, anno) {
    var y = Number(anno);
    var used = [], burned = [], seen = {}, duplicates = [];
    (invoices || []).forEach(function (raw) {
      var inv = raw && raw._raw !== undefined ? raw : normalize(raw);
      if (inv.anno !== y || inv.numero == null) return;
      if (seen[inv.numero]) duplicates.push(inv.numero); else seen[inv.numero] = true;
      used.push(inv.numero);
      if (!isIssued(inv)) burned.push(inv.numero);
    });
    used.sort(function (a, b) { return a - b; });
    var max = used.length ? used[used.length - 1] : 0;
    var holes = [];
    for (var n = 1; n < max; n++) if (!seen[n]) holes.push(n);
    return {
      anno: y,
      next: max + 1,
      used: used,
      burned: burned.sort(function (a, b) { return a - b; }),
      holes: holes,
      duplicates: duplicates,
    };
  }
  function nextNumero(invoices, anno) { return numberingAudit(invoices, anno).next; }

  // ─── Liquidazione IVA per trimestre ──────────────────────────────────
  /* Il trimestre lo determina la DATA FATTURA — non la competenza, non
     l'incasso (§2.3). Il Contabile filtrava `status === 'paid'` e bucketava
     per `paidDate`: due errori in uno, perché una fattura valida non
     incassata deve comunque l'IVA (la n.23 Mencucci del 28/07 vale 290,40
     in Q3 e spariva del tutto). */
  function vatLedger(invoices, anno, opts) {
    var o = opts || {};
    var y = Number(anno);
    var regime = o.regime || REGIME.TRIMESTRALE;
    var byQuarter = {};
    [1, 2, 3, 4].forEach(function (q) {
      byQuarter[q] = {
        q: q, imponibile: 0, iva: 0, lordo: 0, count: 0,
        dueDate: vatDueDate(y, q, regime), lipeDate: lipeDueDate(y, q),
        invoices: [],
      };
    });
    var esclusi = { imponibile: 0, iva: 0, lordo: 0, count: 0, invoices: [] };

    (invoices || []).forEach(function (raw) {
      var inv = raw && raw._raw !== undefined ? raw : normalize(raw);
      if (inv.anno !== y && yearOf(inv.dataFattura) !== y) return;
      var q = quarterOf(inv.dataFattura);
      if (!q) return;
      if (!countsForVat(inv)) {
        esclusi.imponibile = round2(esclusi.imponibile + inv.imponibile);
        esclusi.iva = round2(esclusi.iva + inv.iva);
        esclusi.lordo = round2(esclusi.lordo + inv.lordo);
        esclusi.count++;
        esclusi.invoices.push(inv);
        return;
      }
      var b = byQuarter[q];
      b.imponibile = round2(b.imponibile + inv.imponibile);
      b.iva = round2(b.iva + inv.iva);
      b.lordo = round2(b.lordo + inv.lordo);
      b.count++;
      b.invoices.push(inv);
    });

    var total = { imponibile: 0, iva: 0, lordo: 0, count: 0 };
    [1, 2, 3, 4].forEach(function (q) {
      var b = byQuarter[q];
      b.interessi = interesseTrimestrale(b.iva, q);
      b.daVersare = round2(b.iva + b.interessi);
      total.imponibile = round2(total.imponibile + b.imponibile);
      total.iva = round2(total.iva + b.iva);
      total.lordo = round2(total.lordo + b.lordo);
      total.count += b.count;
    });
    return { anno: y, regime: regime, byQuarter: byQuarter, total: total, esclusi: esclusi };
  }

  /* Il ponte verso js/fiscal-engine.js. Gli passiamo la terna esatta per
     trimestre invece di un imponibile da moltiplicare per 0,22: così il
     motore delle scadenze non ricalcola nulla e non può divergere. */
  function revenueByQuarter(invoices, anno, opts) {
    var led = vatLedger(invoices, anno, opts);
    var out = {};
    [1, 2, 3, 4].forEach(function (q) {
      out[q] = { imponibile: led.byQuarter[q].imponibile, iva: led.byQuarter[q].iva };
    });
    return out;
  }

  // ─── La coda: incassato ma non fatturato ─────────────────────────────
  /* Il motivo per cui esiste il modulo. Un incasso classificato come
     compenso e privo di fattura è un debito IVA che matura in silenzio;
     l'unica funzione che avrebbe evitato l'arretrato di quattro mesi è
     saper elencare esattamente questi (§6). */
  function billingQueue(rows, today) {
    var t = isoDate(today) || isoDate(new Date());
    var items = (rows || []).map(function (r) {
      var inv = r && r._raw !== undefined ? r : normalize(r);
      var giorni = daysBetween(inv.dataIncasso || inv.dataFattura, t);
      return Object.assign({}, inv, { giorniAttesa: giorni });
    });
    items.sort(function (a, b) {
      // Prima i più vecchi: sono quelli che rischiano di scivolare in un
      // trimestre già liquidato.
      return String(a.dataIncasso || '').localeCompare(String(b.dataIncasso || ''));
    });
    var tot = items.reduce(function (s, i) {
      s.lordo = round2(s.lordo + i.lordo);
      s.imponibile = round2(s.imponibile + i.imponibile);
      s.iva = round2(s.iva + i.iva);
      return s;
    }, { lordo: 0, imponibile: 0, iva: 0 });
    return { items: items, count: items.length, totali: tot, oldestDays: items.length ? items[0].giorniAttesa : 0 };
  }

  function daysBetween(a, b) {
    var x = isoDate(a), y = isoDate(b);
    if (!x || !y) return 0;
    return Math.round((Date.parse(y + 'T00:00:00Z') - Date.parse(x + 'T00:00:00Z')) / 86400000);
  }

  /* Proiezione: "se emetto queste il giorno X, cosa devo e quando?"
     La domanda che il portale non sapeva nemmeno formulare, perché non
     distingueva data fattura da data incasso. */
  function projectVat(rows, dataEmissione, opts) {
    var d = isoDate(dataEmissione) || isoDate(new Date());
    var y = yearOf(d), q = quarterOf(d);
    var regime = (opts || {}).regime || REGIME.TRIMESTRALE;
    var tot = (rows || []).reduce(function (s, r) {
      var inv = r && r._raw !== undefined ? r : normalize(r);
      s.imponibile = round2(s.imponibile + inv.imponibile);
      s.iva = round2(s.iva + inv.iva);
      s.lordo = round2(s.lordo + inv.lordo);
      s.count++;
      return s;
    }, { imponibile: 0, iva: 0, lordo: 0, count: 0 });
    var interessi = interesseTrimestrale(tot.iva, q);
    return {
      dataEmissione: d, anno: y, trimestre: q,
      count: tot.count, lordo: tot.lordo, imponibile: tot.imponibile, iva: tot.iva,
      interessi: interessi, daVersare: round2(tot.iva + interessi),
      scadenza: vatDueDate(y, q, regime),
      lipe: lipeDueDate(y, q),
    };
  }

  // ─── Partita IVA per privati esteri (§2.2) ───────────────────────────
  // Undici zeri più un progressivo, che PROSEGUE tra un batch e l'altro.
  function pivaEstera(seq) {
    var n = Math.max(1, Math.floor(Number(seq) || 1));
    return String(n).padStart(11, '0');
  }
  function nextPivaEstera(existing) {
    var max = 0;
    (existing || []).forEach(function (v) {
      var s = String((v && (v.pivaCliente || v.piva)) || v || '');
      if (/^0{5,}\d+$/.test(s)) max = Math.max(max, Number(s));
    });
    return pivaEstera(max + 1);
  }
  var CODICE_DEST_ESTERO = 'XXXXXXX';

  // ─── Export per TIC Zucchetti (§7) ───────────────────────────────────
  // Nell'ORDINE di inserimento a video: chi ricopia non deve cercare.
  var TIC_COLUMNS = [
    'Numero', 'Data', 'Nome', 'Indirizzo', 'Paese', 'P.IVA',
    'Articolo', 'Descrizione', 'Unita', 'Quantita',
    'Importo unitario', 'Aliquota IVA', 'Modalita pagamento', 'Banca', 'IBAN',
    'Scadenza', 'Totale',
  ];
  function ticRow(inv, opts) {
    var i = inv && inv._raw !== undefined ? inv : normalize(inv);
    var o = opts || {};
    var paese = i.paese || '';
    var reg = i.paeseRegime || (paese ? PAESE_REGIME.EE : PAESE_REGIME.IT);
    return {
      'Numero': i.numero != null ? String(i.numero) : '',
      'Data': fmtIt(i.dataFattura || o.dataFattura),
      'Nome': i.clienteNome || '',
      'Indirizzo': i.indirizzo || (paese ? '00000 ' + paese.toUpperCase() : ''),
      'Paese': paese ? paese.toUpperCase() + ' (' + reg + ')' : 'ITALIA (IT)',
      'P.IVA': i.pivaCliente || '',
      'Articolo': 'PROVVIGIONE',
      'Descrizione': descrizioneCompleta(i),
      'Unita': 'N',
      'Quantita': '1,00',
      // Su TIC si digita l'IMPONIBILE, mai il lordo: è lui a ricalcolare
      // l'IVA. Digitare il lordo qui è l'errore che moltiplica per 1,22.
      'Importo unitario': numIt(i.imponibile),
      'Aliquota IVA': String(i.aliquota),
      'Modalita pagamento': 'Bonifico',
      // Banca e IBAN arrivano da chi chiama, non da qui: questo file è
      // servito al browser e un IBAN in un bundle pubblico è un invito allo
      // scraping (è la stessa ragione per cui le coordinate del canone
      // stanno in `payout/` e non in `settings/`, leggibile da chiunque).
      'Banca': o.banca || '',
      'IBAN': o.iban || '',
      'Scadenza': fmtIt(i.dataFattura || o.dataFattura),
      'Totale': numIt(i.lordo),
    };
  }
  /* §2.4 — i servizi resi nel 2025 e fatturati nel 2026 portano in
     descrizione la dicitura di competenza (indicazione della
     commercialista). La si appende qui, una volta, invece di ricordarsene
     34 volte a mano. */
  function descrizioneCompleta(inv) {
    var i = inv && inv._raw !== undefined ? inv : normalize(inv);
    var base = String(i.descrizione || '').trim();
    var annoFat = i.anno || yearOf(i.dataFattura);
    if (i.competenzaAnno && annoFat && i.competenzaAnno !== annoFat && !/COMPETENZA/i.test(base)) {
      base += ' — COMPETENZA ' + i.competenzaAnno;
    }
    return base;
  }
  function numIt(n) { return (Number(n) || 0).toFixed(2).replace('.', ','); }

  // CSV italiano: separatore ';', decimale ',', BOM UTF-8 — lo stesso
  // formato di api/banking/export.js, così Excel italiano apre entrambi
  // senza procedura guidata.
  function toCsvIt(rows, columns) {
    var cols = columns || (rows && rows.length ? Object.keys(rows[0]) : []);
    var esc = function (v) {
      var s = v == null ? '' : String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var out = [cols.join(';')];
    (rows || []).forEach(function (r) { out.push(cols.map(function (c) { return esc(r[c]); }).join(';')); });
    return '﻿' + out.join('\r\n') + '\r\n';
  }

  // ─── Parser CSV (import del registro e della coda) ───────────────────
  /* Riconosce da solo quale dei due file sta leggendo, dall'intestazione:
       registro emesse → anno,numero,data_fattura,cliente,lordo,…,stato_sdi
       da emettere     → data_incasso,cliente,email,paese,lordo,…,stato
     Tollerante su separatore (, o ;) e su formato numerico (1.234,56 o
     1234.56), perché questi file nascono da esportazioni diverse. */
  function parseInvoiceCsv(text) {
    var raw = String(text || '').replace(/^﻿/, '').trim();
    if (!raw) return { rows: [], kind: null, error: 'file vuoto' };
    var lines = raw.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return { rows: [], kind: null, error: 'nessuna riga dati' };

    var sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
    var header = splitCsvLine(lines[0], sep).map(function (h) {
      return h.trim().toLowerCase().replace(/\s+/g, '_');
    });
    var has = function (n) { return header.indexOf(n) >= 0; };
    var kind = has('stato_sdi') ? 'emesse' : (has('data_incasso') ? 'da_emettere' : null);
    if (!kind) return { rows: [], kind: null, error: 'intestazione non riconosciuta: ' + header.join(', ') };

    var rows = [], errors = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = splitCsvLine(lines[i], sep);
      if (cells.length < 2) continue;
      var r = {};
      header.forEach(function (h, idx) { r[h] = (cells[idx] || '').trim(); });
      var lordo = parseNum(r.lordo);
      if (!(lordo > 0)) { errors.push('riga ' + (i + 1) + ': importo mancante o non valido'); continue; }

      // Se il file porta già imponibile+IVA li si rispetta (il registro
      // contiene i centesimi reali di TIC); altrimenti si scorpora.
      var imp = parseNum(r.imponibile), iva = parseNum(r.iva);
      var money = (imp > 0 && iva > 0 && Math.abs(imp + iva - lordo) <= 0.02)
        ? { lordo: round2(lordo), imponibile: round2(imp), iva: round2(iva), aliquota: ALIQUOTA_STD }
        : splitVat(lordo, ALIQUOTA_STD);

      var doc = {
        clienteNome: r.cliente || '',
        email: r.email || null,
        paese: r.paese || null,
        lordo: money.lordo, imponibile: money.imponibile, iva: money.iva, aliquota: money.aliquota,
        descrizione: r.descrizione || '',
        tipoServizio: r.tipo || r.tipo_servizio || null,
        canale: r.canale || null,
        competenzaAnno: r.competenza_anno ? Number(r.competenza_anno) : null,
        note: r.note || '',
      };

      if (kind === 'emesse') {
        doc.anno = Number(r.anno) || yearOf(r.data_fattura);
        doc.numero = Number(r.numero) || null;
        doc.dataFattura = isoDate(r.data_fattura);
        doc.statoSdi = normalizeSdi(r.stato_sdi) || SDI.CONSEGNATO;
        doc.incassato = r.incassato ? /^(1|si|sì|true|paid)$/i.test(r.incassato) : true;
      } else {
        doc.dataIncasso = isoDate(r.data_incasso);
        doc.dataFattura = null;
        doc.anno = null;
        doc.numero = null;
        doc.statoSdi = SDI.NON_INVIATA;
        doc.incassato = true;
        // "SCARTATA_DA_RIEMETTERE" nel file della coda marca le riemissioni:
        // sono numeri già bruciati che tornano in coda con numero nuovo.
        doc.riemissione = /scartat|riemett/i.test(r.stato || '') || /riemission/i.test(r.canale || '');
      }
      rows.push(doc);
    }
    return { rows: rows, kind: kind, errors: errors, header: header };
  }

  function splitCsvLine(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  // "1.234,56" (italiano) e "1234.56" (export tecnico) nello stesso parser:
  // decide dall'ultimo separatore che compare, non da un'assunzione.
  function parseNum(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    var s = String(v).replace(/[€\s]/g, '').replace(/^\+/, '');
    var lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // ─── Diagnostica del registro ────────────────────────────────────────
  /* Cosa richiede una decisione, in ordine di soldi. Alimenta la console e
     il report del Contabile: gli stessi segnali, un solo calcolo. */
  function registryAudit(invoices, anno, queueRows, today) {
    var y = Number(anno);
    var all = (invoices || []).map(function (r) { return r && r._raw !== undefined ? r : normalize(r); });
    var ofYear = all.filter(function (i) { return i.anno === y || yearOf(i.dataFattura) === y; });
    var scartate = ofYear.filter(function (i) { return i.statoSdi === SDI.SCARTATO; });
    var nonInviate = ofYear.filter(function (i) { return i.statoSdi === SDI.NON_INVIATA; });
    var daIncassare = ofYear.filter(function (i) { return isIssued(i) && !i.incassato; });
    var daVerificare = ofYear.filter(function (i) { return i.needsReview; });
    var queue = billingQueue(queueRows || [], today);
    var led = vatLedger(all, y);
    var num = numberingAudit(all, y);

    var alerts = [];
    if (queue.count) {
      alerts.push({
        key: 'da_fatturare', tone: 'red', icon: '🔴',
        title: queue.count + ' incassi senza fattura · ' + fmtEuro(queue.totali.lordo),
        body: 'IVA latente ' + fmtEuro(queue.totali.iva) + '. Il più vecchio aspetta da ' + queue.oldestDays + ' giorni.',
        amount: queue.totali.iva,
      });
    }
    if (scartate.length) {
      alerts.push({
        key: 'scartate', tone: 'red', icon: '⚠️',
        title: scartate.length + ' fatture SCARTATE · ' + fmtEuro(sum(scartate, 'lordo')),
        body: 'Non sono giuridicamente emesse: l\'operazione risulta non fatturata. Oltre i 5 giorni dalla notifica non si conservano data e numero — la via è il ravvedimento, e la decide la commercialista.',
        amount: sum(scartate, 'iva'),
      });
    }
    if (num.duplicates.length) {
      alerts.push({
        key: 'duplicati', tone: 'red', icon: '🔢',
        title: 'Numeri duplicati nel ' + y + ': ' + num.duplicates.join(', '),
        body: 'Due documenti con lo stesso numero nello stesso anno.',
      });
    }
    if (daVerificare.length) {
      alerts.push({
        key: 'importi_ambigui', tone: 'amber', icon: '❓',
        title: daVerificare.length + ' importi da verificare',
        body: 'Documenti che portano un solo importo, senza distinzione tra lordo e imponibile. Confermare l\'importo lordo incassato.',
      });
    }
    if (nonInviate.length) {
      alerts.push({
        key: 'non_inviate', tone: 'amber', icon: '📤',
        title: nonInviate.length + ' fatture compilate ma non trasmesse',
        body: 'Sono pronte: manca l\'invio allo SDI.',
      });
    }
    return {
      anno: y, alerts: alerts, ledger: led, numbering: num, queue: queue,
      scartate: scartate, nonInviate: nonInviate, daIncassare: daIncassare, daVerificare: daVerificare,
      creditoAperto: round2(sum(daIncassare, 'lordo')),
    };
  }
  function sum(list, field) {
    return round2((list || []).reduce(function (s, i) { return s + (Number(i[field]) || 0); }, 0));
  }

  var API = {
    SDI: SDI, SDI_META: SDI_META, REGIME: REGIME, PAESE_REGIME: PAESE_REGIME,
    CANALI: CANALI, TIPI_SERVIZIO: TIPI_SERVIZIO, ALIQUOTA_STD: ALIQUOTA_STD,
    TIC_COLUMNS: TIC_COLUMNS, CODICE_DEST_ESTERO: CODICE_DEST_ESTERO,
    round2: round2, splitVat: splitVat, fromImponibile: fromImponibile,
    isoDate: isoDate, yearOf: yearOf, quarterOf: quarterOf, fmtIt: fmtIt, fmtEuro: fmtEuro,
    vatDueDate: vatDueDate, lipeDueDate: lipeDueDate, interesseTrimestrale: interesseTrimestrale,
    normalize: normalize, normalizeSdi: normalizeSdi, meta: meta,
    isIssued: isIssued, countsForVat: countsForVat, needsAction: needsAction,
    numberingAudit: numberingAudit, nextNumero: nextNumero,
    vatLedger: vatLedger, revenueByQuarter: revenueByQuarter,
    billingQueue: billingQueue, projectVat: projectVat, daysBetween: daysBetween,
    pivaEstera: pivaEstera, nextPivaEstera: nextPivaEstera,
    ticRow: ticRow, descrizioneCompleta: descrizioneCompleta, toCsvIt: toCsvIt,
    parseInvoiceCsv: parseInvoiceCsv, parseNum: parseNum,
    registryAudit: registryAudit,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_FATTURE = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
