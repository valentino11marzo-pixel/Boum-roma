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

import crypto from 'node:crypto';
import { fsPatch, fsList, requireSecret, readJson, logActivity } from './_lib.js';
import { scoreMatch, DEFAULT_THRESHOLD } from './_match.js';

const VALID_SOURCES = new Set(['immobiliare', 'idealista', 'subito', 'whatsapp', 'manual']);

// Stages where a client is still actively searching and should receive new
// matches. Stripe webhook writes 'payment_confirmed' on first paid; admin
// progresses it through searching/options/viewing/closing/placed.
const ACTIVE_STAGES = new Set([
  'payment_confirmed', 'searching', 'options', 'viewing', 'closing',
]);

function stableIdFromUrl(url) {
  return 'h_' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function sanitizeImages(imgs) {
  if (!Array.isArray(imgs)) return [];
  return imgs
    .filter(s => typeof s === 'string' && /^https?:\/\//.test(s))
    .slice(0, 20);
}

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

  const stableId = stableIdFromUrl(sourceUrl);
  const now = new Date();

  // ── 1. Write / merge master record in pfsProperties ──────
  const property = {
    sourceUrl,
    source,
    title: body.title || null,
    address: body.address || null,
    zone: body.zone || null,
    price,
    bedrooms: typeof body.bedrooms === 'number' ? body.bedrooms : (parseInt(body.bedrooms, 10) || null),
    sqm: typeof body.sqm === 'number' ? body.sqm : (parseInt(body.sqm, 10) || null),
    bathrooms: typeof body.bathrooms === 'number' ? body.bathrooms : (parseInt(body.bathrooms, 10) || null),
    furnished: typeof body.furnished === 'boolean' ? body.furnished : null,
    images: sanitizeImages(body.images),
    description: body.description || null,
    contactEmail: body.contactEmail || null,
    contactPhone: body.contactPhone || null,
    scrapedAt: body.scrapedAt || now.toISOString(),
    lastSeenAt: now,
    ingestedBy: 'homie-property',
  };

  try { await fsPatch('pfsProperties/' + stableId, property); }
  catch (err) {
    console.error('[homie/property] master write failed:', err.message);
    // Continue anyway — we can still push to clients even if master write hiccupped
  }

  // ── 2. Fetch active PFS clients ──────────────────────────
  // fsList only supports single-field equality; we filter active stages in JS.
  // Cap at 200 — well above current client count, sub-second response time.
  let clients = [];
  try {
    const all = await fsList('pfsClients', { limit: 200 });
    clients = all.filter(c => {
      const stage = c.stage || c.portalStage;
      if (!stage) return c.portalEnabled === true; // legacy clients pre-stage
      return ACTIVE_STAGES.has(stage);
    });
  } catch (err) {
    console.error('[homie/property] client list failed:', err.message);
    return res.status(500).json({ ok: false, error: 'client_list_failed', detail: err.message });
  }

  // ── 3. Score + push ──────────────────────────────────────
  const threshold = Number.isFinite(body.threshold) ? body.threshold : DEFAULT_THRESHOLD;
  const pushedTo = [];
  const skippedExisting = [];
  const belowThreshold = [];
  const errorsArr = [];

  for (const client of clients) {
    const { score, reasons, reject } = scoreMatch(property, client);
    if (reject || score < threshold) {
      belowThreshold.push({ clientId: client.id, name: client.name || null, score, reasons });
      continue;
    }

    const existing = Array.isArray(client.portalProperties) ? client.portalProperties : [];
    if (existing.some(p => p && p.id === stableId)) {
      skippedExisting.push({ clientId: client.id, name: client.name || null, score });
      continue;
    }

    // Append shape expected by client-portal.html mapClient():
    // { id, address, price, rooms, sqm, match, images, description, isNew, ... }
    const entry = {
      id: stableId,
      address: property.address || property.title || sourceUrl,
      price: Math.round(property.price),
      rooms: property.bedrooms,
      sqm: property.sqm,
      match: score,
      images: property.images || [],
      description: property.description || '',
      sourceUrl: property.sourceUrl,
      source: property.source,
      isNew: true,
      addedAt: now.toISOString(),
      addedBy: 'homie',
      matchReasons: reasons,
    };

    const newPortalProps = existing.concat([entry]);
    const existingActivity = Array.isArray(client.portalActivity) ? client.portalActivity : [];
    const newActivity = existingActivity.concat([{
      type: 'homie_match',
      propertyId: stableId,
      score,
      timestamp: now.toISOString(),
    }]);

    try {
      await fsPatch('pfsClients/' + client.id, {
        portalProperties: newPortalProps,
        portalActivity: newActivity,
      });
      pushedTo.push({ clientId: client.id, name: client.name || null, score, reasons });
    } catch (err) {
      console.error('[homie/property] push to ' + client.id + ' failed:', err.message);
      errorsArr.push({ clientId: client.id, error: err.message });
    }
  }

  // ── 4. Audit ─────────────────────────────────────────────
  await logActivity('homie_property_ingested', 'pfs_bridge', {
    sourceUrl,
    price,
    propertyId: stableId,
    pushedCount: pushedTo.length,
    skippedCount: skippedExisting.length,
    belowThresholdCount: belowThreshold.length,
    totalActive: clients.length,
  }, 'homie');

  return res.status(200).json({
    ok: true,
    propertyId: stableId,
    pushedTo,
    skipped: skippedExisting,
    belowThreshold,
    errors: errorsArr,
    totalActiveClients: clients.length,
  });
}
