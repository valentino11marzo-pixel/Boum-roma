// api/telegram/webhook.js
// Receives Telegram updates and acts on the action_queue:
//   - inline button "approve:<id>" → set status=approved + call executor
//   - inline button "reject:<id>"  → set status=rejected
//   - inline button "edit:<id>"    → prompt the user to reply with /edit
//   - text "/start"                → welcome + show current pending
//   - text "/queue"                → list pending
//   - text "/edit <id> <new draft>"→ update payload.draft and re-stamp the queue
//   - text "/snapshot"             → portal state summary
//
// Auth: Telegram passes the optional secret via X-Telegram-Bot-Api-Secret-Token
// (set when we call setWebhook with secret_token). Plus we check chat_id
// against TELEGRAM_CHAT_ID so only the registered admin can do anything.
//
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET (optional),
//      CRON_SECRET (used for the internal exec hop), HOMIE_SECRET (executor auth)

import { fsGet, fsPatch, fsList, readJson } from '../homie/_lib.js';
import { tgSend, tgEdit, tgAckCallback, requireWebhookSecret, isAuthorizedChat, fmtAction } from './_lib.js';

const BASE = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://boomrome.com';

// Persistent per-chat state (so /edit can prompt → wait for next message).
// Stored in a tiny Firestore doc so it survives serverless cold starts.
async function getState(chatId) {
  return (await fsGet(`telegramState/${chatId}`)) || {};
}
async function setState(chatId, patch) {
  await fsPatch(`telegramState/${chatId}`, { ...patch, updatedAt: new Date() });
}
async function clearState(chatId) {
  await fsPatch(`telegramState/${chatId}`, { mode: null, actionId: null, updatedAt: new Date() });
}

