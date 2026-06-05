// api/geocode-all.js
// One-shot geocoder used to BAKE accurate listing coordinates into
// js/listing-coords.js. Reads every listing from Firestore, geocodes its
// address via Nominatim (server-side — Vercel egress is unrestricted),
// and returns { id: [lng, lat] }. Heavily edge-cached; intended to be run
// occasionally, its output committed as a static file the map reads.
//
// ── Access ────────────────────────────────────────────────────────────────
// This is an ADMIN one-shot tool, NOT a public endpoint. It is gated behind a
// shared secret so it can't be used to amplify outbound Nominatim traffic /
// hold serverless functions open (cost + DoS vector). Provide the secret as
// either an Authorization: Bearer header or a ?key= query param:
//
//   curl -H "Authorization: Bearer $GEOCODE_SECRET" https://www.boomrome.com/api/geocode-all
//   curl "https://www.boomrome.com/api/geocode-all?key=$GEOCODE_SECRET"
//
// Then paste `coords` into js/listing-coords.js.
//
// Required env: GEOCODE_SECRET (admin secret), FIREBASE_API_KEY, optionally
// FIREBASE_PROJECT_ID.

import crypto from 'node:crypto';

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const UA = 'BOOMRome/1.0 (+https://www.boomrome.com; valentino11marzo@gmail.com)';

const sv = (f, k) => (f && f[k] && f[k].stringValue) || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Constant-time secret comparison (avoids timing side-channels).
function safeEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function getProvidedSecret(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  const q = (req.query && (req.query.key || req.query.secret)) || '';
  return typeof q === 'string' ? q : '';
}

async function geocode(query) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&email=valentino11marzo@gmail.com&q=' + encodeURIComponent(query);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'it,en' } });
  if (!r.ok) return null;
  const j = await r.json();
  if (Array.isArray(j) && j[0] && j[0].lat && j[0].lon) {
    return [Number(j[0].lon), Number(j[0].lat)];
  }
  return null;
}

export default async function handler(req, res) {
  // ── Fail closed if misconfigured ──
  const secret = process.env.GEOCODE_SECRET;
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!secret || !apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: GEOCODE_SECRET and FIREBASE_API_KEY are required.' });
  }

  // ── Method + auth gate ──
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!safeEqual(getProvidedSecret(req), secret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const coords = {};
  const misses = [];
  // Optional slicing so a single request stays well under the gateway/tool
  // timeout: /api/geocode-all?from=0&to=5 geocodes docs[0..5). Omit for all.
  const q = req.query || {};
  const from = q.from != null ? Math.max(0, parseInt(q.from, 10) || 0) : 0;
  const to = q.to != null ? (parseInt(q.to, 10) || 0) : null;
  let total = 0;
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings?pageSize=300&key=${apiKey}`);
    const j = await r.json();
    const allDocs = j.documents || [];
    total = allDocs.length;
    const docs = to != null ? allDocs.slice(from, to) : allDocs.slice(from);
    for (const doc of docs) {
      const id = doc.name.split('/').pop();
      const f = doc.fields || {};
      const address = sv(f, 'address').trim();
      const zone = (sv(f, 'zone') || sv(f, 'neighborhood')).trim();
      if (!address) { misses.push({ id, reason: 'no address' }); continue; }

      // Try most specific query first, then progressively looser. Some
      // listings store address as "Street, Neighborhood" — Nominatim then
      // interprets the suffix as a city, so we also try the bare street.
      const street = address.split(',')[0].trim();
      const queries = [
        `${address}, Roma, Italia`,
        zone ? `${address}, ${zone}, Roma, Italia` : null,
        street !== address ? `${street}, Roma, Italia` : null,
      ].filter(Boolean);

      let hit = null;
      for (const query of queries) {
        try { hit = await geocode(query); } catch { hit = null; }
        await sleep(1100); // Nominatim usage policy: <= 1 req/sec
        if (hit) break;
      }
      if (hit) coords[id] = [Number(hit[0].toFixed(6)), Number(hit[1].toFixed(6))];
      else misses.push({ id, address, zone });
    }
  } catch (e) {
    return res.status(200).json({ error: String(e), coords, misses });
  }

  // Private: this is an authenticated admin tool — do not let shared caches
  // (or the CDN) store the response under a cache key that omits the secret.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ generated: new Date().toISOString(), total, from, to, count: Object.keys(coords).length, coords, misses });
}
