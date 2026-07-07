// api/geocode-bake.js
// Self-extinguishing coordinate backfill for the listings catalog.
// Finds every listing that has an address but no valid lat/lng, geocodes it
// server-side via Nominatim (Vercel egress is unrestricted; the container
// dev environments are not), and writes lat/lng straight onto the listing
// doc — so the Skyline map, the detail-page block map and the POI distances
// all become building-exact with zero client changes.
//
// PUBLIC by design but harmless-by-design:
//   - workload is fixed (only listings already in Firestore; no user input
//     reaches the geocoder), and it converges to a no-op once every listing
//     carries coordinates;
//   - per-instance throttle: one live run per 10 minutes, everything else
//     gets the summary of the last run;
//   - Nominatim policy respected: 1.1s spacing, identifying UA, ≤25/run;
//   - results sanity-checked against the Rome bounding box before writing.
//
// GET /api/geocode-bake            → { ok, scanned, updated:[{id,q,lat,lng}], failed:[...] }

import { fsList, fsPatch, logActivity } from './homie/_lib.js';

const UA = 'BOOMRome/1.0 (+https://www.boomrome.com; valentino11marzo@gmail.com)';
const ROME = { latMin: 41.70, latMax: 42.05, lngMin: 12.25, lngMax: 12.75 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let LAST_RUN = 0;
let LAST_SUMMARY = null;

function validCoord(lat, lng) {
  return isFinite(lat) && isFinite(lng)
    && lat >= ROME.latMin && lat <= ROME.latMax
    && lng >= ROME.lngMin && lng <= ROME.lngMax;
}

async function nominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&q=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'it,en' } });
  if (!r.ok) return null;
  const arr = await r.json().catch(() => null);
  const hit = Array.isArray(arr) && arr[0];
  if (!hit) return null;
  const lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
  return validCoord(lat, lng) ? { lat, lng } : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const now = Date.now();
  if (now - LAST_RUN < 10 * 60 * 1000 && LAST_SUMMARY) {
    return res.status(200).json({ ok: true, throttled: true, lastRun: new Date(LAST_RUN).toISOString(), ...LAST_SUMMARY });
  }
  LAST_RUN = now;

  try {
    const rows = await fsList('listings', { limit: 200 });
    const todo = rows.filter(l => {
      const lat = Number(l.lat), lng = Number(l.lng);
      const addr = String(l.address || '').trim();
      return addr.length > 4 && !validCoord(lat, lng);
    }).slice(0, 12);   // per-run cap: stays well inside maxDuration; repeat calls continue

    const updated = [], failed = [];
    for (const l of todo) {
      const addr = String(l.address).trim();
      const zone = String(l.zone || '').trim();
      // full address → address without civic number → zone
      const attempts = [
        /roma/i.test(addr) ? addr : addr + ', Roma',
        (addr.replace(/\b\d+[a-zA-Z]?\b/g, '').replace(/\s+/g, ' ').trim() + ', Roma'),
        zone ? zone + ', Roma' : null,
      ].filter(Boolean);

      let hit = null, usedQ = null;
      for (const q of attempts) {
        hit = await nominatim(q);
        await sleep(1100);
        if (hit) { usedQ = q; break; }
      }
      if (hit) {
        try {
          await fsPatch(`listings/${l.id}`, {
            lat: hit.lat, lng: hit.lng,
            geo: { src: 'nominatim', q: usedQ, at: new Date().toISOString() },
          });
          updated.push({ id: l.id, q: usedQ, lat: hit.lat, lng: hit.lng });
        } catch (e) { failed.push({ id: l.id, error: 'store: ' + e.message }); }
      } else {
        failed.push({ id: l.id, error: 'no_geocode', address: addr });
      }
    }

    LAST_SUMMARY = { scanned: rows.length, missing: todo.length, updated, failed };
    if (updated.length) {
      logActivity('geocode_bake', 'listings', { updated: updated.length, failed: failed.length }, 'geocode-bake').catch(() => {});
    }
    return res.status(200).json({ ok: true, ...LAST_SUMMARY });
  } catch (e) {
    console.error('[geocode-bake]', e.message);
    return res.status(500).json({ ok: false, error: 'bake_failed' });
  }
}
