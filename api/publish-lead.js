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

import { fsCreate, fsPatch, readJson } from './homie/_lib.js';

// 3 photos (~160KB base64 each) + fields fit under Vercel's 1MB body cap and
// Firestore's 1MB doc cap, but make the intent explicit rather than implicit.
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const ZONES = new Set(['trastevere', 'testaccio', 'monti', 'prati', 'centro-storico',
  'san-lorenzo', 'ostiense', 'esquilino', 'pigneto', 'trieste', 'altra']);
const TYPES = new Set(['mono', 'bilo', 'trilo', 'quadri']);
const MAX_PHOTO_CHARS = 160_000; // ~120KB binary per thumbnail
// email/phone are rendered in the admin portal (mailto:/tel: hrefs) — keep markup
// and quotes out so a public POST can't store a stored-XSS payload.
const EMAIL_RE = /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[a-z]{2,}$/i;
const PHONE_RE = /^[+\d][\d\s().\-]{5,24}$/;
const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const clampInt = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));

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
  // Reject markup / control chars: this name is rendered in the admin portal.
  if (name.length < 2 || name.length > 80 || /[<>\x00-\x1f]/.test(name)) {
    return res.status(400).json({ ok: false, error: 'name' });
  }
  if (!phone && !email) return res.status(400).json({ ok: false, error: 'contact' });
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email' });
  if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ ok: false, error: 'phone' });
  if (!ZONES.has(zone) || !TYPES.has(propertyType)) return res.status(400).json({ ok: false, error: 'fields' });

  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 3) : [];
  for (const p of photos) {
    if (typeof p !== 'string' || !PHOTO_RE.test(p) || p.length > MAX_PHOTO_CHARS) {
      return res.status(400).json({ ok: false, error: 'photo' });
    }
  }

  // Estimate snapshot from the /ibrido calculator (all optional, sanitised) —
  // lets the team open the call with the exact figure the owner saw.
  const e = b.estimate && typeof b.estimate === 'object' ? b.estimate : null;
  const estimate = e ? {
    zona: String(e.zona || '').slice(0, 80).replace(/[<>\x00-\x1f]/g, ''),
    mq: clampInt(e.mq, 900),
    mensile: clampInt(e.mensile, 100000),
    annuo: clampInt(e.annuo, 2000000),
    risparmioAnnuo: clampInt(e.risp ?? e.risparmioAnnuo, 500000),
  } : null;

  const doc = {
    source: 'web',
    channel: 'ibrido-publish',
    leadType: 'owner',
    status: 'new',
    approvalStatus: 'pending', // owner submitted; BOOM curates & approves before it goes live
    grade: 'A', // an owner submitting their property is the hottest supply lead we have
    intent: 'owner submitted property for BOOM curation + approval (online within 1h, first rental free)',
    name,
    phone,
    email,
    zone,
    propertyType,
    mq: Math.max(0, Math.min(1000, parseInt(b.mq, 10) || 0)),
    expectedRent: Math.max(0, Math.min(20000, parseInt(b.expectedRent, 10) || 0)),
    estimate,
    message: String(b.message || '').slice(0, 1500),
    photoCount: photos.length, // bytes live in leadPhotos/<id>, off the hot list query
    consent: {
      given: b.consent === true,
      text: String(b.consentText || '').slice(0, 400),
      at: new Date().toISOString(),
      ip,
    },
    language: 'it',
    sourceRef: 'ibrido.html',
    ip,
    createdAt: new Date().toISOString(),
  };

  try {
    const { id } = await fsCreate('leads', doc);
    // Photos are written to a sibling doc so portal.html / cockpit lead-list
    // reads (.limit(100) / realtime .limit(50)) never pull the base64 blobs.
    if (photos.length) {
      try {
        await fsPatch(`leadPhotos/${id}`, { leadId: id, photos, createdAt: doc.createdAt });
      } catch (e) {
        console.error('publish-lead photos', e); // lead already saved — don't fail the submit
      }
    }
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('publish-lead', e);
    return res.status(500).json({ ok: false, error: 'server' });
  }
}
