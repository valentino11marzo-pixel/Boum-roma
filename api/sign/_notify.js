// api/sign/_notify.js
// Stage notifications for the signing lifecycle (server-side, Nodemailer — so
// they fire even when signing happened on /sign with no portal open).
//
//   • notifyPartialSignature(contract, signedRole, property)
//       After ONE party signs: confirm the signer, and nudge the counterparty
//       to sign with their own single-use /sign link.
//   • notifyAdminContractSigned(contract, property)
//       Milestone email to the BOOM inbox when a contract is fully signed
//       (the party-facing welcomes live in _finalize.js).
//
// Everything here is best-effort and time-boxed; this module never throws, so
// it can never block or fail a signature.

import { fsGet } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';

const BASE = 'https://www.boomrome.com';
const GOLD = '#B8860B';

async function gather(contract, property) {
  const prop = property
    || (contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null)
    || {};
  const ownerId = prop.ownerId;
  const tenant    = contract.tenantId ? await fsGet('users/' + contract.tenantId).catch(() => null) : null;
  const landlordU = ownerId ? await fsGet('users/' + ownerId).catch(() => null) : null;
  const landlordR = ownerId ? await fsGet('landlords/' + ownerId).catch(() => null) : null;
  return { prop, tenant, landlordU, landlordR, propLabel: prop.address || prop.name || 'the property' };
}

// After exactly one party has signed.
// opts.nudgeOnly: skip the signer's own confirmation (used by the cron
// re-nudge, which would otherwise re-send "your signature is recorded").
export async function notifyPartialSignature(contract, signedRole, property, opts = {}) {
  try {
    const g = await gather(contract, property);
    const signer = signedRole === 'tenant' ? g.tenant : g.landlordU;
    const other  = signedRole === 'tenant' ? g.landlordU : g.tenant;
    const otherR = signedRole === 'tenant' ? g.landlordR : null;
    const otherToken = signedRole === 'tenant' ? contract.landlordSignToken : contract.tenantSignToken;
    const otherRoleLabel = signedRole === 'tenant' ? 'landlord' : 'tenant';

    const signerEmail = (signer && signer.email) || '';
    const signerName  = (signer && signer.name) || 'there';
    const otherEmail  = (other && other.email) || (otherR && otherR.email) || '';
    const otherName   = (other && other.name) || (otherR && otherR.name) || 'there';

    const jobs = [];
    if (signerEmail && !opts.nudgeOnly) {
      jobs.push(send(signerEmail, 'Your signature is recorded ✓', emailShell('Signature recorded', `
        <p style="margin:0 0 14px">Hi ${esc(signerName)},</p>
        <p style="margin:0 0 16px">Thank you — your signature for <b>${esc(g.propLabel)}</b> is <b style="color:${GOLD}">recorded</b>. We’re now waiting for the ${esc(otherRoleLabel)} to sign, and we’ll confirm the moment the contract is fully signed.</p>
      `)));
    }
    if (otherEmail && otherToken) {
      const link = `${BASE}/sign?sign=${encodeURIComponent(otherToken)}`;
      jobs.push(send(otherEmail, '✍️ It’s your turn to sign', emailShell('Your turn to sign', `
        <p style="margin:0 0 14px">Hi ${esc(otherName)},</p>
        <p style="margin:0 0 18px"><b>${esc(signerName)}</b> has signed the lease for <b>${esc(g.propLabel)}</b>. It’s your turn now — about a minute, from your phone.</p>
        ${btn(link, 'Sign the contract')}
        <p style="margin:18px 0 0;font-size:12px;color:#888">Secure single-use link · FES (Art. 21 CAD). If you didn’t expect this, you can ignore this email.</p>
      `)));
    }
    await Promise.all(jobs);
    return { ok: true, signer: !!signerEmail, counterparty: !!(otherEmail && otherToken) };
  } catch (e) { console.warn('[notify] partial:', e.message); return { ok: false, error: e.message }; }
}

// On full completion — concise milestone email to the operator.
export async function notifyAdminContractSigned(contract, property) {
  try {
    const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.GMAIL_USER || process.env.FIREBASE_ADMIN_EMAIL || '';
    if (!to) return { ok: false, error: 'no_admin_email' };
    const g = await gather(contract, property);
    const tName = (g.tenant && g.tenant.name) || contract.tenantName || '—';
    const lName = (g.landlordU && g.landlordU.name) || (g.landlordR && g.landlordR.name) || contract.landlordName || '—';
    const rent = (contract.rent != null && contract.rent !== '') ? ('€' + Number(contract.rent).toLocaleString('it-IT')) : '—';
    await send(to, `✓ Contract fully signed — ${g.propLabel}`, emailShell('Contract fully signed', `
      <p style="margin:0 0 14px">A lease just became <b style="color:${GOLD}">fully signed</b>.</p>
      <ul style="margin:0 0 16px;padding-left:18px;font-size:13px;color:#555;line-height:1.8">
        <li><b>Property:</b> ${esc(g.propLabel)}</li>
        <li><b>Tenant:</b> ${esc(tName)}</li>
        <li><b>Landlord:</b> ${esc(lName)}</li>
        <li><b>Rent:</b> ${esc(rent)}</li>
        <li><b>Contract:</b> ${esc(contract.id || '')}</li>
      </ul>
      ${btn(BASE + '/portal.html', 'Open dashboard')}
      <p style="margin:16px 0 0;font-size:12px;color:#888">Obligations, the FES certificate and the welcome emails were generated automatically.</p>
    `));
    return { ok: true };
  } catch (e) { console.warn('[notify] admin:', e.message); return { ok: false, error: e.message }; }
}

// Time-boxed send — SMTP can stall, and this runs inside the signer request.
function send(to, subject, html) {
  return Promise.race([
    sendEmail({ to, subject, html }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 15000)),
  ]).catch((e) => { console.warn('[notify] send', to, e.message); });
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function btn(href, label) {
  return `<a href="${esc(href)}" style="display:inline-block;background:linear-gradient(180deg,#F6E4A6,#E9C766 46%,#B98E2E);color:#1c1503;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.3px;padding:13px 26px;border-radius:11px">${esc(label)}</a>`;
}
function emailShell(title, inner) {
  return `<div style="margin:0;padding:24px;background:#0c0c0e;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(0,0,0,.4)">
      <div style="background:#0c0c0e;padding:22px 28px;text-align:center">
        <div style="font-size:18px;font-weight:300;letter-spacing:9px;color:#fff;padding-left:9px">BOOM</div>
        <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#B8860B;margin-top:5px">${esc(title)}</div>
      </div>
      <div style="padding:28px 28px 30px;color:#222;font-size:15px;line-height:1.6">${inner}</div>
      <div style="padding:16px 28px;background:#f6f6f4;color:#999;font-size:11px;text-align:center">BOOM Rome · boomrome.com · Encrypted · FES (Art. 21 CAD)</div>
    </div>
  </div>`;
}
