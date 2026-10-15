// Anonymous, consented page-view summaries from js/boom-track.js.
// Stores no IP, raw user-agent, form value, query string or free text.
import { fsPatch } from '../homie/_lib.js';
import BEHAVIOR from '../../js/behavior-engine.js';

const HITS = new Map();
const WINDOW = 60 * 1000, MAX = 90;
function clip(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function limited(ip) {
  const now = Date.now(), xs = (HITS.get(ip) || []).filter(x => now - x < WINDOW);
  xs.push(now); HITS.set(ip, xs); if (HITS.size > 3000) HITS.clear();
  return xs.length > MAX;
}
function sameOrigin(req) {
  const origin = clip(req.headers.origin, 200), host = clip(req.headers.host, 200);
  if (!origin) return false;
  try {
    const h = new URL(origin).host;
    if (h === host) return true;
    return ['www.boomrome.com', 'boomrome.com'].includes(h) &&
      ['www.boomrome.com', 'boomrome.com'].includes(host);
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: 'origin_not_allowed' });
  const ip = clip((req.headers['x-forwarded-for'] || '').split(',')[0], 80) || 'unknown';
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  const now = new Date();
  const doc = BEHAVIOR.normalizeJourney(b, now);
  if (!doc) return res.status(400).json({ ok: false, error: 'invalid_payload' });
  try {
    await fsPatch('webJourneys/' + doc.pageViewId, doc);
    return res.status(204).end();
  } catch (e) {
    console.error('[analytics/collect] write failed:', e.message);
    return res.status(503).json({ ok: false, error: 'temporarily_unavailable' });
  }
}
