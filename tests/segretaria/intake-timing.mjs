// Pure intake grammar plus mutations. All sources are synthetic; no I/O/model.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import CAL from '../../js/segretaria-calendar-engine.js';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';
import INTAKE from '../../js/segretaria-intake-engine.js';
const engineText = await readFile(new URL('../../js/segretaria-intake-engine.js', import.meta.url), 'utf8');

const SOURCE = '2026-09-17T08:19:53.000Z';
const NOW = Date.parse(SOURCE);
const input = (text, extra = {}) => ({ text, sourceAt: SOURCE, sourceMessageId: 'phone:synthetic', now: NOW, ...extra });
let checks = 0, fails = 0;
function test(name, fn) {
  checks++;
  try { fn(); console.log('PASS ' + name); }
  catch (e) { fails++; console.error('FAIL ' + name + ': ' + e.message); }
}
function correctEarly(api = INTAKE) {
  const text = 'Verificate le alternative entro oggi alle 12:00, ora di Roma.';
  const result = api.proposeInitialCheck(input(text));
  assert.equal(result.checkAt, '2026-09-17T10:00:00.000Z');
  assert.equal(result.intakeTiming.requestedAt, result.checkAt);
  assert.equal(result.intakeTiming.status, 'resolved');
  assert.equal(result.intakeTiming.sourceMessageId, 'phone:synthetic');
  assert.equal(result.intakeTiming.sourceAt, SOURCE);
  assert.equal(result.intakeTiming.quote, text.slice(0, -1));
  assert.match(result.checkBasis, /nessun impegno confermato/);
}
test('explicit noon request brings initial review before the old 12:19 default', correctEarly);
test('far deadline remains visible without postponing the earlier technical review', () => {
  const r = INTAKE.proposeInitialCheck(input('Please check alternatives by tomorrow at 12:00 Rome time.'));
  assert.equal(r.checkAt, '2026-09-17T10:19:53.000Z');
  assert.equal(r.intakeTiming.requestedAt, '2026-09-18T10:00:00.000Z');
});
test('plain hour from the post-release report needs a day instead of assuming today', () => {
  const r = INTAKE.proposeInitialCheck(input('Verificare alternative entro le 12:00'));
  assert.equal(r.intakeTiming.status, 'ambiguous'); assert.equal(r.intakeTiming.reason, 'date_unspecified');
  assert.equal(r.checkAt, SOURCE); assert.equal(r.intakeTiming.requestedAt, null);
});
test('no temporal request keeps the ordinary internal proposal and creates no false deadline', () => {
  const r = INTAKE.proposeInitialCheck(input('Documento ricevuto, grazie.'));
  assert.equal(r.intakeTiming, null); assert.equal(r.checkAt, '2026-09-17T10:19:53.000Z');
});
test('negated, tentative, historical and quoted times remain immediate reviews', () => {
  for (const [text, reason] of [
    ['Non serve verificare entro oggi alle 12:00.', 'negated_request'],
    ['Forse verificate entro oggi alle 12:00.', 'tentative_request'],
    ['Please check by today 12:00 if possible.', 'tentative_request'],
    ['Avevo chiesto entro oggi alle 12:00.', 'historical_or_quoted_request'],
    ['He said "check by today 12:00".', 'historical_or_quoted_request'],
  ]) {
    const r = INTAKE.proposeInitialCheck(input(text));
    assert.equal(r.intakeTiming.reason, reason, text); assert.equal(r.intakeTiming.requestedAt, null, text);
    assert.equal(r.checkAt, SOURCE, text);
  }
});
test('affirmative no-later-than wording is not negation', () => {
  assert.equal(INTAKE.extractRequestedTiming(input('Please check no later than today at 12:00.')).status, 'resolved');
});
test('weekday, multiple times/dates, approximations and unsupported date forms remain explicit', () => {
  for (const text of ['Verificate entro venerdì alle 12:00.', 'Verificate entro oggi alle 12:00 o 13:00.',
    'Verificate entro oggi o domani alle 12:00.', 'Check by today 12:00 or at 3.',
    'Verificate entro il 17 settembre alle 12:00.', 'Verificate entro oggi circa le 12:00.',
    'Verificate entro oggi alle 12:00. Oppure entro domani alle 13:00.', 'Check by today at noon.',
    'Verificate entro le 12.', 'Verificate entro il 20 settembre.']) {
    const r = INTAKE.proposeInitialCheck(input(text));
    assert.equal(r.intakeTiming.status, 'ambiguous', text); assert.equal(r.intakeTiming.requestedAt, null, text);
    assert.equal(r.checkAt, SOURCE, text);
  }
});
test('complete IT and ISO dates and AM/PM are interpreted as source requests', () => {
  for (const text of ['Verificate entro il 17/09/2026 alle 12:00.', 'Check by 2026-09-17 at 12:00 pm.']) {
    assert.equal(INTAKE.extractRequestedTiming(input(text)).requestedAt, '2026-09-17T10:00:00.000Z');
  }
  assert.equal(INTAKE.extractRequestedTiming(input('Check by tomorrow at 12:00 am.')).requestedAt, '2026-09-17T22:00:00.000Z');
});
test('invalid dates and times are never normalized', () => {
  for (const text of ['Verificate entro il 30/02/2027 alle 12:00.', 'Check by 2026-13-17 at 12:00.',
    'Check by today 24:00.', 'Check by today 12:60.', 'Check by today 13:00 pm.']) {
    assert.equal(INTAKE.extractRequestedTiming(input(text)).status, 'ambiguous', text);
  }
});
function pastRequest(api = INTAKE) {
  const r = api.proposeInitialCheck(input('Verificate entro oggi alle 09:00.'));
  assert.equal(r.intakeTiming.status, 'past');
  assert.equal(r.intakeTiming.requestedAt, '2026-09-17T07:00:00.000Z');
  assert.equal(r.checkAt, SOURCE);
}
test('passed source deadline stays on its day and asks immediate review', pastRequest);
test('delayed historical intake uses the message day, not ingestion day', () => {
  const r = INTAKE.proposeInitialCheck(input('Verificate entro oggi alle 12:00.', { now: Date.parse('2026-09-18T08:00:00Z') }));
  assert.equal(r.intakeTiming.requestedAt, '2026-09-17T10:00:00.000Z'); assert.equal(r.intakeTiming.status, 'past');
  assert.equal(r.checkAt, '2026-09-18T08:00:00.000Z');
});
test('Rome midnight/year changes are anchored to the source instant', () => {
  const r = INTAKE.extractRequestedTiming(input('Check by tomorrow at 12:00.',
    { sourceAt: '2026-12-31T23:30:00Z', now: Date.parse('2026-12-31T23:30:00Z') }));
  assert.equal(r.requestedAt, '2027-01-02T11:00:00.000Z');
});
test('winter uses Rome UTC+1 while the summer noon sample uses UTC+2', () => {
  const r = INTAKE.extractRequestedTiming(input('Check by today at 12:00.',
    { sourceAt: '2026-11-02T08:30:00Z', now: Date.parse('2026-11-02T08:30:00Z') }));
  assert.equal(r.requestedAt, '2026-11-02T11:00:00.000Z');
});
test('DST missing/repeated local hours stay unresolved through the shared calendar boundary', () => {
  for (const [date, reason] of [['2026-03-29', 'nonexistent_local_time'], ['2026-10-25', 'repeated_local_time']]) {
    const r = INTAKE.extractRequestedTiming(input(`Check by ${date} at 02:30.`));
    assert.equal(r.status, 'ambiguous'); assert.equal(r.reason, reason); assert.equal(r.requestedAt, null);
  }
});
test('unresolved explicit zones cannot silently become Rome', () => {
  for (const suffix of ['UTC', 'CET', 'ora di Londra', 'Paris time', 'New York time']) {
    assert.equal(INTAKE.extractRequestedTiming(input('Check by today at 12:00 ' + suffix + '.')).status, 'ambiguous');
  }
});
test('bad timestamp cannot anchor a relative deadline', () => {
  for (const sourceAt of [null, '2026-02-30T08:00:00Z', '2026-09-17T08:00:00']) {
    const r = INTAKE.extractRequestedTiming(input('Check by today at 12:00.', { sourceAt }));
    assert.equal(r.reason, 'source_time_unverified'); assert.equal(r.requestedAt, null);
  }
});
test('reaction wrapper does not turn its quote into a new deadline', () => {
  assert.equal(INTAKE.extractRequestedTiming(input('Reacted 👍 to Verificate entro oggi alle 12:00.')), null);
});
test('unrelated negative clause is neutral but separate retraction or uncertainty blocks acceptance', () => {
  assert.equal(INTAKE.extractRequestedTiming(input('Non cerco una stanza. Verificate alternative entro oggi alle 12:00.')).status, 'resolved');
  for (const text of ['Forse. Verificate alternative entro oggi alle 12:00.',
    'Verificate entro oggi alle 12:00. Anzi, lasciate perdere.', 'Check by today 12:00. Never mind.']) {
    assert.equal(INTAKE.extractRequestedTiming(input(text)).reason, 'request_retracted_or_uncertain');
  }
});
test('source beyond the parsing bound is not accepted from its prefix', () => {
  const r = INTAKE.extractRequestedTiming(input('Verificate entro oggi alle 12:00. ' + 'x'.repeat(12000)));
  assert.equal(r.reason, 'source_text_too_long'); assert.equal(r.requestedAt, null);
});
test('browser UMD produces the same evidence without mutation of its input', () => {
  const ctx = { BOOM_SEGRETARIA_CALENDAR: CAL, BOOM_PROPOSTA: PROPOSTA }; ctx.window = ctx;
  vm.runInNewContext(engineText, ctx);
  correctEarly(ctx.BOOM_SEGRETARIA_INTAKE);
});

