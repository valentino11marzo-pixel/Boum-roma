// tests/cities/calendar.mjs — the desk calendar (js/desk-calendar.js), ONE
// copy read by the payment webhook (the end of the 14-day withdrawal, the day
// the work starts) and by the city pages (the desk window under the door).
//
// What breaks if this goes red:
//   - the page says "desk open" on Koningsdag, the Diada, an English bank
//     holiday, Sant'Ambrogio or Christmas, or the webhook counts a working
//     day the desk does not work (the payer's right to withdraw ends a day
//     early — or the work starts a day late);
//   - London's substitute days drift (Christmas on a Saturday is Monday 27 +
//     Tuesday 28, Boxing Day on a Saturday is Monday 28, New Year on a
//     Saturday is Monday 3), or a runtime that prints "GMT+1" turns London's
//     BST into CET;
//   - the window names TODAY's zone for an opening on the other side of the
//     clock change ("Tomorrow from 09:00 CEST" on Sunday 25 October 2026,
//     when Monday is already CET);
//   - the copy the build inlines in a page drifts from the file the webhook
//     imports;
//   - a desk names a calendar that does not exist and silently falls back to
//     Italy alone.
// Pure Node: no browser, no network.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import CAL from '../../js/desk-calendar.js';
import { fragments } from '../../build-cities.mjs';
import { CITY_MARKETS } from '../../api/_market.js';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
// the webhook builds a Stripe client at load: a dummy key, no request is ever made
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_for_import';
const { HOLIDAY_KEYS: WEBHOOK_KEYS, isDeskHoliday: webhookIsDeskHoliday } = await import('../../api/stripe-webhook.js');
let ok = 0, ko = 0;
const check = (cond, t, why = '') => { if (cond) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); } else { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t + (why ? ` — ${why}` : '')); } };

console.log('\n\x1b[1m▸ deskcalendar\x1b[0m  the desk calendar: one copy for the page and the webhook, the holidays, the window, the zone of the opening');

const DESK = { timeZone: 'Europe/Rome', hours: { from: '09:00', to: '19:00' }, days: [1, 2, 3, 4, 5] };
const at = (iso) => new Date(iso);
const line = (iso, key) => (CAL.deskWindow(at(iso), DESK, key) || {}).line;

// ── Easter and the holidays ────────────────────────────────────────────────
check(['2024-3-31', '2025-4-20', '2026-4-5', '2027-3-28', '2028-4-16', '2030-4-21'].every((s) => { const [y, m, d] = s.split('-').map(Number); const e = CAL.easterOf(y); return e[0] === m && e[1] === d; }),
  'Easter (Meeus): 2024-03-31, 2025-04-20, 2026-04-05, 2027-03-28, 2028-04-16, 2030-04-21');
const H = (y, m, d, k) => CAL.isHoliday(y, m, d, k);
check(H(2026, 1, 1, 'it') && H(2026, 4, 6, 'it') && H(2026, 6, 29, 'it') && H(2026, 10, 4, 'it') && H(2026, 12, 26, 'it') && !H(2026, 10, 27, 'it'),
  'Italy: New Year, Pasquetta, Rome\'s 29 June, 4 October (national again from 2026), Santo Stefano — a Tuesday is not');
check(H(2026, 4, 27, 'nl') && H(2026, 5, 5, 'nl') && H(2026, 4, 3, 'nl') && H(2026, 5, 14, 'nl') && H(2026, 5, 25, 'nl') && H(2026, 4, 25, 'nl'),
  'Netherlands (plus Italy): Koningsdag, Bevrijdingsdag, Goede Vrijdag, Hemelvaart, Pinkstermaandag — and Italy\'s 25 April');
check(H(2025, 4, 26, 'nl') && !H(2026, 4, 26, 'nl'), 'Koningsdag moves to Saturday 26 April only when the 27th is a Sunday (2025), not otherwise (2026)');
check(H(2026, 4, 2, 'es') && H(2026, 4, 3, 'es') && H(2026, 5, 15, 'es') && H(2026, 11, 9, 'es') && H(2026, 10, 12, 'es') && !H(2026, 6, 24, 'es'),
  'Madrid: Jueves and Viernes Santo, San Isidro, La Almudena, 12 October — not Sant Joan');
