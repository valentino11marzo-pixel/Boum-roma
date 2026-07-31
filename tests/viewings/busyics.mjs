// tests/viewings/busyics.mjs — the operator's Google Workspace calendar
// inside the availability grid.
//
// The promise of _busyics.js: a real event on the operator's calendar removes
// the overlapping slots from every booking surface, WITHOUT ever blocking
// bookings when the calendar is unreachable, WITHOUT letting BOOM's own
// calendar copies block their own reschedule, and WITHOUT external events
// eating the maxPerDay budget. All of that is behavior worth pinning.
//
// Run: node tests/viewings/busyics.mjs

import { readFileSync } from 'node:fs';
import { buildSlots } from '../../api/viewings/_avail.js';
import {
  parseVevents, parseIcsTime, zonedToEpoch,
  icsBusy, busyIcsUrls, externalBusy, clearIcsCache,
} from '../../api/viewings/_busyics.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

// Same stage as tests/viewings/avail.mjs: Mon–Fri 10:00–13:00 Rome, 45' visits.
const CFG = {
  windows: { 1: [['10:00', '13:00']], 2: [['10:00', '13:00']], 3: [['10:00', '13:00']], 4: [['10:00', '13:00']], 5: [['10:00', '13:00']] },
  slotMinutes: { person: 45, video: 20 },
  minNoticeHours: 0,
  horizonDays: 7,
  maxPerDay: 6,
};
// Monday 2026-08-03, 06:00 UTC (08:00 Rome)
const NOW = new Date('2026-08-03T06:00:00Z');
const WIN_S = NOW.getTime() - 86400000;
const WIN_E = NOW.getTime() + 16 * 86400000;

