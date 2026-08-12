// api/regista/_tasks.js — the operator's task memory.
//
// Il Regista's second half: BOOM doesn't just schedule viewings, it remembers
// what the operator has to DO. Tasks come from three doors:
//
//   · the system itself (auto): key-prep for today's in-person viewings,
//     "esito visita" follow-ups the morning after — deterministic ids, so a
//     cron re-run can never duplicate one (the propertyLocks lesson: create
//     with a docId is a compare-and-set, not a read-then-write)
//   · the operator, in natural language on Telegram ("ricordami di comprare
//     le lampadine per Pigneto domani alle 15") — parseTaskText below, a
//     REGEX parser, deliberately: dates are a closed grammar, and a parser
//     that never hallucinates beats an AI call that sometimes does
//   · any future surface (the collection is the API)
//
// A task WITH a time is placed into the operator's phone calendar as a real
// iCalendar invite (same credential-free mechanism as the viewing invites:
// stable UID boom-task-<id>, growing SEQUENCE) — and marking it done sends
// METHOD:CANCEL, so the calendar cleans itself. _busyics.js filters
// boom-task-* UIDs: a task never eats a booking slot by ICS round-trip.
//
// Collection: operatorTasks (admin-only in firestore.rules)
//   { title, note?, due:'YYYY-MM-DD', dueTime:'HH:MM'|null, status:
//     'open'|'done'|'void', kind:'auto'|'manual', source?, calendarize,
//     calInvited?, icalSeq, createdAt, createdBy, doneAt?, doneVia? }

import crypto from 'node:crypto';
import { fsGet, fsCreate, fsPatch, fsList } from '../homie/_lib.js';
import { romeDateKey, romeToUtc, TZ } from '../viewings/_avail.js';

export const COLL = 'operatorTasks';

// ── ids ────────────────────────────────────────────────────────────────────
// Auto ids stay short: 'tkd:<id>' must fit Telegram's 64-byte callback cap.
export const autoTaskId = (kind, ref) =>
  `task_${kind}_${String(ref).replace(/[^\w-]/g, '').slice(0, 36)}`;
const manualTaskId = () => 'task_m_' + crypto.randomBytes(8).toString('hex');

// ── Rome-day helpers ───────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
export function addDaysKey(key, n) {
  const [y, m, d] = String(key).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const dowOfKey = key => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();          // Sun=0…Sat=6
};

// ── natural language → { title, due, dueTime } ────────────────────────────
const WEEKDAYS = {
  domenica: 0, sunday: 0, sun: 0,
  lunedi: 1, lunedì: 1, monday: 1, mon: 1,
  martedi: 2, martedì: 2, tuesday: 2, tue: 2,
  mercoledi: 3, mercoledì: 3, wednesday: 3, wed: 3,
  giovedi: 4, giovedì: 4, thursday: 4, thu: 4,
  venerdi: 5, venerdì: 5, friday: 5, fri: 5,
  sabato: 6, saturday: 6, sat: 6,
};
const MONTHS = {
  gennaio: 1, january: 1, febbraio: 2, february: 2, marzo: 3, march: 3,
  aprile: 4, april: 4, maggio: 5, may: 5, giugno: 6, june: 6,
  luglio: 7, july: 7, agosto: 8, august: 8, settembre: 9, september: 9,
  ottobre: 10, october: 10, novembre: 11, november: 11, dicembre: 12, december: 12,
};

/**
 * "ricordami di comprare le lampadine domani alle 15" →
 *   { title:'Comprare le lampadine', due:'YYYY-MM-DD', dueTime:'15:00' }
 * Defaults: no date → tomorrow; a bare time still ahead today → today.
 * Pure and exported — tests/regista/run.mjs pins the grammar.
 */
