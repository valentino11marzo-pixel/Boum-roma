// api/preagreement/create.js
// Admin creates a sendable PRE-AGREEMENT (Rental Proposal) for a specific
// deal and gets back a tokenized link (/pre-agreement?t=<token>) to forward
// to the client on WhatsApp/email. The client self-fills their identity on
// the public page and accepts — zero workload on the agent's side.
//
// Money model mirrors the real signed BOOM proposals (e.g. Montecuccoli 26):
//   - optional monthly ENERGY CREDIT included in the monthly fee (clause à la
//     5.5: base rent + energy allowance; surplus above the allowance is on
//     the tenant)
//   - deposit SPLIT: n% due at pre-agreement signing, remainder upon move-in
//   - agency fee either % of annual rent OR n months' base rent, due at
//     move-in / at signing / separately
//   - co-tenants: the client can add up to 5 co-tenants on the public page;
//     all are jointly and severally liable (condition added automatically)
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>   (admin/owner/landlord)
// Body: {
//   listingId?: string,
//   property:  { address, type?, condition?, use?, floor?, unit? },
//   landlord:  { name },
//   tenant?:   { fullName?, email?, phone? },          // optional prefill
//   lease:     { startDate(YYYY-MM-DD), months, type?, lawRef?, reason? },
//   money:     { rent, energyCredit?, depositMonths?, depositSplitPct?,
//                feeMode?('pct'|'months'), feePct?, feeMonths?, feeVatPct?,
//                feeDue?('move-in'|'signing'|'separate'), dueAtSigning? },
//   note?:     string
// }
// Derived server-side: monthlyTotal, deposit, depositAtSigning/AtMoveIn,
// fee, feeVat, feeTotal, dueAtSigning default, endDate (month-end clamp).
// Response: { ok, id, token, url }

import crypto from 'node:crypto';
import { fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

const clip = (v, n = 300) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num = (v, d = 0) => (isFinite(+v) ? +v : d);
const r2 = (n) => Math.round(n * 100) / 100;

function endDate(startISO, months) {
  const d = new Date(startISO + 'T00:00:00');
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);   // month-end clamp
  else d.setDate(d.getDate() - 1);         // through the day before anniversary
  return d.toISOString().slice(0, 10);
}

// Shared money derivation — the SAME rules the admin console mirrors client-
// side and the edit-in-place flow relies on. Input: raw knobs. Output: the
// full money object stored on the doc.
export function deriveMoney(m) {
  const rent = num(m.rent);
  const energyCredit = Math.max(0, Math.min(1000, num(m.energyCredit, 0)));
  const monthlyTotal = r2(rent + energyCredit);

  const depositMonths = Math.max(0, Math.min(6, num(m.depositMonths, 1)));
  const deposit = r2(rent * depositMonths);
  const depositSplitPct = Math.max(0, Math.min(100, num(m.depositSplitPct, 100)));
  const depositAtSigning = r2(deposit * depositSplitPct / 100);
  const depositAtMoveIn = r2(deposit - depositAtSigning);

  const feeMode = m.feeMode === 'months' ? 'months' : 'pct';
  const feePct = Math.max(0, Math.min(30, num(m.feePct, 12)));
  const feeMonths = Math.max(0, Math.min(3, num(m.feeMonths, 1)));
  const fee = feeMode === 'months'
    ? r2(rent * feeMonths)
    : r2(rent * 12 * feePct / 100);
  const feeVatPct = Math.max(0, Math.min(30, num(m.feeVatPct, 22)));
  const feeVat = r2(fee * feeVatPct / 100);
  const feeTotal = r2(fee + feeVat);
  const feeDue = ['move-in', 'signing', 'separate'].includes(m.feeDue) ? m.feeDue : 'separate';

  const dueDefault = r2(depositAtSigning + (feeDue === 'signing' ? feeTotal : 0));
  const dueAtSigning = m.dueAtSigning != null && m.dueAtSigning !== ''
    ? Math.max(0, num(m.dueAtSigning))
    : dueDefault;

  return {
    rent, energyCredit, monthlyTotal,
    depositMonths, deposit, depositSplitPct, depositAtSigning, depositAtMoveIn,
    feeMode, feePct, feeMonths, fee, feeVatPct, feeVat, feeTotal, feeDue,
    dueAtSigning,
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  const p = b.property || {}, l = b.lease || {}, m = b.money || {};
  const address = clip(p.address, 200);
  const landlordName = clip((b.landlord || {}).name, 120);
  const startDate = clip(l.startDate, 10);
  const months = Math.max(1, Math.min(48, num(l.months, 12)));
  const money = deriveMoney(m);
  if (!address || !landlordName || !startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || money.rent <= 0) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  const token = crypto.randomBytes(16).toString('hex');
  const tenant = {
    fullName: clip((b.tenant || {}).fullName, 120),
    email: clip((b.tenant || {}).email, 160),
    phone: clip((b.tenant || {}).phone, 60),
  };
  const doc = {
    token,
    status: 'sent',
    listingId: clip(b.listingId, 80),
    property: {
      address,
      type: clip(p.type, 60) || 'Entire Apartment',
      condition: clip(p.condition, 60) || 'Furnished',
      use: clip(p.use, 60) || 'Residential',
      floor: clip(p.floor, 40),
      unit: clip(p.unit, 40),
    },
    landlord: { name: landlordName },
    tenant,                    // primary tenant (compat + prefill)
    tenants: [tenant],         // full parties list — the page appends co-tenants
    lease: {
      startDate,
      months,
      endDate: endDate(startDate, months),
      type: clip(l.type, 80) || 'Transitional Lease',
      lawRef: clip(l.lawRef, 80) || 'uso transitorio · L.431/98 art.5 c.1',
      reason: clip(l.reason, 300),
    },
    money,
    note: clip(b.note, 600),
    createdAt: new Date().toISOString(),
    createdBy: auth.email || auth.uid,
    views: [],
  };

  try {
    const { id } = await fsCreate('preAgreements', doc);
    logActivity('preagreement_created', 'preagreement', { id, address, rent: money.rent, tenant: doc.tenant.fullName }, auth.email || 'admin')
      .catch(() => {});
    return res.status(200).json({ ok: true, id, token, url: '/pre-agreement?t=' + token });
  } catch (e) {
    console.error('[preagreement/create] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'store_failed' });
  }
}
