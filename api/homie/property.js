// api/homie/property.js
// Homie → PFS bridge: inbound webhook for scraped properties.
// Stores the canonical record in `pfsProperties/<sha1-of-sourceUrl>` and
// pushes it into the swipe deck (`portalProperties` array) of every
// active PFS client whose stored search criteria scores above threshold.
// Client-portal.html already listens for portalProperties changes and
// triggers a "New Property!" alert on the client's phone, so no further
// notification wiring is needed here.
//
// ─────────────────────────────────────────────────────────────────────────
// Protocol
// ─────────────────────────────────────────────────────────────────────────
// Method:   POST
// URL:      https://boomrome.com/api/homie/property
// Headers:  Content-Type: application/json
//           X-Homie-Secret: <HOMIE_SECRET>
// Body:     {
//   sourceUrl:   string                              // required, dedup key
//   source:      'immobiliare' | 'idealista' | 'subito' | 'whatsapp' | 'manual'
//   price:       number                              // €/month, required
//   title?:      string
//   address?:    string
//   zone?:       string                              // Rome neighborhood
//   bedrooms?:   number                              // 0 = studio
//   sqm?:        number
//   bathrooms?:  number
//   furnished?:  boolean
//   images?:     string[]                            // http(s) URLs, max 20
//   description?: string
//   contactEmail?: string
//   contactPhone?: string
//   scrapedAt?:  string                              // ISO; defaults to now
//   threshold?:  number                              // override default 60
// }
//
// Response 200:
//   {
//     ok: true,
//     propertyId: '<stableId>',
//     pushedTo:        [{ clientId, name, score, reasons }],
//     skipped:         [{ clientId, name, score }],     // already had it
//     belowThreshold:  [{ clientId, name, score, reasons }],
//     errors:          [{ clientId, error }],
//     totalActiveClients: number
//   }
// Response 400: validation error
// Response 401: invalid secret
// ─────────────────────────────────────────────────────────────────────────

import { requireSecret, readJson } from './_lib.js';
import { normalizeProperty, ingestProperty } from './_ingest.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!requireSecret(req, res)) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Normalize + validate (shared backbone — same parser Casafari uses).
  const norm = normalizeProperty(body, { ingestedBy: 'homie-property' });
  if (!norm.ok) return res.status(400).json({ ok: false, error: 'validation', details: norm.errors });

  // Automatic source: score against ALL active clients, gated by threshold.
  const threshold = Number.isFinite(body.threshold) ? body.threshold : undefined;
  const result = await ingestProperty(norm.property, norm.stableId, { threshold, addedBy: 'homie' });
  if (result.ok === false) return res.status(500).json(result);
  return res.status(200).json(result);
}
