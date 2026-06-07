// api/apply-lead.js
// Public lead-capture endpoint for the apartment-detail Apply form.
// The website is unauthenticated, and Firestore rules lock `leads` writes to
// admins (`match /leads/{x} { allow read, write: if isAdmin(); }`). Writing
// from the browser therefore fails with PERMISSION_DENIED — which is exactly
// why the Apply form was erroring. We instead write server-side with the
// Firebase admin credentials (reused via _lib), into the SAME `leads` shape
// portal.html + cockpit-preview.html already read (source='web', status='new').
//
// Mirrors /api/canone-lead: public (no shared secret) with layered abuse
// protection — honeypot, required name + (email or phone), length caps, and a
// best-effort per-IP rate limit on the warm instance.
//
// Method: POST
// Body: { name, email, phone, company(honeypot), listingId, listingName,
//         moveIn, duration, occupants, message }
// Response 200: { ok: true, id }  | 4xx/5xx: { ok: false, error }

import { fsCreate, logActivity } from './homie/_lib.js';

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

  const name  = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);

  const hasEmail = email && email.includes('@') && email.includes('.');
  const hasPhone = phone && /\d{6,}/.test(phone.replace(/\D/g, ''));
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
  if (!hasEmail && !hasPhone) return res.status(400).json({ ok: false, error: 'contact_required' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const listingId   = clip(body.listingId, 120);
  const listingName = clip(body.listingName, 160) || 'an apartment';
  const moveIn      = clip(body.moveIn, 40);
  const duration    = clip(body.duration, 40);
  const occupants   = clip(body.occupants, 40);
  const note        = clip(body.message, 600);

  // Human-readable summary for the portal Leads inbox.
  const parts = [`Application for ${listingName}`];
  if (moveIn)    parts.push(`move-in ${moveIn}`);
  if (duration)  parts.push(`stay ${duration}`);
  if (occupants) parts.push(occupants);
  let summary = parts.join(' · ') + '.';
  if (note) summary += ` — “${note}”`;

  const now = new Date();
  const lead = {
    source: 'web',                       // valid source read by portal + cockpit
    service: 'Apartment Application',
    leadType: 'tenant',
    name, email: email || null, phone: phone || null,
    message: summary,
    notes: summary,
    language: 'en',
    listingId: listingId || null,
    listingName,
    moveIn: moveIn || null,
    duration: duration || null,
    occupants: occupants || null,
    intent: 'apply',
    status: 'new',
    grade: null,
    // audit
    ingestedBy: 'apply_form',
    sourceRef: 'apartment-detail',
    raw: { listingId, listingName, moveIn, duration, occupants, note, ip },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity('Application da scheda appartamento', 'lead', { leadId: id, listingId, listingName }, 'apply_form');
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[apply-lead]', err);
    const _d = String((err && err.message) || err).slice(0, 400);
    return res.status(500).json({ ok: false, error: 'internal', detail: _d });
  }
}
