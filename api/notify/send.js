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
//           (icon/label/value), closing, cta_text, portal_link (≤ 2048
//           caratteri: un link più lungo è 400 bad_link, mai troncato),
//           lang? ('it'|'en', il piede; senza, dedotta dal testo).
// Headers:  Authorization: Bearer <firebase-id-token> (admin/owner/landlord)
// Response: { ok } | { ok:false, error }
//
// I tenant NON passano di qui: un endpoint che spedisce email a
// destinatari arbitrari con il marchio BOOM è roba da operatore.
//
// IL PROPRIETARIO NON È L'OPERATORE (12/10/2026). Con l'account di una
// proprietaria esterna il ruolo 'landlord' bastava a mandare, dalla casella
// Gmail di BOOM e col marchio BOOM, un'email a QUALSIASI indirizzo con un
// bottone verso QUALSIASI URL: phishing col nostro nome. Ora, per chi non è
// admin:
//   - il destinatario è BOOM (l'operatore), lei stessa, o un inquilino /
//     co-intestatario dei contratti dei SUOI immobili — altri: 403;
//   - il bottone porta solo su https://www.boomrome.com (o boomrome.com).
// L'admin resta libero (link http/https qualunque: anteprime, Wallet).

import { requireRole, setCors } from '../_auth.js';
import { readJson, fsList, fsGetMany } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, rule } from '../preagreement/_notify.js';

const clip = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const esc = (s) => clip(s, 1200).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Rate per utente: le notifiche legittime sono raffiche corte (3-4 per
// evento), non centinaia — un client impazzito non svuota il quota Gmail.
const RL = new Map(); const RL_WINDOW = 60_000, RL_MAX = 30;
const rateOk = (uid) => { const n = Date.now(); const e = RL.get(uid); if (!e || n - e.t >= RL_WINDOW) { RL.set(uid, { c: 1, t: n }); return true; } e.c++; return e.c <= RL_MAX; };

const low = (v) => String(v == null ? '' : v).trim().toLowerCase();

// Il bottone porta spesso un link di Storage firmato (token nel query string,
// percorso codificato): 300 caratteri lo tagliavano e il tasto apriva un 403.
// Il tetto è ora quello di un URL ragionevole; oltre, la richiesta si
// RIFIUTA (400 bad_link) invece di spedire un link troncato in silenzio.
export const PORTAL_LINK_MAX = 2048;

// La lingua dell'email, per il piede: `params.lang` ('it'|'en') vince; senza,
// la si legge dalle parole del messaggio (i template del portal agli inquilini
// sono in inglese, quelli all'operatore e ai proprietari in italiano). Pareggio
// o nessun indizio → italiano, la lingua di sempre del portal. Pura.
const IT_CUES = /\b(il|lo|la|gli|le|di|del|della|dei|per|con|tuo|tua|nuovo|nuova|pagamento|notifica|scadenza|ricevuto|ricevuta|inquilino|proprietario|immobile|rata|contratto|manutenzione|aggiornamento|apri|è|sono)\b/gi;
const EN_CUES = /\b(the|your|you|has|been|with|new|payment|notification|maintenance|due|received|tenant|landlord|property|view|update|contract|open|please|is|are)\b/gi;
export function emailLang(p) {
  const declared = low(p && p.lang);
  if (declared === 'it' || declared === 'en') return declared;
  const text = ['heading', 'subheading', 'intro', 'card_title', 'closing', 'cta_text', 'r1_label', 'r2_label', 'r3_label', 'r4_label']
    .map(k => String((p && p[k]) || '')).join(' ');
  const it = (text.match(IT_CUES) || []).length, en = (text.match(EN_CUES) || []).length;
  return en > it ? 'en' : 'it';
}
export const FOOTER = { it: 'Messaggio automatico del BOOM Portal.', en: 'Automated message from the BOOM Portal.' };
// Il bottone dell'email: l'admin può puntare ovunque (http/https), gli altri
// solo al sito di BOOM. Pura: si testa senza rete.
export function linkAllowed(raw, isAdmin) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return false; }
  if (isAdmin) return u.protocol === 'https:' || u.protocol === 'http:';
  return u.protocol === 'https:' && (u.hostname === 'www.boomrome.com' || u.hostname === 'boomrome.com') && !u.username && !u.password;
}
// Gli indirizzi di BOOM a cui chiunque nel portal può scrivere.
export function boomAddresses() {
  // valentino@boomrome.com è l'inoltro di ogni notifica del portal
  // (NOTIFY_OWNER in portal-app.js), anche quando la scatena la proprietaria.
  return new Set(['valentino@boom-rome.com', 'valentino@boomrome.com', 'info@boomrome.com', process.env.ADMIN_NOTIFY_EMAIL, process.env.GMAIL_USER, process.env.CAF_EMAIL]
    .map(low).filter(Boolean));
}
// A chi può scrivere una proprietaria: BOOM, sé stessa, gli inquilini e i
// co-intestatari dei contratti dei suoi immobili (dal contratto o dal
// profilo dell'inquilino). → true | false
export async function landlordMayEmail(auth, to) {
  const target = low(to);
  if (boomAddresses().has(target)) return true;
  if (target === low(auth.email) || target === low(auth.profile && auth.profile.email)) return true;
  const props = await fsList('properties', { filter: { field: 'ownerId', op: 'EQUAL', value: auth.uid }, limit: 300 });
  const pids = (props || []).map(p => p.id).filter(Boolean);
  const tenantIds = new Set();
  for (let i = 0; i < pids.length; i += 30) {
    const chunk = pids.slice(i, i + 30);
    const rows = await fsList('contracts', { filter: chunk.length === 1
      ? { field: 'propertyId', op: 'EQUAL', value: chunk[0] } : { field: 'propertyId', op: 'IN', value: chunk }, limit: 500 });
    for (const c of rows || []) {
      if (low(c.tenantEmail) === target) return true;
      if ((Array.isArray(c.coTenants) ? c.coTenants : []).some(x => x && low(x.email) === target)) return true;
      if (c.tenantId) tenantIds.add(String(c.tenantId));
    }
  }
  if (!tenantIds.size) return false;
  const users = await fsGetMany([...tenantIds].map(id => 'users/' + id));
  for (const u of users.values()) if (u && low(u.email) === target) return true;
  return false;
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
  const isAdmin = auth.profile.role === 'admin';
  if (p.portal_link && (String(p.portal_link).length > PORTAL_LINK_MAX || !linkAllowed(p.portal_link, isAdmin))) return res.status(400).json({ ok: false, error: 'bad_link' });
  if (!isAdmin) {
    let okTo;
    try { okTo = await landlordMayEmail(auth, to); }
    catch (e) { console.warn('[notify/send] recipient check:', e.message); return res.status(503).json({ ok: false, error: 'recipient_check_failed' }); }
    if (!okTo) return res.status(403).json({ ok: false, error: 'recipient_not_allowed' });
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
    + (p.portal_link && p.cta_text ? btn(String(p.portal_link).trim(), esc(p.cta_text)) : '')
    + fine(FOOTER[emailLang(p)]);

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