check(H(2026, 6, 24, 'es-bcn') && H(2026, 9, 11, 'es-bcn') && H(2026, 9, 24, 'es-bcn') && H(2026, 5, 25, 'es-bcn') && H(2026, 12, 26, 'es-bcn') && !H(2026, 4, 2, 'es-bcn'),
  'Barcelona: Sant Joan, the Diada, La Mercè, Pasqua Granada (Easter+50), Sant Esteve — and NO Dijous Sant');
check(H(2028, 9, 25, 'es-bcn') && !H(2026, 9, 25, 'es-bcn'), 'La Mercè moves to Monday the 25th only when the 24th is a Sunday (2028), never otherwise');
// England & Wales bank holidays: every date of 2026–2028 (gov.uk; 2027 early
// May and all of 2028 still await their proclamation — the statutory rule)
const GB = {
  2026: ['01-01', '04-03', '04-06', '05-04', '05-25', '08-31', '12-25', '12-28'],
  2027: ['01-01', '03-26', '03-29', '05-03', '05-31', '08-30', '12-27', '12-28'],
  2028: ['01-03', '04-14', '04-17', '05-01', '05-29', '08-28', '12-25', '12-26']
};
// the England & Wales table alone, Italy set aside for the length of `fn`
// (the union would hide a wrong weekend day behind Italy's 25-26 December)
const gbAlone = (fn) => { const it = CAL.HOLIDAYS.it; CAL.HOLIDAYS.it = { fixed: [], easter: [] }; try { return fn(); } finally { CAL.HOLIDAYS.it = it; } };
for (const [y, days] of Object.entries(GB)) {
  for (const md of days) { const [m, d] = md.split('-').map(Number); check(H(+y, m, d, 'gb-eng'), `London: ${y}-${md} is a bank holiday`); }
  const only = gbAlone(() => { const a = []; for (let t = Date.UTC(+y, 0, 1); t < Date.UTC(+y + 1, 0, 1); t += 864e5) { const x = new Date(t); if (CAL.isDeskHoliday(x, 'gb-eng')) a.push(x.toISOString().slice(5, 10)); } return a; });
  check(only.join() === days.join(), `London ${y}: the England & Wales table alone gives exactly the eight bank holidays, nothing more`, only.join(' '));
}
check(gbAlone(() => !H(2026, 12, 26, 'gb-eng') && !H(2027, 12, 25, 'gb-eng') && !H(2027, 12, 26, 'gb-eng') && !H(2028, 1, 1, 'gb-eng')),
  'London: a holiday on a weekend is not kept on the weekend day itself (Sat 26 Dec 2026, Sat 25 and Sun 26 Dec 2027, Sat 1 Jan 2028) — it moves to the next weekday');
check(!H(2026, 10, 12, 'gb-eng') && !H(2026, 5, 11, 'gb-eng') && !H(2026, 8, 24, 'gb-eng'), 'London: 12 October is not English, and neither is the second Monday of May or the second-last Monday of August');
check(H(2026, 12, 8, 'gb-eng') && H(2026, 6, 29, 'gb-eng'), 'London still reads Italy\'s days (the desk answers from Rome): 8 December, 29 June');
check(H(2026, 12, 7, 'it-mi') && !H(2026, 12, 7, 'it') && H(2026, 12, 8, 'it-mi') && H(2026, 6, 29, 'it-mi'),
  'Milan: Sant\'Ambrogio (7 December) on top of Italy — and 7 December is NOT a holiday for the Rome calendar');
check(H(2026, 8, 15, 'fr') && !H(2026, 7, 14, 'fr') && !H(2026, 10, 3, 'de'), 'an unknown key reads Italy alone (the desk answers from Rome), never an invented calendar');
check(CAL.workingDay(at('2026-10-27T12:00:00Z'), 'nl') && !CAL.workingDay(at('2026-10-31T12:00:00Z'), 'nl') && !CAL.workingDay(at('2026-04-27T12:00:00Z'), 'nl'),
  'workingDay: a Tuesday yes, a Saturday no, Koningsdag no');

