// tests/regista/run.mjs — Il Regista: the grammar, the ids, the sheet.
//
// Three promises pinned here:
//   · parseTaskText is a REGEX parser with a closed grammar — these cases
//     ARE the grammar; if one breaks, the operator's words stop meaning
//     what they said (never "roughly" — a task on the wrong day is worse
//     than no task)
//   · auto ids are deterministic and short: reruns can't duplicate a task,
//     and 'tkd:<id>' always fits Telegram's 64-byte callback limit
//   · the Foglio di Chiamata renders escaped, complete, and knows when the
//     day is genuinely empty
//
// Run: node tests/regista/run.mjs

import { parseTaskText, autoTaskId, buildTaskInvite, addDaysKey } from '../../api/regista/_tasks.js';
import { buildBrief, travelLegs } from '../../api/regista/_brief.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

// Monday 2026-08-03, 08:00 Rome
const NOW = new Date('2026-08-03T06:00:00Z');
const P = (text, now = NOW) => parseTaskText(text, now);

// ── 1. the grammar ─────────────────────────────────────────────────────────
{
  let r = P('ricordami di comprare le lampadine domani alle 15');
  ok('IT: domani alle 15', r.title === 'Comprare le lampadine' && r.due === '2026-08-04' && r.dueTime === '15:00', JSON.stringify(r));

  r = P('/task chiamare idraulico giovedì');
  ok('IT: weekday name', r.title === 'Chiamare idraulico' && r.due === '2026-08-06' && r.dueTime === null, JSON.stringify(r));

  r = P('pagare F24 il 16/08');
  ok('IT: il DD/MM', r.title === 'Pagare F24' && r.due === '2026-08-16', JSON.stringify(r));

  r = P('stasera portare i documenti');
  ok('IT: stasera = today 18:00', r.title === 'Portare i documenti' && r.due === '2026-08-03' && r.dueTime === '18:00', JSON.stringify(r));

  r = P('remind me to email John tomorrow at 9am');
  ok('EN: tomorrow at 9am', r.title === 'Email John' && r.due === '2026-08-04' && r.dueTime === '09:00', JSON.stringify(r));

  r = P('comprare lampadine');
  ok('no date → tomorrow, no time', r.due === '2026-08-04' && r.dueTime === null, JSON.stringify(r));

  r = P('15-20 minuti di sopralluogo lunedì');
  ok('a range is not a date', r.title === '15-20 minuti di sopralluogo' && r.due === '2026-08-03', JSON.stringify(r));

  r = P('chiama il notaio alle 18');
  ok('bare future time = today', r.title === 'Chiama il notaio' && r.due === '2026-08-03' && r.dueTime === '18:00', JSON.stringify(r));
  r = P('chiama il notaio alle 18', new Date('2026-08-03T17:00:00Z'));   // 19:00 Rome
  ok('bare past time = tomorrow', r.due === '2026-08-04' && r.dueTime === '18:00', JSON.stringify(r));

  r = P('bolletta 5 settembre');
  ok('IT: month name', r.title === 'Bolletta' && r.due === '2026-09-05', JSON.stringify(r));
  r = P('auguri 1 gennaio');
  ok('a past date rolls to next year', r.due === '2027-01-01', JSON.stringify(r));

  r = P('domattina spazzatura');
  ok('domattina = tomorrow 09:00', r.due === '2026-08-04' && r.dueTime === '09:00' && r.title === 'Spazzatura', JSON.stringify(r));

  r = P('   ');
  ok('empty input still yields a task', r.title === 'Promemoria' && r.due === '2026-08-04', JSON.stringify(r));

  ok('addDaysKey crosses months', addDaysKey('2026-08-31', 1) === '2026-09-01');
}

// ── 2. ids: deterministic, short, callback-safe ────────────────────────────
{
  const a = autoTaskId('prep', '2026-08-03_listing-navona');
  ok('auto id is deterministic', a === autoTaskId('prep', '2026-08-03_listing-navona'), a);
  ok('auto id survives odd chars', !/[^\w-]/.test(autoTaskId('esito', 'ab c/à!x')));
  const worst = autoTaskId('prep', '2026-08-03_' + 'x'.repeat(80));
  ok('callback tkd:<id> fits 64 bytes', Buffer.byteLength('tkd:' + worst) <= 64, String(Buffer.byteLength('tkd:' + worst)));
  ok('the day survives truncation', worst.includes('2026-08-03'), worst);
}

