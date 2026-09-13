// api/preagreement/_auto.js
// The frictionless close: when a pre-agreement was created with a portal
// propertyId (+ autoConvert), the rental contract materializes BY ITSELF the
// moment the deal is sealed — payment confirmed via Stripe, or acceptance
// when nothing was due. Silently: the admin gets a heads-up; the tenant's
// Magic-Sign email leaves only when the console's 🖊 button is pressed, and
// the landlord-side link is shared with the owner (or kept for the admin's
// per-delega countersignature when delegate was chosen at convert time).
//
// Callers: api/preagreement/submit.js (no-payment acceptances) and
// api/stripe-webhook.js (paid). Always best-effort: a conversion failure
// must never break the acceptance/payment flow it rides on.

import { convertPaToContract } from './convert.js';
import { sendContractSignEmail } from './_notify.js';
import { fsCreate } from '../homie/_lib.js';

export async function maybeAutoConvert({ pa, paId }) {
  try {
    if (!pa || !paId) return null;
    if (!pa.autoConvert || !pa.propertyId || pa.contractId) return null;
    // Owner signs directly by default — delega is chosen deal-by-deal from
    // the console's convert modal, never assumed by the auto pipeline.
    const out = await convertPaToContract({ pa, paId, delegate: false, actor: 'auto' });
    if (!out.ok) {
      console.error('[pa/_auto] convert failed:', out.error);
      // La guardia sovrapposizioni ha fermato il contratto automatico: il
      // deal è chiuso (pagato/accettato) e l'operatore DEVE saperlo — una
      // riga su agentNotifications → Telegram entro un minuto; la console
      // mostra comunque «pagato, contratto NON creato» con la mossa.
      if (out.error === 'overlap' && out.overlap) {
        const o = out.overlap;
        try {
          await fsCreate('agentNotifications', {
            type: 'contract.overlap_blocked',
            summary: `⚠ Contratto automatico NON creato per ${pa.ref || paId} (${(pa.tenant || {}).fullName || 'conduttore'}): sullo stesso immobile c'è già un contratto attivo di ${o.tenantName || '—'} dal ${o.startDate}${o.endDate ? ' al ' + o.endDate : ''}${o.unit ? ' (int. ' + o.unit + ')' : ''}. Dalla console: → Contratto e decidi (stanza diversa → crea comunque).`,
            priority: 'high', ref: { collection: 'preAgreements', id: paId },
            dedupKey: 'overlap-' + paId, status: 'pending',
            actor: 'preagreement-auto', createdAt: new Date().toISOString(), attempts: 0,
          });
        } catch (e) { console.warn('[pa/_auto] overlap notice:', e.message); }
      }
      return out;
    }
    if (!out.already) {
      // Admin heads-up ONLY. The client's Magic-Sign email is a deliberate
      // decision — the console's 🖊 button (api/preagreement/send-sign) —
      // so the admin can run many deals in parallel without losing control.
      try { await sendContractSignEmail({ pa, tenantSignUrl: out.tenantSignUrl, landlordSignUrl: out.landlordSignUrl, delegate: out.delegate, notifyClient: false }); }
      catch (e) { console.error('[pa/_auto] sign email failed:', e.message); }
    }
    return out;
  } catch (e) {
    console.error('[pa/_auto] crashed:', e.message);
    return null;
  }
}
