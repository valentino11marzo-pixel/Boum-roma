// api/telegram/notify-pending.js
// Cron-triggered scanner. Every minute (per vercel.json) it queries
// `action_queue` for newly-pending actions Homie proposed and that the user
// hasn't been pinged about yet, then ships them to Telegram with inline
// Approva/Rifiuta/Modifica buttons. Idempotent: marks `telegramNotifiedAt`
// + `telegramMessageId` so the next run skips them.
//
// Auth: Vercel cron sets `Authorization: Bearer ${CRON_SECRET}` automatically.
//
// Env:
//   CRON_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { fsList, fsPatch } from '../homie/_lib.js';
import { tgSend, fmtAction, actionKeyboard } from './_lib.js';

const MAX_PER_RUN = 10; // cap so a backlog doesn't spam Telegram
const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

export default async function handler(req, res) {
  // Vercel cron auth
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return res.status(200).json({ ok: true, skipped: 'TELEGRAM_CHAT_ID not set' });
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(200).json({ ok: true, skipped: 'TELEGRAM_BOT_TOKEN not set' });

  // Fetch pending actions. Use a single-field equality filter only — adding an
  // orderBy on a DIFFERENT field (createdAt) needs a Firestore composite index
  // that isn't provisioned, which made this 500 once Telegram env was set. We
  // order in code instead.
  let pending;
  try {
    pending = await fsList('action_queue', {
      filter: { field: 'status', op: 'EQUAL', value: 'pending' },
      limit: 50,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'list_failed', details: e.message });
  }
  const ts = v => v && v.toMillis ? v.toMillis() : (v && v._seconds ? v._seconds * 1000 : (v ? new Date(v).getTime() || 0 : 0));
  pending = (pending || []).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));

  const toNotify = (pending || [])
    .filter(a => !a.telegramNotifiedAt && !a.telegramMessageId)
    .slice(0, MAX_PER_RUN);

  const results = [];
  for (const a of toNotify) {
    try {
      const messageId = await tgSend(
        chatId,
        fmtAction(a) + `\n\n<i>id:</i> <code>${a.id}</code>`,
        { reply_markup: actionKeyboard(a.id) }
      );
      // Mark as notified so we don't double-send.
      await fsPatch(`action_queue/${a.id}`, {
        telegramNotifiedAt: new Date(),
        telegramMessageId: messageId || null,
        telegramChatId: chatId,
      });
      results.push({ id: a.id, messageId, ok: true });
    } catch (e) {
      results.push({ id: a.id, ok: false, error: e.message });
    }
  }

  // ── Also push high-priority business EVENTS, not just proposed actions. ──
  // agentNotifications (contract.signed, maintenance.opened, lead.new, concierge
  // emergencies) used to reach Telegram only via the Mac daemon. Push urgent/high
  // ones server-side so the operator's phone pings even with the Mac off. No
  // buttons — these are informational; the action loop above carries the buttons.
  const HOT = new Set(['urgent', 'high']);
  let events = [];
  try {
    events = await fsList('agentNotifications', {
      filter: { field: 'status', op: 'EQUAL', value: 'pending' },
      limit: 50,
    });
  } catch (_) { /* collection/rules absent → non-fatal */ }
  const evToNotify = (events || [])
    .filter(e => HOT.has(e.priority) && !e.telegramNotifiedAt)
    .slice(0, MAX_PER_RUN);
  const evResults = [];
  for (const e of evToNotify) {
    try {
      const icon = e.priority === 'urgent' ? '🚨' : '🔔';
      const mid = await tgSend(
        chatId,
        `${icon} <b>${esc(e.type || 'evento')}</b>\n${esc(e.summary || '')}\n\n<a href="https://www.boomrome.com/portal.html">Apri portale</a>`
      );
      await fsPatch(`agentNotifications/${e.id}`, {
        telegramNotifiedAt: new Date(),
        telegramMessageId: mid || null,
        telegramChatId: chatId,
      });
      evResults.push({ id: e.id, ok: true });
    } catch (err) {
      evResults.push({ id: e.id, ok: false, error: err.message });
    }
  }

  return res.status(200).json({
    ok: true,
    scanned: pending.length,
    notified: results.filter(r => r.ok).length,
    failed:   results.filter(r => !r.ok).length,
    events: { scanned: events.length, notified: evResults.filter(r => r.ok).length, failed: evResults.filter(r => !r.ok).length },
    results,
  });
}
