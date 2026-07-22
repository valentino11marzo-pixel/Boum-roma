// api/banking/connect.js — start the PSD2 consent flow (admin)
//
// POST { institutionId } → { ok, requisitionId, link }
// The operator is sent to `link` (their bank's own consent page); the bank
// redirects back to /banca?ref=<requisitionId>, where the page calls
// /api/banking/finalize to store the authorized account ids. BOOM never
// touches bank credentials.

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { gc, fsPatch, logActivity } from './_lib.js';

const REDIRECT = 'https://www.boomrome.com/banca';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const institutionId = String(req.body?.institutionId || '').trim();
  if (!institutionId) return res.status(400).json({ ok: false, error: 'institutionId required' });

  try {
    // Dedicated agreement: pull as much history as the bank allows (up to
    // 540 days) — first sync backfills the whole fiscal year for the
    // commercialista, not just the default 90 days.
    let agreementId = null;
    try {
      const inst = await gc(`/institutions/${encodeURIComponent(institutionId)}/`);
      const days = Math.min(Number(inst.transaction_total_days) || 90, 540);
      const ag = await gc('/agreements/enduser/', {
        method: 'POST',
        body: {
          institution_id: institutionId,
          max_historical_days: days,
          access_valid_for_days: 90,
          access_scope: ['balances', 'details', 'transactions'],
        },
      });
      agreementId = ag.id || null;
    } catch (e) {
      console.warn('[banking/connect] agreement fallback to defaults:', e.message);
    }

    const requisition = await gc('/requisitions/', {
      method: 'POST',
      body: {
        redirect: REDIRECT,
        institution_id: institutionId,
        reference: 'boom-' + Date.now(),
        user_language: 'IT',
        ...(agreementId ? { agreement: agreementId } : {}),
      },
    });

    await fsPatch('bankRequisitions/' + requisition.id, {
      institutionId,
      reference: requisition.reference || null,
      status: 'created',
      createdAt: new Date(),
      actor,
    });
    await logActivity('Collegamento banca avviato', 'banking', { institutionId, requisitionId: requisition.id }, actor);

    return res.status(200).json({ ok: true, requisitionId: requisition.id, link: requisition.link });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}
