import Stripe from 'stripe';
import crypto from 'node:crypto';
import { fsList, fsPatch, fsGet, fsGetVersioned, fsCommit, getAdminToken, toFsValue } from './homie/_lib.js';
import { sendPaEmails, shell, para, fine, btn, btn2 } from './preagreement/_notify.js';
import { sendEmail } from './agent/_lib.js';
import { maybeAutoConvert } from './preagreement/_auto.js';
import { tgNotify } from './pfs/_health.js';
import { CITY_MARKETS, CITY_PLANS, cityPhone, serviceLeadId, moneyOf, cityOffer } from './_market.js';
import { isUpgradeLeadId, UPGRADE_PATHS, upgradeDaysOf, upgradeVoidReason, upgradeMoneyBackNote, openCreditsFor, upgradeOffer, samePhone, fullSearchHeld, refundCreditVerdict, claimWaits } from './_upgrade.js';
import { upgradeLink } from './payments/_token.js';
import SCALO from '../js/scalo-codes.js';
import DESK_CAL from '../js/desk-calendar.js';
import { withdrawalWindow, WITHDRAWAL_FORM_URL, WITHDRAWAL_FORM_TEXT, WITHDRAWAL_FORM_TEXT_IT } from './_withdrawal.js';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Il login di servizio è UNO per tutta la piattaforma (homie/_lib:
// cache + un solo login in volo). Prima ogni lettura/scrittura del webhook
// rifaceva il login con la password — quattro login per un solo evento Stripe.
async function firebaseIdToken() {
  return getAdminToken();
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = Number.isInteger(v)
      ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    // A nested map or list is encoded as one (homie/_lib toFsValue): String(v)
    // stored every paid city lead's `city` block as "[object Object]" from
    // 14/10, so the Telegram card lost the plan and the start day. Dates keep
    // their old string form — no reader changes shape.
    else if (typeof v === 'object' && !(v instanceof Date)) fields[k] = toFsValue(v);
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

  // A hung send would hold the function until the platform kills it at 60s,
  // before the delivery is recorded: the 10s limit turns a hang into a throw
  // the caller records (and alerts on).
  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
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

  let depW = null;
  try {
    depW = await writeDoc('payments', 'dep_' + contractId, {
      type: 'deposit',
      contractId,
      tenantId: (c && c.tenantId) || '',
      propertyId: (c && c.propertyId) || '',
      amount: amountEur,
      month: 'deposito',
      dueDate: now.slice(0, 10),
      status: 'paid',
      paidAt: now,
      paidDate: now.slice(0, 10),   // consumed by /casa rows + portal revenue stats
      paidVia: 'stripe',
      stripeSessionId: session.id,
      createdAt: now,
    });
  } catch (err) { console.error('[deposit] payment write:', err.message); }

  if (depW && depW.exists) {
    // Retry di Stripe: pagamento già registrato, notifiche ed email già partite.
    return res.status(200).json({ received: true, duplicate: true, contractId });
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

// Nessun tempo di risposta in cifre, da nessuna parte (decisione del
// fondatore, 15/10/2026): le email dicono QUANDO risponde una persona, mai
// un numero di ore. Le stesse frasi delle pagine; tests/verita scandisce
// questo file.
const OFFICE_HOURS_EN = 'A person replies during office hours (Rome time); messages sent out of hours are answered the next working morning.';
const OFFICE_HOURS_IT = "Una persona risponde in orario d'ufficio (ora di Roma); i messaggi fuori orario hanno risposta il mattino lavorativo dopo.";
// A city desk that does not answer on Rome hours says its own
// (CITY_MARKETS.<slug>.hoursEn — London: 'Mon–Fri 08:00–18:00, London
// time'); every other desk keeps the Rome line above, byte for byte.
const officeHoursEn = (desk) => (desk && desk.hoursEn
  ? `A person replies during office hours (${desk.hoursEn}); messages sent out of hours are answered the next working morning.`
  : OFFICE_HOURS_EN);

// RESERVE — a tenant paid a refundable holding deposit to reserve an apartment.
// SERVICE — a productised service was bought one-tap (Services 2.0):
// virtual-viewing €89 / deal-assistance €249. Lead into the pipeline +
// admin nudge + client confirmation with the honest next steps.
const SERVICE_META = {
  'virtual-viewing': {
    title: 'Virtual Viewing', emoji: '🎥',
    next1: ['We contact the advertiser', 'During office hours (Rome time)'],
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
    next3: ['Written verdict in 24h', 'From when the contract reaches us — green / amber / red'],
    next4: ['Need the full shield?', '€49 credited on Deal Assistance'],
  },
  'movein-pack': {
    title: 'Move-in Pack', emoji: '🔌',
    next1: ['We take over your utilities', 'Electricity & gas transfers started today'],
    next2: ['Internet activated', 'Best available line at your address'],
    next3: ['Residency guide', 'Step-by-step for the anagrafe'],
    next4: ['You arrive, everything works', 'Status updates on WhatsApp'],
  },
  'cleaning-premium': {
    title: 'Cleaning Premium', emoji: '✨',
    next1: ['We schedule the team', 'The day before your move-in'],
    next2: ['Professional deep clean', 'Kitchen, bathrooms, floors, windows'],
    next3: ['Photo report when done', 'So you see it before you arrive'],
    next4: ['Keys to a spotless home', 'Hotel-fresh, guaranteed'],
  },
  'remote-move-pack': {
    title: 'Remote Move Pack', emoji: '🧳',
    next1: ['Send your shortlist', 'Reply with 1–2 listings — or ask us to point you'],
    next2: ['Live video viewings ×2', 'Scheduled within 48h, you join from anywhere'],
    next3: ['Contract checked & negotiated', 'Clause-by-clause in English, verdict in 24h'],
    next4: ['You land ready', 'Keys plan + utilities guidance before your flight'],
  },
  // lang:'it' → the client confirmation email switches to Italian (the
  // concordato buyer is a Rome landlord — same reader-language rule as _lang.js).
  'concordato-pack': {
    title: 'Pacchetto Concordato', emoji: '🏛️', lang: 'it',
    next1: ['Ci mandi i dati dell\'immobile', 'Risponda a questa email: visura o vecchio contratto'],
    next2: ['Verifica del canone', 'In 48 ore dai dati, da quando la pratica parte: fascia, massimo e bozza del contratto'],
    next3: ['Attestazione di rispondenza', 'Pratica seguita con l\'organizzazione firmataria (tariffa a parte, detta prima)'],
    next4: ['Registrazione RLI', 'Contratto registrato e fascicolo completo in PDF'],
  },
};

// THE CITY DESKS (BOOM_CITIES_BRIEF.md, 14/10): a plan bought from
// /amsterdam, /madrid… arrives with metadata.city (api/service-checkout.js →
// cityOffer). Same SERVICE rail, two differences: the lead carries the
// MARKET (api/_market.js isCityMarket → the Commerciale stands down, the
// Telegram card speaks of the city and says the money is in), and the next
// steps are the desk's, not a Rome service's. Keyed by plan id, any city.
const CITY_SERVICE_META = {
  'full-search': {
    emoji: '🧭',
    next1: ['Your brief call', "Booked in the desk's first open hour: your dates, budget and situation"],
    next2: ['Dossier in one working day', 'From your papers — local format: income, employer, ID, references, cover letter'],
    next3: ['Applications as listings appear', 'From the first listing that fits — you see every one'],
    next4: ['A BOOM person at the viewing', 'Live video + written report, contract checked before you sign — the search runs until you sign or tell us to stop'],
  },
  'application-pack': {
    emoji: '📁',
    next1: ['Send your documents', 'Reply to this email: income proof, employer letter, ID'],
    next2: ['Dossier in one working day', 'From your papers — local format, cover letter in the local language and English'],
    next3: ['Income and guarantor strategy', 'Written so a landlord reads it as safe'],
    next4: ['Contract review', 'Before you sign — rent, deposit, charges, contract type'],
  },
  'attended-viewing': {
    emoji: '🎥',
    next1: ['Send the listing', 'Reply with the link and the slots that work for you'],
    next2: ['We book the viewing', 'With the agent, on the first slot that works for you'],
    next3: ['Live video walkthrough', 'You join from anywhere, you ask what you want'],
    next4: ['Written report', 'Light, noise, damp, neighbours, commute — and a straight recommendation'],
  },
};
// The cover letter's language, where "the local language and English" reads
// wrong: in London the local language IS English, in Milan it is Italian; in
// Valencia two languages are local (Valencian is co-official) and the page
// promises the letter in Spanish.
// The desks not listed keep the line above, byte for byte.
const CITY_LETTER_LANG = { london: 'in English', milan: 'in Italian and English', valencia: 'in Spanish and English', paris: 'in French', berlin: 'in German' };
// Berlin's Full Search works only on homes a landlord lets BOOM offer to the
// tenant alone (the page's first line, WoVermRG §2(1a)): its third step says
// that, not "applications as listings appear" (06/11, the desk takes the card)
const CITY_FS_NEXT3 = { berlin: ['Homes offered to you alone', "From landlords who let us offer a home to you alone, with their go-ahead — you see every one"] };
function cityServiceMeta(cityKey, kind) {
  const base = CITY_SERVICE_META[kind] || { emoji: '✓' };
  if (kind === 'full-search' && CITY_FS_NEXT3[cityKey]) return { ...base, next3: CITY_FS_NEXT3[cityKey] };
  const lang = CITY_LETTER_LANG[cityKey];
  if (kind !== 'application-pack' || !lang) return base;
  return { ...base, next2: [base.next2[0], `From your papers — local format, cover letter ${lang}`] };
}

// The 14-day withdrawal window and the model withdrawal form live in
// api/_withdrawal.js (moved there verbatim in v1.8: the order of a desk that
// charges at signing counts the same window without loading this file).
// Re-exported here, so every caller and test that imported them from the
// webhook is unchanged.
export { withdrawalWindow, withdrawalEnds, WITHDRAWAL_FORM_URL, WITHDRAWAL_FORM_TEXT, WITHDRAWAL_FORM_TEXT_IT } from './_withdrawal.js';

// The desk calendar (Italy + the desk's own holidays) lives in ONE copy,
// js/desk-calendar.js: the city pages print the desk window from the same
// tables, so a page never says "desk open" on a day this webhook counts as a
// holiday (Koningsdag, the Diada, Christmas).
// the calendar keys a desk may name (CITY_MARKETS.<slug>.holidays || country):
// an unknown key would silently fall back to Italy alone, so tests pin it
export const HOLIDAY_KEYS = DESK_CAL.HOLIDAY_KEYS;
export const isDeskHoliday = (date, country) => DESK_CAL.isDeskHoliday(date, country);

// The file number of a paid city order (v1.4): ONE number per person. The
// checkout carries metadata.file_ref — the lead /api/city-lead opened for
// this visitor (city_<requestId>) — and its number is reused only when that
// lead EXISTS and belongs to the SAME city (a reference from another desk,
// or one that names nothing, never lends its number). Otherwise the number
// is derived from the paid lead's own id. fsGet, not the local readDoc:
// `city` is a nested map, and readDoc flattens maps to null.
// A read that FAILS is not a lead that is absent (the ASPI lesson): a thrown
// error (a Firestore 5xx, a login hiccup) is retried once; a 404 (fsGet
// answers null) is an answer and is not. If the second read fails too the
// order keeps its own derived number — the nickname never fails a paid
// order — and the reference it could not check is written on the lead
// (fileRefUnverified), so the operator can link the two leads by hand.
const FILE_REF_RE = /^city_[a-z0-9_]{8,48}$/;
async function cityFileFor(svcId, cityKey, fileRef) {
  if (fileRef && FILE_REF_RE.test(fileRef)) {
    let opened = null, failed = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { opened = await fsGet('leads/' + fileRef); failed = false; break; }
      catch (e) { failed = true; console.warn(`[service] file_ref read failed (attempt ${attempt + 1}):`, e && e.message); }
    }
    if (failed) return { file: SCALO.fileCode(svcId), fileLeadId: null, fileRefUnverified: fileRef };
    const f = opened && opened.market === cityKey && opened.city && typeof opened.city.file === 'string' ? opened.city.file : null;
    if (f && /^BM [A-Z2-9]{5}$/.test(f)) return { file: f, fileLeadId: fileRef };
  }
  return { file: SCALO.fileCode(svcId), fileLeadId: null };
}

// THE UPGRADE CREDIT (api/_upgrade.js). A Full Search paid through a
// personal upgrade link carries credit_from = the lead of the paid
// Application Pack. That lead is re-read here: the credit is trusted only when
// it is a paid order of the SAME desk, and then the upgrade keeps the pack's
// file number (one person, one file). The credit is marked used on the pack's
// lead under a version precondition, idempotently: a Stripe retry of the same
// session finds its own mark and stops. A credit already used by ANOTHER
// session (two upgrade checkouts paid in parallel) is never re-marked: an
// urgent alert asks the operator to settle the difference on Stripe.
// A second delivery of the same event reads the pack as it is TODAY: when the
// pack already carries this order's mark, the credit was spent by this order
// while it was due — a refund of the pack that came afterwards does not turn
// it into "a credit that was not due" (svcId).
// A read that FAILS is not a pack that cannot be verified (the third review,
// 12/11/2026): `unread` — the handler answers 500 before anything is written
// and Stripe delivers the event again. Filed as "unverified" with a 200, the
// credit was never marked and the link stayed open for good.
async function upgradeCreditFor(m, cityKey, svcId) {
  if (!cityKey || typeof m.credit_from !== 'string' || !isUpgradeLeadId(m.credit_from)) return null;
  const credit = { from: m.credit_from, plan: String(m.credit_plan || ''), amount: Number(m.credit_amount) || null, verified: false, file: null };
  let src = null, read = false;
  for (let attempt = 0; attempt < 2 && !read; attempt++) {
    try { src = await fsGet('leads/' + m.credit_from); read = true; }
    catch (e) { console.warn(`[service] credit_from read failed (attempt ${attempt + 1}):`, e && e.message); }
  }
  if (!read) return { ...credit, unread: true };
  const sc = src && src.city && typeof src.city === 'object' ? src.city : null;
  if (src && src.market === cityKey && src.paid === true && sc && sc.paid === true) {
    // A pack whose money went back (refunded, or disputed) carries no credit
    // (api/_upgrade.js upgradeVoidReason). The till refuses it, so a session
    // that still got here was opened before the refund landed: the order
    // keeps the pack's file (same person) but the credit is NOT verified,
    // is never marked, and the operator gets an urgent alert.
    const mine = !!svcId && src.credit && typeof src.credit === 'object' && src.credit.usedBy === svcId;
    const voided = mine ? null : upgradeVoidReason(src);
    if (voided) credit.voided = voided;
    else credit.verified = true;
    // a withdrawal statement is on file for the pack and no refund was made
    // yet: the credit holds (a statement alone returns no money), but the
    // operator must know before refunding the pack — the credit is spent
    if (!voided && (src.withdrawnAt || (src.withdrawal && typeof src.withdrawal === 'object'))) credit.statement = true;
    if (!credit.plan && sc.service) credit.plan = String(sc.service);
    if (typeof sc.file === 'string' && /^BM [A-Z2-9]{5}$/.test(sc.file)) credit.file = sc.file;
  }
  return credit;
}

// An upgrade paid with the credit of a pack whose money had gone back
// (refunded, or disputed): the client paid the difference only, and no credit
// was due. And an upgrade paid on a pack with a withdrawal statement on file:
// the credit holds, but a later refund of that pack must count it.
// Idempotent (deterministic ids): a Stripe retry does not ring twice.
// (credit.voidedAfter: a REDELIVERY whose order had recorded a verified credit, on a pack whose money went
// back since — the credit was spent while it was due, so it is marked used and the operator settles the rest.)
async function flagVoidCredit(credit, svcId, docId, paidAmount, out = null) {
  if (!credit) return;
  const ring = (id, type, summary) => ringOperator(id, type, summary, svcId, {}, out);
  if (credit.voidedAfter) {
    await ring('upgrade-after-' + docId, 'service.upgrade_credit_then_refunded',
      `⚠️ Upgrade ${svcId} (${paidAmount}): il credito dell'ordine ${credit.from} era valido al pagamento ed è stato usato; nel frattempo quel pack risulta ${credit.voidedAfter === 'disputed' ? 'contestato in banca' : 'rimborsato'}: il cliente ha avuto il credito e ${credit.voidedAfter === 'disputed' ? 'la banca gli sta restituendo il pack' : 'il rimborso del pack'} — regola la differenza su Stripe.`);
  } else if (credit.voided) {
    await ring('upgrade-void-' + docId, 'service.upgrade_credit_void',
      `⚠️ Upgrade ${svcId} pagato ${paidAmount} col credito dell'ordine ${credit.from}, ${credit.voided === 'disputed' ? 'il cui pagamento è contestato in banca' : 'che era stato rimborsato'}: il credito non era dovuto. Regola la differenza col cliente (o rimborsa l'upgrade) su Stripe.`);
  } else if (credit.statement && credit.verified) {
    await ring('upgrade-wdr-' + docId, 'service.upgrade_credit_statement',
      `⚠️ Upgrade ${svcId} pagato ${paidAmount} col credito dell'ordine ${credit.from}, sul quale c'è una dichiarazione di recesso non ancora rimborsata: il credito è stato USATO. Se rimborsi quel pack, tienine conto (il cliente ha già avuto ${credit.amount ? 'quei soldi come credito' : 'il credito'}).`);
  }
}

// One idempotent card for the operator (deterministic id: a Stripe retry does not ring twice).
// A card that cannot be WRITTEN must not be lost with a 200 (the third review): `out.cardFailed` — the handler
// answers 500, Stripe delivers again and the duplicate branch rings it from what the order recorded.
async function ringOperator(id, type, summary, svcId, extra = {}, out = null) {
  try {
    return await writeDoc('agentNotifications', id, {
      type, summary, priority: 'high', status: 'pending', actor: 'stripe-webhook',
      ref: { collection: 'leads', id: svcId }, dedupKey: id, createdAt: new Date().toISOString(), attempts: 0, ...extra,
    });
  } catch (e) { console.error('[service] operator card ' + id + ':', e && e.message); if (out) out.cardFailed = true; return null; }
}

// THE OTHER DOOR (api/_upgrade.js): the credit is applied through the
// personal link, but the page says it exists — so a pack holder who pays the
// target plan IN FULL on the desk page is looked for here, among the paid
// orders under the payer's e-mail. Three rules, each from a defect the
// second review found in the first version (12/11/2026):
//  1. The lookup runs for the FIRST delivery of the payment and reads the
//     credit as it was AT THE PAYMENT (the event's time): a second delivery
//     never looks again — it reads what the order recorded (city.creditDue).
//  2. Nothing is written on the pack here. An e-mail address is not an
//     identity: the order records what is owed (creditDue, with `match`
//     'same' when the pack's phone is this order's too, 'check' otherwise),
//     the operator gets an urgent card, and the pack's credit is closed by
//     the operator's REFUND (settleRefundCredit, on charge.refunded).
//  3. A lookup that FAILS is not "no credit": the order says
//     creditUnverified and the operator is asked to check by hand (a list
//     cut at its limit counts the same: no silent cap). It is NOT answered
//     500: the order and the client's confirmation never wait on a side
//     lookup — a paying client kept without a confirmation until Stripe's
//     retry is the worse failure. What it costs is said on the card: a
//     credit refunded by hand on such an order does not close by itself.
//  4. Which pack: the payer's own — the one whose phone is this order's —
//     among every open pack under that e-mail (a couple, a relocation
//     office); when none matches, the oldest, with match 'check'.
// payerOrdersBefore reads; owedCreditIn decides (pure). The same list serves
// Berlin's rule (api/_upgrade.js fullSearchHeld): a plan paid on top of a
// Full Search the payer already holds there.
const OWED_LIMIT = 50;
// → { rows } (the payer's paid-before orders, possibly none) or { unverified: true, why: 'failed' | 'limit' }
async function payerOrdersBefore(email, paidMs) {
  const typed = String(email || '').trim(), low = typed.toLowerCase();
  if (!low) return { rows: [] };
  // orders written since 12/11/2026 carry emailKey (the address in lower case); older ones only the address as it
  // was typed: as typed here, in lower case, and with a capital first letter (a phone keyboard's habit)
  const queries = [['emailKey', low], ...[...new Set([typed, low, low.charAt(0).toUpperCase() + low.slice(1)])].map((v) => ['email', v])];
  let lists = null;
  for (let attempt = 0; attempt < 2 && !lists; attempt++) {
    try { lists = await Promise.all(queries.map(([field, value]) => fsList('leads', { filter: { field, op: 'EQUAL', value }, limit: OWED_LIMIT }))); }
    catch (e) { console.warn(`[service] payer orders lookup failed (attempt ${attempt + 1}):`, e && e.message); }
  }
  if (!lists) return { unverified: true, why: 'failed' };
  if (lists.some((l) => l.length >= OWED_LIMIT)) return { unverified: true, why: 'limit' };
  const seen = new Set();
  return {
    rows: lists.flat().filter((d) => d && d.id && !seen.has(d.id) && seen.add(d.id))
      // only what was paid BEFORE this payment: an order bought afterwards is not something this payment held
      .filter((d) => { const t = Date.parse(d.paid_at || d.createdAt || ''); return Number.isFinite(t) && t <= paidMs; }),
  };
}
// does this desk and plan need the payer's earlier orders at all?
function payerLookupNeeded(cityKey, kind) {
  const desk = CITY_MARKETS[cityKey];
  if (!desk || !kind) return false;
  if (desk.noStacking === true && kind !== 'full-search') return true;
  if (!Object.values(UPGRADE_PATHS).includes(kind)) return false;
  const offer = cityOffer(cityKey, kind);
  return !!offer.ok && offer.chargeAt !== 'signing';
}
function owedCreditIn(rows, cityKey, kind, phone, paidMs) {
  if (!Object.values(UPGRADE_PATHS).includes(kind)) return null;
  const open = openCreditsFor(rows, cityKey, kind, paidMs);
  if (!open.length) return null;
  // the payer's own pack — the one whose phone is this order's — before any other under the same address
  const own = open.find((h) => samePhone(h.phone, phone));
  const hit = own || open[0];
  const lead = rows.find((d) => d.id === hit.id) || {};
  return {
    from: hit.id, plan: hit.offer.from, planLabel: hit.offer.fromLabel, amount: hit.offer.credit, currency: hit.offer.currency,
    file: hit.offer.file, name: String(lead.name || ''),
    // the same person, as far as two orders can tell: the phone on the pack is the phone on this order
    match: own ? 'same' : 'check',
    // how many open packs that address holds on this desk, and which are the others (the card names them)
    among: open.length, others: open.filter((h) => h.id !== hit.id).map((h) => h.id),
    // a withdrawal statement is on file for the pack and nothing was refunded yet: ONE refund is due, not two
    statement: !!(lead.withdrawnAt || (lead.withdrawal && typeof lead.withdrawal === 'object')),
  };
}

// BERLIN (Terms §12.5): a pack or a viewing paid by someone who already
// holds a Full Search on the desk. Whether that search is still running is
// the operator's judgement, so nothing is promised to the client: the order
// records it (city.stackedOn) and the operator is told to refund if it is.
// `linked`: the client's confirmation carries the upgrade link all the same —
// a pack whose buyer only shares the E-MAIL of a Full Search holder (match
// 'check') may be another person's, and the page promises that link.
function stackedText(st, svcId, planLabel, paidAmount, en = false, linked = false) {
  if (en) {
    return ` ${st.match === 'same' ? 'This client already holds' : 'The e-mail of this order already holds'} a Full Search on this desk (order ${st.from}${st.file ? ', file ' + st.file : ''}): Terms §12.5 charge nothing else alongside it — if that search is still running, refund this payment in full${st.match === 'same' ? '' : ' (first verify it is the same person: the phone does not match)'}. Nothing was promised to the client in writing.${linked ? ' Their confirmation carries the upgrade link like any pack: a matching e-mail does not prove it is the same person.' : ''}`;
  }
  return `🟠 ${svcId}: ${planLabel} pagato (${paidAmount}) ${st.match === 'same' ? 'da chi ha' : 'con l\'email di chi ha'} già un Full Search su questo desk (${st.from}${st.file ? ', ' + st.file : ''}). I Termini §12.5 non fanno pagare altro accanto a un Full Search: se quella ricerca è ancora in corso, rimborsa questo pagamento per intero${st.match === 'same' ? '' : ' — prima verifica che sia la stessa persona (il telefono non coincide)'}. Al cliente non ho promesso niente per iscritto.${linked ? ' La sua email di conferma porta il link di upgrade come ogni pack: una email uguale non prova che sia la stessa persona.' : ''}`;
}
const ringStacked = (st, svcId, docId, planLabel, paidAmount, out = null, linked = false) => (st
  ? ringOperator('upgrade-stack-' + docId, 'service.stacked_on_full_search', stackedText(st, svcId, planLabel, paidAmount, false, linked), svcId, {}, out) : null);

// What the operator reads when a pack holder paid in full: who (and how sure),
// what to refund, what closes the pack's credit, and what the client's
// confirmation says. `en` = the sentence for the operator's order e-mail
// (English, like the rest of it). The card is rung BEFORE the confirmation is
// sent, so it says what that e-mail says — never that the client read it: if
// it does not leave, the svc-mail alert asks for the same sentence by hand.
function owedCreditText(owed, svcId, paidAmount, payerName, en = false) {
  const back = moneyOf(owed.amount, owed.currency);
  const names = owed.name && payerName && owed.name.trim().toLowerCase() !== String(payerName).trim().toLowerCase();
  const sure = owed.match === 'same';
  const told = sure && !owed.statement;
  const many = Number(owed.among) > 1;
  const others = Array.isArray(owed.others) && owed.others.length ? owed.others.join(', ') : '';
  if (en) {
    return (sure
      ? ` PAID IN FULL while holding an open ${owed.planLabel} credit (order ${owed.from}${owed.file ? ', file ' + owed.file : ''}; same phone).`
      : ` PAID IN FULL with the e-mail of someone who holds an open ${owed.planLabel} credit (order ${owed.from}), but the phone does not match${names ? ' and the names differ' : ''}: VERIFY it is the same person before refunding.`)
      + (many ? ` That e-mail holds ${owed.among} open packs on this desk${sure ? `: this is the one with the payer's phone${others ? ` (the others: ${others})` : ''}` : `${others ? ` (also ${others})` : ''}: none has the payer's phone — check which one is theirs`}.` : '')
      + (owed.statement
        ? ` A withdrawal statement is on file for that pack and was not refunded yet: refund ONCE — the pack (withdrawal) or ${back} of this payment (the credit), never both.`
        : ` The policy credits the pack in full (Terms §12.2): refund ${back} of this payment on Stripe.`)
      + (sure ? ` The pack's credit closes by itself when that refund is recorded.` : ` The pack's credit closes by itself only when a refund of exactly ${back} is recorded on this payment.`)
      + (told ? ` The client's confirmation says so (a separate alert tells you if it does not leave).` : ' Nothing was promised to the client in writing.');
  }
  return `💶 ${svcId} pagato a PREZZO PIENO (${paidAmount}) `
    + (sure
      ? `da chi ha un ${owed.planLabel} col credito aperto (${owed.from}${owed.file ? ', ' + owed.file : ''}; stesso telefono).`
      : `con l'email di chi ha un ${owed.planLabel} col credito aperto (${owed.from}), ma il telefono non coincide${names ? ` e i nomi sono diversi («${owed.name}» / «${payerName}»)` : ''}: VERIFICA che sia la stessa persona prima di rimborsare.`)
    + (many ? ` Sotto questa email ci sono ${owed.among} pack col credito aperto su questo desk${sure ? `: questo è quello col telefono di chi paga${others ? ` (gli altri: ${others})` : ''}` : `${others ? ` (anche ${others})` : ''}: nessuno ha il telefono di chi paga — verifica qual è il suo`}.` : '')
    + (owed.statement
      ? ` ⚠️ Su quel pack c'è una dichiarazione di recesso non ancora rimborsata: rimborsa UNA volta sola — o il pack (recesso) o ${back} su questo pagamento (credito), mai entrambi.`
      : ` La policy accredita il pack per intero (Termini §12.2): rimborsa ${back} su questo pagamento (Stripe → rimborso parziale).`)
    + (sure ? ` Il credito del pack si chiude da solo quando quel rimborso è segnato.` : ` Il credito del pack si chiude da solo soltanto con un rimborso di esattamente ${back} su questo pagamento.`)
    + (told ? ` L'email di conferma al cliente lo dice (se non parte, ti arriva un avviso a parte).` : ' Al cliente non ho promesso niente per iscritto.');
}
const ringOwedCredit = (owed, svcId, docId, paidAmount, payerName, out = null) => (owed
  ? ringOperator('upgrade-owed-' + docId, 'service.upgrade_credit_owed', owedCreditText(owed, svcId, paidAmount, payerName), svcId, {}, out) : null);
// The payer's earlier orders could not be read whole (a read that failed, or a
// list cut at its limit): the Terms' refund must not be dropped in silence.
// The operator is asked only what can be true of THIS payment: a credit is
// owed back only on the plan a pack leads to; "nothing else alongside a Full
// Search" only concerns another plan on a desk with that rule.
function uncheckedText(cityKey, kind, svcId, paidAmount, en = false) {
  const target = Object.values(UPGRADE_PATHS).includes(kind);
  const stacking = !!(CITY_MARKETS[cityKey] && CITY_MARKETS[cityKey].noStacking === true && kind !== 'full-search');
  if (en) {
    return ' Could NOT read this payer\'s earlier orders on this desk in full: check by hand — same e-mail, same desk — '
      + [target ? 'whether they hold a pack with an open credit: it is owed back on this payment (Terms §12.2), and that credit will not close by itself' : '',
        stacking ? 'whether they already hold a Full Search that is still running: then this payment was not due and is refunded in full (Terms §12.5)' : ''].filter(Boolean).join('; and ') + '.';
  }
  return `🔎 ${svcId} pagato (${paidAmount}): NON ho potuto leggere per intero gli ordini precedenti di chi paga su questo desk. Controlla a mano — stessa email, stesso desk: `
    + [target ? 'se ha un pack col credito aperto, quel credito va rimborsato su questo pagamento (Termini §12.2), e non si chiude da solo' : '',
      stacking ? 'se ha già un Full Search ancora in corso, questo pagamento non era dovuto e va rimborsato per intero (Termini §12.5)' : ''].filter(Boolean).join('; e ') + '.';
}
const ringUncheckedCredit = (cityKey, kind, svcId, docId, paidAmount, out = null) => ringOperator('upgrade-check-' + docId, 'service.upgrade_credit_unchecked',
  uncheckedText(cityKey, kind, svcId, paidAmount), svcId, {}, out);

// The mark of the link path. Returns what happened: 'skip' (no verified
// credit), 'already' (this order's mark is there: a retry), 'marked' (written
// now), 'void' / 'reused' (not marked, the operator was told why), 'gone'
// (the pack's lead is not there), 'failed' (three attempts, read or write:
// the credit is still OPEN — the handler answers 500 so Stripe delivers the
// event again, and rings the operator meanwhile).
// credit.recorded (a redelivery whose order recorded a VERIFIED credit at its
// first delivery): the credit was spent while it was due, so it is marked
// even if the pack's money went back since — credit.voidedAfter says why, and
// flagVoidCredit rings what that means.
async function markUpgradeCredit(credit, svcId, docId, currency, paidAmount, out = null) {
  if (!credit || !credit.verified) return 'skip';
  const path = 'leads/' + credit.from;
  for (let attempt = 0; attempt < 3; attempt++) {
    let v;
    try { v = await fsGetVersioned(path); } catch (e) { console.warn('[service] credit read failed:', e && e.message); continue; }
    if (!v) return 'gone';
    const used = v.data && v.data.credit && typeof v.data.credit === 'object' ? v.data.credit.usedBy : null;
    if (used === svcId) return 'already'; // already ours: a Stripe retry
    // the pack's money went back between upgradeCreditFor's read and this one
    // (a refund issued while the client was paying): never mark it, ring the
    // void alert — the version precondition below closes the rest of the window
    const voidNow = upgradeVoidReason(v.data);
    if (voidNow && !credit.recorded) { await flagVoidCredit({ ...credit, voided: voidNow }, svcId, docId, paidAmount, out); return 'void'; }
    if (voidNow) credit.voidedAfter = voidNow;
    if (used) {
      await ringOperator('upgrade-double-' + docId, 'service.upgrade_credit_reused',
        `⚠️ Credito di upgrade già usato da ${used}: anche ${svcId} (${paidAmount}) lo ha usato. Verifica su Stripe e regola la differenza col cliente.`, svcId, {}, out);
      return 'reused';
    }
    try {
      await fsCommit([{ docPath: path, fields: { credit: { usedBy: svcId, usedAt: new Date().toISOString(), amount: credit.amount, currency } }, precondition: { updateTime: v.updateTime } }]);
      return 'marked';
    } catch (e) {
      // a conflict: the pack's lead changed between read and write. Anything else: the write may or may not have
      // landed. Either way read it again — a mark that did land is found as 'already'
      if (!(e && e.conflict)) console.error('[service] credit mark failed:', e && e.message);
    }
  }
  return 'failed';
}

// A mark that failed leaves the credit OPEN: the operator is told at once (the
// client holds that link), and the delivery that finally writes it says so.
const MARK_FAILED = (credit, svcId) => `⚠️ Upgrade ${svcId}: non sono riuscito a segnare come usato il credito dell'ordine ${credit.from}. Stripe riconsegna l'evento da solo e ti avviso quando è segnato; fino ad allora quel link di upgrade resta aperto.`;
async function reportMark(state, credit, svcId, docId, out = null) {
  const id = 'upgrade-mark-' + docId;
  if (state === 'failed') { await ringOperator(id, 'service.upgrade_credit_unmarked', MARK_FAILED(credit, svcId), svcId, { markFailed: true }, out); return; }
  // written now — or found written ('already': a commit that landed with its answer lost): if an earlier delivery
  // had rung the failure, take it back. A card that cannot be READ is not "no card": out.cardFailed, the handler
  // answers 500 and the next delivery takes it back (the promise was "ti avviso quando è segnato")
  if (state !== 'marked' && state !== 'already') return;
  let prev = null;
  try { prev = await fsGet('agentNotifications/' + id); }
  catch (e) { console.error('[service] mark card read:', e && e.message); if (out) out.cardFailed = true; return; }
  if (!prev || prev.markFailed !== true) return;
  const fixed = `✅ Upgrade ${svcId}: il credito dell'ordine ${credit.from} ora è segnato come usato.`;
  try { await tgNotify(fixed); } catch (e) { console.error('[service] telegram:', e && e.message); }
  try { await fsCommit([{ docPath: 'agentNotifications/' + id, fields: { summary: fixed, markFailed: false, repairedAt: new Date().toISOString() }, precondition: { exists: true } }]); }
  catch (e) { console.error('[service] mark repair:', e && e.message); if (out) out.cardFailed = true; }
}

async function handleService(res, session, m, event = null) {
  // leads/svc_<session>: the id /api/city-lead's GET ?paid= reads back (one copy)
  const svcId = serviceLeadId(session.id);
  const docId = svcId.slice(4);
  const now = new Date().toISOString();
  const amountEur = (session.amount_total || 0) / 100;
  // customer_details.email is what the buyer TYPED on the Stripe page — it
  // wins over anything we guessed at session creation (a one-tap email link
  // may carry no address at all).
  const email = (session.customer_details && session.customer_details.email)
    || m.email || session.customer_email || '';
  // A city order: metadata.city names a desk in CITY_MARKETS (written by
  // api/service-checkout.js from cityOffer — never trusted from a browser).
  const cityKey = String(m.city || '').toLowerCase();
  const cityDesk = CITY_MARKETS[cityKey] || null;
  const cityPlan = cityDesk ? ((cityDesk.plans || CITY_PLANS)[m.kind] || null) : null;
  const meta = cityDesk
    ? { ...cityServiceMeta(cityKey, m.kind), title: `${cityDesk.label} — ${cityPlan ? cityPlan.label : (m.kind || 'order')}`, city: cityDesk }
    : (SERVICE_META[m.kind] || { title: m.kind || 'Service', emoji: '✓' });
  // The currency the session was CHARGED in (Stripe's own field — a London
  // order is 'gbp'); the desk's currency only when Stripe says nothing. Every
  // printout of the amount below goes through moneyOf: '£500' for pounds,
  // and for euros the same '€…' bytes as before.
  const currency = String(session.currency || (cityDesk && cityDesk.currency) || 'eur').toLowerCase();
  const paidAmount = moneyOf(amountEur, currency);
  // Stripe's phone_number_collection lands in customer_details.phone: the
  // city sheet leaves the phone optional, the checkout asks for it.
  // A desk order stores the number in E.164 with the desk's country, like
  // /api/city-lead: the client's WhatsApp reply arrives in E.164, and a
  // number kept as typed ("612 345 678") would not find this lead and would
  // open a new Rome one. A number that is not in the desk's national format
  // (an Italian mobile on /barcelona) stays as typed, for the Rome rule.
  const phoneTyped = m.phone || '';
  const phone = (cityDesk && phoneTyped && cityPhone(phoneTyped, cityKey)) || phoneTyped || (session.customer_details && session.customer_details.phone) || '';
  // A city order says whether the payer asked to start inside the 14 days
  // (start_now '1') or not ('0'); a session made before the tick existed
  // carries neither and says nothing.
  const cityStart = cityDesk && (m.start_now === '1' || m.start_now === '0') ? m.start_now : null;
  // the contract is concluded when the payment completes: the event's own
  // time (a retry carries the same one), never the session's opening
  const win = cityStart === '0' ? withdrawalWindow((event && event.created) || Math.floor(Date.now() / 1000), cityDesk.holidays || cityDesk.country || null) : null;
  // the start choice goes FIRST in the summary: the Telegram card shows the
  // first 240 characters, and a pasted listing URL must not push it out
  const startLine = cityStart === '1' ? 'Start: asked to start now (inside the 14-day withdrawal period).'
    : cityStart === '0' ? `Start: NOT asked to start now. Withdrawal period runs to the end of ${win.lastLabel}; the work begins on ${win.startLabel}.` : '';
  // the file number the operator, the client and the page's ticket share
  let cityFile = cityDesk ? await cityFileFor(svcId, cityKey, typeof m.file_ref === 'string' ? m.file_ref : '') : null;
  // an upgrade keeps the file number of the pack it was paid with
  const credit = cityDesk ? await upgradeCreditFor(m, cityKey, svcId) : null;
  // the pack this upgrade was paid with could not be READ (twice): nothing is written — 500, and Stripe delivers
  // the event again. An order filed "unverified" here would leave the credit open with nobody told.
  if (credit && credit.unread) {
    console.error('[service] credit_from unreadable: 500, Stripe delivers again');
    return res.status(500).json({ received: true, error: 'credit_read_failed' });
  }
  if (credit && credit.file) cityFile = { file: credit.file, fileLeadId: credit.from };
  const creditPlanLabel = credit ? (((cityDesk.plans || CITY_PLANS)[credit.plan] || {}).label || 'Application Pack') : '';
  const creditLine = credit && credit.amount ? `${moneyOf(credit.amount, currency)} ${creditPlanLabel} credited` : '';
  // the other door: paid in full by someone who holds an open pack credit on this desk — read as it was when
  // the payment completed (the event's time), not when this delivery happens to run
  const paidMs = event && Number(event.created) > 0 ? Number(event.created) * 1000 : Date.now();
  const kindPaid = String(m.kind || '');
  const earlier = cityDesk && !credit && email && payerLookupNeeded(cityKey, kindPaid) ? await payerOrdersBefore(email, paidMs) : null;
  const owed = earlier && earlier.rows ? owedCreditIn(earlier.rows, cityKey, kindPaid, phone, paidMs) : null;
  const owedUnverified = !!(earlier && earlier.unverified);
  // Berlin: a pack or a viewing paid on top of a Full Search the payer already holds (Terms §12.5)
  const heldFs = earlier && earlier.rows ? fullSearchHeld(earlier.rows, cityKey, kindPaid, phone) : null;
  const stacked = heldFs ? { from: heldFs.id, file: heldFs.file, match: samePhone(heldFs.phone, phone) ? 'same' : 'check' } : null;
  // the client is told in writing only when the two orders are the same person as far as they can tell, and
  // exactly one refund is due (no withdrawal statement waiting on the pack)
  const owedTold = !!owed && owed.match === 'same' && !owed.statement;
  // one person, one file — only when it IS the same person: otherwise the pack's number is not this payer's to see
  if (owed && owed.match === 'same' && owed.file && /^BM [A-Z2-9]{5}$/.test(owed.file)) cityFile = { file: owed.file, fileLeadId: owed.from };
  const owedLine = owed ? `${moneyOf(owed.amount, owed.currency)} ${owed.planLabel} credit ${owedTold ? 'to refund' : 'to check'}`
    : stacked ? 'on top of a Full Search: check' : owedUnverified ? 'earlier orders NOT checked' : '';
  // the address in lower case: what the other door looks for (the address as typed keeps its capitals in `email`)
  const emailKey = String(email || '').trim().toLowerCase();
  // a paid pack that can still become Full Search: the client's personal
  // upgrade link (valid for the desk's credit window) goes in BOTH order emails — the
  // client's own confirmation since 12/11/2026 (the credit is a policy, the
  // page says it), and the operator's
  // (not to someone who already holds the Full Search it would lead to — as far as two orders can tell: the same
  // phone. A buyer who only shares that holder's E-MAIL may be another person, and the page promises the link)
  const upgradable = cityDesk && !credit && Object.prototype.hasOwnProperty.call(UPGRADE_PATHS, m.kind || '') ? cityOffer(cityKey, UPGRADE_PATHS[m.kind]) : null;
  const upgradableOk = !!(upgradable && upgradable.ok && upgradable.chargeAt !== 'signing');
  const upgradeTo = upgradableOk && !(stacked && stacked.match === 'same') ? upgradable : null;
  const upgradeUrl = upgradeTo ? upgradeLink(svcId, new URL(cityDesk.url).origin) : null;
  // how long that credit runs on this desk: 30 days, or no deadline (Berlin — api/_upgrade.js upgradeDaysOf)
  const upgradeDays = upgradeUrl ? upgradeDaysOf(cityKey) : null;
  const lead = {
    type: 'service',
    service: 'SERVICE',
    kind: m.kind || '',
    status: 'new',
    paid: true,
    source: 'web',
    intent: cityDesk ? 'city_order' : 'service',
    name: m.name || '',
    email,
    ...(emailKey ? { emailKey } : {}),
    phone,
    listingName: m.listing || '',
    // the pack whose credit is owed back on this order: top level, so the pack's own refund finds it
    ...(owed ? { creditDueFrom: owed.from } : {}),
    // the file number sits in the HEAD, with the plan and the amount: the
    // Telegram card quotes the first 240 characters, and the client quotes
    // that number on WhatsApp — a long note must not push it out
    message: cityDesk
      ? `${cityDesk.label.toUpperCase()} — paid order · ${cityPlan ? cityPlan.label : m.kind} · ${paidAmount} paid${creditLine ? ' (' + creditLine + ')' : owedLine ? ' (' + owedLine + ')' : ''} · file ${cityFile.file}. ${startLine ? startLine + ' ' : ''}${m.listing ? 'Property: ' + m.listing + '. ' : ''}${m.notes ? 'Notes: ' + m.notes + '. ' : ''}`.trim()
      : `${meta.title} bought one-tap (${paidAmount}). ${m.listing ? 'Property: ' + m.listing + '. ' : ''}${m.notes ? 'Notes: ' + m.notes + '. ' : ''}${m.start_now === '1' ? 'Ha chiesto di iniziare subito (recesso: art. 50 c.3 Cod. cons.).' : m.start_now === '0' ? 'NON ha chiesto di iniziare subito: si comincia allo scadere dei 14 giorni del recesso.' : ''}`,
    amount_paid: session.amount_total || 0,
    // amount_eur keeps its name (the bounce card, the portal and the tests
    // read it): it is the amount in `currency` — pounds on a London order
    amount_eur: amountEur,
    currency,
    stripe_session_id: session.id,
    paid_at: now,
    createdAt: now,
    // the market, for api/_market.js (isCityMarket): the Rome machine stays
    // out, the Commerciale stands down, the card names the city
    ...(cityDesk ? {
      market: cityKey,
      sourceRef: `city-${cityKey}`,
      leadType: 'tenant',
      language: 'en',
      city: {
        key: cityKey, label: cityDesk.label, mode: 'search', service: m.kind || null, serviceLabel: cityPlan ? cityPlan.label : null, paid: true, at: now,
        // the payer's choice at the till, as data (cityReplyText reads it):
        // true = asked to start now, false = start after the 14 days, null = a session from before the tick
        startNow: cityStart === '1' ? true : cityStart === '0' ? false : null,
        workFrom: win ? win.startDay : null, workFromLabel: win ? win.startLabel : null, withdrawalEndsOn: win ? win.lastDay : null,
        // the file number (js/scalo-codes.js fileCode), and the lead it came
        // from when the visitor had already opened a file in this city
        file: cityFile.file, fileLeadId: cityFile.fileLeadId,
        // the file_ref the webhook could not read (twice): the operator links the two leads by hand
        ...(cityFile.fileRefUnverified ? { fileRefUnverified: cityFile.fileRefUnverified } : {}),
        // the upgrade credit this order was paid with (api/_upgrade.js)
        ...(credit ? { credit: { from: credit.from, plan: credit.plan || null, amount: credit.amount, verified: credit.verified, ...(credit.voided ? { voided: credit.voided } : {}) } } : {}),
        // paid in full while holding an open pack credit: what is owed back on this order (the operator refunds it)
        ...(owed ? { creditDue: { from: owed.from, plan: owed.plan, amount: owed.amount, currency: owed.currency, match: owed.match, ...(owed.statement ? { statement: true } : {}), ...(owed.among > 1 ? { among: owed.among } : {}) } } : {}),
        // the lookup failed: nobody knows whether a credit is owed on this order — the operator checks by hand
        ...(owedUnverified ? { creditUnverified: true } : {}),
        // Berlin: paid on top of a Full Search this payer already holds (the operator refunds it if that search runs)
        ...(stacked ? { stackedOn: { from: stacked.from, match: stacked.match } } : {}),
      },
    } : {}),
  };
  let w = null;
  try { w = await writeDoc('leads', svcId, lead); }
  catch (err) {
    // Soldi incassati ma lead non persistito → 500 così Stripe ritenta.
    console.error('Firestore service lead write error:', err);
    return res.status(500).json({ error: 'lead_write_failed' });
  }
  // a card that cannot be written, or a mark that cannot be made, is the one thing a delivery may leave undone:
  // both end in a 500, so Stripe delivers again and the duplicate branch finishes from what the order recorded
  const out = { cardFailed: false };
  if (w && w.exists) {
    // Retry di Stripe su una sessione già processata: le email non si
    // rimandano. What THIS payment owed, held or used is what the ORDER
    // recorded at its first delivery: it is read first, and a read that
    // fails is answered 500 (a card never rung must not be lost with a 200).
    let full = null;
    try { full = await fsGet('leads/' + svcId); }
    catch (e) {
      console.error('[service] stored order read:', e && e.message);
      return res.status(500).json({ received: true, duplicate: true, serviceLeadId: svcId, error: 'order_read_failed' });
    }
    const sc = full && full.city && typeof full.city === 'object' ? full.city : null;
    const due = sc && sc.creditDue && typeof sc.creditDue === 'object' && sc.creditDue.from ? sc.creditDue : null;
    // Se il primo giro è morto prima di registrare l'esito dell'email al
    // cliente (né inviata né fallita) l'operatore lo deve sapere: avviso
    // idempotente (id deterministico), mai su un primo giro che potrebbe
    // essere ancora in volo (90s). The promise that e-mail carried ("we
    // refund … of this payment") is asked for by hand with it.
    try {
      const born = Date.parse((full && full.createdAt) || '');
      if (full && !full.clientEmailSentAt && !full.clientEmailFailedAt && Number.isFinite(born) && Date.now() - born > 90000) {
        const promise = due && due.match === 'same' && due.statement !== true ? ` e con la frase sul rimborso di ${moneyOf(Number(due.amount) || 0, String(due.currency || currency))} (Termini §12.2)` : '';
        await writeDoc('agentNotifications', 'svc-mail-' + docId, {
          type: 'service.client_email_failed',
          summary: `📭 Ordine pagato ${svcId}: nessuna traccia dell'email di conferma al cliente — verificare e mandarla a mano${full.market && full.market !== 'roma' ? ', col testo del recesso' : ''}${promise}.`,
          priority: 'high', status: 'pending', actor: 'stripe-webhook',
          ref: { collection: 'leads', id: svcId },
          dedupKey: 'svc-mail-' + docId, createdAt: new Date().toISOString(), attempts: 0,
        });
      }
    } catch (_) {}
    // a first run that died before marking the credit: the retry marks it. The order recorded a VERIFIED credit:
    // it was spent while it was due — a pack refunded since is marked all the same, and the card says so
    const stored = sc && sc.credit && typeof sc.credit === 'object' && sc.credit.verified === true;
    let creditNow = credit;
    if (stored && credit && credit.voided) { const { voided, ...rest } = credit; creditNow = { ...rest, verified: true, recorded: true, voidedAfter: voided }; }
    else if (stored && credit) creditNow = { ...credit, recorded: true };
    const again = await markUpgradeCredit(creditNow, svcId, docId, currency, paidAmount, out);
    await reportMark(again, creditNow, svcId, docId, out);
    await flagVoidCredit(creditNow, svcId, docId, paidAmount, out);
    // a first run that wrote the order and died before ringing. The ORDER says what this payment owed: a second
    // delivery never looks the payer up again (today's packs are not the ones the payment held)
    if (cityDesk) {
      if (due) {
        await ringOwedCredit({
          from: String(due.from), plan: due.plan || '', planLabel: ((cityDesk.plans || CITY_PLANS)[due.plan] || {}).label || 'Application Pack',
          amount: Number(due.amount) || 0, currency: String(due.currency || currency), file: due.match === 'same' ? (sc.file || null) : null, name: '',
          match: due.match === 'same' ? 'same' : 'check', statement: due.statement === true, among: Number(due.among) || 1,
        }, svcId, docId, paidAmount, '', out);
      }
      if (sc && sc.creditUnverified === true) await ringUncheckedCredit(cityKey, kindPaid, svcId, docId, paidAmount, out);
      const st = sc && sc.stackedOn && typeof sc.stackedOn === 'object' && sc.stackedOn.from ? sc.stackedOn : null;
      if (st) await ringStacked({ from: String(st.from), file: null, match: st.match === 'same' ? 'same' : 'check' }, svcId, docId, cityPlan ? cityPlan.label : kindPaid, paidAmount, out, upgradableOk && st.match !== 'same');
    }
    // a mark that failed again leaves the credit open, a card that could not be written leaves the operator
    // untold: 500, Stripe delivers the event once more
    const undone = again === 'failed' ? 'credit_mark_failed' : out.cardFailed ? 'operator_card_failed' : null;
    return res.status(undone ? 500 : 200).json({ received: true, duplicate: true, serviceLeadId: svcId, ...(undone ? { error: undone } : {}) });
  }
  const marked = await markUpgradeCredit(credit, svcId, docId, currency, paidAmount, out);
  await reportMark(marked, credit, svcId, docId, out);
  await flagVoidCredit(credit, svcId, docId, paidAmount, out);
  await ringOwedCredit(owed, svcId, docId, paidAmount, m.name, out);
  if (owedUnverified) await ringUncheckedCredit(cityKey, kindPaid, svcId, docId, paidAmount, out);
  await ringStacked(stacked, svcId, docId, cityPlan ? cityPlan.label : kindPaid, paidAmount, out, !!(stacked && upgradeUrl));

  const firstName = (m.name || '').split(' ')[0] || 'there';
  try {
    await sendEmailJS({
      to_email: 'valentino@boom-rome.com',
      heading: `${meta.emoji} ${meta.title.toUpperCase()} — ${paidAmount} paid`,
      subheading: m.name || 'New service purchase',
      name: 'Valentino',
      intro: meta.city
        ? `A paid order from the ${meta.city.label} desk — ${meta.title}. The page promises a message in the desk's first open hour (${meta.city.hoursEn || 'Mon–Fri 09:00–19:00, Rome time'}).${cityStart === '1' ? ' The client asked to start now.' : cityStart === '0' ? ` The client did NOT ask to start now: their withdrawal period runs to the end of ${win.lastLabel}, so the brief and the work begin on ${win.startLabel} (an acknowledgement before then is fine; starting earlier needs their written request).` : ''} The page promised an invoice from Egidi Immobiliare S.r.l., VAT included: issue it.${credit ? ` Upgrade: ${credit.amount ? moneyOf(credit.amount, currency) + ' ' : ''}credited from the ${creditPlanLabel}${credit.file ? ' (file ' + credit.file + ')' : ''}${credit.verified ? '' : credit.voided ? ` — the pack ${credit.voided === 'disputed' ? 'payment is disputed' : 'was refunded'}, so NO credit was due: settle the difference with the client` : ' — the pack could NOT be verified: check the credit by hand'}${credit.statement && credit.verified ? ' — a withdrawal statement is on file for that pack: the credit is now SPENT, count it if you refund the pack' : ''}; invoice what was paid, ${paidAmount}.` : ''}${owed ? owedCreditText(owed, svcId, paidAmount, m.name, true) : owedUnverified ? uncheckedText(cityKey, kindPaid, svcId, paidAmount, true) : ''}${stacked ? stackedText(stacked, svcId, cityPlan ? cityPlan.label : kindPaid, paidAmount, true, !!upgradeUrl) : ''}${cityKey === 'barcelona' ? ' Barcelona: on request the client gets the order, terms and invoice in Catalan or Spanish and the official complaint forms (fulls oficials de reclamació); a complaint is answered within one month.' : ''}`
        : `Someone just bought ${meta.title} with one tap. Clock is running — the page promises first contact fast.`,
      card_color: '#D4AF37',
      card_title: meta.title,
      r1_icon: '👤', r1_label: 'Client', r1_value: m.name || '—',
      r2_icon: '📧', r2_label: 'Email', r2_value: email || '—',
      r3_icon: '📱', r3_label: 'Phone', r3_value: phone || '—',
      r4_icon: meta.city ? '🏙' : '🏠', r4_label: meta.city ? 'Desk' : 'Property', r4_value: meta.city ? `${meta.city.label}${m.listing ? ' · ' + m.listing : ''}` : (m.listing || '—'),
      closing: `Paid ${paidAmount}. ${cityFile ? `Your file: ${cityFile.file}. ` : ''}${m.notes ? 'Notes: ' + m.notes + '. ' : ''}Stripe: ${session.id}. Record: leads/${svcId}.${upgradeUrl ? ` Upgrade to ${upgradeTo.label} with ${paidAmount} credited (${upgradeDays ? `valid ${upgradeDays} days` : 'no deadline on this desk'}; the client's personal link, also in their own email): ${upgradeUrl}` : ''}`,
      cta_text: 'Open portal',
      portal_link: 'https://www.boomrome.com/portal.html#leads',
    });
  } catch (err) { console.error('Admin service email error:', err); }

  // The client's confirmation carries the next steps and, for a city order,
  // the withdrawal information on a durable medium: its delivery is
  // RECORDED on the lead, and a failure becomes an alert to the operator
  // (send it by hand) — a Stripe retry returns 'duplicate' above and would
  // never send it again.
  let clientMail = 'sent';
  try {
    const it = meta.lang === 'it';
    if (!email) throw new Error('no_email');
    await sendEmailJS({
      to_email: email,
      heading: it ? `${meta.title} — confermato` : meta.city ? (cityStart === '0' ? `Your ${meta.title} is booked` : `Your ${meta.title} starts now`) : `Your ${meta.title} is confirmed`,
      subheading: it ? 'BOOM Rome — pagato, in lavorazione' : meta.city ? `BOOM ${meta.city.label} — paid, file open` : 'BOOM Rome — paid & scheduled',
      name: firstName,
      intro: it
        ? `Pagamento ricevuto — ${paidAmount}, via Stripe. Ecco esattamente cosa succede adesso:`
        : cityStart === '0'
          // no "Start now" tick: the steps below begin when the withdrawal
          // period ends — the email must not read as if they start today
          ? `Payment received — ${paidAmount}, Stripe-secured. Here's what happens from ${win.startLabel}, the day after your 14-day withdrawal period ends:`
          : `Payment received — ${paidAmount}, Stripe-secured. Here's exactly what happens next:`,
      card_color: '#D4AF37',
      card_title: it ? 'I prossimi passi' : 'What happens next',
      r1_icon: '✓', r1_label: (meta.next1 || ['We take it from here'])[0], r1_value: (meta.next1 || ['', 'Right away'])[1],
      r2_icon: '✓', r2_label: (meta.next2 || ['—'])[0], r2_value: (meta.next2 || ['', ''])[1],
      r3_icon: '✓', r3_label: (meta.next3 || ['—'])[0], r3_value: (meta.next3 || ['', ''])[1],
      r4_icon: '✓', r4_label: (meta.next4 || ['—'])[0], r4_value: (meta.next4 || ['', ''])[1],
      // a city order names its file number first: the same "BM XXXXX" the
      // page's ticket and the operator's summary print
      closing: (cityFile ? `Your file: ${cityFile.file}. ` : '') + (creditLine ? `Your ${creditPlanLabel} (${moneyOf(credit.amount, currency)}) is credited toward this order. ` : '')
        // paid in full while holding an open pack credit: say what comes back (the policy, on the durable medium)
        // — only when the pack is this payer's as far as the two orders can tell, and exactly one refund is due
        + (owedTold ? `You already paid for the ${owed.planLabel} on this desk (${moneyOf(owed.amount, owed.currency)}): it is credited in full, so we refund ${moneyOf(owed.amount, owed.currency)} of this payment to the card you used. ` : '')
        // a pack that can become Full Search: the policy and the client's
        // personal link, on the durable medium (the URL ends its sentence
        // with a space, never a full stop a mail client would swallow)
        + (upgradeUrl ? `Want us to search for you? The ${paidAmount} you paid is credited in full if you move to ${upgradeTo.label} on this desk${upgradeDays ? ` within ${upgradeDays} days of this payment` : ''}, once. Your personal link: ${upgradeUrl} ` : '')
        + (it
        ? (m.kind === 'concordato-pack'
          // Codice del consumo: chi NON ha chiesto di iniziare subito aspetta i
          // 14 giorni del recesso; a tutti si dice come recedere.
          ? (m.start_now === '1'
            ? 'Ci ha chiesto di iniziare subito: partiamo appena riceviamo i dati. '
            : 'Non ci ha chiesto di iniziare subito: partiamo allo scadere dei 14 giorni del recesso; se preferisce anticipare, ce lo scriva. ')
            + `Per recedere entro 14 giorni basta una email a hello@boom-rome.com, anche col modulo di recesso tipo (${WITHDRAWAL_FORM_URL}?desk=Rome&service=concordato-pack; il testo è in fondo a questa email). Per qualsiasi cosa risponda a questa email o ci scriva su WhatsApp. ` + OFFICE_HOURS_IT + ' ' + WITHDRAWAL_FORM_TEXT_IT
          : 'Per qualsiasi cosa risponda a questa email o ci scriva su WhatsApp. ' + OFFICE_HOURS_IT)
        : meta.city && cityStart
          // the withdrawal right, on a durable medium (Directive 2011/83/EU art. 8(7))
          ? (cityStart === '1'
            ? 'You asked us to start straight away, so the desk starts in its first open hour. '
            : `You did not ask us to start straight away, so your 14-day withdrawal period runs to the end of ${win.lastLabel} and the work begins on ${win.startLabel}. Want it sooner? Reply to this email. `)
            + `To withdraw within 14 days of payment, email hello@boom-rome.com or use the model withdrawal form at ${WITHDRAWAL_FORM_URL}?desk=${encodeURIComponent(meta.city.label)}&service=${encodeURIComponent(m.kind || '')} (its text is at the end of this email). If we started at your request and you withdraw, we refund the price minus the work already done; once the service is fully performed, the right to withdraw ends. The invoice from Egidi Immobiliare S.r.l., VAT included, follows by email. Anything else — reply to this email or message us on WhatsApp. ` + officeHoursEn(meta.city) + ' ' + WITHDRAWAL_FORM_TEXT
          : 'Anything at all — reply to this email or message us on WhatsApp. ' + officeHoursEn(meta.city)),
      cta_text: it ? 'Torna su BOOM' : meta.city ? `BOOM ${meta.city.label}` : 'Back to BOOM',
      portal_link: it ? 'https://www.boomrome.com/canone' : meta.city ? meta.city.url : 'https://www.boomrome.com/apartments.html',
    });
  } catch (err) { console.error('Client service email error:', err); clientMail = String((err && err.message) || err || 'failed').slice(0, 300); }

  try {
    await patchDoc('leads/' + svcId, clientMail === 'sent'
      ? { clientEmailSentAt: new Date().toISOString() }
      : { clientEmailError: clientMail, clientEmailFailedAt: new Date().toISOString() });
  } catch (err) { console.error('client email record:', err.message); }
  if (clientMail !== 'sent') {
    try {
      await writeDoc('agentNotifications', 'svc-mail-' + docId, {
        type: 'service.client_email_failed',
        summary: `📭 ${meta.title}${meta.city ? ' · ' + (meta.city.labelIt || meta.city.label) : ''} — ${paidAmount} PAGATI da ${m.name || email || '?'}, ma l'email di conferma al cliente NON è partita (${clientMail}): mandala a mano${meta.city ? ', col testo del recesso' : ''}${owedTold ? ` e con la frase sul rimborso di ${moneyOf(owed.amount, owed.currency)} (Termini §12.2: quell'email glielo prometteva)` : ''}.`,
        priority: 'high', status: 'pending', actor: 'stripe-webhook',
        ref: { collection: 'leads', id: svcId },
        dedupKey: 'svc-mail-' + docId, createdAt: new Date().toISOString(), attempts: 0,
      });
    } catch (_) {}
  }

  // the order is written and both e-mails are out; a credit mark that failed, or an operator card that could not
  // be written, is the one thing left undone: 500, so Stripe delivers the event again (the duplicate branch above
  // marks it, rings from what the order recorded, and says so)
  const undone = marked === 'failed' ? 'credit_mark_failed' : out.cardFailed ? 'operator_card_failed' : null;
  return res.status(undone ? 500 : 200).json({ received: true, serviceLeadId: svcId, clientEmail: clientMail === 'sent' ? 'sent' : 'failed', ...(undone ? { error: undone } : {}) });
}

async function handleReserve(res, session, m) {
  const docId = session.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30);
  const now = new Date().toISOString();
  const amountEur = (session.amount_total || 0) / 100;
  // customer_details.email is what the buyer TYPED on the Stripe page — it
  // wins over anything we guessed at session creation (a one-tap email link
  // may carry no address at all).
  const email = (session.customer_details && session.customer_details.email)
    || m.email || session.customer_email || '';
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
  let w = null;
  try { w = await writeDoc('leads', 'res_' + docId, lead); }
  catch (err) {
    console.error('Firestore reservation write error:', err);
    return res.status(500).json({ error: 'reservation_write_failed' });
  }
  if (w && w.exists) {
    return res.status(200).json({ received: true, duplicate: true, reservationId: 'res_' + docId });
  }

  // La pagina promette «€300 takes it off the market for 48 hours»: la
  // promessa si mantiene qui — la casa passa a 'reserved' (stato che ogni
  // vetrina sa già rendere) e lo spazzino orario del reminder-cron la
  // libera se il deal non avanza. Best-effort: un patch fallito non deve
  // mai perdere il lead già scritto.
  try {
    const { placeHold } = await import('./ops/_lotto12.js');
    await placeHold(m.listingId, 'res_' + docId);
  } catch (err) { console.error('reserve hold:', err.message); }

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
      r1_icon: '✓', r1_label: 'We review your application', r1_value: 'During office hours (Rome time)',
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

// PREAGREEMENT — the client paid what was due at signing on their proposal.
// Marks the doc paid and sends the confirmation emails (client: document +
// Stripe receipt; admin: copy + next-step nudge). Idempotent on webhook
// retries via paidSessionId.
async function handlePreagreement(res, session, m) {
  const token = String(m.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(200).json({ received: true, skipped: 'bad_pa_token' });

  let hit = null;
  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    hit = rows && rows[0];
  } catch (e) { console.error('[webhook/pa] lookup failed:', e.message); }
  if (!hit) return res.status(200).json({ received: true, skipped: 'pa_not_found' });
  const { id, ...pa } = hit;   // fsList returns flat rows: {id, ...fields}

  if (pa.paidSessionId === session.id) {
    // Retry — email già inviate. MA se la conversione in contratto era fallita
    // al primo giro (paid senza contractId), questo retry è l'occasione per
    // riprovarla invece di scartarla per sempre.
    if (!pa.contractId) {
      const reconverted = await maybeAutoConvert({ pa: { ...pa }, paId: id });
      return res.status(200).json({ received: true, duplicate: true, contractId: (reconverted && reconverted.contractId) || null });
    }
    return res.status(200).json({ received: true, duplicate: true });
  }

  const paidEur = (session.amount_total || 0) / 100;
  const paidAt = new Date().toISOString();
  try {
    await fsPatch(`preAgreements/${id}`, {
      status: 'paid', paidAt, paidEur,
      paidSessionId: session.id,
      stripePaymentIntent: String(session.payment_intent || ''),
    });
  } catch (e) { console.error('[webhook/pa] patch failed:', e.message); }

  // Il dovuto alla firma è arrivato: il lucchetto sull'immobile diventa
  // DEFINITIVO. Prima scadeva dopo 48h, perché una riserva che non paga non
  // deve congelare l'appartamento; ora che i soldi ci sono, nessun altro
  // candidato può più subentrare.
  try {
    const { confirmLock } = await import('./preagreement/_lock.js');
    await confirmLock({ pa, paId: id });
  } catch (e) { console.error('[webhook/pa] lucchetto non confermato:', e.message); }

  // Stripe receipt link (best-effort)
  let receiptUrl = null;
  try {
    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent), { expand: ['latest_charge'] });
      receiptUrl = (pi.latest_charge && pi.latest_charge.receipt_url) || null;
    }
  } catch (e) { console.error('[webhook/pa] receipt lookup failed:', e.message); }

  try {
    await sendPaEmails({
      pa, ref: pa.ref || m.ref || '', url: '/pre-agreement?t=' + token,
      receiptUrl, paidEur, paidAt, event: 'paid',
    });
  } catch (e) { console.error('[webhook/pa] emails failed:', e.message); }

  // Payment confirmed = deal sealed → auto-create the contract and send the
  // tenant their Magic-Sign link (PA must carry propertyId + autoConvert).
  const converted = await maybeAutoConvert({ pa: { ...pa, status: 'paid', paidAt, paidEur }, paId: id });

  return res.status(200).json({ received: true, preAgreementId: id, contractId: (converted && converted.contractId) || null });
}

// RENT — Canone via BOOM: a tenant paid a scheduled installment (or the
// deposit balance) by card from /casa (api/payments/pay.js). Marks the
// payment doc paid (paidVia:'stripe') and emails the receipt with the
// platform's design system. Idempotent on stripeSessionId.
async function handleRent(res, session, m) {
  const paymentId = String(m.paymentId || '').trim();
  if (!paymentId) return res.status(200).json({ received: true, error: 'no_paymentId' });
  const now = new Date().toISOString();
  const amount = Number(m.amount) || Math.round(((session.amount_total || 0) / 100) - (Number(m.fee) || 0));
  const fee = Number(m.fee) || 0;

  let pay = null;
  try { pay = await readDoc(`payments/${paymentId}`); } catch (_) {}
  if (!pay) return res.status(200).json({ received: true, error: 'payment_not_found', paymentId });
  if (pay.status === 'paid') {
    // Same session retried by Stripe → simple ack.
    if (pay.stripeSessionId === session.id) {
      return res.status(200).json({ received: true, duplicate: true, paymentId });
    }
    // Paid by ANOTHER route (bank reconciliation, or a second checkout
    // session that survived): NEVER overwrite the record — this charge is
    // a probable double payment. Alarm the operator for a refund.
    const dupNow = new Date().toISOString();
    try {
      await writeDoc('agentNotifications', 'rent-double-' + paymentId + '-' + session.id.slice(-8), {
        type: 'payment.rent.double',
        summary: `🚨 POSSIBILE DOPPIO INCASSO su ${paymentId}: già ${pay.paidVia || 'paid'}${pay.paidDate ? ' il ' + pay.paidDate : ''}, ora ricevuto ANCHE via Stripe (${session.id}) — verifica e rimborsa`,
        priority: 'high', status: 'pending', actor: 'stripe-webhook',
        dedupKey: 'rent-double-' + paymentId, createdAt: dupNow, attempts: 0,
      });
    } catch (_) {}
    try {
      await sendEmail({
        to: 'valentino@boom-rome.com',
        subject: `🚨 Possibile doppio incasso — ${paymentId}`,
        html: shell(para(`La rata <b>${paymentId}</b> risultava già pagata (${pay.paidVia || '—'}${pay.paidDate ? ' · ' + pay.paidDate : ''}) ma è appena arrivato ANCHE un pagamento Stripe (sessione ${session.id}, €${((session.amount_total || 0) / 100).toLocaleString('it-IT')}).<br><b>Verifica su Stripe e rimborsa l'incasso doppio.</b> Il record originale non è stato toccato.`)
          + btn2('https://dashboard.stripe.com/payments', 'Apri Stripe')),
      });
    } catch (_) {}
    return res.status(200).json({ received: true, doublePayment: true, paymentId });
  }

  // Ricevuta Stripe + COSTO REALE dell'incasso (best-effort).
  //
  // Stripe dice, su ogni addebito, quanto gli è costato: balance_transaction
  // .fee. Finora quel dato lo buttavamo via e la commissione al cliente era
  // una percentuale decisa al buio — che sulle carte estere (3,25%) va in
  // perdita e su quelle europee (1,5%) sovrapprezza. Salvandolo, la
  // commissione può regolarsi sul misurato invece che sul listino.
  let receiptUrl = null, stripeCostEur = null, cardCountry = null, cardBrand = null;
  try {
    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent),
        { expand: ['latest_charge.balance_transaction'] });
      const ch = pi.latest_charge || null;
      receiptUrl = (ch && ch.receipt_url) || null;
      const bt = ch && ch.balance_transaction;
      if (bt && typeof bt.fee === 'number') stripeCostEur = Math.round(bt.fee) / 100;
      const card = ch && ch.payment_method_details && ch.payment_method_details.card;
      if (card) { cardCountry = card.country || null; cardBrand = card.brand || null; }
    }
  } catch (e) { console.error('[rent] costo reale non leggibile:', e.message); }

  try {
    await patchDoc(`payments/${paymentId}`, {
      status: 'paid', paidAt: now, paidDate: now.slice(0, 10),
      paidVia: 'stripe', stripeSessionId: session.id,
      serviceFeeEur: fee, receiptUrl: receiptUrl || '',
      // Il conto vero di questo incasso: quanto abbiamo chiesto, quanto ci è
      // costato, cosa ci resta. Con il paese della carta, che è la ragione per
      // cui lo stesso incasso costa il doppio.
      stripeCostEur, cardCountry, cardBrand,
      marginEur: stripeCostEur == null ? null : Math.round((fee - stripeCostEur) * 100) / 100,
    });
  } catch (err) {
    console.error('[rent] payment patch:', err.message);
    return res.status(500).json({ received: false, error: 'patch_failed' });
  }

  // La statistica che fa scendere la commissione da sola: volume incassato,
  // costo realmente sostenuto, numero di incassi. pay.js la legge alla
  // creazione della sessione successiva, quindi il prezzo converge sul costo
  // vero senza che nessuno decida una percentuale a mano.
  if (stripeCostEur != null) {
    try {
      const prev = (await readDoc('settings/rentFeeStats').catch(() => null)) || {};
      await patchDoc('settings/rentFeeStats', {
        count: (Number(prev.count) || 0) + 1,
        volumeEur: Math.round(((Number(prev.volumeEur) || 0) + amount) * 100) / 100,
        costEur: Math.round(((Number(prev.costEur) || 0) + stripeCostEur) * 100) / 100,
        // Parte fissa: Stripe ne applica una per addebito (~€0,25). Tenerla
        // separata evita di gonfiare la percentuale sui canoni piccoli.
        fixedEur: Math.round(((Number(prev.fixedEur) || 0) + 0.25) * 100) / 100,
        lastAt: now,
        lastCardCountry: cardCountry || null,
      });
    } catch (err) { console.error('[rent] statistica costi:', err.message); }
  }

  try {
    await writeDoc('agentNotifications', 'rent-' + paymentId + '-' + session.id.slice(-8), {
      type: 'payment.rent',
      summary: `💶 Canone incassato via BOOM: €${amount.toLocaleString('it-IT')} (${pay.month || paymentId}) + fee €${fee}`,
      priority: 'normal', status: 'pending', actor: 'stripe-webhook',
      dedupKey: 'rent-' + paymentId, createdAt: now, attempts: 0,
    });
  } catch (err) { console.error('[rent] notify write:', err.message); }

  const isDeposit = pay.type === 'deposit-balance';
  const label = isDeposit ? 'saldo del deposito cauzionale' : `canone di ${pay.month || String(pay.dueDate || '').slice(0, 7)}`;
  const email = session.customer_email || '';
  const eurFmt = n => '€' + Number(n || 0).toLocaleString('en-US');
  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: `Ricevuta — ${isDeposit ? 'saldo deposito' : 'canone ' + (pay.month || '')} ${eurFmt(amount)} ✓`,
        html: shell(
          para(`Pagamento ricevuto ✓ — il tuo ${label} di <b>${eurFmt(amount)}</b> è registrato${fee ? ` (commissione servizio ${eurFmt(fee)})` : ''}. La ricevuta è tua per sempre: la ritrovi anche in <b>La tua casa BOOM</b>, insieme allo storico completo.`)
          + btn('https://www.boomrome.com/casa', 'Apri La tua casa BOOM')
          + (receiptUrl ? fine(`Ricevuta Stripe: <a href="${receiptUrl}" style="color:#141414">apri →</a>`, 'text-align:center') : '')
          + fine('Domande? Rispondi a questa email o <a href="https://wa.me/393313251961" style="color:#141414">scrivici su WhatsApp</a>.', 'text-align:center'),
          `Pagamento ${eurFmt(amount)} registrato`),
      });
    } catch (err) { console.error('[rent] tenant email:', err.message); }
  }
  try {
    await sendEmail({
      to: 'valentino@boom-rome.com',
      subject: `💶 CANONE VIA BOOM ${eurFmt(amount)} — ${pay.month || paymentId}`,
      html: shell(
        para(`Incassato via Stripe: <b>${eurFmt(amount)}</b> (${label}) + commissione servizio <b>${eurFmt(fee)}</b>.<br>Payment <b>${paymentId}</b> · contratto ${pay.contractId || '—'} · segnato <b>paid · stripe</b> — la riconciliazione bancaria lo salta in automatico.`)
        + btn2('https://www.boomrome.com/portal', 'Apri il portale')),
    });
  } catch (err) { console.error('[rent] admin email:', err.message); }

  return res.status(200).json({ received: true, rent: true, paymentId });
}

