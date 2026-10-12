// The real pure agenda engine: timezone boundaries, source precedence and no effects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const E = require('../../js/oggi-workspace-engine.js');
const source = readFileSync(new URL('../../js/oggi-workspace-engine.js', import.meta.url), 'utf8');
const NOW = '2026-10-12T12:00:00Z';
const confirmed = (id, at, extra = {}) => ({ id, status: 'confirmed', confirmedDateTime: at, ...extra });
let checks = 0;
function check(name, test) { test(); checks++; console.log('PASS ' + name); }
const ids = result => result.items.map(item => item.id);

check('Roma calendar window includes earlier today, midnight and day six, excludes day seven', () => {
    const result = E.buildAgenda([
        confirmed('day-seven', '2026-10-18T22:00:00Z'),
        confirmed('day-six', '2026-10-18T21:59:00Z'),
        confirmed('yesterday', '2026-10-11T21:59:00Z'),
        confirmed('midnight', '2026-10-11T22:00:00Z'),
        confirmed('past-today', '2026-10-12T06:00:00Z'),
        confirmed('tomorrow', '2026-10-12T22:00:00Z')
    ], NOW);
    assert.deepEqual(ids(result), ['midnight', 'past-today', 'tomorrow', 'day-six']);
    assert.deepEqual(result.items[0], { id: 'midnight', dateKey: '2026-10-12', time: '00:00', label: 'Oggi', status: 'confirmed', title: '', person: '' });
    assert.equal(result.items[2].label, 'Domani');
    assert.equal(result.undatedCount, 0);
});

check('today is derived from Rome, even while UTC is still yesterday', () => {
    const result = E.buildAgenda([confirmed('today', '2026-10-11T22:15:00Z')], '2026-10-11T22:30:00Z');
    assert.equal(result.items[0].label, 'Oggi');
    assert.equal(result.items[0].dateKey, '2026-10-12');
});

check('spring DST skips a local hour without shortening the seven calendar days', () => {
    const result = E.buildAgenda([
        confirmed('before', '2026-03-29T00:30:00Z'),
        confirmed('after', '2026-03-29T01:30:00Z'),
        confirmed('last', '2026-04-04T21:59:00Z'),
        confirmed('outside', '2026-04-04T22:00:00Z')
    ], '2026-03-29T00:00:00Z');
    assert.deepEqual(ids(result), ['before', 'after', 'last']);
    assert.deepEqual(result.items.slice(0, 2).map(item => item.time), ['01:30', '03:30']);
});

check('autumn DST preserves actual chronology through the repeated hour', () => {
    const result = E.buildAgenda([
        confirmed('later', '2026-10-25T02:10:00+01:00'),
        confirmed('earlier', '2026-10-25T02:50:00+02:00'),
        confirmed('last', '2026-10-31T22:59:00Z'),
        confirmed('outside', '2026-10-31T23:00:00Z')
    ], '2026-10-24T22:00:00Z');
    assert.deepEqual(ids(result), ['earlier', 'later', 'last']);
    assert.deepEqual(result.items.slice(0, 2).map(item => item.time), ['02:50', '02:10']);
});

check('rescheduled and pending read the proposal, never the old confirmation', () => {
    const records = ['pending', 'rescheduled'].map(status => ({
        id: status, status, confirmedDateTime: '2026-10-12T08:00:00Z', scheduledAt: '2026-10-12T08:00:00Z',
        confirmedDate: '2026-10-12', confirmedTime: '08:00', proposedDateTime: '2026-10-13T13:00:00Z'
    }));
    const result = E.buildAgenda(records, NOW);
    assert.equal(result.pendingCount, 2);
    assert(result.items.every(item => item.dateKey === '2026-10-13' && item.time === '15:00' && item.status === 'proposed'));
    records.forEach(record => { delete record.proposedDateTime; });
    assert.deepEqual(E.buildAgenda(records, NOW), { items: [], undatedCount: 2, pendingCount: 2 });
});

check('confirmation wins; scheduledAt is a confirmed fallback and legacy slices are UTC', () => {
    const result = E.buildAgenda([
        confirmed('canonical', '2026-10-12T08:00:00Z', { scheduledAt: '2026-10-12T18:00:00Z', proposedDateTime: '2026-10-13T18:00:00Z' }),
        { id: 'scheduled', status: 'confirmed', scheduledAt: '2026-10-12T09:00:00Z' },
        { id: 'legacy', status: 'confirmed', confirmedDate: '2026-10-12', confirmedTime: '10:30' }
    ], NOW);
    assert.deepEqual(result.items.map(item => item.time), ['10:00', '11:00', '12:30']);
});

check('server-confirmed move uses its new canonical instant, despite an old proposal', () => {
    // Shape written by api/viewings/_apply.js for action:'reschedule'.
    const result = E.buildAgenda([{
        id: 'server-move', status: 'confirmed', voided: false,
        proposedDateTime: '2026-10-12T08:00:00Z', rescheduledAt: '2026-10-12T10:00:00Z',
        confirmedDateTime: '2026-10-13T13:00:00Z', scheduledAt: '2026-10-13T13:00:00Z',
        confirmedDate: '2026-10-13', confirmedTime: '13:00'
    }], NOW);
    assert.equal(result.items[0].dateKey, '2026-10-13');
    assert.equal(result.items[0].time, '15:00');
    assert.equal(result.items[0].status, 'confirmed');
    assert.equal(result.pendingCount, 0);
});

