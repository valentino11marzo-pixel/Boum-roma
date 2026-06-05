/* BOOM · TaxPack Engine — pure, framework-free, unit-tested.
 *
 * Given a property + its contracts + payments + uploaded documents for a
 * fiscal year, produces:
 *   - a CHECKLIST of the documents an Italian landlord needs for that year
 *     (what's required, what's present, what's missing) tuned to the
 *     contract's tax regime (cedolare secca vs IRPEF ordinario) and type
 *     (transitorio / studenti / 4+4 / breve);
 *   - computed TOTALS (canoni incassati, months paid/outstanding, a cedolare
 *     secca preview) ready to drop into the Quadro RB of the dichiarazione;
 *   - a folder MANIFEST describing how the zip bundle for the commercialista
 *     is organised.
 *
 * NOT tax advice — it organises documents and previews figures the
 * accountant validates. Italian rules modelled as of 2025.
 *
 * Exposes window.BOOM_TAXPACK (browser) and module.exports (Node/tests).
 */
(function (root) {
  'use strict';

  // ─── Cedolare secca rates ────────────────────────────────────────────
  // 21% standard; 10% for canone concordato (3+2, transitori in comuni ad
  // alta tensione abitativa, studenti concordati); 26% from the 2nd short-let
  // unit onward (we preview the single-unit case at 21/10).
  var CEDOLARE = { standard: 0.21, concordato: 0.10, breveExtra: 0.26 };

  // ─── Document requirement catalogue ──────────────────────────────────
  // Each requirement: { key, label, category, appliesTo(ctx) -> bool,
  //   cadence: 'once'|'annual'|'monthly', folder }
  // `ctx` = { contract, property, fiscalYear, isCedolare, isConcordato,
  //           isStudenti, isTransitorio, isShortLet, foreignTenant }
  var REQUIREMENTS = [
    { key: 'contract', label: 'Contratto di locazione firmato', category: 'contract',
      folder: '01_Contratto', cadence: 'once', appliesTo: function () { return true; } },
    { key: 'rli', label: 'Registrazione RLI (Agenzia Entrate)', category: 'registration',
      folder: '01_Contratto', cadence: 'once', appliesTo: function (c) { return !c.isShortLet; } },
    { key: 'cedolare_option', label: 'Opzione cedolare secca (Mod. RLI quadro D)', category: 'cedolare',
      folder: '01_Contratto', cadence: 'once', appliesTo: function (c) { return c.isCedolare; } },
    { key: 'concordato_attestazione', label: 'Attestazione canone concordato', category: 'cedolare',
      folder: '01_Contratto', cadence: 'once', appliesTo: function (c) { return c.isConcordato; } },
    { key: 'receipts', label: 'Ricevute canoni incassati (12 mesi)', category: 'income',
      folder: '02_Incassi', cadence: 'monthly', appliesTo: function () { return true; } },
    { key: 'istat', label: 'Lettera adeguamento ISTAT', category: 'adjustment',
      folder: '05_Adeguamenti', cadence: 'annual', appliesTo: function (c) { return !c.isCedolare && !c.isShortLet; } },
    { key: 'imposta_registro', label: 'F24 imposta di registro annuale', category: 'tax',
      folder: '04_Imposte', cadence: 'annual', appliesTo: function (c) { return !c.isCedolare && !c.isShortLet; } },
    { key: 'imu', label: 'F24 IMU (acconto + saldo)', category: 'tax',
      folder: '04_Imposte', cadence: 'annual', appliesTo: function () { return true; } },
    { key: 'ape', label: 'Attestato Prestazione Energetica (APE)', category: 'property',
      folder: '06_Immobile', cadence: 'once', appliesTo: function () { return true; } },
    { key: 'visura', label: 'Visura catastale', category: 'property',
      folder: '06_Immobile', cadence: 'once', appliesTo: function () { return true; } },
    { key: 'tenant_id', label: "Documento d'identità + CF inquilino", category: 'identity',
      folder: '07_Anagrafiche', cadence: 'once', appliesTo: function () { return true; } },
    { key: 'cessione_fabbricato', label: 'Comunicazione cessione di fabbricato', category: 'identity',
      folder: '07_Anagrafiche', cadence: 'once', appliesTo: function (c) { return c.foreignTenant; } },
    { key: 'cin', label: 'CIN (Codice Identificativo Nazionale)', category: 'shortlet',
      folder: '08_BreviLocazioni', cadence: 'once', appliesTo: function (c) { return c.isShortLet; } },
    { key: 'imposta_soggiorno', label: 'Versamenti imposta di soggiorno', category: 'shortlet',
      folder: '08_BreviLocazioni', cadence: 'annual', appliesTo: function (c) { return c.isShortLet; } },
    { key: 'maintenance_invoices', label: 'Fatture spese/manutenzioni detraibili', category: 'expense',
      folder: '03_Spese_detraibili', cadence: 'annual', appliesTo: function () { return true; } }
  ];

  // Map an uploaded document's `type`/`category`/`tags`/name to a requirement key.
  function docMatchesRequirement(doc, reqKey) {
    var hay = [doc.category, doc.type, doc.docCategory, (doc.tags || []).join(' '), doc.name]
      .filter(Boolean).join(' ').toLowerCase();
    switch (reqKey) {
      case 'contract': return /contrat|lease/.test(hay) && !/registr|rli/.test(hay);
      case 'rli': return /\brli\b|registrazion/.test(hay);
      case 'cedolare_option': return /cedolar/.test(hay);
      case 'concordato_attestazione': return /concordat|attestazion/.test(hay);
      case 'receipts': return /ricevut|receipt|canone|incass/.test(hay);
      case 'istat': return /istat|adeguament/.test(hay);
      case 'imposta_registro': return /registro|f24.*registr/.test(hay);
      case 'imu': return /\bimu\b/.test(hay);
      case 'ape': return /\bape\b|energ|prestazione/.test(hay);
      case 'visura': return /visura|catast/.test(hay);
      case 'tenant_id': return /\bid\b|identit|passaport|carta|patente|codice fiscale|\bcf\b/.test(hay);
      case 'cessione_fabbricato': return /cessione|fabbricat/.test(hay);
      case 'cin': return /\bcin\b/.test(hay);
      case 'imposta_soggiorno': return /soggiorno/.test(hay);
      case 'maintenance_invoices': return /fattur|spes|manutenz|invoice|idraulic|elettric/.test(hay);
      default: return false;
    }
  }

  function classifyContract(contract) {
    var c = contract || {};
    var type = String(c.type || '').toLowerCase();
    var regime = String(c.taxRegime || c.regime || '').toLowerCase();
    var isCedolare = c.cedolare === true || /cedolar/.test(regime);
    var isConcordato = c.concordato === true || /concordat|3\+2|10%/.test(regime) || type === 'concordato';
    var isStudenti = type === 'studenti' || type === 'student';
    var isTransitorio = type === 'transitorio' || type === 'transitional';
    var isShortLet = type === 'breve' || type === 'short' || c.shortLet === true;
    var foreignTenant = c.foreignTenant === true
      || (c.tenantNationality && String(c.tenantNationality).toLowerCase() !== 'italiana'
          && String(c.tenantNationality).toLowerCase() !== 'it'
          && String(c.tenantNationality).toLowerCase() !== 'italy');
    return { isCedolare: isCedolare, isConcordato: isConcordato, isStudenti: isStudenti,
             isTransitorio: isTransitorio, isShortLet: isShortLet, foreignTenant: foreignTenant };
  }

  // Build the per-year checklist for ONE contract on a property.
  function buildChecklist(input) {
    var contract = input.contract || {};
    var property = input.property || {};
    var documents = input.documents || [];
    var payments = input.payments || [];
    var fiscalYear = input.fiscalYear || new Date().getFullYear();

    var flags = classifyContract(contract);
    var ctx = Object.assign({ contract: contract, property: property, fiscalYear: fiscalYear }, flags);

    // Restrict documents to this property + fiscal year (or undated 'once' docs).
    var yearDocs = documents.filter(function (d) {
      if (property.id && d.propertyId && d.propertyId !== property.id) return false;
      if (d.fiscalYear && Number(d.fiscalYear) !== Number(fiscalYear)) return false;
      return true;
    });

    var items = REQUIREMENTS.filter(function (r) { return r.appliesTo(ctx); }).map(function (r) {
      var matches = yearDocs.filter(function (d) { return docMatchesRequirement(d, r.key); });
      var present = matches.length > 0;
      var detail = null;

      // Monthly cadence (receipts): expect one per month the contract was active that year.
      if (r.cadence === 'monthly') {
        var expectedMonths = monthsActiveInYear(contract, fiscalYear);
        var paidMonths = payments.filter(function (p) {
          return p.status === 'paid' && p.month && String(p.month).slice(0, 4) === String(fiscalYear);
        }).length;
        // Either uploaded receipts OR BOOM-tracked paid payments count as present.
        var covered = Math.max(matches.length, paidMonths);
        present = expectedMonths > 0 && covered >= expectedMonths;
        detail = covered + '/' + expectedMonths + ' mesi';
      }

      return {
        key: r.key, label: r.label, category: r.category, folder: r.folder,
        cadence: r.cadence, present: present, detail: detail,
        docIds: matches.map(function (m) { return m.id; })
      };
    });

    var required = items.length;
    var presentCount = items.filter(function (i) { return i.present; }).length;
    var missing = items.filter(function (i) { return !i.present; });

    return {
      fiscalYear: fiscalYear,
      contractId: contract.id || null,
      propertyId: property.id || null,
      flags: flags,
      items: items,
      requiredCount: required,
      presentCount: presentCount,
      missing: missing,
      completeness: required ? Math.round((presentCount / required) * 100) : 100,
      ready: missing.length === 0
    };
  }

  // How many months in `fiscalYear` was the contract active (1..12).
  function monthsActiveInYear(contract, fiscalYear) {
    var y = Number(fiscalYear);
    var yStart = new Date(y, 0, 1), yEnd = new Date(y, 11, 31);
    var start = contract.startDate ? new Date(contract.startDate) : yStart;
    var end = contract.endDate ? new Date(contract.endDate) : yEnd;
    var from = start > yStart ? start : yStart;
    var to = end < yEnd ? end : yEnd;
    if (to < from) return 0;
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
  }

  // Compute income + cedolare preview for a fiscal year across given payments.
  function computeTotals(input) {
    var contract = input.contract || {};
    var payments = input.payments || [];
    var fiscalYear = input.fiscalYear || new Date().getFullYear();
    var flags = classifyContract(contract);

    var yearPayments = payments.filter(function (p) {
      return p.month && String(p.month).slice(0, 4) === String(fiscalYear);
    });
    var paid = yearPayments.filter(function (p) { return p.status === 'paid'; });
    var canoniIncassati = paid.reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
    var canoniAttesi = yearPayments.reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
    var outstanding = canoniAttesi - canoniIncassati;

    var rate = flags.isCedolare ? (flags.isConcordato ? CEDOLARE.concordato : CEDOLARE.standard) : 0;
    // Cedolare base = 100% of canoni (no abbattimento, unlike IRPEF ordinario which gets 5% forfait).
    var cedolareImposta = flags.isCedolare ? Math.round(canoniIncassati * rate) : 0;
    // IRPEF ordinario preview (informational): imponibile = 95% dei canoni.
    var irpefImponibile = !flags.isCedolare ? Math.round(canoniIncassati * 0.95) : 0;

    return {
      fiscalYear: fiscalYear,
      monthsActive: monthsActiveInYear(contract, fiscalYear),
      monthsPaid: paid.length,
      monthsExpected: yearPayments.length,
      canoniIncassati: canoniIncassati,
      canoniAttesi: canoniAttesi,
      outstanding: outstanding,
      regime: flags.isCedolare ? (flags.isConcordato ? 'cedolare_10' : 'cedolare_21') : 'ordinario',
      cedolareRate: rate,
      cedolareImposta: cedolareImposta,
      irpefImponibile: irpefImponibile
    };
  }

  // Compare cedolare vs ordinario for a marginal IRPEF bracket (decision helper).
  function compareCedolare(canoniAnnui, irpefMarginalRate, isConcordato) {
    var rate = isConcordato ? CEDOLARE.concordato : CEDOLARE.standard;
    var cedolare = Math.round(canoniAnnui * rate);
    // Ordinario: 95% imponibile * aliquota marginale (+ ~addizionali ~2%, registro ~2% del canone).
    var ordinarioImposta = Math.round(canoniAnnui * 0.95 * (irpefMarginalRate + 0.02));
    var registro = Math.round(canoniAnnui * 0.02); // ~2% imposta di registro (50% locatore)
    var ordinarioTotale = ordinarioImposta + Math.round(registro / 2);
    return {
      cedolare: cedolare,
      ordinario: ordinarioTotale,
      saving: ordinarioTotale - cedolare,
      recommended: cedolare <= ordinarioTotale ? 'cedolare' : 'ordinario'
    };
  }

  // Build the zip folder manifest for the bundle.
  function buildManifest(input) {
    var checklist = input.checklist || buildChecklist(input);
    var property = input.property || {};
    var fiscalYear = input.fiscalYear || new Date().getFullYear();
    var slug = String(property.name || property.address || 'Immobile')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '').slice(0, 30);
    var root = 'TaxPack_' + fiscalYear + '_' + slug;

    var folders = {};
    checklist.items.forEach(function (item) {
      if (!folders[item.folder]) folders[item.folder] = [];
      item.docIds.forEach(function (id) { folders[item.folder].push(id); });
    });

    return {
      root: root,
      fiscalYear: fiscalYear,
      property: { id: property.id || null, name: property.name || '', address: property.address || '' },
      folders: folders,
      summaryFile: 'Riepilogo_fiscale_' + fiscalYear + '.pdf',
      generatedAt: new Date().toISOString()
    };
  }

  // Compute the ISTAT FOI annual rent adjustment.
  //   currentRent      €/month, current canone
  //   annualVariance   fraction (e.g. 0.018 for 1.8%) — the published year-over-year
  //                    variation of the ISTAT FOI (Famiglie di Operai e Impiegati,
  //                    senza tabacchi) index
  //   applicationPct   fraction of the variation applied (Italian rentals use 0.75
  //                    by law for non-cedolare contracts; 1.00 if the contract
  //                    explicitly states full ISTAT)
  // Returns { currentRent, annualVariance, applicationPct, variationFraction,
  //          increase, newRent }.
  function computeIstatAdjustment(currentRent, annualVariance, applicationPct) {
    var rent = Math.max(0, Number(currentRent) || 0);
    var av = Number(annualVariance) || 0;
    var ap = Number(applicationPct);
    if (!isFinite(ap) || ap <= 0) ap = 0.75; // legal default
    var fraction = av * ap;
    var increase = Math.round(rent * fraction * 100) / 100; // 2 decimals
    var newRent = Math.round((rent + increase) * 100) / 100;
    return {
      currentRent: rent,
      annualVariance: av,
      applicationPct: ap,
      variationFraction: fraction,
      increase: increase,
      newRent: newRent
    };
  }

  function fmtEuro(n) {
    return '€' + (Number(n) || 0).toLocaleString('it-IT');
  }

  var API = {
    REQUIREMENTS: REQUIREMENTS,
    CEDOLARE: CEDOLARE,
    classifyContract: classifyContract,
    docMatchesRequirement: docMatchesRequirement,
    monthsActiveInYear: monthsActiveInYear,
    buildChecklist: buildChecklist,
    computeTotals: computeTotals,
    compareCedolare: compareCedolare,
    computeIstatAdjustment: computeIstatAdjustment,
    buildManifest: buildManifest,
    fmtEuro: fmtEuro
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_TAXPACK = API;
})(typeof window !== 'undefined' ? window : this);
