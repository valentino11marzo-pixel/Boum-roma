// api/preagreement/_auto.js
// The frictionless close: when a pre-agreement was created with a portal
// propertyId (+ autoConvert), the rental contract materializes BY ITSELF the
// moment the deal is sealed — payment confirmed via Stripe, or acceptance
// when nothing was due. The tenant gets their Magic-Sign link by email
// immediately (momentum never cools); the landlord-side link stays parked
// for the admin's per-delega countersignature.
//
// Callers: api/preagreement/submit.js (no-payment acceptances) and
// api/stripe-webhook.js (paid). Always best-effort: a conversion failure
// must never break the acceptance/payment flow it rides on.

import { convertPaToContract } from './convert.js';
import { sendContractSignEmail } from './_notify.js';

export async function maybeAutoConvert({ pa, paId }) {
  try {
    if (!pa || !paId) return null;
    if (!pa.autoConvert || !pa.propertyId || pa.contractId) return null;
    const out = await convertPaToContract({ pa, paId, delegate: true, actor: 'auto' });
    if (!out.ok) {
      console.error('[pa/_auto] convert failed:', out.error);
      return out;
    }
    if (!out.already) {
      try { await sendContractSignEmail({ pa, tenantSignUrl: out.tenantSignUrl, landlordSignUrl: out.landlordSignUrl, delegate: out.delegate }); }
      catch (e) { console.error('[pa/_auto] sign email failed:', e.message); }
    }
    return out;
  } catch (e) {
    console.error('[pa/_auto] crashed:', e.message);
    return null;
  }
}
