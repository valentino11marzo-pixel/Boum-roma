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
//
// E il proprietario? Il portale in modalità landlord la usa (manutenzione,
// pagamenti segnalati → l'inquilino e BOOM), ma fino al 30/09/2026 un
// landlord poteva scrivere a CHIUNQUE, col marchio e la casella Gmail di BOOM
// e un bottone verso un URL a scelta: un relay di phishing con la nostra
// firma. Con l'area proprietario gli account li creiamo noi, per tutti. Ora
// per un non-admin i destinatari sono SOLO: sé stesso, BOOM, e gli inquilini
// (e co-inquilini) dei SUOI immobili; il bottone solo verso boomrome.com.

import { requireRole, setCors } from '../_auth.js';
import { readJson, fsList } from '../homie/_lib.js';
import { ownerKeys, ownerProperties, normEmail } from '../owners/_owner.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, rule } from '../preagreement/_notify.js';

const clip = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const esc = (s) => clip(s, 1200).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Rate per utente: le notifiche legittime sono raffiche corte (3-4 per
// evento), non centinaia — un client impazzito non svuota il quota Gmail.
const RL = new Map(); const RL_WINDOW = 60_000, RL_MAX = 30;
const rateOk = (uid) => { const n = Date.now(); const e = RL.get(uid); if (!e || n - e.t >= RL_WINDOW) { RL.set(uid, { c: 1, t: n }); return true; } e.c++; return e.c <= RL_MAX; };

const BOOM_LINK = /^https:\/\/(www\.)?boomrome\.com(\/|$)/;

// Chi può ricevere un'email mandata da un proprietario: sé stesso, BOOM, e le
// persone sui contratti dei SUOI immobili. Esportata per i test.
export async function landlordRecipients(auth) {
  const out = new Set();
  const add = (e) => { const n = normEmail(e); if (n) out.add(n); };
  add(auth.email); // l'email dell'account, non quella del profilo (che l'utente può riscrivere)
  add(process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com');
  add(process.env.GMAIL_USER);
  const props = await ownerProperties(await ownerKeys(auth.uid, auth.profile || {}));
  const lists = await Promise.all(props.map((pr) =>
    fsList('contracts', { filter: { field: 'propertyId', op: 'EQUAL', value: pr.id }, limit: 50 }).catch(() => [])));
  for (const list of lists) for (const c of list || []) {
    add(c.tenantEmail);
    for (const co of Array.isArray(c.coTenants) ? c.coTenants : []) add((co || {}).email);
  }
  return out;
}

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
  if (auth.profile.role !== 'admin') {
    const allowed = await landlordRecipients(auth).catch(() => new Set());
    if (!allowed.has(normEmail(to))) return res.status(403).json({ ok: false, error: 'recipient_not_allowed' });
    if (p.portal_link && !BOOM_LINK.test(String(p.portal_link))) p.portal_link = '';
  }

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
