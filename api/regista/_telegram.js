// api/regista/_telegram.js — il Regista in chat.
//
// The operator's side of the task memory, zero UI to learn:
//   · "ricordami di comprare le lampadine per Pigneto domani alle 15" →
//     task saved, calendar event on the phone (timed tasks), confirmation
//     with ✓/⏰ buttons. Plain language, no command needed.
//   · /task            → today's open tasks, each with its buttons
//   · /task <testo>    → same as the natural phrase
//   · /giornata        → the Foglio di Chiamata on demand (sent even when
//     the day is empty — asking is consent)
//   · buttons: tkd:<id> = fatta (calendar event removed), tks:<id> = +1 day
//     (calendar event moves). Callback data stays ≤64 bytes by id design.

import { tgSend, tgAckCallback } from '../telegram/_lib.js';
import { romeToUtc, TZ } from '../viewings/_avail.js';
import { parseTaskText, ensureTask, closeTask, snoozeTask, listOpenTasks } from './_tasks.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const dueLabel = (due, dueTime) => {
  if (!due) return '';
  const [y, m, d] = String(due).split('-').map(Number);
  const day = new Intl.DateTimeFormat('it-IT', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
    .format(romeToUtc(y, m, d, 12, 0));
  return day + (dueTime ? ` · ${dueTime}` : '');
};

const taskKeyboard = id => ({
  inline_keyboard: [[
    { text: '✓ Fatta', callback_data: `tkd:${id}` },
    { text: '⏰ +1 giorno', callback_data: `tks:${id}` },
  ]],
});

// ── buttons ────────────────────────────────────────────────────────────────
export async function handleTaskCallback(verb, id, { chatId, callbackId }) {
  if (verb !== 'tkd' && verb !== 'tks') return false;
  if (!id) { await tgAckCallback(callbackId, 'Dati non validi'); return true; }

  if (verb === 'tkd') {
    const t = await closeTask(id, 'telegram');
    if (!t) await tgAckCallback(callbackId, 'Non trovata');
    else if (t.status !== 'done') await tgAckCallback(callbackId, `Già ${t.status}`);
    else {
      await tgAckCallback(callbackId, '✓ Fatta');
      await tgSend(chatId, `✓ <b>${esc(t.title)}</b> — fatta${t.calInvited ? ' (rimossa dal calendario)' : ''}.`);
    }
    return true;
  }

  const t = await snoozeTask(id, 1);
  if (!t) await tgAckCallback(callbackId, 'Non trovata o già chiusa');
  else {
    await tgAckCallback(callbackId, '⏰ A domani');
    await tgSend(chatId, `⏰ <b>${esc(t.title)}</b> → ${dueLabel(t.due, t.dueTime)}${t.calInvited ? ' (calendario aggiornato)' : ''}.`);
  }
  return true;
}

// ── text ───────────────────────────────────────────────────────────────────
const NL_TASK_RE = /^(ricordami|ricorda|promemoria|remind me|to-?do)\b/i;

export async function handleTaskText(chatId, text) {
  const t = String(text || '').trim();

  // /task alone = the list
  if (/^\/task\s*$/i.test(t)) {
    const open = await listOpenTasks(null);
    if (!open.length) {
      await tgSend(chatId, '📭 Nessun task aperto. Scrivimi "ricordami di …" per crearne uno.');
      return true;
    }
    await tgSend(chatId, `📝 <b>${open.length} task apert${open.length === 1 ? 'o' : 'i'}</b>`);
    for (const task of open.slice(0, 10)) {
      await tgSend(chatId, `• ${esc(task.title)}\n<i>${dueLabel(task.due, task.dueTime) || 'senza data'}</i>`,
        { reply_markup: taskKeyboard(task.id) });
    }
    return true;
  }

  if (!/^\/task\b/i.test(t) && !NL_TASK_RE.test(t)) return false;

  const parsed = parseTaskText(t);
  const r = await ensureTask({
    title: parsed.title, due: parsed.due, dueTime: parsed.dueTime,
    kind: 'manual', createdBy: 'telegram', calendarize: true, source: 'telegram',
  });
  const task = r.task || { id: r.id, ...parsed };
  await tgSend(chatId,
    `📝 <b>${esc(task.title)}</b>\n📅 ${dueLabel(task.due, task.dueTime)}` +
    (task.calInvited ? '\n🗓 Aggiunta al tuo calendario — sparisce da sola quando la fai.' : ''),
    { reply_markup: taskKeyboard(task.id) });
  return true;
}

// ── /giornata ──────────────────────────────────────────────────────────────
export async function sendBrief(chatId) {
  const { runRegista } = await import('./cron.js');
  await runRegista({ force: true, chatId });
}
