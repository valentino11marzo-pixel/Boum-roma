// api/pfs/_ingest.js
// THE single ingestion path for scraped/alerted rental listings.
// Every source (Homie webhook, email-alert cron, market-scan cron, manual
// admin add) converges here so dedupe, scoring, agency filtering and the
// swipe-deck push behave identically everywhere.
//
// Flow per property:
//   1. dedupe on sha1(sourceUrl) → pfsProperties/<stableId> (merge/upsert)
//   2. agency policy: advertiser 'agency' is stored (for analytics) but
//      NEVER pushed to client decks — BOOM only proposes private listings
//   3. score against every active pfsClients doc (api/homie/_match.js)
//   4. push score ≥ threshold into client.portalProperties (swipe deck)
//   5. persist a matchSummary on the property doc so the command center
//      can render per-client scores without re-scoring client-side

import crypto from 'node:crypto';
import { fsPatch, fsGet, fsList, logActivity } from '../homie/_lib.js';
import { scoreMatch, DEFAULT_THRESHOLD } from '../homie/_match.js';

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

export async function listActiveClients() {
  const all = await fsList('pfsClients', { limit: 200 });
  return all.filter(c => {
    const stage = c.stage || c.portalStage;
    if (!stage) return c.portalEnabled === true; // legacy clients pre-stage
    return ACTIVE_STAGES.has(stage);
  });
}

// raw: { sourceUrl*, source*, price*, title?, address?, zone?, bedrooms?,
//        sqm?, bathrooms?, furnished?, images?, description?, contactEmail?,
//        contactPhone?, scrapedAt?, advertiser? ('private'|'agency'|'unknown') }
// opts: { threshold?, ingestedBy?, addedBy?, skipFreshHours? }
//
// Returns { ok, propertyId, skippedFresh?, droppedAgency?, pushedTo,
//           skipped, belowThreshold, errors, totalActiveClients }
export async function ingestProperty(raw, opts = {}) {
  const errors = [];
  const sourceUrl = String(raw.sourceUrl || '').trim();
  if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
    return { ok: false, error: 'sourceUrl must be a full http(s) URL' };
  }
  const price = typeof raw.price === 'number' ? raw.price : parseFloat(raw.price);
  if (!isFinite(price) || price <= 0) {
    return { ok: false, error: 'price (number > 0) is required', sourceUrl };
  }

  const stableId = stableIdFromUrl(sourceUrl);
  const now = new Date();
  const ingestedBy = opts.ingestedBy || 'pfs-ingest';
  const advertiser = ['private', 'agency', 'unknown'].includes(raw.advertiser)
    ? raw.advertiser : 'unknown';

  // ── Freshness short-circuit ───────────────────────────────
  // Crons re-scan a sliding window; if we ingested this listing recently,
  // just bump lastSeenAt instead of re-scoring all clients on every run.
  const skipFreshHours = Number.isFinite(opts.skipFreshHours) ? opts.skipFreshHours : 0;
  if (skipFreshHours > 0) {
    try {
      const existing = await fsGet('pfsProperties/' + stableId);
      const seen = existing && (existing.lastSeenAt || existing.scrapedAt);
      if (seen && (now - new Date(seen)) < skipFreshHours * 3600 * 1000) {
        await fsPatch('pfsProperties/' + stableId, { lastSeenAt: now });
        return { ok: true, propertyId: stableId, skippedFresh: true, pushedTo: [], skipped: [], belowThreshold: [], errors: [] };
      }
    } catch { /* fall through to full ingest */ }
  }

  // ── 1. Master record ──────────────────────────────────────
  const property = {
    sourceUrl,
    source: String(raw.source || 'manual').toLowerCase(),
    title: raw.title || null,
    address: raw.address || null,
    zone: raw.zone || null,
    price,
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : (parseInt(raw.bedrooms, 10) || null),
    sqm: typeof raw.sqm === 'number' ? raw.sqm : (parseInt(raw.sqm, 10) || null),
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : (parseInt(raw.bathrooms, 10) || null),
    furnished: typeof raw.furnished === 'boolean' ? raw.furnished : null,
    images: sanitizeImages(raw.images),
    description: raw.description || null,
    contactEmail: raw.contactEmail || null,
    contactPhone: raw.contactPhone || null,
    advertiser,
    scrapedAt: raw.scrapedAt || now.toISOString(),
    lastSeenAt: now,
    ingestedBy,
  };

  try { await fsPatch('pfsProperties/' + stableId, property); }
  catch (err) {
    console.error('[pfs/_ingest] master write failed:', err.message);
    // Continue — we can still push to clients even if the master write hiccupped
  }

  // ── 2. Agency policy ──────────────────────────────────────
  if (advertiser === 'agency') {
    await logActivity('pfs_property_agency_dropped', 'pfs_radar',
      { sourceUrl, price, propertyId: stableId }, ingestedBy);
    return { ok: true, propertyId: stableId, droppedAgency: true, pushedTo: [], skipped: [], belowThreshold: [], errors: [] };
  }

  // ── 3. Score + push ───────────────────────────────────────
  let clients = [];
  try { clients = await listActiveClients(); }
  catch (err) {
    return { ok: false, error: 'client_list_failed', detail: err.message, propertyId: stableId };
  }

  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
  const pushedTo = [];
  const skippedExisting = [];
  const belowThreshold = [];

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

    // Shape expected by client-portal.html mapClient()
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
      addedBy: opts.addedBy || 'homie',
      matchReasons: reasons,
    };

    const existingActivity = Array.isArray(client.portalActivity) ? client.portalActivity : [];
    const newActivity = existingActivity.concat([{
      type: 'homie_match',
      propertyId: stableId,
      score,
      timestamp: now.toISOString(),
    }]);

    try {
      await fsPatch('pfsClients/' + client.id, {
        portalProperties: existing.concat([entry]),
        portalActivity: newActivity,
      });
      pushedTo.push({ clientId: client.id, name: client.name || null, score, reasons });
    } catch (err) {
      console.error('[pfs/_ingest] push to ' + client.id + ' failed:', err.message);
      errors.push({ clientId: client.id, error: err.message });
    }
  }

  // ── 4. Match summary on the property doc (command center) ─
  try {
    await fsPatch('pfsProperties/' + stableId, {
      matchSummary: {
        at: now.toISOString(),
        threshold,
        pushedTo: pushedTo.map(p => ({ clientId: p.clientId, name: p.name, score: p.score })),
        alreadyHad: skippedExisting.map(p => ({ clientId: p.clientId, name: p.name, score: p.score })),
        belowThreshold: belowThreshold.slice(0, 20).map(p => ({ clientId: p.clientId, name: p.name, score: p.score, reasons: p.reasons })),
      },
    });
  } catch (err) {
    console.warn('[pfs/_ingest] matchSummary write failed:', err.message);
  }

  await logActivity('pfs_property_ingested', 'pfs_radar', {
    sourceUrl,
    price,
    propertyId: stableId,
    source: property.source,
    advertiser,
    pushedCount: pushedTo.length,
    skippedCount: skippedExisting.length,
    belowThresholdCount: belowThreshold.length,
    totalActive: clients.length,
  }, ingestedBy);

  return {
    ok: true,
    propertyId: stableId,
    pushedTo,
    skipped: skippedExisting,
    belowThreshold,
    errors,
    totalActiveClients: clients.length,
  };
}