// The receipt of an English invoice: the amount as an English reader writes it
// (never toLocaleString, which degrades in silence with a small ICU), and the
// desk read back from the order number's prefix (PAR-…, BER-…) in the registry.
function eurEn(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [i, d] = (Number.isInteger(v) ? String(v) : v.toFixed(2)).split('.');
  return '€' + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '');
}
const escHtml = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function deskOfOrderNumber(number) {
  const prefix = String(number || '').split('-')[0];
  if (!prefix) return null;
  return Object.values(CITY_MARKETS).find((d) => d && d.order && d.order.prefix === prefix) || null;
}

// INVOICE — una fattura BOOM pagata con carta dal link mandato su WhatsApp.
// Stessa disciplina del canone: idempotente sul retry di Stripe, e se il
// documento risultava già saldato per altra via NON lo sovrascrive mai —
// segnala un possibile doppio incasso invece di nasconderlo.
async function handleInvoice(res, session, m) {
  const invoiceId = String(m.invoiceId || '').trim();
  if (!invoiceId) return res.status(200).json({ received: true, error: 'no_invoiceId' });
  const now = new Date().toISOString();
  const amount = Number(m.amount) || Math.round((session.amount_total || 0) / 100);

  let inv = null;
  try { inv = await readDoc(`invoices/${invoiceId}`); } catch (_) {}
  if (!inv) return res.status(200).json({ received: true, error: 'invoice_not_found', invoiceId });

  if (inv.status === 'paid') {
    if (inv.stripeSessionId === session.id) {
      return res.status(200).json({ received: true, duplicate: true, invoiceId });
    }
    try {
      await writeDoc('agentNotifications', 'inv-double-' + invoiceId + '-' + session.id.slice(-8), {
        type: 'payment.invoice.double',
        summary: `🚨 POSSIBILE DOPPIO INCASSO sulla fattura ${inv.number || invoiceId}: già pagata${inv.paidDate ? ' il ' + inv.paidDate : ''}, ora ricevuto ANCHE via Stripe.`,
        priority: 'high', status: 'pending', actor: 'stripe-webhook',
        dedupKey: 'inv-double-' + invoiceId, createdAt: now, attempts: 0,
      });
    } catch (_) {}
    return res.status(200).json({ received: true, doublePayment: true, invoiceId });
  }

  let receiptUrl = null;
  try {
    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent), { expand: ['latest_charge'] });
      receiptUrl = (pi.latest_charge && pi.latest_charge.receipt_url) || null;
    }
  } catch (_) {}

  try {
    await patchDoc(`invoices/${invoiceId}`, {
      status: 'paid', paidAt: now, paidDate: now.slice(0, 10),
      paidVia: 'stripe', stripeSessionId: session.id, receiptUrl: receiptUrl || '',
    });
  } catch (err) {
    console.error('[invoice] patch:', err.message);
    return res.status(500).json({ received: false, error: 'patch_failed' });
  }

  // La provvigione della console pre-agreement (fattura prov_<proposta>): la
  // riga della proposta si aggiorna da sola. Solo su una proposta che esiste
  // (precondizione): mai una proposta fantasma. Best-effort, dopo la fattura.
  if (inv.preAgreementId) {
    try {
      await fsCommit([{ docPath: 'preAgreements/' + String(inv.preAgreementId), precondition: { exists: true },
        fields: { feeInvoiceId: invoiceId, feeInvoiceStatus: 'paid', feePaidAt: now, feePaidVia: 'stripe', feeLinkUrl: null } }]);
    } catch (err) { console.warn('[invoice] pa stamp:', err.message); }
  }

  // The fee of a desk that charges at SIGNING (v1.8, invoices/cityfee_<id>
  // from api/payments/_citysign.js): the order lead learns it is paid — the
  // managed ticket, the bounce card, the brain and the ready reply read
  // `paid` on the lead. Only on an order that exists (precondition), awaited,
  // and an error is logged as a code, never with the client's data.
  if (inv.cityLeadId) {
    try {
      await fsCommit([{ docPath: 'leads/' + String(inv.cityLeadId), precondition: { exists: true },
        fields: { paid: true, paidAt: now, paidVia: 'link', paidInvoiceId: invoiceId } }]);
    } catch (err) { console.warn('[invoice] city order stamp:', err && err.conflict ? 'no_order' : 'commit_failed'); }
  }

  try {
    await writeDoc('agentNotifications', 'inv-' + invoiceId + '-' + session.id.slice(-8), {
      type: 'payment.invoice.paid',
      summary: `🧾 Fattura ${inv.number || invoiceId} incassata: €${amount}${inv.recipientName ? ' — ' + inv.recipientName : ''}.`,
      priority: 'normal', status: 'pending', actor: 'stripe-webhook',
      dedupKey: 'inv-' + invoiceId, createdAt: now, attempts: 0,
    });
  } catch (err) { console.error('[invoice] notify:', err.message); }

  const eurFmt = n => '€' + Number(n || 0).toLocaleString('it-IT');
  // Il link si manda anche a chi non ha l'email in archivio: in quel caso
  // Stripe non riceve customer_email e l'indirizzo è quello DIGITATO dal
  // pagante — senza questo la ricevuta non partirebbe proprio a chi ha pagato.
  const email = (session.customer_details && session.customer_details.email)
    || session.customer_email || inv.recipientEmail || '';
  if (email && inv.lang === 'en') {
    // An English invoice (the desks abroad, v1.8) gets an English receipt:
    // the payer is an expat who read the invoice and the pay page in English.
    // The operator's copy below stays Italian.
    const desk = deskOfOrderNumber(inv.cityOrderNumber);
    try {
      await sendEmail({
        to: email,
        ...(desk && process.env.GMAIL_USER ? { from: `BOOM ${desk.label} <${process.env.GMAIL_USER}>` } : {}),
        subject: `Receipt — invoice ${inv.number || ''} ${eurEn(amount)} ✓`,
        html: shell(
          para(`Payment received ✓ — invoice <b>${escHtml(inv.number || invoiceId)}</b> for <b>${eurEn(amount)}</b> is settled. Thank you.`)
          + (receiptUrl ? fine(`Stripe receipt: <a href="${receiptUrl}" style="color:#141414">open →</a>`, 'text-align:center') : '')
          + fine('Questions? Reply to this email or <a href="https://wa.me/393313251961" style="color:#141414">write to us on WhatsApp</a>.', 'text-align:center'),
          `Invoice ${eurEn(amount)} settled`, desk ? { tag: `BOOM ${desk.label} · tenant side` } : {}),
      });
    } catch (err) { console.error('[invoice] client email:', err.message); }
  } else if (email) {
    try {
      await sendEmail({
        to: email,
        subject: `Ricevuta — fattura ${inv.number || ''} ${eurFmt(amount)} ✓`,
        html: shell(
          para(`Pagamento ricevuto ✓ — la fattura <b>${inv.number || invoiceId}</b> di <b>${eurFmt(amount)}</b> risulta saldata.`)
          + (receiptUrl ? fine(`Ricevuta Stripe: <a href="${receiptUrl}" style="color:#141414">apri →</a>`, 'text-align:center') : '')
          + fine('Domande? Rispondi a questa email o <a href="https://wa.me/393313251961" style="color:#141414">scrivici su WhatsApp</a>.', 'text-align:center'),
          `Fattura ${eurFmt(amount)} saldata`),
      });
    } catch (err) { console.error('[invoice] client email:', err.message); }
  }
  try {
    await sendEmail({
      to: 'valentino@boom-rome.com',
      subject: `🧾 FATTURA INCASSATA ${eurFmt(amount)} — ${inv.number || invoiceId}`,
      html: shell(
        para(`Incassata via Stripe: <b>${eurFmt(amount)}</b> — fattura <b>${inv.number || invoiceId}</b>${inv.recipientName ? ' a ' + inv.recipientName : ''}.`)
        + btn2('https://www.boomrome.com/portal', 'Apri il portale')),
    });
  } catch (err) { console.error('[invoice] admin email:', err.message); }

  return res.status(200).json({ received: true, invoice: true, invoiceId });
}

