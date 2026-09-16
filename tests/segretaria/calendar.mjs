// Pure UMD calendar boundary. Entirely synthetic evidence, no network or AI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import CAL from '../../js/segretaria-calendar-engine.js';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';

let passed = 0, failed = 0;
const NOW = '2026-11-04T09:00:00Z';
const source = (text = 'Thursday at 11:45 AM Rome time', at = '2026-11-02T10:00:00Z', id = 'synthetic_source') =>
  ({ id, ref: 'messages/' + id, kind: 'message', direction: 'in', text, at });
const context = (sources = [source()], now = NOW, api = CAL) => api.buildCalendarContext({ sources, now });
const proposal = (text = 'Visita giovedì 5 novembre alle 11:45.', checkAt = '2026-11-04T15:00:00Z', reason = 'Ricontrollo il giorno prima della visita.') =>
  ({ summary: text, recommendation: 'Preparare la visita.', facts: [], commitments: [],
    nextAction: { text, checkAt, reason, sourceIds: ['synthetic_source'] }, draft: null });
const check = (p, calendar = context(), api = CAL) => api.validateCalendarProposal(p, { calendar });
const has = (result, code) => result.issues.some(i => i.code === code);
function test(name, fn) {
  try { fn(); passed++; console.log('ok — ' + name); }
  catch (e) { failed++; console.error('FAIL — ' + name + ': ' + e.message); }
}

