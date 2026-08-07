// api/banking/finalize.js — complete the consent flow (admin)
//
// POST { requisitionId } → { ok, accounts:[{id, iban, name}] }
// Called by /banca when the bank redirects back. Reads the requisition,
// stores every authorized account in `bankAccounts`, ready for sync.

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { gc, fsPatch, logActivity } from './_lib.js';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const requisitionId = String(req.body?.requisitionId || '').trim();
  if (!requisitionId) return res.status(400).json({ ok: false, error: 'requisitionId required' });

  try {
    const requisition = await gc(`/requisitions/${encodeURIComponent(requisitionId)}/`);
    const accountIds = requisition.accounts || [];
    if (!accountIds.length) {
      return res.status(200).json({ ok: false, error: 'consenso non completato (nessun conto autorizzato)', status: requisition.status });
    }

    const accounts = [];
    for (const accId of accountIds) {
      let iban = null, name = null, ownerName = null, currency = 'EUR';
      try {
        const det = await gc(`/accounts/${accId}/details/`);
        const a = det.account || {};
        iban = a.iban || null;
        name = a.name || a.product || null;
        ownerName = a.ownerName || null;
        currency = a.currency || 'EUR';
      } catch (e) { console.warn('[banking/finalize] details:', e.message); }

      await fsPatch('bankAccounts/' + accId, {
        accountId: accId,
        iban, name, ownerName, currency,
        institutionId: requisition.institution_id || null,
        requisitionId,
        status: 'active',
        linkedAt: new Date(),
        consentExpiresAt: new Date(Date.now() + 90 * 86400000),
      });
      accounts.push({ id: accId, iban, name });
    }

    await fsPatch('bankRequisitions/' + requisitionId, { status: 'linked', linkedAt: new Date(), accountCount: accounts.length });
    await logActivity('Banca collegata', 'banking', { requisitionId, accounts: accounts.length }, actor);
    return res.status(200).json({ ok: true, accounts });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}
