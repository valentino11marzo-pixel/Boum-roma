import Stripe from 'stripe';
import crypto from 'node:crypto';
import { fsList, fsPatch, fsGet, getAdminToken, toFsValue } from './homie/_lib.js';
import { sendPaEmails, shell, para, fine, btn, btn2 } from './preagreement/_notify.js';
import { sendEmail } from './agent/_lib.js';
import { maybeAutoConvert } from './preagreement/_auto.js';
import { tgNotify } from './pfs/_health.js';
import { CITY_MARKETS, CITY_PLANS, cityPhone, serviceLeadId } from './_market.js';
import SCALO from '../js/scalo-codes.js';

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

// The 14-day withdrawal period of a service contract (Directive 2011/83/EU
// art. 9), on the Rome calendar. The day the contract is concluded does not
// count (Reg. 1182/71 art. 3(1), recital 41 of the Directive): paid on
// Tuesday 20 October, the period runs to the END of 3 November and the first
// day work may begin without a request is 4 November. Calendar days, never
// 14×24h — that slips a day across the October and March clock changes.
// A last day that falls on a Saturday, a Sunday or a public holiday moves to
// the end of the next working day (Reg. 1182/71 art. 3(4)): paid on Saturday
// 17 October, the period ends on Monday 2 November, not on Saturday 31.
// Which holidays: the union of Italy's (the trader, in Rome) and the desk's
// country — a day too many only lengthens the payer's right and delays our
// start, a day too few would shorten a right the law gives them. The day
// work begins is the next desk working day after the period. `concludedEpoch`
// is the moment of payment (the Stripe event's time, stable across retries),
// not the moment the Checkout page was opened.
// The model withdrawal form (Annex I(B)), filled with the trader's details.
// The page is the fillable copy; the TEXT travels inside the confirmation
// email too, because the email is the durable medium (art. 8(7)) and the
// form is part of the information it must carry (art. 6(1)(h)). One line,
// the dashes of the Annex kept: the email template does not keep newlines.
export const WITHDRAWAL_FORM_URL = 'https://www.boomrome.com/withdrawal';
export const WITHDRAWAL_FORM_TEXT = 'MODEL WITHDRAWAL FORM (complete and return this form only if you wish to withdraw from the contract): '
  + '— To Egidi Immobiliare S.r.l. (BOOM), Via dei Coronari 181/184, 00186 Roma, Italy, e-mail hello@boom-rome.com: '
  + '— I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the provision of the following service (*), '
  + '— Ordered on (*)/received on (*), — Name of consumer(s), — Address of consumer(s), '
  + '— Signature of consumer(s) (only if this form is notified on paper), — Date. (*) Delete as appropriate.';
// the same form for the Rome Pacchetto, in Italian (Codice del consumo
// art. 49(1)(h), Allegato I parte B)
export const WITHDRAWAL_FORM_TEXT_IT = 'MODULO DI RECESSO TIPO (compilare e restituire il presente modulo solo se si desidera recedere dal contratto): '
  + '— Destinatario: Egidi Immobiliare S.r.l. (BOOM), Via dei Coronari 181/184, 00186 Roma, e-mail hello@boom-rome.com: '
  + '— Con la presente io/noi (*) notifichiamo il recesso dal mio/nostro (*) contratto di prestazione del seguente servizio (*), '
  + '— Ordinato il (*)/ricevuto il (*), — Nome del/dei consumatore(i), — Indirizzo del/dei consumatore(i), '
  + '— Firma del/dei consumatore(i) (solo se il presente modulo è notificato in versione cartacea), — Data. (*) Cancellare la dicitura inutile.';

