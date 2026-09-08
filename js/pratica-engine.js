/* js/pratica-engine.js — LA PRATICA: un contratto FIRMATO FUORI diventa gestibile.
 *
 * Il portale sapeva nascere un contratto in un modo solo: dentro. Pre-accordo
 * → conversione → Magic Sign → firma → scadenzario. Tutto il resto — le
 * pratiche già stipulate su carta, quelle firmate dal notaio, quelle ereditate
 * da un'altra gestione — entrava a mano, campo per campo, oppure non entrava.
 *
 * L'Innesto (api/portal/ingest.js) risolveva già metà del problema: da un PDF
 * ricava la proposta nello schema del portale, e non scrive niente. Quello che
 * mancava è tutto ciò che viene DOPO la lettura, ed è dove si fanno i danni:
 *
 *  1. IL SECONDO CARICAMENTO. L'operatore ricarica lo stesso contratto la
 *     settimana dopo, con un allegato in più. Senza identità della pratica
 *     nascono due contratti sullo stesso immobile, due scadenzari, due
 *     solleciti. `praticaKey` è DERIVATA dai fatti del contratto, quindi il
 *     secondo caricamento ritrova la stessa pratica per costruzione.
 *
 *  2. LA FIRMA CHE NON C'È. Un contratto firmato su carta non ha
 *     `tenantSignature`. La tentazione è riempire quei campi per far
 *     "sembrare" completa la pratica: sarebbe una firma falsa dentro il
 *     sistema che la certifica. Qui la firma esterna vive in un blocco suo
 *     (`signature.mode:'external'`) e `magicSignFieldsTouched` RIFIUTA
 *     qualunque scrittura sui campi di Magic Sign.
 *
 *  3. GLI ARRETRATI INVENTATI. Importare a settembre un contratto partito a
 *     gennaio non significa che il cliente deva otto mensilità: quelle otto
 *     le ha già pagate a qualcun altro, o a mano. Generare lo scadenzario da
 *     `startDate` produrrebbe otto rate scadute, otto solleciti e una fattura.
 *     `takeoverDate` — la data di presa in gestione — è la linea: prima di
 *     quella data non nasce NIENTE.
 *
 *  4. «NON PAGATO» DETTO SENZA PROVE. L'assenza di una ricevuta è assenza di
 *     una ricevuta. `receiptStatus` torna 'da_verificare', mai 'non_pagato':
 *     la differenza è fra una domanda all'operatore e un'accusa al cliente.
 *
 *  5. LA FUSIONE SUL NOME. "Mario Rossi" del PDF non è necessariamente il
 *     "Mario Rossi" in archivio. `linkProposals` propone, non fonde: sopra la
 *     soglia forte (CF, email, IBAN, indirizzo) l'aggancio è pre-selezionato,
 *     sul solo nome resta una domanda con il motivo scritto accanto.
 *
 * Motore PURO: nessun I/O, nessun Date.now() implicito (il "adesso" si passa),
 * nessuna dipendenza. Gira in node come nel browser — window.BOOM_PRATICA.
 *
 * Vedi anche: js/dataops-engine.js (findMatch, validazioni CF/IBAN) di cui
 * questo motore riusa la disciplina delle soglie, e api/contracts/import.js
 * che è solo la porta HTTP: le decisioni stanno qui.
 */