// ── Soldi che tornano indietro: MAI in silenzio ────────────────────────────
// Un rimborso o una CONTESTAZIONE (dispute) finora arrivavano solo nella
// dashboard Stripe: su una dispute non risposta entro la scadenza l'importo
// è perso per sempre. Ora ogni evento suona sul Telegram dell'operatore e
// lascia una notifica in agentNotifications (che fa anche da idempotenza:
// il retry di Stripe trova il doc già scritto e non suona due volte).
// MONEY THAT GOES BACK IS STAMPED ON ITS ORDER (12/11/2026). The upgrade
// credit is a policy: a pack whose money went back carries nothing over
// (api/_upgrade.js upgradeVoidReason reads refundedAt / refundedAmount /
// disputedAt), and until now a refund or a dispute touched no lead at all —
// the link of a refunded pack still opened a Full Search at the credited
// price. The charge (or the dispute) names its PaymentIntent; the Checkout
// Session of that intent names the order (leads/svc_<session>,
// serviceLeadId). Written only on a paid order that EXISTS (precondition: a
// refund of a rent, a deposit or an invoice has no such lead and creates
// none). Exported for the tests.
// THE STAMPS ONLY GO FORWARD, under the version the order was read at (the
// second review, 12/11/2026): Stripe does not deliver in order, and a failed
// stamp is answered 500 — so late and repeated deliveries are routine. An
// event older than what the order already carries changes nothing, and two
// events for the same order processed together cannot overwrite each other
// (the loser reads again and decides again).
// MONEY THAT GOES BACK BEFORE ITS ORDER IS WRITTEN (the third review): the
// session is a paid SERVICE one (every such session ends in leads/svc_…) but
// the lead is not there — its own checkout.session.completed is late (a first
// delivery that failed and waits for Stripe's retry). That is not "no order":
// the stamp must land when the order does. `pending` — the caller answers
// 500 and Stripe delivers the money-back event again. Past ORDER_WAIT_MS
// (Stripe retries for three days after a session that can stay open for one)
// the order is not coming: { missing } — the card says so, once.
const ORDER_WAIT_MS = 96 * 3600 * 1000;
async function stampOrder(paymentIntent, decide) {
  const pi = String(paymentIntent || '');
  if (!pi) return null;
  const list = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 1 });
  const sess = ((list && list.data) || []).find((x) => x && x.id && String(x.payment_intent || '') === pi);
  if (!sess) return null;
  const id = serviceLeadId(sess.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await fsGetVersioned('leads/' + id);
    if (!v || !v.data) {
      const md = sess.metadata && typeof sess.metadata === 'object' ? sess.metadata : {};
      if (md.service !== 'SERVICE' || (sess.payment_status !== 'paid' && sess.status !== 'complete')) return null;
      // (a session with no creation time is of unknown age: it waits too — Stripe's own retry limit bounds it)
      const born = Number(sess.created) > 0 ? Number(sess.created) * 1000 : 0;
      if (!born || Date.now() - born < ORDER_WAIT_MS) throw Object.assign(new Error('order_not_written'), { pending: true });
      return { id, missing: true };
    }
    if (v.data.paid !== true) return null;
    const d = decide(v.data);
    if (!d.fields) return { id, lead: v.data, ...d.out };
    try {
      await fsCommit([{ docPath: 'leads/' + id, fields: d.fields, precondition: { updateTime: v.updateTime } }]);
      return { id, lead: v.data, ...d.out };
    } catch (e) { if (!(e && e.conflict)) throw e; }
  }
  throw new Error('order_stamp_conflict');
}
const isoOf = (epoch) => new Date((Number(epoch) || Math.floor(Date.now() / 1000)) * 1000).toISOString();
// A refund: the CUMULATIVE amount Stripe reports for the charge, which only
// grows. An event that says less than the order carries is an older one
// (`stale`); the same amount again is a retry and writes nothing. Returns
// the order as read before the stamp, with the totals it carries now
// (`refunded`, `full`) and THIS event's own (`ev`): the pack's credit is
// judged by the event (refundCreditVerdict), so two refunds give the same
// end state whichever is delivered first.
export async function stampRefund(charge, createdEpoch) {
  const refunded = Math.round(Number(charge && charge.amount_refunded) || 0) / 100;
  if (!(refunded > 0)) return null;
  const fullNow = (Number(charge.amount_refunded) || 0) >= (Number(charge.amount) || 0);
  const ev = { refunded, full: fullNow };
  return stampOrder(charge.payment_intent, (lead) => {
    const had = Number(lead.refundedAmount) || 0;
    if (refunded < had) return { out: { refunded: had, full: lead.refundedFull === true, stale: true, ev } };
    const out = { refunded, full: fullNow, stale: false, ev };
    return refunded > had || !lead.refundedAt
      ? { fields: { refundedAt: isoOf(createdEpoch), refundedAmount: refunded, refundedFull: fullNow }, out } : { out };
  });
}
// A dispute: the bank takes the money back when it opens (disputedAt), and
// gives it back only if BOOM wins it (disputedAt cleared). A dispute that
// closes any other way keeps the stamp; one whose opening was never seen
// gets it at the close. disputeEventAt keeps the time of the last event
// applied: an older one (the opening delivered again after a won close)
// changes nothing — it would close the credit for good.
export async function stampDispute(dispute, type, createdEpoch) {
  const ev = Number(createdEpoch) > 0 ? Number(createdEpoch) : Math.floor(Date.now() / 1000);
  const at = isoOf(ev), status = String((dispute && dispute.status) || '');
  // closed in BOOM's favour: won, or an inquiry closed without becoming a dispute (the money never left)
  const won = type === 'charge.dispute.closed' && (status === 'won' || status === 'warning_closed');
  return stampOrder(dispute && dispute.payment_intent, (lead) => {
    if (ev < (Number(lead.disputeEventAt) || 0)) return { out: { won, stale: true } };
    const fields = type === 'charge.dispute.created'
      ? { disputedAt: at, disputeStatus: status || 'open', disputeClosedAt: null, disputeEventAt: ev }
      : won ? { disputedAt: null, disputeStatus: status, disputeClosedAt: at, disputeEventAt: ev }
        : { disputeStatus: status || 'closed', disputeClosedAt: at, disputeEventAt: ev, ...(lead.disputedAt ? {} : { disputedAt: at }) };
    return { fields, out: { won, stale: false } };
  });
}
// the order named on the operator's card: id (desk · plan · file)
const orderTag = (ord) => {
  const c = ord.lead.city && typeof ord.lead.city === 'object' ? ord.lead.city : null;
  return `Ordine ${ord.id}${c ? ` (${c.label || ord.lead.market || ''}${c.serviceLabel ? ' · ' + c.serviceLabel : ''}${c.file ? ' · ' + c.file : ''})` : ''}`;
};