// ── the window, in words, with the zone of the OPENING instant ───────────
check(line('2026-10-27T08:00:00Z', 'nl') === 'desk open until 19:00 CET', 'a Tuesday at 09:00 Rome: "desk open until 19:00 CET"');
check(line('2026-10-27T18:30:00Z', 'nl') === 'Tomorrow from 09:00 CET', 'a Tuesday at 19:30: "Tomorrow from 09:00"');
check(line('2026-10-27T06:00:00Z', 'nl') === 'Today from 09:00 CET', 'a Tuesday at 07:00: "Today from 09:00"');
check(line('2026-10-31T09:00:00Z', 'nl') === 'Monday from 09:00 CET', 'a Saturday: "Monday from 09:00"');
check(line('2026-10-25T10:00:00Z', 'nl') === 'Tomorrow from 09:00 CET', 'Sunday 25 October 2026 (clocks go back that night): "Tomorrow from 09:00 CET", never today\'s CEST');
check(line('2026-03-27T18:00:00Z', 'nl') === 'Monday from 09:00 CEST', 'Friday 27 March 2026 after hours: Monday is already CEST');
check(line('2026-04-26T10:00:00Z', 'nl') === 'Tuesday from 09:00 CEST' && line('2026-04-27T08:00:00Z', 'nl') === 'Tomorrow from 09:00 CEST', 'Koningsdag (Monday 27 April): on the Sunday the next open day is "Tuesday", on the day itself "Tomorrow"');
check(line('2026-09-11T08:00:00Z', 'es-bcn') === 'Monday from 09:00 CEST' && line('2026-09-11T08:00:00Z', 'es') === 'desk open until 19:00 CEST', 'the Diada closes the Barcelona desk, not the Madrid one');
check(line('2026-12-24T19:00:00Z', 'nl') === 'Monday from 09:00 CET', 'Christmas Eve 20:00: Christmas, Boxing Day, the weekend → Monday');
check(line('2026-12-31T19:00:00Z', 'it') === 'Monday from 09:00 CET', 'New Year\'s Eve 20:00 (Thursday): New Year, the weekend → Monday 4 January');
{
  const LON = { timeZone: 'Europe/London', hours: { from: '08:00', to: '18:00' }, days: [1, 2, 3, 4, 5] };
  const MIL = { timeZone: 'Europe/Rome', zoneName: 'Italian time', hours: { from: '09:00', to: '19:00' }, days: [1, 2, 3, 4, 5] };
  const lw = (iso, desk, key) => (CAL.deskWindow(at(iso), desk, key) || {}).line;
  check(lw('2026-08-31T10:00:00Z', LON, 'gb-eng') === 'Tomorrow from 08:00 BST', 'London, Monday 31 August 2026 11:00 (summer bank holiday): closed, "Tomorrow from 08:00 BST"');
  check(lw('2026-12-24T18:30:00Z', LON, 'gb-eng') === 'Tuesday from 08:00 GMT', 'London, Christmas Eve 18:30: Christmas (Fri), the weekend, Boxing Day moved to Monday 28 → "Tuesday from 08:00 GMT"');
  check(lw('2026-09-01T07:30:00Z', LON, 'gb-eng') === 'desk open until 18:00 BST' && lw('2026-11-02T12:00:00Z', LON, 'gb-eng') === 'desk open until 18:00 GMT', 'London open: "until 18:00 BST" in summer, "GMT" in winter — London time, never Rome\'s');
  check(lw('2026-03-27T18:00:00Z', LON, 'gb-eng') === 'Monday from 08:00 BST' && lw('2026-10-23T18:00:00Z', LON, 'gb-eng') === 'Monday from 08:00 GMT', 'London over the clock change: Friday after hours names Monday\'s zone (BST on 30 March, GMT on 26 October)');
  check(lw('2026-12-07T08:00:00Z', MIL, 'it-mi') === 'Wednesday from 09:00 CET' && lw('2026-12-07T08:00:00Z', MIL, 'it') === 'desk open until 19:00 CET', 'Milan, Monday 7 December 09:00: Sant\'Ambrogio and the Immacolata close it → "Wednesday from 09:00 CET" (the Rome calendar would be open)');
}
{
  const w = CAL.deskWindow(at('2026-10-27T08:00:00Z'), DESK, 'nl');
  check(w && w.open === true && w.until === '19:00' && w.tz === 'CET', 'an open window carries open/until/tz');
  const c = CAL.deskWindow(at('2026-10-31T09:00:00Z'), DESK, 'nl');
  check(c && c.open === false && c.day === 'Monday' && c.from === '09:00' && c.tz === 'CET', 'a closed window carries day/from/tz');
  check(CAL.deskWindow(at('2026-10-27T08:00:00Z'), null, 'nl') === null && CAL.deskWindow(at('2026-10-27T08:00:00Z'), { ...DESK, days: [] }, 'nl') === null, 'no desk, or a desk with no days: null, never an invented window');
  // v1.6: `wd` (0 = Sunday) is the weekday of the desk's NEXT open moment —
  // today when open, else the day it opens. The Departures board writes
  // "REPLY TODAY" / "REPLY MON" from it, so it must agree with the line.
  check(w.wd === 2 && c.wd === 1, 'wd: open on a Tuesday → 2 (today); closed on a Saturday → 1 (it opens Monday)', JSON.stringify([w.wd, c.wd]));
  const k = CAL.deskWindow(at('2026-04-27T08:00:00Z'), DESK, 'nl');
  check(k && k.open === false && k.day === 'Tomorrow' && k.wd === 2, 'wd on Koningsdag (Monday 27 April): "Tomorrow", and tomorrow is a Tuesday (2)', JSON.stringify(k));
  const f = CAL.deskWindow(at('2026-10-23T18:00:00Z'), DESK, 'nl');
  check(f && f.open === false && f.day === 'Monday' && f.wd === 1, 'wd on a Friday after hours: Monday (1)', JSON.stringify(f));
  const e = CAL.deskWindow(at('2026-10-27T05:00:00Z'), DESK, 'nl');
  check(e && e.open === false && e.day === 'Today' && e.wd === 2, 'wd early on a working day: "Today" from 09:00, and today is a Tuesday (2)', JSON.stringify(e));
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const probes = ['2026-01-01T09:00:00Z', '2026-04-03T09:00:00Z', '2026-06-06T12:00:00Z', '2026-12-24T19:00:00Z', '2026-12-31T23:30:00Z', '2027-03-28T01:30:00Z'];
  check(probes.every((iso) => { const x = CAL.deskWindow(at(iso), DESK, 'nl'); return x && Number.isInteger(x.wd) && x.wd >= 0 && x.wd <= 6 && DESK.days.includes(x.wd) && (x.open || ['Today', 'Tomorrow'].includes(x.day) || x.day === DAY[x.wd]); }),
    'wd is always a desk day, and a closed window\'s named day IS that weekday (New Year, Good Friday, a Saturday, Christmas Eve, New Year\'s Eve, the clock change)');
}

