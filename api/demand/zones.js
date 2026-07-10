// api/demand/zones.js
// GET /api/demand/zones — public, aggregated + anonymized tenant demand per
// Rome zone. Powers the "chi cerca casa in zona X" widgets on the landlord
// acquisition pages. NEVER returns emails, names, or document ids — only
// counts and budget statistics.
//
// Demand sources (three collections, merged):
//   1. savedSearches — status 'active'; criteria.zones[] labels + budgetMax
//   2. pfsClients    — active search clients (stage/portalStage in the live
//                      pipeline set, or legacy portalEnabled docs); zones
//                      from preferred_areas / zone comma strings; budget in
//                      either portal (number) or stripe-intake (string) shape
//   3. leads         — non-landlord leads from the last 90 days; top-level
//                      zone + budget
//
// One seeker naming several zones counts in EACH matched zone but only ONCE
// in totals.seekers. Zone matching uses the neighborhood canon's matchTerms
// (api/demand/_zones.js — verbatim from scripts/neighborhoods-data.js).
//
// Response 200:
//   { ok:true, updatedAt, totals:{ seekers, zonesTracked },
//     zones:[ { key, label, seekers, budgetAvg, budgetP25, budgetP75 } ] }
// zones sorted by seekers desc; a zone appears only if seekers >= 1;
// budget stats are null when fewer than 2 numeric budgets are available.
//
// Caching: in-module 10-min cache (per warm instance) + CDN
// Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400.

import { fsList } from '../homie/_lib.js';
import {
  ZONES,
  matchZones,
  clientBudgetRange,
  budgetNumber,
  quantile,
} from './_zones.js';

// ── In-module cache (per warm instance) ──
const CACHE_TTL_MS = 10 * 60 * 1000;
let _cache = null;
let _cacheAt = 0;

const ACTIVE_STAGES = new Set([
  'payment_confirmed', 'searching', 'options', 'viewing', 'closing',
]);
const LEADS_WINDOW_DAYS = 90;

function isActivePfsClient(c) {
  const stage = c.stage || c.portalStage;
  if (stage) return ACTIVE_STAGES.has(String(stage));
  return c.portalEnabled === true;
}

// Parse whatever createdAt shape a lead has (Firestore timestamp → ISO
// string via fsValToJs, or a plain ISO string written by other ingesters).
function toMillis(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return isFinite(t) ? t : null;
}

// ── Source collectors — each returns [{ slugs:[...], budget:number|null }] ──

async function collectSavedSearches() {
  const docs = await fsList('savedSearches', {
    filter: { field: 'status', op: 'EQUAL', value: 'active' },
    limit: 300,
  });
  const seekers = [];
  for (const d of docs) {
    const c = d.criteria && typeof d.criteria === 'object' ? d.criteria : {};
    const labels = Array.isArray(c.zones) ? c.zones : [];
    const slugs = new Set();
    for (const label of labels) {
      for (const slug of matchZones(label)) slugs.add(slug);
    }
    if (!slugs.size) continue;
    seekers.push({ slugs: [...slugs], budget: budgetNumber(c.budgetMax), key: seekerKey(d) });
  }
  return seekers;
}

// Dedupe key across the three sources: the same person with an active saved
// search AND a pfs client record must count as ONE seeker. The key never
// leaves this module — the payload stays fully anonymized.
function seekerKey(d) {
  const email = String(d.email || '').trim().toLowerCase();
  return email || null;
}

async function collectPfsClients() {
  // fsList supports one fieldFilter only and "active" spans two fields —
  // list and filter in JS instead.
  const docs = await fsList('pfsClients', { limit: 300 });
  const seekers = [];
  for (const d of docs) {
    if (!isActivePfsClient(d)) continue;
    const zoneText = d.preferred_areas || d.zone || '';
    const slugs = matchZones(zoneText);
    if (!slugs.length) continue;
    seekers.push({ slugs, budget: budgetNumber(clientBudgetRange(d)), key: seekerKey(d) });
  }
  return seekers;
}