// THE OPERATOR'S REFUND IS THE ACT (the other door, api/_upgrade.js). Money
// going back on an order that a pack holder paid in full (city.creditDue):
// whether it closes the pack's credit, and what the operator reads, is one
// pure decision (refundCreditVerdict) on THIS event's own totals — a partial
// refund that reaches the pack amount is the credit going back (with match
// 'check', only a refund of exactly that amount), a refund of the whole
// order returns everything and leaves the pack its credit. The mark
// (credit.via 'full-price', usedBy this order, atRefund = the total at which
// it closed) is written under the version the pack was read at — never over
// another order's mark, never on a pack whose own money already went back.
// Idempotent: a second delivery finds its own mark. Returns the clause for
// the operator's card (null: the order has no credit owed on it); THROWS
// when the pack cannot be read or the mark cannot be written — the caller
// answers 500 and Stripe delivers the refund again.
async function settleRefundCredit(ord, fmt) {
  const c = ord.lead.city && typeof ord.lead.city === 'object' ? ord.lead.city : null;
  const due = c && c.creditDue && typeof c.creditDue === 'object' && c.creditDue.from ? c.creditDue : null;
  if (!due) return null;
  const from = String(due.from), amt = Number(due.amount) || 0;
  const ev = ord.ev || { refunded: ord.refunded, full: ord.full };
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await fsGetVersioned('leads/' + from);
    const verdict = refundCreditVerdict(due, ord.id, ev, v && v.data ? v.data : null, fmt);
    if (!verdict.close) return verdict.clause;
    try {
      await fsCommit([{ docPath: 'leads/' + from, fields: { credit: { usedBy: ord.id, usedAt: new Date().toISOString(), amount: amt, currency: String(due.currency || ord.lead.currency || 'eur'), via: 'full-price', atRefund: ev.refunded } }, precondition: { updateTime: v.updateTime } }]);
      return verdict.clause;
    } catch (e) {
      // a conflict: the pack changed between read and write. Anything else: the write may have landed. Read again
      if (!(e && e.conflict)) console.error('[moneyback] credit close:', e && e.message);
    }
  }
  throw new Error('credit_close_failed');
}

