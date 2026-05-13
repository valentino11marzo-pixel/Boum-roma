// api/recent-signed.js
// Returns a scrubbed list of recently-signed contracts for the concierge
// "peer proof" micro-card. Joins:
//   contracts → listings|properties (for zone+type)
//   contracts → users (for firstName + origin/nationality)
//
// Per-entry graceful fallback: if zone can't be resolved, the entry is dropped
// silently; if the users join fails, the entry returns without firstName/origin
// (the page falls back to a "type in zone · N days ago" form).
//
// 5-minute in-memory cache. CORS-restricted GET.

import * as fsdb from './_lib/firestore.js';

const ALLOWED_ORIGINS = new Set([
  'https://boomrome.com',
  'https://www.boomrome.com',
]);

const CACHE_TTL_MS = 5 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 10;

let _cache = null;
let _cacheAt = 0;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function log(event, extra = {}) {
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'recent-signed', event, ...extra })); } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function firstNameOnly(full) {
  if (typeof full !== 'string') return null;
  const f = full.trim().split(/\s+/)[0];
  if (!f) return null;
  return f.length > 12 ? f.slice(0, 12) : f;
}

// Strip noisy nationality strings to a short origin hint. We accept ISO-style
// codes ("DE", "IT"), country names, or city-of-origin if stored that way.
function originHint(...candidates) {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const s = c.trim();
    if (!s) continue;
    if (/^[a-z\s\-']+$/i.test(s) && s.length >= 2 && s.length <= 24) return s;
  }
  return null;
}

async function resolveZoneAndType(propertyId) {
  if (!propertyId) return null;
  try {
    const fromListings = await fsdb.readDoc(`listings/${propertyId}`);
    if (fromListings && fromListings.zone) {
      return { zone: fromListings.zone, type: fromListings.type || null };
    }
  } catch (err) {
    log('listings-read-err', { propertyId, message: err.message });
  }
  try {
    const fromProperties = await fsdb.readDoc(`properties/${propertyId}`);
    if (fromProperties && fromProperties.zone) {
      return { zone: fromProperties.zone, type: fromProperties.type || fromProperties.propertyType || null };
    }
  } catch (err) {
    log('properties-read-err', { propertyId, message: err.message });
  }
  return null;
}

async function resolveUser(tenantId) {
  if (!tenantId) return null;
  // Try common user-collection names. Firestore returns null on 404, so the
  // misses are cheap.
  for (const col of ['users', 'clients']) {
    try {
      const u = await fsdb.readDoc(`${col}/${tenantId}`);
      if (u) return u;
    } catch (err) {
      log('user-read-err', { col, tenantId, message: err.message });
    }
  }
  return null;
}

function daysAgo(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

// ─── Build ──────────────────────────────────────────────────────────────

async function build() {
  // Pull more than we need; some will be filtered by date/status/zone-resolve.
  const docs = await fsdb.runQuery({
    collection: 'contracts',
    orderBy: { field: { fieldPath: 'tenantSignedAt' }, direction: 'DESCENDING' },
    limit: 30,
  });

  const cutoff = Date.now() - SIXTY_DAYS_MS;
  const candidates = docs.filter(d => {
    if (!d.tenantSignedAt) return false;
    if (d.signatureStatus === 'none') return false;
    const t = new Date(d.tenantSignedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  const items = [];
  for (const c of candidates) {
    if (items.length >= MAX_ITEMS) break;
    const place = await resolveZoneAndType(c.propertyId);
    if (!place || !place.zone) continue; // drop silently

    let firstName = null, origin = null;
    const u = await resolveUser(c.tenantId);
    if (u) {
      firstName = firstNameOnly(u.name || u.fullName || u.firstName) || null;
      origin = originHint(u.origin, u.city, u.cityOfOrigin, u.nationality, c.tenantNationality, c.tenantPob);
    } else {
      origin = originHint(c.tenantNationality, c.tenantPob);
    }

    items.push({
      zone: place.zone,
      type: place.type || null,
      daysAgo: daysAgo(c.tenantSignedAt),
      firstName: firstName || null,
      origin: origin || null,
    });
  }
  return items;
}

// ─── Handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ items: _cache, cached: true });
  }

  try {
    const items = await build();
    _cache = items;
    _cacheAt = now;
    log('ok', { count: items.length });
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ items, cached: false });
  } catch (err) {
    log('error', { message: err.message });
    if (_cache) {
      // Serve stale on error
      res.setHeader('Cache-Control', 'public, max-age=30');
      return res.status(200).json({ items: _cache, cached: true, stale: true });
    }
    return res.status(500).json({ error: 'recent-signed failed', detail: err.message });
  }
}