check('legacy UTC slices cross Rome midnight in winter and ignore host timezone', () => {
    const record = { id: 'legacy', status: 'confirmed', confirmedDate: '2026-12-11', confirmedTime: '23:15' };
    const previousTZ = process.env.TZ;
    try {
        for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
            process.env.TZ = zone;
            const item = E.buildAgenda([record], '2026-12-11T23:30:00Z').items[0];
            assert.equal(item.dateKey, '2026-12-12');
            assert.equal(item.time, '00:15');
            assert.equal(item.label, 'Oggi');
        }
    } finally {
        if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ;
    }
});

check('malformed authoritative time cannot silently revive a fallback', () => {
    const result = E.buildAgenda([
        confirmed('bad-confirmation', '2026-02-30T10:00:00Z', { scheduledAt: '2026-10-12T08:00:00Z' }),
        { id: 'bad-proposal', status: 'pending', proposedDateTime: 'invalid', createdBy: 'agent', proposedSlots: ['2026-10-12T08:00:00Z'], scheduledAt: '2026-10-12T08:00:00Z' }
    ], NOW);
    assert.deepEqual(result, { items: [], undatedCount: 2, pendingCount: 1 });
});

check('legacy agent proposal requires coherent documented provenance', () => {
    const good = { id: 'agent', status: 'pending', createdBy: 'agent', proposedSlots: ['2026-10-12T08:00:00Z'], scheduledAt: '2026-10-12T08:00:00Z' };
    const result = E.buildAgenda([
        good, { ...good, id: 'unproven', createdBy: null }, { ...good, id: 'different', scheduledAt: '2026-10-12T09:00:00Z' },
        { ...good, id: 'moved', status: 'rescheduled' }, { ...good, id: 'previous', confirmedDateTime: '2026-10-11T08:00:00Z' }
    ], NOW);
    assert.deepEqual(ids(result), ['agent']);
    assert.equal(result.undatedCount, 4);
    assert.equal(result.pendingCount, 5);
});

check('Firestore SDK and serialized timestamps retain their instant', () => {
    const seconds = Date.parse('2026-10-12T08:15:00Z') / 1000;
    const values = [new Date(seconds * 1000), { toDate: () => new Date(seconds * 1000) },
        { seconds, nanoseconds: 123456789 }, { _seconds: seconds, _nanoseconds: 123456789 }];
    const result = E.buildAgenda(values.map((at, i) => confirmed(String(i), at)), NOW);
    assert.equal(result.items.length, 4);
    assert(result.items.every(item => item.time === '10:15'));
});

check('invalid/missing/date-only/local times are counted, never assigned midnight', () => {
    const bad = [null, undefined, '', '2026-10-12', '2026-10-12T08:00', '2026-10-12T24:00:00Z',
        '2026-10-12T08:60:00Z', '2026-10-12T08:00:60Z', '2026-13-12T08:00:00Z', '2026-02-30T08:00:00Z',
        new Date(NaN), { toDate: () => { throw new Error('invalid'); } }, { seconds: 1, nanoseconds: 1e9 }, { seconds: '1' }];
    const records = bad.map((at, i) => confirmed(String(i), at));
    records.push({ id: 'date-only', status: 'confirmed', confirmedDate: '2026-10-12' },
        { id: 'local-proposed', status: 'pending', proposedDate: '2026-10-12', proposedTime: '09:00' });
    assert.deepEqual(E.buildAgenda(records, NOW), { items: [], undatedCount: records.length, pendingCount: 1 });
});

check('closed, voided and unrecognized states never become appointments', () => {
    const records = ['cancelled', 'done', 'completed', 'voided', 'unknown', undefined].map(status => confirmed(String(status), '2026-10-12T08:00:00Z', { status }));
    records.push(confirmed('flag', '2026-10-12T08:00:00Z', { voided: true }), null);
    assert.deepEqual(E.buildAgenda(records, NOW), { items: [], undatedCount: 0, pendingCount: 0 });
});

check('pending count describes all loaded open requests, beyond the displayed week too', () => {
    const result = E.buildAgenda([
        { id: 'outside', status: 'pending', proposedDateTime: '2026-11-20T08:00:00Z' },
        { id: 'missing', status: 'rescheduled' }
    ], NOW);
    assert.deepEqual(result, { items: [], undatedCount: 1, pendingCount: 2 });
});