// A pack whose money goes back (or is disputed) while an order paid IN FULL
// is still waiting for this very credit to be refunded (creditDueFrom, top
// level on that order): nothing more is due there. Returns the ids.
async function pendingClaimsOn(packId) {
  const rows = await fsList('leads', { filter: { field: 'creditDueFrom', op: 'EQUAL', value: packId }, limit: 10 });
  return rows.filter(claimWaits).map((d) => String(d.id));
}
const isOpenPack = (lead) => {
  const c = lead && lead.city && typeof lead.city === 'object' ? lead.city : null;
  const used = lead && lead.credit && typeof lead.credit === 'object' && lead.credit.usedBy;
  return !!c && !used && Object.prototype.hasOwnProperty.call(UPGRADE_PATHS, String(c.service || lead.kind || ''));
};
// the sentence about orders waiting for this pack's credit ('' when none); a lookup that fails says so
async function claimsClause(ord, verb) {
  if (!isOpenPack(ord.lead)) return '';
  try {
    const ids = await pendingClaimsOn(ord.id);
    return ids.length ? `ATTENZIONE: ${ids.join(', ')} (pagato a prezzo pieno) aspettava il rimborso di questo credito: ${verb}` : '';
  } catch (e) {
    console.error('[moneyback] pending claims:', e && e.message);
    return 'Non ho potuto controllare se un ordine pagato a prezzo pieno aspettava il rimborso di questo credito';
  }
}
// two sentences of a card's order line, either of which may be empty
const sentences = (...parts) => parts.filter(Boolean).join('. ');