// Easter Sunday, Gregorian (Meeus/Jones/Butcher), as [month, day].
function easterOf(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
}
// Fixed dates as MM-DD, Easter-relative ones as offsets in days.
const HOLIDAYS = {
  // national, plus Rome's patron day (29 June); 4 October is a national
  // holiday again from 2026
  it: { fixed: ['01-01', '01-06', '04-25', '05-01', '06-02', '06-29', '08-15', '10-04', '11-01', '12-08', '12-25', '12-26'], easter: [1] },
  // Nieuwjaar, Koningsdag (26 April when the 27th is a Sunday), Bevrijdingsdag,
  // Kerst; Goede Vrijdag, Paasmaandag, Hemelvaart, Pinkstermaandag
  nl: { fixed: ['01-01', '04-27', '05-05', '12-25', '12-26'], easter: [-2, 1, 39, 50], kingsDay: true },
  // national, plus the Comunidad and the city of Madrid (2 May, San Isidro,
  // La Almudena); Jueves and Viernes Santo
  es: { fixed: ['01-01', '01-06', '05-01', '05-02', '05-15', '08-15', '10-12', '11-01', '11-09', '12-06', '12-08', '12-25'], easter: [-3, -2] },
  // the Barcelona desk: Catalonia's labour calendar (DOGC: Ordre EMT/66/2025
  // for 2026, EMT/52/2026 for 2027 — Cap d'Any, Reis, Treball, Sant Joan,
  // Assumpció, Diada, Festa Nacional, Tots Sants, Constitució, Immaculada,
  // Nadal, Sant Esteve; Divendres Sant and Dilluns de Pasqua Florida, NO
  // Dijous Sant) plus the city of Barcelona's two local days (Pasqua
  // Granada = Easter+50, La Mercè 24 Sept). Catalonia drops whichever of
  // 15/8, 1/11, 6/12, 26/12 fall on a Sunday: listing all four is exact
  // for 2026-2027 and only ever ADDS a day. When La Mercè falls on a Sunday
  // the city keeps it on Monday the 25th (2023; next in 2028): `merceMonday`,
  // the same move as Koningsdag in nl. The two local days are set each June
  // by mayoral decree: re-check yearly. Keyed apart from `country`, which
  // also drives the +34 phone reading in api/_market.js.
  'es-bcn': { fixed: ['01-01', '01-06', '05-01', '06-24', '08-15', '09-11', '09-24', '10-12', '11-01', '12-06', '12-08', '12-25', '12-26'], easter: [-2, 1, 50], merceMonday: true }
};
// the calendar keys a desk may name (CITY_MARKETS.<slug>.holidays || country):
// an unknown key would silently fall back to Italy alone, so tests pin it
export const HOLIDAY_KEYS = Object.keys(HOLIDAYS);
export function isDeskHoliday(date, country) {
  const y = date.getUTCFullYear();
  const mmdd = date.toISOString().slice(5, 10);
  const [em, ed] = easterOf(y);
  for (const c of ['it', country]) {
    const h = HOLIDAYS[c];
    if (!h) continue;
    if (h.fixed.includes(mmdd)) return true;
    if (h.kingsDay && mmdd === '04-26' && new Date(Date.UTC(y, 3, 27)).getUTCDay() === 0) return true;
    if (h.merceMonday && mmdd === '09-25' && new Date(Date.UTC(y, 8, 24)).getUTCDay() === 0) return true;
    for (const off of h.easter) {
      const d = new Date(Date.UTC(y, em - 1, ed + off));
      if (d.toISOString().slice(5, 10) === mmdd) return true;
    }
  }
  return false;
}
const workingDay = (d, country) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !isDeskHoliday(d, country);

