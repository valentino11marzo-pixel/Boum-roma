// api/payments/sdd-setup.js — attiva (o spegne) il canone automatico SEPA.
//
// POST { contractId, action?: 'start' | 'cancel' }   (default 'start')
// Auth: Bearer ID token (tenant o admin). Un tenant solo sul PROPRIO
// contratto; l'admin su qualsiasi (attivazione assistita al telefono).
//
// 'start'  → Stripe Checkout in mode=setup con sepa_debit: il cliente
//            inserisce l'IBAN e firma il mandato UNA volta sulla pagina
//            Stripe (mai su BOOM: l'IBAN non tocca i nostri server).
//            Il webhook (service SDD_SETUP) salva il mandato sul contratto.
// 'cancel' → contract.sdd.status = 'cancelled' + detach del metodo di
//            pagamento (best-effort): dal giro dopo il collector non
//            addebita più. Gli addebiti GIÀ iniziati seguono il loro corso.

import Stripe from 'stripe';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { tgNotify } from '../pfs/_health.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['tenant', 'admin']);
  if (!auth) return;

  const b = (await readJson(req)) || {};
  const contractId = typeof b.contractId === 'string' ? b.contractId.trim().slice(0, 120) : '';
  const action = b.action === 'cancel' ? 'cancel' : 'start';
  if (!contractId) return res.status(400).json({ ok: false, error: 'contract_required' });

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });
  if (auth.profile.role !== 'admin' && contract.tenantId !== auth.uid) {
    return res.status(403).json({ ok: false, error: 'not_yours' });
  }
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ ok: false, error: 'payments_unconfigured' });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sdd = contract.sdd || {};

  if (action === 'cancel') {
    if (sdd.status !== 'active') return res.status(409).json({ ok: false, error: 'not_active' });
    try {
      await fsPatch('contracts/' + contractId, {
        sdd: { ...sdd, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: auth.email || auth.uid },
      });
    } catch (e) { return res.status(500).json({ ok: false, error: 'write_failed' }); }
    if (sdd.paymentMethodId) {
      try { await stripe.paymentMethods.detach(sdd.paymentMethodId); } catch (_) { /* best effort */ }
    }
    logActivity('sdd_cancelled', 'payment', { contractId, by: auth.email }, auth.email || 'tenant').catch(() => {});
    tgNotify(`🏦 Addebito SEPA <b>disattivato</b> sul contratto ${contractId} (${contract.tenantName || '—'}) da ${auth.email || 'tenant'}.`).catch(() => {});
    return res.status(200).json({ ok: true, cancelled: true });
  }

  // ── start ──
  if (sdd.status === 'active') return res.status(409).json({ ok: false, error: 'already_active' });
  const email = (auth.profile.role === 'admin' ? (contract.tenantEmail || auth.email) : (auth.email || contract.tenantEmail)) || '';

  try {
    let customerId = sdd.customerId || '';
    if (!customerId) {
      const cust = await stripe.customers.create({
        email: email || undefined,
        name: contract.tenantName || undefined,
        metadata: { contractId, tenantId: String(contract.tenantId || '') },
      });
      customerId = cust.id;
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['sepa_debit'],
      metadata: {
        service: 'SDD_SETUP', contractId,
        tenantId: String(contract.tenantId || auth.uid), email,
      },
      success_url: 'https://www.boomrome.com/casa?sdd=ok',
      cancel_url: 'https://www.boomrome.com/casa',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    // Il customer si persiste SUBITO (non solo nel webhook): se il cliente
    // abbandona e riprova, si riusa lo stesso customer invece di crearne uno
    // a ogni tentativo.
    fsPatch('contracts/' + contractId, { sdd: { ...sdd, customerId, email, status: sdd.status || 'setup' } }).catch(() => {});
    logActivity('sdd_setup_opened', 'payment', { contractId, by: auth.email }, auth.email || 'tenant').catch(() => {});
    return res.status(200).json({ ok: true, url: session.url });
  } catch (e) {
    console.error('[sdd-setup] stripe failed:', e.message);
    return res.status(502).json({ ok: false, error: 'stripe_failed' });
  }
}
