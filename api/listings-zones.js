// api/listings-zones.js
// Returns the distinct list of zones currently available in inventory. Used by
// the concierge ZONE state to surface real-inventory zone chips alongside the
// brand-marquee zones. 5-minute in-memory cache.

import * as fsdb from './_lib/firestore.js';

const ALLOWED_ORIGINS = new Set([
  'https://boomrome.com',
  'https://www.boomrome.com',
]);

const CACHE_TTL_MS = 5 * 60 * 1000;

let _cache = null;
let _cacheAt = 0;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

function log(event, extra = {}) {
  try { console.log(JSON.stringify({ ts: new Date().toISOString(), src: 'listings-zones', event, ...extra })); } catch {}
}

async function build() {
  const docs = await fsdb.runQuery({
    collection: 'listings',
    where: fsdb.filter.eq('status', 'available'),
    limit: 100,
  });
  // Distinct, sorted, trimmed. Keep multi-zone strings as-is — the page
  // tokenizes them when matching against a single-zone lead.
  const set = new Set();
  for (const d of docs) {
    const z = (d.zone || '').trim();
    if (z) set.add(z);
  }
  return [...set].sort();
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ zones: _cache, cached: true });
  }

  try {
    const zones = await build();
    _cache = zones;
    _cacheAt = now;
    log('ok', { count: zones.length });
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ zones, cached: false });
  } catch (err) {
    log('error', { message: err.message });
    if (_cache) {
      res.setHeader('Cache-Control', 'public, max-age=30');
      return res.status(200).json({ zones: _cache, cached: true, stale: true });
    }
    return res.status(500).json({ error: 'listings-zones failed', detail: err.message });
  }
}
