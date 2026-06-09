// api/telegram/setup.js — one-click Telegram activation (admin-only).
// Finishing Telegram = set 3 env vars on Vercel + hit this endpoint once:
//   - registers the webhook to production (with the secret header)
//   - verifies via getWebhookInfo
//   - sends a confirmation message to TELEGRAM_CHAT_ID
//
// Auth: X-Firebase-Token (admin browser) OR X-Homie-Secret.
// POST /api/telegram/setup   body (optional): { url, drop:true }

import { guardPost } from "../agent/_lib.js";
import { tgCall, tgSend } from "./_lib.js";

const WEBHOOK_URL = "https://boomrome.com/api/telegram/webhook";

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const env = process.env;
  const have = {
    TELEGRAM_BOT_TOKEN: !!env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: !!env.TELEGRAM_CHAT_ID,
    TELEGRAM_WEBHOOK_SECRET: !!env.TELEGRAM_WEBHOOK_SECRET,
  };
  if (!have.TELEGRAM_BOT_TOKEN) {
    return res.status(400).json({ ok: false, error: "missing_TELEGRAM_BOT_TOKEN", have,
      nextStep: "Imposta TELEGRAM_BOT_TOKEN (da @BotFather) su Vercel, redeploy, poi rilancia." });
  }

  const url = (body.url && /^https:\/\/\S+$/.test(body.url)) ? body.url : WEBHOOK_URL;
  try {
    await tgCall("setWebhook", {
      url,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: !!body.drop,
    });
    const info = await tgCall("getWebhookInfo", {});

    let testMessageSent = false;
    if (env.TELEGRAM_CHAT_ID) {
      try {
        await tgSend(env.TELEGRAM_CHAT_ID,
          "✅ <b>BOOM × Telegram connesso.</b>\nDa ora ricevi qui le azioni di Homie con i bottoni Approva / Rifiuta.");
        testMessageSent = true;
      } catch (e) { /* bot not started by the user yet */ }
    }

    const nextStep = testMessageSent
      ? "Controlla Telegram: c'è il messaggio di conferma. Approva una pending dal Command Center per testare i bottoni."
      : (env.TELEGRAM_CHAT_ID
          ? "Webhook impostato, ma il messaggio di test non è partito: apri una chat col bot e premi Start, poi rilancia."
          : "Webhook impostato. Manca TELEGRAM_CHAT_ID (il tuo user id): impostalo per ricevere i messaggi.");

    console.log(`[telegram/setup] url=${url} secret=${have.TELEGRAM_WEBHOOK_SECRET} testMsg=${testMessageSent} pending=${info.pending_update_count} lastErr=${info.last_error_message || "-"}`);

    return res.status(200).json({
      ok: true,
      have,
      webhook: {
        url: info.url,
        pending: info.pending_update_count,
        lastError: info.last_error_message || null,
        secretHeaderEnabled: have.TELEGRAM_WEBHOOK_SECRET,
      },
      testMessageSent,
      nextStep,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message), have,
      nextStep: "Telegram ha rifiutato la chiamata: verifica che TELEGRAM_BOT_TOKEN sia corretto." });
  }
}
