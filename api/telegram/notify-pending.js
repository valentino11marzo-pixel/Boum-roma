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

export default async function handler(req, res) {
  // Vercel cron auth
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return res.status(200).json({ ok: true, skipped: 'TELEGRAM_CHAT_ID not set' });
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(200).json({ ok: true, skipped: 'TELEGRAM_BOT_TOKEN not set' });

  // Fetch the most recent pending actions. We don't filter on
  // telegramNotifiedAt at the query level (Firestore composite-index pain) —
  // instead we pull recent pending and filter in code.
  let pending;
  try {
    pending = await fsList('action_queue', {
      filter: { field: 'status', op: 'EQUAL', value: 'pending' },
      orderBy: { field: 'createdAt', direction: 'DESCENDING' },
      limit: 50,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'list_failed', details: e.message });
  }

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

  return res.status(200).json({
    ok: true,
    scanned: pending.length,
    notified: results.filter(r => r.ok).length,
    failed:   results.filter(r => !r.ok).length,
    results,
  });
}
