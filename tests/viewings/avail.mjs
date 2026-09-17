// tests/viewings/avail.mjs — the availability engine and the manage link.
//
// Three surfaces (the public booking page, the client's reschedule page, the
// operator's Telegram picker) read the SAME grid. If it drifts, one of them
// offers a slot the server then refuses — so the rules get tested, not trusted.
//
// Run: node tests/viewings/avail.mjs

import { readFileSync } from 'node:fs';
import { buildSlots, slotOffered, romeDateKey, romeParts, GAP_MINUTES } from '../../api/viewings/_avail.js';
import { manageRef, parseManageRef, manageToken, videoRoom } from '../../api/viewings/_lib.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

// A Monday-to-Friday config, 10:00–13:00 Rome, 45' visits, no notice needed.
const CFG = {
  windows: { 1: [['10:00', '13:00']], 2: [['10:00', '13:00']], 3: [['10:00', '13:00']], 4: [['10:00', '13:00']], 5: [['10:00', '13:00']] },
  slotMinutes: { person: 45, video: 20 },
  minNoticeHours: 0,
  horizonDays: 7,
  maxPerDay: 6,
};
// Monday 2026-08-03, 06:00 UTC (08:00 Rome — before the first window)
const NOW = new Date('2026-08-03T06:00:00Z');
const flat = slots => slots.flatMap(d => d.times.map(t => t.iso));

// ── 1. the grid itself ─────────────────────────────────────────────────────
{
  const slots = buildSlots(CFG, [], 'person', NOW);
  ok('produces days', slots.length >= 5, `got ${slots.length}`);
  const mon = slots.find(d => d.date === '2026-08-03');
  ok('Monday is open', !!mon);
  // 10:00→13:00 in 45' steps = 10:00, 10:45, 11:30, 12:15 (13:00 would overrun)
  ok('45-minute steps fill the window', mon && mon.times.length === 4, mon && String(mon.times.length));
  ok('first slot is 10:00 Rome', mon && mon.times[0].label === '10:00', mon && mon.times[0].label);
  ok('no slot overruns the window', mon && mon.times.every(t => new Date(t.iso).getTime() + 45 * 60000 <= new Date('2026-08-03T11:00:00Z').getTime()));
  ok('weekend is closed', !slots.some(d => ['2026-08-08', '2026-08-09'].includes(d.date)));
}

// ── 2. a booked slot disappears — for everyone, with the travel gap ────────
{
  const busyStart = new Date('2026-08-03T08:45:00Z').getTime();   // 10:45 Rome
  const busy = [[busyStart, busyStart + 45 * 60000, '2026-08-03']];
  const mon = buildSlots(CFG, busy, 'person', NOW).find(d => d.date === '2026-08-03');
  const labels = mon.times.map(t => t.label);
  ok('the taken slot is gone', !labels.includes('10:45'), labels.join(','));
  // 10:00 ends at 10:45, which is < 15' before the busy block starts
  ok('the 15-minute gap is respected before', !labels.includes('10:00'), labels.join(','));
  ok('a slot beyond the gap survives', labels.includes('12:15'), labels.join(','));
  ok('gap constant is 15', GAP_MINUTES === 15);
}

// ── 3. video slots are shorter, so more of them fit ────────────────────────
{
  const person = buildSlots(CFG, [], 'person', NOW).find(d => d.date === '2026-08-03').times.length;
  const video = buildSlots(CFG, [], 'video', NOW).find(d => d.date === '2026-08-03').times.length;
  ok('video fits more slots than in person', video > person, `${video} vs ${person}`);
}

// ── 4. minimum notice and horizon ─────────────────────────────────────────
{
  const cfg = { ...CFG, minNoticeHours: 26 };
  const slots = buildSlots(cfg, [], 'person', NOW);
  ok('nothing inside the notice window', !slots.some(d => d.date === '2026-08-03'));
  ok('the day after the notice is bookable', slots.some(d => d.date === '2026-08-04'));

  const short = buildSlots({ ...CFG, horizonDays: 2 }, [], 'person', NOW);
  ok('horizon is honoured', short.every(d => d.date <= '2026-08-05'), short.map(d => d.date).join(','));
}

// ── 5. maxPerDay closes a day entirely ────────────────────────────────────
{
  const busy = Array.from({ length: 6 }, (_, i) => {
    const s = new Date('2026-08-03T08:00:00Z').getTime() + i * 3600000;
    return [s, s + 45 * 60000, '2026-08-03'];
  });
  const slots = buildSlots({ ...CFG, maxPerDay: 6 }, busy, 'person', NOW);
  ok('a full day is removed', !slots.some(d => d.date === '2026-08-03'));
}

