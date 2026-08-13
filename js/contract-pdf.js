/* js/contract-pdf.js — IL CONTRATTO, UNA COPIA SOLA (Allegato B + Allegato C).
 *
 * I due generatori del contratto di locazione (Allegato B transitorio,
 * Allegato C studenti — modelli CAF verbatim, accordi Roma 25/07/2023 e
 * 27/07/2023) vivevano DENTRO js/portal-app.js: potevano girare solo nel
 * browser del portal. Conseguenza vera, agosto 2026: un contratto creato dal
 * rail pre-agreement (convert/send-sign, tutto server-side) nasceva SENZA
 * generatedPDF — sign.html non mostrava "View full contract PDF" prima della
 * firma, e _finalize.js saltava il contratto firmato in allegato. Il
 * promemoria Telegram "genera il PDF dal portal" era il cerotto.
 *
 * Qui c'è SOLO l'impaginato (jsPDF, testo puro, font standard 'times' — mai
 * un asset esterno), estratto verbatim dal portal. Chi chiama porta:
 *   - il costruttore jsPDF (browser: window.jspdf.jsPDF via CDN 2.5.1;
 *     server: import 'jspdf' npm, STESSA versione — l'impaginato è identico
 *     per costruzione, non per somiglianza);
 *   - i dati già risolti (contract, property, tenant, landlord) — il modulo
 *     non legge né Firestore né S.*;
 * e riceve { doc, sigAnchors, hashSeed }: l'upload, l'hash e il patch del
 * documento restano dal chiamante (portal: Storage SDK + serverTimestamp;
 * server: storageUpload + fsPatch). sigAnchors sono le ancore delle righe
 * firma che _finalize.js usa per stampare le firme grafiche SUL contratto.
 *
 * UMD come boom-geo/dispo-engine: <script> nel portal → window.BOOM_CONTRACT_PDF,
 * import ESM dai file api/** (root package.json è commonjs).
 *
 * REGOLA DURA: mai rigenerare il PDF di un contratto con una firma viva —
 * la guardia sta nei chiamanti (regenerateContractPDF nel portal,
 * ensureContractPdf sul server), qui si impagina e basta.
 */