// Call the existing /api/agent/execute endpoint server-side (no public hop).
// Uses HOMIE_SECRET because the executor accepts the same admin signal Homie
// itself uses — same trust level.
async function callExecutor(actionId, override) {
  const res = await fetch(`${BASE}/api/agent/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Homie-Secret': process.env.HOMIE_SECRET || '',
    },
    body: JSON.stringify({ id: actionId, ...(override ? { override } : {}) }),
  });
  let data;
  try { data = await res.json(); } catch { data = { ok: false, error: `http_${res.status}` }; }
  return { ok: res.ok && data.ok !== false, status: data.status, error: data.error, data };
}

async function listPending(limit = 10) {
  try {
    return await fsList('action_queue', {
      filter: { field: 'status', op: 'EQUAL', value: 'pending' },
      orderBy: { field: 'createdAt', direction: 'DESCENDING' },
      limit,
    });
  } catch { return []; }
}

async function fmtSnapshot() {
  const pending = await listPending(5);
  if (!pending.length) return '<b>📭 Coda vuota</b>\nNessuna azione in attesa.';
  const lines = pending.map((a, i) =>
    `${i + 1}. <b>${(a.kind || 'azione')}</b> · ${(a.summary || '').slice(0, 80)} <i>(${a.id.slice(0, 8)})</i>`
  );
  return `<b>📋 ${pending.length} in attesa</b>\n` + lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!requireWebhookSecret(req, res)) return;

  let update;
  try { update = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!update) return res.status(200).json({ ok: true, ignored: 'no_body' });

  try {
    // ── Inline button taps ───────────────────────────────────────────────
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const data = String(cq.data || '');
      const [verb, actionId] = data.split(':');

      if (!isAuthorizedChat(chatId)) {
        await tgAckCallback(cq.id, '⛔ Non autorizzato');
        return res.status(200).json({ ok: true });
      }
      if (!verb || !actionId) {
        await tgAckCallback(cq.id, 'Dati non validi');
        return res.status(200).json({ ok: true });
      }

      const action = await fsGet(`action_queue/${actionId}`);
      if (!action) {
        await tgAckCallback(cq.id, 'Non trovata');
        return res.status(200).json({ ok: true });
      }
      if (action.status !== 'pending') {
        await tgAckCallback(cq.id, `Già ${action.status}`);
        return res.status(200).json({ ok: true });
      }

      if (verb === 'approve') {
        // 1) Optimistic mark approved
        await fsPatch(`action_queue/${actionId}`, {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: 'telegram:' + chatId,
        });
        await tgAckCallback(cq.id, 'Approvata, eseguo…');
        // 2) Fire executor
        const exec = await callExecutor(actionId);
        const tag = exec.ok && exec.status === 'executed' ? '✅ <b>ESEGUITA</b>'
                 : exec.ok                                ? `✅ <b>APPROVATA</b> (${exec.status || 'in coda'})`
                 :                                          `⚠️ <b>APPROVATA</b> ma executor: ${exec.error || 'errore'}`;
        await tgEdit(chatId, messageId, fmtAction(action) + `\n\n${tag}\n<i>id:</i> <code>${actionId}</code>`);
        return res.status(200).json({ ok: true });
      }

      if (verb === 'reject') {
        await fsPatch(`action_queue/${actionId}`, {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: 'telegram:' + chatId,
        });
        await tgAckCallback(cq.id, 'Rifiutata');
        await tgEdit(chatId, messageId, fmtAction(action) + `\n\n❌ <b>RIFIUTATA</b>\n<i>id:</i> <code>${actionId}</code>`);
        return res.status(200).json({ ok: true });
      }

      if (verb === 'edit') {
        await setState(chatId, { mode: 'awaiting_edit', actionId });
        await tgAckCallback(cq.id, 'Mandami il nuovo testo');
        await tgSend(chatId, `✏️ Mandami il nuovo testo della bozza per <code>${actionId.slice(0, 8)}…</code> in un messaggio.\nOppure /cancel per annullare.`);
        return res.status(200).json({ ok: true });
      }

      await tgAckCallback(cq.id, '?');
      return res.status(200).json({ ok: true });
    }

    // ── Text messages ────────────────────────────────────────────────────
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id;
      const text = String(msg.text || '').trim();

      if (!isAuthorizedChat(chatId)) {
        await tgSend(chatId, '⛔ Non autorizzato. Per autorizzarti, imposta TELEGRAM_CHAT_ID in Vercel a <code>' + chatId + '</code>.');
        return res.status(200).json({ ok: true });
      }

      // /start, /help, /queue, /snapshot, /cancel, /edit <id> <text>
      if (text === '/start' || text === '/help') {
        const help = [
          '<b>BOOM Roma · Cockpit Telegram</b>',
          '',
          'Ricevi notifiche quando Homie propone un\'azione (Tier 2).',
          'Tap sui bottoni per approvare/rifiutare, o:',
          '',
          '• /queue — vedi le pending',
          '• /snapshot — stato portal',
          '• /edit <code>&lt;id&gt; &lt;testo&gt;</code> — modifica la bozza',
          '• /cancel — annulla un edit in corso',
        ].join('\n');
        await tgSend(chatId, help);
        return res.status(200).json({ ok: true });
      }

      if (text === '/cancel') {
        await clearState(chatId);
        await tgSend(chatId, '✓ Annullato.');
        return res.status(200).json({ ok: true });
      }

      if (text === '/queue') {
        await tgSend(chatId, await fmtSnapshot());
        return res.status(200).json({ ok: true });
      }

      if (text === '/snapshot') {
        // Compute the snapshot directly from Firestore (admin token) instead of
        // self-fetching our own HTTP endpoint over VERCEL_URL, which could come
        // back empty and render as a bare "{}".
        try {
          const [leads, contracts, payments, pendingActions] = await Promise.all([
            fsList('leads', { limit: 100 }),
            fsList('contracts', { limit: 100 }),
            fsList('payments', { limit: 100 }),
            fsList('action_queue', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 50 }),
          ]);
          const newLeads = leads.filter(l => l.status === 'new' || !l.status).length;
          const activeC = contracts.filter(c => c.status === 'active').length;
          const unsigned = contracts.filter(c => c.status !== 'draft' && (!c.landlordSignature || !c.tenantSignature)).length;
          const now = new Date();
          const overdue = payments.filter(p => p.status === 'pending' && p.dueDate && new Date(p.dueDate) < now).length;
          await tgSend(chatId, [
            '<b>📊 Snapshot BOOM</b>',
            `👥 Lead: ${leads.length} (${newLeads} nuovi)`,
            `📄 Contratti attivi: ${activeC} · da firmare: ${unsigned}`,
            `💶 Pagamenti scaduti: ${overdue}`,
            `⚡ Azioni in attesa: ${pendingActions.length}`,
          ].join('\n'));
        } catch (e) {
          await tgSend(chatId, '⚠️ Snapshot non disponibile al momento.');
        }
        return res.status(200).json({ ok: true });
      }

      // /edit <id> <new draft>
      if (text.startsWith('/edit ')) {
        const body = text.slice(6).trim();
        const sp = body.indexOf(' ');
        if (sp < 0) {
          await tgSend(chatId, 'Formato: <code>/edit &lt;actionId&gt; &lt;nuovo testo&gt;</code>');
          return res.status(200).json({ ok: true });
        }
        const actionId = body.slice(0, sp);
        const newDraft = body.slice(sp + 1).trim();
        return await applyEdit(chatId, actionId, newDraft, res);
      }

      // Awaiting-edit continuation (user just pressed ✏️)
      const state = await getState(chatId);
      if (state.mode === 'awaiting_edit' && state.actionId) {
        await clearState(chatId);
        return await applyEdit(chatId, state.actionId, text, res);
      }

      // Fallback: tip
      await tgSend(chatId, 'Comando non riconosciuto. /help per le opzioni.');
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true, ignored: 'unhandled_update' });
  } catch (e) {
    console.error('[telegram/webhook]', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
}

async function applyEdit(chatId, actionId, newDraft, res) {
  if (!newDraft) {
    await tgSend(chatId, 'Bozza vuota — niente da fare.');
    return res.status(200).json({ ok: true });
  }
  const action = await fsGet(`action_queue/${actionId}`);
  if (!action) {
    await tgSend(chatId, `Non trovata: <code>${actionId}</code>`);
    return res.status(200).json({ ok: true });
  }
  if (action.status !== 'pending') {
    await tgSend(chatId, `Azione già <b>${action.status}</b> — non posso modificarla.`);
    return res.status(200).json({ ok: true });
  }
  const newPayload = { ...(action.payload || {}), draft: newDraft };
  await fsPatch(`action_queue/${actionId}`, { payload: newPayload, editedAt: new Date(), editedBy: 'telegram:' + chatId });
  await tgSend(chatId, `✓ Bozza aggiornata.\n\n${fmtAction({ ...action, payload: newPayload })}`);
  return res.status(200).json({ ok: true });
}
