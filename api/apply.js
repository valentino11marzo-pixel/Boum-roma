// api/apply.js
// Public application/inquiry endpoint for the apartment listing pages.
//
// Why this exists: apartment-detail.html used to write applications straight to
// the `leads` collection from the browser (db.collection('leads').add(...)).
// That worked only while the security rules allowed public writes. The portal
// security refactor locked `leads` to admin-only (firestore.rules:
// `match /leads/{x} { allow read, write: if isAdmin(); }`), so every
// application submitted by a visitor now fails with PERMISSION_DENIED —
// silently losing the lead. This endpoint writes the lead server-side under
// admin credentials, mirroring api/canone-lead.js. Same `leads` shape
// portal.html + cockpit-preview.html already read — no fork.
//
// Method: POST
// Body:   { name, email, phone, moveIn, duration, occupants, message,
//           listingId, listingName, company(honeypot) }
// Response 200: { ok: true, id }   | 4xx/5xx: { ok: false, error }

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

  const moveIn      = clip(body.moveIn || body.movein, 40);
  const duration    = clip(body.duration, 40);
  const occupants   = clip(body.occupants, 40);
  const message     = clip(body.message, 1000);
  const listingId   = clip(body.listingId, 80);
  const listingName = clip(body.listingName, 160);

  // Human-readable summary for the portal Leads inbox.
  const parts = [];
  if (listingName) parts.push(`Candidatura per "${listingName}"`);
  if (moveIn)    parts.push(`move-in ${moveIn}`);
  if (duration)  parts.push(duration);
  if (occupants) parts.push(occupants);
  const summary = (parts.join(' · ') || 'Candidatura appartamento') + (message ? ` — ${message}` : '');

  const now = new Date();
  // Keep the exact field shape apartment-detail.html wrote before the refactor
  // (portal reads these), plus audit fields.
  const lead = {
    source: 'apartment-detail',    // preserved so portal's existing display is unchanged
    service: 'Application',
    type: 'application',
    name, email: email || null, phone: phone || null,
    moveIn, duration, occupants,
    message: message || summary,
    notes: summary,
    language: null,
    listingId, listingName,
    propertyId: listingId,
    propertyTitle: listingName,
    intent: 'apartment-detail',
    status: 'new',
    grade: null,
    // audit
    ingestedBy: 'apply',
    sourceRef: listingId,
    raw: { ip },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity('Candidatura appartamento', 'lead', { leadId: id, listingId, listingName }, 'apply');

    // Fire-and-forget event for the realtime daemon on the Mac Mini. If notify
    // fails the lead is already saved — the regular pulse picks it up. Never
    // block the user's response on this.
    fsCreate('agentNotifications', {
      type: 'lead.new',
      summary: `Candidatura · ${name}${listingName ? ' · ' + listingName : ''}`,
      priority: 'high',
      ref: { collection: 'leads', id },
      payload: { name, email, phone, listingId, listingName, source: 'apply' },
      dedupKey: `lead-${id}`,
      status: 'pending',
      actor: 'apply',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }).catch(e => console.warn('[apply] notify failed:', e.message));

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[apply]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
