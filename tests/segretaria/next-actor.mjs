// Pure boundary: no real contact data, no model, no network or writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import P from '../../js/segretaria-proposta-engine.js';

const NOW = Date.parse('2026-09-17T12:00:00Z');
const source = { id: 'messages/callback', kind: 'message', messageKind: 'text', direction: 'in',
  text: 'Ti richiamo io più tardi.', at: '2026-09-17T11:50:00Z' };
const promise = { kind: 'explicit', status: 'pending', quote: source.text, sourceIds: [source.id] };
const make = () => ({ draft: null, commitments: [{ text: 'Il contatto ha promesso un richiamo.',
  kind: 'explicit', status: 'pending', sourceIds: [source.id] }], nextAction: {
  text: 'Attendere il richiamo del contatto', waitingOn: 'client', waitingLabel: 'Contatto sintetico',
  practiceRef: 'contracts/synthetic', checkAt: '2026-09-17T18:00:00Z', sourceIds: [source.id],
  reason: 'Il contatto deve richiamare; ricontrollare questa sera.' } });
const opts = () => ({ now: NOW, contactName: 'Contatto sintetico', historyVerified: true,
  sources: [structuredClone(source)], rawCommitments: [structuredClone(promise)],
  followUp: { checkAt: '2026-09-17T13:00:00Z', confirmed: false } });
let checks = 0, fails = 0;
function test(name, fn) { checks++; try { fn(); console.log('PASS ' + name); }
  catch (e) { fails++; console.error('FAIL ' + name + ': ' + e.message); } }
