// api/regista/cron.js — Il Regista, the newest member of La Squadra.
//
// Every morning at 07:30 Rome the operator's phone shows ONE message: the
// Foglio di Chiamata — today's viewings as a timeline with real travel legs,
// what happened overnight, what still needs a decision, and today's tasks
// with one-tap ✓/⏰ buttons. A film set would not start without it; neither
// should a viewing day.
//
// The run also does the Regista's quiet chores BEFORE speaking:
//   · a key-prep task per property being shown in person today
//     (deterministic id per property+day → reruns and reschedules never
//     duplicate; a fully-cancelled property's prep task is voided)
//   · an "esito visita" task for every viewing completed yesterday — the
//     follow-up that decides revenue, placed where the operator will see it
//
// Same infrastructure as the other employees: heartbeat teamHealth/regista
// (the /team console shows the card), Telegram alert after 3 failed runs,
// ?dry=1 to preview without sending, and cron/homie/admin auth.

import { fsList } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth } from '../employees/_lib.js';
import { tgSend } from '../telegram/_lib.js';
import { startOf, isVideo } from '../viewings/_lib.js';
import { romeDateKey, TZ } from '../viewings/_avail.js';
import { buildBrief } from './_brief.js';
import { ensureTask, voidTask, listOpenTasks, autoTaskId, addDaysKey } from './_tasks.js';

const dateLabel = key => {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(Date.UTC(y, m - 1, d)));
};

async function listByStatus(status, limit = 200) {
  try {
    return await fsList('viewingRequests', { filter: { field: 'status', op: 'EQUAL', value: status }, limit });
  } catch { return []; }
}

/**
 * The whole daily run, callable from the cron AND from Telegram (/giornata).
 * @param opts { dry, force, chatId } — force sends even an empty-day brief
 */
export async function runRegista(opts = {}) {
  const now = new Date();
  const todayKey = romeDateKey(now);
  const tomorrowKey = addDaysKey(todayKey, 1);
  const yesterdayKey = addDaysKey(todayKey, -1);

  const confirmed = (await listByStatus('confirmed')).filter(v => !v.voided && startOf(v));
  const completed = (await listByStatus('completed', 100)).filter(v => startOf(v));
  const pendingRows = (await listByStatus('pending', 100)).filter(v => !v.voided);

  const todayViewings = confirmed.filter(v => romeDateKey(startOf(v)) === todayKey);
  const tomorrowViewings = confirmed.filter(v => romeDateKey(startOf(v)) === tomorrowKey);

  // ── chores: auto-tasks, idempotent by construction ──────────────────────
  const stats = { viewingsToday: todayViewings.length, prepTasks: 0, esitoTasks: 0 };

  // one key-prep task per property shown in person today; the earliest hour
  // rides in the title, and a reschedule refreshes it via ensureTask
  const prepGroups = new Map();
  for (const v of todayViewings) {
    if (isVideo(v)) continue;
    const key = String(v.listingId || v.propertyId || v.id);
    const cur = prepGroups.get(key);
    if (!cur || startOf(v) < startOf(cur)) prepGroups.set(key, v);
  }
  const expectedPrepIds = new Set();
  for (const [key, v] of prepGroups) {
    // date first: autoTaskId truncates long refs, and the DAY must survive —
    // it is what scopes the id (and the stale-prep sweep) to today
    const id = autoTaskId('prep', `${todayKey}_${key}`);
    expectedPrepIds.add(id);
    const hh = new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(startOf(v));
    const r = await ensureTask({
      id,
      title: `🔑 Prepara ${v.listingName || 'la visita'} — chiavi e accesso (prima visita ${hh})`,
      due: todayKey, kind: 'auto', source: `viewing:${v.id}`,
    }).catch(e => (console.warn('[regista] prep task:', e.message), null));
    if (r && (r.created || r.updated)) stats.prepTasks++;
  }

  // yesterday's completed visits → today's follow-up decisions
  for (const v of completed.filter(v => romeDateKey(startOf(v)) === yesterdayKey)) {
    const r = await ensureTask({
      id: autoTaskId('esito', v.id),
      title: `📋 Esito visita: ${v.clientName || v.name || 'cliente'} · ${v.listingName || ''}`.trim(),
      due: todayKey, kind: 'auto', source: `viewing:${v.id}`,
    }).catch(e => (console.warn('[regista] esito task:', e.message), null));
    if (r && r.created) stats.esitoTasks++;
  }

  // ── the sheet ───────────────────────────────────────────────────────────
  let tasks = await listOpenTasks(todayKey);

  // a prep task whose property no longer has live viewings today is a lie —
  // void it (the viewings were cancelled or moved to another day)
  const stalePrep = t => t.id && t.id.startsWith(`task_prep_${todayKey}_`) && !expectedPrepIds.has(t.id);
  for (const t of tasks.filter(stalePrep)) {
    await voidTask(t.id).catch(() => null);
    stats.prepVoided = (stats.prepVoided || 0) + 1;
  }
  if (stats.prepVoided) tasks = tasks.filter(t => !stalePrep(t));

  const cutoff = now.getTime() - 14 * 3600 * 1000;
  const since = ts => { const d = ts ? new Date(ts) : null; return d && !isNaN(d) && d.getTime() >= cutoff; };
  const overnight = {
    booked: confirmed.filter(v => v.selfBooked && since(v.createdAt)).length,
    moved: confirmed.filter(v => v.rescheduledByClient && since(v.rescheduledAt)).length,
  };

  const brief = buildBrief({
    todayViewings, tomorrowViewings, tasks,
    overnight, pendingCount: pendingRows.length,
    todayKey, dateLabel: dateLabel(todayKey),
  });
  stats.tasksOpen = tasks.length;
  stats.pending = pendingRows.length;

  let sent = false;
  if (!opts.dry && (opts.force || !brief.empty)) {
    const chatId = opts.chatId || process.env.TELEGRAM_CHAT_ID;
    if (chatId) {
      await tgSend(chatId, brief.text, brief.keyboard ? { reply_markup: brief.keyboard } : {});
      sent = true;
    }
  }
  return { ok: true, sent, empty: brief.empty, text: brief.text, stats };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = String((req.query && req.query.dry) || '') === '1';
  try {
    const out = await runRegista({ dry });
    await reportEmployeeHealth('regista', { ok: true, stats: out.stats });
    return res.status(200).json({ ok: true, dry, sent: out.sent, empty: out.empty, stats: out.stats, ...(dry ? { text: out.text } : {}) });
  } catch (e) {
    console.error('[regista/cron]', e);
    await reportEmployeeHealth('regista', { ok: false, error: e.message }).catch(() => null);
    return res.status(500).json({ ok: false, error: e.message || 'internal' });
  }
}
