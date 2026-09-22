/* BOOM · Fascicolo immobile, proiezione delle collection già caricate.
 * Nessun IO, salvataggio o associazione per nome/persona. Il canone è del
 * proprietario: stati, rate e totali sono quelli di BOOM_RENT, una sola copia.
 * build({propertyId, properties, contracts, users, payments, documents,
 *        maintenance, tasks, now}) conserva i record originali in source.
 */
(function (root, factory) {
  'use strict';
  var api = factory(typeof module !== 'undefined' && module.exports ? require('./rent-engine.js') : root.BOOM_RENT);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BOOM_PROPERTY_DOSSIER_ENGINE = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (rent) {
  'use strict';
  function str(v) { return v == null ? '' : String(v).trim(); }
  function key(v) { return str(v).toLowerCase(); }
  function list(v) { return Array.isArray(v) ? v.filter(function (x) { return x && typeof x === 'object'; }) : []; }
  function index(rows) {
    var out = Object.create(null);
    rows.forEach(function (r) { if (str(r.id)) out[str(r.id)] = r; });
    return out;
  }
  // Dates are civil dates in Rome; invalid calendar dates never become events.
  function day(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
      var m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
      if (!m) return '';
      var civil = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (civil.getUTCFullYear() !== +m[1] || civil.getUTCMonth() !== +m[2] - 1 || civil.getUTCDate() !== +m[3]) return '';
      if (!value.includes('T')) return value;
      value = new Date(value);
    }
    var date;
    try {
      date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate()
        : typeof value.seconds === 'number' ? new Date(value.seconds * 1000) : null;
      if (!date || !Number.isFinite(date.getTime())) return '';
      var fields = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).forEach(function (p) { fields[p.type] = p.value; });
      return fields.year + '-' + fields.month + '-' + fields.day;
    } catch (_) { return ''; }
  }
  function daysBetween(from, to) { return from && to ? Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000) : null; }
  function byDateDesc(a, b) { return (b.createdDate || '').localeCompare(a.createdDate || '') || a.id.localeCompare(b.id); }

  function build(options) {
    if (!rent || typeof rent.overview !== 'function') throw new Error('BOOM_RENT richiesto per il fascicolo immobile');
    var o = options || {}, propertyId = str(o.propertyId), now = o.now == null ? new Date() : o.now, today = day(now);
    var properties = list(o.properties), contracts = list(o.contracts), users = list(o.users), payments = list(o.payments);
    var documents = list(o.documents), maintenance = list(o.maintenance), tasks = list(o.tasks);
    var propertyById = index(properties), contractById = index(contracts), userById = index(users);
    var paymentById = index(payments), maintenanceById = index(maintenance);
    var property = propertyById[propertyId] || null, ownerId = str(property && property.ownerId), owner = userById[ownerId] || null;
    var issues = [], timeline = [];
    function issue(code, kind, source, message, extra) {
      issues.push(Object.assign({ code: code, kind: kind, id: str(source && source.id), source: source || null, message: message }, extra || {}));
    }
    function readDate(source, field, kind) {
      var d = day(source[field]);
      if (source[field] != null && source[field] !== '' && !d) issue('invalid_date', kind, source, 'Data da verificare', { field: field });
      return d;
    }
    function event(kind, source, date, eventName, label, detail) {
      if (!date || !today || date > today) return;
      timeline.push({ id: kind + ':' + str(source.id) + ':' + eventName, kind: kind, recordId: str(source.id), source: source,
        date: date, event: eventName, label: label, detail: str(detail) });
    }
    if (!today) issue('invalid_today', 'property', property, 'Data di riferimento da verificare');
    if (!property) issue('property_missing', 'property', null, 'Immobile non presente nei dati caricati', { id: propertyId });
    else if (!owner) issue('owner_missing', 'property', property, ownerId ? 'Proprietario non presente nei dati caricati' : 'Proprietario da collegare');

    // Like BOOM_RENT, a payment's own propertyId precedes its legacy contract.
    function paymentProperty(p) { return str(p && p.propertyId) || str(contractById[str(p && p.contractId)] && contractById[str(p.contractId)].propertyId); }
    // More specific property references win. A payment carries the same
    // precedence into its documents/tasks. Conflicting facts remain visible.
    function association(source, kind) {
      var direct = str(source.propertyId), legacyProperty = kind === 'task' ? str(source.linkedPropertyId) : '';
      var contractId = str(source.contractId) || (kind === 'task' ? str(source.linkedContractId) : '');
      var contract = contractById[contractId] || null;
      var paymentId = str(source.paymentId), payment = paymentById[paymentId] || null;
      var maintenanceId = kind === 'task' ? str(source.maintenanceId) : '', maint = maintenanceById[maintenanceId] || null;
      var fromPayment = paymentProperty(payment), fromMaintenance = str(maint && maint.propertyId), fromContract = str(contract && contract.propertyId);
      var candidates = [direct, legacyProperty, fromPayment, fromMaintenance, fromContract].filter(Boolean);
      var resolved = candidates[0] || '', conflict = candidates.some(function (id) { return id !== resolved; });
      var relevant = !!propertyId && candidates.includes(propertyId);
      if (relevant && conflict) issue('relationship_conflict', kind, source, 'Collegamenti a immobili diversi: verificare il record', { propertyIds: Array.from(new Set(candidates)), resolvedPropertyId: resolved });
      if (relevant && contractId && !contract) issue('contract_missing', kind, source, 'Contratto collegato non presente nei dati caricati', { referenceId: contractId });
      if (relevant && paymentId && !payment) issue('payment_missing', kind, source, 'Rata collegata non presente nei dati caricati', { referenceId: paymentId });
      if (relevant && maintenanceId && !maint) issue('maintenance_missing', kind, source, 'Manutenzione collegata non presente nei dati caricati', { referenceId: maintenanceId });
      return { propertyId: resolved, conflict: conflict, via: direct ? 'propertyId' : legacyProperty ? 'linkedPropertyId' : fromPayment ? 'paymentId' : fromMaintenance ? 'maintenanceId' : fromContract ? 'contractId' : 'unknown' };
    }

    var linkedContracts = contracts.filter(function (c) { return !!propertyId && str(c.propertyId) === propertyId; });
    var activeContracts = linkedContracts.filter(function (c) { return key(c.status) === 'active'; });
    if (activeContracts.length > 1) issue('multiple_active_contracts', 'property', property, 'Più contratti risultano attivi: sono mostrati tutti', { count: activeContracts.length });
    var tenants = [];
    function tenantRow(c, source, id, role) {
      var user = userById[id] || null;
      var row = { id: id, user: user, name: str(user && (user.name || user.email)) || str(role === 'tenant' ? c.tenantName : source.name),
        role: role, contractId: str(c.id), contract: c, source: source, active: key(c.status) === 'active', unlinked: !user };
      if (!user && role === 'tenant') issue('tenant_missing', 'contract', c, id ? 'Inquilino non presente nei dati caricati' : 'Inquilino da collegare', { referenceId: id });
      tenants.push(row);
      return row;
    }
    var contractRows = linkedContracts.map(function (c) {
      var status = key(c.status), startDate = readDate(c, 'startDate', 'contract'), endDate = readDate(c, 'endDate', 'contract');
      var intervalValid = !startDate || !endDate || startDate <= endDate;
      if (!intervalValid) issue('contract_date_conflict', 'contract', c, 'Fine contratto precedente all’inizio');
      if (!['active', 'expired', 'terminated', 'cancelled', 'canceled', 'draft', 'pending'].includes(status)) issue('unknown_status', 'contract', c, 'Stato contratto da verificare');
      if (status === 'active' && today && endDate && endDate < today) issue('contract_status_conflict', 'contract', c, 'Contratto ancora attivo oltre la data di fine');
      var monthly = rent.amount(c.rent == null || c.rent === '' ? c.canone && c.canone.monthly : c.rent);
      if (monthly == null) issue('unknown_rent', 'contract', c, 'Canone contrattuale non disponibile');
      var occupants = [tenantRow(c, c, str(c.tenantId), 'tenant')];
      list(c.coTenants).forEach(function (co) { occupants.push(tenantRow(c, co, str(co.userId), 'coTenant')); });
      // Start dates describe the lease term, not a check-in or key handover.
      if (intervalValid && ['active', 'expired', 'terminated'].includes(status)) event('contract', c, startDate, 'start', 'Inizio del periodo contrattuale', c.type);
      if (c.tenantSignature) event('contract', c, readDate(c, 'tenantSignedAt', 'contract'), 'tenant_signed', 'Firma dell’inquilino registrata', occupants[0].name);
      if (c.landlordSignature) event('contract', c, readDate(c, 'landlordSignedAt', 'contract'), 'owner_signed', 'Firma del proprietario registrata', owner && owner.name);
      list(c.coTenants).forEach(function (co, i) { if (co.signature) event('contract', c, readDate(co, 'signedAt', 'contract'), 'co_signed_' + i, 'Firma del co-conduttore registrata', co.name); });
      return { id: str(c.id), source: c, status: status || 'unknown', startDate: startDate, endDate: endDate,
        daysToEnd: intervalValid ? daysBetween(today, endDate) : null, rent: monthly, deposit: rent.amount(c.deposit), tenants: occupants };
    }).sort(function (a, b) { return (b.status === 'active') - (a.status === 'active') || b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id); });

    var rentView = rent.overview({ properties: properties, contracts: contracts, users: users, payments: payments, now: now });
    var rentUnit = propertyId ? rentView.units.find(function (u) { return u.propertyId === propertyId; }) || null : null;
    var paymentRows = rentUnit ? rentUnit.payments : [], totals = rentUnit ? rentUnit.totals : rent.overview({}).totals;
    payments.forEach(function (p) { association(p, 'payment'); });
    paymentRows.forEach(function (r) {
      if (r.amount == null) issue('unknown_amount', 'payment', r.payment, 'Importo della rata da verificare');
      if (r.state === 'unknown') issue('unknown_status', 'payment', r.payment, 'Stato della rata da verificare');
      if (!r.dueDate) issue('payment_date_missing', 'payment', r.payment, 'Scadenza della rata non disponibile');
      if (r.state === 'paid') event('payment', r.payment, readDate(r.payment, r.payment.paidDate ? 'paidDate' : 'paidAt', 'payment'), 'paid', r.isRent ? 'Canone registrato come pagato' : 'Addebito registrato come pagato', r.month);
    });
    var documentRows = documents.map(function (d) { return { source: d, association: association(d, 'document') }; }).filter(function (r) { return !!propertyId && r.association.propertyId === propertyId; }).map(function (r) {
      var d = r.source, createdDate = readDate(d, 'createdAt', 'document');
      event('document', d, createdDate, 'created', 'Documento archiviato', d.name);
      return { id: str(d.id), source: d, association: r.association, createdDate: createdDate, status: key(d.status), archived: key(d.status) === 'archived' };
    }).sort(byDateDesc);
    // Maintenance belongs to a property only through its own propertyId.
    var maintenanceRows = maintenance.filter(function (m) { return !!propertyId && str(m.propertyId) === propertyId; }).map(function (m) {
      var status = key(m.status), known = ['open', 'pending', 'in_progress', 'resolved'].includes(status);
      var createdDate = readDate(m, 'createdAt', 'maintenance'), resolvedDate = readDate(m, 'resolvedAt', 'maintenance');
      if (!known) issue('unknown_status', 'maintenance', m, 'Stato manutenzione da verificare');
      event('maintenance', m, createdDate, 'created', 'Manutenzione aperta', m.title);
      if (status === 'resolved') event('maintenance', m, resolvedDate, 'resolved', 'Manutenzione risolta', m.title);
      return { id: str(m.id), source: m, status: known ? status : 'unknown', statusLabel: ({ open: 'Aperta', pending: 'In attesa', in_progress: 'In corso', resolved: 'Risolta' })[status] || 'Da verificare',
        tone: ({ open: 'gold', pending: 'gold', in_progress: 'blue', resolved: 'green' })[status] || 'muted', open: ['open', 'pending', 'in_progress'].includes(status), urgent: key(m.priority) === 'urgent' && ['open', 'pending', 'in_progress'].includes(status), createdDate: createdDate, resolvedDate: resolvedDate };
    }).sort(function (a, b) { return b.urgent - a.urgent || b.open - a.open || byDateDesc(a, b); });
    var taskRows = tasks.map(function (t) { return { source: t, association: association(t, 'task') }; }).filter(function (r) { return !!propertyId && r.association.propertyId === propertyId; }).map(function (r) {
      var t = r.source, status = key(t.status), known = ['open', 'pending', 'in_progress', 'done', 'cancelled', 'canceled'].includes(status);
      var dueDate = readDate(t, 'dueDate', 'task'), createdDate = readDate(t, 'createdAt', 'task'), completedDate = readDate(t, 'completedAt', 'task');
      var open = ['open', 'pending', 'in_progress'].includes(status);
      if (!known) issue('unknown_status', 'task', t, 'Stato attività da verificare');
      event('task', t, createdDate, 'created', 'Attività creata', t.title);
      if (status === 'done') event('task', t, completedDate, 'completed', 'Attività completata', t.title);
      return { id: str(t.id), source: t, association: r.association, status: known ? status : 'unknown',
        statusLabel: ({ open: 'Aperta', pending: 'Da fare', in_progress: 'In corso', done: 'Completata', cancelled: 'Annullata', canceled: 'Annullata' })[status] || 'Da verificare',
        tone: ({ open: 'gold', pending: 'gold', in_progress: 'blue', done: 'green' })[status] || 'muted', open: open, urgent: open && key(t.priority) === 'urgent',
        overdue: !!(open && dueDate && today && dueDate < today), dueDate: dueDate, createdDate: createdDate, completedDate: completedDate };
    }).sort(function (a, b) { return b.open - a.open || b.urgent - a.urgent || b.overdue - a.overdue || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.id.localeCompare(b.id); });
    var activeRows = contractRows.filter(function (c) { return c.status === 'active'; });
    var activeRent = { knownTotal: Math.round(activeRows.reduce(function (sum, c) { return sum + (c.rent == null ? 0 : c.rent); }, 0) * 100) / 100, unknownCount: activeRows.filter(function (c) { return c.rent == null; }).length, count: activeRows.length };
    timeline.sort(function (a, b) { return b.date.localeCompare(a.date) || a.id.localeCompare(b.id); });
    return { propertyId: propertyId, property: property, ownerId: ownerId, owner: owner, today: today,
      contracts: linkedContracts, activeContracts: activeContracts, contractRows: contractRows, tenants: tenants, activeRent: activeRent,
      rentUnit: rentUnit, payments: paymentRows, totals: totals,
      documents: documentRows.map(function (r) { return r.source; }), documentRows: documentRows,
      maintenance: maintenanceRows.map(function (r) { return r.source; }), maintenanceRows: maintenanceRows,
      tasks: taskRows.map(function (r) { return r.source; }), taskRows: taskRows, timeline: timeline, issues: issues,
      counts: { contracts: linkedContracts.length, activeContracts: activeContracts.length, tenants: tenants.length, activeTenants: tenants.filter(function (t) { return t.active; }).length,
        payments: paymentRows.length, documents: documentRows.length, maintenance: maintenanceRows.length, openMaintenance: maintenanceRows.filter(function (r) { return r.open; }).length,
        urgentMaintenance: maintenanceRows.filter(function (r) { return r.urgent; }).length, tasks: taskRows.length, openTasks: taskRows.filter(function (r) { return r.open; }).length,
        overdueTasks: taskRows.filter(function (r) { return r.overdue; }).length, issues: issues.length } };
  }
  return { build: build, day: day };
});
