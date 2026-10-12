/* Read-only agenda over loaded viewing records. No clock, network or state.
 * Seven Europe/Rome calendar days, including all of today. Labels and source
 * text are plain strings: the renderer owns HTML escaping.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BOOM_OGGI_WORKSPACE = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DAY = 86400000;
    const partsFormat = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const labelFormat = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short'
    });
    const text = value => typeof value === 'string' ? value.trim() : '';
    const present = value => value !== undefined && value !== null && value !== '';

    function validDay(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const ms = Date.parse(value + 'T00:00:00Z');
        return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
    }
    function instant(value) {
        if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
        if (value && typeof value === 'object') {
            try {
                if (typeof value.toDate === 'function') {
                    const date = value.toDate();
                    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
                }
                const seconds = value.seconds ?? value._seconds;
                const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
                if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) return null;
                const ms = seconds * 1000 + nanos / 1e6;
                return Number.isFinite(new Date(ms).getTime()) ? ms : null;
            } catch (_) { return null; }
        }
        if (typeof value !== 'string') return null;
        // A local datetime depends on the browser's timezone; a date alone
        // supplies no appointment time. Reject both rather than guessing.
        const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
        if (!match || !validDay(match[1]) || +match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59) return null;
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }
    function when(record) {
        if (record.status === 'confirmed') {
            // An invalid authoritative field must not resurrect an older slot.
            if (present(record.confirmedDateTime)) return instant(record.confirmedDateTime);
            if (present(record.scheduledAt)) return instant(record.scheduledAt);
            // _apply.js and slots.js write these by slicing toISOString(): UTC.
            if (validDay(record.confirmedDate) && /^\d{2}:\d{2}$/.test(record.confirmedTime || ''))
                return instant(record.confirmedDate + 'T' + record.confirmedTime + ':00Z');
            return null;
        }
        if (present(record.proposedDateTime)) return instant(record.proposedDateTime);
        // A moved request must NEVER fall back to its previous confirmation.
        // The only evidenced legacy proposal is agent/viewings.schedule.js.
        if (record.status === 'pending' && record.createdBy === 'agent'
            && !present(record.confirmedDateTime) && !present(record.confirmedDate) && !present(record.confirmedTime)
            && Array.isArray(record.proposedSlots) && present(record.proposedSlots[0])) {
            const proposed = instant(record.proposedSlots[0]), scheduled = instant(record.scheduledAt);
            if (proposed !== null && proposed === scheduled) return proposed;
        }
        return null;
    }
    function rome(ms) {
        const p = Object.fromEntries(partsFormat.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
        return { dateKey: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
    }
    function plusDays(key, days) {
        return new Date(Date.parse(key + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
    }
    function buildAgenda(viewings, nowISO) {
        const now = instant(nowISO);
        if (now === null) throw new TypeError('buildAgenda requires a valid current instant with timezone');
        const today = rome(now).dateKey, tomorrow = plusDays(today, 1), lastDay = plusDays(today, 6);
        const rows = [];
        let undatedCount = 0, pendingCount = 0;
        (Array.isArray(viewings) ? viewings : []).forEach(record => {
            if (!record || record.voided === true || !['confirmed', 'pending', 'rescheduled'].includes(record.status)) return;
            if (record.status !== 'confirmed') pendingCount++;
            const ms = when(record);
            if (ms === null) { undatedCount++; return; }
            const local = rome(ms);
            if (local.dateKey < today || local.dateKey > lastDay) return;
            rows.push({ ms, item: {
                id: text(record.id), dateKey: local.dateKey, time: local.time,
                label: local.dateKey === today ? 'Oggi' : local.dateKey === tomorrow ? 'Domani' : labelFormat.format(new Date(ms)),
                status: record.status === 'confirmed' ? 'confirmed' : 'proposed',
                title: text(record.listingName) || text(record.propertyName) || text(record.propertyTitle) || text(record.title) || text(record.listingAddress),
                person: text(record.clientName) || text(record.name) || text(record.contactName)
            } });
        });
        // Actual instants preserve chronology even when the autumn clock repeats.
        rows.sort((a, b) => a.ms - b.ms || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
        // Counters describe eligible loaded records, not only the seven-day slice.
        return { items: rows.map(row => row.item), undatedCount, pendingCount };
    }

    // Read-only joins on saved IDs. Names/phones and listing IDs never establish
    // a relationship; the same name can belong to more than one person/house.
    function contextFor(record, state) {
        const pools = { property: 'properties', person: 'users', contract: 'contracts', client: 'clients' };
        const list = kind => Array.isArray(state?.[pools[kind]]) ? state[pools[kind]] : [];
        const selected = list(record?.kind).filter(row => row.id === record?.id);
        if (selected.length !== 1) return { available: false, records: [], practiceRefs: [], conversationIds: [] };
        const row = selected[0], kind = record.kind;
        const properties = list('property'), contracts = list('contract');
        const parties = c => [c.tenantId, c.landlordId, ...(Array.isArray(c.coTenants) ? c.coTenants.map(p => p?.userId) : [])];
        const linkedContracts = contracts.filter(c => kind === 'contract' ? c.id === row.id
            : kind === 'property' ? c.propertyId === row.id
            : kind === 'person' && (parties(c).includes(row.id) || properties.some(p => p.id === c.propertyId && p.ownerId === row.id)));
        const propertyIds = new Set(kind === 'property' ? [row.id] : kind === 'contract' ? [row.propertyId]
            : kind === 'person' ? [...linkedContracts.map(c => c.propertyId), ...properties.filter(p => p.ownerId === row.id).map(p => p.id)] : []);
        const personIds = new Set(kind === 'person' ? [row.id] : kind === 'property' || kind === 'contract'
            ? [...linkedContracts.flatMap(parties), ...properties.filter(p => propertyIds.has(p.id)).map(p => p.ownerId)] : []);
        const records = [], seen = new Set();
        function add(k, r) {
            if (!r?.id || (k === kind && r.id === row.id) || seen.has(k + ':' + r.id)) return;
            seen.add(k + ':' + r.id);
            const house = k === 'contract' && properties.find(p => p.id === r.propertyId);
            records.push({ kind: k, id: r.id, label: text(r.name) || (k === 'contract' ? 'Contratto · ' + (text(house?.name) || text(r.ref) || r.id) : r.id),
                sub: k === 'property' ? text(r.address) : k === 'contract' ? text(r.status) : text(r.role) });
        }
        properties.filter(p => propertyIds.has(p.id)).forEach(p => add('property', p));
        list('person').filter(p => personIds.has(p.id)).forEach(p => add('person', p));
        linkedContracts.forEach(c => add('contract', c));
        const conversationIds = (Array.isArray(state?.conversations) ? state.conversations : []).filter(c =>
            kind === 'person' ? c.contactId === row.id && ['tenant', 'landlord'].includes(c.contactType)
            : kind === 'client' && c.contactId === row.id && c.contactType === 'client').map(c => c.id);
        return { available: true, records, practiceRefs: linkedContracts.map(c => 'contracts/' + c.id), conversationIds };
    }
    function phoneSource(task) {
        const match = /^phone:([A-Za-z0-9_.-]{1,180})$/.exec(text(task?.followUp?.lastMessageId));
        return match ? '/chiamate?call=' + encodeURIComponent(match[1]) : null;
    }

    return Object.freeze({ buildAgenda, appointmentInstant: when, contextFor, phoneSource });
}));
