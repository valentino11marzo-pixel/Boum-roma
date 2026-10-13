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
      // Un ISTANTE (ora + fuso dichiarato: Z o ±hh:mm) è un momento, non un
      // giorno: lo si porta al giorno civile di Roma, come i Timestamp. Un
      // pagamento delle 23:30 UTC del 31/12 è del 1° gennaio a Roma (13/10/2026,
      // rilievo 73: prima si tagliavano i primi 10 caratteri). Una stringa
      // senza fuso resta il giorno che dice.
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
        var instant = new Date(value);
        if (Number.isFinite(instant.getTime())) return day(instant);
      }
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

  // Soldi tornati indietro su una rata pagata con carta (scritti dal webhook:
  // refundedAt/refundedAmount/refundedFull, disputeStatus). Una contestazione
  // aperta o persa, o un rimborso che copre l'importo della rata, la tolgono
  // da "pagata": torna DA VERIFICARE (mai pagabile da sola, decide un umano).
  // Una contestazione vinta o chiusa senza seguito la lascia pagata; un
  // rimborso parziale (es. la sola commissione) pure. Vale SOLO su una rata
  // 'paid', e su QUALUNQUE incasso la porti a 'paid': per questo il portal,
  // quando riapre la rata (↩ Riapri la rata, undoIncasso), toglie i segni
  // dalla rata e li conserva in incassoAnnullato.was.moneyBack — lasciati lì,
  // il bonifico o la nuova carta registrati dopo tornerebbero «review».
  var DISPUTE_LIVE = ['open', 'lost', 'needs_response', 'under_review', 'warning_needs_response', 'warning_under_review'];
  function moneyBack(payment) {
    var p = payment || {};
    if (DISPUTE_LIVE.includes(key(p.disputeStatus))) return 'dispute';
    var back = amount(p.refundedAmount), principal = amount(p.amount);
    if (p.refundedAt && (p.refundedFull === true || (back != null && principal != null && principal > 0 && back >= principal))) return 'refund';
    return '';
  }

  function paymentBlockReason(payment, kind) {
    var p = payment || {}, status = key(p.status), sdd = key(p.sddStatus);
    if (status === 'paid') return moneyBack(p) ? 'payment_review' : 'already_paid';
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
    if (blocked === 'payment_review') return 'review';
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

  // Contratto preso in carico dalla tabella del Palazzo: la regola sta in
  // js/contract-state.js (una copia sola); se il modulo non è caricato (una
  // pagina che non lo include) vale la stessa riga, identica.
  function contractState() {
    var CS = root && root.BOOM_CONTRACT_STATE;
    if (!CS && typeof require === 'function') { try { CS = require('./contract-state.js'); } catch (_) { CS = null; } }
    return CS;
  }
  function isImportedContract(contract) {
    var CS = contractState();
    return CS && typeof CS.isImported === 'function' ? CS.isImported(contract) : !!(contract && str(contract.source) === 'palazzo-import');
  }

  // LA CARTA SU UNA RATA, in una copia sola per /rata, il link di pagamento,
  // /casa e la vista del Palazzo. I contratti presi in carico dalla tabella
  // della proprietaria (source 'palazzo-import') pagano il canone sul conto
  // del LOCATORE: con la carta i soldi arriverebbero invece sul conto Stripe
  // di BOOM. Lì la carta resta SPENTA finché l'interno non ha un mandato
  // all'incasso registrato (property.rataCard = { on:true, mandateAt }), e
  // anche accesa non porta commissione all'inquilino se non è stata scelta
  // ('surcharge'): il sovrapprezzo su uno strumento di pagamento verso un
  // consumatore è vietato (art. 62 Cod. consumo) — il default è 'absorbed'.
  // Gli altri contratti restano come prima: carta accesa, commissione
  // misurata ('standard').
  //   → { available, reason: ''|'card_off'|'no_mandate', fee: 'standard'|'absorbed'|'surcharge'|'none', imported, mandateAt }
  function cardPolicy(payment, contract, property) {
    var p = payment || {}, cfg = property && property.rataCard && typeof property.rataCard === 'object' ? property.rataCard : null;
    var imported = isImportedContract(contract) || str(p.source) === 'palazzo-import';
    if (!imported) return { available: true, reason: '', fee: 'standard', imported: false, mandateAt: '' };
    if (!cfg || cfg.on !== true) return { available: false, reason: 'card_off', fee: 'none', imported: true, mandateAt: '' };
    var mandateAt = day(cfg.mandateAt);
    if (!mandateAt) return { available: false, reason: 'no_mandate', fee: 'none', imported: true, mandateAt: '' };
    return { available: true, reason: '', fee: key(cfg.fee) === 'surcharge' ? 'surcharge' : 'absorbed', imported: true, mandateAt: mandateAt };
  }

  // ── LA RATA DOPO LA CHIUSURA DEL CONTRATTO — la regola del Palazzo, una
  // copia per chi legge i ritardi (portal, Oggi, server, SEPA, /rata). Un
  // contratto chiuso DAVVERO (terminato, scaduto, chiuso: closedForReal di
  // js/palazzo-engine.js) non deve più niente per i periodi che cominciano
  // DOPO la sua fine effettiva (terminatedAt per un terminato, endDate per gli
  // altri). Una rata così rimasta «da pagare» (chiusura fatta da «Modifica
  // contratto», dati vecchi) non è un ritardo, non si sollecita, non si
  // addebita: va annullata, e il Palazzo la conta a parte. Un contratto ancora
  // 'active' oltre la sua fine NON è chiuso (rinnovo tacito): lì la rata resta
  // dovuta. Il periodo è quello scritto (periodFrom), o il mese di LOCAZIONE
  // ricavato dal giorno di decorrenza come fanno i generatori, o l'inizio del
  // mese della rata. tests/rata/run.mjs verifica la parità col motore.
  var CLOSED = ['terminated', 'expired', 'closed', 'ended', 'completed', 'renewed', 'cancelled', 'canceled'];
  function contractEnd(contract) {
    var c = contract || {};
    if (key(c.status) === 'terminated') return day(c.terminatedAt) || day(c.terminationDate) || day(c.endDate);
    return day(c.endDate);
  }
  function contractClosed(contract) {
    var c = contract || null;
    return !!(c && (CLOSED.includes(key(c.status)) || day(c.terminatedAt)));
  }
  function leaseDay(start, k) {
    var y = +start.slice(0, 4), mo = +start.slice(5, 7) - 1 + k, dd = +start.slice(8, 10);
    var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, mo, Math.min(dd, last))).toISOString().slice(0, 10);
  }
  function periodStart(payment, contract) {
    var p = payment || {}, pf = day(p.periodFrom);
    if (pf) return pf;
    var month = monthOf(p.month) || day(p.dueDate).slice(0, 7);
    if (!month) return '';
    var start = day(contract && contract.startDate);
    if (start) {
      var k = (+month.slice(0, 4) - +start.slice(0, 4)) * 12 + (+month.slice(5, 7) - +start.slice(5, 7));
      if (k >= 0) return leaseDay(start, k);
    }
    return month + '-01';
  }
  function afterClose(payment, contract) {
    if (!contractClosed(contract)) return false;
    var end = contractEnd(contract), ps = periodStart(payment, contract);
    return !!(end && ps && ps > end);
  }
  // La rata dopo la chiusura ancora APERTA (da pagare, scaduta, illeggibile):
  // quella che nessuna coda deve contare come ritardo né sollecitare — va
  // annullata. Una pagata o segnalata resta fra i soldi (sono veri, o da
  // verificare). UNA regola per Gestore, Contabile, risk, digest, snapshot,
  // /snapshot su Telegram, Oggi e il portal.
  function openAfterClose(payment, contract, now) {
    if (!afterClose(payment, contract)) return false;
    var st = paymentState(payment, now);
    return st === 'due' || st === 'overdue' || st === 'unknown';
  }

  function canReviewReport(payment) {
    var p = payment || {};
    return paymentState(p) === 'reported' && ['pending','due','overdue','reported'].includes(key(p.status))
      && amount(p.amount) > 0 && !p.paidDate && !p.bankTxId;
  }

  // Una ricevuta ANNULLATA (incasso registrato per errore e annullato:
  // voided:true, «[ANNULLATA] …») non è una ricevuta valida per nessuno:
  // non la mostra /casa, non la apre il portal (13/10/2026).
  function isReceiptDocument(doc, paymentId) {
    return !!doc && doc.type === 'receipt' && doc.paymentId === paymentId && doc.voided !== true;
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
  // Dal 13/10/2026 commissione, costo e margine di un incasso con carta o
  // SEPA stanno in paymentCosts/<paymentId> (admin-only: la rata la legge la
  // proprietaria). `costs` = elenco di quei documenti (id = paymentId, o con
  // il campo paymentId) oppure un indice { paymentId: doc }. Le rate pagate
  // prima portano ancora i campi sulla rata: lì vince la rata (nessuna
  // migrazione).
  function costIndex(costs) {
    var idx = Object.create(null);
    if (Array.isArray(costs)) costs.forEach(function (c) { var id = c && str(c.paymentId || c.id); if (id) idx[id] = c; });
    else if (costs && typeof costs === 'object') Object.keys(costs).forEach(function (k) { if (costs[k]) idx[k] = costs[k]; });
    return idx;
  }
  function agencyCollections(payments, year, costs) {
    var out = { ownerRent: 0, deposits: 0, otherCharges: 0, fees: 0, cardFees: 0, sepaFees: 0, knownCosts: 0, knownMargin: 0, unknownFeeCount: 0, unknownCostCount: 0 };
    var byPayment = costIndex(costs);
    function add(name, value) { out[name] = round(out[name] + value); }
    list(payments).forEach(function (p) {
      if (paymentState(p) !== 'paid') return;
      var raw = p.paidDate || p.paidAt;
      // A date-only value is already a civil date. An instant is bucketed in
      // Rome, including UTC timestamps in the last hour of December 31.
      var recordedDay = day(typeof raw === 'string' && raw.includes('T') ? new Date(raw) : raw);
      if (!recordedDay || recordedDay.slice(0, 4) !== String(Number(year))) return;
      var cst = byPayment[str(p.id)] || {};
      var principal = amount(p.amount), fee = p.serviceFeeEur != null ? amount(p.serviceFeeEur) : amount(cst.serviceFeeEur), type = key(p.type);
      if (principal != null) add(isRentPayment(p) ? 'ownerRent' : ['deposit', 'deposit-balance'].includes(type) ? 'deposits' : 'otherCharges', principal);
      // sddFeeEur belongs to an attempted charge; serviceFeeEur is recorded
      // by the settled webhook for both card and SEPA.
      if (fee == null) { if (['stripe', 'sepa'].includes(p.paidVia)) out.unknownFeeCount++; return; }
      add('fees', fee);
      if (p.paidVia === 'stripe') add('cardFees', fee);
      if (p.paidVia === 'sepa') add('sepaFees', fee);
      var cost = p.stripeCostEur != null ? amount(p.stripeCostEur) : amount(cst.stripeCostEur);
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
    ['paid', 'due', 'overdue', 'processing', 'reported', 'review', 'cancelled', 'unknown'].forEach(function (state) { counts[state] = visible.filter(function (row) { return row.state === state; }).length; });
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
    var review = rows.find(function (r) { return r.unlinked || r.amount == null || !r.month || r.state === 'unknown' || r.state === 'review'; });
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

  var API = { amount: amount, moneyBack: moneyBack, afterClose: afterClose, openAfterClose: openAfterClose, contractClosed: contractClosed, contractEnd: contractEnd, periodStart: periodStart, cardPolicy: cardPolicy, paymentBlockReason: paymentBlockReason, paymentState: paymentState, canPay: canPay, canReviewReport: canReviewReport, isReceiptDocument: isReceiptDocument, isRentPayment: isRentPayment, isRentReceipt: isRentReceipt, businessInvoices: businessInvoices, agencyCollections: agencyCollections, overview: overview, rowsForMonth: rowsForMonth, timeline: timeline, nextAction: nextAction };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_RENT = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
