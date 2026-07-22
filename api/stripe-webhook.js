import Stripe from 'stripe';
import crypto from 'node:crypto';
import { fsList, fsPatch } from './homie/_lib.js';
import { sendPaEmails } from './preagreement/_notify.js';
import { maybeAutoConvert } from './preagreement/_auto.js';
import { sendEmailJS } from './_emailjs.js';
import { tgNotify } from './pfs/_health.js';

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
  if (!r.ok) {
    // 409 = Stripe redelivery (docId is deterministic from session.id).
    // The caller must REUSE the stored portal code, not mint a new one.
    if (r.status === 409) return { exists: true };
    throw new Error(`Firestore write failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
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
  } catch (err) {
    // Money received but the contract shows depositPaid:false — never let
    // that pass silently. 500 → Stripe redelivers (patch is idempotent, and
    // nothing else has run yet, so the retry is clean).
    console.error('[deposit] contract patch:', err.message);
    await tgNotify(`🚨 <b>Stripe: deposito €${amountEur} INCASSATO ma contratto NON aggiornato</b>\nContratto ${contractId} · session ${session.id}\nErrore: ${String(err.message).slice(0, 200)}\nRiprovo automaticamente (retry Stripe).`);
    return res.status(500).json({ received: false, error: 'contract_patch_failed' });
  }

  let c = null;
  try { c = await readDoc(`contracts/${contractId}`); } catch (_) {}

  let depositAlreadyRecorded = false;
  try {
    const w = await writeDoc('payments', 'dep_' + contractId, {
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
    depositAlreadyRecorded = !!(w && w.exists);
  } catch (err) { console.error('[deposit] payment write:', err.message); }

  // Redelivery: everything below (notification + emails) already ran once.
  if (depositAlreadyRecorded) {
    return res.status(200).json({ received: true, deposit: true, duplicate: true, contractId });
  }

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
// SERVICE — a productised service was bought one-tap (Services 2.0):
// virtual-viewing €89 / deal-assistance €249. Lead into the pipeline +
// admin nudge + client confirmation with the honest next steps.
const SERVICE_META = {
  'virtual-viewing': {
    title: 'Virtual Viewing', emoji: '🎥',
    next1: ['We contact the advertiser', 'Within a few hours'],
    next2: ['Live video call from inside', 'Scheduled within 48h'],
    next3: ['HD photos + honest report', 'Including what we did not like'],
    next4: ['If we cannot reach the property', 'Full refund, no questions'],
  },
  'deal-assistance': {
    title: 'Deal Assistance', emoji: '🛡️',
    next1: ['Send us the contract + listing', 'Reply to this email'],
    next2: ['Clause-by-clause review in English', 'First pass within 24h'],
    next3: ['Landlord & property verification', 'Registry + identity checks'],
    next4: ['We negotiate for you', 'Average saving beats the fee'],
  },
  'deposit-recovery': {
    title: 'Deposit Recovery', emoji: '💶',
    next1: ['Send the story', 'Contract, amounts, photos, messages — reply to this email'],
    next2: ['We assess the position', 'Within 48h: what is recoverable and how'],
    next3: ['Formal demand goes out', 'PEC / registered letter, the proper way'],
    next4: ['You get paid', '20% success fee only on what comes back'],
  },
  'contract-check-express': {
    title: 'Contract Check Express', emoji: '🚦',
    next1: ['Send the contract', 'Reply to this email with the draft'],
    next2: ['We read every clause', 'The same eyes as Deal Assistance'],
    next3: ['Verdict within 24 hours', 'Green / amber / red, in writing'],
    next4: ['Need the full shield?', '€49 credited on Deal Assistance'],
  },
};

async function handleService(res, session, m) {
  const docId = session.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
  const now = new Date().toISOString();
  const amountEur = (session.amount_total || 0) / 100;
  const email = m.email || session.customer_email || '';
  const meta = SERVICE_META[m.kind] || { title: m.kind || 'Service', emoji: '✓' };
  const lead = {
    type: 'service',
    service: 'SERVICE',
    kind: m.kind || '',
    status: 'new',
    paid: true,
    source: 'web',
    intent: 'service',
    name: m.name || '',
    email,
    phone: m.phone || '',
    listingName: m.listing || '',
    message: `${meta.title} bought one-tap (€${amountEur}). ${m.listing ? 'Property: ' + m.listing + '. ' : ''}${m.notes ? 'Notes: ' + m.notes : ''}`,
    amount_paid: session.amount_total || 0,
    amount_eur: amountEur,
    currency: session.currency || 'eur',
    stripe_session_id: session.id,
    paid_at: now,
    createdAt: now,
  };
  try {
    const w = await writeDoc('leads', 'svc_' + docId, lead);
    if (w && w.exists) {
      // Doc already there: either the checkout-start capture (upgrade it to
      // paid and continue to the emails) or a true Stripe redelivery after
      // a fully processed payment (stop — emails already went out).
      const existing = await readDoc(`leads/svc_${docId}`);
      if (existing && existing.paid === true) {
        return res.status(200).json({ received: true, duplicate: true, serviceLeadId: 'svc_' + docId });
      }
      await patchDoc(`leads/svc_${docId}`, lead);
    }
  } catch (err) {
    // A paying customer must never vanish from the pipeline. 500 → Stripe
    // redelivers; the write is idempotent on the session-derived docId.
    console.error('Firestore service lead write error:', err);
    await tgNotify(`🚨 <b>Stripe: ${meta.title} €${amountEur} PAGATO ma lead NON scritto</b>\n${m.name || ''} · ${email || '—'} · session ${session.id}\nErrore: ${String(err.message || err).slice(0, 200)}\nRiprovo automaticamente (retry Stripe).`);
    return res.status(500).json({ received: false, error: 'lead_write_failed' });
  }

  const firstName = (m.name || '').split(' ')[0] || 'there';
  try {
    await sendEmailJS({
      to_email: 'valentino@boom-rome.com',
      heading: `${meta.emoji} ${meta.title.toUpperCase()} — €${amountEur} paid`,
      subheading: m.name || 'New service purchase',
      name: 'Valentino',
      intro: `Someone just bought ${meta.title} with one tap. Clock is running — the page promises first contact fast.`,
      card_color: '#D4AF37',
      card_title: meta.title,
      r1_icon: '👤', r1_label: 'Client', r1_value: m.name || '—',
      r2_icon: '📧', r2_label: 'Email', r2_value: email || '—',
      r3_icon: '📱', r3_label: 'Phone', r3_value: m.phone || '—',
      r4_icon: '🏠', r4_label: 'Property', r4_value: m.listing || '—',
      closing: `Paid €${amountEur}. ${m.notes ? 'Notes: ' + m.notes + '. ' : ''}Stripe: ${session.id}. Record: leads/svc_${docId}.`,
      cta_text: 'Open portal',
      portal_link: 'https://www.boomrome.com/portal.html#leads',
    });
  } catch (err) {
    console.error('Admin service email error:', err);
    await tgNotify(`⚠️ Stripe ${meta.title} €${amountEur}: email admin non partita — lead salvato in leads/svc_${docId}. ${m.name || ''} · ${email || '—'}`);
  }

  try {
    if (email) await sendEmailJS({
      to_email: email,
      heading: `Your ${meta.title} is confirmed`,
      subheading: 'BOOM Rome — paid & scheduled',
      name: firstName,
      intro: `Payment received — €${amountEur}, Stripe-secured. Here's exactly what happens next:`,
      card_color: '#D4AF37',
      card_title: 'What happens next',
      r1_icon: '✓', r1_label: (meta.next1 || ['We take it from here'])[0], r1_value: (meta.next1 || ['', 'Right away'])[1],
      r2_icon: '✓', r2_label: (meta.next2 || ['—'])[0], r2_value: (meta.next2 || ['', ''])[1],
      r3_icon: '✓', r3_label: (meta.next3 || ['—'])[0], r3_value: (meta.next3 || ['', ''])[1],
      r4_icon: '✓', r4_label: (meta.next4 || ['—'])[0], r4_value: (meta.next4 || ['', ''])[1],
      closing: 'Anything at all — reply to this email or message us on WhatsApp. A human answers within 2 hours.',
      cta_text: 'Back to BOOM',
      portal_link: 'https://www.boomrome.com/apartments.html',
    });
  } catch (err) {
    console.error('Client service email error:', err);
    await tgNotify(`⚠️ Stripe ${meta.title} €${amountEur}: conferma al CLIENTE non partita — contattalo tu: ${m.name || ''} · ${email || '—'} · ${m.phone || '—'}`);
  }

  return res.status(200).json({ received: true, serviceLeadId: 'svc_' + docId });
}

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
  try {
    const w = await writeDoc('leads', 'res_' + docId, lead);
    if (w && w.exists) {
      // Checkout-start capture → upgrade to paid and continue; true
      // redelivery of a processed payment → stop (hold + emails done).
      const existing = await readDoc(`leads/res_${docId}`);
      if (existing && existing.paid === true) {
        return res.status(200).json({ received: true, duplicate: true, reservationId: 'res_' + docId });
      }
      await patchDoc(`leads/res_${docId}`, lead);
    }
  } catch (err) {
    console.error('Firestore reservation write error:', err);
    await tgNotify(`🚨 <b>Stripe: hold €${amountEur} PAGATO ma lead NON scritto</b>\n${m.listingName || ''} · ${m.name || ''} · ${email || '—'} · session ${session.id}\nErrore: ${String(err.message || err).slice(0, 200)}\nRiprovo automaticamente (retry Stripe).`);
    return res.status(500).json({ received: false, error: 'lead_write_failed' });
  }

  // Enforce the product promise: the page sells "€300 holds this home for
  // 48 hours, off the market" — so actually take it off the market. The
  // previous status is kept so the expiry sweep (reminder-cron) can revert.
  const holdHours = 48;
  const reservedUntil = new Date(Date.now() + holdHours * 3600 * 1000).toISOString();
  if (m.listingId) {
    try {
      const listing = await readDoc(`listings/${m.listingId}`);
      const prevStatus = String((listing && listing.status) || 'available').toLowerCase();
      if (listing && prevStatus === 'reserved') {
        // Double-hold: someone else already paid for this home. Do NOT
        // clobber their hold — wake the operator, a refund is due.
        await tgNotify(`🚨 <b>DOPPIO HOLD sullo stesso immobile</b>\n${m.listingName || m.listingId} — già in hold (${listing.reservedBy || '?'}), ora ha pagato anche ${m.name || ''} (${email || '—'}, €${amountEur}).\nUno dei due va rimborsato: leads/res_${docId}.`);
      } else if (listing && prevStatus !== 'rented' && prevStatus !== 'affittato' && prevStatus !== 'off_market') {
        await patchDoc(`listings/${m.listingId}`, {
          status: 'reserved',
          reservedUntil,
          reservedBy: 'res_' + docId,
          reservedByName: m.name || '',
          reservedAt: now,
          statusBeforeReserve: prevStatus,
        });
      }
    } catch (err) {
      console.error('[reserve] listing hold failed:', err.message);
      await tgNotify(`⚠️ Hold pagato ma il listing ${m.listingId} NON risulta riservato (errore: ${String(err.message).slice(0, 150)}) — toglilo dal mercato a mano.`);
    }
  } else {
    await tgNotify(`⚠️ Hold €${amountEur} pagato senza listingId (${m.listingName || '—'}) — verifica e togli dal mercato a mano. leads/res_${docId}.`);
  }

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
  } catch (err) {
    console.error('Admin reservation email error:', err);
    await tgNotify(`⚠️ Hold €${amountEur} su ${m.listingName || '—'}: email admin non partita — lead in leads/res_${docId}.`);
  }

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
  } catch (err) {
    console.error('Client reservation email error:', err);
    await tgNotify(`⚠️ Hold €${amountEur} su ${m.listingName || '—'}: conferma al CLIENTE non partita — contattalo tu: ${m.name || ''} · ${email || '—'} · ${lead.phone || '—'}`);
  }

  return res.status(200).json({ received: true, reservationId: 'res_' + docId });
}

