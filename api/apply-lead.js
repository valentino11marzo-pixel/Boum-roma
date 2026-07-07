// api/apply-lead.js
// Public lead-capture for the apartment-detail APPLY / RESERVE / WAITLIST
// flow. The moment a visitor passes the quick eligibility check we persist
// the qualification snapshot to the `leads` collection — the SAME shape
// portal.html + cockpit-preview.html already read — so every serious
// applicant lands in the pipeline even if they never reach Stripe.
//
// PUBLIC endpoint (called from the browser) — same layered hardening as
// /api/canone-lead: honeypot (`company`), length caps, per-IP rate limit.
// Firebase admin credentials never leave the server (via homie/_lib).
//
// Method: POST
// Body: { name, email, phone, company(honeypot),
//         listingId, listingName, listingPrice, zone,
//         kind('apply'|'reserve'), waitlist(bool),
//         income(number), guarantor(bool),
//         household('solo'|'couple'|'family'|'flatmates'),
//         occupation('employed'|'self-employed'|'student'|'relocating'),
//         moveIn('YYYY-MM-DD'), durationMonths(number) }
// Response 200: { ok: true, id } | 4xx/5xx: { ok: false, error }

import { fsCreate, logActivity } from './homie/_lib.js';

const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num  = v => { const x = Number(v); return isFinite(x) && x >= 0 ? x : null; };

const HOUSEHOLDS  = new Set(['solo', 'couple', 'family', 'flatmates']);
const OCCUPATIONS = new Set(['employed', 'self-employed', 'student', 'relocating']);

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

  const income     = num(body.income);
  const guarantor  = body.guarantor === true;
  const household  = HOUSEHOLDS.has(body.household) ? body.household : null;
  const occupation = OCCUPATIONS.has(body.occupation) ? body.occupation : null;
  const moveIn     = /^\d{4}-\d{2}-\d{2}$/.test(String(body.moveIn || '')) ? body.moveIn : null;
  const durationM  = num(body.durationMonths);
  const kind       = body.kind === 'reserve' ? 'reserve' : 'apply';
  const waitlist   = body.waitlist === true;

  // Human-readable qualification snapshot for the portal inbox.
  const parts = [];
  parts.push((waitlist ? 'WAITLIST ' : '') + kind.toUpperCase() + ' from listing page');
  if (income != null) parts.push('income €' + income + '/mo');
  if (guarantor)      parts.push('has guarantor');
  if (occupation)     parts.push(occupation);
  if (household)      parts.push('moving in: ' + household);
  if (moveIn)         parts.push('move-in ' + moveIn);
  if (durationM)      parts.push(durationM + ' months');
  const message = parts.join(' · ');

  const now = new Date();
  const lead = {
    source: 'web',
    service: null,
    name,
    email: hasEmail ? email : null,
    phone: hasPhone ? phone : null,
    message,
    notes: message,
    language: 'en',
    budget: num(body.listingPrice),
    zone: clip(body.zone, 80),
    situation: occupation === 'student' ? 'student' : (occupation ? 'worker' : null),
    propertyId: clip(body.listingId, 80),
    propertyTitle: clip(body.listingName, 160),
    propertyPrice: num(body.listingPrice),
    propertyAddress: null,
    intakeForm: false,
    status: 'new',
    grade: null,
    intent: waitlist ? 'waitlist' : kind,
    confidence: null,
    tier: null,
    ingestedBy: 'apply-lead',
    sourceRef: null,
    raw: {
      kind, waitlist, income, guarantor, household, occupation,
      moveIn, durationMonths: durationM, ip,
      ua: clip(req.headers['user-agent'], 300),
    },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    try {
      await logActivity(
        'Apply lead: ' + name + (lead.propertyTitle ? ' → ' + lead.propertyTitle : ''),
        'lead',
        { leadId: id, message },
        'apply-lead'
      );
    } catch { /* activity log is best-effort */ }
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[apply-lead]', err && err.message);
    return res.status(500).json({ ok: false, error: 'store_failed' });
  }
}