async function handleMoneyBack(res, event) {
  const o = event.data.object || {};
  // in the currency of the charge or dispute (a London order is in pounds):
  // '£…' for gbp, the same '€…' as before for everything else
  const eur = n => moneyOf((Math.round(n || 0) / 100).toLocaleString('it-IT'), o.currency);
  const when = e => e ? new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long' }).format(new Date(e * 1000)) : '—';

  let text = '';
  let priority = 'normal';
  // the stamp on the order: what it found, and whether it failed. A failed
  // stamp (or a pack's credit that could not be closed) is answered 500
  // AFTER the card has rung, so Stripe delivers the event again until it
  // lands; the notification (idempotent) keeps the card from ringing twice
  // and remembers that it failed (stampFailed), so the delivery that
  // finally lands takes it back.
  let orderLine = '', stamped = null, stampFailed = false, neverWritten = false;
  const STAMP_FAILED = '\n⚠️ Non sono riuscito a segnare l\'ordine: Stripe riconsegna l\'evento da solo e ti avviso quando è segnato. Fino ad allora, se era un Application Pack, il suo credito di upgrade resta aperto.';
  // the order of this payment is not written yet (its own "payment completed" event is late): same promise
  const ORDER_PENDING = '\n⚠️ L\'ordine di questo pagamento non è ancora scritto (la conferma del pagamento è in ritardo): Stripe riconsegna questo evento da solo e ti avviso quando l\'ordine è segnato.';
  const ORDER_MISSING = (id) => `\n⚠️ Ordine ${id}: questo pagamento era di un ordine dei desk che non è mai stato scritto — niente da segnare: verifica a mano su Stripe.`;
  const failedLine = (e) => (e && e.pending ? ORDER_PENDING : STAMP_FAILED);
  // a paid desk session whose order never came: said on the card, and nothing else to do
  const settleMissing = () => { if (stamped && stamped.missing) { orderLine = ORDER_MISSING(stamped.id); neverWritten = true; stamped = null; } };
  if (event.type === 'charge.refunded') {
    const who = (o.billing_details && (o.billing_details.name || o.billing_details.email)) || '—';
    const full = (o.amount_refunded || 0) >= (o.amount || 0);
    // the order this money paid for, stamped BEFORE the notification: a
    // Stripe retry that finds the notification already written has still
    // stamped the lead (the stamp is idempotent)
    try {
      stamped = await stampRefund(o, event.created);
    } catch (e) {
      console.error('[moneyback] refund stamp:', e && e.message);
      stampFailed = true;
      orderLine = failedLine(e);
    }
    settleMissing();
    if (stamped) {
      const fmt = (n) => moneyOf(n, stamped.lead.currency || o.currency);
      const head = `\n${orderTag(stamped)}: ${stamped.stale ? `già segnato rimborsato per ${fmt(stamped.refunded)} (questo evento è precedente)` : 'segnato rimborsato'}`;
      try {
        // the other door: this refund may BE the credit going back — the pack's credit closes here
        let note = await settleRefundCredit(stamped, fmt);
        // what the credit means for this refund (api/_upgrade.js, one copy with /api/withdraw's card), and
        // whether an order paid in full was waiting for the credit of the pack now refunded
        if (note === null) note = sentences(upgradeMoneyBackNote(stamped.lead, fmt), await claimsClause(stamped, 'ora NON è più dovuto — non rimborsarlo anche là'));
        orderLine = `${head}${note ? ' — ' + note : ''}.`;
      } catch (e) {
        console.error('[moneyback] credit close:', e && e.message);
        stampFailed = true;
        orderLine = `${head}. ⚠️ Su questo ordine era dovuto il rimborso di un credito e non sono riuscito a chiudere il credito del pack: Stripe riconsegna l'evento da solo e ti avviso quando è chiuso. Fino ad allora quel link di upgrade resta aperto.`;
      }
    }
    text = `↩️ <b>RIMBORSO ${full ? 'totale' : 'parziale'}: ${eur(o.amount_refunded)}</b>\n`
      + `${who} · addebito ${eur(o.amount)}\n`
      + `https://dashboard.stripe.com/payments/${o.payment_intent || o.id}`
      + orderLine;
  } else {
    // a dispute: stamped on the order like a refund (the bank holds the money
    // from the opening; it comes back only if the dispute is won)
    try {
      stamped = await stampDispute(o, event.type, event.created);
      settleMissing();
      if (stamped && stamped.stale) {
        orderLine = `\n${orderTag(stamped)}: evento precedente a uno già segnato — nessuna modifica.`;
      } else if (stamped) {
        const opened = event.type === 'charge.dispute.created';
        const c = stamped.lead.city && typeof stamped.lead.city === 'object' ? stamped.lead.city : null;
        const pack = c && Object.prototype.hasOwnProperty.call(UPGRADE_PATHS, String(c.service || stamped.lead.kind || ''));
        const used = stamped.lead.credit && typeof stamped.lead.credit === 'object' && stamped.lead.credit.usedBy;
        const due = c && c.creditDue && typeof c.creditDue === 'object' && c.creditDue.from ? c.creditDue : null;
        // "worth again" only when the link would really open again (not expired, not refunded meanwhile)
        const again = () => { const x = upgradeOffer({ ...stamped.lead, disputedAt: null }, stamped.id, Date.now()); return x.ok ? 'il credito di upgrade di questo ordine vale di nuovo' : x.state === 'expired' ? 'il credito di upgrade di questo ordine era comunque scaduto' : ''; };
        // a dispute that closes says what it leaves behind: won = the money stays with BOOM (a spent credit has
        // nothing to settle, a credit owed is owed again, an order that waited may be refunded); lost = it went
        // back through the bank (the pack carries no credit, nothing is owed on an order that waited for it)
        const lost = !opened && !stamped.won;
        // (a pack whose credit was closed by a refund on an order paid in full: credit.via 'full-price')
        const viaFull = !!used && stamped.lead.credit.via === 'full-price';
        const note = used ? (stamped.won ? `il credito di questo ordine resta ${viaFull ? 'rimborsato su' : 'usato da'} ${String(used)}: niente da regolare`
          // at the opening nothing is lost yet: what a LOST dispute would mean, said as a condition
          : opened ? `ATTENZIONE: il credito di questo ordine è già stato ${viaFull ? `rimborsato sull'ordine ${String(used)}` : `usato da ${String(used)}`}: se la contestazione è persa il cliente avrà avuto ${viaFull ? 'due volte lo stesso credito' : 'il credito e il pack indietro'} — ${viaFull ? 'da regolare con lui' : 'la differenza si regola su quell\'ordine'}`
            : upgradeMoneyBackNote(stamped.lead))
          : due ? (opened ? `su questo ordine era dovuto il rimborso del credito di ${String(due.from)}: non rimborsarlo finché la contestazione non è chiusa`
            : stamped.won ? `il rimborso del credito di ${String(due.from)} su questo ordine torna dovuto, se non è già stato fatto`
              : `la banca ha restituito questo pagamento al cliente: il rimborso del credito di ${String(due.from)} non è più dovuto su questo ordine`)
            : !pack ? ''
              : stamped.won ? sentences(again(), await claimsClause(stamped, 'ora è di nuovo dovuto'))
                : sentences(lost ? 'contestazione persa: il credito di upgrade di questo ordine non vale più' : 'il credito di upgrade di questo ordine è sospeso finché la contestazione non è vinta',
                  await claimsClause(stamped, opened ? 'non rimborsarlo finché la contestazione non è chiusa' : 'ora NON è più dovuto — non rimborsarlo'));
        orderLine = `\n${orderTag(stamped)}: ${opened ? 'pagamento contestato' : stamped.won ? 'contestazione vinta' : 'contestazione chiusa'}${note ? ' — ' + note : ''}.`;
      }
    } catch (e) {
      console.error('[moneyback] dispute stamp:', e && e.message);
      stampFailed = true;
      orderLine = failedLine(e);
    }
    if (event.type === 'charge.dispute.created') {
      priority = 'high';
      const dueBy = o.evidence_details && o.evidence_details.due_by;
      text = `🚨 <b>CONTESTAZIONE (dispute): ${eur(o.amount)}</b>\n`
        + `Motivo: ${o.reason || '—'}\n`
        + `⏰ Rispondi con le prove <b>entro il ${when(dueBy)}</b> — senza risposta l'importo è perso.\n`
        + `https://dashboard.stripe.com/disputes/${o.id}`
        + orderLine;
    } else {
      const esito = o.status === 'won' ? 'VINTA ✓' : o.status === 'lost' ? 'PERSA ✗' : (o.status || 'chiusa');
      text = `⚖️ Dispute ${esito} — ${eur(o.amount)}\nhttps://dashboard.stripe.com/disputes/${o.id}` + orderLine;
    }
  }

  const notifId = 'stripe-' + String(event.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  // a stamp that failed must reach the operator even if Telegram is down right now: notify-pending relays
  // only high-priority notifications
  if (stampFailed) priority = 'high';
  // the durable record: the two head lines and what happened to the order (a failed stamp included)
  const headLines = text.replace(/<[^>]+>/g, '').split('\n').slice(0, 2);
  const summaryOf = (line) => [...headLines, line].filter(Boolean).join(' · ');
  let w = null;
  try {
    w = await writeDoc('agentNotifications', notifId, {
      type: 'stripe.' + event.type,
      summary: summaryOf(orderLine.trim()),
      priority, status: 'pending', actor: 'stripe-webhook',
      dedupKey: 'stripe-' + event.id, createdAt: new Date().toISOString(), attempts: 0,
      ...(stampFailed ? { stampFailed: true } : {}),
    });
  } catch (e) { console.error('[moneyback] notify write:', e.message); }
  if (w && w.exists) {
    // A second delivery. If an earlier one told the operator that the stamp had failed ("ti avviso quando è
    // segnato"), this one takes it back — whether it stamped the order now, or found that no desk order stands
    // behind this payment. The RECORD decides (stampFailed), never a guess from what the order looks like.
    if (!stampFailed) {
      let prev = null;
      try { prev = await fsGet('agentNotifications/' + notifId); }
      catch (e) {
        console.error('[moneyback] notify read:', e && e.message);
        return res.status(500).json({ received: true, duplicate: true, error: 'notification_read_failed' });
      }
      if (prev && prev.stampFailed === true) {
        const line = stamped || neverWritten ? orderLine.trim() : 'dietro questo pagamento non c\'è un ordine dei desk da segnare: niente da fare.';
        // (an order that never came is not "all fine": the line itself asks for a check by hand)
        const fixed = neverWritten ? `${headLines[0] || 'Evento Stripe'} — ${line}`
          : `✅ ${stamped ? '' : (headLines[0] || 'Evento Stripe') + ' — '}${line} La prima consegna di questo evento non c'era riuscita: ora è a posto.`;
        try { await tgNotify(fixed); } catch (e) { console.error('[moneyback] telegram:', e.message); }
        // …and the stored record stops saying it failed
        try { await fsCommit([{ docPath: 'agentNotifications/' + notifId, fields: { summary: summaryOf(line), stampFailed: false, repairedAt: new Date().toISOString() }, precondition: { exists: true } }]); } catch (e) { console.error('[moneyback] notify repair:', e && e.message); }
      }
    }
    return res.status(stampFailed ? 500 : 200).json({ received: true, duplicate: true, ...(stampFailed ? { error: 'order_stamp_failed' } : {}) });
  }

  try { await tgNotify(text); } catch (e) { console.error('[moneyback] telegram:', e.message); }
  return res.status(stampFailed ? 500 : 200).json({ received: true, moneyback: event.type, ...(stampFailed ? { error: 'order_stamp_failed' } : {}) });
}

// ─── SDD: il canone automatico SEPA (api/payments/_sdd.js) ─────────────────
// Tre momenti, tre rami. Il mandato si attiva da una Checkout mode=setup
// (SDD_SETUP); gli esiti degli addebiti arrivano DAYS dopo l'avvio come
// payment_intent.succeeded / payment_failed — SEPA è asincrono per natura.
// Esportati per i test (tests/sdd/run.mjs), come gli altri rami soldi.

export async function handleSddSetup(res, session, m) {
  const contractId = String(m.contractId || '').trim();
  if (!contractId) return res.status(200).json({ received: true, error: 'no_contractId' });
  const now = new Date().toISOString();

  // fsGet, NON il readDoc locale: sdd è una mappa annidata e il fsValToJs di
  // questo file la appiattirebbe a null — il replay non vedrebbe mai il
  // mandato già attivo.
  let contract = null;
  try { contract = await fsGet('contracts/' + contractId); } catch (_) {}
  if (!contract) return res.status(200).json({ received: true, error: 'contract_not_found', contractId });

  // Il metodo di pagamento + mandato vivono nel SetupIntent della sessione.
  let pm = null, mandateRef = null;
  try {
    const si = await stripe.setupIntents.retrieve(String(session.setup_intent), { expand: ['payment_method'] });
    pm = si.payment_method || null;
    mandateRef = si.mandate ? String(si.mandate) : null;
  } catch (e) {
    console.error('[sdd-setup] setup_intent read failed:', e.message);
    return res.status(200).json({ received: true, error: 'setup_intent_unreadable' });
  }
  if (!pm || !pm.id) return res.status(200).json({ received: true, error: 'no_payment_method' });

  const prev = contract.sdd || {};
  if (prev.status === 'active' && prev.paymentMethodId === pm.id) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  const last4 = (pm.sepa_debit && pm.sepa_debit.last4) || '';
  const email = m.email || (session.customer_details && session.customer_details.email) || contract.tenantEmail || '';
  try {
    // fsPatch (homie/_lib), NON il patchDoc locale: sdd è una mappa annidata
    // e il patchDoc di questo file appiattisce gli oggetti a String(v).
    await fsPatch('contracts/' + contractId, {
      sdd: {
        status: 'active',
        customerId: String(session.customer || prev.customerId || ''),
        paymentMethodId: pm.id,
        mandateRef,
        ibanLast4: last4,
        email,
        activatedAt: now,
      },
    });
  } catch (e) {
    console.error('[sdd-setup] contract patch:', e.message);
    return res.status(500).json({ received: false, error: 'patch_failed' });
  }

  try {
    await writeDoc('agentNotifications', 'sdd-on-' + contractId, {
      type: 'payment.sdd.activated',
      summary: `🏦 Addebito SEPA ATTIVATO — ${contract.tenantName || email || contractId} (IBAN ••••${last4}): il canone parte da solo`,
      priority: 'normal', status: 'pending', actor: 'stripe-webhook',
      dedupKey: 'sdd-on-' + contractId, createdAt: now, attempts: 0,
    });
  } catch (_) {}
  try {
    await tgNotify(`🏦 <b>Canone automatico attivo</b> — ${contract.tenantName || email || contractId} (IBAN ••••${last4}).\nDa ora ogni rata parte da sola ~1 settimana prima della scadenza.`);
  } catch (_) {}

  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: 'Auto-pay is on ✓ — your rent now takes care of itself',
        html: shell(
          para(`Your SEPA direct debit is <b>active</b> (IBAN ••••${last4}). From now on each rent instalment is collected automatically about a week before its due date — nothing to remember, receipt by email every time. You can turn it off anytime from your home page.`)
          + btn('https://www.boomrome.com/casa', 'Open La tua casa BOOM')
          + fine('Questions? Just reply to this email or <a href="https://wa.me/393313251961" style="color:#141414">WhatsApp us</a>.', 'text-align:center'),
          'Auto-pay active ✓'),
      });
    } catch (e) { console.error('[sdd-setup] tenant email:', e.message); }
  }
  try {
    await sendEmail({
      to: 'valentino@boom-rome.com',
      subject: `🏦 SDD attivo — ${contract.tenantName || contractId}`,
      html: shell(para(`Mandato SEPA attivato sul contratto <b>${contractId}</b> (${contract.tenantName || '—'}, IBAN ••••${last4}).<br>Il cron addebita ogni rata ~${process.env.SDD_LEAD_DAYS || 7} giorni prima della scadenza; esiti su Telegram e in /casa.`)
        + btn2('https://www.boomrome.com/portal', 'Apri il portale')),
    });
  } catch (_) {}

  return res.status(200).json({ received: true, sddActive: true, contractId });
}

