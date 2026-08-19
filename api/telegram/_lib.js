// api/telegram/_lib.js
// Minimal wrapper around the Telegram Bot API. No SDK — straight fetch calls.
// All env vars consumed:
//   TELEGRAM_BOT_TOKEN       — from @BotFather
//   TELEGRAM_CHAT_ID         — Valentino's user id (so only he can act)
//   TELEGRAM_WEBHOOK_SECRET  — optional, Telegram echoes this in a header
//                              on every webhook hit; lets us reject forged calls

import crypto from 'node:crypto';

const TG_API = 'https://api.telegram.org/bot';

export function tgUrl(method) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  return `${TG_API}${token}/${method}`;
}

export async function tgCall(method, body) {
  const res = await fetch(tgUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { data = { ok: false, description: `http_${res.status}` }; }
  if (!data.ok) throw new Error(`telegram_${method}: ${data.description || res.status}`);
  return data.result;
}

// Send a message with optional inline keyboard. Returns the Telegram message id.
export async function tgSend(chatId, text, opts = {}) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  };
  const msg = await tgCall('sendMessage', body);
  return msg && msg.message_id;
}

// Edit a previously-sent message (used to "stamp" approve/reject onto the row).
export async function tgEdit(chatId, messageId, text, opts = {}) {
  return tgCall('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  });
}

// Acknowledge a callback query — closes the spinning button without a popup.
export async function tgAckCallback(callbackQueryId, text = '') {
  try { await tgCall('answerCallbackQuery', { callback_query_id: callbackQueryId, text }); }
  catch { /* non-fatal */ }
}

// Validate the webhook came from Telegram. We require the secret header to
// match TELEGRAM_WEBHOOK_SECRET. The chat-id check happens per-message later.
export function requireWebhookSecret(req, res) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Se il secret NON è configurato, l'header non può essere richiesto senza
  // rompere il bot (Telegram lo invia solo se lo si è impostato in
  // setWebhook). La difesa non sparisce: ogni ramo del webhook passa comunque
  // da isAuthorizedChat(TELEGRAM_CHAT_ID). Per chiudere del tutto questa porta
  // — audit 2026-08-18 P0.5 — impostare TELEGRAM_WEBHOOK_SECRET su Vercel E
  // nella setWebhook di Telegram. Confronto timing-safe quando c'è.
  if (!expected) return true;
  const got = req.headers['x-telegram-bot-api-secret-token'];
  const a = Buffer.from(String(got || ''), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  let ok = a.length === b.length;
  try { ok = ok && crypto.timingSafeEqual(a, b); } catch { ok = false; }
  if (!ok) {
    res.status(401).json({ ok: false, error: 'invalid_webhook_secret' });
    return false;
  }
  return true;
}

// Only the registered admin chat id may act. Returns true if ok.
export function isAuthorizedChat(chatId) {
  const ok = String(chatId) === String(process.env.TELEGRAM_CHAT_ID || '');
  return ok;
}

// Format a pending action for Telegram — Markdown-safe-ish HTML.
const KIND_LABEL = {
  reply:              '💬 Risposta',
  schedule_viewing:   '📅 Visita',
  qualify:            '📋 Qualifica',
  archive:            '🗄️ Archivia',
  note:               '📝 Nota',
  other:              '⚡ Azione',
};
export function fmtAction(a) {
  const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
  const label = KIND_LABEL[a.kind] || KIND_LABEL.other;
  const confidence = typeof a.confidence === 'number' ? ` · ${Math.round(a.confidence * 100)}%` : '';
  const proposedBy = a.proposedBy ? ` · ${esc(a.proposedBy)}` : '';
  const summary = esc(a.summary || '');
  const draft = a.payload && a.payload.draft
    ? `\n<blockquote>${esc(String(a.payload.draft).slice(0, 800))}${a.payload.draft.length > 800 ? '…' : ''}</blockquote>`
    : '';
  const channel = a.payload && a.payload.channel ? ` · ${esc(a.payload.channel)}` : '';
  const phone = a.payload && a.payload.phone ? ` · ${esc(a.payload.phone)}` : '';
  return `<b>${label}</b>${confidence}${proposedBy}${channel}${phone}\n${summary}${draft}`;
}

export function actionKeyboard(actionId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approva',    callback_data: `approve:${actionId}` },
        { text: '❌ Rifiuta',    callback_data: `reject:${actionId}` },
      ],
      [
        { text: '✏️ Modifica bozza (rispondi /edit ' + actionId.slice(0, 8) + '… <testo>)',
          callback_data: `edit:${actionId}` },
      ],
    ],
  };
}
