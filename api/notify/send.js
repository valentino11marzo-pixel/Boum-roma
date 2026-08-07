// api/notify/send.js
// IL PONTE EMAIL DEL PORTAL — sostituisce EmailJS browser-side (audit
// 2026-08, D1). Prima 16 punti del portal spedivano col template
// "notification" DAL BROWSER: se la tab moriva l'email non partiva, e
// l'identità visiva era un'altra rispetto al design system della
// piattaforma. Ora sendBoomEmail() (stessa firma, chiamanti intatti)
// POSTa qui: il server veste il messaggio col design system condiviso
// (masthead nero, oro, carta bianca) e spedisce via Nodemailer.
//
// Method:   POST { to, params } — params è l'oggetto del vecchio template
//           EmailJS: heading, subheading, intro, card_title, r1..r4
//           (icon/label/value), closing, cta_text, portal_link.
// Headers:  Authorization: Bearer <firebase-id-token> (admin/owner/landlord)
// Response: { ok } | { ok:false, error }
//
// I tenant NON passano di qui: un endpoint che spedisce email a
// destinatari arbitrari con il marchio BOOM è roba da operatore.

import { requireRole, setCors } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, rule } from '../preagreement/_notify.js';

const clip = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const esc = (s) => clip(s, 1200).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Rate per utente: le notifiche legittime sono raffiche corte (3-4 per
// evento), non centinaia — un client impazzito non svuota il quota Gmail.
const RL = new Map(); const RL_WINDOW = 60_000, RL_MAX = 30;
const rateOk = (uid) => { const n = Date.now(); const e = RL.get(uid); if (!e || n - e.t >= RL_WINDOW) { RL.set(uid, { c: 1, t: n }); return true; } e.c++; return e.c <= RL_MAX; };

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;
  if (!rateOk(auth.uid)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const to = clip((body || {}).to, 120);
  const p = (body || {}).params || {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ ok: false, error: 'bad_recipient' });

  const heading = clip(p.heading, 140) || clip(p.card_title, 140) || 'Notifica BOOM';
  const rows = [1, 2, 3, 4]
    .map((i) => ({ icon: clip(p['r' + i + '_icon'], 4), label: clip(p['r' + i + '_label'], 60), value: clip(p['r' + i + '_value'], 240) }))
    .filter((r) => r.label && r.value);

  const inner =
    (p.subheading ? para(`<strong>${esc(p.subheading)}</strong>`) : '')
    + (p.intro ? para(esc(p.intro)) : '')
    + (rows.length
      ? rule() + rows.map((r) => fine(`${esc(r.icon)} <strong>${esc(r.label)}</strong> — ${esc(r.value)}`)).join('') + rule()
      : '')
    + (p.closing ? para(esc(p.closing).replace(/\n/g, '<br>')) : '')
    + (p.portal_link && p.cta_text ? btn(clip(p.portal_link, 300), esc(p.cta_text)) : '')
    + fine('Messaggio automatico del BOOM Portal.');

  try {
    await Promise.race([
      sendEmail({ to, subject: heading, html: shell(inner, clip(p.intro, 90) || heading) }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 12000)),
    ]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.warn('[notify/send]', to, e.message);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
}
