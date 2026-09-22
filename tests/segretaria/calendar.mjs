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

const declared = (date = '2026-07-22', time = '16:45', timeZone = 'Europe/Rome') => ({ date, time, timeZone });
const timingAction = (checkAt = '2026-07-22T14:45:00Z', checkLocal = declared()) => ({
  text: 'Verificare lo stato della richiesta.', reason: 'Ricontrollo interno proposto alle 16:45, ora di Roma.',
  checkAt, checkLocal, sourceIds: ['synthetic_timing_source'],
});
test('instant rendering exposes the actual Rome calendar, offset and midnight boundary', () => {
  assert.deepEqual(CAL.romeLocalInstant('2026-07-22T14:45:12.123Z'), {
    date: '2026-07-22', time: '16:45', timeZone: 'Europe/Rome', utcOffsetMinutes: 120,
  });
  assert.deepEqual(CAL.romeLocalInstant('2026-12-31T23:30:00Z'), {
    date: '2027-01-01', time: '00:30', timeZone: 'Europe/Rome', utcOffsetMinutes: 60,
  });
  assert.equal(CAL.romeLocalInstant('2026-02-30T10:00:00Z'), null);
  assert.equal(CAL.romeLocalInstant('2026-07-22T16:45:00'), null);
  assert.equal(CAL.romeLocalInstant(NaN), null);
  assert.equal(CAL.romeLocalInstant(1e50), null);
});
test('the model calendar receives the verified local current date and time', () => {
  assert.deepEqual(context([], '2026-07-22T14:45:00Z').nowLocal, CAL.romeLocalInstant('2026-07-22T14:45:00Z'));
});
test('declared Rome wall time agrees with either equivalent ISO offset and does not mutate the proposal', () => {
  for (const iso of ['2026-07-22T14:45:00Z', '2026-07-22T16:45:00+02:00', '2026-07-22T14:45:12.123Z']) {
    const p = timingAction(iso), before = JSON.stringify(p);
    const result = CAL.validateCheckTiming(p);
    assert.equal(result.ok, true, iso); assert.equal(result.requiresReview, false);
    assert.equal(JSON.stringify(p), before, 'Seconds and milliseconds are preserved at minute-precision validation');
  }
});
function rejectsUtcWallClockConfusion(api = CAL) {
  for (const [iso, wall] of [
    ['2026-07-22T16:45:00Z', declared()],
    ['2026-12-22T16:45:00Z', declared('2026-12-22')],
  ]) {
    const p = timingAction(iso, wall), before = JSON.stringify(p), result = api.validateCheckTiming(p);
    assert.equal(result.ok, false); assert.ok(has(result, 'calendar_check_local_mismatch'));
    assert.equal(result.requiresReview, true); assert.equal(JSON.stringify(p), before);
    assert.notEqual(result.checkLocal.time, wall.time, 'Report the actual local clock; never rewrite the chosen instant');
  }
}
test('summer and winter UTC-as-local mistakes require review without moving the check', rejectsUtcWallClockConfusion);
test('a local date mismatch is detected even if the wall clock hour is correct', () => {
  const p = timingAction('2026-12-31T23:30:00Z', declared('2026-12-31', '00:30'));
  assert.ok(has(CAL.validateCheckTiming(p), 'calendar_check_local_mismatch'));
  p.checkLocal.date = '2027-01-01'; assert.equal(CAL.validateCheckTiming(p).ok, true);
});
function rejectsMissingLocal(api = CAL) {
  const p = timingAction(); delete p.checkLocal;
  assert.ok(has(api.validateCheckTiming(p), 'calendar_check_local_missing'));
}
test('new model output must explicitly declare its local intention', rejectsMissingLocal);
test('legacy callers may explicitly omit the declaration without pretending it was checked', () => {
  const p = timingAction(); delete p.checkLocal;
  assert.equal(CAL.validateCheckTiming(p, { requireLocal: false }).ok, true);
});
test('malformed or non-Rome declarations never silently fall back to host timezone', () => {
  for (const value of ['16:45', [], declared('2026-07-22', '16:45', 'UTC'),
    declared('2026-02-30'), declared('2026-07-22', '24:00'), declared('2026-07-22', '16:99'), {}]) {
    assert.equal(CAL.validateCheckTiming(timingAction(undefined, value)).ok, false, JSON.stringify(value));
  }
});
test('a malformed checkAt is independently rejected despite a valid local declaration', () => {
  for (const value of ['2026-07-22T16:45:00', '2026-02-30T10:00:00Z', '2026-07-22T25:00:00Z', null, 1e50])
    assert.ok(has(CAL.validateCheckTiming(timingAction(value)), 'calendar_invalid_check_time'));
});
test('the spring missing wall-clock hour cannot be repaired by choosing another instant', () => {
  const p = timingAction('2026-03-29T01:30:00Z', declared('2026-03-29', '02:30'));
  assert.ok(has(CAL.validateCheckTiming(p), 'calendar_check_local_nonexistent'));
  p.checkLocal.time = '03:30'; assert.equal(CAL.validateCheckTiming(p).ok, true);
  assert.equal(CAL.romeLocalInstant(p.checkAt).utcOffsetMinutes, 120);
});
function rejectsRepeatedLocal(api = CAL) {
  for (const iso of ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z']) {
    const p = timingAction(iso, declared('2026-10-25', '02:30'));
    assert.ok(has(api.validateCheckTiming(p), 'calendar_check_local_repeated'));
  }
}
test('both occurrences of the autumn repeated local hour remain subject to review', rejectsRepeatedLocal);
test('ordinary wall clocks on both sides of each DST change use IANA offsets', () => {
  for (const [iso, date, time, offset] of [
    ['2026-03-29T00:30:00Z', '2026-03-29', '01:30', 60],
    ['2026-03-29T01:30:00Z', '2026-03-29', '03:30', 120],
    ['2026-10-25T01:30:00Z', '2026-10-25', '02:30', 60],
    ['2026-10-25T02:30:00Z', '2026-10-25', '03:30', 60],
  ]) {
    const rendered = CAL.romeLocalInstant(iso);
    assert.equal(rendered.date, date); assert.equal(rendered.time, time); assert.equal(rendered.utcOffsetMinutes, offset);
    if (time !== '02:30') assert.equal(CAL.validateCheckTiming(timingAction(iso, declared(date, time))).ok, true);
  }
});
test('a deterministic earlier control can be checked against its newly rendered local time', () => {
  const p = timingAction('2026-07-22T13:10:00Z');
  assert.equal(CAL.validateCheckTiming(p).ok, false, 'Old model declaration must not describe a changed instant');
  assert.equal(CAL.validateCheckTiming(p, { declaredLocal: CAL.romeLocalInstant(p.checkAt) }).ok, true);
});
function reviewsUnquantifiedTiming(api = CAL) {
  for (const reason of ['Ricontrollare poco dopo il passaggio.', 'Ricontrollare subito dopo.',
    'Verificare immediatamente prima.', 'Check shortly after the visit.', 'Check just before the visit.',
    'Check soon after.', 'Check immediately after.']) {
    const p = timingAction(); p.reason = reason;
    const result = api.validateCheckTiming(p);
    assert.ok(has(result, 'calendar_relative_check_unquantified'), reason);
    assert.equal(result.requiresReview, true);
  }
}
test('closed vague-proximity phrases require review without inventing a permitted duration', reviewsUnquantifiedTiming);
test('vague proximity cannot be laundered through action text while reason gives a clock', () => {
  const p = timingAction(); p.text = 'Controllare poco dopo il passaggio.';
  assert.ok(has(CAL.validateCheckTiming(p), 'calendar_relative_check_unquantified'));
});
test('clock disagreement and vague proximity are both recorded when source event parsing has no match', () => {
  const p = timingAction('2026-07-22T16:45:00Z'); p.reason = 'Ricontrollare poco dopo il passaggio.';
  const calendar = context([source('Passo verso le 16.', '2026-07-22T10:00:00Z')]);
  assert.equal(calendar.references.length, 0, 'No event date is invented from a bare hour');
  const result = CAL.validateCheckTiming(p, { calendar });
  assert.ok(has(result, 'calendar_check_local_mismatch'));
  assert.ok(has(result, 'calendar_relative_check_unquantified'));
});
test('an honest explicit clock or generic post-event explanation is not assigned an invented proximity threshold', () => {
  for (const reason of ['Ricontrollo interno proposto alle 16:45, ora di Roma.',
    'Raccogliere l’esito dopo la visita.', 'Check the outcome after the appointment.']) {
    const p = timingAction(); p.reason = reason;
    assert.equal(CAL.validateCheckTiming(p).ok, true);
  }
});

