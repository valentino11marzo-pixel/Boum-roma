// Pure display contract: synthetic proposals and API-shaped receipts only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import E from '../../js/segretaria-esecuzione-engine.js';

const NOW = Date.parse('2026-09-18T10:00:00Z');
const proposal = () => ({ revision: 'r1', messageId: 'm1', status: 'ready',
  nextAction: { text: 'Chiedere la disponibilità al tecnico', waitingOn: 'valentino', waitingLabel: 'Valentino', checkAt: '2026-09-18T12:00:00Z' },
  draft: { channel: 'whatsapp', text: 'Verifico la disponibilità e ti aggiorno.' } });
const monitor = () => ({ enabled: true, prepareCases: true, status: 'idle', incomplete: false,
  checkedAt: '2026-09-18T10:00:00Z', lastRunAt: '2026-09-18T09:59:30Z' });
const options = () => ({ preparation: proposal(), monitoring: monitor(), now: NOW });
function approved(delivery = 'queued', channel = 'whatsapp') {
  const o = options(); o.preparation.draft.channel = channel;
  o.preparation.approval = { revision: 'r1', messageId: 'm1', actionId: 'action1' };
  o.delivery = { id: 'case1', actionId: 'action1', confirmed: true, cached: false, delivery };
  return o;
}
const step = (o, id, api = E) => api.describe(o).steps.find(s => s.id === id);
let count = 0, failed = 0;
function test(name, fn) { count++; try { fn(); console.log('PASS ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); } }

test('one approval plans only follow-up, the exact shown reply and recheck', () => {
  const o = options(), before = JSON.stringify(o), p = E.describe(o);
  assert.deepEqual(p.steps.map(s => s.id), ['follow_up', 'reply', 'recheck']);
  assert.ok(p.steps.every(s => s.state === 'planned')); assert.equal(p.approved, false); assert.equal(p.hasDraft, true);
  assert.match(step(o, 'reply').detail, /una sola volta.*bozza mostrata/);
  assert.match(step(o, 'recheck').detail, /nuova approvazione/);
  assert.equal(JSON.stringify(o), before);
});
test('free text never creates a call, portal job or collaborator assignment', () => {
  const o = options(); o.preparation.nextAction.text = 'Chiama il tecnico, prenota il lavoro sul portale e chiudi la pratica.';
  o.preparation.nextAction.waitingLabel = 'Tecnico sintetico';
  const p = E.describe(o);
  assert.deepEqual(p.steps.map(s => s.id), ['follow_up', 'reply', 'recheck']);
  assert.deepEqual(p.manual, [{ title: 'Prossimo passo · Tecnico sintetico', detail: o.preparation.nextAction.text }]);
  assert.match(p.notice, /resta al responsabile/);
});
for (const [receipt, channel, expected] of [['queued', 'whatsapp', 'queued'], ['pending_execution', 'whatsapp', 'pending'],
  ['sent', 'whatsapp', 'sent'], ['sent', 'email', 'sent'], ['pending_execution', 'email', 'pending'],
  ['needs_review', 'whatsapp', 'needs_review'], ['follow_up_only', 'whatsapp', 'needs_review'], ['queued', 'email', 'needs_review']]) {
  test(channel + ' receipt ' + receipt + ' maps to ' + expected, () => {
    const o = approved(receipt, channel), p = E.describe(o);
    assert.equal(step(o, 'reply').state, expected); assert.equal(step(o, 'follow_up').state, 'recorded');
    assert.equal(p.approved, true);
  });
}
test('queued and pending never claim a sent message or completed work', () => {
  for (const value of ['queued', 'pending_execution']) {
    const o = approved(value), detail = step(o, 'reply').detail;
    assert.doesNotMatch(detail, /invio.*registrato|messaggio inviato|lavoro completato/i);
    assert.match(step(o, 'follow_up').detail, /resta aperto/);
  }
});
test('follow-up only produces no reply or action when the API receipt matches', () => {
  const o = approved('follow_up_only'); o.preparation.draft = null;
  o.preparation.approval.actionId = null; delete o.delivery.actionId;
  const p = E.describe(o); assert.equal(p.hasDraft, false);
  assert.deepEqual(p.steps.map(s => s.id), ['follow_up', 'recheck']);
  assert.equal(step(o, 'follow_up').state, 'recorded');
});
test('without a draft, approval cannot inherit an old reply action', () => {
  const o = approved('sent'); o.preparation.draft = null;
  assert.equal(step(o, 'follow_up').state, 'needs_review');
  assert.equal(E.describe(o).steps.some(s => s.id === 'reply'), false);
});
for (const [name, edit] of [
  ['missing receipt', o => { delete o.delivery; }],
  ['different action', o => { o.delivery.actionId = 'old-action'; }],
  ['missing action', o => { delete o.delivery.actionId; }],
  ['receipt not confirmed', o => { o.delivery.confirmed = false; }],
  ['old approval revision', o => { o.preparation.approval.revision = 'r0'; }],
  ['old approval message', o => { o.preparation.approval.messageId = 'm0'; }],
  ['legacy approval without identity', o => { o.preparation.approval = { actionId: 'action1' }; }],
  ['optional receipt revision mismatch', o => { o.delivery.revision = 'r0'; }],
  ['optional receipt message mismatch', o => { o.delivery.messageId = 'm0'; }],
  ['post-approval uncertainty', o => { o.uncertain = true; }],
  ['receipt from an earlier proposal without approval', o => { delete o.preparation.approval; }]
]) test(name + ' cannot project a sent receipt', () => {
  const o = approved('sent'); edit(o);
  assert.equal(step(o, 'reply').state, 'needs_review');
  assert.equal(step(o, 'follow_up').state, 'needs_review');
  assert.match(E.describe(o).notice, /Ricarica/);
});
test('optional matching receipt identifiers preserve the current receipt', () => {
  const o = approved('sent'); Object.assign(o.delivery, { revision: 'r1', messageId: 'm1' });
  assert.equal(step(o, 'reply').state, 'sent');
});
for (const [status, state] of [['disabled', 'paused'], ['paused', 'paused'], ['daily_cap', 'paused'],
  ['unknown', 'unavailable'], ['unavailable', 'unavailable'], ['delayed', 'unavailable']]) {
  test('monitor ' + status + ' does not promise an active recheck', () => {
    const o = options(); o.monitoring.status = status;
    assert.equal(step(o, 'recheck').state, state); assert.doesNotMatch(step(o, 'recheck').detail, /è previsto/);
  });
}
for (const [name, edit] of [
  ['missing monitor', o => { delete o.monitoring; }],
  ['missing checked time', o => { delete o.monitoring.checkedAt; }],
  ['old heartbeat', o => { o.monitoring.lastRunAt = '2026-09-17T09:59:30Z'; }],
  ['stale read', o => { o.monitoring.checkedAt = '2026-09-18T09:00:00Z'; }],
  ['future heartbeat', o => { o.monitoring.lastRunAt = '2026-09-18T11:00:00Z'; }],
  ['partial monitoring', o => { o.monitoring.incomplete = true; }],
  ['missing now', o => { delete o.now; }],
  ['missing check date', o => { delete o.preparation.nextAction.checkAt; }]
]) test(name + ' leaves automatic recheck unverified', () => {
  const o = options(); edit(o); assert.equal(step(o, 'recheck').state, 'unavailable');
});
test('explicit disabled settings override a favourable status', () => {
  for (const field of ['enabled', 'prepareCases']) {
    const o = options(); o.monitoring[field] = false; assert.equal(step(o, 'recheck').state, 'paused');
  }
});
test('a recorded recheck is not a completed recheck', () => {
  const o = approved('sent'); assert.equal(step(o, 'recheck').state, 'recorded');
  assert.match(step(o, 'recheck').detail, /è previsto/); assert.doesNotMatch(step(o, 'recheck').detail, /eseguito|completato/);
});
test('a due recheck does not claim completion or a future appointment', () => {
  const o = approved('sent'); o.preparation.nextAction.checkAt = '2026-09-18T09:00:00Z';
  assert.equal(step(o, 'recheck').state, 'pending');
  assert.match(step(o, 'recheck').detail, /trascorso.*da verificare/);
});
test('missing preparation exposes no executable plan', () => {
  assert.deepEqual(E.describe().steps, []); assert.deepEqual(E.describe().manual, []);
});
const source = await readFile(new URL('../../js/segretaria-esecuzione-engine.js', import.meta.url), 'utf8');
function mutant(from, to) {
  assert.ok(source.includes(from)); const ctx = { module: { exports: {} } };
  vm.runInNewContext(source.replace(from, to), ctx); return ctx.module.exports;
}
test('browser UMD and imported module expose the same derived plan', () => {
  const ctx = { window: {} }; vm.runInNewContext(source, ctx);
  assert.equal(JSON.stringify(ctx.window.BOOM_SEGRETARIA_ESECUZIONE.describe(options())), JSON.stringify(E.describe(options())));
});
test('mutation: mismatched action receipt is rejected', () => {
  const api = mutant('delivery.actionId === a.actionId', 'true'), o = approved('sent'); o.delivery.actionId = 'old';
  assert.throws(() => assert.equal(step(o, 'reply', api).state, 'needs_review'));
});
test('mutation: queue state cannot become sent', () => {
  const api = mutant("{ queued: 'queued' }", "{ queued: 'sent' }");
  assert.throws(() => assert.equal(step(approved(), 'reply', api).state, 'queued'));
});
test('mutation: post-approval uncertainty wins over a sent-looking response', () => {
  const api = mutant('const unresolved = uncertain ||', 'const unresolved = false ||'), o = approved('sent'); o.uncertain = true;
  assert.throws(() => assert.equal(step(o, 'reply', api).state, 'needs_review'));
});
test('mutation: old monitoring cannot promise the planned automatic check', () => {
  const api = mutant('!m?.incomplete && fresh &&', '!m?.incomplete &&'), o = options();
  o.monitoring.lastRunAt = '2026-09-17T09:59:30Z';
  assert.throws(() => assert.equal(step(o, 'recheck', api).state, 'unavailable'));
});
console.log(`${count} execution plan checks, ${failed} failed`); process.exitCode = failed ? 1 : 0;
