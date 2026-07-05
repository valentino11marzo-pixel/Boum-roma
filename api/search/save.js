// api/search/save.js
// Public save-search endpoint for the apartments discovery page. A visitor
// saves their search (criteria + email) and it becomes a live alert
// subscription: the doc lands in the `savedSearches` Firestore collection,
// visible to the team in the portal and consumable by a matching cron
// (same pattern as `savedSearches` ⇄ new `listings` docs).
//
// Like /api/canone-lead this endpoint is PUBLIC (called from the browser),
// so it has NO shared secret. Abuse protection is layered instead:
//   - honeypot field (`company` must be empty)
//   - required valid email, length caps on everything
//   - best-effort per-IP rate limit (warm-instance memory)
// Firebase admin credentials never leave the server (reused via homie/_lib).
//
// Method: POST
// Body:   {
//   email:        string            // required — the alert channel
//   label?:       string            // user's name for this search
//   criteria: {                     // the discovery page's S state
//     q?, budgetMax?, moveIn?, beds?, baths?, furnished?, video?,
//     zones?: string[], feats?: string[]
//   },
//   resultCount?: number            // matches at save time (context for ops)
//   company?:     string            // honeypot — real users never fill this
// }
// Response 200: { ok: true, id }  |  4xx/5xx: { ok: false, error }

import { fsCreate, logActivity } from '../homie/_lib.js';

// ── Best-effort in-memory rate limit (per warm instance) ──
const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear(); // crude memory guard
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num  = v => (typeof v === 'number' && isFinite(v) ? v : null);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Honeypot: real users never fill this.
  if (body.company) return res.status(200).json({ ok: true, id: 'skip' });

  const email = clip(body.email, 160);
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const c = (body.criteria && typeof body.criteria === 'object') ? body.criteria : {};
  const criteria = {
    q:         clip(c.q, 120),
    budgetMax: num(c.budgetMax),
    moveIn:    clip(c.moveIn, 10),
    beds:      num(c.beds),
    baths:     num(c.baths),
    furnished: !!c.furnished,
    video:     !!c.video,
    zones:     Array.isArray(c.zones) ? c.zones.slice(0, 12).map(z => clip(z, 60)).filter(Boolean) : [],
    feats:     Array.isArray(c.feats) ? c.feats.slice(0, 12).map(f => clip(f, 60)).filter(Boolean) : [],
  };

  try {
    const id = await fsCreate('savedSearches', {
      email,
      label:       clip(body.label, 80),
      criteria,
      resultCount: num(body.resultCount),
      status:      'active',
      source:      'apartments',
      lastNotified: null,
      createdAt:   new Date().toISOString(),
      ip,
    });
    logActivity('saved_search_created', 'search', { email, zones: criteria.zones, budgetMax: criteria.budgetMax }, 'web')
      .catch(() => {});
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('[search/save] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'store_failed' });
  }
}