// ── 6. slotOffered — what the server re-checks on POST ────────────────────
{
  const slots = buildSlots(CFG, [], 'person', NOW);
  const first = flat(slots)[0];
  ok('an offered instant validates', slotOffered(slots, first));
  ok('a Date validates the same as its ISO', slotOffered(slots, new Date(first)));
  ok('an unoffered instant is refused', !slotOffered(slots, '2026-08-03T23:00:00.000Z'));
}

// ── 7. Rome calendar day, across the DST boundary ─────────────────────────
{
  // 23:30 UTC in summer is already the NEXT day in Rome (UTC+2)
  ok('summer: Rome day rolls over before UTC', romeDateKey(new Date('2026-08-03T22:30:00Z')) === '2026-08-04',
    romeDateKey(new Date('2026-08-03T22:30:00Z')));
  // in winter Rome is UTC+1
  ok('winter: 23:30 UTC is still the same Rome day', romeDateKey(new Date('2026-01-15T22:30:00Z')) === '2026-01-15',
    romeDateKey(new Date('2026-01-15T22:30:00Z')));
  // the grid must not shift by an hour across the October change
  const cfgW = { ...CFG, windows: { 0: [['10:00', '11:00']], 1: [['10:00', '11:00']], 2: [['10:00', '11:00']], 3: [['10:00', '11:00']], 4: [['10:00', '11:00']], 5: [['10:00', '11:00']], 6: [['10:00', '11:00']] } };
  const around = buildSlots(cfgW, [], 'video', new Date('2026-10-24T06:00:00Z'));  // DST ends Oct 25
  ok('every slot reads 10:00 Rome across the DST change',
    around.every(d => d.times[0].label === '10:00'),
    around.map(d => d.date + ':' + d.times[0].label).join(' '));
}

// ── 8. the client's link is a real credential ─────────────────────────────
{
  process.env.HOMIE_SECRET = 'test-secret-for-the-viewing-link';
  const ref = manageRef('abc123XYZ');
  ok('ref round-trips', parseManageRef(ref) === 'abc123XYZ', ref);
  ok('a tampered token is rejected', parseManageRef('abc123XYZ.' + 'f'.repeat(24)) === null);
  ok('a wrong-length token is rejected', parseManageRef('abc123XYZ.short') === null);
  ok('a bare id is rejected', parseManageRef('abc123XYZ') === null);
  ok('no separator is rejected', parseManageRef('') === null);
  ok('a trailing dot is rejected', parseManageRef('abc123XYZ.') === null);
  ok('the token is not the id', manageToken('abc123XYZ') !== 'abc123XYZ');
  ok('the token is stable', manageToken('abc123XYZ') === manageToken('abc123XYZ'));
  ok('different viewings get different tokens', manageToken('a') !== manageToken('b'));
  // a doc id containing a dot must still round-trip (lastIndexOf, not indexOf)
  ok('a dotted id round-trips', parseManageRef(manageRef('deal.2026.07')) === 'deal.2026.07');
  // rotating the secret revokes every link at once
  const before = manageToken('abc123XYZ');
  process.env.HOMIE_SECRET = 'rotated';
  ok('rotating the secret invalidates old links', manageToken('abc123XYZ') !== before);
  ok('the video room is not derivable from the id alone', videoRoom('abc123XYZ') !== videoRoom('abc123XYy'));
}