function preserves(api = P) {
  const p = make(), options = opts(), original = JSON.stringify({ p, options });
  assert.deepEqual(api.nextActor(p, options), p.nextAction);
  assert.equal(JSON.stringify({ p, options }), original);
}
test('source-backed pending callback keeps the contact without a manual confirmation or draft', preserves);
test('a collaborator can be awaited only when the speaker is that same named contact', () => {
  const p = make(); p.nextAction.waitingOn = 'collaborator';
  assert.equal(P.nextActor(p, opts()).waitingOn, 'collaborator');
  p.nextAction.waitingLabel = 'Tecnico diverso';
  assert.equal(P.nextActor(p, opts()).waitingOn, 'valentino');
});
test('English first-person callback is the same bounded exception', () => {
  const options = opts(); options.sources[0].text = "I'll call you back later.";
  options.rawCommitments[0].quote = options.sources[0].text;
  assert.equal(P.nextActor(make(), options).waitingOn, 'client');
});
test('closed completion clauses preserve the callback in either order, IT and EN', () => {
  for (const text of ['Ti richiamo appena finisco.', 'Ti richiamo io appena ho finito.',
    'Appena ho finito ti richiamo.', 'Appena termino, vi richiamo io.',
    "I'll call you back as soon as I finish.", "Once I'm done, I will call you."]) {
    const o = opts(); o.sources[0].text = text; o.rawCommitments[0].quote = text;
    assert.equal(P.nextActor(make(), o).waitingOn, 'client', text);
  }
});
test('completion clause is not an escape for conditional, hesitant or negated callback', () => {
  for (const text of ['Ti richiamo se riesco.', 'Forse ti richiamo appena finisco.',
    'Non ti richiamo appena finisco.', 'Appena ho finito ti richiamo?', 'Appena ho finito ti richiamo se posso.',
    "I might call you once I'm done.", "I'll call you once I'm done if I can."]) {
    const o = opts(); o.sources[0].text = text; o.rawCommitments[0].quote = text;
    assert.equal(P.nextActor(make(), o).waitingOn, 'valentino', text);
  }
});
test('a plain acknowledgment does not erase a callback, later substance does', () => {
  const options = opts(); options.sources.push({ id: 'messages/later', kind: 'message', messageKind: 'text', direction: 'out',
    text: 'Grazie.', at: '2026-09-17T11:55:00Z' });
  assert.equal(P.nextActor(make(), options).waitingOn, 'client');
  options.sources[1].text = 'Ci siamo già sentiti, abbiamo risolto.';
  assert.equal(P.nextActor(make(), options).waitingOn, 'valentino');
});
test('an acknowledgment with unread media cannot hide a possible revocation', () => {
  const o = opts(); o.sources.push({ id: 'messages/media-ack', kind: 'message', messageKind: 'attachment',
    direction: 'in', text: 'Ok.', textAvailable: true, at: '2026-09-17T11:59:00Z' });
  assert.equal(P.nextActor(make(), o).waitingOn, 'valentino');
  o.sources[1].at = '2026-09-17T11:00:00Z';
  assert.equal(P.nextActor(make(), o).waitingOn, 'client');
});
for (const [name, edit] of [
  ['missing raw evidence', o => { o.rawCommitments = []; }],
  ['inferred commitment', o => { o.rawCommitments[0].kind = 'inferred'; }],
  ['already fulfilled', o => { o.rawCommitments[0].status = 'satisfied'; }],
  ['invented quotation', o => { o.rawCommitments[0].quote = 'Ti richiamo.'; }],
  ['outgoing speaker', o => { o.sources[0].direction = 'out'; }],
  ['historical summary', o => { o.sources[0].kind = 'historical_whatsapp_summary'; }],
  ['truncated source', o => { o.sources[0].textTruncated = true; }],
  ['truncated phone analysis', o => { o.sources[0].analysisTruncated = true; }],
  ['unread source', o => { o.sources[0].analysisAvailable = false; }],
  ['unverified chronology', o => { o.historyVerified = false; }],
  ['promise on the previous Rome day', o => { o.sources[0].at = '2026-09-16T23:00:00+02:00'; }],
  ['future source timestamp', o => { o.sources[0].at = '2026-09-17T13:00:00Z'; }],
  ['duplicate source ID', o => { o.sources.push({ ...o.sources[0], text: 'Non richiamo.' }); }],
  ['same-time conflict', o => { o.sources.push({ ...o.sources[0], id: 'messages/conflict', text: 'Non richiamo.' }); }],
  ['later unread attachment', o => { o.sources.push({ id: 'messages/media', kind: 'message', direction: 'in',
    text: '[audio]', textAvailable: false, at: '2026-09-17T11:59:00Z' }); }],
]) test(name + ' cannot unlock a contact wait', () => {
  const o = opts(); edit(o); assert.equal(P.nextActor(make(), o).waitingOn, 'valentino');
});
test('quoted fragment cannot discard negation, hesitation, question or a retraction', () => {
  for (const text of ['Non ti richiamo io più tardi.', 'Forse ti richiamo io più tardi.',
    'Ti richiamo io più tardi?', 'Ti richiamo io più tardi. Anzi no.', 'Ha detto: «Ti richiamo io più tardi.»']) {
    const o = opts(); o.sources[0].text = text;
    assert.equal(P.nextActor(make(), o).waitingOn, 'valentino', text);
  }
});
test('unresolved appointment/time wording does not acquire an automatic callback exception', () => {
  for (const text of ['Ti richiamo domani.', 'Ti richiamo alle 12:00.', 'Ti richiamo venerdì.']) {
    const o = opts(); o.sources[0].text = text; o.rawCommitments[0].quote = text;
    assert.equal(P.nextActor(make(), o).waitingOn, 'valentino', text);
  }
});
test('promise must support the same next step, speaker and source', () => {
  const p = make(); p.nextAction.sourceIds = ['messages/other'];
  assert.equal(P.nextActor(p, opts()).waitingOn, 'valentino');
  p.nextAction.sourceIds = [source.id]; p.nextAction.text = 'Chiedere conferma al tecnico';
  assert.equal(P.nextActor(p, opts()).waitingOn, 'valentino');
});
test('mentioning a call cannot transfer an unrelated objective or another person to the contact', () => {
  for (const text of ['Attendere il pagamento dopo la chiamata', 'Attendere la chiamata di un altro tecnico',
    'Attendere il richiamo del contatto per confermare il pagamento', 'Wait for the payment after the call']) {
    const p = make(); p.nextAction.text = text;
    assert.equal(P.nextActor(p, opts()).waitingOn, 'valentino', text);
  }
  const p = make(); p.nextAction.text = 'Wait for the callback from the contact.';
  assert.equal(P.nextActor(p, opts()).waitingOn, 'client');
});
function alignedReason(api = P) {
  const p = make(), o = opts(); o.rawCommitments = [];
  const n = api.nextActor(p, o);
  assert.equal(n.waitingOn, 'valentino'); assert.equal(n.checkAt, o.followUp.checkAt);
  assert.equal(n.requiresReview, true); assert.match(n.text, /^Verificare nelle fonti/);
  assert.doesNotMatch(n.reason, /questa sera|contatto deve richiamare/i);
  assert.match(n.reason, /ricontrollo interno precedente/);
}
test('a guard-adjusted afternoon review has no retained evening explanation', alignedReason);
test('policy version invalidates unapproved v2 but preserves an approved receipt', () => {
  assert.equal(P.VERSION, 4);
  const t = { status: 'open', followUp: { lastMessageId: 'm1' }, preparation: { version: 2, messageId: 'm1', coverage: { version: P.CONTEXT_VERSION } } };
  assert.equal(P.currentContext(t), false); t.preparation.approval = { revision: 'old' };
  assert.equal(P.currentContext(t), true);
});
const code = await readFile(new URL('../../js/segretaria-proposta-engine.js', import.meta.url), 'utf8');
function mutant(from, to) {
  assert.ok(code.includes(from)); const ctx = { module: { exports: {} } };
  vm.runInNewContext(code.replace(from, to), ctx); return ctx.module.exports;
}
test('mutation: original unconditional reassignment fails the callback case', () => {
  assert.throws(() => preserves(mutant('confirmedWait || provenCallbackWait(proposal, { ...evidence, now })', 'confirmedWait')));
});
test('mutation: source-less exception fails the evidence negative case', () => {
  const api = mutant('if (confirmedWait || provenCallbackWait(proposal, { ...evidence, now })) return n;', 'if (true) return n;');
  const o = opts(); o.rawCommitments = [];
  assert.throws(() => assert.equal(api.nextActor(make(), o).waitingOn, 'valentino'));
});
console.log(`${checks} next-actor checks, ${fails} failed`); process.exitCode = fails ? 1 : 0;