// Exact synthetic Opus 4.8 output from the November-2026 memory probe.
// It correctly cites the agreement but also dates the earlier communication.
const recoveredAgreementProposal = {
  "summary": "L'inquilino chiede di riepilogare da dove entrare per il sopralluogo di venerdì 6 novembre, precisando che non serve fissare un nuovo appuntamento. Le indicazioni sono già state date il 2 novembre.",
  "recommendation": "Rispondere ribadendo l'accesso concordato: cancello del cortile, citofono AURORA, con le chiavi portate da BOOM, per il sopralluogo di venerdì 6 novembre alle 10:00.",
  "facts": [
    {
      "text": "Sopralluogo confermato per venerdì 6 novembre alle 10:00 (ora di Roma)",
      "sourceIds": [
        "messages/probeAgreement"
      ],
      "quote": "Sopralluogo confermato venerdì 6 novembre alle 10:00, ora di Roma."
    },
    {
      "text": "Accesso indicato: cancello del cortile, citofono AURORA, chiavi portate da BOOM",
      "sourceIds": [
        "messages/probeAgreement"
      ],
      "quote": "usa il cancello del cortile, citofono AURORA. Porto io le chiavi."
    },
    {
      "text": "L'inquilino ha confermato il sopralluogo e le indicazioni",
      "sourceIds": [
        "messages/probeAcknowledgement"
      ],
      "quote": "Confermo il sopralluogo e ho capito le indicazioni, grazie."
    },
    {
      "text": "L'inquilino non vuole fissare un nuovo appuntamento, chiede solo il riepilogo degli accessi",
      "sourceIds": [
        "messages/probeIncoming"
      ],
      "quote": "Non serve fissare un nuovo appuntamento."
    }
  ],
  "commitments": [
    {
      "text": "BOOM porta le chiavi al sopralluogo",
      "sourceIds": [
        "messages/probeAgreement"
      ],
      "quote": "Porto io le chiavi.",
      "kind": "explicit",
      "status": "pending"
    }
  ],
  "uncertainties": [],
  "nextAction": {
    "text": "Rispondere all'inquilino riepilogando le indicazioni di accesso già concordate per il sopralluogo di venerdì 6 novembre alle 10:00.",
    "waitingOn": "valentino",
    "waitingLabel": "Valentino",
    "checkAt": "2026-11-06T08:00:00.000Z",
    "practiceRef": "contracts/probeA",
    "sourceIds": [
      "messages/probeIncoming",
      "messages/probeAgreement"
    ],
    "reason": "L'inquilino chiede solo il riepilogo degli accessi; il ricontrollo interno prima del sopralluogo di venerdì mattina conferma che tutto sia pronto."
  },
  "draft": {
    "channel": "whatsapp",
    "text": "Buongiorno! Per il sopralluogo di venerdì 6 novembre alle 10:00 l'accesso è dal cancello del cortile, citofono AURORA. Le chiavi le portiamo noi. A venerdì!",
    "sourceIds": [
      "messages/probeAgreement",
      "messages/probeIncoming"
    ]
  },
  "handoff": {
    "needed": false,
    "reason": "Richiesta informativa semplice, indicazioni già disponibili nelle fonti.",
    "sourceIds": [
      "messages/probeIncoming",
      "messages/probeAgreement"
    ]
  }
};
const recoveredAgreementSources = [
  source('Sopralluogo confermato venerdì 6 novembre alle 10:00, ora di Roma. Per entrare usa il cancello del cortile, citofono AURORA. Porto io le chiavi.',
    '2026-11-02T09:00:00Z', 'messages/probeAgreement'),
  source('Buongiorno, vorrei sapere da dove entrare per il sopralluogo. Potete riepilogarmi le indicazioni?',
    '2026-11-04T08:55:00Z', 'messages/probeIncoming'),
];
function preservesSourceDate(api = CAL) {
  const c = context(recoveredAgreementSources), before = JSON.stringify(recoveredAgreementProposal);
  assert.equal(check(recoveredAgreementProposal, c, api).ok, true);
  assert.equal(JSON.stringify(recoveredAgreementProposal), before);
}
test('real synthetic model output distinguishes the November 2 communication from the November 6 appointment', preservesSourceDate);
function rejectsUnverifiedExemption(api = CAL) {
  const p = structuredClone(recoveredAgreementProposal);
  p.facts.push({ text: 'Sopralluogo venerdì 6 novembre. Indicazioni inviate il 4 novembre.', sourceIds: ['messages/probeAgreement'] });
  assert.ok(has(check(p, context(recoveredAgreementSources), api), 'calendar_source_date_conflict'));
}
test('an exemption needs the cited source timestamp and cannot borrow another message date', rejectsUnverifiedExemption);
test('without a source timestamp, mixed event and metadata text keeps the previous calendar guard', () => {
  const c = context(recoveredAgreementSources); c.anchors = [];
  assert.ok(has(check(recoveredAgreementProposal, c), 'calendar_source_date_conflict'));
});
test('a later message may quote an earlier communication without acquiring a new timestamp veto', () => {
  const p = proposal('Indicazioni inviate il 2 novembre.', undefined, 'Verificare i dettagli.');
  p.recommendation = 'Riepilogare le indicazioni.';
  p.facts = [{ text: 'Indicazioni inviate il 2 novembre.', sourceIds: ['later'], quote: 'Indicazioni inviate il 2 novembre.' }];
  const c = context([source('Indicazioni inviate il 2 novembre.', '2026-11-04T09:00:00Z', 'later')]);
  assert.equal(check(p, c).ok, true);
  // An anchor absent from the bounded calendar is also unknown, not a veto.
  c.anchors = []; assert.equal(check(p, c).ok, true);
});
test('English provenance exemption also requires the exact source timestamp', () => {
  const p = structuredClone(recoveredAgreementProposal);
  p.summary = 'The appointment is Friday 6 November. Instructions were already sent on 2 November.';
  assert.equal(check(p, context(recoveredAgreementSources)).ok, true);
  p.summary = 'The appointment is Friday 6 November. Instructions were already sent on 3 November.';
  assert.ok(has(check(p, context(recoveredAgreementSources)), 'calendar_source_date_conflict'));
});
function rejectsAttachedWeekday(api = CAL) {
  const p = structuredClone(recoveredAgreementProposal);
  for (const text of ['Le indicazioni sono state date il 2 novembre, venerdì.',
    'Le indicazioni sono state date il 2 novembre (venerdì).',
    'Le indicazioni sono state date il 2 novembre — venerdì.']) {
    p.summary = text;
    assert.ok(has(check(p, context(recoveredAgreementSources), api), 'calendar_weekday_date_conflict'), text);
  }
}
test('a weekday directly attached to the communication date must still agree', rejectsAttachedWeekday);
test('a weekday in the separate appointment sentence does not attach to the communication date', () => {
  const p = structuredClone(recoveredAgreementProposal);
  p.summary = 'Le indicazioni sono state date il 2 novembre. Venerdì 6 novembre è previsto il sopralluogo.';
  assert.equal(check(p, context(recoveredAgreementSources)).ok, true);
  p.summary = 'Le indicazioni sono state date il 2 novembre, lunedì. Sopralluogo venerdì 6 novembre.';
  assert.equal(check(p, context(recoveredAgreementSources)).ok, true);
});
function rejectsFalseAppointment(api = CAL) {
  const p = structuredClone(recoveredAgreementProposal);
  p.summary = 'Sopralluogo venerdì 13 novembre. Le indicazioni sono già state date il 2 novembre.';
  assert.ok(has(check(p, context(recoveredAgreementSources), api), 'calendar_source_date_conflict'));
}
test('correct communication metadata never excuses an appointment on the wrong Friday', rejectsFalseAppointment);
test('matching a source timestamp alone does not turn an event date into communication metadata', () => {
  const p = structuredClone(recoveredAgreementProposal);
  for (const text of ['Appuntamento il 2 novembre. Le indicazioni sono state date il 2 novembre.',
    'Il messaggio indica un appuntamento il 2 novembre.',
    'Le indicazioni sono state date per il sopralluogo il 2 novembre.']) {
    p.summary = text;
    assert.ok(has(check(p, context(recoveredAgreementSources)), 'calendar_source_date_conflict'), text);
  }
});
test('invalid dates in a mixed appointment statement still use the existing guard', () => {
  const p = structuredClone(recoveredAgreementProposal); p.summary = 'Sopralluogo venerdì 6 novembre. Le indicazioni sono state date il 31 novembre 2026.';
  assert.ok(has(check(p, context(recoveredAgreementSources)), 'calendar_invalid_date'));
});

