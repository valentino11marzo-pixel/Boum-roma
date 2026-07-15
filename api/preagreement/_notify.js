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

const ADMIN_EMAIL = 'valentino@boom-rome.com';

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
  const ref = opts.ref || pa.ref || '';
  const paid = !!opts.paidEur;

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

  const parties = `
  <div style="margin:18px 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#111">
    <span style="color:#8a8a8a">Between</span> <b>BOOM · Egidi Immobiliare S.r.l.</b>
    <span style="color:#8a8a8a">&nbsp;⇄&nbsp;</span> <b>${esc(t.fullName || 'The Tenant')}</b>
    <span style="color:#8a8a8a">&nbsp;·&nbsp; on behalf of the landlord</span> <b>${esc((pa.landlord || {}).name || '')}</b>
  </div>`;

  const feeNote = !m.feeTotal
    ? 'none for this agreement'
    : `${m.feeFlat != null ? '' : (m.feePct != null ? m.feePct : 12) + '% of annual rent = '}${eur(m.fee)} + VAT ${m.feeVatPct != null ? m.feeVatPct : 22}% (${eur(m.feeVat)}) = <b>${eur(m.feeTotal)}</b>`;

  const body = `
  <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Helvetica,Arial,sans-serif;margin-top:8px">
    ${row('The property', `<b>${esc(p.address || '')}</b>`, [p.type, p.floor, p.condition].filter(Boolean).map(esc).join(' · '))}
    ${row('Lease term', `<b>${fmtD(le.startDate)} → ${fmtD(le.endDate)}</b>`, `${le.months || ''} months · ${esc(le.type || '')}${le.reason ? ' · need: ' + esc(le.reason) : ''}`)}
    ${row('Monthly rent', `<b>${eur(m.rent)}</b> /month`)}
    ${row('Deposit', `<b>${eur(m.deposit)}</b>`, `${m.depositMonths || 1} month(s) · refundable`)}
    ${row('Agency fee', feeNote, 'due separately — not at signing')}
    ${row('Due at signing', `<b style="font-size:16px">${eur(m.dueAtSigning)}</b>`, paid ? `paid ${opts.paidAt ? fmtD(opts.paidAt) : ''} via Stripe` : null)}
    ${t.fullName ? row('Tenant', `<b>${esc(t.fullName)}</b>`, [t.email, t.phone].filter(Boolean).map(esc).join(' · ')) : ''}
    ${pa.note ? row('Note', esc(pa.note)) : ''}
  </table>`;

  const conditions = `
  <div style="margin-top:18px;padding:13px 15px;background:#f6f6f6;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;color:#555;line-height:1.7">
    Registered legal contract, filed with the Agenzia delle Entrate · deposit protected and returned at the end of the stay ·
    agency fee due separately per the agreement · this document confirms the reservation of the property under the accepted terms (conditions 5.1–5.7 of the proposal).
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

// Client + admin emails. `event` is 'paid' | 'accepted'. Never throws.
// notifyClient:false sends only the admin copy (used at acceptance when a
// Stripe payment is still expected — the client gets theirs after paying).
export async function sendPaEmails({ pa, ref, url, receiptUrl, paidEur, paidAt, event, notifyClient = true }) {
  const t = pa.tenant || {};
  const first = String(t.fullName || '').split(' ')[0] || 'there';
  const addr = (pa.property || {}).address || 'your Rome apartment';
  const docHtml = paDocumentHtml(pa, { ref, paidEur, paidAt });
  const results = { client: false, admin: false };

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
      Questions? Reply to this email or <a href="https://wa.me/393313251961" style="color:#111">WhatsApp BOOM</a>.</p>`;

  if (t.email && notifyClient !== false) {
    try {
      await sendEmail({
        to: t.email,
        subject: event === 'paid'
          ? `Confirmed — your BOOM pre-agreement ${ref || ''} (receipt inside)`
          : `Accepted — your BOOM pre-agreement ${ref || ''}`,
        html: shell(intro + docHtml + links, `Your pre-agreement for ${addr} — ${event === 'paid' ? 'payment confirmed' : 'accepted'}`),
      });
      results.client = true;
    } catch (e) { console.error('[pa/_notify] client email failed:', e.message); }
  }

  try {
    const aIntro = `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.7;margin:0 0 22px">
      ${event === 'paid' ? `💰 <b>PAGATO ${eur(paidEur)}</b> via Stripe` : '✍️ <b>ACCETTATO</b> (nessun importo dovuto via Stripe)'} —
      ${esc(t.fullName || 'cliente')} · ${esc(addr)} · rif <b>${esc(ref || '—')}</b>.
      ${event === 'paid' ? 'Prossimo passo: prepara il contratto nel portal e mandalo in firma con Magic Sign.' : 'Se era previsto un pagamento alla firma, il checkout non è stato completato — controlla.'}</p>`;
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: (event === 'paid' ? `💰 PA PAGATO ${eur(paidEur)} — ` : `✍️ PA accettato — `) + (t.fullName || '') + ' · ' + addr,
      html: shell(aIntro + docHtml + btn('https://www.boomrome.com/pre-agreement-admin', 'Apri la console pre-agreement')),
    });
    results.admin = true;
  } catch (e) { console.error('[pa/_notify] admin email failed:', e.message); }

  return results;
}
