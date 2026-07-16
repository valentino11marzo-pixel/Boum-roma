// api/preagreement/send-sign.js
// The console's 🖊 Magic Sign button — ONE tap that does the whole thing:
// converts the accepted/paid pre-agreement into the contract if it isn't
// already (identity + ID files + terms carried over), then emails the tenant
// their Magic-Sign link. Nothing reaches the client until the admin presses
// this — the admin runs many deals in parallel and stays in command of WHEN
// each signature request goes out. Re-pressing = resend (idempotent convert).
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord)
// Body:     { id }                            // preAgreements doc id
// Response: { ok, contractId, tenantSignUrl, landlordSignUrl, emailed }

import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { convertPaToContract } from './convert.js';
import { sendContractSignEmail } from './_notify.js';

const BASE = 'https://www.boomrome.com';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  const paId = b && typeof b.id === 'string' ? b.id.trim().slice(0, 80) : '';
  if (!paId) return res.status(400).json({ ok: false, error: 'id_required' });

  let pa;
  try { pa = await fsGet('preAgreements/' + paId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pa) return res.status(404).json({ ok: false, error: 'not_found' });
  if (pa.status !== 'accepted' && pa.status !== 'paid') {
    return res.status(409).json({ ok: false, error: 'not_accepted_yet', status: pa.status });
  }

  // Ensure the contract exists (idempotent — returns existing links if so).
  const out = await convertPaToContract({
    pa, paId,
    propertyId: b.propertyId || pa.propertyId,
    delegate: true,
    actor: auth.email || auth.uid,
  });
  if (!out.ok) {
    const code = out.error === 'no_property' ? 400 : out.error === 'property_not_found' ? 404 : 500;
    return res.status(code).json({ ok: false, error: out.error });
  }

  // Signed contracts null their tokens — fall back to the URLs stored on the PA.
  const tenantSignUrl = out.tenantSignUrl || pa.tenantSignUrl || null;
  const landlordSignUrl = out.landlordSignUrl || pa.landlordSignUrl || null;
  if (!tenantSignUrl) return res.status(409).json({ ok: false, error: 'already_signed' });

  let emailed = false;
  try {
    const r = await sendContractSignEmail({
      pa, tenantSignUrl, landlordSignUrl, delegate: out.delegate, notifyClient: true,
    });
    emailed = !!r.client;
  } catch (e) { console.error('[pa/send-sign] email failed:', e.message); }

  fsPatch('preAgreements/' + paId, {
    signSentAt: new Date().toISOString(),
    signSentBy: auth.email || auth.uid,
    tenantSignUrl, landlordSignUrl,
  }).catch(() => {});
  logActivity('preagreement_sign_sent', 'contract',
    { paId, ref: pa.ref || '', contractId: out.contractId, emailed }, auth.email || 'admin')
    .catch(() => {});

  return res.status(200).json({ ok: true, contractId: out.contractId, tenantSignUrl, landlordSignUrl, emailed });
}