// ── one copy: the webhook imports it, the page inlines it ─────────────────
check(JSON.stringify(WEBHOOK_KEYS) === JSON.stringify(CAL.HOLIDAY_KEYS) && WEBHOOK_KEYS.join() === 'it,nl,es,es-bcn,gb-eng,it-mi', 'the webhook\'s calendar keys are the calendar\'s (it, nl, es, es-bcn, gb-eng, it-mi)');
check(CAL.HOLIDAY_KEYS.every((k) => Array.isArray(CAL.HOLIDAYS[k].fixed) && Array.isArray(CAL.HOLIDAYS[k].easter)), 'every calendar table carries its fixed and easter arrays (isHoliday reads both)');
{
  let same = true, n = 0;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 11, 31); t += 864e5) {
    for (const k of CAL.HOLIDAY_KEYS) { n++; if (webhookIsDeskHoliday(new Date(t), k) !== CAL.isDeskHoliday(new Date(t), k)) same = false; }
  }
  check(same, `the webhook's isDeskHoliday is the calendar's, day by day (${n} day × key pairs, 2026–2028)`);
  const src = fs.readFileSync(path.join(R, 'api/stripe-webhook.js'), 'utf8');
  check(/import DESK_CAL from '\.\.\/js\/desk-calendar\.js'/.test(src) && !/fixed:\s*\['01-01'/.test(src), 'the webhook imports the calendar and keeps no holiday table of its own');
}
{
  const inline = fragments(R).deskCalendar.replace(/^<script>\n/, '').replace(/\n<\/script>$/, '');
  const box = { window: {} };
  box.window = box;
  vm.runInNewContext(inline, box);
  const P = box.BOOM_DESK_CAL;
  check(!!P && typeof P.deskWindow === 'function', 'the copy the build inlines runs on its own and sets window.BOOM_DESK_CAL');
  const probes = ['2026-04-27T08:00:00Z', '2026-10-25T10:00:00Z', '2026-10-31T09:00:00Z', '2026-09-11T08:00:00Z', '2026-12-24T19:00:00Z', '2027-03-26T18:00:00Z', '2027-06-24T08:00:00Z'];
  probes.push('2026-08-31T10:00:00Z', '2026-12-24T18:30:00Z', '2026-12-07T08:00:00Z', '2027-12-24T19:00:00Z', '2027-12-31T19:00:00Z');
  const LONDESK = { timeZone: 'Europe/London', hours: { from: '08:00', to: '18:00' }, days: [1, 2, 3, 4, 5] };
  check(probes.every((iso) => CAL.HOLIDAY_KEYS.every((k) => [DESK, LONDESK].every((dk) => JSON.stringify(P.deskWindow(new Date(iso), dk, k)) === JSON.stringify(CAL.deskWindow(new Date(iso), dk, k))))),
    `the inlined copy answers exactly as the file (${probes.length} instants × ${CAL.HOLIDAY_KEYS.length} calendars × the Rome and London desks)`);
  // a runtime that prints "GMT+1" instead of a zone name (no full ICU): the
  // label comes from the offset, zone by zone — "+1" is CET in Rome and BST
  // in London, "+0" is GMT in London
  const RealDTF = Intl.DateTimeFormat;
  const offsetOf = (at, tz) => { const v = new RealDTF('en-GB', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((x) => x.type === 'timeZoneName').value; const m = /([+-])(\d\d)/.exec(v); return m ? (m[1] === '-' ? -1 : 1) * +m[2] : 0; };
  function FakeDTF(loc, opts) { this.real = new RealDTF(loc, opts); this.tz = opts && opts.timeZone; }
  FakeDTF.prototype.formatToParts = function (at) { return this.real.formatToParts(at).map((x) => x.type === 'timeZoneName' ? { type: x.type, value: 'GMT+' + offsetOf(at, this.tz) } : x); };
  const fbox = { Intl: { DateTimeFormat: FakeDTF } };
  fbox.window = fbox;
  vm.runInNewContext(inline, fbox);
  const F = fbox.BOOM_DESK_CAL;
  const fz = (iso, tz) => (F.zoneParts(new Date(iso), tz) || {}).tz;
  check(fz('2026-08-31T10:00:00Z', 'Europe/London') === 'BST' && fz('2026-12-24T18:30:00Z', 'Europe/London') === 'GMT' && fz('2026-08-31T10:00:00Z', 'Europe/Rome') === 'CEST' && fz('2026-12-24T18:30:00Z', 'Europe/Rome') === 'CET' && fz('2026-12-24T18:30:00Z') === 'CET',
    'a runtime printing "GMT+1"/"GMT+0": London reads BST/GMT, Rome CEST/CET — the offset is read zone by zone, never CET for London',
    [fz('2026-08-31T10:00:00Z', 'Europe/London'), fz('2026-12-24T18:30:00Z', 'Europe/London'), fz('2026-08-31T10:00:00Z', 'Europe/Rome'), fz('2026-12-24T18:30:00Z', 'Europe/Rome')].join(' '));
  check((F.deskWindow(new Date('2026-08-31T10:00:00Z'), LONDESK, 'gb-eng') || {}).line === 'Tomorrow from 08:00 BST', 'on that runtime the London window still says "Tomorrow from 08:00 BST"');
  for (const s of ['amsterdam', 'madrid', 'barcelona', 'paris', 'berlin', 'london', 'milan']) {
    const file = path.join(R, `${s}.html`), built = fs.existsSync(file);
    check(built && fs.readFileSync(file, 'utf8').includes(fragments(R).deskCalendar), `${s}.html carries the calendar byte for byte`, built ? 'stale: run npm run build:cities' : 'not built');
  }
}
// every desk that takes money names a calendar that exists
for (const [slug, m] of Object.entries(CITY_MARKETS)) {
  if (m.checkout === true) check(CAL.HOLIDAY_KEYS.includes(m.holidays || m.country), `${slug} sells: its calendar (${m.holidays || m.country}) exists — the withdrawal is never counted on Italy alone by accident`);
}
// a desk whose country is already a calendar ('it') would pass the check
// above with its own key forgotten: Milan without 'it-mi' silently loses
// Sant'Ambrogio, London without 'gb-eng' every bank holiday
check((CITY_MARKETS.london || {}).holidays === 'gb-eng', 'London names the England & Wales calendar (gb-eng)', String((CITY_MARKETS.london || {}).holidays));
check((CITY_MARKETS.milan || {}).holidays === 'it-mi', 'Milan names its own calendar (it-mi, with 7 December), never Italy alone', String((CITY_MARKETS.milan || {}).holidays));

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
