/* BOOM · Fiscal Engine — automatic Italian rental + company obligations.
 *
 * The intelligence the portal was missing: instead of manually-entered
 * to-dos, this DERIVES the fiscal obligations (with due dates and estimated
 * amounts) from the contracts/properties/invoices already in the system —
 * for the LANDLORD (rental income) and for EGIDI IMMOBILIARE the company
 * (revenue + VAT + corporate deadlines).
 *
 * It does NOT duplicate what exists: RLI registrations live in Burocrazia,
 * generic to-dos in `deadlines`, revenue in `invoices`. This engine reads
 * the source data, computes the obligations that aren't tracked, and lets
 * the UI cross-reference existing records to mark items done.
 *
 * NOT tax advice — estimates the commercialista validates. Italian rules
 * modelled as of 2025. Pure, framework-free; window.BOOM_FISCAL + CommonJS.
 */
(function (root) {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────
  var REGISTRO_RATE = 0.02;        // imposta di registro: 2% del canone annuo
  var REGISTRO_MIN = 67;           // minimo €67
  var BOLLO_PER_COPY = 16;         // €16 marca da bollo per copia
  var IVA_STANDARD = 0.22;         // IVA 22% sui servizi
  var SEVERITY = { high: 3, medium: 2, low: 1 };

  function toDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (typeof d.toDate === 'function') return d.toDate();
    var dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function iso(d) { return d ? d.toISOString().slice(0, 10) : null; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { var x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
  function addYears(d, n) { var x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
  function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }

  // Reuse contract classification if the taxpack engine is present; else inline.
  function classify(contract) {
    if (root && root.BOOM_TAXPACK && root.BOOM_TAXPACK.classifyContract) {
      return root.BOOM_TAXPACK.classifyContract(contract);
    }
    var c = contract || {};
    var type = String(c.type || '').toLowerCase();
    var regime = String(c.taxRegime || c.regime || '').toLowerCase();
    return {
      isCedolare: c.cedolare === true || /cedolar/.test(regime),
      isConcordato: c.concordato === true || /concordat|3\+2/.test(regime) || type === 'concordato',
      isShortLet: type === 'breve' || type === 'short' || c.shortLet === true,
    };
  }

  function obl(o) {
    // Normalise an obligation record.
    return {
      key: o.key,
      label: o.label,
      category: o.category,            // 'registration'|'tax'|'adjustment'|'contract'|'vat'|'corporate'
      party: o.party || 'landlord',    // 'landlord'|'tenant'|'company'
      dueDate: o.dueDate || null,      // ISO string
      amount: (o.amount != null) ? Math.round(o.amount * 100) / 100 : null, // EUR or null if unknown
      amountIsEstimate: o.amountIsEstimate !== false,
      severity: o.severity || 'medium',
      propertyId: o.propertyId || null,
      contractId: o.contractId || null,
      note: o.note || null,
      recurring: !!o.recurring,
    };
  }

  // ─── Per-contract obligations for a fiscal year ──────────────────────
  function contractObligations(contract, property, fiscalYear) {
    var out = [];
    var c = contract || {};
    var p = property || {};
    var f = classify(c);
    var start = toDate(c.startDate);
    var end = toDate(c.endDate);
    var rent = Number(c.rent) || 0;
    var annualRent = rent * 12;
    var y = Number(fiscalYear) || new Date().getFullYear();

    // 1) RLI registration — within 30 days of contract start (one-time).
    if (start) {
      var rliDue = addDays(start, 30);
      var registroAmount = f.isCedolare ? 0 : Math.max(REGISTRO_MIN, annualRent * REGISTRO_RATE) + BOLLO_PER_COPY;
      out.push(obl({
        key: 'rli_' + (c.id || 'x'),
        label: 'Registrazione contratto (RLI)',
        category: 'registration', party: 'landlord',
        dueDate: iso(rliDue),
        amount: f.isCedolare ? 0 : registroAmount,
        amountIsEstimate: !f.isCedolare,
        severity: 'high',
        propertyId: p.id || null, contractId: c.id || null,
        note: f.isCedolare ? 'Cedolare secca: esente da imposta di registro e bollo' : 'Imposta di registro 2% + bollo',
      }));
    }

    // 2) Imposta di registro ANNUALE — only if NOT cedolare and contract spans >1 year.
    if (!f.isCedolare && start && end && daysBetween(start, end) > 366) {
      // Anniversary within the fiscal year.
      var anniv = new Date(y, start.getMonth(), start.getDate());
      if (start.getFullYear() < y) {
        out.push(obl({
          key: 'registro_annuale_' + (c.id || 'x') + '_' + y,
          label: 'Imposta di registro annuale ' + y,
          category: 'tax', party: 'landlord',
          dueDate: iso(addDays(anniv, 30)),
          amount: Math.max(REGISTRO_MIN, annualRent * REGISTRO_RATE),
          severity: 'high',
          propertyId: p.id || null, contractId: c.id || null,
          recurring: true,
          note: '2% del canone annuo (min €67), entro 30 giorni dall\'anniversario',
        }));
      }
    }

    // 3) ISTAT adjustment reminder — annual at anniversary (not cedolare).
    if (!f.isCedolare && !f.isShortLet && start && start.getFullYear() < y) {
      var istatDate = new Date(y, start.getMonth(), start.getDate());
      out.push(obl({
        key: 'istat_' + (c.id || 'x') + '_' + y,
        label: 'Adeguamento ISTAT canone ' + y,
        category: 'adjustment', party: 'landlord',
        dueDate: iso(istatDate),
        amount: null, // depends on published ISTAT %; UI generates the letter
        severity: 'medium',
        propertyId: p.id || null, contractId: c.id || null,
        recurring: true,
        note: 'Genera la lettera di adeguamento (variazione ISTAT FOI)',
      }));
    }

    // 4) Contract expiry + notice window (disdetta/proroga).
    if (end) {
      // Notice window: 6 months before for 4+4 / standard; shorter for transitorio.
      var type = String(c.type || '').toLowerCase();
      var noticeMonths = (type === 'transitorio' || type === 'transitional') ? 3 : (type === 'studenti' ? 1 : 6);
      var noticeDate = addMonths(end, -noticeMonths);
      // Surface the notice window if it falls in or near the fiscal year horizon.
      out.push(obl({
        key: 'disdetta_' + (c.id || 'x'),
        label: 'Finestra disdetta / rinnovo',
        category: 'contract', party: 'landlord',
        dueDate: iso(noticeDate),
        amount: null,
        severity: 'medium',
        propertyId: p.id || null, contractId: c.id || null,
        note: 'Comunicare disdetta o confermare rinnovo entro ' + noticeMonths + ' mesi dalla scadenza',
      }));
      out.push(obl({
        key: 'scadenza_' + (c.id || 'x'),
        label: 'Scadenza contratto',
        category: 'contract', party: 'landlord',
        dueDate: iso(end),
        amount: null,
        severity: 'low',
        propertyId: p.id || null, contractId: c.id || null,
      }));
    }

    return out;
  }

  // ─── Per-property obligations (IMU) ──────────────────────────────────
  function propertyObligations(property, fiscalYear) {
    var out = [];
    var p = property || {};
    var y = Number(fiscalYear) || new Date().getFullYear();
    // IMU is due on second homes / rented properties (prima casa is exempt).
    // We can't know primary-residence status reliably, so emit for rented
    // properties (status rented or has a contract) as a reminder.
    var imuEstimate = null;
    if (p.rendita || p.renditaCatastale) {
      // IMU base = rendita * 1.05 * 160 (cat A) ; aliquota ~1.06% standard.
      var rendita = Number(p.rendita || p.renditaCatastale) || 0;
      if (rendita) imuEstimate = Math.round(rendita * 1.05 * 160 * 0.0106);
    }
    out.push(obl({
      key: 'imu_acconto_' + (p.id || 'x') + '_' + y,
      label: 'IMU — acconto ' + y,
      category: 'tax', party: 'landlord',
      dueDate: y + '-06-16',
      amount: imuEstimate != null ? imuEstimate / 2 : null,
      severity: 'high', propertyId: p.id || null, recurring: true,
      note: imuEstimate == null ? 'Importo da definire col commercialista (serve la rendita catastale)' : 'Stima su rendita catastale',
    }));
    out.push(obl({
      key: 'imu_saldo_' + (p.id || 'x') + '_' + y,
      label: 'IMU — saldo ' + y,
      category: 'tax', party: 'landlord',
      dueDate: y + '-12-16',
      amount: imuEstimate != null ? imuEstimate / 2 : null,
      severity: 'high', propertyId: p.id || null, recurring: true,
      note: imuEstimate == null ? 'Importo da definire col commercialista' : 'Stima su rendita catastale',
    }));
    return out;
  }

  // ─── Company (Egidi) obligations from revenue ────────────────────────
  // revenueByQuarter: { 1: amount, 2: ..., 3: ..., 4: ... } net revenue per quarter.
  // Computes VAT (IVA) settlement deadlines + corporate annual deadlines.
  function companyObligations(fiscalYear, revenueByQuarter) {
    var out = [];
    var y = Number(fiscalYear) || new Date().getFullYear();
    var rev = revenueByQuarter || {};
    // Quarterly VAT (regime trimestrale) payment deadlines.
    var quarters = [
      { q: 1, due: y + '-05-16' },
      { q: 2, due: y + '-08-20' },
      { q: 3, due: y + '-11-16' },
      { q: 4, due: (y + 1) + '-02-16' },
    ];
    quarters.forEach(function (qq) {
      var net = Number(rev[qq.q]) || 0;
      // If amounts are gross (IVA inclusa), IVA = gross - gross/1.22. If net, IVA = net*0.22.
      // We treat the passed figures as NET imponibile → IVA a debito = net * 22% (+1% interessi trimestrale ignored).
      var iva = net ? Math.round(net * IVA_STANDARD) : 0;
      out.push(obl({
        key: 'iva_q' + qq.q + '_' + y,
        label: 'IVA trimestrale Q' + qq.q + ' ' + y,
        category: 'vat', party: 'company',
        dueDate: qq.due,
        amount: iva || null,
        amountIsEstimate: true,
        severity: net ? 'high' : 'low',
        recurring: true,
        note: net ? 'IVA 22% su ricavi imponibili Q' + qq.q + ' (' + Math.round(net) + '€)' : 'Nessun ricavo registrato nel trimestre',
      }));
      // LIPE — comunicazione liquidazioni periodiche (end of 2nd month after quarter).
      var lipeMap = { 1: y + '-05-31', 2: y + '-09-30', 3: y + '-11-30', 4: (y + 1) + '-02-28' };
      out.push(obl({
        key: 'lipe_q' + qq.q + '_' + y,
        label: 'LIPE — comunicazione IVA Q' + qq.q,
        category: 'vat', party: 'company',
        dueDate: lipeMap[qq.q],
        amount: null, severity: 'medium', recurring: true,
        note: 'Comunicazione liquidazione periodica IVA',
      }));
    });
    // Diritto annuale CCIAA.
    out.push(obl({
      key: 'cciaa_' + y, label: 'Diritto annuale CCIAA', category: 'corporate', party: 'company',
      dueDate: y + '-06-30', amount: null, severity: 'medium', recurring: true,
      note: 'Camera di Commercio',
    }));
    // Modello Redditi SC + IRAP (saldo/acconto) — simplified single reminder.
    out.push(obl({
      key: 'redditi_sc_' + y, label: 'Modello Redditi SC + IRAP', category: 'corporate', party: 'company',
      dueDate: y + '-06-30', amount: null, severity: 'high', recurring: true,
      note: 'Dichiarazione dei redditi della società (saldo + 1° acconto)',
    }));
    return out;
  }

  // ─── Rollup: bucket obligations by urgency from `today` ──────────────
  function rollup(obligations, today) {
    var t = toDate(today) || new Date();
    var buckets = { overdue: [], dueSoon: [], thisQuarter: [], later: [], noDate: [] };
    var totalDue = 0, totalKnown = 0;
    (obligations || []).forEach(function (o) {
      if (o.amount != null) { totalDue += o.amount; totalKnown++; }
      if (!o.dueDate) { buckets.noDate.push(o); return; }
      var d = toDate(o.dueDate);
      var days = daysBetween(t, d);
      o._daysUntil = days;
      if (days < 0) buckets.overdue.push(o);
      else if (days <= 30) buckets.dueSoon.push(o);
      else if (days <= 92) buckets.thisQuarter.push(o);
      else buckets.later.push(o);
    });
    var sortByDate = function (a, b) { return (a._daysUntil || 0) - (b._daysUntil || 0); };
    buckets.overdue.sort(sortByDate);
    buckets.dueSoon.sort(sortByDate);
    buckets.thisQuarter.sort(sortByDate);
    buckets.later.sort(sortByDate);
    return {
      buckets: buckets,
      counts: {
        overdue: buckets.overdue.length,
        dueSoon: buckets.dueSoon.length,
        thisQuarter: buckets.thisQuarter.length,
        total: (obligations || []).length,
      },
      totalDue: Math.round(totalDue * 100) / 100,
      totalKnown: totalKnown,
    };
  }

  // ─── Convenience: all landlord obligations for a property set ────────
  function landlordObligations(input) {
    var properties = input.properties || [];
    var contracts = input.contracts || [];
    var fiscalYear = input.fiscalYear || new Date().getFullYear();
    var out = [];
    properties.forEach(function (p) {
      out = out.concat(propertyObligations(p, fiscalYear));
      contracts.filter(function (c) { return c.propertyId === p.id; }).forEach(function (c) {
        out = out.concat(contractObligations(c, p, fiscalYear));
      });
    });
    return out;
  }

  function fmtEuro(n) {
    if (n == null) return '—';
    return '€' + (Number(n) || 0).toLocaleString('it-IT');
  }

  var API = {
    REGISTRO_RATE: REGISTRO_RATE, IVA_STANDARD: IVA_STANDARD,
    classify: classify,
    contractObligations: contractObligations,
    propertyObligations: propertyObligations,
    companyObligations: companyObligations,
    landlordObligations: landlordObligations,
    rollup: rollup,
    fmtEuro: fmtEuro,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_FISCAL = API;
})(typeof window !== 'undefined' ? window : this);