// RENT — a tenant paid a monthly rent installment from the portal
// (api/rent-checkout.js). Marks the payments doc paid, wakes the operator,
// confirms to the tenant. Idempotent: a redelivery sees status 'paid'.
async function handleRent(res, session, m) {
  const paymentId = String(m.paymentId || '').trim();
  if (!paymentId) return res.status(200).json({ received: true, skipped: 'no_paymentId' });
  const now = new Date().toISOString();
  const amountEur = (session.amount_total || 0) / 100;

  let payment = null;
  try { payment = await readDoc(`payments/${paymentId}`); } catch (_) {}
  if (!payment) {
    await tgNotify(`🚨 <b>Stripe: affitto €${amountEur} INCASSATO ma payments/${paymentId} non trovato</b>\nSession ${session.id} — verifica a mano.`);
    return res.status(500).json({ received: false, error: 'payment_not_found' });
  }
  if (payment.status === 'paid') {
    return res.status(200).json({ received: true, duplicate: true, paymentId });
  }

  try {
    await patchDoc(`payments/${paymentId}`, {
      status: 'paid',
      paidAt: now,
      paidDate: now.slice(0, 10),
      paidVia: 'stripe',
      stripeSessionId: session.id,
    });
  } catch (err) {
    console.error('[rent] payment patch:', err.message);
    await tgNotify(`🚨 <b>Stripe: affitto €${amountEur} INCASSATO ma NON registrato</b>\npayments/${paymentId} · session ${session.id}\nErrore: ${String(err.message).slice(0, 200)}\nRiprovo automaticamente (retry Stripe).`);
    return res.status(500).json({ received: false, error: 'payment_patch_failed' });
  }

  try {
    await writeDoc('agentNotifications', 'rent-' + paymentId, {
      type: 'payment.rent',
      summary: `💰 Affitto incassato via Stripe: €${amountEur.toLocaleString('it-IT')} · ${m.month || ''} · payments/${paymentId}`,
      priority: 'normal',
      status: 'pending',
      actor: 'stripe-webhook',
      dedupKey: 'rent-' + paymentId,
      createdAt: now,
      attempts: 0,
    });
  } catch (err) { console.error('[rent] notify write:', err.message); }

  const email = session.customer_email || '';
  try {
    if (email) await sendEmailJS({
      to_email: email,
      heading: 'Rent received ✓',
      subheading: m.month ? `Month: ${m.month}` : 'Payment confirmed',
      name: 'there',
      intro: `We've received your rent payment of €${amountEur.toLocaleString('it-IT')} via Stripe. Nothing else to do — this email is your confirmation.`,
      card_color: '#D4AF37',
      card_title: 'Details',
      r1_icon: '✓', r1_label: 'Amount', r1_value: `€${amountEur.toLocaleString('it-IT')}`,
      r2_icon: '📅', r2_label: 'Month', r2_value: m.month || '—',
      r3_icon: '🧾', r3_label: 'Receipt', r3_value: 'Available in your portal',
      r4_icon: '💬', r4_label: 'Questions', r4_value: 'Reply to this email anytime',
      closing: 'Thank you — BOOM Rome',
      cta_text: 'Open your portal',
      portal_link: 'https://www.boomrome.com/portal.html',
    });
  } catch (err) { console.error('[rent] tenant email:', err.message); }

  await tgNotify(`💰 Affitto incassato via Stripe: €${amountEur.toLocaleString('it-IT')} · ${m.month || ''} · payments/${paymentId}`);

  return res.status(200).json({ received: true, rent: true, paymentId });
}

