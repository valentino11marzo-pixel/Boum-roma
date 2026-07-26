// api/preagreement/_notify.js
// Shared email layer for the pre-agreement suite. One design system for
// every send: black masthead with the gold BOOM wordmark, white paper card,
// the document itself rendered as the real proposal (parties, property,
// transitional lease, money with the fee wording, Egidi footer), gold
// primary actions. Clarity first — every email answers "what is this,
// what's next" in the first two lines.
//
// Used by:
//   api/stripe-webhook.js        → after payment (with Stripe receipt link)
//   api/preagreement/submit.js   → at acceptance when nothing is due
//   api/preagreement/send-sign.js→ 🖊 Magic Sign (tenant sign link)
//   api/preagreement/_auto.js    → silent auto-convert (admin heads-up)
//   api/preagreement/notify.js   → ✉ Reinvia copia
//
// Transport: Nodemailer/Gmail via api/agent/_lib.js sendEmail (GMAIL_USER).
// All sends are best-effort: callers must never fail the client flow on a
// mail error.

import { sendEmail } from '../agent/_lib.js';
import { buildPaPdf } from './_pdf.js';

const ADMIN_EMAIL = 'valentino@boom-rome.com';

// Palette (email-safe, hard-coded — no CSS vars in email clients)
const INK = '#141414';          // near-black text
const SOFT = '#6E6A60';         // secondary text, warm grey
const FAINT = '#98948A';        // tertiary
const HAIR = '#E7E4DC';         // hairlines on paper
const GOLD = '#D4AF37';         // brand gold (chips, CTA fill)
const GOLD_DEEP = '#8A6D1D';    // gold that reads on white paper
const PAPER_BG = '#EFEDE7';     // the desk the paper sits on
const SANS = 'Helvetica Neue,Helvetica,Arial,sans-serif';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const eur = n => '€' + Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: Math.round(Number(n || 0) * 100) % 100 !== 0 ? 2 : 0,
  maximumFractionDigits: 2,
});
const fmtD = s => { try { return new Date(String(s).slice(0, 10) + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return s; } };

// One document row (label left, value right) — email-safe table markup.
function row(k, v, sub) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid ${HAIR};font-family:${SANS};font-size:9.5px;letter-spacing:1.6px;text-transform:uppercase;color:${FAINT};vertical-align:top;white-space:nowrap;padding-right:24px">${esc(k)}</td>
    <td style="padding:10px 0;border-bottom:1px solid ${HAIR};font-family:${SANS};font-size:14px;font-weight:300;color:${INK};text-align:right">${v}${sub ? `<br><span style="font-size:11px;color:${SOFT}">${sub}</span>` : ''}</td>
  </tr>`;
}

// The pre-agreement, as a paper document with gold accents (email-safe HTML).
export function paDocumentHtml(pa, opts = {}) {
  const p = pa.property || {}, le = pa.lease || {}, m = pa.money || {}, t = pa.tenant || {};
  const tenants = Array.isArray(pa.tenants) && pa.tenants.length ? pa.tenants : (t.fullName ? [t] : []);
  const ref = opts.ref || pa.ref || '';
  const paid = !!opts.paidEur;
  const inc = m.utilities === 'included';
  const ec = inc ? 0 : (Number(m.energyCredit) || 0);
  const split = m.depositSplitPct != null ? Number(m.depositSplitPct) : 100;

  const statusChip = paid
    ? `<div style="display:inline-block;margin-top:10px;background:${GOLD};border-radius:100px;padding:6px 14px;font-family:${SANS};font-size:10px;letter-spacing:1.8px;font-weight:bold;color:#1A1407">✓ PAID ${eur(opts.paidEur)}</div>`
    : `<div style="display:inline-block;margin-top:10px;border:1px solid ${GOLD_DEEP};border-radius:100px;padding:6px 14px;font-family:${SANS};font-size:10px;letter-spacing:1.8px;color:${GOLD_DEEP}">✓ ACCEPTED</div>`;

  const head = `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid ${INK};padding-bottom:16px;margin-bottom:4px">
    <tr>
      <td style="font-family:${SANS}">
        <div style="font-size:26px;font-weight:200;color:${INK};letter-spacing:-.3px">Pre-Agreement <span style="color:${FAINT}">· Rental Proposal</span></div>
        <div style="font-size:12px;color:${SOFT};margin-top:5px">${esc(le.type || 'Transitional Lease')} · ${esc(le.lawRef || 'uso transitorio · L.431/98 art.5 c.1')}</div>
      </td>
      <td align="right" style="vertical-align:top;font-family:${SANS}">
        ${ref ? `<div style="display:inline-block;border:1px solid ${GOLD_DEEP};padding:8px 14px;font-size:12px;letter-spacing:1.8px;color:${GOLD_DEEP}">N° ${esc(ref)}</div>` : ''}
        <br>${statusChip}
      </td>
    </tr>
  </table>`;

  const namesLine = tenants.map(x => esc(x.fullName)).filter(Boolean).join(' · ') || 'The Tenant';
  const parties = `
  <div style="margin:18px 0 6px;font-family:${SANS};font-size:13px;font-weight:300;color:${INK};line-height:1.7">
    <span style="color:${FAINT}">Between</span> <b style="font-weight:600">BOOM · Egidi Immobiliare S.r.l.</b>
    <span style="color:${FAINT}">&nbsp;⇄&nbsp;</span> <b style="font-weight:600">${namesLine}</b>
    <span style="color:${FAINT}">&nbsp;·&nbsp; on behalf of the landlord</span> <b style="font-weight:600">${esc((pa.landlord || {}).name || '')}</b>
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

  const dueRow = `<tr>
    <td style="padding:12px 0 12px 14px;border-left:3px solid ${GOLD};background:#FBF8EF;font-family:${SANS};font-size:9.5px;letter-spacing:1.8px;text-transform:uppercase;color:${GOLD_DEEP};white-space:nowrap;padding-right:24px">Due at signing</td>
    <td style="padding:12px 14px 12px 0;background:#FBF8EF;font-family:${SANS};font-size:18px;font-weight:400;color:${INK};text-align:right"><b>${eur(m.dueAtSigning)}</b>${paid ? `<br><span style="font-size:11px;font-weight:300;color:${SOFT}">paid ${opts.paidAt ? fmtD(opts.paidAt) : ''} via Stripe</span>` : ''}</td>
  </tr>`;

  const body = `
  <table width="100%" cellpadding="0" cellspacing="0" style="font-family:${SANS};margin-top:8px">
    ${row('The property', `<b>${esc(p.address || '')}</b>`, [p.type, p.floor, p.condition].filter(Boolean).map(esc).join(' · '))}
    ${row('Lease term', `<b>${fmtD(le.startDate)} → ${fmtD(le.endDate)}</b>`, `${le.months || ''} months · ${esc(le.type || '')}${le.reason ? ' · need: ' + esc(le.reason) : ''}`)}
    ${rentRow}
    ${row('Deposit', `<b>${eur(m.deposit)}</b>`, depSub)}
    ${extrasRows}
    ${row('Agency fee', feeNote, feeWhen)}
    ${dueRow}
    ${t.fullName ? row('Tenant', `<b>${esc(t.fullName)}</b>`, [t.email, t.phone, t.cf].filter(Boolean).map(esc).join(' · ')) : ''}
    ${coTenantRows}
    ${pa.note ? row('Note', esc(pa.note)) : ''}
  </table>`;

  const conditions = `
  <div style="margin-top:20px;padding:14px 16px;background:#F7F5F0;border-radius:10px;font-family:${SANS};font-size:11.5px;font-weight:300;color:${SOFT};line-height:1.75">
    Registered legal contract, filed with the Agenzia delle Entrate · deposit protected and returned at the end of the stay ·
    agency fee ${feeWhen} ·${tenants.length > 1 ? ' all co-tenants jointly and severally liable ·' : ''}
    this document confirms the reservation of the property under the accepted terms (general conditions of the proposal).
  </div>`;

  return head + parties + body + conditions;
}