export async function handleSddPaid(res, pi) {
  const m = pi.metadata || {};
  const paymentId = String(m.paymentId || '').trim();
  if (!paymentId) return res.status(200).json({ received: true, error: 'no_paymentId' });
  const now = new Date().toISOString();
  const fee = Number(m.fee) || 0;
  const amount = Number(m.amount) || Math.round(((pi.amount || 0) / 100 - fee) * 100) / 100;

  let pay = null;
  try { pay = await readDoc('payments/' + paymentId); } catch (_) {}
  if (!pay) return res.status(200).json({ received: true, error: 'payment_not_found', paymentId });
  if (pay.status === 'paid') {
    if (pay.sddPiId === pi.id || pay.stripeSessionId === pi.id) {
      return res.status(200).json({ received: true, duplicate: true, paymentId });
    }
    // Pagata per ALTRA via mentre l'addebito era in volo: mai sovrascrivere,
    // allarme doppio incasso — stessa disciplina del ramo carta.
    try {
      await writeDoc('agentNotifications', 'rent-double-' + paymentId + '-' + String(pi.id).slice(-8), {
        type: 'payment.rent.double',
        summary: `🚨 POSSIBILE DOPPIO INCASSO su ${paymentId}: già ${pay.paidVia || 'paid'}, ora arrivato ANCHE l'addebito SEPA (${pi.id}) — verifica e rimborsa`,
        priority: 'high', status: 'pending', actor: 'stripe-webhook',
        dedupKey: 'rent-double-' + paymentId, createdAt: now, attempts: 0,
      });
    } catch (_) {}
    try { await tgNotify(`🚨 <b>Possibile doppio incasso</b> su ${paymentId}: già ${pay.paidVia || 'paid'}, ora ANCHE SEPA. Verifica e rimborsa.\nhttps://dashboard.stripe.com/payments/${pi.id}`); } catch (_) {}
    return res.status(200).json({ received: true, doublePayment: true, paymentId });
  }

  // Costo reale + ricevuta (best-effort) — alimenta settings/sddFeeStats,
  // che fa convergere la commissione sul costo vero (media PER ADDEBITO:
  // il costo SEPA è flat, non proporzionale).
  let receiptUrl = null, stripeCostEur = null;
  try {
    const chId = typeof pi.latest_charge === 'string' ? pi.latest_charge : (pi.latest_charge && pi.latest_charge.id);
    if (chId) {
      const ch = await stripe.charges.retrieve(chId, { expand: ['balance_transaction'] });
      receiptUrl = ch.receipt_url || null;
      if (ch.balance_transaction && typeof ch.balance_transaction.fee === 'number') {
        stripeCostEur = Math.round(ch.balance_transaction.fee) / 100;
      }
    }
  } catch (e) { console.error('[sdd] costo reale non leggibile:', e.message); }

  try {
    await patchDoc('payments/' + paymentId, {
      status: 'paid', paidAt: now, paidDate: now.slice(0, 10),
      paidVia: 'sepa', sddStatus: 'succeeded',
      serviceFeeEur: fee, receiptUrl: receiptUrl || '',
      stripeCostEur,
      marginEur: stripeCostEur == null ? null : Math.round((fee - stripeCostEur) * 100) / 100,
    });
  } catch (err) {
    console.error('[sdd] payment patch:', err.message);
    return res.status(500).json({ received: false, error: 'patch_failed' });
  }

  if (stripeCostEur != null) {
    try {
      const prev = (await readDoc('settings/sddFeeStats').catch(() => null)) || {};
      await patchDoc('settings/sddFeeStats', {
        count: (Number(prev.count) || 0) + 1,
        volumeEur: Math.round(((Number(prev.volumeEur) || 0) + amount) * 100) / 100,
        costEur: Math.round(((Number(prev.costEur) || 0) + stripeCostEur) * 100) / 100,
        lastAt: now,
      });
    } catch (err) { console.error('[sdd] statistica costi:', err.message); }
  }

  try {
    await writeDoc('agentNotifications', 'sdd-' + paymentId + '-' + String(pi.id).slice(-8), {
      type: 'payment.rent',
      summary: `🏦 Canone incassato con addebito SEPA: €${amount.toLocaleString('it-IT')} (${pay.month || paymentId}) + fee €${fee}`,
      priority: 'normal', status: 'pending', actor: 'stripe-webhook',
      dedupKey: 'sdd-' + paymentId, createdAt: now, attempts: 0,
    });
  } catch (_) {}

  const eurFmt = n => '€' + Number(n || 0).toLocaleString('en-US');
  const email = m.email || '';
  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: `Receipt — rent ${pay.month || ''} ${eurFmt(amount)} collected automatically ✓`,
        html: shell(
          para(`Your rent for <b>${pay.month || String(pay.dueDate || '').slice(0, 7)}</b> — <b>${eurFmt(amount)}</b> — was collected by SEPA direct debit as planned${fee ? ` (service fee ${eurFmt(fee)})` : ''}. Nothing to do: this is your receipt, and the full history lives in your home page.`)
          + btn('https://www.boomrome.com/casa', 'Open La tua casa BOOM')
          + (receiptUrl ? fine(`Stripe receipt: <a href="${receiptUrl}" style="color:#141414">open →</a>`, 'text-align:center') : ''),
          `Rent ${eurFmt(amount)} collected ✓`),
      });
    } catch (err) { console.error('[sdd] tenant email:', err.message); }
  }
  try {
    await sendEmail({
      to: 'valentino@boom-rome.com',
      subject: `🏦 CANONE AUTOMATICO ${eurFmt(amount)} — ${pay.month || paymentId}`,
      html: shell(para(`Incassato con addebito SEPA: <b>${eurFmt(amount)}</b> + commissione <b>${eurFmt(fee)}</b>${stripeCostEur != null ? ` (costo Stripe ${eurFmt(stripeCostEur)} → margine ${eurFmt(fee - stripeCostEur)})` : ''}.<br>Payment <b>${paymentId}</b> · contratto ${pay.contractId || '—'} · segnato <b>paid · sepa</b>.`)
        + btn2('https://www.boomrome.com/portal', 'Apri il portale')),
    });
  } catch (_) {}

  return res.status(200).json({ received: true, sdd: true, paymentId });
}