(function (root) {
  'use strict';

  // ── Helper condivisi dai due modelli (copie locali: il modulo deve
  // impaginare identico ovunque, senza dipendere dal portal) ──────────────
  function fmtDate(d) { if (!d) return '—'; const dt = d.toDate ? d.toDate() : new Date(d); return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('it-IT'); }

  function monthsBetween(startDate, endDate) {
    if (!startDate || !endDate) return { months: 0, days: 0, total: 0, text: '' };
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start) || isNaN(end) || end < start) return { months: 0, days: 0, total: 0, text: '' };
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    let days = end.getDate() - start.getDate();
    if (days < 0) {
      months -= 1;
      const lastMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      days += lastMonth.getDate();
    }
    const total = months + (days / 30);
    let text = '';
    if (months >= 12) {
      const years = Math.floor(months / 12);
      const remMonths = months % 12;
      text = years + ' ' + (years === 1 ? 'anno' : 'anni');
      if (remMonths) text += ' e ' + remMonths + ' mes' + (remMonths === 1 ? 'e' : 'i');
      if (days) text += ' e ' + days + ' giorn' + (days === 1 ? 'o' : 'i');
    } else if (months > 0) {
      text = months + ' mes' + (months === 1 ? 'e' : 'i');
      if (days) text += ' e ' + days + ' giorn' + (days === 1 ? 'o' : 'i');
    } else {
      text = days + ' giorn' + (days === 1 ? 'o' : 'i');
    }
    return { months, days, total, text };
  }

  function impiantiClause(contract, property) {
    const custom = (contract && contract.propertyExtra && contract.propertyExtra.sicurezzaImpianti)
      || (property && property.safetyImplants) || '';
    if (custom) return custom;
    const stato = (contract && contract.impiantiStato) || '';
    if (stato === 'conformi') {
      return 'Il locatore dichiara che gli impianti presenti nell’unità immobiliare sono conformi alla normativa vigente e consegna al conduttore copia della dichiarazione di conformità ai sensi del D.M. 37/2008.';
    }
    if (stato === 'non_certificati') {
      return 'Il conduttore prende atto che gli impianti esistenti nell’appartamento in oggetto e quelli condominiali non dispongono di certificazione a norma, ai sensi delle disposizioni vigenti in materia di sicurezza.';
    }
    return 'Le parti danno atto che gli impianti presenti nell’unità immobiliare sono funzionanti e idonei all’uso convenuto. Il locatore consegna al conduttore la documentazione tecnica in suo possesso; per gli impianti comuni si fa riferimento alla documentazione detenuta dall’amministratore del condominio.';
  }

  // Oneri accessori: niente puntini dove il cliente cerca un numero (la
  // frase è sempre completa e vera — acconto, incluso nel canone, o
  // regolazione a consuntivo).
  function oneriClause(contract) {
    const q = (contract && contract.oneriQuota !== undefined && contract.oneriQuota !== null && contract.oneriQuota !== '')
      ? Number(contract.oneriQuota) : null;
    if ((contract && contract.condoMode) === 'incluso') {
      return 'Le spese di cui al presente articolo sono comprese nel canone: nessun importo a titolo di oneri accessori è dovuto dal conduttore, salvo i consumi individuali a suo carico.';
    }
    if (q !== null && !isNaN(q) && q > 0) {
      return 'Per le spese di cui al presente articolo il conduttore versa una quota di € ' + q.toLocaleString('it-IT') + ' al mese, salvo conguaglio.';
    }
    return 'Le spese di cui al presente articolo sono regolate a consuntivo secondo la Tabella oneri accessori richiamata: il conduttore non versa alcun acconto e corrisponde la quota di sua spettanza entro sessanta giorni dalla richiesta documentata.';
  }

  // === ALLEGATO B — Locazione abitativa di natura transitoria (verbatim CAF) ===
  // Accordo territoriale Roma Capitale 25/07/2023, prot. QC/82672/2023 —
  // L. 431/98 art. 5 comma 1. Estratto verbatim da portal-app.js.
  function buildAllegatoB({ jsPDF, contractId, contract, property, tenant, landlord }) {
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    const pageW = 210, pageH = 297;
    const margin = 20;
    const pw = pageW - 2 * margin;          // 170 mm content width
    const bottomLimit = pageH - margin;     // 277 mm
    let y = margin;

    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setLineHeightFactor(1.15);

    const ptToMm = (pt) => pt * 0.3528;

    function ensureSpace(blockH) {
      if (y + blockH > bottomLimit) {
        doc.addPage();
        y = margin;
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        doc.setLineHeightFactor(1.15);
      }
    }

    function addParagraph(text, opts) {
      opts = opts || {};
      const size = opts.size || 11;
      const style = opts.bold ? 'bold' : (opts.italic ? 'italic' : 'normal');
      const x = (opts.x !== undefined) ? opts.x : margin;
      const w = opts.width || pw;
      const after = (opts.after !== undefined) ? opts.after : 3;
      const align = opts.align || 'left';
      doc.setFont('times', style);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, w);
      const lineH = ptToMm(size) * 1.15;
      ensureSpace(lines.length * lineH);
      if (align === 'left') {
        doc.text(lines, x, y);
      } else {
        doc.text(lines, x, y, { align: align, maxWidth: w });
      }
      y += lines.length * lineH + after;
    }

    function addArticle(num, title, body) {
      ensureSpace(18);
      y += 3;
      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      doc.text('Articolo ' + num + ' — ' + title, margin, y);
      y += 4;
      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      const lineH = ptToMm(11) * 1.15;
      const paragraphs = body.split('\n\n');
      for (let pi = 0; pi < paragraphs.length; pi++) {
        const lines = doc.splitTextToSize(paragraphs[pi], pw);
        ensureSpace(lines.length * lineH);
        doc.text(lines, margin, y, { align: 'justify', maxWidth: pw });
        y += lines.length * lineH;
        if (pi < paragraphs.length - 1) y += lineH * 0.5;
      }
      y += 2;
    }

    function formatCadastral(p) {
      if (!p) return '';
      const parts = [];
      if (p.foglio)    parts.push('foglio ' + p.foglio);
      if (p.particella) parts.push('particella ' + p.particella);
      if (p.sub)       parts.push('sub ' + p.sub);
      if (p.categoria) parts.push('cat. ' + p.categoria);
      return parts.join(', ');
    }

    const fmtIt = (n) => Number(n || 0).toLocaleString('it-IT');
    const dot = '………';

    // --------------- Variable data points ---------------
    // Identity fallback chain: contract fields (Magic Sign / La
    // Scheda) → users sign-schema (cf/dob/…) → users wizard-schema
    // (codiceFiscale/birthDate/…) — a regenerated PDF must never
    // print dots for data a party already self-filled.
    const pick = (...vals) => { for (const v of vals) { if (v !== undefined && v !== null && String(v).trim() !== '') return String(v); } return ''; };
    const locName = pick(contract.landlordName, landlord && landlord.name) || dot;
    const locDOBr = pick(contract.landlordDob, landlord && landlord.dob, landlord && landlord.birthDate);
    const locDOB  = locDOBr ? fmtDate(locDOBr) : dot;
    const locPOB  = pick(contract.landlordPob, landlord && landlord.pob, landlord && landlord.birthPlace) || dot;
    const locDom  = pick(contract.landlordAddress, landlord && landlord.address) || dot;
    const locCF   = pick(contract.landlordCF, landlord && landlord.cf, landlord && landlord.codiceFiscale) || dot;

    const tenName = pick(contract.tenantName, tenant && tenant.name) || dot;
    const tenDOBr = pick(contract.tenantDob, tenant && tenant.dob, tenant && tenant.birthDate);
    const tenDOB  = tenDOBr ? fmtDate(tenDOBr) : dot;
    const tenPOB  = pick(contract.tenantPob, tenant && tenant.pob, tenant && tenant.birthPlace) || dot;
    const tenDom  = pick(contract.tenantAddress, tenant && tenant.address) || dot;
    const tenCF   = pick(contract.tenantCF, tenant && tenant.cf, tenant && tenant.codiceFiscale) || dot;
    const tenDocT = pick(contract.tenantDocType, tenant && tenant.docType, tenant && tenant.idDocType);
    const tenDocN = pick(contract.tenantDocNum, tenant && tenant.docNum, tenant && tenant.idDocNumber);
    const tenDoc  = tenDocT ? (tenDocT + (tenDocN ? ' n. ' + tenDocN : '')) : dot;

    const propCity   = (property && property.city)    || 'Roma';
    const propStreet = (property && property.address) || dot;
    const propFloor  = (property && property.floor)   || dot;
    const propScala  = (property && property.scala)   || dot;
    const propInt    = (property && (property.interno || property.unit)) || dot;
    const propRooms  = (property && property.rooms)   || dot;
    const propAcc    = (property && property.accessories) || dot;
    const propFurnishedFlag = property && property.furnished;
    const propFurnished = propFurnishedFlag ? 'ammobiliata' : 'non ammobiliata';

    const cadast    = (property && property.cadastralData) || formatCadastral(property) || dot;
    const energy    = (property && (property.energyCert || property.energyClass)) || dot;
    const sicurezza = impiantiClause(contract, property);
    const tab = (contract.propertyExtra && contract.propertyExtra.tabelleMillesimali) || {};
    const tabFmt = (v) => (v !== undefined && v !== null && v !== '') ? String(v) : dot;
    const tabPro = tabFmt(tab['proprietà']);
    const tabRis = tabFmt(tab.riscaldamento);
    const tabAcq = tabFmt(tab.acqua);
    const tabAlt = tabFmt(tab.altre);

    const durText = (contract.durata && contract.durata.text)
                    || (contract.startDate && contract.endDate ? monthsBetween(contract.startDate, contract.endDate).text : '')
                    || (contract.durationMonths ? contract.durationMonths + ' mesi' : dot);
    const durStart = (contract.durata && contract.durata.startDate) || contract.startDate;
    const durEnd   = (contract.durata && contract.durata.endDate)   || contract.endDate;
    const durStartStr = durStart ? fmtDate(durStart) : dot;
    const durEndStr   = durEnd   ? fmtDate(durEnd)   : dot;

    const canMonthly      = (contract.canone && contract.canone.monthly)      || contract.rent || 0;
    const canInstallments = (contract.canone && contract.canone.installments) || 12;
    const canTotal        = (contract.canone && contract.canone.total)        || (canMonthly * canInstallments);
    const canDay          = (contract.canone && contract.canone.paymentDay)   || contract.paymentDay   || 5;
    const canMethod       = (contract.canone && contract.canone.paymentMethod)|| contract.paymentMethod|| 'bonifico bancario';
    const cedolareSecca   = (contract.canone && contract.canone.cedolareSecca === true) || contract.cedolareSecca === true;
    const oneriMode       = (contract.canone && contract.canone.oneriMode)    || 'tabella_allegato_d';
    const oneriSoglia     = (contract.canone && contract.canone.oneriSoglia)  || null;

    const depAmount = (contract.deposit && typeof contract.deposit === 'object')
      ? (contract.deposit.amount || 0)
      : (contract.deposit || 0);
    const depMonthsRaw = (contract.deposit && typeof contract.deposit === 'object'
                          && contract.deposit.months !== undefined && contract.deposit.months !== null)
      ? Number(contract.deposit.months)
      : (canMonthly > 0 ? Math.round((depAmount / canMonthly) * 100) / 100 : 0);
    const depMonthsStr = depMonthsRaw.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const transReason = (contract.motivazioneTransitorieta && contract.motivazioneTransitorieta.esigenza)
                        || contract.transitionalReason || dot;
    const transDoc    = (contract.motivazioneTransitorieta && contract.motivazioneTransitorieta.documento)
                        || contract.transitionalDocs   || dot;

    const conviventi  = (contract.uso && contract.uso.conviventi) || contract.cohabitants || 'nessuno';

    const consegnaStato = contract.consegnaStato || dot;

    const sigPlace = contract.signaturePlace || 'Roma';
    const sigDateRaw = contract.signatureDate || contract.fullySignedAt || new Date();
    const sigDateStr = fmtDate(sigDateRaw);

    // --------------- HEADER ---------------
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text('ALLEGATO B', pageW / 2, y, { align: 'center' });
    y += 7;
    doc.text('LOCAZIONE ABITATIVA DI NATURA TRANSITORIA', pageW / 2, y, { align: 'center' });
    y += 7;
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('(Legge 9 dicembre 1998, n. 431, articolo 5, comma 1)', pageW / 2, y, { align: 'center' });
    y += 5;
    const subHdr = doc.splitTextToSize("In conformità all'accordo territoriale di Roma Capitale del 25 luglio 2023 e depositato presso il Comune di Roma il 27/07/2023 prot. QC/82672/2023", pw);
    doc.text(subHdr, pageW / 2, y, { align: 'center', maxWidth: pw });
    y += subHdr.length * ptToMm(10) * 1.15 + 6;

    doc.setFont('times', 'normal');
    doc.setFontSize(11);

    // --------------- PARTI ---------------
    addParagraph(`Il/La sig./soc. ${locName}, nato/a il ${locDOB} a ${locPOB}, domiciliato/a in ${locDom}, C.F. ${locCF}, di seguito denominato/a locatore`);
    addParagraph(`concede in locazione al/alla sig. ${tenName}, nato/a il ${tenDOB} a ${tenPOB}, domiciliato/a in ${tenDom}, C.F. ${tenCF}, di seguito denominato/a conduttore, identificato/a mediante ${tenDoc}, che accetta, per sé e suoi aventi causa,`);

    addParagraph(`A) l'unità immobiliare posta in ${propCity}, via ${propStreet}, piano ${propFloor}, scala ${propScala}, int. ${propInt}, composta di n. ${propRooms} vani, oltre cucina e servizi, e dotata altresì dei seguenti elementi accessori ${propAcc}`);
    addParagraph(`${propFurnished} come da elenco a parte sottoscritto dalle parti.`);

    addParagraph(`a) estremi catastali identificativi dell'unità immobiliare: ${cadast}`);
    addParagraph(`b) prestazione energetica: ${energy}`);
    addParagraph(`c) sicurezza impianti: ${sicurezza}`);
    addParagraph(`d) tabelle millesimali: proprietà ${tabPro}, riscaldamento ${tabRis}, acqua ${tabAcq}, altre ${tabAlt}`);

    y += 2;
    addParagraph('La locazione è regolata dalle pattuizioni seguenti.', { italic: true, after: 2 });

    // --------------- ARTICOLI 1–17 (verbatim CAF) ---------------

    addArticle(1, 'Durata',
      `Il contratto è stipulato per la durata di ${durText}, dal ${durStartStr} al ${durEndStr}, allorché, fatto salvo quanto previsto dall'articolo 2, cessa senza bisogno di alcuna disdetta.`
    );

    addArticle(2, 'Esigenza del locatore/conduttore',
      `A) Il locatore/conduttore, nel rispetto di quanto previsto dal decreto del Ministro delle infrastrutture e dei trasporti di concerto con il Ministro dell'economia e delle finanze, emanato ai sensi dell'articolo 4, comma 2, della legge n. 431/98 - di cui il presente tipo di contratto costituisce l'Allegato B - e dall'Accordo territoriale di Roma Capitale del 25 luglio 2023 e depositato presso il Comune di Roma il 27/07/2023 prot. QC/82672/2023,\n\ndichiara la seguente esigenza che giustifica la transitorietà del contratto: ${transReason}, e che documenta, in caso di durata superiore a 30 giorni, allegando ${transDoc}.\n\nAi sensi di quanto previsto dall'art. 2, comma 4 del decreto Ministero delle infrastrutture e trasporti, ex art. 4 comma 2 legge 431/98, e dall'Accordo territoriale di Roma Capitale del 25 luglio 2023 depositato il 27/07/2023 presso il Comune di Roma prot. QC/82672/2023, le parti concordano che la presente locazione ha natura transitoria per il motivo indicato al precedente paragrafo.`
    );

    addArticle(3, 'Inadempimento delle modalità di stipula',
      `Il presente contratto è ricondotto alla durata prevista dall'art. 2 comma 1 della legge 9 dicembre 1998, n. 431, in caso di inadempimento delle modalità di stipula previste dall'art. 2, commi 1, 2, 3, 4, 5 e 6 del decreto dei Ministri delle infrastrutture e dell'economia e delle finanze ex art. 4 comma 2 della legge 431/98.\n\nIn ogni caso, ove il locatore abbia riacquistato la disponibilità dell'alloggio alla scadenza dichiarando di volerlo adibire ad un uso determinato e non lo adibisca, senza giustificato motivo, nel termine di sei mesi dalla data in cui ha riacquistato la detta disponibilità, a tale uso, il conduttore ha diritto al ripristino del rapporto di locazione alle condizioni di cui all'articolo 2, comma 1, della legge n. 431/98 o, in alternativa, ad un risarcimento in misura pari a trentasei mensilità dell'ultimo canone di locazione corrisposto.`
    );

    addArticle(4, 'Canone',
      `Il canone complessivo di locazione, riferito all'intera durata contrattuale di ${durText}, secondo quanto stabilito dall'Accordo territoriale di Roma Capitale del 25 luglio 2023, è convenuto in euro ${fmtIt(canTotal)} (${fmtIt(canTotal)}/00), importo che il conduttore si obbliga a corrispondere a mezzo di ${canMethod}, in n. ${canInstallments} rate mensili eguali anticipate di euro ${fmtIt(canMonthly)} (${fmtIt(canMonthly)}/00) ciascuna, da versare entro il giorno ${canDay} di ogni mese.`
    );

    addArticle(5, 'Deposito cauzionale e altre forme di garanzia',
      `A garanzia delle obbligazioni assunte col presente contratto, il conduttore versa al locatore (che con la firma del contratto ne rilascia quietanza) una somma di euro ${fmtIt(depAmount)} (${fmtIt(depAmount)}/00) pari a n. ${depMonthsStr} mensilità del canone, non imputabile in conto canoni e produttiva di interessi legali, riconosciuti al conduttore al termine della locazione. Il deposito cauzionale così costituito viene reso al termine della locazione previa verifica dello stato dell'unità immobiliare e dell'osservanza di ogni obbligazione contrattuale.`
    );

    // Article 6 — oneri accessori
    if (oneriMode === 'custom') {
      if (typeof console !== 'undefined') console.warn('[BOOM] Contract', contractId, 'uses oneriMode=custom — non conforme al CAF. Usare tabella_allegato_d per nuovi contratti.');
      const sogliaTxt = oneriSoglia ? ` (soglia € ${fmtIt(oneriSoglia)})` : '';
      addArticle(6, 'Oneri accessori',
        `[CLAUSOLA LEGACY — non conforme CAF] Per gli oneri accessori si applica la formula concordata fra le parti${sogliaTxt}. Sono interamente a carico del conduttore le spese relative ad ogni utenza (energia elettrica, acqua, gas, telefono e altro).`
      );
    } else {
      addArticle(6, 'Oneri accessori',
        `Per gli oneri accessori le parti fanno applicazione della Tabella oneri accessori, allegato D al decreto emanato dal Ministro delle infrastrutture e dei trasporti di concerto con il Ministro dell'economia e delle finanze ai sensi dell'articolo 4, comma 2, della legge n. 431/1998 e di cui il presente contratto costituisce l'Allegato B.\n\nIn sede di consuntivo, il pagamento degli oneri anzidetti, per la quota parte di quelli condominiali/comuni a carico del conduttore, deve avvenire entro sessanta giorni dalla richiesta. Prima di effettuare il pagamento, il conduttore ha diritto di ottenere l'indicazione specifica delle spese anzidette e dei criteri di ripartizione. Ha inoltre diritto di prendere visione - anche tramite organizzazioni sindacali - presso il locatore (o il suo amministratore o l'amministratore condominiale, ove esistente) dei documenti giustificativi delle spese effettuate.\n\nSono interamente a carico del conduttore le spese relative ad ogni utenza (energia elettrica, acqua, gas, telefono e altro).`
      );
    }

    // Article 7 — bollo / registrazione (parametric on cedolareSecca)
    if (cedolareSecca) {
      addArticle(7, 'Spese di bollo e registrazione — regime cedolare secca',
        `Le parti danno atto che il locatore ha esercitato l'opzione per l'applicazione del regime della cedolare secca di cui all'art. 3 del d.lgs. 14 marzo 2011 n. 23. Ai sensi dell'art. 3, comma 11 del medesimo decreto, per l'intera durata dell'opzione sono sospesi, in favore del locatore, gli obblighi di versamento dell'imposta di registro e dell'imposta di bollo, ivi compresa quella dovuta per la risoluzione e per le proroghe del contratto. Il locatore provvede alla registrazione del contratto, dandone comunicazione al conduttore e all'Amministratore del Condominio ai sensi dell'art. 13 della legge 431/98.`
      );
    } else {
      addArticle(7, 'Spese di bollo e registrazione',
        `Le spese di bollo per il presente contratto e per le ricevute conseguenti sono a carico del conduttore. Il locatore provvede alla registrazione del contratto, ove dovuta, dandone comunicazione al conduttore - che corrisponde la quota di sua spettanza, pari alla metà - e all'Amministratore del Condominio ai sensi dell'art. 13 della legge 431/98.\n\nLe parti possono delegare alla registrazione del contratto una delle organizzazioni sindacali che abbia prestato assistenza ai fini della stipula del contratto medesimo.`
      );
    }

    addArticle(8, 'Pagamento',
      `Il pagamento del canone o di quant'altro dovuto anche per oneri accessori non può venire sospeso o ritardato da pretese o eccezioni del conduttore, qualunque ne sia il titolo. Il mancato puntuale pagamento, per qualunque causa, anche di una sola rata del canone (nonché di quant'altro dovuto, ove di importo pari almeno ad una mensilità del canone), costituisce in mora il conduttore, fatto salvo quanto previsto dall'articolo 55 della legge n. 392/78.`
    );

    addArticle(9, 'Uso',
      `L'immobile deve essere destinato esclusivamente a civile abitazione del conduttore e delle seguenti persone attualmente con lui conviventi: ${conviventi}\n\nSalvo patto scritto contrario, è fatto divieto di sublocare o dare in comodato, né in tutto né in parte, l'unità immobiliare, pena la risoluzione di diritto del contratto. Per la successione nel contratto, si applica l'articolo 6 della legge n. 392/78, nel testo vigente a seguito della sentenza della Corte costituzionale n. 404 del 1988.`
    );

    addArticle(10, 'Recesso del conduttore',
      `Il conduttore ha facoltà di recedere per gravi motivi dal contratto previo avviso da recapitarsi mediante lettera raccomandata almeno tre mesi prima.`
    );

    addArticle(11, 'Consegna',
      `Il conduttore dichiara di aver visitato l'unità immobiliare locatagli, di averla trovata adatta all'uso convenuto e, pertanto, di prenderla in consegna ad ogni effetto col ritiro delle chiavi, costituendosi da quel momento custode della stessa. Il conduttore si impegna a riconsegnare l'unità immobiliare nello stato in cui l'ha ricevuta, salvo il deperimento d'uso, pena il risarcimento del danno; si impegna, altresì, a rispettare le norme del regolamento dello stabile ove esistente, accusando in tal caso ricevuta dello stesso con la firma del presente contratto, così come si impegna ad osservare le deliberazioni dell'assemblea dei condomini. È in ogni caso vietato al conduttore compiere atti e tenere comportamenti che possano recare molestia agli altri abitanti dello stabile.\n\nLe parti danno atto, in relazione allo stato dell'unità immobiliare, ai sensi dell'articolo 1590 del Codice civile, di quanto segue: ${consegnaStato}`
    );

    addArticle(12, 'Modifiche e danni',
      `Il conduttore non può apportare alcuna modifica, innovazione, miglioria o addizione ai locali locati ed alla loro destinazione, o agli impianti esistenti, senza il preventivo consenso scritto del locatore. Il conduttore esonera espressamente il locatore da ogni responsabilità per danni diretti o indiretti che possano derivargli da fatti dei dipendenti del locatore medesimo nonché per interruzioni incolpevoli dei servizi.`
    );

    addArticle(13, 'Assemblee',
      `Il conduttore ha diritto di voto, in luogo del proprietario dell'unità immobiliare locatagli, nelle deliberazioni dell'assemblea condominiale relative alle spese ed alle modalità di gestione dei servizi di riscaldamento e di condizionamento d'aria. Ha inoltre diritto di intervenire, senza voto, sulle deliberazioni relative alla modificazione degli altri servizi comuni.\n\nQuanto stabilito in materia di riscaldamento e di condizionamento d'aria si applica anche ove si tratti di edificio non in condominio. In tale caso (e con l'osservanza, in quanto applicabili, delle disposizioni del codice civile sull'assemblea dei condomini) i conduttori si riuniscono in apposita assemblea, convocata dalla proprietà o da almeno tre conduttori.`
    );

    addArticle(14, 'Impianti',
      `Il conduttore - in caso d'installazione sullo stabile di antenna televisiva centralizzata - si obbliga a servirsi unicamente dell'impianto relativo, restando sin d'ora il locatore, in caso di inosservanza, autorizzato a far rimuovere e demolire ogni antenna individuale a spese del conduttore, il quale nulla può pretendere a qualsiasi titolo, fatte salve le eccezioni di legge.\n\nPer quanto attiene all'impianto termico autonomo, ove presente, ai sensi della normativa del d.lgs n. 192/05, con particolare riferimento all'art. 7 comma 1, il conduttore subentra per la durata della detenzione alla figura del proprietario nell'onere di adempiere alle operazioni di controllo e di manutenzione.`
    );

    addArticle(15, 'Accesso',
      `Il conduttore deve consentire l'accesso all'unità immobiliare al locatore, al suo amministratore nonché ai loro incaricati ove gli stessi ne abbiano - motivandola - ragione.\n\nNel caso in cui il locatore intenda vendere o locare l'unità immobiliare, in caso di recesso anticipato del conduttore, questi deve consentirne la visita una volta la settimana, per almeno due ore, con esclusione dei giorni festivi.`
    );

    addArticle(16, 'Commissione di negoziazione paritetica e conciliazione stragiudiziale',
      `La Commissione di cui all'articolo 6 del decreto del Ministro delle infrastrutture e dei trasporti di concerto con il Ministro dell'economia e delle finanze, emanato ai sensi dell'articolo 4, comma 2, della legge 431/98, è composta da due membri scelti fra appartenenti alle rispettive organizzazioni firmatarie dell'Accordo territoriale sulla base delle designazioni, rispettivamente, del locatore e del conduttore.\n\nL'operato della Commissione è disciplinato dal documento "Procedure di negoziazione e conciliazione stragiudiziale nonché modalità di funzionamento della Commissione" Allegato E, al sopracitato decreto.\n\nLa richiesta di intervento della Commissione non determina la sospensione delle obbligazioni contrattuali. La richiesta di attivazione della Commissione non comporta oneri.`
    );

    addArticle(17, 'Varie',
      `A tutti gli effetti del presente contratto, comprese la notifica degli atti esecutivi, e ai fini della competenza a giudicare, il conduttore elegge domicilio nei locali a lui locati e, ove egli più non li occupi o comunque detenga, presso l'ufficio di segreteria del Comune ove è situato l'immobile locato.\n\nQualunque modifica al presente contratto non può aver luogo, e non può essere provata, se non con atto scritto.\n\nIl locatore ed il conduttore si autorizzano reciprocamente a comunicare a terzi i propri dati personali in relazione ad adempimenti connessi col rapporto di locazione (d.lgs n. 196/03).\n\nPer quanto non previsto dal presente contratto le parti rinviano a quanto in materia disposto dal Codice civile, dalle leggi n. 392/78 e n. 431/98 o comunque dalle norme vigenti e dagli usi locali nonché alla normativa ministeriale emanata in applicazione della legge n. 431/98 ed all'Accordo territoriale.`
    );

    // --------------- LETTO, APPROVATO, SOTTOSCRITTO ---------------
    // Ancore delle righe-firma (rapporti sulla pagina, 1-based page):
    // il server le usa per stampare le firme grafiche ESATTAMENTE qui
    // sul contratto firmato — non solo nella pagina firme in coda.
    const _sigA = [];
    y += 6;
    ensureSpace(60);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text('Letto, approvato e sottoscritto', margin, y);
    y += 8;
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(`${sigPlace}, lì ${sigDateStr}`, margin, y);
    y += 18;

    // --- First signature block ---
    const sig1Y = y;
    const sigW = 60, sigH = 22;
    const rightX = pageW - margin - sigW;
    doc.setLineWidth(0.4);
    doc.setDrawColor(0);
    doc.line(margin, sig1Y, margin + sigW, sig1Y);
    doc.line(rightX, sig1Y, rightX + sigW, sig1Y);
    if (contract.landlordSignature) {
      try { doc.addImage(contract.landlordSignature, 'PNG', margin, sig1Y - sigH + 4, sigW - 4, sigH); } catch (e) {}
    }
    if (contract.tenantSignature) {
      try { doc.addImage(contract.tenantSignature, 'PNG', rightX, sig1Y - sigH + 4, sigW - 4, sigH); } catch (e) {}
    }
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('Il Locatore: ' + locName, margin, sig1Y + 5);
    doc.text('Il Conduttore: ' + tenName, rightX, sig1Y + 5);
    {
      const _pg = doc.internal.getCurrentPageInfo().pageNumber;
      _sigA.push(
        { role: 'landlord', page: _pg, xr: margin / pageW, yr: (sig1Y - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH },
        { role: 'tenant', page: _pg, xr: rightX / pageW, yr: (sig1Y - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH });
    }
    y = sig1Y + 16;
    {
      const _coT = Array.isArray(contract.coTenants) ? contract.coTenants.filter(x => x && x.name) : [];
      for (let _ci = 0; _ci < _coT.length; _ci++) {
        ensureSpace(26);
        const _coY = y + 14;
        doc.setLineWidth(0.4); doc.setDrawColor(0);
        doc.line(rightX, _coY, rightX + sigW, _coY);
        if (_coT[_ci].signature) {
          try { doc.addImage(_coT[_ci].signature, 'PNG', rightX, _coY - sigH + 4, sigW - 4, sigH); } catch (e) {}
        }
        doc.setFont('times', 'normal'); doc.setFontSize(10);
        doc.text('Il Co-conduttore: ' + _coT[_ci].name, rightX, _coY + 5);
        const _pgc = doc.internal.getCurrentPageInfo().pageNumber;
        _sigA.push({ role: 'cotenant', coIndex: _ci, page: _pgc, xr: rightX / pageW, yr: (_coY - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH });
        y = _coY + 10;
      }
    }


    // --- 1341–1342 block ---
    y += 14;
    ensureSpace(40);
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    const art1341 = `A mente degli articoli 1341 e 1342 del Codice civile, le parti specificamente approvano i patti di cui agli articoli 2 (Esigenza del locatore/conduttore), 3 (Inadempimento delle modalità di stipula), 4 (Canone), 5 (Deposito cauzionale e altre forme di garanzia), 6 (Oneri accessori), 8 (Pagamento), 9 (Uso), 10 (Recesso del conduttore), 11 (Consegna), 12 (Modifiche e danni), 14 (Impianti), 15 (Accesso), 16 (Commissione di negoziazione paritetica e conciliazione stragiudiziale) e 17 (Varie) del presente contratto.`;
    const art1341Lines = doc.splitTextToSize(art1341, pw);
    const art1341LineH = ptToMm(10) * 1.15;
    ensureSpace(art1341Lines.length * art1341LineH);
    doc.text(art1341Lines, margin, y, { align: 'justify', maxWidth: pw });
    y += art1341Lines.length * art1341LineH + 16;

    // --- Second signature block ---
    ensureSpace(28);
    const sig2Y = y;
    doc.setLineWidth(0.4);
    doc.line(margin, sig2Y, margin + sigW, sig2Y);
    doc.line(rightX, sig2Y, rightX + sigW, sig2Y);
    if (contract.landlordSignature) {
      try { doc.addImage(contract.landlordSignature, 'PNG', margin, sig2Y - sigH + 4, sigW - 4, sigH); } catch (e) {}
    }
    if (contract.tenantSignature) {
      try { doc.addImage(contract.tenantSignature, 'PNG', rightX, sig2Y - sigH + 4, sigW - 4, sigH); } catch (e) {}
    }
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('Il Locatore: ' + locName, margin, sig2Y + 5);
    doc.text('Il Conduttore: ' + tenName, rightX, sig2Y + 5);
    {
      const _pg = doc.internal.getCurrentPageInfo().pageNumber;
      _sigA.push(
        { role: 'landlord', page: _pg, xr: margin / pageW, yr: (sig2Y - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH },
        { role: 'tenant', page: _pg, xr: rightX / pageW, yr: (sig2Y - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH });
    }
    y = sig2Y + 16;
    {
      const _coT = Array.isArray(contract.coTenants) ? contract.coTenants.filter(x => x && x.name) : [];
      for (let _ci = 0; _ci < _coT.length; _ci++) {
        ensureSpace(26);
        const _coY = y + 14;
        doc.setLineWidth(0.4); doc.setDrawColor(0);
        doc.line(rightX, _coY, rightX + sigW, _coY);
        if (_coT[_ci].signature) {
          try { doc.addImage(_coT[_ci].signature, 'PNG', rightX, _coY - sigH + 4, sigW - 4, sigH); } catch (e) {}
        }
        doc.setFont('times', 'normal'); doc.setFontSize(10);
        doc.text('Il Co-conduttore: ' + _coT[_ci].name, rightX, _coY + 5);
        const _pgc = doc.internal.getCurrentPageInfo().pageNumber;
        _sigA.push({ role: 'cotenant', coIndex: _ci, page: _pgc, xr: rightX / pageW, yr: (_coY - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH });
        y = _coY + 10;
      }
    }

    // --------------- FOOTER (Pagina N di M) ---------------
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('times', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`Pagina ${i} di ${totalPages}`, pageW / 2, pageH - 10, { align: 'center' });
    }

    return {
      doc,
      sigAnchors: _sigA,
      hashSeed: contractId + (contract.startDate || '') + (contract.endDate || '') + (canMonthly || ''),
    };
  }

  // === ALLEGATO C — Locazione abitativa per studenti universitari (verbatim CAF) ===
  // Reference: reference/caf/2023_All__locazione_studenti.docx
  //            (Accordo territoriale Roma Capitale 27/07/2023, prot. RA/2023/0044852)
  //            L. 9 dicembre 1998, n. 431, art. 5, comma 2
  function buildAllegatoC({ jsPDF, contractId, contract, property, tenant, landlord }) {
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    const pageW = 210, pageH = 297;
    const margin = 20;
    const pw = pageW - 2 * margin;
    const bottomLimit = pageH - margin;
    let y = margin;

    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setLineHeightFactor(1.15);

    const ptToMm = (pt) => pt * 0.3528;

    function ensureSpace(blockH) {
      if (y + blockH > bottomLimit) {
        doc.addPage();
        y = margin;
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        doc.setLineHeightFactor(1.15);
      }
    }

    function addParagraph(text, opts) {
      opts = opts || {};
      const size = opts.size || 11;
      const style = opts.bold ? 'bold' : (opts.italic ? 'italic' : 'normal');
      const x = (opts.x !== undefined) ? opts.x : margin;
      const w = opts.width || pw;
      const after = (opts.after !== undefined) ? opts.after : 3;
      const align = opts.align || 'left';
      doc.setFont('times', style);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, w);
      const lineH = ptToMm(size) * 1.15;
      ensureSpace(lines.length * lineH);
      if (align === 'left') doc.text(lines, x, y);
      else doc.text(lines, x, y, { align: align, maxWidth: w });
      y += lines.length * lineH + after;
    }

    function addArticle(num, title, body) {
      ensureSpace(18);
      y += 3;
      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      doc.text('Articolo ' + num + ' — ' + title, margin, y);
      y += 4;
      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      const lineH = ptToMm(11) * 1.15;
      const paragraphs = body.split('\n\n');
      for (let pi = 0; pi < paragraphs.length; pi++) {
        const lines = doc.splitTextToSize(paragraphs[pi], pw);
        ensureSpace(lines.length * lineH);
        doc.text(lines, margin, y, { align: 'justify', maxWidth: pw });
        y += lines.length * lineH;
        if (pi < paragraphs.length - 1) y += lineH * 0.5;
      }
      y += 2;
    }

    function formatCadastral(p) {
      if (!p) return '';
      const parts = [];
      if (p.foglio)    parts.push('foglio ' + p.foglio);
      if (p.particella) parts.push('particella ' + p.particella);
      if (p.sub)       parts.push('sub ' + p.sub);
      if (p.categoria) parts.push('cat. ' + p.categoria);
      return parts.join(', ');
    }

    const fmtIt = (n) => Number(n || 0).toLocaleString('it-IT');
    const dot = '………';

    // --------------- Variable data points ---------------
    // Identity fallback chain: contract fields (written by Magic
    // Sign / La Scheda at self-fill time) → users sign-schema
    // (cf/dob/…) → users wizard-schema (codiceFiscale/birthDate/…).
    // Without the chain, a regenerated PDF printed dots even when
    // the party had already filled everything on /sign or /scheda.
    const pick = (...vals) => { for (const v of vals) { if (v !== undefined && v !== null && String(v).trim() !== '') return String(v); } return ''; };
    const locName = pick(contract.landlordName, landlord && landlord.name) || dot;
    const locDOBr = pick(contract.landlordDob, landlord && landlord.dob, landlord && landlord.birthDate);
    const locDOB  = locDOBr ? fmtDate(locDOBr) : dot;
    const locPOB  = pick(contract.landlordPob, landlord && landlord.pob, landlord && landlord.birthPlace) || dot;
    const locDom  = pick(contract.landlordAddress, landlord && landlord.address) || dot;
    const locCF   = pick(contract.landlordCF, landlord && landlord.cf, landlord && landlord.codiceFiscale) || dot;

    const tenName = pick(contract.tenantName, tenant && tenant.name) || dot;
    const tenDOBr = pick(contract.tenantDob, tenant && tenant.dob, tenant && tenant.birthDate);
    const tenDOB  = tenDOBr ? fmtDate(tenDOBr) : dot;
    const tenPOB  = pick(contract.tenantPob, tenant && tenant.pob, tenant && tenant.birthPlace) || dot;
    const tenCF   = pick(contract.tenantCF, tenant && tenant.cf, tenant && tenant.codiceFiscale) || dot;
    const tenDocTypeRaw = pick(contract.tenantDocType, tenant && tenant.docType, tenant && tenant.idDocType);
    const tenDocNum     = pick(contract.tenantDocNum, tenant && tenant.docNum, tenant && tenant.idDocNumber) || dot;
    const tenDocIssuer  = pick(contract.tenantDocIssuer, tenant && tenant.docIssuer) || dot;
    const tenDocIssuedR = pick(contract.tenantDocIssueDate, tenant && tenant.docIssueDate);
    const tenDocIssued  = tenDocIssuedR ? fmtDate(tenDocIssuedR) : dot;
    const docTypeIt = { passport: 'passaporto', id: 'carta d’identità', permit: 'permesso di soggiorno', patente: 'patente auto' };
    const tenDocLabel = docTypeIt[tenDocTypeRaw] || tenDocTypeRaw || 'C.I/patente auto';

    const propCity   = (property && property.city)    || 'Roma';
    const propStreet = (property && property.address) || dot;
    const propFloor  = (property && property.floor)   || dot;
    const propScala  = (property && property.scala)   || dot;
    const propInt    = (property && (property.interno || property.unit)) || dot;
    const propRooms  = (property && property.rooms)   || dot;
    const propAcc    = (property && property.accessories) || dot;
    const propFurnishedFlag = property && property.furnished;
    const propFurnished = propFurnishedFlag ? 'ammobiliata' : 'non ammobiliata';

    const cadast    = (property && property.cadastralData) || formatCadastral(property) || dot;
    const rendita   = (contract.renditaCatastale || (property && property.renditaCatastale))
                      ? fmtIt(contract.renditaCatastale || property.renditaCatastale) : dot;
    const energy    = (property && (property.energyCert || property.energyClass)) || contract.energyClass || dot;
    const sicurezza = impiantiClause(contract, property);
    const tab = (contract.propertyExtra && contract.propertyExtra.tabelleMillesimali) || {};
    const tabFmt = (v) => (v !== undefined && v !== null && v !== '') ? String(v) : dot;
    const tabPro = tabFmt(tab['proprieta'] || tab['proprietà']);
    const tabRis = tabFmt(tab.riscaldamento);
    const tabAcq = tabFmt(tab.acqua);
    const tabSca = tabFmt(tab.scale);
    const tabAsc = tabFmt(tab.ascensore);
    const tabAlt = tabFmt(tab.altre);

    const durText = (contract.durata && contract.durata.text)
                    || (contract.startDate && contract.endDate ? monthsBetween(contract.startDate, contract.endDate).text : '')
                    || (contract.durationMonths ? contract.durationMonths + ' mesi' : dot);
    const durStart = (contract.durata && contract.durata.startDate) || contract.startDate;
    const durEnd   = (contract.durata && contract.durata.endDate)   || contract.endDate;
    const durStartStr = durStart ? fmtDate(durStart) : dot;
    const durEndStr   = durEnd   ? fmtDate(durEnd)   : dot;
    const durMonths   = (contract.canone && contract.canone.installments)
                        || contract.durationMonths
                        || (contract.startDate && contract.endDate ? Math.max(1, Math.ceil(monthsBetween(contract.startDate, contract.endDate).total)) : null);
    const isAnnual    = durMonths === 12;

    const canMonthly      = (contract.canone && contract.canone.monthly)      || contract.rent || 0;
    const canInstallments = (contract.canone && contract.canone.installments) || durMonths || 12;
    const canTotal        = (contract.canone && contract.canone.total)        || (canMonthly * canInstallments);

    // Rate: cadenza reale del contratto (mensile di default; la
    // catena installmentMonths/installmentAmount arriva dal PA).
    const instStep  = [1, 2, 3, 6, 12].includes(Number(contract.installmentMonths)) ? Number(contract.installmentMonths) : 1;
    const cadWord   = { 1: 'mensili', 2: 'bimestrali', 3: 'trimestrali', 6: 'semestrali', 12: 'annuali' }[instStep];
    const nRate     = Math.max(1, Math.ceil((durMonths || canInstallments) / instStep));
    const rataAmount = Number(contract.installmentAmount) || (canMonthly * instStep);
    const payDay    = parseInt(contract.paymentDay, 10) || (contract.canone && parseInt(contract.canone.paymentDay, 10)) || 5;
    const rateClause = instStep === 1
      ? `in n. ${nRate} rate mensili eguali anticipate di € ${fmtIt(rataAmount)} (${fmtIt(rataAmount)}/00) ciascuna, entro il giorno ${payDay} di ogni mese`
      : `in n. ${nRate} rate ${cadWord} eguali anticipate di € ${fmtIt(rataAmount)} (${fmtIt(rataAmount)}/00) ciascuna, entro il giorno ${payDay} del primo mese di ciascun periodo`;

    const depAmount = (contract.deposit && typeof contract.deposit === 'object')
      ? (contract.deposit.amount || 0)
      : (contract.deposit || 0);
    const depMonthsRaw = (contract.deposit && typeof contract.deposit === 'object'
                          && contract.deposit.months !== undefined && contract.deposit.months !== null)
      ? Number(contract.deposit.months)
      : (canMonthly > 0 ? Math.round((depAmount / canMonthly) * 100) / 100 : 0);
    const depMonthsStr = depMonthsRaw.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hasDeposit = depAmount > 0;

    // Studenti-specific (with backwards-compat fallback to legacy fields)
    const studCorsoStudi = (contract.studenti && contract.studenti.corsoStudi)
                           || contract.courseName || dot;
    const studUniversita = (contract.studenti && contract.studenti.universita)
                           || contract.universityName || dot;

    // Slot liberi del contratto tipo — '--' quando non pattuiti,
    // esattamente come sul modello dell'associazione.
    const garanzieAltre = contract.garanzieAltre || '--';
    const oneriQuota    = (contract.oneriQuota !== undefined && contract.oneriQuota !== null && contract.oneriQuota !== '')
                          ? fmtIt(contract.oneriQuota) : '--';
    const subentroMod   = contract.subentroModalita || '--';
    const accessiMod    = contract.accessiModalita || '--';
    const cedolareOn    = (contract.cedolareSecca || 'si') !== 'no';

    const consegnaStato = contract.consegnaStato || '--';
    const sigPlace = contract.signaturePlace || (property && property.city) || 'Roma';
    const sigDateRaw = contract.signatureDate || contract.fullySignedAt || new Date();
    const sigDateStr = fmtDate(sigDateRaw);

    // --------------- HEADER (contratto tipo associazione, accordo Roma 27.07.2023) ---------------
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text('LOCAZIONE ABITATIVA PER STUDENTI UNIVERSITARI', pageW / 2, y, { align: 'center' });
    y += 6;
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('ai sensi dell’art. 5, comma 2 Legge 9/12/98 n° 431', pageW / 2, y, { align: 'center' });
    y += 5;
    const subHdr = doc.splitTextToSize('in conformità all’accordo territoriale tra le Associazioni dei proprietari e degli inquilini depositato presso il Comune di Roma Capitale il 27.07.2023 con protocollo n° RA/2023/0044852', pw);
    doc.text(subHdr, pageW / 2, y, { align: 'center', maxWidth: pw });
    y += subHdr.length * ptToMm(10) * 1.15 + 6;

    doc.setFont('times', 'normal');
    doc.setFontSize(11);

    // --------------- PARTI ---------------
    addParagraph(`Il sig. ${locName}, C.F. ${locCF}, nato/a a ${locPOB} il ${locDOB}, residente in ${locDom}, di seguito denominato/a locatore`);
    addParagraph('CONCEDE IN LOCAZIONE', { bold: true, align: 'center', x: pageW / 2, after: 4 });
    addParagraph(`al sig. ${tenName}, C.F. ${tenCF}, nato/a a ${tenPOB} il ${tenDOB}, domiciliato/a nei locali oggetto della locazione, identificato/a mediante ${tenDocLabel} n. ${tenDocNum} rilasciata da ${tenDocIssuer} il ${tenDocIssued}, di seguito denominato/a conduttore,`);
    addParagraph('CHE ACCETTA, PER SÉ E SUOI AVENTI CAUSA,', { bold: true, align: 'center', x: pageW / 2, after: 4 });

    addParagraph(`l'unità immobiliare posta in ${propCity}, via ${propStreet}, piano ${propFloor}, scala ${propScala}, int. ${propInt}, composta di n. ${propRooms} vani, oltre cucina e servizi, e dotata altresì dei seguenti elementi accessori: ${propAcc}, ${propFurnished} come da elenco a parte sottoscritto dalle parti.`);

    addParagraph(`A) estremi catastali identificativi dell'unità immobiliare: ${cadast}, rendita catastale € ${rendita}.`);
    addParagraph(`B) PRESTAZIONE ENERGETICA: classe ${energy}. Il conduttore dichiara di aver ricevuto le informazioni e la documentazione in ordine alla attestazione della prestazione energetica dell'immobile.`);
    addParagraph(`C) SICUREZZA IMPIANTI: ${sicurezza}`);
    addParagraph(`D) TABELLE MILLESIMALI: proprietà ${tabPro}, riscaldamento ${tabRis}, acqua ${tabAcq}, scale ${tabSca}, ascensore ${tabAsc}, altre ${tabAlt}.`);

    y += 2;
    addParagraph('LA LOCAZIONE È REGOLATA DALLE PATTUIZIONI SEGUENTI', { bold: true, align: 'center', x: pageW / 2, after: 2 });

    // --------------- ARTICOLI 1-16 (contratto tipo associazione, verbatim) ---------------
    // Fonte: contratto_tipo_STUDENTI_Roma_2023 (accordo depositato il
    // 27/07/2023, prot. RA/2023/0044852). Refusi dell'originale
    // normalizzati: il secondo "Articolo 13" (Accessi) è il 14, come
    // conferma la stessa clausola 1341/1342 del modello.

    addArticle(1, 'Durata',
      `Il contratto è stipulato per la durata di ${durMonths || dot} mesi, dal ${durStartStr} al ${durEndStr}. Alla prima scadenza il contratto si rinnova automaticamente per uguale periodo se il conduttore non comunica al locatore disdetta almeno tre mesi prima della data di scadenza del contratto.`
    );

    addArticle(2, 'Natura transitoria',
      `Secondo quanto previsto dall'Accordo territoriale stipulato ai sensi dell'articolo 5, comma 2, della legge n. 431/98, tra le Associazioni della proprietà e le Organizzazioni degli inquilini, depositato il 27/07/2023 con Protocollo n° RA/2023/0044852 presso il Comune di Roma Capitale, le parti concordano che la presente locazione ha natura transitoria in quanto il conduttore espressamente ha l'esigenza di abitare l'immobile per un periodo non eccedente i ${durMonths || dot} mesi, frequentando il corso di studi di ${studCorsoStudi} presso l'Università “${studUniversita}” di Roma.`
    );

    addArticle(3, 'Canone',
      (isAnnual
        ? `Il canone annuo di locazione, secondo quanto stabilito dall'Accordo territoriale stipulato ai sensi dell'articolo 5, comma 2, della legge n. 431/98, tra le Associazioni della proprietà e le Organizzazioni degli inquilini, depositato il 27/07/2023 con Protocollo n° RA/2023/0044852 presso il Comune di Roma Capitale, è convenuto in € ${fmtIt(canTotal)} (${fmtIt(canTotal)}/00), che il conduttore si obbliga a corrispondere nel domicilio del locatore ovvero a mezzo di bonifico bancario, ${rateClause}.`
        : `Il canone di locazione, riferito all'intera durata contrattuale di ${durText}, secondo quanto stabilito dall'Accordo territoriale stipulato ai sensi dell'articolo 5, comma 2, della legge n. 431/98, tra le Associazioni della proprietà e le Organizzazioni degli inquilini, depositato il 27/07/2023 con Protocollo n° RA/2023/0044852 presso il Comune di Roma Capitale, è convenuto in € ${fmtIt(canTotal)} (${fmtIt(canTotal)}/00), che il conduttore si obbliga a corrispondere nel domicilio del locatore ovvero a mezzo di bonifico bancario, ${rateClause}.`)
      + `\n\nNel caso in cui l'Accordo territoriale di cui al presente punto lo preveda, il canone viene aggiornato ogni anno nella misura contrattata, che comunque non può superare il 75% della variazione Istat ed esclusivamente nel caso in cui il locatore non abbia optato per la “cedolare secca” per la durata dell'opzione.`
    );

    if (hasDeposit) {
      addArticle(4, 'Deposito cauzionale e altre forme di garanzia',
        `A garanzia delle obbligazioni assunte col presente contratto, il conduttore versa al locatore (che con la firma del contratto ne rilascia, in caso, quietanza) una somma di € ${fmtIt(depAmount)} (${fmtIt(depAmount)}/00) pari a ${depMonthsStr} mensilità del canone, non imputabile in conto canoni e produttiva di interessi legali, riconosciuti al conduttore al termine di ogni anno di locazione. Il deposito cauzionale così costituito viene reso al termine della locazione, previa verifica dello stato dell'unità immobiliare e dell'osservanza di ogni obbligazione contrattuale.\n\nAltre forme di garanzia: ${garanzieAltre}.`
      );
    } else {
      addArticle(4, 'Deposito cauzionale e altre forme di garanzia',
        `Le parti concordano che per il presente contratto non viene costituito deposito cauzionale.\n\nAltre forme di garanzia: ${garanzieAltre}.`
      );
    }

    addArticle(5, 'Oneri accessori',
      `Per gli oneri accessori le parti fanno applicazione della Tabella oneri accessori, allegato D al decreto emanato dal Ministero delle infrastrutture e dei trasporti di concerto con il Ministero dell'economia e delle finanze ai sensi dell'articolo 4, comma 2, della legge n. 431/1998 e di cui il presente contratto costituisce l'Allegato C.\n\nIn sede di consuntivo, il pagamento degli oneri anzidetti, per la quota parte di quelli condominiali/comuni a carico del conduttore, deve avvenire entro sessanta giorni dalla richiesta. Prima di effettuare il pagamento, il conduttore ha diritto di ottenere l'indicazione specifica delle spese anzidette e dei criteri di ripartizione. Ha inoltre diritto di prendere visione - anche tramite organizzazioni sindacali - presso il locatore (o il suo amministratore o l'amministratore condominiale, ove esistente) dei documenti giustificativi delle spese effettuate. Insieme con il pagamento della prima rata del canone annuale, il conduttore versa una quota di acconto non superiore a quella di sua spettanza risultante dal rendiconto dell'anno precedente.\n\n${oneriClause(contract)}`
    );

    addArticle(6, 'Spese di bollo e di registrazione',
      cedolareOn
        ? `Il locatore intende avvalersi delle disposizioni di cui al DLGS n. 23 del 14-03-2011 cosiddetta "cedolare secca". Pertanto a norma di tale disposizione il locatore dichiara di rinunciare all'applicazione degli adeguamenti Istat. Il presente contratto, quindi, è esente da imposta di bollo e tassa registro. È facoltà del locatore recedere dalla tassazione della cedolare secca e in tal caso il canone sarà adeguato annualmente con l'applicazione dell'Istat al 75% e le spese di bollo per il presente contratto e per le ricevute conseguenti saranno a carico del conduttore mentre la tassa di registro è pari alla metà. Il locatore provvede alla registrazione del contratto, dandone documentata comunicazione al conduttore e all'Amministratore del condominio ai sensi dell'art. 13 legge 431 del 1998.\n\nLe parti possono delegare alla registrazione del contratto una delle organizzazioni sindacali che abbia prestato assistenza ai fini della stipula del contratto medesimo.`
        : `Le spese di bollo per il presente contratto e per le ricevute conseguenti sono a carico del conduttore, mentre la tassa di registro è ripartita al 50% tra le parti. Il locatore provvede alla registrazione del contratto, dandone documentata comunicazione al conduttore e all'Amministratore del condominio ai sensi dell'art. 13 legge 431 del 1998.\n\nLe parti possono delegare alla registrazione del contratto una delle organizzazioni sindacali che abbia prestato assistenza ai fini della stipula del contratto medesimo.`
    );

    addArticle(7, 'Pagamento',
      `Il pagamento del canone o di quant'altro dovuto anche per oneri accessori non può venire sospeso o ritardato da pretese o eccezioni del conduttore, quale ne sia il titolo. Il mancato puntuale pagamento, per qualsiasi causa, anche di una sola rata del canone, nonché di quant'altro dovuto, ove di importo pari almeno ad una mensilità del canone, costituisce in mora il conduttore, fatto salvo quanto previsto dall'articolo 55 della legge 27 luglio 1978, n. 392.`
    );

    addArticle(8, 'Uso',
      `L'immobile deve essere destinato esclusivamente a civile abitazione del conduttore e delle seguenti persone attualmente con lui conviventi: ${contract.cohabitants || '--'}.\n\nSalvo espresso patto scritto contrario, è fatto divieto di sublocazione e di comodato sia totale sia parziale. Per la successione nel contratto si applica l'articolo 6 della legge n. 392/78, nel testo vigente a seguito della sentenza della Corte costituzionale n. 404/1988.`
    );

    addArticle(9, 'Recesso del conduttore',
      `Il conduttore ha facoltà di recedere dal contratto per gravi motivi, previo avviso da recapitarsi mediante lettera raccomandata almeno tre mesi prima della scadenza. Tale facoltà è consentita anche ad uno o più dei conduttori firmatari ed in tal caso, dal mese dell'intervenuto recesso, la locazione prosegue nei confronti degli altri, ferma restando la solidarietà del conduttore recedente per i pregressi periodi di conduzione.\n\nLe modalità di subentro sono così concordate tra le parti: ${subentroMod}.`
    );

    addArticle(10, 'Consegna',
      `Il conduttore dichiara di aver visitato l'unità immobiliare locatagli, di averla trovata adatta all'uso convenuto e, pertanto, di prenderla in consegna ad ogni effetto col ritiro delle chiavi, costituendosi da quel momento custode della stessa. Il conduttore si impegna a riconsegnare l'unità immobiliare nello stato in cui l'ha ricevuta, salvo il deperimento d'uso, pena il risarcimento del danno; si impegna, altresì, a rispettare le norme del regolamento dello stabile ove esistente, accusando in tal caso ricevuta dello stesso con la firma del presente contratto, così come si impegna ad osservare le deliberazioni dell'assemblea dei condomini. È in ogni caso vietato al conduttore compiere atti e tenere comportamenti che possano recare molestia agli altri abitanti dello stabile.\n\nLe parti danno atto, in relazione allo stato dell'unità immobiliare, ai sensi dell'articolo 1590 del Codice civile di quanto segue: ${consegnaStato} ovvero di quanto risulta dal verbale di consegna.`
    );

    addArticle(11, 'Modifiche e danni',
      `Il conduttore non può apportare alcuna modifica, innovazione, miglioria o addizione ai locali locati ed alla loro destinazione, o agli impianti esistenti, senza il preventivo consenso scritto del locatore. Il conduttore esonera espressamente il locatore da ogni responsabilità per danni diretti o indiretti che possano derivargli da fatti dei dipendenti del locatore medesimo nonché per interruzioni incolpevoli dei servizi.`
    );

    addArticle(12, 'Assemblee',
      `Il conduttore ha diritto di voto, in luogo del proprietario dell'unità immobiliare locatagli, nelle deliberazioni dell'assemblea condominiale relative alle spese ed alle modalità di gestione dei servizi di riscaldamento e di condizionamento d'aria. Ha inoltre diritto di intervenire, senza voto, sulle deliberazioni relative alla modificazione degli altri servizi comuni.\n\nQuanto stabilito in materia di riscaldamento e di condizionamento d'aria si applica anche ove si tratti di edificio non in condominio. In tale caso (e con l'osservanza, in quanto applicabili, delle disposizioni del codice civile sull'assemblea dei condomini) i conduttori si riuniscono in apposita assemblea, convocata dalla proprietà o da almeno tre conduttori.`
    );

    addArticle(13, 'Impianti',
      `Il conduttore - in caso d'installazione sullo stabile di antenna televisiva centralizzata - si obbliga a servirsi unicamente dell'impianto relativo, restando sin d'ora il locatore, in caso di inosservanza, autorizzato a far rimuovere e demolire ogni antenna individuale a spese del conduttore, il quale nulla può pretendere a qualsiasi titolo, fatte salve le eccezioni di legge.\n\nPer quanto attiene all'impianto termico autonomo, ove presente, ai sensi della normativa del d.lgs n. 192/05, con particolare riferimento all'art. 7 comma 1, il conduttore subentra per la durata della detenzione alla figura del proprietario nell'onere di adempiere alle operazioni di controllo e di manutenzione.`
    );

    addArticle(14, 'Accessi',
      `Il conduttore deve consentire l'accesso all'unità immobiliare al locatore, al suo amministratore nonché ai loro incaricati ove gli stessi ne abbiano - motivandola - ragione.\n\nNel caso in cui il locatore intenda vendere o, in caso di recesso anticipato del conduttore, locare l'unità immobiliare, questi deve consentirne la visita una volta la settimana, per almeno due ore, con esclusione dei giorni festivi oppure con le seguenti modalità: ${accessiMod}.`
    );

    addArticle(15, 'Commissione di negoziazione paritetica e conciliazione stragiudiziale',
      `La Commissione di cui all'articolo 6 del decreto del Ministro delle infrastrutture e dei trasporti di concerto con il Ministro dell'economia e delle finanze, emanato ai sensi dell'articolo 4, comma 2, della legge 431 del 1998, è composta da due membri scelti fra appartenenti alle rispettive organizzazioni firmatarie dell'Accordo territoriale sulla base delle designazioni, rispettivamente, del locatore e del conduttore.\n\nL'operato della Commissione è disciplinato dal documento “Procedure di negoziazione e conciliazione stragiudiziale nonché modalità di funzionamento della Commissione”, Allegato E al citato decreto. La richiesta di intervento della Commissione non determina la sospensione delle obbligazioni contrattuali.\n\nLa richiesta di attivazione della Commissione non comporta oneri.`
    );

    addArticle(16, 'Varie',
      `A tutti gli effetti del presente contratto, compresa la notifica degli atti esecutivi, e ai fini della competenza a giudicare, il conduttore elegge domicilio nei locali a lui locati e, ove egli più non li occupi o comunque detenga, presso l'ufficio di segreteria del Comune ove è situato l'immobile locato.\n\nQualunque modifica al presente contratto non può aver luogo, e non può essere provata, se non con atto scritto.\n\nIl locatore ed il conduttore si autorizzano reciprocamente a comunicare a terzi i propri dati personali in relazione ad adempimenti connessi col rapporto di locazione (d.Lgs n. 196/03).\n\nPer quanto non previsto dal presente contratto le parti rinviano a quanto in materia disposto dal Codice civile, dalle leggi n. 392/1978 e n. 431 del 1998 o comunque dalle norme vigenti e dagli usi locali nonché alla normativa ministeriale emanata in applicazione della legge n. 431 del 1998 ed agli Accordi di cui agli articoli 2 e 3.\n\nAltre clausole: sono a carico del conduttore le spese relative alle utenze private di energia elettrica, gas, acqua, tassa rifiuti.${contract.otherClauses ? '\n\n' + contract.otherClauses : ''}`
    );

    // --------------- LETTO, APPROVATO, SOTTOSCRITTO ---------------
    // Ancore delle righe-firma (rapporti sulla pagina, 1-based page):
    // il server le usa per stampare le firme grafiche ESATTAMENTE qui
    // sul contratto firmato — non solo nella pagina firme in coda.
    const _sigA = [];
    y += 6;
    ensureSpace(60);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text('Letto, approvato e sottoscritto.', margin, y);
    y += 8;
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(`${sigPlace}, lì ${sigDateStr}`, margin, y);
    y += 18;

    // --- First signature block (60mm x 22mm, identical to Allegato B) ---
    const sig1Y = y;
    const sigW = 60, sigH = 22;
    const rightX = pageW - margin - sigW;
    doc.setLineWidth(0.4);
    doc.setDrawColor(0);
    doc.line(margin, sig1Y, margin + sigW, sig1Y);
    doc.line(rightX, sig1Y, rightX + sigW, sig1Y);
    if (contract.landlordSignature) {
      try { doc.addImage(contract.landlordSignature, 'PNG', margin, sig1Y - sigH + 4, sigW - 4, sigH); } catch (e) {}
    }
    if (contract.tenantSignature) {
      try { doc.addImage(contract.tenantSignature, 'PNG', rightX, sig1Y - sigH + 4, sigW - 4, sigH); } catch (e) {}
    }
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('Il Locatore: ' + locName, margin, sig1Y + 5);
    doc.text('Il Conduttore: ' + tenName, rightX, sig1Y + 5);
    {
      const _pg = doc.internal.getCurrentPageInfo().pageNumber;
      _sigA.push(
        { role: 'landlord', page: _pg, xr: margin / pageW, yr: (sig1Y - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH },
        { role: 'tenant', page: _pg, xr: rightX / pageW, yr: (sig1Y - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH });
    }
    y = sig1Y + 16;
    {
      const _coT = Array.isArray(contract.coTenants) ? contract.coTenants.filter(x => x && x.name) : [];
      for (let _ci = 0; _ci < _coT.length; _ci++) {
        ensureSpace(26);
        const _coY = y + 14;
        doc.setLineWidth(0.4); doc.setDrawColor(0);
        doc.line(rightX, _coY, rightX + sigW, _coY);
        if (_coT[_ci].signature) {
          try { doc.addImage(_coT[_ci].signature, 'PNG', rightX, _coY - sigH + 4, sigW - 4, sigH); } catch (e) {}
        }
        doc.setFont('times', 'normal'); doc.setFontSize(10);
        doc.text('Il Co-conduttore: ' + _coT[_ci].name, rightX, _coY + 5);
        const _pgc = doc.internal.getCurrentPageInfo().pageNumber;
        _sigA.push({ role: 'cotenant', coIndex: _ci, page: _pgc, xr: rightX / pageW, yr: (_coY - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH });
        y = _coY + 10;
      }
    }


    // --- 1341-1342 block (lista del contratto tipo associazione) ---
    y += 14;
    ensureSpace(40);
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    const art1341 = `A mente degli articoli 1341 e 1342 del Codice civile, le parti specificamente approvano i patti di cui agli articoli 2 (Natura transitoria), 4 (Deposito cauzionale e altre forme di garanzia), 5 (Oneri accessori), 7 (Pagamento, risoluzione), 9 (Recesso del conduttore), 10 (Consegna), 11 (Modifiche e danni), 13 (Impianti), 14 (Accessi), 15 (Commissione di negoziazione paritetica e conciliazione stragiudiziale) e 16 (Varie) del presente contratto.`;
    const art1341Lines = doc.splitTextToSize(art1341, pw);
    const art1341LineH = ptToMm(10) * 1.15;
    ensureSpace(art1341Lines.length * art1341LineH);
    doc.text(art1341Lines, margin, y, { align: 'justify', maxWidth: pw });
    y += art1341Lines.length * art1341LineH + 16;

    // --- Second signature block ---
    ensureSpace(28);
    const sig2Y = y;
    doc.setLineWidth(0.4);
    doc.line(margin, sig2Y, margin + sigW, sig2Y);
    doc.line(rightX, sig2Y, rightX + sigW, sig2Y);
    if (contract.landlordSignature) {
      try { doc.addImage(contract.landlordSignature, 'PNG', margin, sig2Y - sigH + 4, sigW - 4, sigH); } catch (e) {}
    }
    if (contract.tenantSignature) {
      try { doc.addImage(contract.tenantSignature, 'PNG', rightX, sig2Y - sigH + 4, sigW - 4, sigH); } catch (e) {}
    }
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('Il Locatore: ' + locName, margin, sig2Y + 5);
    doc.text('Il Conduttore: ' + tenName, rightX, sig2Y + 5);
    {
      const _pg = doc.internal.getCurrentPageInfo().pageNumber;
      _sigA.push(
        { role: 'landlord', page: _pg, xr: margin / pageW, yr: (sig2Y - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH },
        { role: 'tenant', page: _pg, xr: rightX / pageW, yr: (sig2Y - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH });
    }
    y = sig2Y + 16;
    {
      const _coT = Array.isArray(contract.coTenants) ? contract.coTenants.filter(x => x && x.name) : [];
      for (let _ci = 0; _ci < _coT.length; _ci++) {
        ensureSpace(26);
        const _coY = y + 14;
        doc.setLineWidth(0.4); doc.setDrawColor(0);
        doc.line(rightX, _coY, rightX + sigW, _coY);
        if (_coT[_ci].signature) {
          try { doc.addImage(_coT[_ci].signature, 'PNG', rightX, _coY - sigH + 4, sigW - 4, sigH); } catch (e) {}
        }
        doc.setFont('times', 'normal'); doc.setFontSize(10);
        doc.text('Il Co-conduttore: ' + _coT[_ci].name, rightX, _coY + 5);
        const _pgc = doc.internal.getCurrentPageInfo().pageNumber;
        _sigA.push({ role: 'cotenant', coIndex: _ci, page: _pgc, xr: rightX / pageW, yr: (_coY - sigH + 4) / pageH, wr: (sigW - 4) / pageW, hr: sigH / pageH });
        y = _coY + 10;
      }
    }

    // --------------- FOOTER (Pagina N di M) ---------------
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('times', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`Pagina ${i} di ${totalPages}`, pageW / 2, pageH - 10, { align: 'center' });
    }

    return {
      doc,
      sigAnchors: _sigA,
      hashSeed: contractId + (contract.startDate || '') + (contract.endDate || '') + (canMonthly || ''),
    };
  }

  // Dispatcher: il tipo decide il modello (studenti → Allegato C, tutto il
  // resto → Allegato B transitorio) — stessa regola di generateContractPDF.
  function build(env) {
    if (!env || !env.jsPDF) throw new Error('contract-pdf: jsPDF constructor required');
    if (!env.contract) throw new Error('contract-pdf: contract required');
    return (env.contract.type === 'studenti') ? buildAllegatoC(env) : buildAllegatoB(env);
  }

  const API = {
    build: build,
    buildAllegatoB: buildAllegatoB,
    buildAllegatoC: buildAllegatoC,
    fmtDate: fmtDate,
    monthsBetween: monthsBetween,
    impiantiClause: impiantiClause,
    oneriClause: oneriClause,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_CONTRACT_PDF = API;
})(typeof window !== 'undefined' ? window : this);
