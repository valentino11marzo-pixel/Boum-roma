// api/ask-listing.js
// Public AI concierge for ONE listing. The visitor asks a question about the
// apartment; we fetch that listing server-side (trusted facts — the client can
// never inject fake apartment data), then ask Claude Haiku to answer using the
// facts + BOOM's real policies.
//
// Hardened like parse-docs.js, but public (no bearer): per-IP rate limit,
// model pinned, max_tokens capped, input length capped, body field-whitelisted.
// Fails SOFT — on any error it returns a friendly WhatsApp fallback, never a 5xx
// that would break the chat UX.

import { ai } from './_ai.js';
import FACTS from '../js/listing-facts.js';
import DISPO from '../js/dispo-engine.js';

// Fuori mercato per scelta dell'operatore (stessa lista di api/listing.js).
const HIDDEN = /hidden|draft|archived|off_market/i;

// 15/10/2026 — le politiche qui sotto sono quelle che il codice applica
// davvero: onorario 10% del canone annuo + IVA 22% (api/preagreement/
// create.js), deposito versato AL LOCATORE come scrive il contratto tipo
// (js/contract-pdf.js, art. «Deposito cauzionale»), utenze incluse solo
// dove l'operatore l'ha dichiarato (billsIncluded nei fatti), assistenza in
// orario d'ufficio — nessuna promessa di tempi di risposta in numeri.

export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
// Public Firebase web API key (same default the client + api/listing.js use).
const FB_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';

const MAX_TOKENS = 500;   // il modello sta nel registro (js/ai-registry.js, 'listing.ask')
const Q_MAX = 600;       // max question length (chars)
const A_HIST_MAX = 1500; // max remembered answer length per turn
const HIST_TURNS = 6;    // max prior turns considered
const RATE_MAX = 12;     // requests / window / IP
const RATE_WINDOW_MS = 60_000;

const WHATSAPP = '+39 331 325 1961';
const FALLBACK = `I couldn't reach our AI just now. Message BOOM on WhatsApp at ${WHATSAPP}, or apply on this page — a person replies during office hours (Rome time); messages sent out of hours are answered the next working morning.`;

const rl = new Map(); // ip -> { c, t }
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
function rateOk(ip) {
  const now = Date.now();
  const e = rl.get(ip);
  if (!e || now - e.t >= RATE_WINDOW_MS) {
    rl.set(ip, { c: 1, t: now });
    if (rl.size > 2000) { const cut = now - 2 * RATE_WINDOW_MS; for (const [k, v] of rl) if (v.t < cut) rl.delete(k); }
    return true;
  }
  e.c += 1;
  return e.c <= RATE_MAX;
}

