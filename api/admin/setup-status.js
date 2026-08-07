// api/admin/setup-status.js — configuration self-check (admin)
//
// Returns which env-var groups are configured (booleans only — never the
// values). /team renders the missing ones as a setup banner with the exact
// fix, so "what's left to configure" is answered by the console itself
// instead of a docs hunt.

import { requireCronOrAdmin } from '../pfs/_guard.js';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const has = (...keys) => keys.every(k => !!process.env[k]);
  return res.status(200).json({
    ok: true,
    status: {
      firebaseAdmin: has('FIREBASE_API_KEY', 'FIREBASE_ADMIN_EMAIL', 'FIREBASE_ADMIN_PASS'),
      cron: has('CRON_SECRET'),
      gmail: has('GMAIL_USER', 'GMAIL_APP_PASS'),
      telegram: has('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'),
      anthropic: has('ANTHROPIC_API_KEY'),
      gocardless: has('GOCARDLESS_SECRET_ID', 'GOCARDLESS_SECRET_KEY'),
      accountingEmail: has('ACCOUNTING_EMAIL'),
    },
  });
}
