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

export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
// Public Firebase web API key (same default the client + api/listing.js use).
const FB_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 500;
const Q_MAX = 600;       // max question length (chars)
const A_HIST_MAX = 1500; // max remembered answer length per turn
const HIST_TURNS = 6;    // max prior turns considered
const RATE_MAX = 12;     // requests / window / IP
const RATE_WINDOW_MS = 60_000;

const WHATSAPP = '+39 331 325 1961';
const FALLBACK = `I couldn't reach our AI just now — but our team can answer instantly. Message BOOM on WhatsApp at ${WHATSAPP}, or apply on this page and we'll reply within 2 hours.`;

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
  const beds = pick('beds', 'bedrooms'); if (beds != null) lines.push(`Bedrooms: ${beds}`);
  if (d.bathrooms != null) lines.push(`Bathrooms: ${d.bathrooms}`);
  const sqm = pick('sqm', 'size'); if (sqm) lines.push(`Size: ${sqm} m²`);
  if (d.floor) lines.push(`Floor: ${d.floor}`);
  if (d.type) lines.push(`Type: ${d.type}`);
  if (d.furnished) lines.push(`Furnished: ${d.furnished}`);
  if (d.availableDate) lines.push(`Available from: ${d.availableDate}`);
  if (Array.isArray(d.features) && d.features.length) lines.push(`Features & amenities: ${d.features.slice(0, 40).join(', ')}`);
  if (Array.isArray(d.tags) && d.tags.length) lines.push(`Tags: ${d.tags.slice(0, 20).join(', ')}`);
  if (d.description) lines.push(`Description: ${String(d.description).slice(0, 1600)}`);
  return lines.join('\n');
}

const SYSTEM = `You are the BOOM concierge for one specific rental apartment in Rome. You speak for BOOM (boomrome.com), a premium, transparency-first rental agency.

Answer the visitor's question about THIS apartment — warmly, concisely (2-5 sentences), and honestly. Use ONLY the apartment facts provided plus the BOOM policies below. Never invent specifics (exact address, precise availability, floor, size, price) that aren't in the facts; if asked for something not provided, say you'll connect them with the team.

BOOM policies (always true):
- Agency fee: either one month's rent, OR 10% of the annual rent — it varies by apartment, and we always tell you which before you sign.
- Security deposit: one month, fully refundable, held safe with guarantees under Italian law, returned at move-out minus only documented damage.
- Move-in: as fast as 48 hours. We reply within 2 hours. No fee to apply.
- Contract: a legal, registered Italian lease, available in English.
- Payments: securely via Stripe, by card, in English.
- Reserve & hold: from €300, fully refundable, deducted from your first month — takes the home off-market while we process your application.
- Utilities (electricity, water, gas, internet, TARI waste tax, condo fees) are billed separately to you; we help you set them all up.
- Every listing is video-verified. No hidden fees. 24/7 WhatsApp support.

For viewings, exact availability, or anything you don't know: invite them to apply (the form on this page) or message BOOM on WhatsApp at ${WHATSAPP}. If the question isn't about this apartment, renting with BOOM, or living in Rome, gently steer back. Plain text only — no markdown, no headers, no bullet symbols.`;

function answerFrom(data) {
  if (!data || !Array.isArray(data.content)) return '';
  return data.content.filter(b => b && b.type === 'text').map(b => b.text).join('').trim();
}

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
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, messages }),
    });
    const data = await upstream.json().catch(() => null);
    const answer = answerFrom(data);
    return res.status(200).json({ answer: answer || FALLBACK });
  } catch {
    return res.status(200).json({ answer: FALLBACK });
  }
}