export async function handleSddFailed(res, pi) {
  const m = pi.metadata || {};
  const paymentId = String(m.paymentId || '').trim();
  if (!paymentId) return res.status(200).json({ received: true, error: 'no_paymentId' });
  const now = new Date().toISOString();
  const reason = (pi.last_payment_error && pi.last_payment_error.message) || 'addebito rifiutato';

  let pay = null;
  try { pay = await readDoc('payments/' + paymentId); } catch (_) {}
  if (!pay) return res.status(200).json({ received: true, error: 'payment_not_found', paymentId });
  if (pay.status === 'paid') return res.status(200).json({ received: true, alreadyPaid: true });

  // La rata resta PENDING e torna pagabile a mano: sddPiId resta sul doc,
  // quindi il collector non la ritenta mai da solo (un retry SEPA su fondi
  // insufficienti brucia commissioni e fiducia).
  try {
    await patchDoc('payments/' + paymentId, { sddStatus: 'failed', sddError: String(reason).slice(0, 300) });
  } catch (err) { console.error('[sdd-failed] patch:', err.message); }

  let w = null;
  try {
    w = await writeDoc('agentNotifications', 'sddfail-' + paymentId + '-' + String(pi.id).slice(-8), {
      type: 'payment.sdd.failed',
      summary: `⚠️ Addebito SEPA FALLITO su ${paymentId} (${pay.month || '—'}): ${String(reason).slice(0, 120)} — la rata torna manuale`,
      priority: 'high', status: 'pending', actor: 'stripe-webhook',
      dedupKey: 'sddfail-' + paymentId, createdAt: now, attempts: 0,
    });
  } catch (_) {}
  if (w && w.exists) return res.status(200).json({ received: true, duplicate: true });

  try {
    await tgNotify(`⚠️ <b>Addebito SEPA fallito</b> — rata ${pay.month || paymentId}\nMotivo: ${String(reason).slice(0, 160)}\nIl cliente è stato avvisato: può pagare con carta o bonifico da /casa.`);
  } catch (_) {}

  const email = m.email || '';
  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: `Action needed — this month's rent debit did not go through`,
        html: shell(
          para(`The automatic SEPA debit for your rent (<b>${pay.month || String(pay.dueDate || '').slice(0, 7)}</b>) did not go through — usually a balance or bank-side issue. No stress: you can settle it in one minute by card or free bank transfer from your home page.`)
          + btn('https://www.boomrome.com/casa', 'Pay it now')
          + fine('Need a hand? <a href="https://wa.me/393313251961" style="color:#141414">WhatsApp us</a> and we sort it together.', 'text-align:center'),
          'Rent debit failed — pay manually'),
      });
    } catch (err) { console.error('[sdd-failed] tenant email:', err.message); }
  }

  return res.status(200).json({ received: true, sddFailed: true, paymentId });
}

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
]);

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

  if (!HANDLED_EVENTS.has(event.type)) {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  // Gli esiti SEPA arrivano come payment_intent.* — l'addebito è asincrono
  // (~5 giorni lavorativi dopo l'avvio). Si reagisce SOLO ai nostri addebiti
  // automatici: i PI delle Checkout con carta non portano service RENT_SDD
  // e restano al ramo checkout.session.completed.
  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object || {};
    if ((pi.metadata || {}).service !== 'RENT_SDD') {
      return res.status(200).json({ received: true, ignored: event.type });
    }
    return event.type === 'payment_intent.succeeded'
      ? handleSddPaid(res, pi)
      : handleSddFailed(res, pi);
  }

  if (event.type !== 'checkout.session.completed') {
    return handleMoneyBack(res, event);
  }

  const session = event.data.object;
  const m = session.metadata || {};

  if (m.service === 'SDD_SETUP') {
    return handleSddSetup(res, session, m);
  }

  if (m.service === 'DEPOSIT') {
    return handleDeposit(res, session, m);
  }

  if (m.service === 'RESERVE') {
    return handleReserve(res, session, m);
  }

  if (m.service === 'SERVICE') {
    return handleService(res, session, m, event);
  }

  if (m.service === 'PREAGREEMENT') {
    return handlePreagreement(res, session, m);
  }

  if (m.service === 'RENT') {
    return handleRent(res, session, m);
  }

  if (m.service === 'INVOICE') {
    return handleInvoice(res, session, m);
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
  catch (err) {
    if (String(err.message || '').includes(' 409')) {
      // Retry di Stripe: cliente già creato al primo giro con il SUO codice
      // portale (quello nelle email già inviate). Non rigenerare nulla,
      // non rimandare email.
      return res.status(200).json({ received: true, duplicate: true, pfsClientId: docId });
    }
    // Scrittura fallita: niente email con un codice mai persistito.
    // 500 → Stripe ritenta e il prossimo giro scrive davvero.
    console.error('Firestore error:', err);
    return res.status(500).json({ error: 'pfs_client_write_failed' });
  }

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
      r1_value: 'We call you during office hours (Rome time)',
      r2_icon: '✓',
      r2_label: 'At least 3 matching options',
      r2_value: 'Within 15 days of your written criteria — or the €350 back',
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
