// api/payments/autopay.js
// POST { contractId, enabled } — turn automatic monthly rent (SEPA autopay) on
// or off for a contract. Writes the top-level `autopay` flag the autopay-run
// cron reads. A tenant may only toggle their own contract.
// Auth: live -> Firebase ID token; test -> harness secret OR Firebase token.

import { setCors, requireRole } from '../_auth.js';
import { readJson, fsGet, fsPatch } from '../homie/_lib.js';
import { isLive, requireTestSecret } from './_lib.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // Capture the auth context (we need the uid to enforce tenant ownership).
  let auth = null;
  const hasSecret = req.headers['x-pay-test-secret'] || req.headers['X-Pay-Test-Secret'];
  if (isLive() || !hasSecret) {
    auth = await requireRole(req, res, ['tenant', 'admin', 'landlord', 'owner']);
    if (!auth) return;
  } else if (!requireTestSecret(req, res)) {
    return;
  }

  const body = (await readJson(req)) || {};
  const contractId = String(body.contractId || '').trim();
  const enabled = !!body.enabled;
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });

  try {
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
    if (auth && auth.profile.role === 'tenant' && contract.tenantId !== auth.uid) {
      return res.status(403).json({ ok: false, error: 'not_your_contract' });
    }
    if (enabled && contract.payment?.status !== 'active') {
      return res.status(412).json({ ok: false, error: 'mandate_not_active' });
    }
    await fsPatch('contracts/' + contractId, { autopay: enabled });
    return res.status(200).json({ ok: true, autopay: enabled });
  } catch (err) {
    console.error('[payments/autopay]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
