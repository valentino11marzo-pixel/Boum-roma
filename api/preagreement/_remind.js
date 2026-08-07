// api/preagreement/_remind.js
// The gentle 24-hour nudge: a client accepted their pre-agreement, a payment
// was due at signing, and Stripe never completed. One email, once, with the
// document and a resume-payment link. Called from reminder-cron (best-effort;
// a failure here must never take the cron down).

import { fsList, fsPatch, logActivity } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { paDocumentHtml } from './_notify.js';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export async function runPaReminders() {
  const rows = await fsList('preAgreements', {
    filter: { field: 'status', op: 'EQUAL', value: 'accepted' },
    limit: 100,
  });
  const now = Date.now();
  const due = rows.filter(pa => {
    const money = pa.money || {};
    const t = pa.tenant || {};
    const acceptedAt = Date.parse(pa.acceptedAt || '') || 0;
    return Number(money.dueAtSigning) > 0
      && t.email
      && !pa.paidAt
      && !pa.remindedAt
      && acceptedAt > 0
      && (now - acceptedAt) > DAY        // give them a real day first
      && (now - acceptedAt) < WEEK;      // after a week it's the advisor's call, not a bot's
  }).slice(0, 5);                        // cap per run; the cron comes back in 15 minutes

  let sent = 0;
  for (const row of due) {
    const { id, ...pa } = row;
    const t = pa.tenant || {};
    const first = String(t.fullName || '').split(' ')[0] || 'there';
    const addr = (pa.property || {}).address || 'your Rome apartment';
    const url = 'https://www.boomrome.com/pre-agreement?t=' + pa.token;
    const eur = '€' + Number((pa.money || {}).dueAtSigning || 0).toLocaleString('en-US');
    try {
      await sendEmail({
        to: t.email,
        subject: `One step left — ${addr} is still yours to lock`,
        html: '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#ececec">'
          + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#ececec;padding:28px 12px"><tr><td align="center">'
          + '<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;padding:34px;border:1px solid #ddd"><tr><td>'
          + `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.7;margin:0 0 20px">Ciao ${first} — yesterday you signed the pre-agreement for <b>${addr}</b>, and it's still reserved under your name. Only the payment step (${eur}) is missing to lock it completely. It takes one minute:</p>`
          + `<table cellpadding="0" cellspacing="0" style="margin:0 auto 24px"><tr><td style="background:#111;padding:13px 26px"><a href="${url}" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:1px;color:#fff;text-decoration:none">Complete your reservation →</a></td></tr></table>`
          + paDocumentHtml(pa, { ref: pa.ref })
          + `<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;text-align:center;margin:18px 0 0">Changed plans or have a question? Just reply — a human answers. <a href="https://wa.me/393313251961" style="color:#111">WhatsApp BOOM</a></p>`
          + '</td></tr></table></td></tr></table></body></html>',
      });
      await fsPatch(`preAgreements/${id}`, { remindedAt: new Date().toISOString() });
      logActivity('preagreement_reminder', 'preagreement', { id, ref: pa.ref || '', email: t.email }, 'remind-cron').catch(() => {});
      sent++;
    } catch (e) {
      console.error('[pa/_remind]', id, e.message);
    }
  }
  return { checked: rows.length, sent };
}
