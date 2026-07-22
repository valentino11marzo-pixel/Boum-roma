// api/preagreement/_notify.js
// Shared email layer for the pre-agreement suite. Builds the black-and-white
// document email (modeled on the real BOOM rental proposal — parties,
// property, transitional lease, money with the fee "due separately", Egidi
// footer) and sends the client confirmation + the admin copy.
//
// Used by:
//   api/stripe-webhook.js        → after payment (with Stripe receipt link)
//   api/preagreement/submit.js   → at acceptance when nothing is due via Stripe
//
// Transport: Nodemailer/Gmail via api/agent/_lib.js sendEmail (GMAIL_USER).
// All sends are best-effort: callers must never fail the client flow on a
// mail error.

import { sendEmail } from '../agent/_lib.js';
import { sendEmailJS } from '../_emailjs.js';
import { tgNotify } from '../pfs/_health.js';
import { buildPaPdf } from './_pdf.js';

const ADMIN_EMAIL = 'valentino@boom-rome.com';

// Deliver one email with a two-transport strategy: Gmail/Nodemailer first
// (full document HTML + PDF attachment), then EmailJS (the transport every
// other Stripe branch delivers with) carrying the same message via the
// boom_notification template. Returns { sent, via, errors[] } — never throws.
async function deliver({ to, subject, html, attachments, fallback }) {
  const errors = [];
  try {
    await sendEmail({ to, subject, html, attachments });
    return { sent: true, via: 'gmail', errors };
  } catch (e) { errors.push('gmail: ' + e.message); }
  if (fallback) {
    try {
      await sendEmailJS({ to_email: to, card_color: '#D4AF37', ...fallback });
      return { sent: true, via: 'emailjs', errors };
    } catch (e) { errors.push('emailjs: ' + e.message); }
  }
  return { sent: false, via: null, errors };
}

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const eur = n => '€' + Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: Math.round(Number(n || 0) * 100) % 100 !== 0 ? 2 : 0,
  maximumFractionDigits: 2,
});
const fmtD = s => { try { return new Date(String(s).slice(0, 10) + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return s; } };

// One document row (label left, value right) — email-safe table markup.
function row(k, v, sub) {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #e8e8e8;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#8a8a8a;vertical-align:top;white-space:nowrap;padding-right:24px">${esc(k)}</td>
    <td style="padding:9px 0;border-bottom:1px solid #e8e8e8;font-size:14px;color:#111;text-align:right">${v}${sub ? `<br><span style="font-size:11px;color:#8a8a8a">${sub}</span>` : ''}</td>
  </tr>`;
}

// The pre-agreement, as a black-and-white paper document (email-safe HTML).
export function paDocumentHtml(pa, opts = {}) {
  const p = pa.property || {}, le = pa.lease || {}, m = pa.money || {}, t = pa.tenant || {};
  const tenants = Array.isArray(pa.tenants) && pa.tenants.length ? pa.tenants : (t.fullName ? [t] : []);
  const ref = opts.ref || pa.ref || '';
  const paid = !!opts.paidEur;
  const inc = m.utilities === 'included';
  const ec = inc ? 0 : (Number(m.energyCredit) || 0);
  const split = m.depositSplitPct != null ? Number(m.depositSplitPct) : 100;

  const head = `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:4px">
    <tr>
      <td style="font-family:Helvetica,Arial,sans-serif">
        <div style="font-size:11px;letter-spacing:5px;color:#111;font-weight:bold">B O O M</div>
        <div style="font-size:26px;font-weight:200;color:#111;margin-top:8px">Pre-Agreement <span style="color:#8a8a8a">· Rental Proposal</span></div>
        <div style="font-size:12px;color:#8a8a8a;margin-top:4px">${esc(le.type || 'Transitional Lease')} · ${esc(le.lawRef || 'uso transitorio · L.431/98 art.5 c.1')}</div>
      </td>
      <td align="right" style="vertical-align:top;font-family:Helvetica,Arial,sans-serif">
        ${ref ? `<div style="display:inline-block;border:1px solid #111;padding:7px 14px;font-size:12px;letter-spacing:1.6px;color:#111">N° ${esc(ref)}</div>` : ''}
        ${paid ? `<div style="margin-top:8px;font-size:11px;letter-spacing:1.6px;color:#111">✓ PAID ${eur(opts.paidEur)}</div>` : `<div style="margin-top:8px;font-size:11px;letter-spacing:1.6px;color:#111">✓ ACCEPTED</div>`}
      </td>
    </tr>
  </table>`;

  const namesLine = tenants.map(x => esc(x.fullName)).filter(Boolean).join(' · ') || 'The Tenant';
  const parties = `
  <div style="margin:18px 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#111">
    <span style="color:#8a8a8a">Between</span> <b>BOOM · Egidi Immobiliare S.r.l.</b>
    <span style="color:#8a8a8a">&nbsp;⇄&nbsp;</span> <b>${namesLine}</b>
    <span style="color:#8a8a8a">&nbsp;·&nbsp; on behalf of the landlord</span> <b>${esc((pa.landlord || {}).name || '')}</b>
  </div>`;

  const feeAmt = m.feeMode === 'months'
    ? `${m.feeMonths || 1} month${(m.feeMonths || 1) === 1 ? '’s' : 's’'} base rent = ${eur(m.fee)}`
    : (m.feeMode === 'flat' || m.feeFlat != null) ? `${eur(m.fee)} (fixed)`
    : `${m.feePct != null ? m.feePct : 12}% of annual rent = ${eur(m.fee)}`;
  const feeNote = Number(m.fee) > 0
    ? `${feeAmt} + VAT ${m.feeVatPct != null ? m.feeVatPct : 22}% (${eur(m.feeVat)}) = <b>${eur(m.feeTotal)}</b>`
    : 'none for this agreement';
  const feeWhen = m.feeDue === 'move-in' ? 'due upon move-in — not at pre-agreement signing'
    : m.feeDue === 'signing' ? 'due at signing — included in the total due at signing'
    : 'due separately — not at signing';
  const rentRow = ec > 0
    ? row('Monthly total', `<b>${eur(m.monthlyTotal != null ? m.monthlyTotal : (Number(m.rent) || 0) + ec)}</b> /month`,
        `base rent ${eur(m.rent)} + energy credit ${eur(ec)} (covers electricity up to ${eur(ec)}/month)`)
    : row('Monthly rent', `<b>${eur(m.rent)}</b> /month`, inc ? 'all utilities included' : null);
  const depSub = split > 0 && split < 100
    ? `${m.depositMonths || 1} month(s)’ base rent — ${split}% (${eur(m.depositAtSigning != null ? m.depositAtSigning : m.deposit * split / 100)}) at signing, ${100 - split}% (${eur(m.depositAtMoveIn != null ? m.depositAtMoveIn : m.deposit * (100 - split) / 100)}) upon move-in`
    : `${m.depositMonths || 1} month(s) · refundable`;

  const coTenantRows = tenants.slice(1).map(x =>
    row('Co-tenant', `<b>${esc(x.fullName)}</b>`, [x.email, x.phone, x.cf].filter(Boolean).map(esc).join(' · '))).join('');
  const extrasRows = (Array.isArray(pa.extras) ? pa.extras : [])
    .map(x => row(esc(x.label), `<b>${eur(x.amount)}</b>`)).join('');

  const body = `
  <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Helvetica,Arial,sans-serif;margin-top:8px">
    ${row('The property', `<b>${esc(p.address || '')}</b>`, [p.type, p.floor, p.condition].filter(Boolean).map(esc).join(' · '))}
    ${row('Lease term', `<b>${fmtD(le.startDate)} → ${fmtD(le.endDate)}</b>`, `${le.months || ''} months · ${esc(le.type || '')}${le.reason ? ' · need: ' + esc(le.reason) : ''}`)}
    ${rentRow}
    ${row('Deposit', `<b>${eur(m.deposit)}</b>`, depSub)}
    ${extrasRows}
    ${row('Agency fee', feeNote, feeWhen)}
    ${row('Due at signing', `<b style="font-size:16px">${eur(m.dueAtSigning)}</b>`, paid ? `paid ${opts.paidAt ? fmtD(opts.paidAt) : ''} via Stripe` : null)}
    ${t.fullName ? row('Tenant', `<b>${esc(t.fullName)}</b>`, [t.email, t.phone, t.cf].filter(Boolean).map(esc).join(' · ')) : ''}
    ${coTenantRows}
    ${pa.note ? row('Note', esc(pa.note)) : ''}
  </table>`;

  const conditions = `
  <div style="margin-top:18px;padding:13px 15px;background:#f6f6f6;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;color:#555;line-height:1.7">
    Registered legal contract, filed with the Agenzia delle Entrate · deposit protected and returned at the end of the stay ·
    agency fee ${feeWhen} ·${tenants.length > 1 ? ' all co-tenants jointly and severally liable ·' : ''}
    this document confirms the reservation of the property under the accepted terms (general conditions of the proposal).
  </div>`;

  return head + parties + body + conditions;
}

// Full email shell (white paper on neutral background) around the document.
function shell(inner, preheader) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#ececec">
  <span style="display:none;max-height:0;overflow:hidden">${esc(preheader || '')}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ececec;padding:28px 12px"><tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;padding:34px 34px 26px;border:1px solid #ddd">
      <tr><td>${inner}</td></tr>
    </table>
    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%"><tr>
      <td style="padding:16px 6px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9a9a9a;text-align:center">
        Egidi Immobiliare S.r.l. · P.IVA 17322991005 · <a href="https://www.boomrome.com" style="color:#9a9a9a">boomrome.com</a>
      </td>
    </tr></table>
  </td></tr></table></body></html>`;
}

function btn(href, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:22px auto 0"><tr>
    <td style="background:#111;padding:13px 26px;text-align:center">
      <a href="${esc(href)}" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:1px;color:#ffffff;text-decoration:none">${esc(label)}</a>
    </td></tr></table>`;
}

// "Your contract is ready to sign" — the tenant's Magic-Sign email.
// notifyClient:false = admin heads-up only (the auto pipeline PREPARES the
// contract silently; the admin decides WHEN the client receives the signing
// link, via the console's Magic Sign button → api/preagreement/send-sign).
export async function sendContractSignEmail({ pa, tenantSignUrl, landlordSignUrl, delegate, notifyClient = true }) {
  const t = pa.tenant || {};
  const first = String(t.fullName || '').split(' ')[0] || 'there';
  const addr = (pa.property || {}).address || 'your Rome apartment';
  const results = { client: false, admin: false };

  if (t.email && tenantSignUrl && notifyClient !== false) {
    const d = await deliver({
      to: t.email,
      subject: `Your rental contract is ready to sign — ${addr}`,
      html: shell(
        `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.7;margin:0 0 20px">
          Ciao ${esc(first)} — great news: your rental contract for <b>${esc(addr)}</b> has been prepared
          from your accepted pre-agreement${pa.ref ? ` (${esc(pa.ref)})` : ''}. Everything you already
          filled in carried over — nothing to re-type. It takes about two minutes to sign digitally:</p>`
        + btn(tenantSignUrl, 'Review & sign your contract')
        + `<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;line-height:1.7;margin:18px 0 0">
          Your signature is a legally valid electronic signature (FES — Art. 21 CAD), recorded with a
          signed certificate. After you sign, BOOM countersigns and files the registration with the
          Agenzia delle Entrate. Questions? Just reply — a human answers. Or
          <a href="https://wa.me/393313251961" style="color:#111">WhatsApp BOOM</a>.</p>`,
        `Your contract for ${addr} is ready to sign`),
      fallback: {
        heading: 'Your contract is ready to sign',
        subheading: addr,
        name: first,
        intro: `Your rental contract for ${addr} has been prepared from your accepted pre-agreement${pa.ref ? ` (${pa.ref})` : ''}. Everything you filled in carried over — signing takes about two minutes.`,
        card_title: 'How it works',
        r1_icon: '✍️', r1_label: 'Review & sign', r1_value: 'Tap the button below',
        r2_icon: '🔏', r2_label: 'Legally valid', r2_value: 'FES — Art. 21 CAD',
        r3_icon: '🏛', r3_label: 'Registration', r3_value: 'Filed by BOOM with Agenzia delle Entrate',
        r4_icon: '💬', r4_label: 'Questions', r4_value: 'Reply to this email anytime',
        closing: 'A human answers within 2 hours. — BOOM Rome',
        cta_text: 'Review & sign your contract',
        portal_link: tenantSignUrl,
      },
    });
    results.client = d.sent;
    results.clientVia = d.via;
    if (!d.sent) {
      console.error('[pa/_notify] contract sign email failed:', d.errors.join(' | '));
      await tgNotify(`🚨 <b>Magic-Sign email NON consegnata</b>\n${t.fullName || ''} · ${addr} · ${pa.ref || ''}\nEntrambi i trasporti falliti:\n${d.errors.join('\n')}\nLink firma (mandalo tu su WhatsApp): ${tenantSignUrl}`);
    }
  }

  {
    const d = await deliver({
      to: ADMIN_EMAIL,
      subject: notifyClient !== false
        ? `🖊 Magic Sign inviato — ${t.fullName || ''} · ${addr}`
        : `📋 Contratto PRONTO (non inviato) — ${t.fullName || ''} · ${addr}`,
      html: shell(
        `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.7;margin:0 0 20px">
          Il pre-agreement ${esc(pa.ref || '')} è chiuso e il contratto è stato <b>creato automaticamente</b> — identità, documenti e termini già dentro.
          ${notifyClient !== false
            ? `Link di firma inviato all'inquilino (${esc(t.email || '—')}).`
            : `<b>Nessuna email al cliente</b>: decidi tu quando — un tocco su <b>🖊 Magic Sign</b> nella console e il link parte.`}</p>
        <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#333;line-height:1.8">
          ✍️ <b>Il tuo link per la controfirma per delega</b>${delegate && delegate.onBehalfOf ? ` (per conto di ${esc(delegate.onBehalfOf)})` : ''} —
          si sblocca dopo la firma dell'inquilino:<br>
          <a href="${esc(landlordSignUrl || '')}" style="color:#111;word-break:break-all">${esc(landlordSignUrl || '')}</a></p>`
        + btn('https://www.boomrome.com/pre-agreement-admin', 'Apri la console'),
        notifyClient !== false ? 'Magic Sign inviato' : 'Contratto pronto — invia Magic Sign quando vuoi'),
      fallback: {
        heading: notifyClient !== false ? '🖊 Magic Sign inviato' : '📋 Contratto pronto (non inviato)',
        subheading: `${t.fullName || ''} · ${addr}`,
        name: 'Valentino',
        intro: `Pre-agreement ${pa.ref || ''} chiuso, contratto creato automaticamente. ${notifyClient !== false ? `Link di firma inviato a ${t.email || '—'}.` : 'Nessuna email al cliente: parte quando premi 🖊 Magic Sign in console.'}`,
        card_title: 'Controfirma per delega',
        r1_icon: '✍️', r1_label: 'Il tuo link', r1_value: 'Si sblocca dopo la firma inquilino',
        r2_icon: '🔗', r2_label: 'URL', r2_value: landlordSignUrl || '—',
        r3_icon: '👤', r3_label: 'Inquilino', r3_value: t.email || '—',
        r4_icon: '📄', r4_label: 'Rif', r4_value: pa.ref || '—',
        closing: 'Inviato via EmailJS: Gmail/Nodemailer non ha risposto — controlla GMAIL_APP_PASS.',
        cta_text: 'Apri la console',
        portal_link: 'https://www.boomrome.com/pre-agreement-admin',
      },
    });
    results.admin = d.sent;
    if (!d.sent) console.error('[pa/_notify] admin contract email failed:', d.errors.join(' | '));
  }

  return results;
}

// Client + admin emails. `event` is 'paid' | 'accepted'. Never throws.
// notifyClient:false sends only the admin copy (used at acceptance when a
// Stripe payment is still expected — the client gets theirs after paying).
export async function sendPaEmails({ pa, ref, url, receiptUrl, paidEur, paidAt, event, notifyClient = true }) {
  const t = pa.tenant || {};
  const first = String(t.fullName || '').split(' ')[0] || 'there';
  const addr = (pa.property || {}).address || 'your Rome apartment';
  const docHtml = paDocumentHtml(pa, { ref, paidEur, paidAt });
  const results = { client: false, admin: false };

  // The signed document travels WITH the email — a real PDF in the format
  // of the paper proposal (best-effort: a PDF failure never blocks sends).
  let attachments = [];
  try {
    const pdfBuf = await buildPaPdf({ ...pa, ref: ref || pa.ref, paidEur: paidEur || pa.paidEur });
    const safeRef = String(ref || pa.ref || 'BOOM').replace(/[^A-Za-z0-9-]/g, '');
    attachments = [{ filename: `BOOM_Pre-Agreement_${safeRef}.pdf`, content: pdfBuf, contentType: 'application/pdf' }];
  } catch (e) { console.error('[pa/_notify] pdf build failed:', e.message); }

  const intro = event === 'paid'
    ? `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.7;margin:0 0 22px">
        Ciao ${esc(first)} — your payment is confirmed and <b>${esc(addr)}</b> is reserved for you.
        Below is your pre-agreement as accepted${paidEur ? `, with <b>${eur(paidEur)}</b> received via Stripe` : ''}.
        Keep this email — it is your record. Your BOOM advisor will follow up with the next steps toward the rental contract.</p>`
    : `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.7;margin:0 0 22px">
        Ciao ${esc(first)} — your acceptance is recorded and <b>${esc(addr)}</b> is reserved under the terms below.
        Keep this email — it is your record. Your BOOM advisor will follow up with the next steps.</p>`;

  const links = `
    ${btn('https://www.boomrome.com' + url, 'View & print your document')}
    ${receiptUrl ? `<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;text-align:center;margin:14px 0 0">
      Your Stripe receipt: <a href="${esc(receiptUrl)}" style="color:#111">open receipt →</a></p>` : ''}
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;text-align:center;margin:10px 0 0">
      Want it on WhatsApp too? <a href="https://wa.me/?text=${encodeURIComponent(`BOOM pre-agreement${ref ? ' ' + ref : ''} — ${addr}. My copy: https://www.boomrome.com${url}`)}" style="color:#111">tap here to save it to a chat →</a></p>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#777;text-align:center;margin:10px 0 0">
      Questions? Reply to this email or <a href="https://wa.me/393313251961" style="color:#111">WhatsApp BOOM</a>.</p>`;

  if (t.email && notifyClient !== false) {
    const docUrl = 'https://www.boomrome.com' + url;
    const d = await deliver({
      to: t.email,
      subject: event === 'paid'
        ? `Confirmed — your BOOM pre-agreement ${ref || ''} (receipt inside)`
        : `Accepted — your BOOM pre-agreement ${ref || ''}`,
      html: shell(intro + docHtml + links, `Your pre-agreement for ${addr} — ${event === 'paid' ? 'payment confirmed' : 'accepted'}`),
      attachments,
      fallback: {
        heading: event === 'paid' ? 'Payment confirmed ✓' : 'Acceptance recorded ✓',
        subheading: addr,
        name: first,
        intro: event === 'paid'
          ? `Your payment is confirmed and ${addr} is reserved for you${paidEur ? ` — €${paidEur} received via Stripe` : ''}. Your full pre-agreement document (printable, with every term) is one tap away:`
          : `Your acceptance is recorded and ${addr} is reserved under the agreed terms. Your full pre-agreement document (printable, with every term) is one tap away:`,
        card_title: 'Your record',
        r1_icon: '📄', r1_label: 'Reference', r1_value: ref || '—',
        r2_icon: '🏠', r2_label: 'Property', r2_value: addr,
        r3_icon: event === 'paid' ? '💶' : '✍️', r3_label: event === 'paid' ? 'Paid' : 'Status', r3_value: event === 'paid' ? `€${paidEur || ''} via Stripe` : 'Accepted',
        r4_icon: '💬', r4_label: 'Questions', r4_value: 'Reply to this email anytime',
        closing: 'Keep this email — your BOOM advisor will follow up with the next steps toward the rental contract.',
        cta_text: 'View & print your document',
        portal_link: docUrl,
      },
    });
    results.client = d.sent;
    results.clientVia = d.via;
    if (!d.sent) {
      console.error('[pa/_notify] client email failed:', d.errors.join(' | '));
      await tgNotify(`🚨 <b>Email pre-agreement al cliente NON consegnata</b>\n${event === 'paid' ? `💰 PAGATO €${paidEur || '?'}` : '✍️ accettato'} · ${t.fullName || ''} (${t.email}) · ${addr} · ${ref || ''}\nEntrambi i trasporti falliti:\n${d.errors.join('\n')}\nCopia del documento (mandala tu su WhatsApp): https://www.boomrome.com${url}`);
    }
  }

  try {
    const nTen = Array.isArray(pa.tenants) ? pa.tenants.length : 1;
    const aIntro = `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.7;margin:0 0 22px">
      ${event === 'paid' ? `💰 <b>PAGATO ${eur(paidEur)}</b> via Stripe` : '✍️ <b>ACCETTATO</b> (nessun importo dovuto via Stripe)'} —
      ${esc(t.fullName || 'cliente')}${nTen > 1 ? ` (+${nTen - 1} co-tenant)` : ''} · ${esc(addr)} · rif <b>${esc(ref || '—')}</b>.
      ${event === 'paid' ? 'Prossimo passo: dalla console pre-agreement, “→ Contratto” lo converte in contratto con Magic Sign (tu firmi per delega quando vuoi).' : 'Se era previsto un pagamento alla firma, il checkout non è stato completato — controlla.'}</p>`;
    // One-tap: send the client their copy on WhatsApp (deep link, prefilled).
    const waPhone = String(t.phone || '').replace(/[^\d]/g, '');
    const waMsg = `Ciao ${first}! Ecco la copia del tuo pre-agreement BOOM${ref ? ' ' + ref : ''} per ${addr} — la puoi aprire, salvare e stampare qui: https://www.boomrome.com${url}`;
    const waBtn = waPhone ? `<table cellpadding="0" cellspacing="0" style="margin:10px auto 0"><tr>
      <td style="background:#25D366;padding:13px 26px;text-align:center">
        <a href="https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:1px;color:#ffffff;text-decoration:none">📲 Invia la copia al cliente su WhatsApp</a>
      </td></tr></table>` : '';
    const d = await deliver({
      to: ADMIN_EMAIL,
      subject: (event === 'paid' ? `💰 PA PAGATO ${eur(paidEur)} — ` : `✍️ PA accettato — `) + (t.fullName || '') + ' · ' + addr,
      html: shell(aIntro + docHtml + btn('https://www.boomrome.com/pre-agreement-admin', 'Apri la console pre-agreement') + waBtn),
      attachments,
      fallback: {
        heading: event === 'paid' ? `💰 PA PAGATO ${eur(paidEur)}` : '✍️ PA accettato',
        subheading: `${t.fullName || 'cliente'} · ${addr}`,
        name: 'Valentino',
        intro: `${event === 'paid' ? `Pagato ${eur(paidEur)} via Stripe` : 'Accettato (niente dovuto via Stripe)'} — rif ${ref || '—'}. Documento completo: https://www.boomrome.com${url}`,
        card_title: 'Dettagli',
        r1_icon: '👤', r1_label: 'Cliente', r1_value: `${t.fullName || '—'} (${t.email || '—'})`,
        r2_icon: '📱', r2_label: 'Telefono', r2_value: t.phone || '—',
        r3_icon: '🏠', r3_label: 'Immobile', r3_value: addr,
        r4_icon: '📄', r4_label: 'Rif', r4_value: ref || '—',
        closing: 'Inviato via EmailJS: Gmail/Nodemailer non ha risposto — controlla GMAIL_APP_PASS.',
        cta_text: 'Apri la console pre-agreement',
        portal_link: 'https://www.boomrome.com/pre-agreement-admin',
      },
    });
    results.admin = d.sent;
    if (!d.sent) console.error('[pa/_notify] admin email failed:', d.errors.join(' | '));
  } catch (e) { console.error('[pa/_notify] admin email failed:', e.message); }

  return results;
}
