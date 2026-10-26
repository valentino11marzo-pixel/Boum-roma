// tests/cities/calendar.mjs — the desk calendar (js/desk-calendar.js), ONE
// copy read by the payment webhook (the end of the 14-day withdrawal, the day
// the work starts) and by the city pages (the desk window under the door).
//
// What breaks if this goes red:
//   - the page says "desk open" on Koningsdag, the Diada or Christmas, or the
//     webhook counts a working day the desk does not work (the payer's right
//     to withdraw ends a day early — or the work starts a day late);
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
  const w = CAL.deskWindow(at('2026-10-27T08:00:00Z'), DESK, 'nl');
  check(w && w.open === true && w.until === '19:00' && w.tz === 'CET', 'an open window carries open/until/tz');
  const c = CAL.deskWindow(at('2026-10-31T09:00:00Z'), DESK, 'nl');
  check(c && c.open === false && c.day === 'Monday' && c.from === '09:00' && c.tz === 'CET', 'a closed window carries day/from/tz');
  check(CAL.deskWindow(at('2026-10-27T08:00:00Z'), null, 'nl') === null && CAL.deskWindow(at('2026-10-27T08:00:00Z'), { ...DESK, days: [] }, 'nl') === null, 'no desk, or a desk with no days: null, never an invented window');
}

// ── one copy: the webhook imports it, the page inlines it ─────────────────
check(JSON.stringify(WEBHOOK_KEYS) === JSON.stringify(CAL.HOLIDAY_KEYS) && WEBHOOK_KEYS.join() === 'it,nl,es,es-bcn', 'the webhook\'s calendar keys are the calendar\'s (it, nl, es, es-bcn)');
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
  check(probes.every((iso) => CAL.HOLIDAY_KEYS.every((k) => JSON.stringify(P.deskWindow(new Date(iso), DESK, k)) === JSON.stringify(CAL.deskWindow(new Date(iso), DESK, k)))),
    `the inlined copy answers exactly as the file (${probes.length} instants × ${CAL.HOLIDAY_KEYS.length} calendars)`);
  for (const s of ['amsterdam', 'madrid', 'barcelona', 'paris', 'berlin']) {
    const html = fs.readFileSync(path.join(R, `${s}.html`), 'utf8');
    check(html.includes(fragments(R).deskCalendar), `${s}.html carries the calendar byte for byte`);
  }
}
// every desk that takes money names a calendar that exists
for (const [slug, m] of Object.entries(CITY_MARKETS)) {
  if (m.checkout === true) check(CAL.HOLIDAY_KEYS.includes(m.holidays || m.country), `${slug} sells: its calendar (${m.holidays || m.country}) exists — the withdrawal is never counted on Italy alone by accident`);
}

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
