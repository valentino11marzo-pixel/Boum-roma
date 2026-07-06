// api/rent/_lib.js
// Shared helpers for the Rent Collection pipeline (/api/rent/*).
//
// The `payments` collection is the single source of truth for the monthly
// schedule — docs are created at signature time by api/magic-sign/submit
// (id: pay_<contractId>_<YYYY-MM>) and back-filled for older active
// contracts by api/rent/collect-cron. Rent Collection adds on top of each
// pending payment:
//   payToken      single random credential for the public /pay page
//                 (mirrors the deposit-at-signature payToken pattern)
//   reminders     map { stageKey: ISO } — which ladder emails were sent
//   overdue       boolean + daysLate, kept fresh by the cron for the portals
//   paidVia       'stripe' | 'manual' — how it was settled
//   receiptUrl    quietanza PDF in Firebase Storage, written by the webhook

import crypto from 'node:crypto';
import { fsGet, fsList } from '../homie/_lib.js';

export const BASE = 'https://www.boomrome.com';
export const GOLD = '#B8860B';

export const newPayToken = () => crypto.randomBytes(24).toString('hex');

export const money = (v) => '€' + Number(v || 0).toLocaleString('it-IT');

const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

// 'YYYY-MM' → 'March 2026' / 'Marzo 2026'
export function monthLabel(month, lang = 'en') {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!m) return String(month || '');
  const names = lang === 'it' ? MONTHS_IT : MONTHS_EN;
  return `${names[parseInt(m[2], 10) - 1] || m[2]} ${m[1]}`;
}

export function payLink(token) {
  return `${BASE}/pay?t=${encodeURIComponent(token)}`;
}

// Resolve a payment by its payToken. Ambiguity (2+ hits) is rejected the
// same way magic-sign treats sign tokens.
export async function findPaymentByToken(token) {
  if (!token || typeof token !== 'string' || token.length < 16 || token.length > 100) return null;
  const hits = await fsList('payments', {
    filter: { field: 'payToken', op: 'EQUAL', value: token.trim() },
    limit: 2,
  });
  return hits.length === 1 ? hits[0] : null;
}

// Load everything an email / the pay page needs around a payment doc.
// Every lookup is best-effort — a missing property must never block a
// reminder or a receipt.
export async function paymentContext(payment) {
  const contract = payment.contractId
    ? await fsGet('contracts/' + payment.contractId).catch(() => null) : null;
  const property = (contract && contract.propertyId)
    ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null;

  let tenantEmail = (contract && contract.tenantEmail) || '';
  let tenantName = (contract && contract.tenantName) || '';
  const tenantId = payment.tenantId || (contract && contract.tenantId) || '';
  if ((!tenantEmail || !tenantName) && tenantId) {
    const t = await fsGet('users/' + tenantId).catch(() => null);
    if (t) { tenantEmail = tenantEmail || t.email || ''; tenantName = tenantName || t.name || ''; }
  }

  let landlordEmail = (contract && contract.landlordEmail) || '';
  let landlordName = (contract && contract.landlordName) || '';
  if (property && property.ownerId) {
    const l = await fsGet('users/' + property.ownerId).catch(() => null);
    if (l) { landlordEmail = landlordEmail || l.email || ''; landlordName = landlordName || l.name || ''; }
  }

  return {
    contract, property,
    tenantEmail, tenantName, tenantFirstName: (tenantName || '').split(' ')[0] || 'there',
    landlordEmail, landlordName,
    propLabel: (property && (property.address || property.name)) || 'your BOOM Rome home',
  };
}

// ── Branded email shell (same visual system as api/sign/_finalize.js) ──
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
export function btn(href, label) {
  return `<a href="${esc(href)}" style="display:inline-block;background:linear-gradient(180deg,#F6E4A6,#E9C766 46%,#B98E2E);color:#1c1503;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.3px;padding:13px 26px;border-radius:11px">${esc(label)}</a>`;
}
export function emailShell(title, inner) {
  return `<div style="margin:0;padding:24px;background:#0c0c0e;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(0,0,0,.4)">
      <div style="background:#0c0c0e;padding:22px 28px;text-align:center">
        <div style="font-size:18px;font-weight:300;letter-spacing:9px;color:#fff;padding-left:9px">BOOM</div>
        <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#B8860B;margin-top:5px">${esc(title)}</div>
      </div>
      <div style="padding:28px 28px 30px;color:#222;font-size:15px;line-height:1.6">${inner}</div>
      <div style="padding:16px 28px;background:#f6f6f4;color:#999;font-size:11px;text-align:center">BOOM Rome · boomrome.com · Secure payments by Stripe</div>
    </div>
  </div>`;
}

// A compact "amount due" card used by every reminder stage.
export function dueCard({ month, amount, propLabel, dueDate }) {
  return `<div style="margin:18px 0;padding:18px 20px;border:1px solid #eee;border-radius:14px;background:#faf9f6">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#999">Rent · ${esc(monthLabel(month))}</div>
    <div style="font-size:30px;font-weight:700;color:#111;margin:6px 0 2px">${esc(money(amount))}</div>
    <div style="font-size:13px;color:#666">${esc(propLabel)}</div>
    <div style="font-size:12px;color:#999;margin-top:4px">Due ${esc(dueDate || '')}</div>
  </div>`;
}
