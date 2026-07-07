// api/maps-key.js
// Hands the browser the Google Maps Platform key used for Photorealistic
// 3D Tiles in the Skyline's "Explore the block". Returns { ok, key:null }
// until GOOGLE_MAPS_API_KEY is configured in Vercel — the map then falls
// back to the satellite orbit automatically.
//
// SECURITY: this key is meant to be public — create it in Google Cloud
// Console with (1) an HTTP-referrer restriction on *.boomrome.com and
// (2) API restriction to "Map Tiles API" only. Never reuse a server key.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  return res.status(200).json({ ok: true, key: process.env.GOOGLE_MAPS_API_KEY || null });
}
