// api/homie/_ingest.js
// Shared PFS ingestion backbone. ONE pipeline, many sources.
//
// A "property" (scraped by Homie, curated from Casafari by an operator, or
// added by hand) is normalized into the canonical `pfsProperties` shape,
// stored once (deduped by sourceUrl), scored against PFS clients, and pushed
// into the matching clients' `portalProperties` swipe deck. client-portal.html
// already listens for portalProperties changes and alerts the client.
//
// Both api/homie/property.js (X-Homie-Secret, all active clients, threshold
// gated) and api/casafari/import.js (admin token, one curated client,
// force-pushed) call ingestProperty() so there is no second code path and no
// drift between automatic and manual sources.

import crypto from 'node:crypto';
import { fsPatch, fsGet, fsList, logActivity } from './_lib.js';
import { scoreMatch, DEFAULT_THRESHOLD } from './_match.js';

// Sources accepted on the master record. 'casafari' joins the portals that
// Homie already feeds; Casafari itself aggregates immobiliare/idealista/etc.
export const VALID_SOURCES = new Set([
  'immobiliare', 'idealista', 'subito', 'whatsapp', 'casafari', 'manual',
]);

// Stages where a client is still actively searching and should receive new
// matches. Stripe webhook writes 'payment_confirmed' on first paid; admin
// progresses it through searching/options/viewing/closing/placed.
export const ACTIVE_STAGES = new Set([
  'payment_confirmed', 'searching', 'options', 'viewing', 'closing',
]);

export function stableIdFromUrl(url) {
  return 'h_' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

export function sanitizeImages(imgs) {
  if (!Array.isArray(imgs)) return [];
  return imgs
    .filter(s => typeof s === 'string' && /^https?:\/\//.test(s))
    .slice(0, 20);
}

// Validate + normalize an inbound payload into the canonical pfsProperties
// record. Accepts either `sourceUrl` or `url` as the dedup key. Returns
// { ok:true, property, stableId } or { ok:false, errors:[...] }.
export function normalizeProperty(body, { ingestedBy = 'homie' } = {}) {
  const errors = [];
  const sourceUrl = String(body.sourceUrl || body.url || '').trim();
  if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) errors.push('sourceUrl must be a full http(s) URL');
  const source = String(body.source || '').toLowerCase().trim();
  if (!VALID_SOURCES.has(source)) errors.push(`source must be one of ${[...VALID_SOURCES].join(', ')}`);
  const price = typeof body.price === 'number' ? body.price : parseFloat(body.price);
  if (!isFinite(price) || price <= 0) errors.push('price (number > 0) is required');
  if (errors.length) return { ok: false, errors };

  const now = new Date();
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
    ingestedBy,
  };
  return { ok: true, property, stableId: stableIdFromUrl(sourceUrl) };
}

// Build the deck entry shape consumed by client-portal.html mapClient().
function deckEntry(property, stableId, score, reasons, now, addedBy) {
  return {
    id: stableId,
    address: property.address || property.title || property.sourceUrl,
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
    addedBy,
    matchReasons: reasons,
  };
}

// Core ingest: write the master record, then score + push to clients.
//
// opts:
//   threshold    – min score to push (default DEFAULT_THRESHOLD). Ignored when force.
//   onlyClientId – restrict to a single client (operator-curated import).
//   force        – push regardless of score/veto (still recorded). Use only
//                  with onlyClientId — operator-curated push to a chosen client.
//   addedBy      – tag on the deck entry + activity ('homie' | 'casafari' | …).
//
// Returns the same summary shape the Homie endpoint has always returned:
//   { ok, propertyId, pushedTo, skipped, belowThreshold, errors, totalActiveClients }
export async function ingestProperty(property, stableId, opts = {}) {
  const {
    threshold = DEFAULT_THRESHOLD,
    onlyClientId = null,
    force = false,
    addedBy = 'homie',
  } = opts;
  const now = new Date();

  // 1. Master record (idempotent on stableId)
  try { await fsPatch('pfsProperties/' + stableId, property); }
  catch (err) { console.error('[ingest] master write failed:', err.message); }

  // 2. Target clients
  let clients = [];
  try {
    if (onlyClientId) {
      const c = await fsGet('pfsClients/' + onlyClientId);
      if (c) clients = [c];
    } else {
      const all = await fsList('pfsClients', { limit: 200 });
      clients = all.filter(c => {
        const stage = c.stage || c.portalStage;
        if (!stage) return c.portalEnabled === true; // legacy clients pre-stage
        return ACTIVE_STAGES.has(stage);
      });
    }
  } catch (err) {
    console.error('[ingest] client list failed:', err.message);
    return { ok: false, error: 'client_list_failed', detail: err.message };
  }

  // 3. Score + push
  const pushedTo = [];
  const skippedExisting = [];
  const belowThreshold = [];
  const errorsArr = [];

  for (const client of clients) {
    const { score, reasons, reject } = scoreMatch(property, client);
    if (!force && (reject || score < threshold)) {
      belowThreshold.push({ clientId: client.id, name: client.name || null, score, reasons });
      continue;
    }
    const existing = Array.isArray(client.portalProperties) ? client.portalProperties : [];
    if (existing.some(p => p && p.id === stableId)) {
      skippedExisting.push({ clientId: client.id, name: client.name || null, score });
      continue;
    }

    const entry = deckEntry(property, stableId, score, reasons, now, addedBy);
    const newPortalProps = existing.concat([entry]);
    const existingActivity = Array.isArray(client.portalActivity) ? client.portalActivity : [];
    const newActivity = existingActivity.concat([{
      type: addedBy === 'homie' ? 'homie_match' : (addedBy + '_import'),
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
      console.error('[ingest] push to ' + client.id + ' failed:', err.message);
      errorsArr.push({ clientId: client.id, error: err.message });
    }
  }

  // 4. Audit
  await logActivity(addedBy + '_property_ingested', 'pfs_bridge', {
    sourceUrl: property.sourceUrl,
    price: property.price,
    propertyId: stableId,
    pushedCount: pushedTo.length,
    skippedCount: skippedExisting.length,
    belowThresholdCount: belowThreshold.length,
    totalActive: clients.length,
    onlyClientId: onlyClientId || null,
  }, addedBy);

  return {
    ok: true,
    propertyId: stableId,
    pushedTo,
    skipped: skippedExisting,
    belowThreshold,
    errors: errorsArr,
    totalActiveClients: clients.length,
  };
}
