import Stripe from 'stripe';
import crypto from 'node:crypto';
import { fsGet, fsPatch, fsCreate } from './homie/_lib.js';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function firebaseIdToken() {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.FIREBASE_ADMIN_EMAIL,
        password: process.env.FIREBASE_ADMIN_PASS,
        returnSecureToken: true,
      }),
    }
  );
  const d = await r.json();
  if (!d.idToken) throw new Error('Firebase auth failed: ' + JSON.stringify(d));
  return d.idToken;
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = Number.isInteger(v)
      ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  return fields;
}

async function writePfsClient(docId, data) {
  const token = await firebaseIdToken();
  const pid = process.env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/pfsClients?documentId=${docId}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!r.ok) throw new Error(`Firestore write failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function sendEmailJS(templateParams) {
  const body = {
    service_id: 'service_74n80th',
    template_id: 'boom_notification',
    user_id: 'dnMxbtS2qDm_o7SHE',
    accessToken: process.env.EMAILJS_PRIVATE_KEY,
    template_params: templateParams,
  };

  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`EmailJS ${r.status}: ${txt}`);
  }
  return r.text();
}

// Generic Firestore write (idempotent on docId; 409 = already written, ignore)
async function writeDoc(collection, docId, data) {
  const token = await firebaseIdToken();
  const pid = process.env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${collection}?documentId=${docId}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!r.ok) {
    if (r.status === 409) return { exists: true };
    throw new Error(`Firestore write failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

// RESERVE — a tenant paid a refundable holding deposit to reserve an apartment.
async function handleReserve(res, session, m) {
  const docId = session.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
  const now = new Date().toISOString();
  const amountEur = (session.amount_total || 0) / 100;
  const email = m.email || session.customer_email || '';
  const lead = {
    type: 'reservation',
    service: 'RESERVE',
    status: 'reserved',
    paid: true,
    source: 'reserve-deposit',
    name: m.name || '',
    email,
    phone: m.phone || '',
    moveIn: m.move_in_date || '',
    listingId: m.listingId || '',
    listingName: m.listingName || 'Apartment',
    amount_paid: session.amount_total || 0,
    amount_eur: amountEur,
    currency: session.currency || 'eur',
    stripe_session_id: session.id,
    paid_at: now,
    createdAt: now,
  };

  // Surface it in the existing lead pipeline (cockpit/portal read `leads`)
  try { await writeDoc('leads', 'res_' + docId, lead); }
  catch (err) { console.error('Firestore reservation write error:', err); }

  const firstName = (m.name || '').split(' ')[0] || 'there';

  // Owner notification (same channel as PFS)
  try {
    await sendEmailJS({
      to_email: 'valentino@boom-rome.com',
      heading: `🔒 RESERVED — €${amountEur} deposit`,
      subheading: m.listingName || 'Apartment reserved',
      name: 'Valentino',
      intro: 'A tenant just paid a refundable holding deposit to reserve an apartment. Take it off-market and process the application.',
      card_color: '#D4AF37',
      card_title: 'Reservation',
      r1_icon: '🏠', r1_label: 'Apartment', r1_value: m.listingName || '—',
      r2_icon: '📧', r2_label: 'Email', r2_value: email || '—',
      r3_icon: '📱', r3_label: 'Phone', r3_value: lead.phone || '—',
      r4_icon: '📅', r4_label: 'Move-in', r4_value: lead.moveIn || '—',
      closing: `Deposit: €${amountEur} (refundable, deduct from 1st month). Listing: ${m.listingId || '—'}. Stripe: ${session.id}. Record: leads/res_${docId}.`,
      cta_text: 'Open portal',
      portal_link: 'https://www.boomrome.com/portal.html#leads',
    });
  } catch (err) { console.error('Admin reservation email error:', err); }

  // Client confirmation
  try {
    if (email) await sendEmailJS({
      to_email: email,
      heading: 'Your apartment is on hold',
      subheading: m.listingName || 'Reservation confirmed',
      name: firstName,
      intro: `We've received your refundable holding deposit and taken ${m.listingName || 'the apartment'} off-market while we process your application. Here's what happens next:`,
      card_color: '#D4AF37',
      card_title: 'What happens next',
      r1_icon: '✓', r1_label: 'We review your application', r1_value: 'Within 2 hours',
      r2_icon: '✓', r2_label: 'Apartment held for you', r2_value: 'Off-market, just for you',
      r3_icon: '✓', r3_label: 'If approved', r3_value: 'Deposit deducted from 1st month',
      r4_icon: '✓', r4_label: 'If not approved', r4_value: 'Full refund, no questions',
      closing: 'Questions? Just reply to this email or message us on WhatsApp.',
      cta_text: 'Back to BOOM',
      portal_link: 'https://www.boomrome.com/apartments.html',
    });
  } catch (err) { console.error('Client reservation email error:', err); }

  return res.status(200).json({ received: true, reservationId: 'res_' + docId });
}

// ── BOOM Pay rent-rail ledger + event router ──────────────────────────────
async function payLedger(event, details) {
  try { await fsCreate('payEvents', { event, ...details, createdAt: new Date() }); }
  catch (e) { console.warn('[stripe-webhook] payEvents failed:', e.message); }
}

async function handlePayEvent(res, event) {
  const obj = event.data.object;
  const meta = obj.metadata || {};

  if (event.type === 'payment_intent.succeeded') {
    if (meta.kind === 'rent' && meta.paymentId) {
      const nowIso = new Date().toISOString();
      await fsPatch('payments/' + meta.paymentId, {
        status: 'paid',
        collectedAt: new Date(),
        paidAt: nowIso,
        paidDate: nowIso.split('T')[0],
        stripeChargeId: obj.latest_charge || '',
        passPaidPushed: false, // reminder-cron pushes "Pagato ✓" to the Wallet
      });
      await payLedger('rent_paid', { paymentId: meta.paymentId, contractId: meta.contractId || '', ownerId: meta.ownerId || '', amount: obj.amount || 0 });
    }
    return res.status(200).json({ received: true, handled: event.type });
  }

  if (event.type === 'payment_intent.payment_failed') {
    if (meta.kind === 'rent' && meta.paymentId) {
      await fsPatch('payments/' + meta.paymentId, {
        status: 'failed',
        failureReason: (obj.last_payment_error && obj.last_payment_error.message) || 'payment_failed',
        lastFailedAt: new Date(),
      });
      await payLedger('rent_failed', { paymentId: meta.paymentId, reason: (obj.last_payment_error && obj.last_payment_error.code) || '' });
    }
    return res.status(200).json({ received: true, handled: event.type });
  }

  if (event.type === 'setup_intent.succeeded') {
    if (meta.kind === 'mandate' && meta.contractId) {
      await fsPatch('mandates/' + meta.contractId, {
        status: 'active',
        stripePaymentMethodId: obj.payment_method || '',
        stripeMandateId: obj.mandate || '',
        activatedAt: new Date(),
      });
      await payLedger('mandate_active', { contractId: meta.contractId, tenantId: meta.tenantId || '' });
    }
    return res.status(200).json({ received: true, handled: event.type });
  }

  if (event.type === 'account.updated' && meta.ownerId) {
    await fsPatch('payProfiles/' + meta.ownerId, {
      chargesEnabled: !!obj.charges_enabled,
      payoutsEnabled: !!obj.payouts_enabled,
      detailsSubmitted: !!obj.details_submitted,
      updatedAt: new Date(),
    });
    return res.status(200).json({ received: true, handled: event.type });
  }

  if (event.type === 'payout.paid') {
    await payLedger('payout_paid', { stripePayoutId: obj.id, amount: obj.amount || 0, arrivalDate: obj.arrival_date || 0, destination: obj.destination || '' });
    return res.status(200).json({ received: true, handled: event.type });
  }

  if (event.type === 'charge.dispute.created') {
    await payLedger('dispute_created', { disputeId: obj.id, amount: obj.amount || 0, reason: obj.reason || '', paymentIntentId: obj.payment_intent || '' });
    try {
      if (obj.payment_intent) {
        const pi = await stripe.paymentIntents.retrieve(obj.payment_intent);
        const pm = (pi && pi.metadata) || {};
        if (pm.kind === 'rent' && pm.paymentId) {
          await fsPatch('payments/' + pm.paymentId, { status: 'disputed', disputedAt: new Date() });
        }
      }
    } catch (e) { console.warn('[stripe-webhook] dispute map failed:', e.message); }
    return res.status(200).json({ received: true, handled: event.type });
  }

  return res.status(200).json({ received: true, ignored: event.type });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // BOOM Pay rent-rail events route here first.
  const PAY_EVENTS = [
    'payment_intent.succeeded', 'payment_intent.payment_failed',
    'setup_intent.succeeded', 'account.updated', 'payout.paid',
    'charge.dispute.created',
  ];
  if (PAY_EVENTS.includes(event.type)) {
    try { return await handlePayEvent(res, event); }
    catch (err) {
      console.error('[stripe-webhook] pay event error:', err.message);
      return res.status(200).json({ received: true, payError: err.message });
    }
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  const m = session.metadata || {};

  if (m.service === 'RESERVE') {
    return handleReserve(res, session, m);
  }

  if (m.service !== 'PFS') {
    return res.status(200).json({ received: true, skipped: m.service || 'none' });
  }

  const docId = session.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
  const portalToken = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();

  const doc = {
    service: 'PFS',
    status: 'paid',
    stage: 'payment_confirmed',
    name: m.name || '',
    email: m.email || session.customer_email || '',
    phone: m.phone || '',
    move_in_date: m.move_in_date || '',
    budget: m.budget || '',
    bedrooms: m.bedrooms || '',
    preferred_areas: m.preferred_areas || '',
    must_haves: m.must_haves || '',
    additional_info: m.additional_info || '',
    stripe_session_id: session.id,
    amount_paid: session.amount_total,
    currency: session.currency,
    portal_token: portalToken,
    paid_at: now,
    created_at: now,
  };

  try { await writePfsClient(docId, doc); }
  catch (err) { console.error('Firestore error:', err); }

  const firstName = (m.name || '').split(' ')[0] || 'there';
  const portalLink = `https://www.boomrome.com/portal.html?pfs=${portalToken}`;

  // === EMAIL 1 — CLIENT CONFIRMATION ===
  try {
    await sendEmailJS({
      to_email: doc.email,
      heading: 'Welcome to BOOM',
      subheading: 'Your Property Finding Service is active',
      name: firstName,
      intro: 'Payment received. Your apartment search starts now. Here is what happens next:',
      card_color: '#D4AF37',
      card_title: 'Your timeline',
      r1_icon: '✓',
      r1_label: 'Intake call',
      r1_value: 'Within 24 hours',
      r2_icon: '✓',
      r2_label: 'Curated shortlist',
      r2_value: 'Within 72 hours',
      r3_icon: '✓',
      r3_label: 'Viewings & negotiation',
      r3_value: 'Scheduled & managed by BOOM',
      r4_icon: '✓',
      r4_label: 'Contract signing',
      r4_value: 'Guided end-to-end',
      closing: 'Questions? Just reply to this email and I will personally get back to you.',
      cta_text: 'Access your dashboard',
      portal_link: portalLink,
    });
  } catch (err) { console.error('Client EmailJS error:', err); }

  // === EMAIL 2 — ADMIN NOTIFICATION ===
  try {
    await sendEmailJS({
      to_email: 'valentino@boom-rome.com',
      heading: 'PAID — PFS €350',
      subheading: m.name || 'New PFS client',
      name: 'Valentino',
      intro: 'New paid PFS client. Details below, full record in Firestore.',
      card_color: '#737373',
      card_title: 'Client details',
      r1_icon: '📧',
      r1_label: 'Email',
      r1_value: m.email || session.customer_email || '—',
      r2_icon: '📱',
      r2_label: 'Phone',
      r2_value: m.phone || '—',
      r3_icon: '📅',
      r3_label: 'Move-in',
      r3_value: m.move_in_date || '—',
      r4_icon: '💰',
      r4_label: 'Budget / bedrooms',
      r4_value: `${m.budget || '—'} · ${m.bedrooms || '—'}`,
      closing: `Areas: ${m.preferred_areas || '—'}. Must-haves: ${m.must_haves || '—'}. Notes: ${m.additional_info || '—'}. Firestore doc: pfsClients/${docId}. Stripe session: ${session.id}.`,
      cta_text: 'Open portal',
      portal_link: portalLink,
    });
  } catch (err) { console.error('Admin EmailJS error:', err); }

  return res.status(200).json({ received: true, pfsClientId: docId });
}