// PREAGREEMENT — the client paid what was due at signing on their proposal.
// Marks the doc paid and sends the confirmation emails (client: document +
// Stripe receipt; admin: copy + next-step nudge). Idempotent on webhook
// retries via paidSessionId — but email delivery is tracked SEPARATELY
// (paidEmailsSentAt): a redelivery re-attempts unsent emails instead of
// short-circuiting, and a client-email failure returns 500 so Stripe keeps
// redelivering until the confirmation actually goes out.
async function handlePreagreement(res, session, m) {
  const token = String(m.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(200).json({ received: true, skipped: 'bad_pa_token' });

  let hit = null;
  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    hit = rows && rows[0];
  } catch (e) { console.error('[webhook/pa] lookup failed:', e.message); }
  if (!hit) {
    // Money arrived but the PA can't be found — the one state that must
    // never pass silently. Wake the operator, then 500 so Stripe retries.
    await tgNotify(`🚨 <b>Stripe: pagamento pre-agreement SENZA documento</b>\nSession ${session.id} · ${m.ref || 'senza rif'} · ${m.email || '—'}\nIl webhook non trova il preAgreement per il token — controlla subito.`);
    return res.status(500).json({ received: false, error: 'pa_not_found' });
  }
  const { id, ...pa } = hit;   // fsList returns flat rows: {id, ...fields}

  const isRetry = pa.paidSessionId === session.id;
  if (isRetry && pa.paidEmailsSentAt) {
    return res.status(200).json({ received: true, duplicate: true });   // fully processed
  }

  const paidEur = isRetry ? (pa.paidEur || (session.amount_total || 0) / 100) : (session.amount_total || 0) / 100;
  const paidAt = isRetry ? (pa.paidAt || new Date().toISOString()) : new Date().toISOString();
  if (!isRetry) {
    try {
      await fsPatch(`preAgreements/${id}`, {
        status: 'paid', paidAt, paidEur,
        paidSessionId: session.id,
        stripePaymentIntent: String(session.payment_intent || ''),
      });
    } catch (e) { console.error('[webhook/pa] patch failed:', e.message); }
  }

  // Stripe receipt link (best-effort)
  let receiptUrl = null;
  try {
    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent), { expand: ['latest_charge'] });
      receiptUrl = (pi.latest_charge && pi.latest_charge.receipt_url) || null;
    }
  } catch (e) { console.error('[webhook/pa] receipt lookup failed:', e.message); }

  let emails = { client: false, admin: false };
  try {
    emails = await sendPaEmails({
      pa, ref: pa.ref || m.ref || '', url: '/pre-agreement?t=' + token,
      receiptUrl, paidEur, paidAt, event: 'paid',
    });
  } catch (e) { console.error('[webhook/pa] emails failed:', e.message); }

  const clientEmailExpected = !!((pa.tenant || {}).email);
  const clientOk = emails.client || !clientEmailExpected;
  if (clientOk) {
    try { await fsPatch(`preAgreements/${id}`, { paidEmailsSentAt: new Date().toISOString() }); }
    catch (e) { console.error('[webhook/pa] sent-stamp failed:', e.message); }
  }

  // Payment confirmed = deal sealed → auto-create the contract and send the
  // tenant their Magic-Sign link (PA must carry propertyId + autoConvert).
  // Runs BEFORE the email-failure 500 below: convert is idempotent, and the
  // contract must exist even while the confirmation email is being retried.
  const converted = await maybeAutoConvert({ pa: { ...pa, status: 'paid', paidAt, paidEur }, paId: id });

  if (!clientOk) {
    // Client paid but got no confirmation on either transport. 500 → Stripe
    // redelivers (backoff, up to ~3 days) and the retry re-attempts ONLY the
    // emails (doc already patched, convert idempotent). sendPaEmails already
    // pinged Telegram with the details.
    return res.status(500).json({ received: false, error: 'client_email_failed', preAgreementId: id });
  }

  return res.status(200).json({ received: true, preAgreementId: id, contractId: (converted && converted.contractId) || null });
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

  // Abandoned checkout (Stripe expires unfinished sessions after ~24h):
  // flip the checkout-start lead to 'abandoned' and nudge the operator —
  // a typed name+email+phone with buying intent is a recovery call, not a
  // vanished record.
  if (event.type === 'checkout.session.expired') {
    const s = event.data.object;
    const md = s.metadata || {};
    const prefix = { SERVICE: 'svc_', RESERVE: 'res_', PFS: 'pfs_' }[md.service];
    // PREAGREEMENT has its own resume flow (pay.js + 24h reminder) — skip.
    if (!prefix) return res.status(200).json({ received: true, ignored: event.type });
    const docId = s.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
    try {
      // Upsert: sessions started before the checkout-start capture shipped
      // have no lead doc yet — carry the contacts so the record stands alone.
      await patchDoc(`leads/${prefix}${docId}`, {
        service: md.service,
        status: 'abandoned',
        paid: false,
        source: 'web',
        name: md.name || '',
        email: md.email || s.customer_email || '',
        phone: md.phone || '',
        listingName: md.listingName || md.listing || '',
        stripe_session_id: s.id,
        abandonedAt: new Date().toISOString(),
      });
    } catch (err) { console.error('[expired] lead patch failed:', err.message); }
    const eurExp = (s.amount_total || 0) / 100;
    await tgNotify(`🛒 <b>Checkout abbandonato — €${eurExp}</b>\n${md.kind || md.service} · ${md.name || '—'} · ${md.email || s.customer_email || '—'} · ${md.phone || '—'}${md.listingName || md.listing ? `\n🏠 ${md.listingName || md.listing}` : ''}\nRichiamalo: il lead è in leads/${prefix}${docId}.`);
    return res.status(200).json({ received: true, abandoned: `${prefix}${docId}` });
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

  if (m.service === 'SERVICE') {
    return handleService(res, session, m);
  }

  if (m.service === 'PREAGREEMENT') {
    return handlePreagreement(res, session, m);
  }

  if (m.service === 'RENT') {
    return handleRent(res, session, m);
  }

  if (m.service !== 'PFS') {
    return res.status(200).json({ received: true, skipped: m.service || 'none' });
  }

  const docId = session.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
  let portalToken = crypto.randomBytes(24).toString('hex');
  let portalCode = genPortalCode();
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

  try {
    const w = await writePfsClient(docId, doc);
    if (w && w.exists) {
      // Stripe redelivery. The FIRST delivery stored the codes — reuse them:
      // minting fresh ones here would email the client an access code that
      // was never saved (a €350 client locked out of their portal).
      const existing = await readDoc(`pfsClients/${docId}`);
      if (existing) {
        if (existing.welcomeEmailsSentAt) {
          return res.status(200).json({ received: true, duplicate: true, pfsClientId: docId });
        }
        portalCode = existing.portalAccessCode || portalCode;
        portalToken = existing.portal_token || portalToken;
      }
    }
  } catch (err) {
    // €350 received and no client record: 500 → Stripe redelivers (the
    // write is idempotent on the session-derived docId).
    console.error('Firestore error:', err);
    await tgNotify(`🚨 <b>Stripe: PFS €350 PAGATO ma cliente NON scritto</b>\n${m.name || ''} · ${m.email || session.customer_email || '—'} · session ${session.id}\nErrore: ${String(err.message || err).slice(0, 200)}\nRiprovo automaticamente (retry Stripe).`);
    return res.status(500).json({ received: false, error: 'pfs_write_failed' });
  }

  // Close the funnel trace left by create-checkout (best-effort).
  try { await patchDoc(`leads/pfs_${docId}`, { status: 'converted', paid: true, paid_at: now }); }
  catch (err) { console.error('[pfs] funnel lead patch failed:', err.message); }

  const firstName = (m.name || '').split(' ')[0] || 'there';
  const portalLink = `https://www.boomrome.com/portal.html?pfs=${portalToken}`; // admin deep-link
  const clientPortalLink = `https://www.boomrome.com/client-portal?code=${portalCode}`;

  // === EMAIL 1 — CLIENT CONFIRMATION ===
  let clientEmailed = false;
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
    clientEmailed = true;
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
  } catch (err) {
    console.error('Admin EmailJS error:', err);
    await tgNotify(`⚠️ PFS €350: email admin non partita — cliente in pfsClients/${docId} · codice ${portalCode} · ${m.name || ''} (${doc.email || '—'}).`);
  }

  if (clientEmailed) {
    try { await patchDoc(`pfsClients/${docId}`, { welcomeEmailsSentAt: new Date().toISOString() }); }
    catch (err) { console.error('[pfs] sent-stamp failed:', err.message); }
  } else {
    // The welcome email carries the portal access code — a €350 client
    // without it is locked out. Telegram now; 500 → Stripe redelivers and
    // the retry re-attempts ONLY the emails (record + codes are stored).
    await tgNotify(`🚨 <b>PFS €350: benvenuto al CLIENTE non partito</b>\n${m.name || ''} · ${doc.email || '—'} · codice portale ${portalCode}\nMandaglielo tu (WhatsApp: ${m.phone || '—'}) o attendi il retry automatico.`);
    return res.status(500).json({ received: false, error: 'client_email_failed', pfsClientId: docId });
  }

  return res.status(200).json({ received: true, pfsClientId: docId });
}