check('pure input, explicit clock, source strings unescaped and deterministic tie order', () => {
    const records = Object.freeze([
        Object.freeze(confirmed('b', '2026-10-12T08:00:00Z', { propertyName: 'Casa <b>&', name: 'Persona "B"' })),
        Object.freeze(confirmed('a', '2026-10-12T08:00:00Z', { listingName: 'Nome reale', clientName: 'Persona A' }))
    ]);
    const result = E.buildAgenda(records, NOW);
    assert.deepEqual(ids(result), ['a', 'b']);
    assert.equal(result.items[1].title, 'Casa <b>&');
    assert.equal(result.items[1].person, 'Persona "B"');
    assert.deepEqual(result, E.buildAgenda(records, NOW));
    assert.deepEqual(E.buildAgenda(null, NOW), { items: [], undatedCount: 0, pendingCount: 0 });
    assert.throws(() => E.buildAgenda([], '2026-10-12'), TypeError);
    assert.throws(() => E.buildAgenda([]), TypeError);
    assert(!/Date\.now\s*\(|new Date\s*\(\s*\)/.test(source));
    const sandbox = { self: {} };
    vm.runInNewContext(source, sandbox);
    assert.equal(typeof sandbox.self.BOOM_OGGI_WORKSPACE.buildAgenda, 'function');
});

// Mutations restore three plausible regressions; the same source-based
// scenarios must reject each altered engine, not merely inspect its text.
check('mutations detect UTC legacy shift, stale moved slot and fixed-duration window', () => {
    const mutations = [
        ["record.confirmedTime + ':00Z'", "record.confirmedTime + ':00+02:00'", engine => {
            assert.equal(engine.buildAgenda([{ id: 'legacy', status: 'confirmed', confirmedDate: '2026-10-12', confirmedTime: '10:30' }], NOW).items[0].time, '12:30');
        }],
        ['if (present(record.proposedDateTime)) return instant(record.proposedDateTime);', 'if (present(record.confirmedDateTime)) return instant(record.confirmedDateTime);', engine => {
            assert.equal(engine.buildAgenda([{ id: 'moved', status: 'rescheduled', confirmedDateTime: '2026-10-12T08:00:00Z', proposedDateTime: '2026-10-13T13:00:00Z' }], NOW).items[0].dateKey, '2026-10-13');
        }],
        ['local.dateKey > lastDay', 'ms >= now + 7 * DAY', engine => {
            assert.equal(engine.buildAgenda([confirmed('day-seven', '2026-10-18T22:00:00Z')], NOW).items.length, 0);
        }]
    ];
    for (const [from, to, verify] of mutations) {
        assert(source.includes(from), 'mutation anchor exists');
        const sandbox = { module: { exports: {} } };
        vm.runInNewContext(source.replace(from, to), sandbox);
        assert.throws(() => verify(sandbox.module.exports), assert.AssertionError);
    }
});

check('context follows saved IDs, never names, phones or unrelated households', () => {
    const state = { properties:[{id:'p1',name:'Aurora',ownerId:'owner'},{id:'p2',name:'Aurora',ownerId:'other'}], users:[{id:'owner',name:'Anna'},{id:'tenant',name:'Anna'},{id:'other',name:'Anna'}], contracts:[{id:'c1',propertyId:'p1',tenantId:'tenant'},{id:'c2',propertyId:'p2',tenantId:'other'}], clients:[{id:'tenant',name:'Anna'}], conversations:[{id:'cv1',contactType:'tenant',contactId:'tenant'},{id:'cv2',contactType:'client',contactId:'tenant'},{id:'unrelated',contactType:'phone',contactId:'tenant'}] };
    const before=JSON.stringify(state);
    const house=E.contextFor({kind:'property',id:'p1'},state);
    assert(house.available);assert.deepEqual(house.records.map(r=>r.kind+':'+r.id),['person:owner','person:tenant','contract:c1']);
    assert.deepEqual(house.practiceRefs,['contracts/c1']);assert.deepEqual(house.conversationIds,[]);
    assert.deepEqual(E.contextFor({kind:'person',id:'tenant'},state).conversationIds,['cv1']);
    assert.deepEqual(E.contextFor({kind:'client',id:'tenant'},state).conversationIds,['cv2']);
    assert.deepEqual(E.contextFor({kind:'contract',id:'c1'},state).records.map(r=>r.id),['p1','owner','tenant']);
    assert.equal(E.contextFor({kind:'property',id:'missing'},state).available,false);
    assert.equal(JSON.stringify(state),before);
    state.users.push({id:'co',name:'Co-conduttore'});state.contracts[0].coTenants=[{userId:'co'}];
    assert.deepEqual(E.contextFor({kind:'person',id:'co'},state).practiceRefs,['contracts/c1']);
    state.properties.push({...state.properties[0]});
    assert.equal(E.contextFor({kind:'property',id:'p1'},state).available,false);
});
check('phone source comes only from the canonical event, rejects paths and injected URLs', () => {
    assert.equal(E.phoneSource({followUp:{lastMessageId:'phone:el_abc-123'}}),'/chiamate?call=el_abc-123');
    for(const id of ['wa_abc','phone:../secret','phone:a/b','phone:foo?call=x','phone:<img>','phone:'+ 'a'.repeat(181)]) assert.equal(E.phoneSource({followUp:{lastMessageId:id}}),null);
    assert.equal(E.phoneSource({followUp:{preview:'phone:el_abc-123'}}),null);
});

console.log(`\n${checks} workspace agenda checks passed`);
