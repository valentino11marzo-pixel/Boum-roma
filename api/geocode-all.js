// api/geocode-all.js
// One-shot geocoder used to BAKE accurate listing coordinates into
// js/listing-coords.js. Reads every listing from Firestore, geocodes its
// address via Nominatim (server-side — Vercel egress is unrestricted),
// and returns { id: [lng, lat] }. Heavily edge-cached; intended to be run
// occasionally, its output committed as a static file the map reads.
//
// Regenerate:  curl https://www.boomrome.com/api/geocode-all  (or via tooling)
// then paste `coords` into js/listing-coords.js.

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';
const UA = 'BOOMRome/1.0 (+https://www.boomrome.com; valentino11marzo@gmail.com)';

const sv = (f, k) => (f && f[k] && f[k].stringValue) || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const coords = {};
  const misses = [];
  // Optional slicing so a single request stays well under the gateway/tool
  // timeout: /api/geocode-all?from=0&to=5 geocodes docs[0..5). Omit for all.
  const q = req.query || {};
  const from = q.from != null ? Math.max(0, parseInt(q.from, 10) || 0) : 0;
  const to = q.to != null ? (parseInt(q.to, 10) || 0) : null;
  let total = 0;
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings?pageSize=300&key=${API_KEY}`);
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

      // Try most specific query first, then progressively looser.
      const queries = [
        `${address}, Roma, Italia`,
        zone ? `${address}, ${zone}, Roma, Italia` : null,
      ].filter(Boolean);

      let hit = null;
      for (const q of queries) {
        try { hit = await geocode(q); } catch { hit = null; }
        await sleep(1100); // Nominatim usage policy: <= 1 req/sec
        if (hit) break;
      }
      if (hit) coords[id] = [Number(hit[0].toFixed(6)), Number(hit[1].toFixed(6))];
      else misses.push({ id, address, zone });
    }
  } catch (e) {
    return res.status(200).json({ error: String(e), coords, misses });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=604800, stale-while-revalidate=86400');
  res.status(200).json({ generated: new Date().toISOString(), total, from, to, count: Object.keys(coords).length, coords, misses });
}