test('weekday is anchored to source date and Rome, with a concrete winter instant', () => {
  const r = context().references[0];
  assert.equal(r.date, '2026-11-05'); assert.equal(r.weekday, 'thursday');
  assert.equal(r.eventAt, '2026-11-05T10:45:00.000Z'); assert.equal(r.status, 'resolved');
  assert.equal(context().timeZone, 'Europe/Rome');
});
test('coherent date and day-before control pass without changing the proposal', () => {
  const p = proposal(), original = JSON.stringify(p);
  assert.equal(check(p).ok, true); assert.equal(JSON.stringify(p), original);
});
test('wrong numeric weekday/date cannot pass', () => {
  const result = check(proposal('Visita giovedì 06/11 alle 11:45.'));
  assert.equal(result.ok, false); assert.ok(has(result, 'calendar_weekday_date_conflict'));
});
test('a named-month date in summary is checked against the source even without an adjacent weekday', () => {
  const p = proposal(); p.summary = 'Appuntamento concordato per il 6 novembre.';
  assert.ok(has(check(p), 'calendar_source_date_conflict'));
});
test('wrong date in the draft is checked, not only the internal summary', () => {
  const p = proposal(); p.draft = { text: 'Visit Thursday 6 November at 11:45.', sourceIds: ['synthetic_source'] };
  assert.equal(check(p).ok, false);
});
test('a date on the correct weekday but the wrong week is still rejected', () => {
  assert.ok(has(check(proposal('Visita giovedì 12/11 alle 11:45.')), 'calendar_source_date_conflict'));
});
test('declared prior control cannot occur thirty minutes after the actual visit', () => {
  const r = check(proposal('Visita giovedì 5 novembre alle 11:45.', '2026-11-05T11:15:00Z'));
  assert.ok(has(r, 'calendar_check_not_before_event'));
});
test('same-day earlier hour is not falsely described as the day before', () => {
  assert.ok(has(check(proposal(undefined, '2026-11-05T09:00:00Z')), 'calendar_check_not_before_event'));
});
test('a genuine same-day earlier check is allowed when only before-the-visit is claimed', () => {
  assert.equal(check(proposal(undefined, '2026-11-05T09:00:00Z', 'Ricontrollare prima della visita.')).ok, true);
});
test('a post-visit follow-up is not forbidden when it is honestly described', () => {
  assert.equal(check(proposal(undefined, '2026-11-05T13:00:00Z', 'Raccogliere l’esito dopo la visita.')).ok, true);
});
test('an explicit not-before instruction is not interpreted as a pre-visit control', () => {
  assert.equal(check(proposal(undefined, '2026-11-05T13:00:00Z', 'Ricontrollare non prima della visita.')).ok, true);
});
test('same weekday and next-week phrasing remain ambiguous rather than guessed', () => {
  const same = context([source('Thursday at 11:45', '2026-11-05T08:00:00Z')]);
  assert.equal(same.references[0].reason, 'same_weekday_ambiguous');
  assert.equal(check(proposal(), same).ok, false);
  const next = context([source('Next Thursday at 11:45')]);
  assert.equal(next.references[0].reason, 'qualified_weekday_ambiguous');
  assert.equal(check(proposal(), next).ok, false);
});
test('an explicit past meeting or recurring weekday is not silently moved into the upcoming week', () => {
  for (const text of ['We met Thursday at 11:45.', 'Ci siamo visti giovedì alle 11:45.', 'Every Thursday at 11:45.']) {
    const c = context([source(text)]);
    assert.equal(c.references[0].status, 'ambiguous'); assert.equal(c.references[0].date, null);
  }
});
test('the same weekday with an explicit, valid source date is interpretable', () => {
  const c = context([source('Giovedì 05/11/2026 alle 11:45', '2026-11-05T08:00:00Z')]);
  assert.equal(c.references[0].date, '2026-11-05'); assert.equal(c.references[0].status, 'resolved');
});
test('multiple distinct appointments cannot supply one unqualified before-visit control', () => {
  const c = context([source(), source('Friday at 16:00', undefined, 'synthetic_other')]);
  const p = proposal(); p.nextAction.sourceIds = [];
  assert.ok(has(check(p, c), 'calendar_event_ambiguous'));
});
test('exact cited event disambiguates a second unrelated appointment', () => {
  const c = context([source(), source('Friday at 16:00', undefined, 'synthetic_other')]);
  assert.equal(check(proposal(), c).ok, true);
});
test('old sources remain in their source year instead of being moved into this year', () => {
  const c = context([source('Thursday at 11:45', '2025-11-03T10:00:00Z')]);
  assert.equal(c.references[0].date, '2025-11-06'); assert.equal(c.references[0].status, 'past');
  assert.ok(has(check(proposal('Visita giovedì 05/11/2026 alle 11:45.'), c), 'calendar_source_date_conflict'));
});
test('relative weekdays roll over the year using the source calendar', () => {
  const c = context([source('Thursday at 11:45', '2025-12-30T10:00:00Z')], '2025-12-31T10:00:00Z');
  assert.equal(c.references[0].date, '2026-01-01');
  assert.equal(c.references[0].eventAt, '2026-01-01T10:45:00.000Z');
});
test('anchor local date handles UTC midnight crossing into Rome the next day', () => {
  const c = context([source('Thursday at 11:45', '2026-11-01T23:30:00Z')]);
  assert.equal(c.anchors[0].localDate, '2026-11-02'); assert.equal(c.anchors[0].weekday, 'monday');
});
test('summer Rome time uses UTC+2, not the winter offset', () => {
  const c = context([source('Giovedì alle 11:45', '2026-07-06T10:00:00Z')], '2026-07-07T10:00:00Z');
  assert.equal(c.references[0].eventAt, '2026-07-09T09:45:00.000Z');
});
test('spring DST nonexistent hour is ambiguous and cannot justify a deadline', () => {
  const c = context([source('Domenica alle 02:30', '2026-03-27T10:00:00Z')], '2026-03-28T10:00:00Z');
  assert.equal(c.references[0].reason, 'nonexistent_local_time');
  assert.equal(c.references[0].eventAt, null);
  assert.equal(check(proposal('Visita domenica 29/03/2026.', '2026-03-28T11:00:00Z'), c).ok, false);
});
test('autumn DST repeated hour is ambiguous instead of selecting either occurrence', () => {
  const c = context([source('Sunday at 02:30', '2026-10-23T10:00:00Z')], '2026-10-24T10:00:00Z');
  assert.equal(c.references[0].reason, 'repeated_local_time'); assert.equal(c.references[0].eventAt, null);
});
test('an invalid or missing source timestamp does not establish a relative date', () => {
  for (const at of ['2026-02-30T10:00:00Z', '2026-11-02T10:00:00', null]) {
    const c = context([source('Thursday at 11:45', at)]);
    assert.equal(c.references[0].reason, 'source_time_unverified');
  }
});
test('invalid generated dates are errors, not silently normalized', () => {
  assert.ok(has(check(proposal('Visita giovedì 31/11/2026.')), 'calendar_invalid_date'));
});
test('a reaction quoting old words cannot create a new dated calendar reference', () => {
  const c = context([source(), source('Reacted 👍 to Thursday at 11:45', '2026-11-10T10:00:00Z', 'synthetic_reaction')]);
  assert.equal(c.references.length, 1); assert.equal(c.references[0].date, '2026-11-05');
});
test('unknown event does not acquire a deadline from the current day', () => {
  const c = context([source('Documento ricevuto.')]);
  assert.equal(c.references.length, 0); assert.ok(has(check(proposal(), c), 'calendar_event_ambiguous'));
  assert.equal(c.anchors.length, 1, 'Dated source anchor survives even without an event');
});
test('multiple times in one source remain unresolved', () => {
  const c = context([source('Thursday at 10:00 or 11:45')]);
  assert.equal(c.references[0].reason, 'multiple_calendar_references');
});
test('explicit non-Rome time is not silently converted as if it were Rome', () => {
  const c = context([source('Thursday at 11:45 UTC')]);
  assert.equal(c.references[0].reason, 'explicit_time_zone_unresolved');
  const cet = context([source('Thursday at 11:45 CET', '2026-07-06T10:00:00Z')], '2026-07-07T10:00:00Z');
  assert.equal(cet.references[0].eventAt, null, 'Fixed CET must not silently become summer Rome UTC+2');
});

