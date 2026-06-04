// api/admin/match-test.js
// Admin-only test harness for the Homie → PFS bridge. Mirrors
// api/homie/property.js but auths via a Firebase ID token (so the admin
// browser can call it directly) instead of HOMIE_SECRET, and supports a
// dryRun mode that scores every active client without writing anything.
//
// ─────────────────────────────────────────────────────────────────────────
// Protocol
// ─────────────────────────────────────────────────────────────────────────
// Method:   POST
// URL:      https://boomrome.com/api/admin/match-test
// Headers:  Content-Type: application/json
//           Authorization: Bearer <firebase-id-token>
// Body:     {
//   dryRun?:     boolean   // default true. false = actually push matches.
//   sourceUrl?:  string    // optional in dryRun; required to actually push
//   source?:     string    // default 'manual'
//   price:       number    // required, €/month
//   title?, address?, zone?, bedrooms?, sqm?, images?, description?
//   threshold?:  number    // default 60
// }
//
// Response 200 (dryRun): { ok, dryRun:true, propertyId, threshold,
//                          totalActiveClients, results: [...all scored, sorted] }
// Response 200 (push):   { ok, dryRun:false, propertyId, pushedTo, skipped,
//                          errors, allScores, ... }
// Response 401/403:      auth/role failure
// ─────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { fsList, fsPatch, fsGet, readJson, logActivity } from '../homie/_lib.js';
import { scoreMatch, DEFAULT_THRESHOLD } from '../homie/_match.js';

const ADMIN_ROLES = new Set(['admin', 'owner', 'landlord']);
const ACTIVE_STAGES = new Set([
  'payment_confirmed', 'searching', 'options', 'viewing', 'closing',
]);

async function verifyFirebaseToken(token) {
  if (!token) return null;
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_API_KEY env var missing');
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );
  const data = await r.json();
  if (!r.ok || !data.users || !data.users[0]) return null;
  return data.users[0]; // { localId, email, ... }
}