// Firestore REST value -> plain JS (same shape as api/listing.js).
function fv(v) {
  if (v == null) return undefined;
  const k = Object.keys(v)[0];
  const x = v[k];
  switch (k) {
    case 'integerValue':
    case 'doubleValue': return Number(x);
    case 'booleanValue': return x;
    case 'nullValue': return null;
    case 'arrayValue': return ((x && x.values) || []).map(fv);
    case 'mapValue': { const o = {}; const f = (x && x.fields) || {}; for (const kk in f) o[kk] = fv(f[kk]); return o; }
    default: return x;
  }
}
async function adminToken() {
  const email = process.env.FIREBASE_ADMIN_EMAIL, password = process.env.FIREBASE_ADMIN_PASS;
  if (!email || !password) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const d = await r.json();
    return d.idToken || null;
  } catch { return null; }
}
async function readListing(id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings/${encodeURIComponent(id)}?key=${FB_KEY}`;
  let r = await fetch(url);
  if (r.status === 403) { const t = await adminToken(); if (t) r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } }); }
  if (!r.ok) return null;
  const doc = await r.json();
  const f = doc.fields || {};
  const d = {};
  for (const k in f) d[k] = fv(f[k]);
  return d;
}

function buildContext(d) {
  const pick = (...keys) => { for (const k of keys) if (d[k] != null && d[k] !== '') return d[k]; return undefined; };
  const lines = [];
  lines.push(`Name: ${pick('name') || 'This apartment'}`);
  const zone = pick('zone', 'neighborhood'); if (zone) lines.push(`Neighborhood: ${zone}, Rome`);
  const price = pick('price'); if (price) lines.push(`Monthly rent: €${Number(price).toLocaleString('en-US')}`);
  // le camere con la regola unica (js/listing-facts.js): `pick('beds',
  // 'bedrooms')` dava al modello il testo libero del bot — «Bedrooms: Living
  // , 1 bedroom with balcony , 1 bedroom…» su Capri (2 camere), «Bedrooms:
  // 3» sul bilocale di Via dei Cappellari. 0 = monolocale: si tace.
  const beds = FACTS.bedroomsOf(d); if (beds) lines.push(`Bedrooms: ${beds}`);
  if (d.bathrooms != null) lines.push(`Bathrooms: ${d.bathrooms}`);
  const sqm = pick('sqm', 'size'); if (sqm) lines.push(`Size: ${sqm} m²`);
  if (d.floor) lines.push(`Floor: ${d.floor}`);
  if (d.type) lines.push(`Type: ${d.type}`);
  if (d.furnished != null && d.furnished !== '') lines.push(`Furnished: ${d.furnished}`);
  // La disponibilità VERA è la corsia (dispo-engine), la stessa della scheda
  // e del JSON-LD: senza, il modello vedeva solo il testo libero e non poteva
  // sapere che una casa è occupata — e prometteva le 48 ore. Il testo
  // dell'operatore resta, dichiarato per quello che è.
  const lane = DISPO.marketLane(d);
  const laneTxt = HIDDEN.test(String(d.status || ''))
    ? 'Not currently on the market.'
    : DISPO.laneCopy(lane, 'en').long + (lane.iso ? ' (release date ' + lane.iso + ')' : '');
  lines.push(`Availability: ${laneTxt}`);
  if (d.availableDate) lines.push(`Availability note (operator text): ${d.availableDate}`);
  // fatti dichiarati dall'operatore, non dedotti dalla descrizione
  lines.push(`billsIncluded: ${FACTS.billsIncluded(d)}`);
  const depM = pick('depositMonths'); if (depM != null) lines.push(`depositMonths: ${depM}`);
  if (price) lines.push(`Agency fee for this home: €${FACTS.agencyFeeEur(price).toLocaleString('en-US')} incl. VAT, once (${FACTS.FEE_EN})`);
  if (Array.isArray(d.features) && d.features.length) lines.push(`Features & amenities: ${d.features.slice(0, 40).join(', ')}`);
  if (Array.isArray(d.tags) && d.tags.length) lines.push(`Tags: ${d.tags.slice(0, 20).join(', ')}`);
  if (d.description) lines.push(`Description: ${String(d.description).slice(0, 1600)}`);
  return lines.join('\n');
}

const SYSTEM = `You are the BOOM concierge for one specific rental apartment in Rome. You speak for BOOM (boomrome.com), a premium, transparency-first rental agency.

Answer the visitor's question about THIS apartment — warmly, concisely (2-5 sentences), and honestly. Use ONLY the apartment facts provided plus the BOOM policies below. Never invent specifics (exact address, precise availability, floor, size, price) that aren't in the facts; if asked for something not provided, say you'll connect them with the team.

BOOM policies (always true):
- Agency fee: 10% of one year's rent plus 22% VAT, charged once at signing; the exact figure is on this home's page and in the pre-agreement before anything is paid.
- Security deposit: the number of months written in this home's pre-agreement (depositMonths in the facts when set; if it is not set, say the team will confirm it). Italian law caps it at three months' rent (art. 11, L. 392/1978). It is paid to and held by the landlord under the lease and returned at the end of the tenancy, after the home's condition and the lease obligations are checked; the home's condition is recorded at check-in in a signed handover report (verbale di consegna) and checked against it at move-out.
- Move-in: as fast as 48 hours from approval when the home is free now (the Availability line in the facts says whether it is); occupied homes can be reserved ahead for their release date. No fee to apply.
- Support: a person replies on WhatsApp during office hours (Rome time); messages sent out of hours are answered the next working morning. Gas, fire or flooding: call 112 first, then WhatsApp us.
- Contract: Italy's official standard-form lease, registered with the Agenzia delle Entrate and explained in English; the pre-agreement, signing page, receipts and support are in English.
- Lease length: every lease through BOOM is at least 3 months (Terms of service); a transitional lease runs up to 18 months. If someone needs less than 3 months, say BOOM can't offer that stay — never confirm a shorter one.
- Payments: securely via Stripe, by card, in English.
- Reserve & hold: from €300, fully refundable, deducted from your first month — takes the home off-market while we process your application.
- Bills: whether they are included is stated for this home (billsIncluded in the facts). Where they are not, electricity, water, gas, internet, TARI and condo fees are billed separately and we help you set them up.
- Every listing is walked in person by the BOOM team. WhatsApp support in English during office hours.

For viewings, exact availability, or anything you don't know: invite them to apply (the form on this page) or message BOOM on WhatsApp at ${WHATSAPP}. If the question isn't about this apartment, renting with BOOM, or living in Rome, gently steer back. Plain text only — no markdown, no headers, no bullet symbols.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  const origin = req.headers.origin;
  if (origin && (/^https:\/\/(www\.)?boomrome\.com$/.test(origin) || /\.vercel\.app$/.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ answer: FALLBACK });

  const ip = clientIp(req);
  if (!rateOk(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(200).json({ answer: `You're asking fast! Give me a few seconds — or message us on WhatsApp at ${WHATSAPP} and we'll jump right in.` });
  }

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const id = String(body.id || '').trim().slice(0, 200);
  const question = String(body.question || '').trim().slice(0, Q_MAX);
  if (!id || !question) return res.status(400).json({ error: 'Missing id or question' });

  let context = '';
  try { const d = await readListing(id); if (d) context = buildContext(d); } catch { /* answer from policy */ }

  const messages = [];
  if (Array.isArray(body.history)) {
    for (const h of body.history.slice(-HIST_TURNS)) {
      if (h && typeof h.q === 'string' && typeof h.a === 'string') {
        messages.push({ role: 'user', content: h.q.slice(0, Q_MAX) });
        messages.push({ role: 'assistant', content: h.a.slice(0, A_HIST_MAX) });
      }
    }
  }
  messages.push({
    role: 'user',
    content: `Apartment facts:\n${context || '(facts unavailable — answer from BOOM policy and invite them to ask the team for specifics)'}\n\nVisitor question: ${question}`,
  });

  try {
    const r = await ai({ purpose: 'listing.ask', system: SYSTEM, messages, maxTokens: MAX_TOKENS, timeoutMs: 20000 });
    return res.status(200).json({ answer: r.text || FALLBACK });
  } catch {
    return res.status(200).json({ answer: FALLBACK });
  }
}