function preservesOlderSourceTimestamp(api = CAL) {
  const sources = [source('Sopralluogo venerdì 6 novembre alle 10:00.', '2026-11-04T08:00:00Z', 'recent_event'),
    ...Array.from({ length: 39 }, (_, i) => source('Nessuna novità.', '2026-11-04T08:01:00Z', 'recent_' + i)),
    source('Indicazioni inviate.', '2026-11-02T09:00:00Z', 'older_instructions')];
  const c = context(sources, NOW, api);
  const p = { summary: 'Sopralluogo venerdì 6 novembre. Indicazioni inviate il 2 novembre.',
    facts: [{ text: 'Indicazioni inviate il 2 novembre.', sourceIds: ['older_instructions'] }] };
  assert.equal(c.anchors.some(a => a.sourceId === 'older_instructions'), true);
  assert.equal(check(p, c, api).ok, true);
  assert.equal(c.references.length, 1, 'The event interpretation window is unchanged');
}
test('a verified source beyond the first forty messages retains its communication date', preservesOlderSourceTimestamp);
test('source timestamps remain bounded and exclude historical summaries and reactions', () => {
  const sources = Array.from({ length: 130 }, (_, i) => source('Nessuna novità.', '2026-11-02T09:00:00Z', 'bounded_' + i));
  sources[0].kind = 'historical_whatsapp_summary';
  sources[1].text = 'Reacted 👍 to Thursday at 11:45';
  const c = context(sources);
  assert.equal(c.anchors.length, 122);
  assert.equal(c.anchors.some(a => ['bounded_0', 'bounded_1', 'bounded_124'].includes(a.sourceId)), false);
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


test('mutation: treating source timestamps as appointment dates reproduces the real false rejection', () => {
  const bad = mutant('if (provenanceDate) {', 'if (false) {');
  assert.throws(() => preservesSourceDate(bad), assert.AssertionError);
});
test('mutation: source metadata cannot bypass a genuine conflicting appointment', () => {
  const bad = mutant("issue('calendar_source_date_conflict', supported);", 'void 0;');
  assert.throws(() => rejectsFalseAppointment(bad), assert.AssertionError);
});
test('mutation: provenance exemption still requires the cited source timestamp', () => {
  const bad = mutant('if (verifiedProvenance) {', 'if (true) {');
  assert.throws(() => rejectsUnverifiedExemption(bad), assert.AssertionError);
});
test('mutation: exempted source dates still reject a contradictory attached weekday', () => {
  const bad = mutant("issue('calendar_weekday_date_conflict', sourceDates);", 'void 0;');
  assert.throws(() => rejectsAttachedWeekday(bad), assert.AssertionError);
});
test('mutation: shortening source timestamp coverage loses verified older communications', () => {
  const bad = mutant('sources.slice(0, 124)', 'sources.slice(0, 40)');
  assert.throws(() => preservesOlderSourceTimestamp(bad), assert.AssertionError);
});
test('mutation: omitting the Rome/UTC round-trip restores summer and winter clock errors', () => {
  const bad = mutant("issue('calendar_check_local_mismatch');", 'void 0;');
  assert.throws(() => rejectsUtcWallClockConfusion(bad), assert.AssertionError);
});
test('mutation: an absent local intention cannot be treated as verified', () => {
  const bad = mutant("if (requireLocal) issue('calendar_check_local_missing');", 'void 0;');
  assert.throws(() => rejectsMissingLocal(bad), assert.AssertionError);
});
test('mutation: picking one repeated wall clock occurrence loses the new timing protection', () => {
  const bad = mutant('if (matches.length !== 1)', 'if (matches.length === 0)');
  assert.throws(() => rejectsRepeatedLocal(bad), assert.AssertionError);
});
test('mutation: accepting vague proximity restores unverified reason/check agreement', () => {
  const bad = mutant("issue('calendar_relative_check_unquantified');", 'void 0;');
  assert.throws(() => reviewsUnquantifiedTiming(bad), assert.AssertionError);
});

console.log(`\nCalendar: ${passed} passed, ${failed} failed (including 13 mutations).`);
if (failed) process.exitCode = 1;