// ── 9. Numeric Rome dates, independent of ICU's short-month vocabulary ────
{
  const everyDay = {
    ...CFG, horizonDays: 1,
    windows: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, [['10:00', '11:00']]])),
  };
  for (let month = 1; month <= 12; month++) {
    const key = `2026-${String(month).padStart(2, '0')}-15`;
    const now = new Date(`${key}T06:00:00Z`);
    const rows = buildSlots(everyDay, [], 'video', now);
    const day = rows.find(row => row.date === key);
    const firstUtc = month >= 4 && month <= 10 ? '08:00' : '09:00';
    ok(`month ${month}: exact calendar key`, romeDateKey(now) === key, romeDateKey(now));
    ok(`month ${month}: an available day has real slots`, day?.times.length === 3
      && day.times[0].iso === `${key}T${firstUtc}:00.000Z`, JSON.stringify(day));
    // Display remains locale-formatted; arithmetic no longer consumes it.
    const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short' }).format(now);
    ok(`month ${month}: display label is preserved`, day?.label === label, day?.label);
  }

  const boundaries = [
    ['2026-01-15T22:59:59Z', '2026-01-15'], ['2026-01-15T23:00:00Z', '2026-01-16'],
    ['2026-03-28T22:59:59Z', '2026-03-28'], ['2026-03-28T23:00:00Z', '2026-03-29'],
    ['2026-03-29T00:59:59Z', '2026-03-29'], ['2026-03-29T01:00:00Z', '2026-03-29'],
    ['2026-03-29T21:59:59Z', '2026-03-29'], ['2026-03-29T22:00:00Z', '2026-03-30'],
    ['2026-09-30T21:59:59Z', '2026-09-30'], ['2026-09-30T22:00:00Z', '2026-10-01'],
    ['2026-10-24T21:59:59Z', '2026-10-24'], ['2026-10-24T22:00:00Z', '2026-10-25'],
    ['2026-10-25T00:59:59Z', '2026-10-25'], ['2026-10-25T01:00:00Z', '2026-10-25'],
    ['2026-10-25T22:59:59Z', '2026-10-25'], ['2026-10-25T23:00:00Z', '2026-10-26'],
    ['2026-12-31T22:59:59Z', '2026-12-31'], ['2026-12-31T23:00:00Z', '2027-01-01'],
    ['2028-02-28T23:00:00Z', '2028-02-29'],
  ];
  for (const [instant, expected] of boundaries) {
    ok(`Rome midnight/DST: ${instant}`, romeDateKey(new Date(instant)) === expected,
      romeDateKey(new Date(instant)));
  }
  for (const [date, hourUtc] of [
    ['2026-03-28', '09'], ['2026-03-29', '08'], ['2026-03-30', '08'],
    ['2026-10-24', '08'], ['2026-10-25', '09'], ['2026-10-26', '09'],
  ]) {
    const day = buildSlots(everyDay, [], 'video', new Date(`${date}T06:00:00Z`)).find(row => row.date === date);
    ok(`DST grid ${date}: 10:00 Rome has the correct UTC instant`, day?.times[0].label === '10:00'
      && day.times[0].iso === `${date}T${hourUtc}:00:00.000Z`, JSON.stringify(day));
  }
  const september = new Date('2026-09-17T06:00:00Z');
  const busyStart = new Date('2026-09-17T14:00:00Z').getTime(); // outside the morning window
  const busy = [[busyStart, busyStart + 45 * 60000, romeDateKey(new Date(busyStart))]];
  ok('September maxPerDay uses the same key as actual viewings',
    !buildSlots({ ...everyDay, maxPerDay: 1 }, busy, 'video', september).some(row => row.date === '2026-09-17'));
  const nativeMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', month: 'short' }).format(september);
  ok('romeParts preserves its public short-month display', romeParts(september).month === nativeMonth);

  // Exercise the real module under the ICU spelling that exposed the bug,
  // including on older runtimes which still return "Sep". All calendar
  // calculations remain native Intl; only that localized label is varied.
  const moduleUrl = new URL('../../api/viewings/_avail.js', import.meta.url);
  const source = readFileSync(moduleUrl, 'utf8');
  const spelling = `const Intl = { DateTimeFormat: class extends globalThis.Intl.DateTimeFormat {
    formatToParts(date) { return super.formatToParts(date).map(p =>
      p.type === 'month' && this.resolvedOptions().month === 'short' && p.value === 'Sep'
        ? { ...p, value: 'Sept' } : p); }
  } };\n`;
  const loadVariant = async text => import('data:text/javascript;base64,' + Buffer.from(spelling
    + text.replace(/from '(\.\.?\/[^']+)'/g, (_, specifier) => `from '${new URL(specifier, moduleUrl).href}'`)).toString('base64'));
  const variant = await loadVariant(source);
  ok('ICU Sept variant: calendar key and open grid stay valid',
    variant.romeDateKey(september) === '2026-09-17'
    && variant.buildSlots(everyDay, [], 'video', september).some(row => row.date === '2026-09-17'));

  const legacyMonth = "['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(p.month) + 1";
  const mutations = [
    { name: 'date key parses localized month labels',
      from: "const p = romeCalendarParts(date);\n  return `${p.year}-${p.month}-${p.day}`;",
      to: "const p = romeParts(date);\n  const mo = " + legacyMonth + ";\n  return `${p.year}-${String(mo).padStart(2, '0')}-${p.day}`;",
      survives: m => m.romeDateKey(september) === '2026-09-17' },
    { name: 'slot grid parses localized month labels',
      from: 'const p = romeCalendarParts(probe);\n    const y = +p.year, mo = +p.month, d = +p.day;',
      to: 'const p = romeParts(probe);\n    const y = +p.year, mo = ' + legacyMonth + ', d = +p.day;',
      survives: m => m.buildSlots(everyDay, [], 'video', september).some(row => row.date === '2026-09-17') },
  ];
  for (const mutation of mutations) {
    if (!source.includes(mutation.from)) throw new Error('mutation_target_missing: ' + mutation.name);
    const mutant = await loadVariant(source.replace(mutation.from, mutation.to));
    ok('mutation detected: ' + mutation.name, !mutation.survives(mutant));
  }
  console.log(`     ↳ date regression runtime ${process.version}, ICU ${process.versions.icu}, native September label ${nativeMonth}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nAll green.');
process.exit(fails ? 1 : 0);
