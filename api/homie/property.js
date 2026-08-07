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
//   advertiser?: 'private' | 'agency' | 'unknown'    // default 'private'
//                // (Homie vets upstream; 'agency' is stored, never pushed)
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
import { DEFAULT_THRESHOLD } from './_match.js';
import { ingestProperty } from '../pfs/_ingest.js';

const VALID_SOURCES = new Set(['immobiliare', 'idealista', 'subito', 'whatsapp', 'manual']);

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

  // ── Validation ──────────────────────────────────────────
  const errors = [];
  const sourceUrl = String(body.sourceUrl || '').trim();
  if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) errors.push('sourceUrl must be a full http(s) URL');
  const source = String(body.source || '').toLowerCase().trim();
  if (!VALID_SOURCES.has(source)) errors.push(`source must be one of ${[...VALID_SOURCES].join(', ')}`);
  const price = typeof body.price === 'number' ? body.price : parseFloat(body.price);
  if (!isFinite(price) || price <= 0) errors.push('price (number > 0) is required');
  if (errors.length) return res.status(400).json({ ok: false, error: 'validation', details: errors });

  // ── Shared ingestion pipeline (api/pfs/_ingest.js) ───────
  // Homie already vets advertisers upstream, so default to 'private'
  // unless it tells us otherwise.
  const result = await ingestProperty({
    sourceUrl,
    source,
    price,
    title: body.title,
    address: body.address,
    zone: body.zone,
    bedrooms: body.bedrooms,
    sqm: body.sqm,
    bathrooms: body.bathrooms,
    furnished: body.furnished,
    images: body.images,
    description: body.description,
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone,
    scrapedAt: body.scrapedAt,
    advertiser: body.advertiser || 'private',
  }, {
    threshold: Number.isFinite(body.threshold) ? body.threshold : DEFAULT_THRESHOLD,
    ingestedBy: 'homie-property',
    addedBy: 'homie',
  });

  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error || 'ingest_failed', detail: result.detail || null });
  }

  return res.status(200).json({
    ok: true,
    propertyId: result.propertyId,
    droppedAgency: result.droppedAgency || false,
    pushedTo: result.pushedTo,
    skipped: result.skipped,
    belowThreshold: result.belowThreshold,
    errors: result.errors,
    totalActiveClients: result.totalActiveClients || 0,
  });
}