export function withdrawalWindow(concludedEpoch, country = null) {
  const at = new Date((Number(concludedEpoch) || 0) * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  const day = (n) => new Date(Date.UTC(parts.year, parts.month - 1, parts.day + n));
  const iso = (d) => d.toISOString().slice(0, 10);
  const label = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  let n = 14;
  while (!workingDay(day(n), country)) n++;
  const last = day(n);
  let s = n + 1;
  while (!workingDay(day(s), country)) s++;
  const start = day(s);
  return { lastDay: iso(last), lastLabel: label(last), startDay: iso(start), startLabel: label(start) };
}
// kept for callers that only want the last day of the period
export const withdrawalEnds = (concludedEpoch) => withdrawalWindow(concludedEpoch).lastLabel;

// The file number of a paid city order (v1.4): ONE number per person. The
// checkout carries metadata.file_ref — the lead /api/city-lead opened for
// this visitor (city_<requestId>) — and its number is reused only when that
// lead EXISTS and belongs to the SAME city (a reference from another desk,
// or one that names nothing, never lends its number). Otherwise the number
// is derived from the paid lead's own id. fsGet, not the local readDoc:
// `city` is a nested map, and readDoc flattens maps to null.
const FILE_REF_RE = /^city_[a-z0-9_]{8,48}$/;
async function cityFileFor(svcId, cityKey, fileRef) {
  if (fileRef && FILE_REF_RE.test(fileRef)) {
    try {
      const opened = await fsGet('leads/' + fileRef);
      const f = opened && opened.market === cityKey && opened.city && typeof opened.city.file === 'string' ? opened.city.file : null;
      if (f && /^BM [A-Z2-9]{5}$/.test(f)) return { file: f, fileLeadId: fileRef };
    } catch (e) { console.warn('[service] file_ref read failed:', e && e.message); }
  }
  return { file: SCALO.fileCode(svcId), fileLeadId: null };
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
    ? { ...(CITY_SERVICE_META[m.kind] || { emoji: '✓' }), title: `${cityDesk.label} — ${cityPlan ? cityPlan.label : (m.kind || 'order')}`, city: cityDesk }
    : (SERVICE_META[m.kind] || { title: m.kind || 'Service', emoji: '✓' });
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
  const cityFile = cityDesk ? await cityFileFor(svcId, cityKey, typeof m.file_ref === 'string' ? m.file_ref : '') : null;
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
    phone,
    listingName: m.listing || '',
    message: cityDesk
      ? `${`${cityDesk.label.toUpperCase()} — paid order · ${cityPlan ? cityPlan.label : m.kind} · €${amountEur} paid. ${startLine ? startLine + ' ' : ''}${m.listing ? 'Property: ' + m.listing + '. ' : ''}${m.notes ? 'Notes: ' + m.notes + '. ' : ''}`.trim()} · file ${cityFile.file}`
      : `${meta.title} bought one-tap (€${amountEur}). ${m.listing ? 'Property: ' + m.listing + '. ' : ''}${m.notes ? 'Notes: ' + m.notes + '. ' : ''}${m.start_now === '1' ? 'Ha chiesto di iniziare subito (recesso: art. 50 c.3 Cod. cons.).' : m.start_now === '0' ? 'NON ha chiesto di iniziare subito: si comincia allo scadere dei 14 giorni del recesso.' : ''}`,
    amount_paid: session.amount_total || 0,
    amount_eur: amountEur,
    currency: session.currency || 'eur',
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
  if (w && w.exists) {
    // Retry di Stripe su una sessione già processata: le email non si
    // rimandano. Ma se il primo giro è morto prima di registrare l'esito
    // dell'email al cliente (né inviata né fallita) l'operatore lo deve
    // sapere: avviso idempotente (id deterministico), mai su un primo giro
    // che potrebbe essere ancora in volo (90s).
    try {
      const prev = await readDoc('leads/' + svcId);
      const born = Date.parse((prev && prev.createdAt) || '');
      if (prev && !prev.clientEmailSentAt && !prev.clientEmailFailedAt && Number.isFinite(born) && Date.now() - born > 90000) {
        await writeDoc('agentNotifications', 'svc-mail-' + docId, {
          type: 'service.client_email_failed',
          summary: `📭 Ordine pagato ${svcId}: nessuna traccia dell'email di conferma al cliente — verificare e mandarla a mano${prev.market && prev.market !== 'roma' ? ', col testo del recesso' : ''}.`,
          priority: 'high', status: 'pending', actor: 'stripe-webhook',
          ref: { collection: 'leads', id: svcId },
          dedupKey: 'svc-mail-' + docId, createdAt: new Date().toISOString(), attempts: 0,
        });
      }
    } catch (_) {}
    return res.status(200).json({ received: true, duplicate: true, serviceLeadId: svcId });
  }

  const firstName = (m.name || '').split(' ')[0] || 'there';
  try {
    await sendEmailJS({
      to_email: 'valentino@boom-rome.com',
      heading: `${meta.emoji} ${meta.title.toUpperCase()} — €${amountEur} paid`,
      subheading: m.name || 'New service purchase',
      name: 'Valentino',
      intro: meta.city
        ? `A paid order from the ${meta.city.label} desk — ${meta.title}. The page promises a message in the desk's first open hour (Mon–Fri 09:00–19:00, Rome time).${cityStart === '1' ? ' The client asked to start now.' : cityStart === '0' ? ` The client did NOT ask to start now: their withdrawal period runs to the end of ${win.lastLabel}, so the brief and the work begin on ${win.startLabel} (an acknowledgement before then is fine; starting earlier needs their written request).` : ''} The page promised an invoice from Egidi Immobiliare S.r.l., VAT included: issue it.${meta.city.slug === 'barcelona' ? ' Barcelona: on request the client gets the order, terms and invoice in Catalan or Spanish and the official complaint forms (fulls oficials de reclamació); a complaint is answered within one month.' : ''}`
        : `Someone just bought ${meta.title} with one tap. Clock is running — the page promises first contact fast.`,
      card_color: '#D4AF37',
      card_title: meta.title,
      r1_icon: '👤', r1_label: 'Client', r1_value: m.name || '—',
      r2_icon: '📧', r2_label: 'Email', r2_value: email || '—',
      r3_icon: '📱', r3_label: 'Phone', r3_value: phone || '—',
      r4_icon: meta.city ? '🏙' : '🏠', r4_label: meta.city ? 'Desk' : 'Property', r4_value: meta.city ? `${meta.city.label}${m.listing ? ' · ' + m.listing : ''}` : (m.listing || '—'),
      closing: `Paid €${amountEur}. ${cityFile ? `Your file: ${cityFile.file}. ` : ''}${m.notes ? 'Notes: ' + m.notes + '. ' : ''}Stripe: ${session.id}. Record: leads/${svcId}.`,
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
        ? `Pagamento ricevuto — €${amountEur}, via Stripe. Ecco esattamente cosa succede adesso:`
        : cityStart === '0'
          // no "Start now" tick: the steps below begin when the withdrawal
          // period ends — the email must not read as if they start today
          ? `Payment received — €${amountEur}, Stripe-secured. Here's what happens from ${win.startLabel}, the day after your 14-day withdrawal period ends:`
          : `Payment received — €${amountEur}, Stripe-secured. Here's exactly what happens next:`,
      card_color: '#D4AF37',
      card_title: it ? 'I prossimi passi' : 'What happens next',
      r1_icon: '✓', r1_label: (meta.next1 || ['We take it from here'])[0], r1_value: (meta.next1 || ['', 'Right away'])[1],
      r2_icon: '✓', r2_label: (meta.next2 || ['—'])[0], r2_value: (meta.next2 || ['', ''])[1],
      r3_icon: '✓', r3_label: (meta.next3 || ['—'])[0], r3_value: (meta.next3 || ['', ''])[1],
      r4_icon: '✓', r4_label: (meta.next4 || ['—'])[0], r4_value: (meta.next4 || ['', ''])[1],
      // a city order names its file number first: the same "BM XXXXX" the
      // page's ticket and the operator's summary print
      closing: (cityFile ? `Your file: ${cityFile.file}. ` : '') + (it
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
            + `To withdraw within 14 days of payment, email hello@boom-rome.com or use the model withdrawal form at ${WITHDRAWAL_FORM_URL}?desk=${encodeURIComponent(meta.city.label)}&service=${encodeURIComponent(m.kind || '')} (its text is at the end of this email). If we started at your request and you withdraw, we refund the price minus the work already done; once the service is fully performed, the right to withdraw ends. The invoice from Egidi Immobiliare S.r.l., VAT included, follows by email. Anything else — reply to this email or message us on WhatsApp. ` + OFFICE_HOURS_EN + ' ' + WITHDRAWAL_FORM_TEXT
          : 'Anything at all — reply to this email or message us on WhatsApp. ' + OFFICE_HOURS_EN),
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
        summary: `📭 ${meta.title}${meta.city ? ' · ' + meta.city.label : ''} — €${amountEur} PAGATI da ${m.name || email || '?'}, ma l'email di conferma al cliente NON è partita (${clientMail}): mandala a mano${meta.city ? ', col testo del recesso' : ''}.`,
        priority: 'high', status: 'pending', actor: 'stripe-webhook',
        ref: { collection: 'leads', id: svcId },
        dedupKey: 'svc-mail-' + docId, createdAt: new Date().toISOString(), attempts: 0,
      });
    } catch (_) {}
  }

  return res.status(200).json({ received: true, serviceLeadId: svcId, clientEmail: clientMail === 'sent' ? 'sent' : 'failed' });
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
  if (email) {
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
async function handleMoneyBack(res, event) {
  const o = event.data.object || {};
  const eur = n => '€' + (Math.round(n || 0) / 100).toLocaleString('it-IT');
  const when = e => e ? new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long' }).format(new Date(e * 1000)) : '—';

  let text = '';
  let priority = 'normal';
  if (event.type === 'charge.refunded') {
    const who = (o.billing_details && (o.billing_details.name || o.billing_details.email)) || '—';
    const full = (o.amount_refunded || 0) >= (o.amount || 0);
    text = `↩️ <b>RIMBORSO ${full ? 'totale' : 'parziale'}: ${eur(o.amount_refunded)}</b>\n`
      + `${who} · addebito ${eur(o.amount)}\n`
      + `https://dashboard.stripe.com/payments/${o.payment_intent || o.id}`;
  } else if (event.type === 'charge.dispute.created') {
    priority = 'high';
    const dueBy = o.evidence_details && o.evidence_details.due_by;
    text = `🚨 <b>CONTESTAZIONE (dispute): ${eur(o.amount)}</b>\n`
      + `Motivo: ${o.reason || '—'}\n`
      + `⏰ Rispondi con le prove <b>entro il ${when(dueBy)}</b> — senza risposta l'importo è perso.\n`
      + `https://dashboard.stripe.com/disputes/${o.id}`;
  } else {
    const esito = o.status === 'won' ? 'VINTA ✓' : o.status === 'lost' ? 'PERSA ✗' : (o.status || 'chiusa');
    text = `⚖️ Dispute ${esito} — ${eur(o.amount)}\nhttps://dashboard.stripe.com/disputes/${o.id}`;
  }

  let w = null;
  try {
    w = await writeDoc('agentNotifications', 'stripe-' + String(event.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40), {
      type: 'stripe.' + event.type,
      summary: text.replace(/<[^>]+>/g, '').split('\n').slice(0, 2).join(' · '),
      priority, status: 'pending', actor: 'stripe-webhook',
      dedupKey: 'stripe-' + event.id, createdAt: new Date().toISOString(), attempts: 0,
    });
  } catch (e) { console.error('[moneyback] notify write:', e.message); }
  if (w && w.exists) return res.status(200).json({ received: true, duplicate: true });

  try { await tgNotify(text); } catch (e) { console.error('[moneyback] telegram:', e.message); }
  return res.status(200).json({ received: true, moneyback: event.type });
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
