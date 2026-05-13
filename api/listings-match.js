// api/listings-match.js
// Deterministic Firestore listings match. Used by the concierge state machine
// at the MATCH state. NO LLM in this path — page POSTs lead snapshot, server
// queries Firestore via api/_lib/firestore.js, returns scrubbed top-3 matches.
//
// Multi-zone string handling: a listing with zone "Africano/Trieste" matches a
// lead whose zone is "Trieste" (substring match on `/`-tokenized zones). Same
// for "Centro Storico" if listings use that exact name. Exact-match preferred,
// substring-match accepted as fallback.

import * as fsdb from './_lib/firestore.js';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };

const ALLOWED_ORIGINS = new Set([
  'https://boomrome.com',
  'https://www.boomrome.com',
]);

const RATE_MIN_MAX = 30;
const RATE_MIN_WINDOW_MS = 60_000;
const rateMin = new Map();

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRate(ip) {
  const now = Date.now();
  const e = rateMin.get(ip);
  if (!e || now - e.windowStart >= RATE_MIN_WINDOW_MS) {
    rateMin.set(ip, { count: 1, windowStart: now });
    return true;
  }
  e.count += 1;
  return e.count <= RATE_MIN_MAX;
}

function log(event, extra = {}) {
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'listings-match', event, ...extra })); } catch {}
}

// ─── Match logic ─────────────────────────────────────────────────────────

function pickInt(...values) {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function scrubListing(d) {
  const sqm = pickInt(d.sqm, d.size);
  const beds = pickInt(d.beds, d.bedrooms);
  const ad = d.availableDate || d.availableFrom || '';
  const availableFrom = /^\d{4}-\d{2}-\d{2}/.test(ad) ? ad.slice(0, 10) : ad;
  return {
    id: d.id,
    type: d.type || 'apartment',
    zone: d.zone || '',
    sqm,
    beds,
    bathrooms: typeof d.bathrooms === 'number' ? d.bathrooms : null,
    price: typeof d.price === 'number' ? d.price : null,
    available_from: availableFrom,
    features: Array.isArray(d.features) ? d.features.slice(0, 8) : [],
    furnished: d.furnished || null,
    duration_min: 1,
    duration_max: 18,
  };
}

// Zone-string match: exact equality preferred, "/"-tokenized substring match
// accepted (so listing zone "Africano/Trieste" matches lead.zone "Trieste").
function zoneMatches(listingZone, leadZone) {
  const lz = String(listingZone || '').toLowerCase().trim();
  const wz = String(leadZone || '').toLowerCase().trim();
  if (!lz || !wz) return false;
  if (lz === wz) return true;
  if (lz.includes('/')) {
    return lz.split('/').map(s => s.trim()).includes(wz);
  }
  return false;
}

async function matchedListings({ zone, budget_max }) {
  const docs = await fsdb.runQuery({
    collection: 'listings',
    where: fsdb.filter.eq('status', 'available'),
    limit: 80,
  });

  const budgetCap = typeof budget_max === 'number' ? budget_max + 150 : null;

  let pool = docs.filter(d => {
    if (zone && !zoneMatches(d.zone, zone)) return false;
    if (budgetCap != null && typeof d.price === 'number' && d.price > budgetCap) return false;
    return true;
  });

  // Sort by closeness to stated budget (if known), else by price ascending.
  if (typeof budget_max === 'number') {
    pool.sort((a, b) =>
      Math.abs((a.price ?? 0) - budget_max) -
      Math.abs((b.price ?? 0) - budget_max));
  } else {
    pool.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  }

  return pool.slice(0, 3).map(scrubListing);
}

// ─── Handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  if (!checkRate(ip)) {
    log('reject', { reason: 'rate', ip });
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }

  const body = req.body || {};
  const zone = typeof body.zone === 'string' ? body.zone.slice(0, 64) : '';
  const budget_max = typeof body.budget_max === 'number' ? body.budget_max : null;

  if (!zone && budget_max == null) {
    return res.status(400).json({ error: 'zone or budget_max required' });
  }

  try {
    const t0 = Date.now();
    const matches = await matchedListings({ zone, budget_max });
    log('ok', { ip, ms: Date.now() - t0, zone, budget_max, count: matches.length });
    return res.status(200).json({ matches });
  } catch (err) {
    log('error', { message: err.message });
    return res.status(500).json({ error: 'match failed', detail: err.message });
  }
}
