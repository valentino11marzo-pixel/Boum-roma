// tests/viewings/gap.mjs — the day's geometry inside the booking grid.
//
// The flat 15-minute gap treated Rome as a point. travelGapMinutes makes the
// grid tell the truth about the city: same-apartment showings CHAIN (three
// clients, one trip), cross-town consecutive visits spread by real travel
// time, and video calls never pretend to need a scooter. Legacy blocks with
// no location keep the exact old behavior — pinned here so it stays true.
//
// Run: node tests/viewings/gap.mjs

import { buildSlots, travelGapMinutes, GAP_MINUTES, SAME_LISTING_GAP_MINUTES, MAX_TRAVEL_GAP_MINUTES } from '../../api/viewings/_avail.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

// Rome landmarks (real coords, rounded)
const TRASTEVERE = { lat: 41.8891, lng: 12.4695 };
const PARIOLI = { lat: 41.9302, lng: 12.4883 };
const OSTIA = { lat: 41.7316, lng: 12.2766 };

// ── 1. the gap function itself ─────────────────────────────────────────────
{
  ok('nothing known → the old flat gap', travelGapMinutes(null, null) === GAP_MINUTES);
  ok('one side unknown → flat gap', travelGapMinutes({ listingId: 'a' }, undefined) === GAP_MINUTES);
  ok('no coords, different listings → flat gap',
    travelGapMinutes({ listingId: 'a' }, { listingId: 'b' }) === GAP_MINUTES);
  ok('same listing chains back-to-back',
    travelGapMinutes({ listingId: 'a', mode: 'person' }, { listingId: 'a', mode: 'person' }) === SAME_LISTING_GAP_MINUTES
    && SAME_LISTING_GAP_MINUTES === 0);
  ok('video needs no scooter',
    travelGapMinutes({ listingId: 'a', mode: 'video', ...TRASTEVERE }, { listingId: 'b', mode: 'person', ...OSTIA }) === GAP_MINUTES);

  const cross = travelGapMinutes({ listingId: 'a', mode: 'person', ...TRASTEVERE }, { listingId: 'b', mode: 'person', ...PARIOLI });
  ok('Trastevere→Parioli costs more than 15 minutes', cross > GAP_MINUTES, String(cross));
  ok('…but stays a sane city estimate', cross <= MAX_TRAVEL_GAP_MINUTES, String(cross));

  const far = travelGapMinutes({ listingId: 'a', mode: 'person', ...TRASTEVERE }, { listingId: 'b', mode: 'person', ...OSTIA });
  ok('a genuinely far pair hits the cap', far === MAX_TRAVEL_GAP_MINUTES, String(far));
  ok('the gap is symmetric',
    cross === travelGapMinutes({ listingId: 'b', mode: 'person', ...PARIOLI }, { listingId: 'a', mode: 'person', ...TRASTEVERE }));
}

// ── 2. the grid: clustering at the same door ───────────────────────────────
const CFG = {
  windows: { 1: [['10:00', '13:00']] },
  slotMinutes: { person: 45, video: 20 },
  minNoticeHours: 0, horizonDays: 7, maxPerDay: 6,
};
const NOW = new Date('2026-08-03T06:00:00Z');                 // Monday 08:00 Rome
const monTimes = (busy, ctx) => {
  const d = buildSlots(CFG, busy, 'person', NOW, ctx).find(x => x.date === '2026-08-03');
  return d ? d.times.map(t => t.label) : [];
};

{
  // an existing 10:00–10:45 viewing at listing A
  const s = Date.UTC(2026, 7, 3, 8, 0);
  const busy = [[s, s + 45 * 60000, '2026-08-03', { listingId: 'A', mode: 'person', ...TRASTEVERE }]];

  ok('same listing: the next slot chains at 10:45',
    String(monTimes(busy, { listingId: 'A', ...TRASTEVERE })) === '10:45,11:30,12:15',
    String(monTimes(busy, { listingId: 'A', ...TRASTEVERE })));

  ok('different listing, no coords: the old 15\' gap holds',
    String(monTimes(busy, { listingId: 'B' })) === '11:30,12:15',
    String(monTimes(busy, { listingId: 'B' })));

  ok('no ctx (legacy caller): identical to the old grid',
    String(monTimes(busy, null)) === '11:30,12:15');

  // A 30' viewing ending 10:30 leaves 15' before the 10:45 slot: enough for
  // the flat gap, NOT enough to get back from Ostia. This is exactly the case
  // the flat gap got wrong — the operator was sold a slot they cannot reach.
  const short = [[s, s + 30 * 60000, '2026-08-03', { listingId: 'A', mode: 'person', ...TRASTEVERE }]];
  ok('15\' of air is enough for a nearby listing',
    String(monTimes(short, { listingId: 'B' })) === '10:45,11:30,12:15',
    String(monTimes(short, { listingId: 'B' })));
  ok('…but not enough to reach Ostia',
    String(monTimes(short, { listingId: 'C', ...OSTIA })) === '11:30,12:15',
    String(monTimes(short, { listingId: 'C', ...OSTIA })));

  // legacy block without meta + ctx present → flat gap, not a crash
  const legacy = [[s, s + 45 * 60000, '2026-08-03']];
  ok('a legacy block without meta keeps the flat gap',
    String(monTimes(legacy, { listingId: 'A', ...TRASTEVERE })) === '11:30,12:15');
}

console.log(fails ? `\n${fails} FAILED` : '\nAll green.');
process.exit(fails ? 1 : 0);
