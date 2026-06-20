// api/pay/summary.js
// BOOM Pay — landlord cashflow summary that powers boom-pay.html.
// Reads server-side under admin creds so the page works regardless of whether
// the new Firestore client-read rules have been deployed yet.
//
// POST {} (or { ownerId } for admins) → {
//   profile, stats, payments[], payouts[]
// }
// Auth: Firebase ID token (admin / owner / landlord).

import { requireRole, setCors } from '../_auth.js';
import { fsGet, fsList, readJson } from '../homie/_lib.js';
import { setPayCors } from './_pay.js';

export default async function handler(req, res) {
  setCors(req, res);
  setPayCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const body = (await readJson(req)) || {};
  const ownerId = (auth.profile.role === 'admin' && body.ownerId) ? body.ownerId : auth.uid;

  try {
    const profile = (await fsGet('payProfiles/' + ownerId)) || {};

    const properties = await fsList('properties', {
      filter: { field: 'ownerId', op: 'EQUAL', value: ownerId }, limit: 50,
    });
    const propIds = properties.map(p => p.id).slice(0, 25);

    // Gather payments per property (a landlord typically has a handful).
    let payments = [];
    for (const pid of propIds) {
      try {
        const ps = await fsList('payments', {
          filter: { field: 'propertyId', op: 'EQUAL', value: pid }, limit: 60,
        });
        payments = payments.concat(ps);
      } catch (_) { /* skip a property that errors */ }
    }

    const month = new Date().toISOString().slice(0, 7);
    const cents = (n) => Math.round(Number(n || 0) * 100);
    const stats = {
      expectedThisMonthCents: 0,
      collectedThisMonthCents: 0,
      inTransitCents: 0,
      failedCount: 0,
      collectedAllTimeCents: 0,
      onRailsCount: 0,
    };
    for (const p of payments) {
      const a = cents(p.amount);
      if (p.status === 'paid') stats.collectedAllTimeCents += cents(p.chargedAmount || p.amount);
      if (p.month === month) {
        stats.expectedThisMonthCents += a;
        if (p.status === 'paid') stats.collectedThisMonthCents += cents(p.chargedAmount || p.amount);
        if (p.status === 'processing') stats.inTransitCents += cents(p.chargedAmount || p.amount);
      }
      if (p.status === 'failed') stats.failedCount += 1;
      if (p.paymentRail === 'sdd' && (p.status === 'processing' || p.status === 'paid')) stats.onRailsCount += 1;
    }

    // Most recent payments first, trimmed for the wire.
    payments.sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
    const slim = payments.slice(0, 24).map(p => ({
      id: p.id, month: p.month, dueDate: p.dueDate, amount: p.amount,
      status: p.status, paymentRail: p.paymentRail || 'manual',
      chargedAmount: p.chargedAmount, feeLandlord: p.feeLandlord,
      landlordNet: p.landlordNet, propertyId: p.propertyId,
      stripePaymentIntentId: p.stripePaymentIntentId || '',
    }));

    let payouts = [];
    try {
      payouts = await fsList('payouts', {
        filter: { field: 'ownerId', op: 'EQUAL', value: ownerId }, limit: 12,
      });
    } catch (_) {}

    return res.status(200).json({
      ok: true,
      ownerId,
      profile: {
        hasAccount: !!profile.stripeAccountId,
        onboarded: !!(profile.chargesEnabled && profile.payoutsEnabled),
        chargesEnabled: !!profile.chargesEnabled,
        payoutsEnabled: !!profile.payoutsEnabled,
        detailsSubmitted: !!profile.detailsSubmitted,
        feeLandlordBps: profile.feeLandlordBps ?? null,
        feeTenantBps: profile.feeTenantBps ?? null,
      },
      stats,
      propertyCount: properties.length,
      payments: slim,
      payouts,
    });
  } catch (e) {
    console.error('[pay/summary] error:', e.message);
    return res.status(500).json({ ok: false, error: 'summary_failed', detail: e.message });
  }
}