export function parseTaskText(raw, now = new Date()) {
  let t = ' ' + String(raw || '').trim() + ' ';
  t = t.replace(/^\s*\/task\b:?\s*/i, ' ');
  t = t.replace(/^\s*(ricordami di|ricordami|ricorda di|ricorda|promemoria:?|remind me to|remind me|to-?do:?|task:?)\s+/i, ' ');

  const todayKey = romeDateKey(now);
  let due = null, dueTime = null;

  // strip a matched token only when the validator accepts it
  const take = (re, validate) => {
    const m = t.match(re);
    if (!m) return null;
    if (validate && !validate(m)) return null;
    t = t.replace(re, ' ');
    return m;
  };

  // time first, so "alle 15" is never mistaken for the day 15
  let m;
  if ((m = take(/\b(?:alle ore|alle|ore|at)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?=\W)/i,
    x => +x[1] <= 23 && (!x[2] || +x[2] <= 59)))) {
    let hh = +m[1]; const mm = m[2] ? +m[2] : 0; const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    dueTime = `${pad(hh)}:${pad(mm)}`;
  } else if ((m = take(/\b(\d{1,2}):(\d{2})\b/, x => +x[1] <= 23 && +x[2] <= 59))) {
    dueTime = `${pad(+m[1])}:${pad(+m[2])}`;
  }

  if ((m = take(/\b(oggi|today|stasera|tonight)\b/i))) {
    due = todayKey;
    if (/stasera|tonight/i.test(m[1]) && !dueTime) dueTime = '18:00';
  } else if (take(/\bdomattina\b/i)) {
    due = addDaysKey(todayKey, 1);
    if (!dueTime) dueTime = '09:00';
  } else if (take(/\b(domani|tomorrow)\b/i)) {
    due = addDaysKey(todayKey, 1);
  } else if (take(/\bdopodomani\b/i)) {
    due = addDaysKey(todayKey, 2);
  } else if ((m = take(
    // \b is ASCII-blind: after "giovedì" there is no word boundary, so the
    // accented weekdays need explicit lookarounds instead
    new RegExp('(?<![\\wàèéìòù])(' + Object.keys(WEEKDAYS).join('|') + ')(?![\\wàèéìòù])', 'i')))) {
    const target = WEEKDAYS[m[1].toLowerCase()];
    due = addDaysKey(todayKey, (target - dowOfKey(todayKey) + 7) % 7);   // next occurrence, today included
  } else if ((m = take(/\b(?:il\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/,
    x => +x[1] >= 1 && +x[1] <= 31 && +x[2] >= 1 && +x[2] <= 12))) {
    const d = +m[1], mo = +m[2];
    let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : +todayKey.slice(0, 4);
    let key = `${y}-${pad(mo)}-${pad(d)}`;
    if (!m[3] && key < todayKey) key = `${y + 1}-${pad(mo)}-${pad(d)}`;   // "16/01" said in August = next year
    due = key;
  } else if ((m = take(new RegExp('\\b(?:il\\s+)?(\\d{1,2})\\s+(' + Object.keys(MONTHS).join('|') + ')\\b', 'i'),
    x => +x[1] >= 1 && +x[1] <= 31))) {
    const d = +m[1], mo = MONTHS[m[2].toLowerCase()];
    let y = +todayKey.slice(0, 4);
    let key = `${y}-${pad(mo)}-${pad(d)}`;
    if (key < todayKey) key = `${y + 1}-${pad(mo)}-${pad(d)}`;
    due = key;
  } else if ((m = take(/\bil\s+(\d{1,2})(?=\W)/i, x => +x[1] >= 1 && +x[1] <= 31))) {
    const d = +m[1];                                                      // "il 15" → the next 15th
    const [y, mo] = todayKey.split('-').map(Number);
    let key = `${y}-${pad(mo)}-${pad(d)}`;
    if (key < todayKey) {
      const t2 = new Date(Date.UTC(y, mo, 1));                            // first of next month
      key = `${t2.getUTCFullYear()}-${pad(t2.getUTCMonth() + 1)}-${pad(d)}`;
    }
    due = key;
  }

  if (!due) {
    if (dueTime) {
      // a bare time means today if it is still ahead on the Rome clock
      const [hh, mm] = dueTime.split(':').map(Number);
      const [y, mo, d] = todayKey.split('-').map(Number);
      due = romeToUtc(y, mo, d, hh, mm).getTime() > now.getTime() ? todayKey : addDaysKey(todayKey, 1);
    } else {
      due = addDaysKey(todayKey, 1);
    }
  }

  let title = t.replace(/\s+/g, ' ').trim().replace(/^[\s,.;:—–-]+|[\s,.;:—–-]+$/g, '').trim();
  if (!title) title = 'Promemoria';
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title, due, dueTime };
}

// ── the calendar half: a timed task becomes a real event on the phone ─────
const ICS_ESC = s => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = d => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

