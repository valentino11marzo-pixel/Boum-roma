// api/sign/send-link.js
// Server-side Magic Sign invitation for ANY contract — the replacement for
// the portal's EmailJS sendSignatureEmail, which only fired while the admin
// had the portal open, with a third-party template and no record. One POST:
// resolves the party, backfills a missing sign token (legacy contracts),
// sends the invitation on the shared design system in the reader's language,
// stamps the send on the contract.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord;
//           owners only for their own property's contracts)
// Body:     { contractId, role?: 'tenant'|'landlord' (default 'tenant') }
// Response: 200 { ok, url, sent }
//           409 { error:'already_signed' | 'awaiting_tenant' }
//           404/403/400 on the usual failures
//
// Sequential protocol: the landlord's link stays parked until the tenant has
// signed (lookup would answer "not your turn"), so a landlord invite while
// awaiting the tenant is refused here with a clear 409 — the partial-signature
// stage email delivers it automatically at the right moment.

import crypto from 'node:crypto';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { sendSignInvite } from './_notify.js';

const BASE = 'https://www.boomrome.com';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req).catch(() => ({}));
  const contractId = String((b && b.contractId) || '').trim().slice(0, 80);
  const role = b && b.role === 'landlord' ? 'landlord' : 'tenant';
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });

  let property = null;
  if (contract.propertyId) {
    try { property = await fsGet('properties/' + contract.propertyId); } catch (_) {}
  }
  if (auth.profile.role !== 'admin') {
    if (!property || property.ownerId !== auth.uid) {
      return res.status(403).json({ ok: false, error: 'not_your_contract' });
    }
  }

  const signed = role === 'tenant' ? !!contract.tenantSignature : !!contract.landlordSignature;
  if (signed) return res.status(409).json({ ok: false, error: 'already_signed' });
  if (role === 'landlord' && !contract.tenantSignature && contract.signingOrder !== 'any') {
    return res.status(409).json({ ok: false, error: 'awaiting_tenant' });
  }

  // Token backfill for legacy contracts created before the wizard.
  const tokenField = role === 'tenant' ? 'tenantSignToken' : 'landlordSignToken';
  let token = contract[tokenField];
  if (!token) {
    token = crypto.randomUUID();
    try { await fsPatch('contracts/' + contractId, { [tokenField]: token }); }
    catch (e) { return res.status(500).json({ ok: false, error: 'token_backfill_failed' }); }
  }
  const url = `${BASE}/sign?sign=${encodeURIComponent(token)}`;

  // Recipient: users profile first, contract fields as fallback.
  let to = '', name = '';
  if (role === 'tenant') {
    const u = contract.tenantId ? await fsGet('users/' + contract.tenantId).catch(() => null) : null;
    to = (u && u.email) || contract.tenantEmail || '';
    name = contract.tenantName || (u && u.name) || '';
  } else {
    const ownerId = property && property.ownerId;
    const [u, ll] = await Promise.all([
      ownerId ? fsGet('users/' + ownerId).catch(() => null) : null,
      ownerId ? fsGet('landlords/' + ownerId).catch(() => null) : null,
    ]);
    to = (u && u.email) || (ll && ll.email) || contract.landlordEmail || '';
    name = contract.landlordName || (u && u.name) || (ll && ll.name) || '';
  }
  if (!to) return res.status(409).json({ ok: false, error: 'no_email', url });

  const stampField = role === 'tenant' ? 'signInviteTenantAt' : 'signInviteLandlordAt';
  const resend = !!contract[stampField];
  const sent = await sendSignInvite({ contract, property, role, to, name, url, resend });
  if (sent.ok) {
    fsPatch('contracts/' + contractId, { [stampField]: new Date().toISOString() }).catch(() => {});
    logActivity('sign_invite_sent', 'contract', { contractId, role, to, resend }, auth.email || auth.uid).catch(() => {});
  }
  return res.status(200).json({ ok: true, url, sent: !!sent.ok, resend });
}
