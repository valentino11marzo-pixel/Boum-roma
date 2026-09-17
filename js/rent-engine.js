/* BOOM · Canoni, una lettura sola per admin, inquilino e server.
 * Pure/UMD: non scrive dati e non deduce un incasso da link, ricevute o URL.
 * overview({payments, properties, contracts, users, now, month, search, status})
 * restituisce unità e rate reali: anche senza rate, anche senza collegamento.
 * totals.due = canoni aperti (pending + processing + reported);
 * totals.pending = riscuotibili (due + overdue), overdue è un sottoinsieme.
 * totals.other raccoglie separatamente gli altri addebiti, di qualsiasi stato.
 */
(function (root) {
  'use strict';

  function str(value) { return value == null ? '' : String(value).trim(); }
  function key(value) { return str(value).toLowerCase(); }
  function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
  function round(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

  // Firestore stores numbers; accept its legacy decimal strings, never coerce
  // null/booleans to money or guess the locale of "1.200" / "1,200".
  function amount(value) {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value.trim()))) return null;
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? round(n) : null;
  }

  function day(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
      var match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
      if (match) {
        var d = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
        return d.getUTCFullYear() === +match[1] && d.getUTCMonth() === +match[2] - 1 && d.getUTCDate() === +match[3] ? match[0].slice(0, 10) : '';
      }
      return '';
    }
    var date;
    try {
      date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate()
        : typeof value.seconds === 'number' ? new Date(value.seconds * 1000) : null;
    } catch (_) { return ''; }
    if (!date || !Number.isFinite(date.getTime())) return '';
    // Civil dates in the BOOM office, including a browser outside Italy.
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    var p = {};
    parts.forEach(function (part) { p[part.type] = part.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function monthOf(value) {
    var s = str(value);
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : '';
  }

  function paymentBlockReason(payment, kind) {
    var p = payment || {}, status = key(p.status), sdd = key(p.sddStatus);
    if (status === 'paid') return 'already_paid';
    if (['cancelled', 'canceled', 'void', 'voided'].includes(status)) return 'payment_cancelled';
    if ((p.sddPiId && !['failed', 'canceled', 'cancelled'].includes(sdd)) || ['processing', 'pending', 'succeeded'].includes(sdd)) return 'sdd_processing';
    if (status === 'processing' || [p.stripeStatus, p.stripePaymentStatus, p.paymentIntentStatus, p.cardStatus].some(function (s) {
      return ['processing', 'requires_capture', 'succeeded'].includes(key(s));
    })) return 'payment_processing';
    var invoice = kind === 'inv' || kind === 'invoice';
    if (!invoice && (status === 'reported' || (p.tenantReported === true && ['pending','due','overdue'].includes(status)))) return 'payment_reported';
    if (!['pending', 'due', 'overdue', 'reported'].includes(status) && !(invoice && (status === 'sent' || (!status && !p.paidDate)))) return 'payment_not_payable';
    return '';
  }

  function paymentState(payment, now) {
    var p = payment || {}, blocked = paymentBlockReason(p), status = key(p.status);
    if (blocked === 'already_paid') return 'paid';
    if (blocked === 'payment_cancelled') return 'cancelled';
    if (blocked === 'payment_not_payable') return 'unknown';
    if (blocked === 'payment_reported') return 'reported';
    if (blocked) return 'processing';
    if (p.tenantReported === true && (!status || ['pending', 'overdue', 'due', 'reported'].includes(status))) return 'reported';
    if (status === 'reported') return 'reported';
    if (!['pending', 'overdue', 'due'].includes(status)) return 'unknown';
    var due = day(p.dueDate), today = day(now == null ? new Date() : now);
    // An explicit overdue marker cannot invent a missing or future due date.
    return due && today && due < today ? 'overdue' : 'due';
  }

  function canPay(payment, now) {
    var state = paymentState(payment, now), n = amount((payment || {}).amount);
    return (state === 'due' || state === 'overdue') && n != null && n > 0;
  }

  function isRentPayment(payment) {
    var type = key((payment || {}).type);
    // Old generated rent installments did not have a type. An explicit new
    // type is never silently included, even if its label contains "rent".
    return !type || ['rent', 'canone', 'rent-installment', 'monthly-rent'].includes(type);
  }

  function isRentReceipt(invoice) {
    var i = invoice || {};
    if (str(i.paymentId)) return true;
    if ([i.documentType, i.kind].some(function (v) {
      return ['rent-receipt', 'rent_receipt', 'rental-receipt', 'deposit-receipt', 'payment-receipt'].includes(key(v));
    })) return true;
    // Conservative legacy signature of autoInvoiceForPayment; a company
    // service merely mentioning rent remains an invoice for its own service.
    return /^canone locazione(?: \d{4}-(?:0[1-9]|1[0-2]))?$/.test(key(i.service)) && /^ricevuta canone di locazione(?:\s*·|$)/.test(key(i.description));
  }
  function businessInvoices(invoices) { return list(invoices).filter(function (i) { return !isRentReceipt(i); }); }

  // BOOM acts as an agency: principal is separate from earned payment fees.
  // Only recorded settled fees/costs are used; no historical split is inferred.
  function agencyCollections(payments, year) {
    var out = { ownerRent: 0, deposits: 0, otherCharges: 0, fees: 0, cardFees: 0, sepaFees: 0, knownCosts: 0, knownMargin: 0, unknownFeeCount: 0, unknownCostCount: 0 };
    function add(name, value) { out[name] = round(out[name] + value); }
    list(payments).forEach(function (p) {
      if (paymentState(p) !== 'paid') return;
      var raw = p.paidDate || p.paidAt;
      // A date-only value is already a civil date. An instant is bucketed in
      // Rome, including UTC timestamps in the last hour of December 31.
      var recordedDay = day(typeof raw === 'string' && raw.includes('T') ? new Date(raw) : raw);
      if (!recordedDay || recordedDay.slice(0, 4) !== String(Number(year))) return;
      var principal = amount(p.amount), fee = amount(p.serviceFeeEur), type = key(p.type);
      if (principal != null) add(isRentPayment(p) ? 'ownerRent' : ['deposit', 'deposit-balance'].includes(type) ? 'deposits' : 'otherCharges', principal);
      // sddFeeEur belongs to an attempted charge; serviceFeeEur is recorded
      // by the settled webhook for both card and SEPA.
      if (fee == null) { if (['stripe', 'sepa'].includes(p.paidVia)) out.unknownFeeCount++; return; }
      add('fees', fee);
      if (p.paidVia === 'stripe') add('cardFees', fee);
      if (p.paidVia === 'sepa') add('sepaFees', fee);
      var cost = amount(p.stripeCostEur);
      if (cost == null) { out.unknownCostCount++; return; }
      add('knownCosts', cost); add('knownMargin', fee - cost);
    });
    return out;
  }

  function emptyTotals() {
    return { count: 0, paid: 0, due: 0, overdue: 0, processing: 0, reported: 0, pending: 0, other: 0, otherCount: 0, unknownAmountCount: 0, unknownStateCount: 0 };
  }
  function summarize(rows) {
    var totals = emptyTotals();
    rows.forEach(function (row) {
      totals.count++;
      if (row.amount == null) totals.unknownAmountCount++;
      if (row.state === 'unknown') totals.unknownStateCount++;
      var value = row.amount == null ? 0 : row.amount;
      if (!row.isRent) { totals.other = round(totals.other + value); totals.otherCount++; return; }
      if (row.state === 'paid') totals.paid = round(totals.paid + value);
      if (['due', 'overdue', 'processing', 'reported'].includes(row.state)) totals.due = round(totals.due + value);
      if (['due', 'overdue'].includes(row.state)) totals.pending = round(totals.pending + value);
      if (['overdue', 'processing', 'reported'].includes(row.state)) totals[row.state] = round(totals[row.state] + value);
    });
    return totals;
  }
  function index(rows) {
    var result = Object.create(null);
    rows.forEach(function (row) { if (str(row.id)) result[str(row.id)] = row; });
    return result;
  }
  function normalizeSearch(value) {
    return key(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function matchesState(row, status) {
    return !status || status === 'all' || status === 'empty' || row.state === status || (status === 'pending' && ['due', 'overdue'].includes(row.state)) || (status === 'outstanding' && ['due', 'overdue', 'processing', 'reported'].includes(row.state));
  }

  function overview(options) {
    var o = options || {}, now = o.now == null ? new Date() : o.now;
    var properties = list(o.properties), contracts = list(o.contracts), users = list(o.users);
    var propertyById = index(properties), contractById = index(contracts), userById = index(users);
    var groups = Object.create(null), month = monthOf(o.month), status = key(o.status) || 'all', query = normalizeSearch(o.search);
    function unitFor(propertyId, contract) {
      var property = propertyById[propertyId] || null;
      var sameProperty = !propertyId || str(contract && contract.propertyId) === propertyId;
      var id = propertyId ? 'property:' + propertyId : contract && str(contract.id) ? 'contract:' + str(contract.id) : 'unlinked';
      if (!groups[id]) groups[id] = {
        id: id, propertyId: propertyId || '', property: property, contracts: [], tenantNames: [],
        label: str(property && (property.name || property.address)) || (sameProperty ? str(contract && (contract.propertyName || contract.propertyAddress)) : '') || (propertyId ? 'Immobile da collegare · ' + propertyId : 'Immobile da collegare'),
        address: str(property && property.address) || (sameProperty ? str(contract && contract.propertyAddress) : ''),
        payments: [], rentPayments: [], otherPayments: [], totals: emptyTotals(), noInstallments: true, unlinked: !property
      };
      return groups[id];
    }
    function addContract(unit, contract) {
      if (contract && (!str(contract.propertyId) || str(contract.propertyId) === unit.propertyId) && !unit.contracts.includes(contract)) unit.contracts.push(contract);
    }
    // The managed property archive and active rentals are visible even if
    // installments have never been generated. No synthetic rent is invented.
    properties.forEach(function (p) { unitFor(str(p.id), null); });
    contracts.filter(function (c) { return key(c.status) === 'active'; }).forEach(function (c) {
      addContract(unitFor(str(c.propertyId), c), c);
    });
    var rows = list(o.payments).map(function (p, i) {
      var contract = contractById[str(p.contractId)] || null;
      var propertyId = str(p.propertyId) || str(contract && contract.propertyId);
      var tenantId = str(p.tenantId) || str(contract && contract.tenantId);
      var property = propertyById[propertyId] || null, tenant = userById[tenantId] || null;
      var unit = unitFor(propertyId, contract);
      addContract(unit, contract);
      var contractTenantMatches = !str(p.tenantId) || str(p.tenantId) === str(contract && contract.tenantId);
      var tenantName = str(tenant && (tenant.name || tenant.email)) || str(p.tenantName) || (contractTenantMatches ? str(contract && contract.tenantName) : '') || (tenantId ? 'Inquilino da collegare · ' + tenantId : 'Inquilino da collegare');
      return {
        id: str(p.id) || 'missing-id:' + i, payment: p, contract: contract, property: property, tenant: tenant,
        propertyId: propertyId, tenantId: tenantId, unitId: unit.id, propertyName: unit.label, tenantName: tenantName,
        month: monthOf(p.month) || day(p.dueDate).slice(0, 7), dueDate: day(p.dueDate), amount: amount(p.amount),
        state: paymentState(p, now), isRent: isRentPayment(p), canPay: !!str(p.id) && canPay(p, now),
        unlinked: !property || !tenant
      };
    });
    var months = Array.from(new Set(rows.map(function (row) { return row.month; }).filter(Boolean))).sort().reverse();
    var scoped = rows.filter(function (row) { return !month || !row.month || row.month === month; });
    scoped.forEach(function (row) { groups[row.unitId].payments.push(row); });
    var units = Object.keys(groups).map(function (id) {
      var unit = groups[id];
      unit.contracts.forEach(function (c) {
        var tenant = userById[str(c.tenantId)], name = str(tenant && (tenant.name || tenant.email)) || str(c.tenantName);
        if (name && !unit.tenantNames.includes(name)) unit.tenantNames.push(name);
      });
      unit.payments.forEach(function (row) { if (!unit.tenantNames.includes(row.tenantName)) unit.tenantNames.push(row.tenantName); });
      unit.noInstallments = !unit.payments.some(function (row) { return row.isRent; });
      return unit;
    }).filter(function (unit) {
      if (query) {
        var haystack = normalizeSearch([unit.label, unit.address, unit.propertyId].concat(unit.tenantNames, unit.contracts.map(function (c) { return c.id; }), unit.payments.map(function (row) { return [row.id, row.month, row.payment.description].join(' '); })).join(' '));
        if (!haystack.includes(query)) return false;
      }
      return status === 'empty' ? unit.noInstallments : status === 'all' || unit.payments.some(function (row) { return matchesState(row, status); });
    }).map(function (unit) {
      unit.payments = unit.payments.filter(function (row) { return matchesState(row, status); }).sort(function (a, b) {
        return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.id.localeCompare(b.id);
      });
      unit.rentPayments = unit.payments.filter(function (row) { return row.isRent; });
      unit.otherPayments = unit.payments.filter(function (row) { return !row.isRent; });
      unit.totals = summarize(unit.payments);
      return unit;
    }).sort(function (a, b) {
      return (b.totals.overdue > 0 ? 1 : 0) - (a.totals.overdue > 0 ? 1 : 0) || a.label.localeCompare(b.label, 'it') || a.id.localeCompare(b.id);
    });
    var visible = [].concat.apply([], units.map(function (unit) { return unit.payments; }));
    var counts = { units: units.length, payments: visible.length, noInstallments: units.filter(function (unit) { return unit.noInstallments; }).length, unlinked: visible.filter(function (row) { return row.unlinked; }).length, unknownMonth: visible.filter(function (row) { return !row.month; }).length };
    ['paid', 'due', 'overdue', 'processing', 'reported', 'cancelled', 'unknown'].forEach(function (state) { counts[state] = visible.filter(function (row) { return row.state === state; }).length; });
    counts.pending = counts.due + counts.overdue;
    return { units: units, totals: summarize(visible), month: month, months: months, counts: counts, payments: visible };
  }

  // Display projection only. Multiple installments remain separate records;
  // an empty month is not an unpaid installment, including before a lease.
  function rowsForMonth(unit, month) {
    return list(unit && unit.payments).filter(function (row) {
      var end = row.isRent && monthOf(row.payment.coversTo);
      return row.month === month || (end && row.month && row.month < month && month <= end);
    });
  }
  function timeline(unit, endMonth) {
    var end = monthOf(endMonth) || day(new Date()).slice(0, 7);
    var date = new Date(end + '-01T12:00:00Z');
    return Array.from({ length: 6 }, function (_, i) {
      var m = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 5 + i, 1)).toISOString().slice(0, 7);
      var rows = rowsForMonth(unit, m).filter(function (row) { return row.isRent; });
      return { month: m, rows: rows, state: rows.length > 1 ? 'multiple' : rows.length ? rows[0].state : 'empty' };
    });
  }
  function nextAction(unit) {
    var rows = list(unit && unit.payments);
    // Broken associations need review before an operator sends a link.
    var review = rows.find(function (r) { return r.unlinked || r.amount == null || !r.month || r.state === 'unknown'; });
    if (review) return { kind: 'review', paymentId: review.id, month: review.month };
    var reported = rows.find(function (r) { return r.state === 'reported'; });
    if (reported) return { kind: 'reported', paymentId: reported.id, month: reported.month };
    var overdue = rows.find(function (r) { return r.state === 'overdue' && r.canPay; });
    if (overdue) return { kind: 'overdue', paymentId: overdue.id, month: overdue.month };
    var due = rows.find(function (r) { return r.state === 'due' && r.canPay; });
    if (due) return { kind: 'due', paymentId: due.id, month: due.month };
    var processing = rows.find(function (r) { return r.state === 'processing'; });
    if (processing) return { kind: 'processing', paymentId: processing.id, month: processing.month };
    return { kind: 'none', paymentId: '', month: '' };
  }

  var API = { amount: amount, paymentBlockReason: paymentBlockReason, paymentState: paymentState, canPay: canPay, isRentPayment: isRentPayment, isRentReceipt: isRentReceipt, businessInvoices: businessInvoices, agencyCollections: agencyCollections, overview: overview, rowsForMonth: rowsForMonth, timeline: timeline, nextAction: nextAction };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_RENT = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