export function buildTaskInvite(task, method = 'REQUEST') {
  if (!task.due || !task.dueTime) return null;                 // only timed tasks are calendar events
  const [y, mo, d] = String(task.due).split('-').map(Number);
  const [hh, mm] = String(task.dueTime).split(':').map(Number);
  const s = romeToUtc(y, mo, d, hh, mm);
  const cancelled = method === 'CANCEL';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BOOM Rome//Regista//EN',
    'CALSCALE:GREGORIAN', `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:boom-task-${task.id}@boomrome.com`,
    `SEQUENCE:${Math.max(0, Number(task.icalSeq) || 0)}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(s)}`,
    `DTEND:${stamp(new Date(s.getTime() + 30 * 60000))}`,
    `SUMMARY:${ICS_ESC((cancelled ? '✔ ' : '☐ ') + task.title)}`,
    `DESCRIPTION:${ICS_ESC('Task BOOM — segnala ✓ Fatta dal bot Telegram e sparisce da sola.')}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    ...(cancelled ? [] : ['BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${ICS_ESC(task.title)}`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

async function sendTaskInvite(task, method) {
  const ics = buildTaskInvite(task, method);
  if (!ics) return { skipped: 'no_time' };
  const { sendEmail } = await import('../agent/_lib.js');
  const { OPERATOR_EMAIL } = await import('../viewings/_ical.js');
  const cancelled = method === 'CANCEL';
  const when = new Intl.DateTimeFormat('it-IT', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(romeToUtc(...String(task.due).split('-').map(Number), ...String(task.dueTime).split(':').map(Number)));
  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: `${cancelled ? '✔️ Fatta' : '📝 Task'} — ${task.title}`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#222;line-height:1.7">
      <p><b>${cancelled ? '✔️ Fatta — rimossa dal calendario' : '📝 ' + task.title}</b></p>
      <p>${cancelled ? '' : '🗓 ' + when + ' — aggiunta al tuo calendario automaticamente.'}</p>
      <p style="font-size:12px;color:#888">Il Regista · BOOM Rome</p>
    </div>`,
    text: `${cancelled ? 'Fatta' : 'Task'}: ${task.title} · ${when}`,
    icalEvent: { method, filename: 'task.ics', content: ics },
  });
  return { ok: true };
}

// ── CRUD, idempotent where it matters ─────────────────────────────────────
/**
 * Create (or refresh) a task. With `id` set this is idempotent: a cron
 * re-run finds the doc already there; if the task is still open and the due
 * date moved (a rescheduled viewing), the due date follows.
 */
export async function ensureTask(t) {
  const id = t.id || manualTaskId();
  const doc = {
    title: String(t.title || '').slice(0, 200),
    note: t.note ? String(t.note).slice(0, 500) : null,
    due: t.due,
    dueTime: t.dueTime || null,
    status: 'open',
    kind: t.kind || 'manual',
    source: t.source || null,
    calendarize: !!(t.calendarize && t.dueTime),
    icalSeq: 0,
    createdAt: new Date(),
    createdBy: t.createdBy || 'regista',
  };
  try {
    await fsCreate(COLL, doc, id);
  } catch (e) {
    if (!e || !e.exists) throw e;
    const cur = await fsGet(`${COLL}/${id}`).catch(() => null);
    if (cur && cur.status === 'open' && t.due && cur.due !== t.due) {
      await fsPatch(`${COLL}/${id}`, { due: t.due, dueTime: t.dueTime || cur.dueTime || null, updatedAt: new Date() });
      return { id, updated: true, task: { ...cur, id, due: t.due } };
    }
    return { id, existed: true, task: cur ? { ...cur, id } : null };
  }
  const task = { ...doc, id };
  if (doc.calendarize) {
    try { await sendTaskInvite(task, 'REQUEST'); await fsPatch(`${COLL}/${id}`, { calInvited: true }); task.calInvited = true; }
    catch (e) { console.warn('[regista/_tasks] invite:', e.message); }
  }
  return { id, created: true, task };
}

export async function closeTask(id, via = 'telegram') {
  const cur = await fsGet(`${COLL}/${id}`).catch(() => null);
  if (!cur) return null;
  if (cur.status !== 'open') return { ...cur, id };
  await fsPatch(`${COLL}/${id}`, { status: 'done', doneAt: new Date(), doneVia: via });
  if (cur.calInvited) {
    // the calendar cleans itself: done → the event disappears from the phone
    try { await sendTaskInvite({ ...cur, id, icalSeq: (Number(cur.icalSeq) || 0) + 1 }, 'CANCEL'); }
    catch (e) { console.warn('[regista/_tasks] cancel invite:', e.message); }
  }
  return { ...cur, id, status: 'done' };
}

export async function voidTask(id) {
  const cur = await fsGet(`${COLL}/${id}`).catch(() => null);
  if (!cur || cur.status !== 'open') return null;
  await fsPatch(`${COLL}/${id}`, { status: 'void', voidedAt: new Date() });
  if (cur.calInvited) {
    try { await sendTaskInvite({ ...cur, id, icalSeq: (Number(cur.icalSeq) || 0) + 1 }, 'CANCEL'); }
    catch (e) { console.warn('[regista/_tasks] void invite:', e.message); }
  }
  return { ...cur, id, status: 'void' };
}

export async function snoozeTask(id, days = 1) {
  const cur = await fsGet(`${COLL}/${id}`).catch(() => null);
  if (!cur || cur.status !== 'open') return null;
  const due = addDaysKey(cur.due || romeDateKey(new Date()), days);
  const seq = (Number(cur.icalSeq) || 0) + 1;
  await fsPatch(`${COLL}/${id}`, { due, snoozedAt: new Date(), ...(cur.calInvited ? { icalSeq: seq } : {}) });
  if (cur.calInvited) {
    // same UID + higher SEQUENCE = the phone event moves instead of duplicating
    try { await sendTaskInvite({ ...cur, id, due, icalSeq: seq }, 'REQUEST'); }
    catch (e) { console.warn('[regista/_tasks] snooze invite:', e.message); }
  }
  return { ...cur, id, due };
}

/** Open tasks due on/before `dueBy` (plus undated ones), oldest first. */
export async function listOpenTasks(dueBy) {
  let rows = [];
  try {
    rows = await fsList(COLL, { filter: { field: 'status', op: 'EQUAL', value: 'open' }, limit: 200 });
  } catch { /* fail-open: an unreadable list is an empty brief section, not a crash */ }
  return rows
    .filter(t => !dueBy || !t.due || t.due <= dueBy)
    .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) ||
                    String(a.dueTime || '99').localeCompare(String(b.dueTime || '99')));
}