const code = await readFile(new URL('../../js/segretaria-calendar-engine.js', import.meta.url), 'utf8');
function mutant(before, after) {
  assert.ok(code.includes(before), 'Mutation target must exist');
  const sandbox = { window: { BOOM_PROPOSTA: PROPOSTA }, Intl, Date };
  vm.runInNewContext(code.replace(before, after), sandbox);
  return sandbox.window.BOOM_SEGRETARIA_CALENDAR;
}
test('browser UMD exposes the same pure API without CommonJS', () => {
  const sandbox = { window: { BOOM_PROPOSTA: PROPOSTA }, Intl, Date }; vm.runInNewContext(code, sandbox);
  assert.equal(sandbox.window.BOOM_SEGRETARIA_CALENDAR.TIME_ZONE, 'Europe/Rome');
  assert.equal(sandbox.window.BOOM_SEGRETARIA_CALENDAR.buildCalendarContext({ sources: [source()], now: NOW }).references[0].date, '2026-11-05');
});
test('mutation: removing weekday/date consistency is detected', () => {
  const bad = mutant("issue('calendar_weekday_date_conflict', candidates);", 'void 0;');
  const c = { ...context(), references: [] };
  const p = proposal('Visita giovedì 06/11/2026.', undefined, 'Raccogliere poi l’esito.');
  assert.equal(check(p, c).ok, false); assert.equal(check(p, c, bad).ok, true);
});
test('mutation: removing source-date consistency is detected even when weekdays match', () => {
  const bad = mutant("issue('calendar_source_date_conflict', supported);", 'void 0;');
  const p = proposal('Visita giovedì 12/11/2026.', undefined, 'Raccogliere poi l’esito.');
  assert.equal(check(p).ok, false); assert.equal(check(p, context(), bad).ok, true);
});
test('mutation: removing control ordering accepts the original failure pattern', () => {
  const bad = mutant("issue('calendar_check_not_before_event', supported);", 'void 0;');
  const p = proposal(undefined, '2026-11-05T11:15:00Z');
  assert.equal(check(p).ok, false); assert.equal(check(p, context(), bad).ok, true);
});
test('mutation: selecting one DST fold occurrence loses the ambiguity guarantee', () => {
  const bad = mutant("if (candidates.length !== 1)", "if (candidates.length === 0)");
  const sources = [source('Sunday at 02:30', '2026-10-23T10:00:00Z')];
  assert.equal(context(sources).references[0].status, 'ambiguous');
  assert.notEqual(context(sources, NOW, bad).references[0].status, 'ambiguous');
});

console.log(`\nCalendar: ${passed} passed, ${failed} failed (including 4 mutations).`);
if (failed) process.exitCode = 1;
