// api/casafari/import.js
// Casafari → PFS bridge (web-account flow). The operator reviews listings on
// it.casafari.com (deep-linked & pre-filtered to the client from the portal),
// then imports the chosen ones straight into that client's swipe deck.
//
// Casafari has no sanctioned data API on a plain web account, so this is the
// honest path: a human curates, BOOM ingests. It runs through the SAME
// backbone as the Homie webhook (api/homie/_ingest.js) — one pipeline, one
// pfsProperties master, one scorer — so curated and automatic sources never
// drift apart. Because the operator already vetted the listing for THIS
// client, we force-push (bypass the score threshold) but still record the
// computed match score for display.
//
// Method:   POST
// URL:      /api/casafari/import
// Headers:  Authorization: Bearer <firebase-id-token>   (admin only)
// Body:     {
//   clientId:   string                      // required, pfsClients doc id
//   listing?:   { url|sourceUrl, price, address?, zone?, bedrooms?, sqm?,
//                 images?[], title?, description?, furnished? }
//   listings?:  [ …listing ]                // batch (max 20)
//   force?:     boolean                     // default true (operator-curated)
//   threshold?: number                      // only used when force === false
// }
// Response: { ok, clientId, pushedCount, count, results:[{ url, propertyId,
//             pushed, duplicate, score, reasons, error? }] }

import { readJson } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { normalizeProperty, ingestProperty } from '../homie/_ingest.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  const clientId = String(body.clientId || '').trim();
  if (!clientId) return res.status(400).json({ ok: false, error: 'clientId_required' });

  const list = Array.isArray(body.listings)
    ? body.listings
    : (body.listing ? [body.listing] : []);
  if (!list.length) return res.status(400).json({ ok: false, error: 'no_listings' });

  // Operator-curated for a chosen client → force-push by default.
  const force = body.force !== false;
  const threshold = Number.isFinite(body.threshold) ? body.threshold : undefined;

  const results = [];
  for (const raw of list.slice(0, 20)) {
    const input = {
      ...raw,
      sourceUrl: raw.sourceUrl || raw.url,
      source: (raw.source || 'casafari').toLowerCase(),
    };
    const norm = normalizeProperty(input, { ingestedBy: 'casafari-import:' + auth.uid });
    if (!norm.ok) {
      results.push({ ok: false, url: input.sourceUrl || null, error: 'validation', details: norm.errors });
      continue;
    }

    const r = await ingestProperty(norm.property, norm.stableId, {
      onlyClientId: clientId,
      force,
      threshold,
      addedBy: 'casafari',
    });

    if (r.ok === false) {
      results.push({ ok: false, url: input.sourceUrl, propertyId: norm.stableId, error: r.error || 'ingest_failed' });
      continue;
    }
    const hit = r.pushedTo[0] || r.skipped[0] || r.belowThreshold[0] || null;
    results.push({
      ok: true,
      url: input.sourceUrl,
      propertyId: norm.stableId,
      pushed: r.pushedTo.length > 0,
      duplicate: r.skipped.length > 0,
      clientFound: r.totalActiveClients > 0,
      score: hit ? hit.score : null,
      reasons: (r.pushedTo[0]?.reasons) || (r.belowThreshold[0]?.reasons) || [],
    });
  }

  const pushedCount = results.filter(x => x.pushed).length;
  return res.status(200).json({ ok: true, clientId, pushedCount, count: results.length, results });
}
