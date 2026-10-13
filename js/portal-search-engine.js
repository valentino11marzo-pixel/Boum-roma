/* Shared search of already loaded portal records. No IO, clock or identity
 * inference: collection + exact ID is the boundary for every relationship.
 * Text below is data; renderers must escape it. Permissions remain at callers.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BOOM_PORTAL_SEARCH = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    var KINDS = {};
    [
        ['client', 'clients', 'cliente CRM', 'Clienti CRM', '💼'],
        ['property', 'properties', 'immobile', 'Immobili', '🏠'],
        ['person', 'users', 'persona', 'Persone', '👤'],
        ['contract', 'contracts', 'contratto', 'Contratti', '📋'],
        ['document', 'documents', 'documento', 'Documenti', '📁'],
        ['maintenance', 'maintenance', 'manutenzione', 'Manutenzioni', '🔧'],
        ['lead', 'leads', 'lead', 'Lead', '🔔'],
        ['task', 'tasks', 'attività', 'Attività', '✅'],
        ['deadline', 'deadlines', 'scadenza', 'Scadenze', '📅'],
        ['payment', 'payments', 'pagamento', 'Pagamenti', '💳'],
        ['listing', 'listings', 'annuncio', 'Annunci', '🏢'],
        ['pfsClient', 'pfsClients', 'cliente PFS', 'Clienti PFS', '🔎'],
        ['pfsProperty', 'pfsProperties', 'immobile PFS', 'Immobili PFS', '🏘️'],
        ['landlord', 'landlords', 'proprietario in rubrica', 'Proprietari in rubrica', '🏡'],
        ['proposal', 'preAgreements', 'proposta', 'Proposte', '📝']
    ].forEach(function (k) { KINDS[k[0]] = Object.freeze({ collection: k[1], label: k[2], plural: k[3], icon: k[4] }); });
    Object.freeze(KINDS);
    var KIND_KEYS = Object.keys(KINDS);
    var IDENTIFIERS = ['id', 'ref', 'code', 'refCode', 'bmCode'];
    var NAMES = ['name', 'fullName', 'displayName', 'firstName', 'lastName', 'businessName'];
    var CONTACTS = ['email', 'contactEmail', 'phone', 'contactPhone', 'whatsapp'];
    // Explicit fields from portal save/render paths and preagreement/create.
    // No arbitrary object flattening: OCR, notes, messages, tokens and URLs stay out.
    var FIELDS = {
        client: NAMES.concat(CONTACTS, ['service', 'stage', 'zone', 'arrivalDate', 'source']),
        property: ['name', 'address', 'zone', 'city', 'type', 'status'],
        person: NAMES.concat(CONTACTS, ['role']),
        contract: ['type', 'status', 'tenantName', 'tenantEmail', 'tenantPhone', 'landlordName', 'landlordEmail', 'landlordPhone', 'propertyName', 'propertyAddress', 'startDate', 'endDate'],
        document: ['name', 'fileName', 'type', 'category', 'templateType', 'fiscalYear'],
        maintenance: ['title', 'category', 'priority', 'status', 'technician'],
        lead: NAMES.concat(CONTACTS, ['leadName', 'leadEmail', 'leadPhone', 'service', 'status', 'source', 'zone', 'propertyTitle', 'propertyAddress']),
        task: ['title', 'category', 'priority', 'status', 'dueDate'],
        deadline: ['title', 'type', 'status', 'date'],
        payment: ['month', 'amount', 'status', 'dueDate'],
        listing: ['name', 'title', 'address', 'zone', 'city', 'type', 'status', 'tags', 'features'],
        pfsClient: NAMES.concat(CONTACTS, ['service', 'stage', 'zone', 'source', 'moveIn']),
        pfsProperty: ['name', 'title', 'address', 'zone', 'type', 'status', 'price'],
        landlord: NAMES.concat(CONTACTS, ['zones']),
        proposal: ['status', 'property.address', 'property.type', 'tenant.fullName', 'tenant.email', 'tenant.phone', 'landlord.name', 'landlord.email', 'landlord.phone', 'lease.startDate', 'lease.endDate']
    };
    // Lead.propertyId is a listings ID (api/homie/_lead.js), not properties.
    // ownerId/landlordId may be users OR landlords in legacy records; resolve
    // only if exactly one collection supplies exactly one eligible record.
    var LINKS = {
        client: [['leadId', 'lead']], person: [['linkedLeadId', 'lead']],
        property: [['ownerId', 'owner']],
        contract: [['propertyId', 'property'], ['tenantId', 'person'], ['landlordId', 'owner'], ['linkedLeadId', 'lead']],
        document: [['propertyId', 'property'], ['contractId', 'contract'], ['paymentId', 'payment'], ['userId', 'person'], ['tenantId', 'person'], ['landlordId', 'owner'], ['clientId', 'client']],
        maintenance: [['propertyId', 'property'], ['userId', 'person']],
        lead: [['propertyId', 'listing'], ['listingId', 'listing'], ['clientId', 'client']],
        task: [['linkedClientId', 'client'], ['linkedContractId', 'contract'], ['contractId', 'contract'], ['linkedPropertyId', 'property'], ['propertyId', 'property'], ['paymentId', 'payment'], ['maintenanceId', 'maintenance']],
        deadline: [['linkedClientId', 'client'], ['linkedContractId', 'contract'], ['linkedPropertyId', 'property']],
        payment: [['contractId', 'contract'], ['propertyId', 'property'], ['tenantId', 'person']],
        listing: [['propertyId', 'property']], pfsClient: [],
        pfsProperty: [['landlordId', 'landlord']], landlord: [],
        proposal: [['propertyId', 'property'], ['listingId', 'listing'], ['contractId', 'contract']]
    };
    function known(kind) { return Object.prototype.hasOwnProperty.call(KINDS, kind); }
    function idOK(id) { return typeof id === 'string' && !!id.trim(); }
    function text(value) { return typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''; }
    function norm(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
    function at(row, path) { return path.split('.').reduce(function (v, part) { return v && typeof v === 'object' ? v[part] : undefined; }, row); }
    function values(row, fields) {
        return fields.flatMap(function (field) { var v = at(row, field); return (Array.isArray(v) ? v : [v]).map(text).filter(Boolean); });
    }
    function names(row) { return values(row, NAMES).concat(text([text(row.firstName), text(row.lastName)].filter(Boolean).join(' '))).filter(Boolean); }
    function personName(row) { return row ? text(row.name || row.fullName || row.displayName || [text(row.firstName), text(row.lastName)].filter(Boolean).join(' ') || row.businessName) : ''; }
    function key(kind, id) { return JSON.stringify([kind, id]); }
    function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
    function index(state) {
        var maps = {};
        KIND_KEYS.forEach(function (kind) {
            var map = new Map(), rows = state && state[KINDS[kind].collection];
            (Array.isArray(rows) ? rows : []).forEach(function (row) {
                if (!row || typeof row !== 'object' || !idOK(row.id)) return;
                map.set(row.id, map.has(row.id) ? null : row);
            });
            maps[kind] = map;
        });
        function get(kind, id) {
            var row = known(kind) && idOK(id) ? maps[kind].get(id) : null;
            return row && !(kind === 'person' && row.role === 'admin') ? row : null;
        }
        function links(kind, row) {
            var out = [];
            (LINKS[kind] || []).forEach(function (link) {
                var id = row[link[0]], target = link[1];
                if (!idOK(id)) return;
                if (target === 'owner') {
                    var owners = ['person', 'landlord'].filter(function (k) { return maps[k].has(id); });
                    if (owners.length !== 1) return;
                    target = owners[0];
                }
                out.push({ kind: target, id: id });
            });
            if (kind === 'contract' && Array.isArray(row.coTenants)) row.coTenants.forEach(function (p) {
                if (p && idOK(p.userId)) out.push({ kind: 'person', id: p.userId });
            });
            return out;
        }
        return { maps: maps, get: get, links: links };
    }
    // Only outward saved references supply search words. At most three hops
    // reach document -> contract -> property -> owner; no reverse graph crawl.
    function joins(kind, row, idx) {
        var visited = new Set([key(kind, row.id)]), found = [], houses = new Set(kind === 'property' ? [row.id] : []);
        var traversable = ['contract', 'payment', 'maintenance', 'property', 'listing'];
        var queue = [{ kind: kind, row: row, depth: 1, path: [] }];
        while (queue.length) {
            var current = queue.shift();
            idx.links(current.kind, current.row).forEach(function (link) {
                if (link.kind === 'property') houses.add(link.id);
                var target = idx.get(link.kind, link.id), token = key(link.kind, link.id);
                if (!target || visited.has(token)) return;
                visited.add(token);
                var route = current.path.concat(link.kind);
                found.push({ kind: link.kind, row: target, path: route });
                if (current.depth < 3 && traversable.includes(link.kind)) queue.push({ kind: link.kind, row: target, depth: current.depth + 1, path: route });
            });
        }
        // Contradictory house references stay searchable by their own fields,
        // but do not import either house's identity (or its owner's identity).
        return { nodes: found.filter(function (n) { return houses.size < 2 || !n.path.includes('property'); }), conflict: houses.size > 1 };
    }
    function partyFields(kind, row) {
        var parties = kind === 'contract' ? row.coTenants : kind === 'proposal' ? row.tenants : null;
        return (Array.isArray(parties) ? parties : []).flatMap(function (p) { return p && typeof p === 'object' ? names(p).concat(values(p, CONTACTS)) : []; });
    }
    function ownFields(kind, row) {
        var out = values(row, IDENTIFIERS.concat(FIELDS[kind]));
        if (['person', 'client', 'pfsClient', 'landlord', 'lead'].includes(kind)) out = out.concat(names(row));
        return out.concat(partyFields(kind, row));
    }
    function identity(kind, row) {
        if (kind === 'property' || kind === 'listing' || kind === 'pfsProperty') return values(row, IDENTIFIERS.concat(['name', 'title', 'address', 'zone']));
        if (kind === 'contract') return values(row, IDENTIFIERS.concat(['tenantName', 'tenantEmail', 'tenantPhone', 'landlordName', 'landlordEmail', 'landlordPhone'])).concat(partyFields(kind, row));
        if (['person', 'client', 'pfsClient', 'landlord', 'lead'].includes(kind)) return names(row).concat(values(row, CONTACTS.concat(['leadName', 'leadEmail', 'leadPhone'])));
        return values(row, IDENTIFIERS);
    }
    function describe(kind, row, linked) {
        var meta = KINDS[kind], house = linked.nodes.find(function (n) { return n.kind === 'property'; });
        var houseName = house ? text(house.row.name || house.row.address) : '';
        var people = linked.nodes.filter(function (n) { return ['person', 'landlord', 'client'].includes(n.kind); }).map(function (n) { return personName(n.row); }).filter(Boolean);
        var label = text(row.name || row.title || row.fullName || row.displayName), sub = [];
        if (['person', 'client', 'landlord', 'pfsClient', 'lead'].includes(kind)) label = personName(row) || text(row.leadName);
        if (kind === 'contract') label = 'Contratto ' + (text(row.ref) || houseName || text(row.propertyName || row.propertyAddress) || row.id);
        if (kind === 'proposal') label = 'Proposta ' + (text(row.ref) || row.id);
        if (kind === 'payment') label = 'Pagamento ' + (text(row.month || row.ref) || row.id);
        if (kind === 'document') label = label || text(row.fileName);
        if (['property', 'listing', 'pfsProperty'].includes(kind)) label = label || text(row.address);
        if (kind === 'proposal') sub = values(row, ['tenant.fullName', 'property.address', 'status']);
        else if (kind === 'payment') sub = [text(row.amount) ? '€' + text(row.amount) : '', houseName, text(row.status)];
        else sub = values(row, ['address', 'zone', 'zones', 'role', 'service', 'stage', 'type', 'category', 'status']).concat(houseName, people.slice(0, 3));
        if (['person', 'client', 'pfsClient', 'landlord', 'lead'].includes(kind)) sub = sub.concat(text(row.email || row.contactEmail || row.leadEmail));
        return { id: row.id, kind: kind, collection: meta.collection, icon: meta.icon,
            label: (label || meta.label + ' ' + row.id).slice(0, 300), sub: [...new Set(sub.filter(Boolean))].join(' · ').slice(0, 400) };
    }
    function recordFor(kind, id, state) {
        if (!known(kind)) return null;
        var idx = index(state), row = idx.get(kind, id);
        return row ? describe(kind, row, joins(kind, row, idx)) : null;
    }
    function rank(query, tokens, own, imported, row, descriptor) {
        var ownNorm = own.map(norm), importedNorm = imported.map(norm), all = ownNorm.concat(importedNorm);
        // A phone's formatting is ignored within that one field, never across
        // several contacts. This is matching, not evidence of shared identity.
        var numbers = own.concat(imported).filter(function (v) { return /^[+\d\s()./-]+$/.test(v) && v.replace(/\D/g, '').length >= 5; }).map(function (v) { return v.replace(/\D/g, ''); });
        var match = function (token, fields) { return fields.some(function (v) { return v.includes(token); }) || (/^\d{3,}$/.test(token) && numbers.some(function (v) { return v.includes(token); })); };
        if (!tokens.every(function (t) { return match(t, all); })) return -1;
        if (norm(row.id) === query) return 1000;
        if (values(row, IDENTIFIERS.slice(1)).some(function (v) { return norm(v) === query; })) return 950;
        var labels = names(row).concat(text(row.title), text(row.address), descriptor.label).map(norm).filter(Boolean);
        if (labels.includes(query)) return 800;
        if (labels.some(function (v) { return v.startsWith(query); })) return 700;
        if (labels.some(function (v) { var words = v.split(' '); return tokens.every(function (t) { return words.includes(t); }); })) return 650;
        return tokens.every(function (t) { return match(t, ownNorm); }) ? 400 : 200;
    }
    function sortRecords(a, b) { return compare(norm(a.label), norm(b.label)) || compare(a.collection, b.collection) || compare(a.id, b.id); }
    function search(query, state, options) {
        var opts = options || {}, kind = opts.kind === undefined ? 'all' : opts.kind;
        var q = typeof query === 'string' ? norm(query.slice(0, 240)) : '';
        if (!q || (kind !== 'all' && !known(kind))) return { records: [], total: 0, hasMore: false };
        var tokens = [...new Set(q.split(' '))], idx = index(state), hits = [];
        (kind === 'all' ? KIND_KEYS : [kind]).forEach(function (k) {
            idx.maps[k].forEach(function (_, id) {
                var row = idx.get(k, id); if (!row) return;
                var linked = joins(k, row, idx), descriptor = describe(k, row, linked);
                var imported = linked.nodes.flatMap(function (n) { return identity(n.kind, n.row); });
                var score = rank(q, tokens, ownFields(k, row), imported, row, descriptor);
                if (score >= 0) hits.push({ record: descriptor, score: score });
            });
        });
        hits.sort(function (a, b) { return b.score - a.score || sortRecords(a.record, b.record); });
        var offset = Number.isFinite(opts.offset) ? Math.max(0, Math.floor(opts.offset)) : 0;
        var limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, Math.floor(opts.limit))) : 12;
        return { records: hits.slice(offset, offset + limit).map(function (h) { return h.record; }), total: hits.length, hasMore: offset + limit < hits.length };
    }
    // One hop only, in either direction. The selected record is never merged
    // with a namesake and no conversation/message is part of this graph.
    function relatedFor(kind, id, state) {
        if (!known(kind)) return [];
        var idx = index(state), row = idx.get(kind, id); if (!row) return [];
        var out = new Map();
        function add(k, r) { if (k !== kind || r.id !== id) out.set(key(k, r.id), describe(k, r, joins(k, r, idx))); }
        idx.links(kind, row).forEach(function (link) { var r = idx.get(link.kind, link.id); if (r) add(link.kind, r); });
        KIND_KEYS.forEach(function (k) { idx.maps[k].forEach(function (_, sourceId) {
            var r = idx.get(k, sourceId);
            if (r && idx.links(k, r).some(function (link) { return link.kind === kind && link.id === id; })) add(k, r);
        }); });
        return [...out.values()].sort(sortRecords);
    }
    return Object.freeze({ KINDS: KINDS, search: search, recordFor: recordFor, relatedFor: relatedFor });
}));
