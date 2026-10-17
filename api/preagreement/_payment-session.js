// One persisted Checkout attempt per proposal. Stripe retries use the same
// idempotency key and expiry, always after re-verifying the monthly locks.
import crypto from 'node:crypto';
import Stripe from 'stripe';
import { fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { acquireLock } from './_lock.js';
import { paidOnRecord } from './_state.js';
import { paymentTermsFor, checkoutParams } from './_checkout.js';

export async function openProposalCheckout({ id, token }) {
  for (let retry=0; retry<3; retry++) {
    const snapshot=await fsGetVersioned('preAgreements/'+id), pa=snapshot?.data;
    if (!pa || pa.token!==token) return {code:404,error:'not_found'};
    if (pa.status==='revoked') return {code:410,error:'revoked'};
    if (paidOnRecord(pa)) return {code:409,error:'already_paid'};
    if (pa.status!=='accepted') return {code:409,error:'not_accepted'};
    let terms;
    try { terms=paymentTermsFor(pa); } catch { return {code:409,error:'invalid_payment_terms'}; }
    if (!(terms.totalCents>0)) return {code:409,error:'nothing_due'};
    if (!process.env.STRIPE_SECRET_KEY) return {code:503,error:'payments_unavailable'};
    let lock;
    try { lock=await acquireLock({pa,paId:id,renew:true,proposalVersion:snapshot.updateTime,
      allow:pa.lockOverride?.notSameAs && pa.lockOverride.unit===pa.property?.unit ? [pa.lockOverride.notSameAs] : []}); }
    catch(error) { if(error.conflict)continue; return {code:503,error:'property_lock_unavailable'}; }
    if (!lock.ok) return {code:lock.reason==='held'?409:503,error:lock.reason==='held'?'property_taken':'property_lock_unavailable'};
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY), now=Math.floor(Date.now()/1000);
    const termsHash=crypto.createHash('sha256').update(JSON.stringify(terms)).digest('hex');
    let attempt=pa.checkoutAttempt, legacy=null, newAttempt=false;
    // Any known session is authoritative, including a locally expired attempt:
    // a webhook may not yet have recorded its payment in the proposal.
    if (attempt && attempt.termsHash!==termsHash) return {code:409,error:'checkout_terms_changed'};
    const previousId=attempt?.sessionId || pa.checkoutSessionId;
    if (previousId) {
      try { legacy=await stripe.checkout.sessions.retrieve(previousId); }
      catch { return {code:503,error:'checkout_state_unavailable'}; }
      if (legacy.metadata?.token!==token || legacy.amount_total!==terms.totalCents || legacy.currency!=='eur')
        return {code:409,error:'checkout_state_unverified'};
      if (legacy.payment_status==='paid' || legacy.status==='complete') return {code:409,error:'payment_verification_pending'};
      if (legacy.status==='open' && legacy.payment_status==='unpaid' && legacy.url && legacy.expires_at>now)
        attempt={legacy:true,sessionId:legacy.id,termsHash,expiresAt:legacy.expires_at,key:'legacy_'+legacy.id};
      else if (legacy.status==='expired' && legacy.payment_status==='unpaid') { attempt=null; legacy=null; }
      else return {code:409,error:'checkout_state_unverified'};
    } else if (attempt && attempt.expiresAt<=now) {
      // A lost create response has no retrievable session ID. An elapsed local
      // clock is not proof it was unpaid; retain the marker for reconciliation.
      return {code:409,error:'payment_verification_pending'};
    }
    if (attempt && attempt.termsHash!==termsHash) return {code:409,error:'checkout_terms_changed'};
    if (!attempt) {
      const expiresAt=now+23*3600;
      newAttempt=true;
      attempt={key:'pa_'+crypto.randomUUID(),termsHash,expiresAt,params:{...checkoutParams({ ...pa, token }, terms),expires_at:expiresAt}};
      if (previousId) attempt.previousSessionId=previousId;
    }
    if (!attempt.legacy && (!attempt.params || attempt.params.metadata?.token!==token || attempt.params.expires_at!==attempt.expiresAt))
      return {code:409,error:'checkout_state_unverified'};
    try {
      await fsCommit([...lock.guards,{docPath:'preAgreements/'+id,fields:{checkoutAttempt:attempt,...(newAttempt?{checkoutSessionId:''}:{})},precondition:{updateTime:lock.proposalVersion}}]);
    } catch(error) { if(error.conflict)continue; throw error; }
    let session;
    try { session=legacy || await stripe.checkout.sessions.create(attempt.params,{idempotencyKey:attempt.key}); }
    catch { return {code:503,error:'payments_unavailable'}; }
    if (session.payment_status==='paid' || session.status==='complete') return {code:409,error:'payment_verification_pending'};
    if (!session.id || session.status!=='open' || session.payment_status!=='unpaid' || !session.url || !(session.expires_at>now))
      return {code:409,error:'checkout_state_unverified'};
    // A concurrent verified payment must never be overwritten by a retry.
    const current=await fsGetVersioned('preAgreements/'+id);
    if (paidOnRecord(current?.data)) return {code:409,error:'already_paid'};
    if (current?.data.status!=='accepted' || current.data.checkoutAttempt?.key!==attempt.key) return {code:409,error:'proposal_changed'};
    try { await fsCommit([{docPath:'preAgreements/'+id,fields:{checkoutSessionId:session.id},precondition:{updateTime:current.updateTime}}]); }
    catch(error) { if(error.conflict)continue; throw error; }
    return {code:200,checkoutUrl:session.url,paymentDueEur:terms.totalCents/100};
  }
  return {code:409,error:'proposal_changed'};
}