function mutant(from, to) {
  assert.ok(engineText.includes(from), 'mutation target exists');
  const sandbox = { module: { exports: {} }, require: p => p.includes('calendar') ? CAL : PROPOSTA };
  vm.runInNewContext(engineText.replace(from, to), sandbox);
  return sandbox.module.exports;
}
test('mutation: original +2h bug is caught by the concrete noon sample', () => {
  assert.throws(() => correctEarly(mutant('Math.min(baseline, Date.parse(intakeTiming.requestedAt))', 'baseline')));
});
test('mutation: treating elapsed deadline as future is caught', () => {
  assert.throws(() => pastRequest(mutant("status: Date.parse(resolved.at) <= clock ? 'past' : 'resolved'", "status: 'resolved'")));
});
test('mutation: removing the negation veto promotes an invalid request and is caught', () => {
  const api = mutant("if (NEGATED.test(s.replace(/\\bno later than\\b/g, 'by')))", 'if (false)');
  assert.throws(() => assert.equal(api.extractRequestedTiming(input('Non verificare entro oggi alle 12:00.')).status, 'ambiguous'));
});
test('mutation: lost source date changes a delayed request and is caught', () => {
  const api = mutant('CAL.romeLocalDate(sourceAt)', 'CAL.romeLocalDate(now)');
  assert.throws(() => assert.equal(api.extractRequestedTiming(input('Check by today at 12:00.',
    { now: Date.parse('2026-09-18T08:00:00Z') })).requestedAt, '2026-09-17T10:00:00.000Z'));
});
console.log(`${checks} intake timing checks, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