const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const vevent = (...lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const gridWith = (text, mode = 'person') =>
  buildSlots(CFG, icsBusy(text, WIN_S, WIN_E).map(([s, e]) => [s, e, null]), mode, NOW);
const times = (slots, date) => {
  const d = slots.find(x => x.date === date);
  return d ? d.times.map(t => t.label) : null;   // null = the whole day is gone
};

// ── 1. zone math (the foundation everything sits on) ───────────────────────
{
  ok('Rome winter is UTC+1', zonedToEpoch(2026, 1, 15, 10, 0, 0, 'Europe/Rome') === Date.UTC(2026, 0, 15, 9, 0, 0));
  ok('Rome summer is UTC+2', zonedToEpoch(2026, 8, 3, 10, 0, 0, 'Europe/Rome') === Date.UTC(2026, 7, 3, 8, 0, 0));
  ok('an unknown TZID falls back to Rome, not to a crash',
    zonedToEpoch(2026, 8, 3, 10, 0, 0, 'Not/AZone') === Date.UTC(2026, 7, 3, 8, 0, 0));
}

// ── 2. a plain busy event removes the overlapping slots ───────────────────
{
  // Monday 10:30–11:30 Rome (08:30–09:30Z): with the 15' gap only 12:15 survives
  const t = ics(vevent('UID:meet-1@gmail.com', 'DTSTART:20260803T083000Z', 'DTEND:20260803T093000Z', 'SUMMARY:Notaio'));
  ok('overlapping slots disappear', String(times(gridWith(t), '2026-08-03')) === '12:15', String(times(gridWith(t), '2026-08-03')));
  ok('other days are untouched', String(times(gridWith(t), '2026-08-04')) === '10:00,10:45,11:30,12:15');
}

// ── 3. TZID wall-clock times, quoted TZID, DURATION, folded lines ─────────
{
  const t = ics(vevent('UID:tz-1@x', 'DTSTART;TZID=Europe/Rome:20260804T100000', 'DTEND;TZID=Europe/Rome:20260804T110000'));
  ok('a TZID event blocks at the right wall-clock', String(times(gridWith(t), '2026-08-04')) === '11:30,12:15', String(times(gridWith(t), '2026-08-04')));

  const q = parseVevents('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID="Europe/Rome":20260804T100000\r\nEND:VEVENT\r\nEND:VCALENDAR')[0];
  ok('a quoted TZID is unwrapped', q.DTSTART.params.TZID === 'Europe/Rome', q.DTSTART.params.TZID);

  const dur = ics(vevent('UID:dur-1@x', 'DTSTART;TZID=Europe/Rome:20260804T100000', 'DURATION:PT1H'));
  ok('DURATION works when DTEND is absent', String(times(gridWith(dur), '2026-08-04')) === '11:30,12:15');

  // RFC 5545 line folding: the property survives being split mid-word
  const folded = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:folded-1@x\r\nDTSTART:2026\r\n 0803T083000Z\r\nDTEND:20260803T093000Z\r\nSUMMARY:A very long tit\r\n\tle that was folded\r\nEND:VEVENT\r\nEND:VCALENDAR';
  ok('folded lines are unfolded before parsing', String(times(gridWith(folded), '2026-08-03')) === '12:15');
}

// ── 4. "free" and cancelled events never block ─────────────────────────────
{
  const free = ics(vevent('UID:f@x', 'DTSTART:20260804T080000Z', 'DTEND:20260804T090000Z', 'TRANSP:TRANSPARENT'));
  ok('TRANSP:TRANSPARENT does not block', String(times(gridWith(free), '2026-08-04')) === '10:00,10:45,11:30,12:15');
  const canc = ics(vevent('UID:c@x', 'DTSTART:20260804T080000Z', 'DTEND:20260804T090000Z', 'STATUS:CANCELLED'));
  ok('STATUS:CANCELLED does not block', String(times(gridWith(canc), '2026-08-04')) === '10:00,10:45,11:30,12:15');
}

// ── 5. all-day events: a busy day closes, a "free" birthday does not ──────
{
  const busy = ics(vevent('UID:trip@x', 'DTSTART;VALUE=DATE:20260805', 'DTEND;VALUE=DATE:20260806', 'TRANSP:OPAQUE'));
  ok('an all-day BUSY event closes the whole Rome day', times(gridWith(busy), '2026-08-05') === null);
  ok('the day after a one-day event is open', String(times(gridWith(busy), '2026-08-06')) === '10:00,10:45,11:30,12:15');
  const bday = ics(vevent('UID:bday@x', 'DTSTART;VALUE=DATE:20260805', 'DTEND;VALUE=DATE:20260806', 'TRANSP:TRANSPARENT'));
  ok('an all-day "free" event (Google default) does not', String(times(gridWith(bday), '2026-08-05')) === '10:00,10:45,11:30,12:15');
}

// ── 6. BOOM's own calendar copies are ignored ──────────────────────────────
{
  // the invite UID (boom-viewing-…) and the client .ics UID (viewing-…):
  // Firestore is the truth for those; without the filter a viewing's calendar
  // copy would block its own reschedule
  const t = ics(
    vevent('UID:boom-viewing-abc123@boomrome.com', 'DTSTART:20260803T083000Z', 'DTEND:20260803T093000Z'),
    vevent('UID:viewing-abc123@boomrome.com', 'DTSTART:20260803T100000Z', 'DTEND:20260803T110000Z'),
    vevent('UID:boom-task-task_m_ff@boomrome.com', 'DTSTART:20260803T060000Z', 'DTEND:20260803T063000Z'),
  );
  ok('BOOM UIDs never block', String(times(gridWith(t), '2026-08-03')) === '10:00,10:45,11:30,12:15');
}

// ── 7. recurrences, expanded inside the horizon ────────────────────────────
{
  // every Tue+Thu 11:00–12:00 Rome, series started weeks before the window
  const weekly = ics(vevent('UID:w@x', 'DTSTART;TZID=Europe/Rome:20260707T110000', 'DTEND;TZID=Europe/Rome:20260707T120000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH'));
  ok('weekly BYDAY blocks this week\'s Tuesday', String(times(gridWith(weekly), '2026-08-04')) === '10:00,12:15', String(times(gridWith(weekly), '2026-08-04')));
  ok('…and Thursday', String(times(gridWith(weekly), '2026-08-06')) === '10:00,12:15');
  ok('…but not Wednesday', String(times(gridWith(weekly), '2026-08-05')) === '10:00,10:45,11:30,12:15');

  const exdated = ics(vevent('UID:w@x', 'DTSTART;TZID=Europe/Rome:20260707T110000', 'DTEND;TZID=Europe/Rome:20260707T120000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH', 'EXDATE;TZID=Europe/Rome:20260806T110000'));
  ok('EXDATE frees that one instance', String(times(gridWith(exdated), '2026-08-06')) === '10:00,10:45,11:30,12:15');
  ok('EXDATE leaves the others blocked', String(times(gridWith(exdated), '2026-08-04')) === '10:00,12:15');

  const until = ics(vevent('UID:u@x', 'DTSTART;TZID=Europe/Rome:20260707T110000', 'DTEND;TZID=Europe/Rome:20260707T120000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260805T000000Z'));
  ok('UNTIL stops the series', String(times(gridWith(until), '2026-08-06')) === '10:00,10:45,11:30,12:15');
  ok('…after its last instance', String(times(gridWith(until), '2026-08-04')) === '10:00,12:15');

  const count = ics(vevent('UID:n@x', 'DTSTART;TZID=Europe/Rome:20260804T110000', 'DTEND;TZID=Europe/Rome:20260804T120000', 'RRULE:FREQ=DAILY;COUNT=2'));
  ok('COUNT=2 blocks two days', String(times(gridWith(count), '2026-08-04')) === '10:00,12:15' && String(times(gridWith(count), '2026-08-05')) === '10:00,12:15');
  ok('…and not the third', String(times(gridWith(count), '2026-08-06')) === '10:00,10:45,11:30,12:15');

  // a moved instance (RECURRENCE-ID): the original slot frees up, the new one blocks
  const movedT = ics(
    vevent('UID:m@x', 'DTSTART;TZID=Europe/Rome:20260707T110000', 'DTEND;TZID=Europe/Rome:20260707T120000', 'RRULE:FREQ=WEEKLY;BYDAY=TU'),
    vevent('UID:m@x', 'RECURRENCE-ID;TZID=Europe/Rome:20260804T110000', 'DTSTART;TZID=Europe/Rome:20260804T121500', 'DTEND;TZID=Europe/Rome:20260804T131500'),
  );
  ok('a moved instance frees its old slot and blocks the new one',
    String(times(gridWith(movedT), '2026-08-04')) === '10:00,10:45', String(times(gridWith(movedT), '2026-08-04')));

  // the wall-clock survives the October DST change (Mon 10:00 Rome stays 10:00 Rome)
  const dst = ics(vevent('UID:d@x', 'DTSTART;TZID=Europe/Rome:20261019T100000', 'DTEND;TZID=Europe/Rome:20261019T110000', 'RRULE:FREQ=WEEKLY'));
  const blocks = icsBusy(dst, Date.UTC(2026, 9, 18), Date.UTC(2026, 9, 28));
  ok('weekly across DST: CEST instance at 08:00Z', blocks.some(([s]) => s === Date.UTC(2026, 9, 19, 8, 0)));
  ok('weekly across DST: CET instance at 09:00Z', blocks.some(([s]) => s === Date.UTC(2026, 9, 26, 9, 0)));

  // an exotic rule degrades to its first instance, never to a crash
  const exotic = ics(vevent('UID:e@x', 'DTSTART:20260804T080000Z', 'DTEND:20260804T090000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU'));
  ok('unsupported RRULE still blocks its first instance', String(times(gridWith(exotic), '2026-08-04')) === '11:30,12:15');
}

// ── 8. external events do not consume maxPerDay ────────────────────────────
{
  // six busy blocks on Monday afternoon (outside the windows). As VIEWINGS
  // they would close the day via maxPerDay — as external events they must not.
  const asViewings = Array.from({ length: 6 }, (_, i) => {
    const s = Date.UTC(2026, 7, 3, 12, 0) + i * 3600000;
    return [s, s + 1800000, '2026-08-03'];
  });
  ok('sanity: six VIEWINGS close the day', !buildSlots(CFG, asViewings, 'person', NOW).some(d => d.date === '2026-08-03'));
  const external = asViewings.map(([s, e]) => [s, e, null]);
  ok('six EXTERNAL events leave the day open', String(times(buildSlots(CFG, external, 'person', NOW), '2026-08-03')) === '10:00,10:45,11:30,12:15');
}

// ── 9. config: env + settings doc, https only, deduped ────────────────────
{
  process.env.BUSY_ICS_URLS = 'https://calendar.google.com/calendar/ical/v%40boom-rome.com/private-abc/basic.ics, http://insecure.example/cal.ics';
  const urls = busyIcsUrls({ busyIcs: ['https://calendar.google.com/calendar/ical/v%40boom-rome.com/private-abc/basic.ics', 'https://other.example/team.ics'] });
  ok('env and settings merge, deduped', urls.length === 2, JSON.stringify(urls));
  ok('plain http is refused (the URL is a credential)', !urls.some(u => u.startsWith('http:')));
  delete process.env.BUSY_ICS_URLS;
  ok('no config → no urls → no fetch', busyIcsUrls({}).length === 0 && busyIcsUrls(null).length === 0);
}

// ── 10. fetch: cache, stale-on-error, strict fail-open ────────────────────
{
  const cfg = { ...CFG, busyIcs: 'https://cal.example/secret.ics' };
  const text = ics(vevent('UID:x@y', 'DTSTART:20260803T083000Z', 'DTEND:20260803T093000Z'));
  let calls = 0;
  const okFetch = async () => { calls++; return { ok: true, status: 200, text: async () => text }; };

  clearIcsCache();
  const b1 = await externalBusy(cfg, NOW, okFetch);
  ok('fetches, parses, tags dateKey null', b1.length === 1 && b1[0][2] === null, JSON.stringify(b1));
  await externalBusy(cfg, NOW, okFetch);
  ok('a second read inside 2\' hits the cache', calls === 1, String(calls));

  const failFetch = async () => { throw new Error('gcal down'); };
  const later = new Date(NOW.getTime() + 3 * 60000);
  const b3 = await externalBusy(cfg, later, failFetch);
  ok('a fetch failure reuses the last good reading', b3.length === 1);

  clearIcsCache();
  const b4 = await externalBusy(cfg, later, failFetch);
  ok('no cache + failure = empty, never a throw', Array.isArray(b4) && b4.length === 0);

  clearIcsCache();
  const htmlFetch = async () => ({ ok: true, status: 200, text: async () => '<html>login required</html>' });
  ok('an HTML login page is not a calendar', (await externalBusy(cfg, NOW, htmlFetch)).length === 0);

  clearIcsCache();
}

// ── 11. the wiring: busyBlocks actually reads the external calendar ───────
{
  const src = readFileSync(new URL('../../api/viewings/_avail.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function busyBlocks'));
  ok('busyBlocks merges externalBusy into the grid', /externalBusy\(/.test(body));
}

console.log(fails ? `\n${fails} FAILED` : '\nAll green.');
process.exit(fails ? 1 : 0);
