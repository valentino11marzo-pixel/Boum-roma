import Stripe from 'stripe';
import nodemailer from 'nodemailer';
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

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
  });
}

async function sendEmail({ to, subject, html, replyTo }) {
  await transporter().sendMail({
    from: `"BOOM Rome" <${process.env.GMAIL_USER}>`,
    to, subject, html,
    replyTo: replyTo || 'valentino@boom-rome.com',
  });
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

  const clientHtml = `
    <div style="font-family:-apple-system,Helvetica Neue,sans-serif;max-width:560px;margin:0 auto;color:#08080A;padding:24px;">
      <h2 style="font-weight:300;letter-spacing:-0.5px;margin:0 0 16px;">Welcome to BOOM, ${firstName}.</h2>
      <p>Your Property Finding Service is now active. Payment received: €350.</p>
      <p style="margin-top:24px;"><strong>What happens next:</strong></p>
      <ol style="line-height:1.7;padding-left:20px;">
        <li>Intake call within 24 hours to align on requirements</li>
        <li>Curated shortlist delivered within 72 hours</li>
        <li>Viewings scheduled, negotiation and contract</li>
      </ol>
      <p style="margin:32px 0;">
        <a href="${portalLink}" style="background:#08080A;color:#D4AF37;padding:14px 28px;text-decoration:none;display:inline-block;letter-spacing:0.5px;">Access your BOOM dashboard</a>
      </p>
      <p style="color:#666;font-size:13px;">This link is personal and does not require a password.</p>
      <p style="color:#666;font-size:13px;">Questions? Just reply to this email.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
      <p style="color:#999;font-size:12px;">BOOM · Egidi Immobiliare S.r.l. · Rome</p>
    </div>`;

  try {
    await sendEmail({
      to: doc.email,
      subject: 'Your BOOM Property Finding Service is active',
      html: clientHtml,
    });
  } catch (err) { console.error('Client email error:', err); }

  const adminHtml = `
    <h3 style="margin:0 0 16px;">PAID — PFS €350</h3>
    <ul style="line-height:1.7;">
      <li><strong>Client:</strong> ${m.name}</li>
      <li><strong>Email:</strong> ${m.email}</li>
      <li><strong>Phone:</strong> ${m.phone}</li>
      <li><strong>Move-in:</strong> ${m.move_in_date}</li>
      <li><strong>Budget:</strong> ${m.budget}</li>
      <li><strong>Bedrooms:</strong> ${m.bedrooms}</li>
      <li><strong>Areas:</strong> ${m.preferred_areas}</li>
      <li><strong>Must-haves:</strong> ${m.must_haves || '—'}</li>
      <li><strong>Notes:</strong> ${m.additional_info || '—'}</li>
    </ul>
    <p><strong>Firestore:</strong> pfsClients/${docId}</p>
    <p><strong>Stripe session:</strong> ${session.id}</p>
    <p><strong>Portal token:</strong> <code>${portalToken}</code></p>
    <p><strong>Portal link:</strong> <a href="${portalLink}">${portalLink}</a></p>`;

  try {
    await sendEmail({
      to: 'valentino@boom-rome.com',
      subject: `PAID — PFS — ${m.name}`,
      html: adminHtml,
    });
  } catch (err) { console.error('Admin email error:', err); }

  return res.status(200).json({ received: true, pfsClientId: docId });
}