(function (root) {
  'use strict';

  // ─── utilità ────────────────────────────────────────────────────────────
  var txt = function (v) { return v == null ? '' : String(v).trim(); };
  var low = function (v) { return txt(v).toLowerCase(); };

  function normName(v) {
    return low(v).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Stesso spirito di dataops-engine.normAddress: "Via Cavour, 12" e
  // "via cavour 12" sono lo stesso portone. Le abbreviazioni comuni si
  // appiattiscono perché un contratto scrive "V.le" dove l'archivio scrive
  // "Viale", e su quella differenza nascerebbe una seconda pratica.
  function normAddress(v) {
    return low(v)
      .replace(/[.,]/g, ' ')
      .replace(/\b(v\.?le|viale)\b/g, 'viale')
      .replace(/\b(v\.?|via)\b/g, 'via')
      .replace(/\b(p\.?zza|piazza)\b/g, 'piazza')
      .replace(/\b(c\.?so|corso)\b/g, 'corso')
      .replace(/\b(int|interno|scala|sc)\b/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isIsoDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(txt(v)); }

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Confronto di date ISO senza costruire Date: le stringhe ISO si ordinano
  // da sole, e un fuso orario non può spostare un giorno.
  function isoBefore(a, b) { return isIsoDate(a) && isIsoDate(b) && a < b; }

  function addMonthsIso(iso, months) {
    if (!isIsoDate(iso)) return null;
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    var total = (y * 12) + (m - 1) + months;
    var ny = Math.floor(total / 12), nm = (total % 12) + 1;
    // fine mese: il 31 gennaio + 1 mese è il 28/29 febbraio, non il 3 marzo
    var last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    var nd = Math.min(d, last);
    return ny + '-' + String(nm).padStart(2, '0') + '-' + String(nd).padStart(2, '0');
  }

  // Hash stabile e corto. Non è crittografia: serve a dare lo STESSO id alla
  // stessa pratica su due caricamenti, e a non rivelare i dati nell'id.
  function shortHash(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = ((h1 ^ c) * 16777619) >>> 0;
      h2 = ((h2 + c) * 2246822519 + i) >>> 0;
    }
    return (h1.toString(36) + h2.toString(36)).slice(0, 12);
  }

  // ─── 1 · identità della pratica ─────────────────────────────────────────
  // Il secondo caricamento dello stesso contratto DEVE ritrovare la prima
  // pratica. La chiave si deriva dai fatti che identificano una locazione:
  // dove, chi, da quando. Sotto la soglia minima non si inventa un'identità:
  // si torna null e la porta chiede all'operatore invece di creare al buio.
  function praticaKey(extracted) {
    var e = extracted || {};
    var prop = e.property || {};
    var ten = e.tenant || {};
    var con = e.contract || {};

    var place = normAddress(prop.address || prop.name || '');
    var who = low(ten.codiceFiscale) || normName(ten.name || '');
    var since = isIsoDate(con.startDate) ? con.startDate : '';

    // Servono almeno DUE dei tre assi. Con il solo indirizzo, due contratti
    // successivi sullo stesso appartamento — l'inquilino che se ne va e
    // quello che entra — collasserebbero nella stessa pratica.
    var have = [place, who, since].filter(Boolean).length;
    if (have < 2) return null;
    return 'imp_' + shortHash(place + '|' + who + '|' + since);
  }

  // Identità di un FILE, per non rileggere e non riallegare lo stesso
  // documento. Lo sha256 lo calcola il chiamante (crypto.subtle nel browser,
  // node:crypto sul server): qui si compone soltanto.
  function sourceKey(file) {
    var f = file || {};
    if (f.sha256) return 'src_' + String(f.sha256).slice(0, 24);
    // Senza hash si ripiega su nome+dimensione, che è più debole ed è
    // dichiarato tale: due file diversi con lo stesso nome e la stessa
    // dimensione sono rari ma possibili.
    return 'srcw_' + shortHash(low(f.name) + '|' + (f.size || 0));
  }

  function dedupeSources(existing, incoming) {
    var seen = {};
    (existing || []).forEach(function (s) { seen[s.key] = true; });
    var fresh = [], dup = [];
    (incoming || []).forEach(function (f) {
      var k = f.key || sourceKey(f);
      var rec = { key: k, name: txt(f.name), size: f.size || 0, mediaType: txt(f.mediaType), pages: f.pages || null, sha256: f.sha256 || null };
      if (seen[k]) { dup.push(rec); return; }
      seen[k] = true;
      fresh.push(rec);
    });
    return { fresh: fresh, duplicates: dup };
  }

  // ─── 2 · unione di due letture ──────────────────────────────────────────
  // Un secondo documento ARRICCHISCE la pratica: riempie i buchi, non
  // riscrive ciò che c'è. Due regole dure, entrambe testate per mutazione:
  //   · un valore CONFERMATO da un umano non viene mai toccato da una lettura;
  //   · due valori diversi e non vuoti non si scelgono da soli — diventano un
  //     CONFLITTO, che l'operatore risolve vedendo entrambe le fonti.
  // Il caso peggiore che questo impedisce: il canone del rinnovo che
  // sovrascrive in silenzio il canone del contratto, e nessuno se ne accorge
  // finché non parte una rata sbagliata.
  var SECTIONS = ['landlord', 'tenant', 'property', 'contract'];

  function mergeExtraction(current, incoming, opts) {
    opts = opts || {};
    var srcKey = txt(opts.sourceKey) || null;
    var page = opts.page == null ? null : opts.page;
    var out = { fields: {}, conflicts: [] };

    // `fields` è piatto: "contract.rent" → { value, source, page, confirmed }
    var cur = (current && current.fields) || {};
    Object.keys(cur).forEach(function (k) { out.fields[k] = cur[k]; });
    var conflicts = (current && current.conflicts) || [];
    conflicts.forEach(function (c) { out.conflicts.push(c); });

    SECTIONS.forEach(function (sec) {
      var block = incoming && incoming[sec];
      if (!block || typeof block !== 'object') return;
      Object.keys(block).forEach(function (f) {
        var raw = block[f];
        if (raw === undefined || raw === null || raw === '') return;
        var path = sec + '.' + f;
        var prev = out.fields[path];
        var val = raw;

        if (!prev) {
          out.fields[path] = { value: val, source: srcKey, page: page, confirmed: false };
          return;
        }
        if (String(prev.value) === String(val)) {
          // stessa lettura da una seconda fonte: nessun conflitto, ma la
          // conferma incrociata è un'informazione utile all'operatore
          if (srcKey && prev.source && prev.source !== srcKey) {
            prev.corroboratedBy = prev.corroboratedBy || [];
            if (prev.corroboratedBy.indexOf(srcKey) < 0) prev.corroboratedBy.push(srcKey);
          }
          return;
        }
        if (prev.confirmed) {
          // l'operatore ha già deciso: la lettura NON vince, ma il
          // disaccordo si dice — potrebbe essere un allegato che modifica
          // davvero il contratto
          out.conflicts.push({ path: path, kept: prev.value, seen: val, source: srcKey, page: page, reason: 'valore confermato dall\'operatore' });
          return;
        }
        out.conflicts.push({ path: path, kept: prev.value, seen: val, source: srcKey, page: page, reason: 'due documenti dicono cose diverse' });
      });
    });

    return out;
  }

  // Vista comoda: da `fields` piatti alla forma a sezioni che il portale salva.
  function toSections(state) {
    var out = {};
    var f = (state && state.fields) || {};
    Object.keys(f).forEach(function (path) {
      var i = path.indexOf('.');
      var sec = path.slice(0, i), key = path.slice(i + 1);
      if (SECTIONS.indexOf(sec) < 0) return;
      out[sec] = out[sec] || {};
      out[sec][key] = f[path].value;
    });
    return out;
  }

  // ─── 3 · agganci proposti, MAI fusioni automatiche ──────────────────────
  // La soglia è la stessa di dataops-engine (70), ma qui il verdetto ha tre
  // gradini invece di due, perché una pratica importata si aggancia a
  // un'anagrafica VIVA: CF/email/IBAN/indirizzo sono prove, il nome è un
  // indizio. Un indizio non pre-seleziona niente.
  var STRONG = 85;      // prova: pre-selezionato, l'operatore può togliere
  var WEAK = 70;        // indizio: mostrato, MAI pre-selezionato

  function scoreCandidate(cand, e, kind) {
    if (cand.codiceFiscale && e.codiceFiscale && low(cand.codiceFiscale) === low(e.codiceFiscale)) return { s: 100, why: 'stesso codice fiscale' };
    if (cand.email && e.email && low(cand.email) === low(e.email)) return { s: 96, why: 'stessa email' };
    if (cand.iban && e.iban && low(cand.iban).replace(/\s/g, '') === low(e.iban).replace(/\s/g, '')) return { s: 92, why: 'stesso IBAN' };
    if (kind === 'property' && cand.address && e.address && normAddress(cand.address) && normAddress(cand.address) === normAddress(e.address)) return { s: 88, why: 'stesso indirizzo' };
    if (cand.name && e.name && normName(cand.name) && normName(cand.name) === normName(e.name)) return { s: 80, why: 'stesso nome' };
    if (cand.phone && e.phone) {
      var a = txt(cand.phone).replace(/\D/g, '').slice(-9), b = txt(e.phone).replace(/\D/g, '').slice(-9);
      if (a && a === b && b.length >= 9) return { s: 74, why: 'stesso numero di telefono' };
    }
    return { s: 0, why: '' };
  }

  function linkProposals(extracted, archive) {
    var a = archive || {};
    var out = {};
    [['property', a.properties], ['tenant', a.users], ['landlord', a.landlords]].forEach(function (pair) {
      var kind = pair[0], pool = pair[1] || [];
      var cand = (extracted || {})[kind];
      if (!cand) { out[kind] = { decision: 'nuovo', candidates: [], why: 'nessun dato estratto' }; return; }
      var scored = [];
      pool.forEach(function (e) {
        var r = scoreCandidate(cand, e, kind);
        if (r.s >= WEAK) scored.push({ id: e.id, label: e.name || e.address || e.email || e.id, score: r.s, why: r.why });
      });
      scored.sort(function (x, y) { return y.score - x.score; });
      var top = scored[0];
      if (!top) { out[kind] = { decision: 'nuovo', candidates: [], why: 'nessuna corrispondenza sopra la soglia' }; return; }
      // Due candidati forti a pari merito NON si scelgono da soli.
      var tie = scored.length > 1 && scored[1].score === top.score;
      if (top.score >= STRONG && !tie) {
        out[kind] = { decision: 'collega', preselected: top.id, candidates: scored.slice(0, 5), why: top.why };
      } else {
        out[kind] = {
          decision: 'da_confermare',
          preselected: null,
          candidates: scored.slice(0, 5),
          why: tie ? 'due candidati con lo stesso punteggio: sceglie l\'operatore' : top.why + ' — indizio debole, conferma richiesta'
        };
      }
    });
    return out;
  }

  // ─── 4 · i quattro stati, indipendenti ──────────────────────────────────
  // Firmato, registrato, pagato e consegnato sono ASSI DIVERSI. Un contratto
  // può essere firmato e non registrato, registrato e non consegnato, pagato
  // e non firmato (l'acconto). Uno stato unico li appiattirebbe e l'operatore
  // perderebbe esattamente l'informazione per cui apre la pratica.
  //
  // Ogni asse porta la sua PROVA. Senza prova lo stato non è "no": è
  // 'da_verificare'. È la regola 4 dell'intestazione, applicata ovunque.
  var UNKNOWN = 'da_verificare';

  function axisSigned(p) {
    var s = (p && p.signature) || {};
    if (s.mode === 'external' && s.verifiedBy && s.verifiedAt) {
      return { state: 'firmato', basis: 'firma esterna verificata da ' + s.verifiedBy + ' il ' + s.verifiedAt, verified: true, external: true };
    }
    if (s.mode === 'external') {
      return { state: UNKNOWN, basis: 'firma dichiarata esterna, verifica dell\'operatore non registrata', verified: false, external: true };
    }
    // Magic Sign: si LEGGE lo stato vero del contratto, non lo si scrive.
    if (p && p.signatureStatus === 'complete') {
      return { state: 'firmato', basis: 'firma digitale completa (Magic Sign)', verified: true, external: false };
    }
    if (p && p.signatureStatus && p.signatureStatus !== 'none') {
      return { state: 'parziale', basis: 'firma digitale in corso: ' + p.signatureStatus, verified: false, external: false };
    }
    return { state: UNKNOWN, basis: 'nessuna firma registrata', verified: false, external: false };
  }

  function axisRegistered(p) {
    var r = (p && p.registration) || {};
    if (r.registeredAt && r.protocol) {
      return { state: 'registrato', basis: 'estremi di registrazione presenti (' + r.protocol + ')', verified: true };
    }
    if (r.registeredAt && !r.protocol) {
      return { state: UNKNOWN, basis: 'data di registrazione senza estremi: da completare', verified: false };
    }
    if (r.requestedAt) {
      return { state: 'in_corso', basis: 'richiesta inviata il ' + r.requestedAt + ', esito non ancora ricevuto', verified: false };
    }
    return { state: UNKNOWN, basis: 'nessun dato di registrazione', verified: false };
  }

  // La regola che protegge il cliente: nessuna ricevuta ≠ non pagato.
  function receiptStatus(period) {
    var pr = period || {};
    if (pr.receipt && (pr.receipt.sourceKey || pr.receipt.documentId)) {
      return { state: 'pagato', basis: 'ricevuta allegata', verified: true };
    }
    if (pr.bankMatchId) {
      return { state: 'pagato', basis: 'movimento bancario riconciliato', verified: true };
    }
    if (pr.declaredPaidBy) {
      return { state: 'pagato', basis: 'dichiarato da ' + pr.declaredPaidBy + ' senza ricevuta', verified: false };
    }
    return { state: UNKNOWN, basis: 'nessuna ricevuta: da verificare, NON risulta non pagato', verified: false };
  }

  function axisPaid(p) {
    var periods = (p && p.periods) || [];
    if (!periods.length) return { state: UNKNOWN, basis: 'nessun periodo in gestione', verified: false, detail: [] };
    var detail = periods.map(function (pr) {
      var r = receiptStatus(pr);
      return { period: pr.period, state: r.state, basis: r.basis, verified: r.verified };
    });
    var unknown = detail.filter(function (d) { return d.state === UNKNOWN; }).length;
    if (!unknown) return { state: 'pagato', basis: 'tutti i periodi in gestione hanno una prova', verified: true, detail: detail };
    return { state: UNKNOWN, basis: unknown + ' periodi senza prova di pagamento: da verificare', verified: false, detail: detail };
  }

  function axisDelivered(p) {
    var d = (p && p.delivery) || {};
    if (d.verbaleDocumentId || d.handoverAt) {
      return { state: 'consegnato', basis: d.verbaleDocumentId ? 'verbale di consegna in archivio' : 'consegna registrata il ' + d.handoverAt, verified: !!d.verbaleDocumentId };
    }
    return { state: UNKNOWN, basis: 'nessun verbale di consegna né data', verified: false };
  }

  function states(p) {
    return {
      firmato: axisSigned(p),
      registrato: axisRegistered(p),
      pagato: axisPaid(p),
      consegnato: axisDelivered(p)
    };
  }

  // ─── 5 · la data di presa in gestione ───────────────────────────────────
  // La linea che impedisce di fabbricare il passato. Prima di `takeoverDate`
  // BOOM non ha gestito niente: non c'è arretrato da riscuotere, non c'è
  // sollecito da mandare, non c'è fattura da emettere, non c'è registrazione
  // da rifare. I periodi anteriori si mostrano come STORICI, dichiarati tali.
  function takeoverPlan(pratica, now) {
    var p = pratica || {};
    var start = txt(p.startDate);
    var end = txt(p.endDate);
    var takeover = txt(p.takeoverDate);
    var errs = [];
    if (!isIsoDate(start)) errs.push('data di inizio mancante o non valida');
    if (!isIsoDate(takeover)) errs.push('data di presa in gestione mancante: senza, non si genera nessuno scadenzario');
    if (isIsoDate(start) && isIsoDate(takeover) && isoBefore(takeover, start)) {
      errs.push('la presa in gestione precede l\'inizio del contratto');
    }
    if (errs.length) return { ok: false, errors: errs, historical: [], managed: [] };

    var months = Number(p.installmentMonths) > 0 ? Number(p.installmentMonths) : 1;
    var historical = [], managed = [];
    var cursor = start, guard = 0;
    while (guard++ < 400) {
      if (isIsoDate(end) && !isoBefore(cursor, end)) break;
      var label = cursor.slice(0, 7);
      var period = { period: label, from: cursor, months: months };
      // Un periodo che INIZIA prima della presa in gestione è storico: non
      // lo abbiamo gestito noi. Il confine è l'inizio del periodo, non la
      // scadenza — altrimenti la rata di gennaio pagata a gennaio
      // diventerebbe nostra solo perché scade dopo.
      if (isoBefore(cursor, takeover)) historical.push(period);
      else managed.push(period);
      var next = addMonthsIso(cursor, months);
      if (!next || next === cursor) break;
      cursor = next;
    }
    return {
      ok: true,
      errors: [],
      historical: historical,
      managed: managed,
      note: historical.length
        ? historical.length + ' periodi precedenti alla presa in gestione: storici, nessuna rata, nessun sollecito, nessuna fattura'
        : 'nessun periodo storico'
    };
  }

  // Il guardiano vero: qualunque scrittura che riguardi una data anteriore
  // alla presa in gestione va rifiutata, non "aggiustata".
  function guardBackdated(action, pratica) {
    var a = action || {};
    var takeover = txt((pratica || {}).takeoverDate);
    if (!isIsoDate(takeover)) return { allowed: false, why: 'presa in gestione non definita' };
    var when = txt(a.date || a.dueDate || a.period);
    if (when && when.length === 7) when = when + '-01';
    if (!isIsoDate(when)) return { allowed: true, why: 'azione senza data: nessun vincolo temporale' };
    var kinds = ['payment', 'invoice', 'reminder', 'registration'];
    if (kinds.indexOf(a.kind) >= 0 && isoBefore(when, takeover)) {
      return { allowed: false, why: 'il periodo ' + when + ' precede la presa in gestione (' + takeover + '): storico, non si genera ' + a.kind };
    }
    return { allowed: true, why: '' };
  }

  // ─── 6 · la firma esterna non è Magic Sign ──────────────────────────────
  // I campi che la firma digitale scrive sono la PROVA giuridica del suo
  // percorso: token, IP, user agent, ora, hash del documento firmato.
  // Riempirli a mano per un contratto di carta produrrebbe un certificato che
  // afferma un fatto mai avvenuto. Questa funzione esiste per rendere quel
  // gesto impossibile, non sconsigliato.
  var MAGIC_FIELDS = [
    'tenantSignature', 'landlordSignature', 'tenantSignedAt', 'landlordSignedAt',
    'tenantSignToken', 'landlordSignToken', 'tenantSignIP', 'landlordSignIP',
    'tenantSignUA', 'landlordSignUA', 'signatureStatus', 'signatureCertificate',
    'coTenants', 'landlordSignedByDelegate', 'finalizedAt', 'signedPdfUrl'
  ];

  function magicSignFieldsTouched(patch) {
    var p = patch || {};
    return MAGIC_FIELDS.filter(function (f) { return Object.prototype.hasOwnProperty.call(p, f); });
  }

  function externalSignature(input) {
    var i = input || {};
    var errs = [];
    if (!txt(i.verifiedBy)) errs.push('serve chi ha verificato la firma');
    if (!isIsoDate(i.signedOn)) errs.push('serve la data di firma sul documento (AAAA-MM-GG)');
    if (!txt(i.evidenceSourceKey)) errs.push('serve il documento firmato allegato alla pratica');
    if (errs.length) return { ok: false, errors: errs };
    return {
      ok: true,
      errors: [],
      signature: {
        mode: 'external',
        signedOn: i.signedOn,
        verifiedBy: txt(i.verifiedBy),
        verifiedAt: txt(i.verifiedAt) || null,
        evidenceSourceKey: txt(i.evidenceSourceKey),
        note: txt(i.note).slice(0, 500) || null,
        // detto a chiare lettere sul documento stesso: nessuno, rileggendolo
        // fra due anni, deve poterlo scambiare per una firma digitale BOOM
        disclaimer: 'Firma apposta fuori dal sistema. BOOM non certifica questa firma: ne registra la verifica dell\'operatore.'
      }
    };
  }

  // ─── 7 · mancanti, incongruenze, prossima azione ────────────────────────
  // Solo dai dati VERIFICATI. Una scadenza calcolata su una data letta male
  // da un OCR è peggio di nessuna scadenza: l'operatore ci crede.
  var REQUIRED_DOCS = [
    { key: 'contratto', label: 'Contratto firmato', why: 'è il documento della pratica' },
    { key: 'identita_conduttore', label: 'Documento del conduttore', why: 'serve alla registrazione e al fascicolo' },
    { key: 'registrazione', label: 'Ricevuta di registrazione (RLI)', why: 'prova la registrazione presso l\'Agenzia' },
    { key: 'ape', label: 'APE', why: 'richiamato dal contratto (dichiarazione energetica)' },
    { key: 'verbale', label: 'Verbale di consegna', why: 'i contratti tipo rinviano al verbale per lo stato e le chiavi' },
    { key: 'planimetria', label: 'Planimetria', why: 'utile per asseverazione e fascicolo' }
  ];

  function missingDocs(pratica) {
    var have = {};
    ((pratica || {}).documents || []).forEach(function (d) { if (d && d.key) have[d.key] = d; });
    return REQUIRED_DOCS.map(function (r) {
      var d = have[r.key];
      return { key: r.key, label: r.label, why: r.why, present: !!d, documentId: d ? (d.documentId || null) : null };
    });
  }

  function inconsistencies(pratica) {
    var p = pratica || {};
    var out = [];
    var rent = num(p.rent), annual = num(p.annualRent), dep = num(p.deposit), depM = num(p.depositMonths);

    // Il controllo 12× è una CONVENZIONE aritmetica, non una regola di legge:
    // se le parti hanno pattuito diversamente si modella, non si corregge.
    // (SourceKit, limite 5.)
    if (rent && annual && Math.abs(annual - rent * 12) > 1) {
      out.push({ level: 'errore', path: 'contract.annualRent', msg: 'canone annuo (' + annual + ') diverso da 12 × mensile (' + (rent * 12) + '): una pattuizione diversa va modellata, non corretta da sola' });
    }
    if (rent && dep && depM && Math.abs(dep - rent * depM) > 1) {
      out.push({ level: 'avviso', path: 'contract.deposit', msg: 'deposito (' + dep + ') diverso da ' + depM + ' × canone (' + (rent * depM) + ')' });
    }
    if (isIsoDate(p.startDate) && isIsoDate(p.endDate) && !isoBefore(p.startDate, p.endDate)) {
      out.push({ level: 'errore', path: 'contract.endDate', msg: 'la data di fine non è successiva a quella di inizio' });
    }
    if (isIsoDate(p.startDate) && isIsoDate(p.takeoverDate) && isoBefore(p.takeoverDate, p.startDate)) {
      out.push({ level: 'errore', path: 'contract.takeoverDate', msg: 'la presa in gestione precede l\'inizio del contratto' });
    }
    var day = num(p.paymentDay);
    if (day !== null && (day < 1 || day > 31)) {
      out.push({ level: 'errore', path: 'contract.paymentDay', msg: 'giorno di pagamento fuori range' });
    }
    // conflitti irrisolti dell'unione: sono incongruenze a tutti gli effetti
    ((p.extraction && p.extraction.conflicts) || []).forEach(function (c) {
      out.push({ level: 'errore', path: c.path, msg: 'due documenti in disaccordo: "' + c.kept + '" contro "' + c.seen + '" — ' + c.reason });
    });
    return out;
  }

  // UNA prossima azione, con un responsabile e una scadenza fondata.
  // Ordine: prima ciò che blocca, poi ciò che scade, poi ciò che completa.
  function nextAction(pratica, now) {
    var p = pratica || {};
    var st = states(p);
    var missing = missingDocs(p).filter(function (m) { return !m.present; });
    var bad = inconsistencies(p).filter(function (i) { return i.level === 'errore'; });

    if (bad.length) {
      return { action: 'Risolvi l\'incongruenza: ' + bad[0].msg, owner: 'operatore', due: null, basis: 'dato in contraddizione', blocking: true };
    }
    if (!isIsoDate(p.takeoverDate)) {
      return { action: 'Fissa la data di presa in gestione', owner: 'operatore', due: null, basis: 'senza, non nasce nessuno scadenzario', blocking: true };
    }
    if (st.firmato.state === UNKNOWN) {
      return { action: 'Registra la verifica della firma esterna', owner: 'operatore', due: null, basis: st.firmato.basis, blocking: true };
    }
    if (st.registrato.state === UNKNOWN) {
      var m = missing.filter(function (x) { return x.key === 'registrazione'; })[0];
      return { action: 'Verifica se il contratto è già registrato e allega la ricevuta RLI', owner: 'operatore', due: null,
        basis: m ? m.why : st.registrato.basis, blocking: false };
    }
    if (st.registrato.state === 'in_corso') {
      return { action: 'Attendi e allega l\'esito della registrazione', owner: 'ASPI', due: null, basis: st.registrato.basis, blocking: false };
    }
    var unpaid = (st.pagato.detail || []).filter(function (d) { return d.state === UNKNOWN; });
    if (unpaid.length) {
      return { action: 'Verifica il pagamento del periodo ' + unpaid[0].period + ' e allega la ricevuta', owner: 'operatore', due: null,
        basis: 'nessuna prova per quel periodo: da verificare, non risulta non pagato', blocking: false };
    }
    if (missing.length) {
      return { action: 'Allega: ' + missing[0].label, owner: 'operatore', due: null, basis: missing[0].why, blocking: false };
    }
    // Scadenza contrattuale: la sola data che deriviamo, e solo se è certa.
    if (isIsoDate(p.endDate)) {
      return { action: 'Pratica completa: monitora la scadenza del ' + p.endDate, owner: 'operatore', due: p.endDate, basis: 'data di fine dal contratto verificato', blocking: false };
    }
    return { action: 'Pratica completa', owner: 'operatore', due: null, basis: 'nessun elemento aperto', blocking: false };
  }

  // ─── 8 · il cancello ────────────────────────────────────────────────────
  // Una proposta non è una pratica. Come `saveable` dell'inventario: senza la
  // revisione umana non si scrive niente.
  function confirmable(draft) {
    var d = draft || {};
    var errs = [];
    if (!d.reviewed) errs.push('la revisione dell\'operatore è obbligatoria');
    if (!praticaKey(toSections(d.extraction || {}))) {
      errs.push('dati insufficienti per identificare la pratica: servono almeno due fra indirizzo, conduttore e data di inizio');
    }
    if (!isIsoDate(d.takeoverDate)) errs.push('serve la data di presa in gestione');
    var links = d.links || {};
    ['property', 'tenant'].forEach(function (k) {
      var l = links[k];
      if (l && l.decision === 'da_confermare' && !l.chosen && !l.createNew) {
        errs.push('l\'aggancio "' + k + '" è un indizio debole: conferma o crea nuovo');
      }
    });
    var touched = magicSignFieldsTouched(d.patch || {});
    if (touched.length) errs.push('campi di firma digitale nel patch: ' + touched.join(', ') + ' — una pratica importata non firma mai per Magic Sign');
    var bad = inconsistencies(d).filter(function (i) { return i.level === 'errore'; });
    bad.forEach(function (i) { errs.push(i.msg); });
    return { ok: !errs.length, errors: errs };
  }

  // ─── 9 · formati ────────────────────────────────────────────────────────
  // Dichiarati esplicitamente, come chiesto: ciò che il lettore accetta oggi
  // e ciò che NON accetta, invece di far scoprire il limite con un errore.
  var ACCEPTED = [
    { mime: 'application/pdf', ext: ['pdf'], note: 'testo e scansioni; il documento viaggia intero al lettore' },
    { mime: 'image/jpeg', ext: ['jpg', 'jpeg'], note: 'foto del contratto; ridotte lato client prima dell\'invio' },
    { mime: 'image/png', ext: ['png'], note: 'scansioni e schermate' },
    { mime: 'image/webp', ext: ['webp'], note: 'immagini moderne' },
    { mime: 'image/heic', ext: ['heic'], note: 'foto iPhone; convertite dal browser quando possibile' }
  ];
  var NOT_ACCEPTED = [
    { ext: ['doc', 'docx'], why: 'i modelli Word restano gli ORIGINALI del SourceKit: si conservano, non si rileggono per ricostruire il testo. Per importarne il contenuto, esportare in PDF.' },
    { ext: ['zip', 'rar', '7z'], why: 'un archivio nasconde cosa si sta caricando: estrarre e allegare i singoli documenti' },
    { ext: ['xls', 'xlsx', 'csv'], why: 'un foglio di calcolo non è un contratto: per i movimenti c\'è l\'import della Banca' },
    { ext: ['eml', 'msg'], why: 'per le email c\'è lo Smistatore (inoltro alla casella BOOM)' }
  ];

  function acceptsFile(file) {
    var f = file || {};
    var mime = low(f.mediaType || f.type);
    var ext = low(f.name).split('.').pop();
    var hit = ACCEPTED.filter(function (a) { return a.mime === mime || a.ext.indexOf(ext) >= 0; })[0];
    if (hit) return { ok: true, mime: hit.mime, note: hit.note };
    var no = NOT_ACCEPTED.filter(function (n) { return n.ext.indexOf(ext) >= 0; })[0];
    if (no) return { ok: false, why: no.why };
    return { ok: false, why: 'formato non gestito: sono accettati PDF, JPG, PNG, WebP e HEIC' };
  }

  var API = {
    // identità
    praticaKey: praticaKey,
    sourceKey: sourceKey,
    dedupeSources: dedupeSources,
    // lettura
    mergeExtraction: mergeExtraction,
    toSections: toSections,
    // agganci
    linkProposals: linkProposals,
    // stati
    states: states,
    receiptStatus: receiptStatus,
    // gestione
    takeoverPlan: takeoverPlan,
    guardBackdated: guardBackdated,
    // firma
    externalSignature: externalSignature,
    magicSignFieldsTouched: magicSignFieldsTouched,
    MAGIC_FIELDS: MAGIC_FIELDS,
    // quadro
    missingDocs: missingDocs,
    inconsistencies: inconsistencies,
    nextAction: nextAction,
    confirmable: confirmable,
    // formati
    acceptsFile: acceptsFile,
    ACCEPTED: ACCEPTED,
    NOT_ACCEPTED: NOT_ACCEPTED,
    REQUIRED_DOCS: REQUIRED_DOCS,
    UNKNOWN: UNKNOWN,
    // utilità esposte perché la porta e la pagina non le riscrivano
    normAddress: normAddress,
    isIsoDate: isIsoDate,
    addMonthsIso: addMonthsIso
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_PRATICA = API;
})(typeof window !== 'undefined' ? window : this);
