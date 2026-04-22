import Stripe from 'stripe';
import crypto from 'node:crypto';

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
    template_id: 'template_jruz1gi',
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

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  const m = session.metadata || {};

  if (m.service !== 'PFS') {
    return res.status(200).json({ received: true, skipped: 'non-PFS' });
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
