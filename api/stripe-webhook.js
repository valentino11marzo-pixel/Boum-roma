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

// Mirrors portal.html genPortalCode() so admin- and webhook-issued codes share
// one format (BM + 5 unambiguous chars). Crypto-random.
function genPortalCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(5);
  let s = 'BM';
  for (let i = 0; i < 5; i++) s += A[b[i] % A.length];
  return s;
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

// Read a Firestore doc (plain JS object) with the admin token.
function fsValToJs(v) {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  return null;
}
async function readDoc(path) {
  const token = await firebaseIdToken();
  const pid = process.env.FIREBASE_PROJECT_ID;
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const doc = await r.json();
  const out = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fsValToJs(v);
  return out;
}
// Patch specific fields (null clears the field) with the admin token.
async function patchDoc(path, data) {
  const token = await firebaseIdToken();
  const pid = process.env.FIREBASE_PROJECT_ID;
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null) fields[k] = { nullValue: null };
    else if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  const mask = Object.keys(data).map(f => `updateMask.fieldPaths=${f}`).join('&');
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Firestore patch failed: ${r.status} ${await r.text()}`);
}

// DEPOSIT — deposit-at-signature: the tenant paid the security deposit from
// the /sign success screen. Marks the contract, records the payment, wakes the
// operator (agentNotifications → portal feed + Telegram cron), confirms by email.
async function handleDeposit(res, session, m) {
  const contractId = String(m.contractId || '').trim();
  if (!contractId) return res.status(200).json({ received: true, error: 'no_contractId' });
  const now = new Date().toISOString();
  const amountEur = (session.amount_total || 0) / 100;

  // Idempotency: payments doc keyed dep_{contractId}; writeDoc treats 409 as done.
  try {
    await patchDoc(`contracts/${contractId}`, {
      depositPaid: true,
      depositPaidAt: now,
      depositAmountPaidEur: amountEur,
      depositStripeSession: session.id,
      depositPayToken: null,
    });
  } catch (err) { console.error('[deposit] contract patch:', err.message); }

  let c = null;
  try { c = await readDoc(`contracts/${contractId}`); } catch (_) {}

  try {
    await writeDoc('payments', 'dep_' + contractId, {
      type: 'deposit',
      contractId,
      tenantId: (c && c.tenantId) || '',
      propertyId: (c && c.propertyId) || '',
      amount: amountEur,
      month: 'deposito',
      dueDate: now.slice(0, 10),
      status: 'paid',
      paidAt: now,
      stripeSessionId: session.id,
      createdAt: now,
    });
  } catch (err) { console.error('[deposit] payment write:', err.message); }

  try {
    await writeDoc('agentNotifications', 'deposit-' + contractId, {
      type: 'payment.deposit',
      summary: `💰 Deposito incassato: €${amountEur.toLocaleString('it-IT')} · contratto ${contractId}`,
      priority: 'high',
      status: 'pending',
      actor: 'stripe-webhook',
      dedupKey: 'deposit-' + contractId,
      createdAt: now,
      attempts: 0,
    });
  } catch (err) { console.error('[deposit] notify write:', err.message); }

  const email = session.customer_email || (c && c.tenantEmail) || '';
  try {
    if (email) await sendEmailJS({
      to_email: email,
      heading: 'Deposit received ✓',
      subheading: 'Your home is secured',
      name: 'there',
      intro: `We've received your security deposit of €${amountEur.toLocaleString('it-IT')}. Your lease is now fully in place — here's what happens next:`,
      card_color: '#D4AF37',
      card_title: 'Next steps',
      r1_icon: '✓', r1_label: 'Deposit', r1_value: `€${amountEur.toLocaleString('it-IT')} received`,
      r2_icon: '📋', r2_label: 'Contract', r2_value: 'Registered with Agenzia delle Entrate by BOOM',
      r3_icon: '🔑', r3_label: 'Key handover', r3_value: 'We\'ll coordinate the date with you',
      r4_icon: '💬', r4_label: 'Questions', r4_value: 'Reply to this email anytime',
      closing: 'Welcome home. — BOOM Rome',
      cta_text: 'Enter your portal',
      portal_link: 'https://www.boomrome.com/portal.html',
    });
  } catch (err) { console.error('[deposit] tenant email:', err.message); }

  try {
    await sendEmailJS({
      to_email: 'valentino@boom-rome.com',
      heading: `💰 DEPOSIT PAID — €${amountEur.toLocaleString('it-IT')}`,
      subheading: `Contratto ${contractId}`,
      name: 'Valentino',
      intro: 'Il deposito cauzionale è stato pagato via Stripe al momento della firma.',
      card_color: '#D4AF37',
      card_title: 'Dettagli',
      r1_icon: '📄', r1_label: 'Contratto', r1_value: contractId,
      r2_icon: '💶', r2_label: 'Importo', r2_value: `€${amountEur.toLocaleString('it-IT')}`,
      r3_icon: '📧', r3_label: 'Email inquilino', r3_value: email || '—',
      r4_icon: '🧾', r4_label: 'Stripe', r4_value: session.id,
      closing: `Registrato in payments/dep_${contractId}. Il contratto è marcato depositPaid.`,
      cta_text: 'Apri portale',
      portal_link: 'https://www.boomrome.com/portal.html',
    });
  } catch (err) { console.error('[deposit] admin email:', err.message); }

  return res.status(200).json({ received: true, deposit: true, contractId });
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

  if (m.service === 'DEPOSIT') {
    return handleDeposit(res, session, m);
  }

  if (m.service === 'RESERVE') {
    return handleReserve(res, session, m);
  }

  if (m.service !== 'PFS') {
    return res.status(200).json({ received: true, skipped: m.service || 'none' });
  }

  const docId = session.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
  const portalToken = crypto.randomBytes(24).toString('hex');
  const portalCode = genPortalCode();
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
    // Portal-readable criteria aliases (api/portal/_shared.js reads these names),
    // so the client's brief shows up in their portal immediately.
    zone: m.preferred_areas || '',
    moveIn: m.move_in_date || '',
    mustHaves: m.must_haves || '',
    // Auto-activate the client portal so the buyer can enter the moment they pay
    // (previously an admin had to enable it by hand before the link worked).
    portalEnabled: true,
    portalAccessCode: portalCode,
    portalStage: 'searching',
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
  const portalLink = `https://www.boomrome.com/portal.html?pfs=${portalToken}`; // admin deep-link
  const clientPortalLink = `https://www.boomrome.com/client-portal?code=${portalCode}`;

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
      closing: `Your private access code is ${portalCode} — keep it safe. Questions? Just reply to this email and I will personally get back to you.`,
      cta_text: 'Enter your portal',
      portal_link: clientPortalLink,
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
      closing: `Portal auto-activated · code ${portalCode} · ${clientPortalLink}. Areas: ${m.preferred_areas || '—'}. Must-haves: ${m.must_haves || '—'}. Notes: ${m.additional_info || '—'}. Firestore doc: pfsClients/${docId}. Stripe session: ${session.id}.`,
      cta_text: 'Open portal',
      portal_link: portalLink,
    });
  } catch (err) { console.error('Admin EmailJS error:', err); }

  return res.status(200).json({ received: true, pfsClientId: docId });
}
