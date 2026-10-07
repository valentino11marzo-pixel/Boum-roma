// api/casafari/import.js
// Casafari → PFS bridge (manual operator import).
// The operator reviews Casafari (deep-linked + pre-filtered to the client),
// picks a listing, and imports it straight into THAT client's swipe deck.
//
// The radar (api/pfs/scan-inbox.js → _ingest.js) pushes a listing to EVERY
// matching client above threshold. This path is different on purpose:
// operator-curated for ONE chosen client, so it force-pushes regardless of
// score. It deliberately reuses the shared pipeline's helpers (stableId,
// sanitizeImages, scoreMatch) and writes the exact same pfsProperties master
// + portalProperties entry shape — same data, no forked path, just a
// single-client target the radar's bulk ingest doesn't express.
//
// Method:  POST    Auth: Bearer <firebase admin token>  (api/pfs/_guard.js)
// Body: { clientId*, listing | listings[], force? (default true),
//         reviewConfirmed? (required for reviewRequired clients) }
//   listing: { url|sourceUrl*, price*, address?, zone?, bedrooms?, sqm?,
//              images?[], title?, description?, advertiser? }
// Response: { ok, clientId, pushedCount, count, results:[{ url, propertyId,
//             pushed, duplicate, clientFound, score, reasons, error? }] }