async function collectLeads() {
  // Recent-first, then window + type filtering in JS (createdAt is a
  // Firestore timestamp on most docs but an ISO string on some ingesters —
  // a typed inequality filter would silently drop one shape).
  const docs = await fsList('leads', {
    orderBy: { field: 'createdAt', direction: 'DESCENDING' },
    limit: 400,
  });
  const cutoff = Date.now() - LEADS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const seekers = [];
  for (const d of docs) {
    if (d.leadType === 'landlord') continue;
    const ts = toMillis(d.createdAt);
    if (ts == null || ts < cutoff) continue;
    const slugs = matchZones(d.zone);
    if (!slugs.length) continue;
    seekers.push({ slugs, budget: budgetNumber(d.budget), key: seekerKey(d) });
  }
  return seekers;
}

// Merge seekers sharing a dedupe key: zones are unioned, the budget of the
// most authoritative source wins (collector order = priority). Keyless rows
// pass through unmerged.
function dedupeSeekers(seekers) {
  const byKey = new Map();
  const out = [];
  for (const s of seekers) {
    if (!s.key) { out.push(s); continue; }
    const prev = byKey.get(s.key);
    if (!prev) {
      const merged = { slugs: [...s.slugs], budget: s.budget };
      byKey.set(s.key, merged);
      out.push(merged);
    } else {
      for (const slug of s.slugs) if (!prev.slugs.includes(slug)) prev.slugs.push(slug);
      if (prev.budget == null) prev.budget = s.budget;
    }
  }
  return out;
}

// ── Aggregation ──

function buildPayload(seekers) {
  const perZone = new Map(
    ZONES.map(z => [z.slug, { key: z.slug, label: z.label, seekers: 0, budgets: [] }])
  );
  let totalSeekers = 0;
  for (const s of seekers) {
    totalSeekers += 1; // once per seeker, however many zones they named
    for (const slug of s.slugs) {
      const entry = perZone.get(slug);
      if (!entry) continue;
      entry.seekers += 1;
      if (s.budget != null) entry.budgets.push(s.budget);
    }
  }

  const zones = [...perZone.values()]
    .filter(z => z.seekers >= 1)
    .map(z => {
      const sorted = z.budgets.sort((a, b) => a - b);
      const enough = sorted.length >= 2;
      return {
        key: z.key,
        label: z.label,
        seekers: z.seekers,
        budgetAvg: enough
          ? Math.round(sorted.reduce((sum, n) => sum + n, 0) / sorted.length)
          : null,
        budgetP25: enough ? Math.round(quantile(sorted, 0.25)) : null,
        budgetP75: enough ? Math.round(quantile(sorted, 0.75)) : null,
      };
    })
    .sort((a, b) => b.seekers - a.seekers);

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    totals: { seekers: totalSeekers, zonesTracked: zones.length },
    zones,
  };
}

// Shared with api/valuation/estimate.js (imported directly — no HTTP hop).
// Throws only when EVERY source fails; partial source failures degrade to
// whatever data is available.
export async function aggregateDemand() {
  const now = Date.now();
  if (_cache && (now - _cacheAt) < CACHE_TTL_MS) return _cache;

  // Order = budget priority for the cross-source dedupe: a paying PFS
  // client's budget is more authoritative than a saved-search ceiling or a
  // lead's free-text budget.
  const results = await Promise.allSettled([
    collectPfsClients(),
    collectSavedSearches(),
    collectLeads(),
  ]);
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length === results.length) {
    // Log internally, expose nothing.
    console.error('[demand/zones] all sources failed:', failures.map(f => f.reason?.message));
    throw new Error('all_sources_failed');
  }
  for (const f of failures) {
    console.warn('[demand/zones] source failed:', f.reason?.message);
  }

  const seekers = dedupeSeekers(
    results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
  );
  const payload = buildPayload(seekers);
  _cache = payload;
  _cacheAt = now;
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const payload = await aggregateDemand();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[demand/zones]', err.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: false, error: 'unavailable' });
  }
}