function stableIdFromUrl(url) {
  return 'h_' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function sanitizeImages(imgs) {
  if (!Array.isArray(imgs)) return [];
  return imgs.filter(s => typeof s === 'string' && /^https?:\/\//.test(s)).slice(0, 20);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // ── Auth ─────────────────────────────────────────────────
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  let firebaseUser;
  try { firebaseUser = await verifyFirebaseToken(token); }
  catch (err) {
    console.error('[admin/match-test] token verify failed:', err.message);
    return res.status(500).json({ ok: false, error: 'auth_check_failed' });
  }
  if (!firebaseUser) return res.status(401).json({ ok: false, error: 'invalid_or_expired_token' });

  const profile = await fsGet('users/' + firebaseUser.localId);
  if (!profile) return res.status(403).json({ ok: false, error: 'no_profile' });
  if (!ADMIN_ROLES.has(profile.role)) {
    return res.status(403).json({ ok: false, error: 'admin_required', yourRole: profile.role || null });
  }

  // ── Body ─────────────────────────────────────────────────
  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  const dryRun = body.dryRun !== false; // default true (safe)
  const price = typeof body.price === 'number' ? body.price : parseFloat(body.price);
  if (!isFinite(price) || price <= 0) {
    return res.status(400).json({ ok: false, error: 'price_required', detail: 'price must be a positive number' });
  }

  let sourceUrl = String(body.sourceUrl || '').trim();
  if (!sourceUrl) {
    // Synthesize a placeholder so the same dry-run payload is reproducibly
    // hashed. Not persisted unless dryRun=false.
    sourceUrl = 'manual://test-' + crypto.createHash('sha1')
      .update(JSON.stringify({ price, addr: body.address, t: body.title || '' }))
      .digest('hex').slice(0, 12);
  } else if (!/^https?:\/\//.test(sourceUrl)) {
    return res.status(400).json({ ok: false, error: 'sourceUrl_must_be_http' });
  }
  const stableId = stableIdFromUrl(sourceUrl);

  const property = {
    sourceUrl,
    source: String(body.source || 'manual').toLowerCase(),
    title: body.title || null,
    address: body.address || null,
    zone: body.zone || null,
    price,
    bedrooms: typeof body.bedrooms === 'number' ? body.bedrooms : (parseInt(body.bedrooms, 10) || null),
    sqm: typeof body.sqm === 'number' ? body.sqm : (parseInt(body.sqm, 10) || null),
    bathrooms: typeof body.bathrooms === 'number' ? body.bathrooms : (parseInt(body.bathrooms, 10) || null),
    images: sanitizeImages(body.images),
    description: body.description || null,
  };

  const threshold = Number.isFinite(body.threshold) ? body.threshold : DEFAULT_THRESHOLD;

  // ── Fetch active clients + score ─────────────────────────
  let clients = [];
  try {
    const all = await fsList('pfsClients', { limit: 200 });
    clients = all.filter(c => {
      const stage = c.stage || c.portalStage;
      if (!stage) return c.portalEnabled === true;
      return ACTIVE_STAGES.has(stage);
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'client_list_failed', detail: err.message });
  }

  const allScores = clients.map(c => {
    const { score, reasons, reject } = scoreMatch(property, c);
    const alreadyHasIt = Array.isArray(c.portalProperties)
      && c.portalProperties.some(p => p && p.id === stableId);
    return {
      clientId: c.id,
      name: c.name || null,
      email: c.email || null,
      stage: c.stage || c.portalStage || null,
      criteria: {
        budget: c.budget || null,
        bedrooms: c.bedrooms || null,
        preferred_areas: c.preferred_areas || null,
      },
      score,
      reasons,
      reject: reject || null,
      wouldPush: !reject && score >= threshold && !alreadyHasIt,
      alreadyHasIt,
    };
  });
  allScores.sort((a, b) => b.score - a.score);

  if (dryRun) {
    return res.status(200).json({
      ok: true,
      dryRun: true,
      propertyId: stableId,
      threshold,
      totalActiveClients: clients.length,
      property,
      results: allScores,
    });
  }

  // ── Live push (same flow as homie/property.js) ───────────
  const now = new Date();
  const pushedTo = [];
  const skipped = [];
  const errors = [];

  // 1. Master record
  try {
    await fsPatch('pfsProperties/' + stableId, {
      ...property,
      scrapedAt: now.toISOString(),
      lastSeenAt: now,
      ingestedBy: 'admin-test:' + profile.id,
    });
  } catch (err) {
    console.error('[admin/match-test] master write failed:', err.message);
  }

  // 2. Push to matched clients
  for (const r of allScores) {
    if (r.alreadyHasIt) { skipped.push({ clientId: r.clientId, name: r.name, score: r.score }); continue; }
    if (!r.wouldPush) continue;

    const client = clients.find(c => c.id === r.clientId);
    const existing = Array.isArray(client.portalProperties) ? client.portalProperties : [];
    const entry = {
      id: stableId,
      address: property.address || property.title || sourceUrl,
      price: Math.round(property.price),
      rooms: property.bedrooms,
      sqm: property.sqm,
      match: r.score,
      images: property.images || [],
      description: property.description || '',
      sourceUrl,
      source: property.source,
      isNew: true,
      addedAt: now.toISOString(),
      addedBy: 'admin:' + profile.id,
      matchReasons: r.reasons,
    };
    const existingActivity = Array.isArray(client.portalActivity) ? client.portalActivity : [];
    const newActivity = existingActivity.concat([{
      type: 'admin_match_test',
      propertyId: stableId,
      score: r.score,
      timestamp: now.toISOString(),
      by: profile.id,
    }]);

    try {
      await fsPatch('pfsClients/' + client.id, {
        portalProperties: existing.concat([entry]),
        portalActivity: newActivity,
      });
      pushedTo.push({ clientId: r.clientId, name: r.name, score: r.score, reasons: r.reasons });
    } catch (err) {
      errors.push({ clientId: r.clientId, error: err.message });
    }
  }

  await logActivity('admin_match_test', 'pfs_bridge', {
    sourceUrl,
    price,
    propertyId: stableId,
    pushedCount: pushedTo.length,
    skippedCount: skipped.length,
    totalActive: clients.length,
    admin: profile.id,
  }, 'admin');

  return res.status(200).json({
    ok: true,
    dryRun: false,
    propertyId: stableId,
    threshold,
    totalActiveClients: clients.length,
    pushedTo,
    skipped,
    errors,
    allScores,
  });
}