// ── The shell: black masthead + white paper card on a warm desk ──────────
// Exported: this is THE email design system for the whole platform
// (journey emails, rent receipts, fascicolo) — one look everywhere.
export function shell(inner, preheader) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
  <body style="margin:0;padding:0;background:${PAPER_BG}">
  <span style="display:none;max-height:0;overflow:hidden">${esc(preheader || '')}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER_BG};padding:30px 12px"><tr><td align="center">

    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;border-collapse:separate">
      <tr><td style="background:#0A0A0B;border-radius:16px 16px 0 0;border-bottom:2px solid ${GOLD};padding:20px 34px;text-align:center">
        <span style="font-family:${SANS};font-size:15px;letter-spacing:9px;color:${GOLD};font-weight:300">B O O M</span><br>
        <span style="font-family:${SANS};font-size:8.5px;letter-spacing:3.4px;text-transform:uppercase;color:#8F8A7E">Premium rentals · Roma</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid #E3E0D7;border-top:none;border-radius:0 0 16px 16px;padding:36px 34px 30px">${inner}</td></tr>
    </table>

    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%"><tr>
      <td style="padding:18px 6px;font-family:${SANS};font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:#A6A298;text-align:center">
        Egidi Immobiliare S.r.l. · P.IVA 17322991005 · <a href="https://www.boomrome.com" style="color:#A6A298;text-decoration:none">boomrome.com</a>
      </td>
    </tr></table>
  </td></tr></table></body></html>`;
}

// Primary action — gold pill, dark text (the one thing to tap).
export function btn(href, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px auto 0"><tr>
    <td style="background:${GOLD};border-radius:100px;padding:15px 32px;text-align:center">
      <a href="${esc(href)}" style="font-family:${SANS};font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:#1A1407;text-decoration:none">${esc(label)}</a>
    </td></tr></table>`;
}
// Secondary action — quiet black pill.
export function btn2(href, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:12px auto 0"><tr>
    <td style="background:#141414;border-radius:100px;padding:12px 26px;text-align:center">
      <a href="${esc(href)}" style="font-family:${SANS};font-size:11.5px;letter-spacing:1.4px;color:#FFFFFF;text-decoration:none">${esc(label)}</a>
    </td></tr></table>`;
}
export const para = (html, extra) => `<p style="font-family:${SANS};font-size:14px;font-weight:300;color:#33312C;line-height:1.75;margin:0 0 20px;${extra || ''}">${html}</p>`;
export const fine = (html, extra) => `<p style="font-family:${SANS};font-size:11.5px;font-weight:300;color:${SOFT};line-height:1.7;margin:14px 0 0;${extra || ''}">${html}</p>`;

// "Your contract is ready to sign" — the tenant's Magic-Sign email.
// notifyClient:false = admin heads-up only (the auto pipeline PREPARES the
// contract silently; the admin decides WHEN the client receives the signing
// link, via the console's Magic Sign button → api/preagreement/send-sign).
export async function sendContractSignEmail({ pa, tenantSignUrl, landlordSignUrl, delegate, notifyClient = true }) {
  const t = pa.tenant || {};
  const ll = pa.landlord || {};
  const first = String(t.fullName || '').split(' ')[0] || 'there';
  const addr = (pa.property || {}).address || 'your Rome apartment';
  const results = { client: false, admin: false };

  if (t.email && tenantSignUrl && notifyClient !== false) {
    try {
      await sendEmail({
        to: t.email,
        subject: `Your rental contract is ready to sign — ${addr}`,
        html: shell(
          para(`Ciao ${esc(first)} — great news: your rental contract for <b>${esc(addr)}</b> has been prepared
            from your accepted pre-agreement${pa.ref ? ` (${esc(pa.ref)})` : ''}. Everything you already
            filled in carried over — nothing to re-type. It takes about two minutes to sign digitally:`)
          + btn(tenantSignUrl, 'Review & sign your contract')
          + fine(`Your signature is a legally valid electronic signature (FES — Art. 21 CAD), recorded with a
            signed certificate. After you sign, the landlord countersigns and BOOM files the registration with the
            Agenzia delle Entrate. Questions? Just reply — a human answers. Or
            <a href="https://wa.me/393313251961" style="color:${INK}">WhatsApp BOOM</a>.`, 'margin-top:20px;text-align:center')
          + fine(`From signing onward, your home lives at <a href="https://www.boomrome.com/casa" style="color:${INK}">boomrome.com/casa</a> —
            payments with automatic receipts, documents, requests. First visit? Tap “Password dimenticata” on the login page with this email address.`, 'text-align:center'),
          `Your contract for ${addr} is ready to sign`),
      });
      results.client = true;
    } catch (e) { console.error('[pa/_notify] contract sign email failed:', e.message); }
  }

  try {
    // Landlord-side line: with delega the link is the ADMIN's; without,
    // it goes to the OWNER — one-tap WhatsApp share when we have a phone.
    const waOwner = !delegate && ll.phone && landlordSignUrl
      ? `https://wa.me/${String(ll.phone).replace(/[^\d]/g, '')}?text=${encodeURIComponent(`Ciao ${String(ll.name || '').split(' ')[0]}! Il contratto per ${addr} è pronto per la sua firma digitale (dopo la firma dell'inquilino). Può firmare qui in 2 minuti: ${landlordSignUrl}`)}`
      : null;
    const landlordBlock = delegate
      ? `<p style="font-family:${SANS};font-size:13px;font-weight:300;color:#33312C;line-height:1.8;margin:0">
          ✍️ <b>Il tuo link per la controfirma per delega</b>${delegate.onBehalfOf ? ` (per conto di ${esc(delegate.onBehalfOf)})` : ''} —
          si sblocca dopo la firma dell'inquilino:<br>
          <a href="${esc(landlordSignUrl || '')}" style="color:${INK};word-break:break-all">${esc(landlordSignUrl || '')}</a></p>`
      : `<p style="font-family:${SANS};font-size:13px;font-weight:300;color:#33312C;line-height:1.8;margin:0">
          ✍️ <b>Firma proprietario — ${esc(ll.name || 'il proprietario')}</b> · si sblocca dopo la firma dell'inquilino.
          Inoltragli questo link quando è il momento:<br>
          <a href="${esc(landlordSignUrl || '')}" style="color:${INK};word-break:break-all">${esc(landlordSignUrl || '')}</a></p>`
        + (waOwner ? `<table cellpadding="0" cellspacing="0" style="margin:12px auto 0"><tr>
            <td style="background:#25D366;border-radius:100px;padding:12px 24px;text-align:center">
              <a href="${esc(waOwner)}" style="font-family:${SANS};font-size:12px;letter-spacing:1px;color:#FFFFFF;text-decoration:none">📲 Manda il link firma al proprietario su WhatsApp</a>
            </td></tr></table>` : '');
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: notifyClient !== false
        ? `🖊 Magic Sign inviato — ${t.fullName || ''} · ${addr}`
        : `📋 Contratto PRONTO (non inviato) — ${t.fullName || ''} · ${addr}`,
      html: shell(
        para(`Il pre-agreement ${esc(pa.ref || '')} è chiuso e il contratto è stato <b>creato automaticamente</b> — identità, documenti e termini già dentro.
          ${notifyClient !== false
            ? `Link di firma inviato all'inquilino (${esc(t.email || '—')}).`
            : `<b>Nessuna email al cliente</b>: decidi tu quando — un tocco su <b>🖊 Magic Sign</b> nella console e il link parte.`}`)
        + landlordBlock
        + btn2('https://www.boomrome.com/pre-agreement-admin', 'Apri la console'),
        notifyClient !== false ? 'Magic Sign inviato' : 'Contratto pronto — invia Magic Sign quando vuoi'),
    });
    results.admin = true;
  } catch (e) { console.error('[pa/_notify] admin contract email failed:', e.message); }

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
    ? para(`Ciao ${esc(first)} — your payment is confirmed and <b>${esc(addr)}</b> is reserved for you.
        Below is your pre-agreement as accepted${paidEur ? `, with <b>${eur(paidEur)}</b> received via Stripe` : ''}.
        The signed PDF is attached — keep this email, it is your record. Your BOOM advisor will follow up with the next steps toward the rental contract.`, 'margin-bottom:24px')
    : para(`Ciao ${esc(first)} — your acceptance is recorded and <b>${esc(addr)}</b> is reserved under the terms below.
        The signed PDF is attached — keep this email, it is your record. Your BOOM advisor will follow up with the next steps.`, 'margin-bottom:24px');

  const walletBtn = event === 'paid' || event === 'accepted'
    ? `<table cellpadding="0" cellspacing="0" style="margin:16px auto 0"><tr>
        <td style="background:#000000;border:1px solid #3A3A3A;border-radius:12px;padding:12px 24px;text-align:center">
          <a href="https://www.boomrome.com/api/preagreement/wallet?t=${esc(String(url).split('t=')[1] || '')}" style="font-family:${SANS};font-size:13.5px;font-weight:500;color:#FFFFFF;text-decoration:none">&#63743; Add to Apple Wallet</a>
        </td></tr></table>
      <p style="font-family:${SANS};font-size:10.5px;font-weight:300;color:${FAINT};text-align:center;margin:7px 0 0">La tua prenotazione sempre con te — appare sulla lock screen il giorno del move-in.</p>`
    : '';
  const links = `
    ${btn('https://www.boomrome.com' + url, 'View & print your document')}
    ${walletBtn}
    ${receiptUrl ? fine(`Your Stripe receipt: <a href="${esc(receiptUrl)}" style="color:${INK}">open receipt →</a>`, 'text-align:center') : ''}
    ${fine(`Want it on WhatsApp too? <a href="https://wa.me/?text=${encodeURIComponent(`BOOM pre-agreement${ref ? ' ' + ref : ''} — ${addr}. My copy: https://www.boomrome.com${url}`)}" style="color:${INK}">tap here to save it to a chat →</a>`, 'text-align:center')}
    ${fine(`Questions? Reply to this email or <a href="https://wa.me/393313251961" style="color:${INK}">WhatsApp BOOM</a>.`, 'text-align:center')}`;

  if (t.email && notifyClient !== false) {
    try {
      await sendEmail({
        to: t.email,
        subject: event === 'paid'
          ? `Confirmed — your BOOM pre-agreement ${ref || ''} (receipt inside)`
          : `Accepted — your BOOM pre-agreement ${ref || ''}`,
        html: shell(intro + docHtml + links, `Your pre-agreement for ${addr} — ${event === 'paid' ? 'payment confirmed' : 'accepted'}`),
        attachments,
      });
      results.client = true;
    } catch (e) { console.error('[pa/_notify] client email failed:', e.message); }
  }

  try {
    const nTen = Array.isArray(pa.tenants) ? pa.tenants.length : 1;
    const aIntro = para(`${event === 'paid' ? `💰 <b>PAGATO ${eur(paidEur)}</b> via Stripe` : '✍️ <b>ACCETTATO</b> (nessun importo dovuto via Stripe)'} —
      ${esc(t.fullName || 'cliente')}${nTen > 1 ? ` (+${nTen - 1} co-tenant)` : ''} · ${esc(addr)} · rif <b>${esc(ref || '—')}</b>.
      ${event === 'paid' ? 'Prossimo passo: 🖊 Magic Sign dalla console quando vuoi far firmare il contratto.' : 'Se era previsto un pagamento alla firma, il checkout non è stato completato — controlla.'}`, 'margin-bottom:24px');
    // One-tap: send the client their copy on WhatsApp (deep link, prefilled).
    const waPhone = String(t.phone || '').replace(/[^\d]/g, '');
    const waMsg = `Ciao ${first}! Ecco la copia del tuo pre-agreement BOOM${ref ? ' ' + ref : ''} per ${addr} — la puoi aprire, salvare e stampare qui: https://www.boomrome.com${url}`;
    const waBtn = waPhone ? `<table cellpadding="0" cellspacing="0" style="margin:12px auto 0"><tr>
      <td style="background:#25D366;border-radius:100px;padding:13px 26px;text-align:center">
        <a href="https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}" style="font-family:${SANS};font-size:12px;letter-spacing:1px;color:#FFFFFF;text-decoration:none">📲 Invia la copia al cliente su WhatsApp</a>
      </td></tr></table>` : '';
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: (event === 'paid' ? `💰 PA PAGATO ${eur(paidEur)} — ` : `✍️ PA accettato — `) + (t.fullName || '') + ' · ' + addr,
      html: shell(aIntro + docHtml + btn2('https://www.boomrome.com/pre-agreement-admin', 'Apri la console pre-agreement') + waBtn),
      attachments,
    });
    results.admin = true;
  } catch (e) { console.error('[pa/_notify] admin email failed:', e.message); }

  return results;
}
