import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const E = require('../../js/oggi-desk-engine.js');
const OGGI = require('../../js/oggi-engine.js');
const source = readFileSync(new URL('../../js/oggi-desk-engine.js', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const NOW = '2026-10-13T10:00:00Z';
const caseId = n => 'sg_' + String(n).padStart(32, '0');
const contract = (id = 'c1', extra = {}) => ({ id, status: 'active', propertyId: 'house', tenantId: 'tenant', ...extra });
const state = extra => ({ contracts: [contract()], properties: [{ id: 'house', name: 'Casa Test' }],
    users: [{ id: 'tenant', name: 'Persona Test', role: 'tenant' }], ...extra });
const task = (n, extra = {}, changes = {}) => ({ id: caseId(n), status: 'open', source: 'segretaria',
    followUp: { confirmed: true, needsReview: false, ambiguous: false, practiceRef: 'contracts/c1',
        checkAt: '2026-10-13T09:00:00Z', lastInboundAt: '2026-10-12T09:00:00Z', lastMessageId: 'message-' + n,
        nextAction: 'Verificare disponibilità', ...extra }, ...changes });
function withDelivery(row, error, delivery = 'needs_review') {
    const actionId = 'sgreply_' + 'a'.repeat(40);
    return { ...row, preparation: { revision: 'r1', messageId: row.followUp.lastMessageId,
        approval: { revision: 'r1', messageId: row.followUp.lastMessageId, actionId } },
    deliveryResult: { id: row.id, actionId, confirmed: true, delivery, ...(error ? { error } : {}) } };
}
const build = (input = {}, engine = E) => engine.build({ state: state(), signals: [], rows: [], nowISO: NOW, ...input });
const all = result => [...result.currentItems, ...result.history, ...result.waiting];
let passed = 0;
function check(name, test) { test(); passed++; console.log('PASS ' + name); }

check('stable five areas, empty means only no work in the supplied snapshot', () => {
    const result = build();
    assert.deepEqual(result.areas.map(x => x.id), ['contracts', 'payments', 'appointments', 'maintenance', 'clients']);
    assert.deepEqual(result.counts, { total: 0, current: 0, history: 0, waiting: 0, unknown: 0, urgent: 0 });
    assert(result.areas.every(x => x.count === 0));
});

function grouping(engine = E) {
    const input = state({ contracts: [contract(), contract('c2')],
        payments: [{ id: 'p1', contractId: 'c1', status: 'pending', dueDate: '2026-10-10' }] });
    const signals = [
        { id: 'sig_c1', kind: 'firme', title: 'Firma', score: 70 },
        { id: 'rli_c1', kind: 'registrazioni', title: 'Registrazione', daysLeft: 5, score: 80 },
        { id: 'pay_p1', kind: 'incassi', title: 'Rata', score: 85 },
        { id: 'sig_c2', kind: 'firme', title: 'Altra pratica', score: 60 }
    ];
    const result = build({ state: input, signals, rows: [task(1)] }, engine);
    assert.equal(result.counts.current, 2);
    const first = result.currentItems.find(x => x.record.id === 'c1');
    assert.deepEqual(new Set(first.signalIds), new Set(['sig_c1', 'rli_c1', 'pay_p1']));
    assert.deepEqual(first.caseIds, [caseId(1)]);
    assert.equal(first.title, 'Contratto · Casa Test · Persona Test');
    assert(first.urgent);
    assert.equal(result.currentItems.find(x => x.record.id === 'c2').urgent, false);
    assert.equal(result.areas.reduce((n, x) => n + x.count, 0), result.currentItems.length);
}
check('all signals and cases survive exact practice grouping; same person/home never merges contracts', grouping);

function ambiguous(engine = E) {
    const rows = [task(1, { nextAction: 'PRIVATE NEXT', preview: 'PRIVATE PREVIEW', contactName: 'PRIVATE NAME' })];
    const result = build({ state: state({ contracts: [contract(), contract()] }), rows,
        signals: [{ id: 'sig_c1', kind: 'firme', title: 'Verifica' }] }, engine);
    assert.equal(result.currentItems.length, 0);
    const item = result.history.find(x => x.caseIds.length);
    assert.equal(item.record, null);
    assert.equal(item.reason, 'Collegamento da verificare');
    assert(!JSON.stringify(item).includes('PRIVATE'));
    assert.deepEqual(item.action, { label: 'Verifica seguito', fn: 'oggiSegretariaOpen', args: [caseId(1), '', 'review'] });
}
check('duplicate record ID cannot join a case or reveal personal preview', ambiguous);

check('missing, ambiguous, unconfirmed and colliding typed refs remain redacted history', () => {
    const rows = [task(1, { confirmed: false }), task(2, { ambiguous: true }), task(3, { needsReview: true }),
        task(4, { practiceRef: 'contracts/missing' }), task(5, { practiceRef: 'properties/c1' }),
        task(6, { practiceRef: 'contracts/../c1' })];
    const result = build({ rows });
    assert.equal(result.history.length, 6);
    assert(result.history.every(x => x.reason === 'Collegamento da verificare' && x.record === null));
});

check('recent unlinked requests have their own coverage without exposing source content', () => {
    const result = build({ rows: [task(1, { confirmed: false }),
        task(2, { confirmed: false, lastInboundAt: '2026-10-06T10:00:00Z' }),
        task(3, { confirmed: false, lastInboundAt: '2026-10-06T09:59:59Z' }),
        task(4, { confirmed: false, lastInboundAt: '' }),
        task(5, { confirmed: false, lastInboundAt: '2026-10-14T10:00:00Z' }), task(6)] });
    assert.equal(result.coverage.newUnlinkedCount, 2);
    assert.deepEqual(result.coverage.newUnlinkedCaseIds, [caseId(1), caseId(2)]);
    assert(result.history.every(x => x.title === 'Seguito · collegamento da verificare'));
});

check('confirmed due work stays current despite old source; future check waits; closed cases stay out', () => {
    const result = build({ rows: [task(1, { lastInboundAt: '2020-01-01T00:00:00Z' }),
        task(2, { checkAt: '2026-11-01T00:00:00Z', lastInboundAt: '2020-01-01T00:00:00Z' }),
        task(3, {}, { status: 'done' })] });
    assert.deepEqual(result.currentItems.flatMap(x => x.caseIds), [caseId(1)]);
    assert.deepEqual(result.waiting.flatMap(x => x.caseIds), [caseId(2)]);
    assert.equal(result.counts.total, 2);
});

check('validated new proposal overrides the old future follow-up; approved and stale preparations do not', () => {
    const future = { checkAt: '2026-11-01T00:00:00Z' };
    const proposed = task(1, future, { preparation: { status: 'ready', summary: 'Raw text is not the readiness proof' } });
    const approved = withDelivery(task(2, future), '', 'sent');
    const stale = task(3, future, { preparation: { status: 'ready', messageId: 'an-old-message', summary: 'Old preparation' } });
    const result = build({ rows: [proposed, approved, stale], pendingProposalIds: [caseId(1)] });
    assert.deepEqual(result.currentItems.flatMap(x => x.caseIds), [caseId(1)]);
    assert.equal(result.currentItems[0].reason, 'Proposta da rivedere');
    assert.equal(result.currentItems[0].nextAction, 'Rivedi la proposta prima di confermare il seguito');
    assert.deepEqual(new Set(result.waiting.flatMap(x => x.caseIds)), new Set([caseId(2), caseId(3)]));
    assert.equal(result.history.length, 0);
});

check('an old pending proposal cannot hide the confirmed human check already due', () => {
    const row = task(1, { lastInboundAt: '2026-09-01T10:00:00Z', nextAction: 'Ricontattare il responsabile' });
    const result = build({ rows: [row], pendingProposalIds: [row.id] });
    assert.equal(result.history.length, 0);
    assert.equal(result.currentItems.length, 1);
    assert.equal(result.currentItems[0].reason, 'Ricontrollo dovuto');
    assert.equal(result.currentItems[0].nextAction, 'Ricontattare il responsabile');
});

check('pending proposal with old, missing or future source stays recovery; unlinked proposal stays redacted', () => {
    const rows = [task(1, { checkAt: '2026-11-01T00:00:00Z', lastInboundAt: '2026-10-01T10:00:00Z' }),
        task(2, { checkAt: '2026-11-01T00:00:00Z', lastInboundAt: '' }),
        task(3, { checkAt: '2026-11-01T00:00:00Z', lastInboundAt: '2026-10-14T10:00:00Z' }),
        task(4, { confirmed: false, nextAction: 'PRIVATE', preview: 'PRIVATE' })];
    for (const row of rows) {
        const result = build({ rows: [row], pendingProposalIds: [row.id] });
        assert.equal(result.currentItems.length, 0);
        assert.equal(result.waiting.length, 0);
        assert.equal(result.history.length, 1);
        assert.equal(result.history[0].reason, ({ [caseId(1)]: 'Fonte oltre 7 giorni',
            [caseId(2)]: 'Data della fonte non disponibile', [caseId(3)]: 'Data della fonte da verificare',
            [caseId(4)]: 'Collegamento da verificare' })[row.id]);
        assert(!JSON.stringify(result).includes('PRIVATE'));
    }
});

check('unconfirmed old or undated proposals are recovery work, never resolved', () => {
    const result = build({ rows: [task(1, { confirmed: false, lastInboundAt: '2026-09-01T00:00:00Z' }),
        task(2, { confirmed: false, lastInboundAt: '' }), task(3, { checkAt: '', lastInboundAt: '' }),
        task(4, { checkAt: '', lastInboundAt: '2026-10-01T00:00:00Z' })] });
    assert.equal(result.currentItems.length, 0);
    assert.equal(result.history.flatMap(x => x.caseIds).length, 4);
    assert(!JSON.stringify(result).includes('resolved'));
});

function unknownDelivery(engine = E) {
    const row = withDelivery(task(1, { checkAt: '2026-11-01T00:00:00Z' }), 'delivery_state_unavailable');
    const result = build({ rows: [row] }, engine);
    assert.equal(result.counts.unknown, 1);
    assert.equal(result.counts.current, 0);
    assert.deepEqual(result.coverage.unknownCaseIds, [caseId(1)]);
    assert.equal(result.history[0].reason, 'Esito dell’invio non disponibile');
    assert(!JSON.stringify(result).includes('Invio non completato'));
}
check('delivery_state_unavailable is missing coverage, not failure', unknownDelivery);

check('unknown delivery does not hide a real due check; recorded delivery error stays current', () => {
    const result = build({ rows: [withDelivery(task(1), 'delivery_state_unavailable'),
        withDelivery(task(2, { checkAt: '2026-11-01T00:00:00Z', lastInboundAt: '2020-01-01T00:00:00Z' }), 'whatsapp_delivery_needs_review')] });
    assert.equal(result.counts.unknown, 1);
    assert.equal(result.currentItems.length, 1);
    assert.deepEqual(new Set(result.currentItems[0].caseIds), new Set([caseId(1), caseId(2)]));
    assert.equal(result.currentItems[0].reason, 'Invio non completato');
    assert.equal(result.currentItems[0].urgent, false);
});

check('old approval, mismatched receipt and uncertain execution cannot become a current failure', () => {
    const make = n => withDelivery(task(n, { checkAt: '2026-11-01T00:00:00Z' }), 'whatsapp_delivery_needs_review');
    const old = make(1); old.preparation.messageId = 'other';
    const context = make(2); context.contextRevision = 2;
    const receipt = make(3); receipt.deliveryResult.actionId = 'other';
    const event = make(4); event.deliveryResult.messageId = 'other';
    const vague = withDelivery(task(5, { checkAt: '' }), 'execution_needs_review');
    const result = build({ rows: [old, context, receipt, event, vague] });
    assert.equal(result.counts.unknown, 5);
    assert.equal(result.currentItems.length, 0);
});

function historicalSignal(engine = E) {
    const signals = [{ id: 'rli_c1', kind: 'archivio', needsVerification: true, reason: 'historical_contract', score: 100,
        daysLeft: -100, tint: 'red' }];
    const result = build({ signals }, engine);
    assert.equal(result.currentItems.length, 0);
    assert.deepEqual(result.history[0].signalIds, ['rli_c1']);
    assert.equal(result.history[0].urgent, false);
    assert.equal(result.coverage.recordVerificationCount, 1);
    assert.deepEqual(result.coverage.recordVerificationSignalIds, ['rli_c1']);
}
check('historical administrative verification stays visible in its own coverage', historicalSignal);

check('current and historical signals for the same practice retain separate meanings', () => {
    const result = build({ signals: [
        { id: 'rli_c1', kind: 'archivio', needsVerification: true, reason: 'historical_contract' },
        { id: 'sig_c1', kind: 'firme', score: 70 }
    ] });
    assert.deepEqual(result.currentItems[0].signalIds, ['sig_c1']);
    assert.deepEqual(result.history[0].signalIds, ['rli_c1']);
});

check('urgent uses verified record/calendar evidence, never text or stale archive colours', () => {
    const result = build({ state: state({ contracts: [contract(), contract('c2')],
        maintenance: [{ id: 'm1', priority: 'urgent', status: 'open' }, { id: 'm2', priority: 'urgent', status: 'resolved' }],
        payments: [{ id: 'p1', status: 'paid', dueDate: '2020-01-01' }] }),
    signals: [{ id: 'mnt_m1', kind: 'manutenzione' }, { id: 'mnt_m2', kind: 'manutenzione' },
        { id: 'rli_c1', kind: 'registrazioni', daysLeft: 7 }, { id: 'rli_c2', kind: 'registrazioni', daysLeft: 8, tint: 'red' },
        { id: 'pay_p1', kind: 'incassi', title: 'URGENTISSIMO' }], rows: [task(1, { nextAction: 'URGENTISSIMO' })] });
    assert.equal(result.counts.urgent, 2);
    assert.deepEqual(new Set(result.currentItems.filter(x => x.urgent).map(x => x.record.id)), new Set(['m1', 'c1']));
});

function proposalConflict(engine = E) {
    const result = build({ state: state({ contracts: [contract('c1', { preAgreementId: 'other' })],
        preAgreements: [{ id: 'pa1', contractId: 'c1', ref: 'BOOM-1' }],
        payments: [{ id: 'p1', contractId: 'missing' }] }), signals: [
        { id: 'pa_pa1', kind: 'proposte', needsVerification: true }, { id: 'pay_p1', kind: 'incassi' }
    ] }, engine);
    assert.deepEqual(result.history[0].record, { kind: 'proposal', id: 'pa1' });
    assert.deepEqual(result.currentItems[0].record, { kind: 'payment', id: 'p1' });
}
check('proposal contradiction and absent contract do not silently group with a different practice', proposalConflict);

check('conflicting PA forward A / reverse B remains a proposal, including a one-sided stale ref', () => {
    for (const needsVerification of [true, false]) {
        const result = build({ state: state({ contracts: [contract('A'), contract('B', { preAgreementId: 'pa1' })],
            preAgreements: [{ id: 'pa1', contractId: 'A', ref: 'BOOM-1' }] }),
        signals: [{ id: 'pa_pa1', kind: 'proposte', needsVerification }] });
        const item = all(result)[0];
        assert.deepEqual(item.record, { kind: 'proposal', id: 'pa1' });
        assert.deepEqual(item.action, { label: 'Apri proposta', fn: 'oggiOpenPa', args: ['BOOM-1'] });
    }
});

check('300 old agent proposals cannot bury one current proposal; all remain accessible', () => {
    const actionQueue = Array.from({ length: 300 }, (_, i) => ({ id: 'q' + i, status: 'pending', createdAt: '2020-01-01T00:00:00Z' }));
    actionQueue.push({ id: 'new', status: 'pending', createdAt: NOW }, { id: 'missing', status: 'pending' },
        { id: 'future', status: 'pending', createdAt: '2026-10-14T10:00:00Z' },
        { id: 'duplicate', status: 'pending', createdAt: NOW }, { id: 'duplicate', status: 'pending', createdAt: NOW });
    const signals = [...new Set(actionQueue.map(x => x.id))].map(id => ({ id: 'aq_' + id, kind: 'approvazione', score: 100 }));
    const result = build({ state: state({ actionQueue }), signals });
    assert.deepEqual(result.currentItems.flatMap(x => x.signalIds), ['aq_new']);
    assert.equal(result.history.length, 303);
    assert(result.history.every(x => x.reason === 'Proposta precedente da verificare'));
    assert.equal(new Set(all(result).flatMap(x => x.signalIds)).size, signals.length);
});

check('real action_queue Firestore timestamps keep recent proposals current', () => {
    const seconds = Date.parse(NOW) / 1000;
    const actionQueue = [
        { id: 'firestore', status: 'pending', createdAt: { seconds, nanoseconds: 0 } },
        { id: 'rest', status: 'pending', createdAt: { _seconds: seconds, _nanoseconds: 0 } },
        { id: 'date', status: 'pending', createdAt: new Date(NOW) },
        { id: 'bad', status: 'pending', createdAt: { seconds, nanoseconds: -1 } }
    ];
    const result = build({ state: state({ actionQueue }), signals: actionQueue.map(x => ({ id: 'aq_' + x.id, kind: 'approvazione' })) });
    assert.deepEqual(new Set(result.currentItems.flatMap(x => x.signalIds)), new Set(['aq_firestore', 'aq_rest', 'aq_date']));
    assert.deepEqual(result.history[0].signalIds, ['aq_bad']);
});

check('milestones use seven Rome dates including today, without pretending a handover happened', () => {
    const result = build({ nowISO: '2026-10-12T22:30:00Z', state: state({ contracts: [
        contract('today', { startDate: '2026-10-13' }), contract('last', { startDate: '2026-10-19', signatureStatus: 'complete' }),
        contract('outside', { startDate: '2026-10-20' }), contract('past', { startDate: '2026-10-12' }),
        contract('closed', { status: 'terminated', startDate: '2026-10-14' })
    ] }) });
    assert.deepEqual(new Set(result.currentItems.map(x => x.record.id)), new Set(['today', 'last']));
    assert(result.currentItems.every(x => x.signalIds.length === 0 && x.signals[0].basis === 'contract.startDate'));
    assert(result.currentItems.every(x => x.action.fn === 'viewContract' && !x.urgent));
    assert(result.currentItems.find(x => x.record.id === 'today').nextAction.includes('firme'));
    assert.equal(result.currentItems.find(x => x.record.id === 'last').nextAction, 'Verifica e prepara la consegna della casa');
});

check('milestone is suppressed only by saved dated HTTPS handover proof', () => {
    const result = build({ state: state({ contracts: [
        contract('proof', { startDate: '2026-10-14', verbaleConsegna: { at: '2026-10-12T10:00:00Z', url: 'https://example.test/v.pdf' } }),
        contract('no-time', { startDate: '2026-10-14', verbaleConsegna: { url: 'https://example.test/v.pdf' } }),
        contract('no-url', { startDate: '2026-10-14', verbaleConsegna: { at: '2026-10-12T10:00:00Z' } }),
        contract('future', { startDate: '2026-10-14', verbaleConsegna: { at: '2026-11-12T10:00:00Z', url: 'https://example.test/v.pdf' } }),
        contract('http', { startDate: '2026-10-14', verbaleConsegna: { at: '2026-10-12T10:00:00Z', url: 'http://example.test/v.pdf' } })
    ] }) });
    assert.deepEqual(new Set(result.currentItems.map(x => x.record.id)), new Set(['no-time', 'no-url', 'future', 'http']));
});

check('no clock fallback or normalized impossible calendar dates', () => {
    for (const nowISO of [undefined, '', '2026-02-30T10:00:00Z', '2026-10-13', '2026-10-13T10:00:00', '2026-10-13T24:00:00Z'])
        assert.throws(() => E.build({ nowISO }), /explicit current ISO/);
    assert.equal(build({ state: state({ contracts: [contract('bad', { startDate: '2026-02-30' })] }) }).counts.total, 0);
    assert.equal(build({ rows: [task(1, { checkAt: '2026-02-30T10:00:00Z', lastInboundAt: '' })] }).counts.current, 0);
});

check('duplicate people/homes never provide context; HTML escaping belongs to renderer', () => {
    const result = build({ rows: [task(1)], state: state({
        properties: [{ id: 'house', name: 'Wrong 1' }, { id: 'house', name: 'Wrong 2' }],
        users: [{ id: 'tenant', name: '<b>Saved name</b>' }]
    }) });
    assert.equal(result.currentItems[0].title, 'Contratto · <b>Saved name</b>');
    assert(!result.currentItems[0].title.includes('Wrong'));
});

check('real Oggi signals remain accessible, while direct actions never send or mutate', () => {
    const s = state({ contracts: [contract('c1', { signatureStatus: 'partial' })],
        viewingRequests: [{ id: 'v1', status: 'pending' }],
        maintenance: [{ id: 'm1', priority: 'urgent', status: 'open', title: 'Perdita' }],
        payments: [{ id: 'p1', contractId: 'c1', status: 'pending', dueDate: '2026-10-10', amount: 900 }],
        leads: [{ id: 'l1', status: 'new', grade: 'A' }],
        actionQueue: [{ id: 'q1', status: 'pending', title: 'Proposta agente', createdAt: NOW }] });
    const signals = OGGI.build(s, NOW).decisions;
    const result = build({ state: s, signals });
    assert.deepEqual(new Set(all(result).flatMap(x => x.signalIds)), new Set(signals.map(x => x.id)));
    const allowed = new Set(['viewContract', 'viewContractSignatures', 'viewMaintenance', 'viewLead', 'oggiOpenPa', 'goTo', 'oggiSegretariaOpen']);
    all(result).forEach(item => {
        if (!item.action) return;
        assert(allowed.has(item.action.fn));
        assert(portal.includes('function ' + item.action.fn + '('));
        assert(item.action.label);
        assert(!['agent', 'agent-actions'].includes(item.action.args[0]));
    });
    assert.equal(result.currentItems.find(x => x.signalIds.includes('aq_q1')).action, null);
});

check('browser UMD has no IO, reads no messages, does not mutate frozen inputs', () => {
    const context = { URL, Intl, Date, self: {}, fetch() { throw new Error('Unexpected IO'); } };
    vm.runInNewContext(source, context);
    assert.equal(typeof context.self.BOOM_OGGI_DESK.build, 'function');
    const s = state();
    Object.defineProperty(s, 'messages', { get() { throw new Error('Private messages must not be read'); } });
    Object.defineProperty(s, 'conversations', { get() { throw new Error('Conversations must not be read'); } });
    const rows = [task(1)], signals = [{ id: 'sig_c1', kind: 'firme' }];
    const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    freeze(rows); freeze(signals); freeze(s.contracts); Object.freeze(s);
    assert.equal(build({ state: s, rows, signals }, context.self.BOOM_OGGI_DESK).currentItems.length, 1);
    assert(!/Date\.now\s*\(|new Date\(\s*\)/.test(source));
});

function mutant(before, after, verify) {
    assert(source.includes(before), 'mutation anchor exists');
    const context = { module: { exports: {} }, URL, Intl, Date };
    vm.runInNewContext(source.replace(before, after), context);
    assert.throws(() => verify(context.module.exports), assert.AssertionError, 'semantic mutation must fail');
}
check('mutations reject non-unique joins, unknown-as-failed and hidden administrative recovery', () => {
    mutant('rows.length === 1 ? rows[0] : null', 'rows.length > 0 ? rows[0] : null', ambiguous);
    mutant("if (['delivery_state_unavailable', 'execution_state_unavailable'].includes(r?.error)) return 'unknown';",
        "if (['delivery_state_unavailable', 'execution_state_unavailable'].includes(r?.error)) return 'failed';", unknownDelivery);
    mutant("signal.needsVerification === true || signal.kind === 'archivio' ||", 'false ||', historicalSignal);
});

console.log(`\n${passed} desk checks passed (3 semantic mutations).`);