import { readJson, fsGet, fsPatch, logActivity } from '../homie/_lib.js';
import { scoreMatch, DEFAULT_THRESHOLD } from '../homie/_match.js';
import { stableIdFromUrl, sanitizeImages } from '../pfs/_ingest.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { candidateId, hasApprovedEvidence } from '../pfs/_candidates.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return; // guard already wrote 401/403

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  const clientId = String(body.clientId || '').trim();
  if (!clientId) return res.status(400).json({ ok: false, error: 'clientId_required' });

  const list = Array.isArray(body.listings) ? body.listings : (body.listing ? [body.listing] : []);
  if (!list.length) return res.status(400).json({ ok: false, error: 'no_listings' });
  const force = body.force !== false; // operator-curated → force by default

  // Load the chosen client once; reused (and kept in sync) across a batch.
  let client;
  try { client = await fsGet('pfsClients/' + clientId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'client_lookup_failed', detail: e.message }); }
  if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' });
  if (client.reviewRequired === true) {
    // A reviewed client is never fed by an automatic bridge. The boolean is
    // an operator attestation, not evidence that availability was verified.
    if (!actor.startsWith('admin:')) return res.status(403).json({ ok: false, error: 'operator_required' });
    // _guard also admits landlord profiles for legacy admin pages. A
    // landlord must not be able to release a PFS candidate for any client.
    let reviewer;
    try { reviewer = await fsGet('users/' + actor.slice('admin:'.length)); }
    catch { return res.status(500).json({ ok: false, error: 'reviewer_lookup_failed' }); }
    if (reviewer?.role !== 'admin') return res.status(403).json({ ok: false, error: 'operator_required' });
    if (body.reviewConfirmed !== true) return res.status(400).json({ ok: false, error: 'review_confirmation_required' });
  }

  const results = [];
  for (const raw of list.slice(0, 20)) {
    const sourceUrl = String(raw.sourceUrl || raw.url || '').trim();
    const price = typeof raw.price === 'number' ? raw.price : parseFloat(raw.price);
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
      results.push({ ok: false, url: sourceUrl || null, error: 'sourceUrl must be a full http(s) URL' });
      continue;
    }
    if (!isFinite(price) || price <= 0) {
      results.push({ ok: false, url: sourceUrl, error: 'price (number > 0) is required' });
      continue;
    }

    const stableId = stableIdFromUrl(sourceUrl);
    if (client.reviewRequired === true) {
      // A bare reviewConfirmed boolean used to release reviewed clients.
      // Require the separate, CAS-protected operator decision and its proof
      // for this exact client/listing pair before *any* import write.
      let caseDoc;
      try { caseDoc = await fsGet('pfsCandidateReviews/' + candidateId(clientId, stableId)); }
      catch {
        results.push({ ok: false, url: sourceUrl, propertyId: stableId, error: 'candidate_lookup_failed' });
        continue;
      }
      if (!hasApprovedEvidence(caseDoc, clientId, stableId, sourceUrl)) {
        results.push({ ok: false, url: sourceUrl, propertyId: stableId, error: 'candidate_approval_required' });
        continue;
      }
    }
    const now = new Date();
    const property = {
      sourceUrl,
      source: String(raw.source || 'casafari').toLowerCase(),
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
      // A confirmation is not evidence of advertiser type. New reviewed
      // clients keep an absent type unknown; preserve historic import shape.
      advertiser: ['private', 'agency', 'unknown'].includes(raw.advertiser)
        ? raw.advertiser : (client.reviewRequired === true ? 'unknown' : 'private'),
      scrapedAt: raw.scrapedAt || now.toISOString(),
      lastSeenAt: now,
      ingestedBy: 'casafari-import:' + actor,
    };

    // Master record — same collection/shape the radar writes (idempotent).
    try { await fsPatch('pfsProperties/' + stableId, property); }
    catch (e) {
      console.error('[casafari/import] master write failed:', e.message);
      if (client.reviewRequired === true) {
        results.push({ ok: false, url: sourceUrl, propertyId: stableId, error: 'master_write_failed' });
        continue;
      }
    }

    // Score for display; operator-curated push ignores the threshold/veto.
    const { score, reasons, reject } = scoreMatch(property, client);
    const existing = Array.isArray(client.portalProperties) ? client.portalProperties : [];
    if (existing.some(p => p && p.id === stableId)) {
      results.push({ ok: true, url: sourceUrl, propertyId: stableId, pushed: false, duplicate: true, clientFound: true, score, reasons });
      continue;
    }
    if (!force && (reject || score < DEFAULT_THRESHOLD)) {
      results.push({ ok: true, url: sourceUrl, propertyId: stableId, pushed: false, duplicate: false, clientFound: true, score, reasons });
      continue;
    }

    // Same deck-entry shape client-portal.html mapClient() consumes.
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
      addedBy: 'casafari',
      matchReasons: reasons,
    };
    const newProps = existing.concat([entry]);
    const activity = (Array.isArray(client.portalActivity) ? client.portalActivity : [])
      .concat([{ type: 'casafari_import', propertyId: stableId, score, timestamp: now.toISOString(),
        ...(client.reviewRequired === true ? { reviewConfirmedBy: actor, reviewConfirmedAt: now.toISOString() } : {}) }]);

    try {
      await fsPatch('pfsClients/' + clientId, { portalProperties: newProps, portalActivity: activity });
      client.portalProperties = newProps;  // keep local copy fresh for batch imports
      client.portalActivity = activity;
      if (client.reviewRequired === true) {
        try {
          const saved = await fsGet('pfsProperties/' + stableId);
          const summary = saved?.matchSummary || {};
          await fsPatch('pfsProperties/' + stableId, { matchSummary: {
            // `at` is the epoch of an all-client score pass. This manual
            // release checks only one client and must not hide a later paid
            // client from scan-inbox's freshness guard.
            ...summary, reviewedAt: now.toISOString(), threshold: summary.threshold ?? DEFAULT_THRESHOLD,
            pendingReview: (Array.isArray(summary.pendingReview) ? summary.pendingReview : []).filter(m => m.clientId !== clientId),
            pushedTo: (Array.isArray(summary.pushedTo) ? summary.pushedTo : []).filter(m => m.clientId !== clientId)
              .concat([{ clientId, name: client.name || null, score }]),
          } });
        } catch (e) { console.warn('[casafari/import] matchSummary update failed:', e.message); }
      }
      await logActivity('casafari_imported', 'pfs_radar', { sourceUrl, price, propertyId: stableId, clientId, score }, actor);
      results.push({ ok: true, url: sourceUrl, propertyId: stableId, pushed: true, duplicate: false, clientFound: true, score, reasons });
    } catch (e) {
      console.error('[casafari/import] push failed:', e.message);
      results.push({ ok: false, url: sourceUrl, propertyId: stableId, error: e.message });
    }
  }

  const pushedCount = results.filter(r => r.pushed).length;
  return res.status(200).json({ ok: true, clientId, pushedCount, count: results.length, results });
}
