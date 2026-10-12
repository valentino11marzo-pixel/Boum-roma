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

    return Object.freeze({ buildAgenda, appointmentInstant: when });
}));
