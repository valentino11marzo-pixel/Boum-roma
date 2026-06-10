// api/publish-lead.js
// Public endpoint behind the /ibrido "Pubblica" flow: an owner uploads
// photos + property facts and lands as a real doc in the `leads`
// collection (same shape portal.html already reads), tagged as an
// owner-side lead. Photo thumbnails arrive as small client-compressed
// JPEG data-URLs and are stored inline on the doc (photo1..photo3).
//
// POST { name, phone?, email?, zone, propertyType, mq?, expectedRent?,
//        message?, photos?: [dataUrl x3], website?: honeypot }
// 200 { ok:true, id }   400 validation   429 rate   500 error

import { fsCreate, readJson } from './homie/_lib.js';

const ZONES = new Set(['trastevere', 'testaccio', 'monti', 'prati', 'centro-storico',
  'san-lorenzo', 'ostiense', 'esquilino', 'pigneto', 'trieste', 'altra']);
const TYPES = new Set(['mono', 'bilo', 'trilo', 'quadri']);
const MAX_PHOTO_CHARS = 160_000; // ~120KB binary per thumbnail

// Best-effort per-instance rate limit (Vercel instances are ephemeral).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 6;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'rate' });

  let b;
  try { b = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'json' }); }

  if (b.website) return res.status(200).json({ ok: true, id: 'ok' }); // honeypot: pretend success
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  const email = String(b.email || '').trim();
  const zone = String(b.zone || '').trim();
  const propertyType = String(b.propertyType || '').trim();
  if (name.length < 2 || name.length > 80) return res.status(400).json({ ok: false, error: 'name' });
  if (!phone && !email) return res.status(400).json({ ok: false, error: 'contact' });
  if (!ZONES.has(zone) || !TYPES.has(propertyType)) return res.status(400).json({ ok: false, error: 'fields' });

  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 3) : [];
  for (const p of photos) {
    if (typeof p !== 'string' || !p.startsWith('data:image/jpeg;base64,') || p.length > MAX_PHOTO_CHARS) {
      return res.status(400).json({ ok: false, error: 'photo' });
    }
  }

  const doc = {
    source: 'web',
    channel: 'ibrido-publish',
    leadType: 'owner',
    status: 'new',
    grade: 'A', // an owner self-publishing is the hottest supply lead we have
    intent: 'owner wants BOOM to rent & manage their property (first rental free)',
    name,
    phone,
    email,
    zone,
    propertyType,
    mq: Math.max(0, Math.min(1000, parseInt(b.mq, 10) || 0)),
    expectedRent: Math.max(0, Math.min(20000, parseInt(b.expectedRent, 10) || 0)),
    message: String(b.message || '').slice(0, 1500),
    photoCount: photos.length,
    photo1: photos[0] || '',
    photo2: photos[1] || '',
    photo3: photos[2] || '',
    language: 'it',
    sourceRef: 'ibrido.html',
    ip,
    createdAt: new Date().toISOString(),
  };

  try {
    const { id } = await fsCreate('leads', doc);
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('publish-lead', e);
    return res.status(500).json({ ok: false, error: 'server' });
  }
}
