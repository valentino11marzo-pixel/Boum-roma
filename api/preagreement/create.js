// api/preagreement/create.js
// Admin creates a sendable PRE-AGREEMENT (Rental Proposal) for a specific
// deal and gets back a tokenized link (/pre-agreement?t=<token>) to forward
// to the client on WhatsApp/email. The client self-fills their identity on
// the public page and accepts — zero workload on the agent's side.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>   (admin/owner/landlord)
// Body: {
//   listingId?: string,
//   property:  { address, type?, condition?, use?, floor?, unit? },
//   landlord:  { name },
//   tenant?:   { fullName?, email?, phone? },          // optional prefill
//   lease:     { startDate(YYYY-MM-DD), months, type?, lawRef?, reason? },
//   money:     { rent, depositMonths?, feePct?, feeFlat?, feeVatPct?, dueAtSigning? },
//              (feeFlat, when present, wins over feePct: flat € agency fee)
//   note?:     string
// }
// Derived server-side: deposit, fee, feeVat, feeTotal, endDate.
// Response: { ok, id, token, url }

import crypto from 'node:crypto';
import { fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

const clip = (v, n = 300) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num = (v, d = 0) => (isFinite(+v) ? +v : d);

function endDate(startISO, months) {
  const d = new Date(startISO + 'T00:00:00');
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);   // month-end clamp
  else d.setDate(d.getDate() - 1);         // through the day before anniversary
  return d.toISOString().slice(0, 10);
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
  const rent = num(m.rent);
  if (!address || !landlordName || !startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || rent <= 0) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  const depositMonths = Math.max(0, Math.min(6, num(m.depositMonths, 1)));
  const deposit = Math.round(rent * depositMonths * 100) / 100;
  // Fee is fully free-form: either a % of annual rent (any value, incl. 0)
  // or a flat euro amount (money.feeFlat) — whichever the console sends.
  const feeVatPct = Math.max(0, Math.min(50, num(m.feeVatPct, 22)));
  let feePct = null, feeFlat = null, fee;
  if (m.feeFlat != null && m.feeFlat !== '') {
    feeFlat = Math.max(0, Math.min(200000, num(m.feeFlat)));
    fee = Math.round(feeFlat * 100) / 100;
  } else {
    feePct = Math.max(0, Math.min(100, num(m.feePct, 12)));
    fee = Math.round(rent * 12 * feePct) / 100;                     // % of annual rent
  }
  const feeVat = Math.round(fee * feeVatPct) / 100;
  const feeTotal = Math.round((fee + feeVat) * 100) / 100;
  const dueAtSigning = m.dueAtSigning != null ? Math.max(0, num(m.dueAtSigning)) : deposit;

  const token = crypto.randomBytes(16).toString('hex');
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
    tenant: {
      fullName: clip((b.tenant || {}).fullName, 120),
      email: clip((b.tenant || {}).email, 160),
      phone: clip((b.tenant || {}).phone, 60),
    },
    lease: {
      startDate,
      months,
      endDate: endDate(startDate, months),
      type: clip(l.type, 80) || 'Transitional Lease',
      lawRef: clip(l.lawRef, 80) || 'uso transitorio · L.431/98 art.5 c.1',
      reason: clip(l.reason, 300),
    },
    money: { rent, depositMonths, deposit, feePct, feeFlat, feeVatPct, fee, feeVat, feeTotal, dueAtSigning },
    note: clip(b.note, 600),
    createdAt: new Date().toISOString(),
    createdBy: auth.email || auth.uid,
    views: [],
  };

  try {
    const { id } = await fsCreate('preAgreements', doc);
    logActivity('preagreement_created', 'preagreement', { id, address, rent, tenant: doc.tenant.fullName }, auth.email || 'admin')
      .catch(() => {});
    return res.status(200).json({ ok: true, id, token, url: '/pre-agreement?t=' + token });
  } catch (e) {
    console.error('[preagreement/create] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'store_failed' });
  }
}