// ── 3. the calendar half ───────────────────────────────────────────────────
{
  const t = { id: 'task_m_abc', title: 'Comprare lampadine, Pigneto; ok', due: '2026-08-04', dueTime: '15:00', icalSeq: 0 };
  const ics = buildTaskInvite(t, 'REQUEST');
  ok('a timed task becomes an event', /UID:boom-task-task_m_abc@boomrome\.com/.test(ics));
  ok('15:00 Rome in August is 13:00Z', /DTSTART:20260804T130000Z/.test(ics), ics.match(/DTSTART:[^\r\n]*/)?.[0]);
  ok('ICS text is escaped', /Comprare lampadine\\, Pigneto\\; ok/.test(ics));
  ok('done → METHOD:CANCEL + STATUS:CANCELLED', /METHOD:CANCEL/.test(buildTaskInvite(t, 'CANCEL')) && /STATUS:CANCELLED/.test(buildTaskInvite(t, 'CANCEL')));
  ok('a dateless task is not an event', buildTaskInvite({ ...t, dueTime: null }) === null);
}

// ── 4. the Foglio di Chiamata ──────────────────────────────────────────────
{
  const TRA = { lat: 41.8891, lng: 12.4695 }, PAR = { lat: 41.9302, lng: 12.4883 };
  const v = (id, iso, extra = {}) => ({
    id, confirmedDateTime: iso, clientName: 'Marco <b>Rossi</b>', listingName: 'Trastevere & Loft',
    mode: 'person', durationMinutes: 45, listingId: 'A', ...TRA, ...extra,
  });

  const brief = buildBrief({
    todayViewings: [
      v('v1', '2026-08-03T08:00:00Z'),
      v('v2', '2026-08-03T09:15:00Z', { listingId: 'B', ...PAR, listingName: 'Parioli Suite', clientName: 'Anna K' }),
      v('v3', '2026-08-03T13:00:00Z', { mode: 'video', clientName: 'John D', listingName: 'Pigneto Nest', durationMinutes: 20 }),
    ],
    tomorrowViewings: [v('v4', '2026-08-04T08:00:00Z')],
    tasks: [
      { id: 'task_m_1', title: 'Comprare <lampadine>', due: '2026-08-03', dueTime: '15:00' },
      { id: 'task_prep_x', title: '🔑 Prepara Trastevere', due: '2026-08-02' },
    ],
    overnight: { booked: 1, moved: 0 },
    pendingCount: 2,
    todayKey: '2026-08-03',
    dateLabel: 'lunedì 3 agosto',
  });

  ok('HTML from user data is escaped', !brief.text.includes('<b>Rossi') && brief.text.includes('&lt;b&gt;Rossi'), brief.text.slice(0, 200));
  ok('the timeline shows Rome times', brief.text.includes('<b>10:00</b>') && brief.text.includes('<b>15:00</b>'), brief.text);
  ok('a travel leg appears between the two in-person visits', brief.text.includes('🛵 ~'), brief.text);
  ok('the video visit needs no scooter line', !brief.text.split('🎥')[0].split('🛵').slice(1).join('').includes('John'));
  ok('overnight bookings are reported', brief.text.includes('🌙 Stanotte: 1 nuova prenotazione'));
  ok('pending requests point at /visite', brief.text.includes('2 richieste da confermare → /visite'));
  ok('an overdue task is flagged', brief.text.includes('⚠️ 🔑 Prepara Trastevere'));
  ok('tomorrow gets one line', brief.text.includes('Domani: 1 visita, la prima alle 10:00.'), brief.text);
  ok('not empty', brief.empty === false);
  ok('every task button fits 64 bytes',
    brief.keyboard.inline_keyboard.flat().every(b => Buffer.byteLength(b.callback_data) <= 64));

  // same-listing pair → the chain line, zero travel in the header
  const chain = buildBrief({
    todayViewings: [v('a', '2026-08-03T08:00:00Z'), v('b', '2026-08-03T08:45:00Z', { clientName: 'Luca' })],
    tasks: [], overnight: {}, pendingCount: 0, todayKey: '2026-08-03', dateLabel: 'lunedì 3 agosto',
  });
  ok('same-listing visits read as a chain', chain.text.includes('🔗 stesso immobile'), chain.text);
  ok('a chain costs no travel in the header', !chain.text.includes('di spostamenti'));

  const legs = travelLegs([v('a', '2026-08-03T08:00:00Z'), v('b', '2026-08-03T09:15:00Z', { listingId: 'B', ...PAR })]);
  ok('legs use the same heuristic as the grid', legs.length === 1 && legs[0].minutes > 15 && legs[0].minutes <= 45, JSON.stringify(legs));

  const empty = buildBrief({ todayViewings: [], tomorrowViewings: [], tasks: [], overnight: {}, pendingCount: 0, todayKey: '2026-08-03', dateLabel: 'lunedì 3 agosto' });
  ok('an empty day is recognized', empty.empty === true);
  ok('…and still has a friendly on-demand text', empty.text.includes('Agenda libera'));
}

console.log(fails ? `\n${fails} FAILED` : '\nAll green.');
process.exit(fails ? 1 : 0);
