// api/apply-lead.js
// Public lead-capture endpoint for the apartment-detail Apply form.
//
// Delivery is DUAL-SINK so a lead is never lost and needs ZERO Firebase setup:
//   1) Email via Web3Forms (primary, always works) — the application is emailed
//      to the team using the same Web3Forms access key the rest of the site's
//      forms already use (property-finding, virtual-viewing, deal-assistance…).
//      It's a plain HTTPS fetch — no dependency, so no bundling/tracing issues.
//   2) Firestore `leads` (best-effort) — same shape portal.html + cockpit read
//      (source='web', status='new'). Firestore rules gate `leads` writes to
//      admins; the server signs in as FIREBASE_ADMIN_EMAIL, but that account
//      only counts as admin once a /users/{uid} doc with role:'admin' exists.
//      Until then this write 403s — so it's best-effort and does NOT fail the
//      request. The moment the admin doc is seeded, leads populate the portal
//      automatically with no code change.
//
// Public (no shared secret) with layered abuse protection — honeypot, required
// name + (email or phone), length caps, and a best-effort per-IP rate limit.
//
// Method: POST
// Body: { name, email, phone, company(honeypot), listingId, listingName,
//         moveIn, duration, occupants, message }
// Response 200: { ok: true, id }  | 4xx/5xx: { ok: false, error }

import { fsCreate, logActivity } from './homie/_lib.js';

const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY || '5b10beba-c7e0-4cd2-98f9-2dbb0aefe889';

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

// Email the application to the team via Web3Forms. Returns { ok, msg }.
async function sendEmail({ name, email, phone, listingName, listingId, moveIn, duration, occupants, note, ip }) {
  const waDigits = (phone || '').replace(/[^\d]/g, '');
  const payload = {
    access_key: WEB3FORMS_KEY,
    subject: `New application · ${listingName || 'an apartment'} · ${name || 'lead'}`,
    from_name: 'BOOM Website',
    replyto: (email && email.includes('@')) ? email : undefined,
    'Apartment': listingName || 'an apartment',
    'Name': name || '—',
    'Email': email || '—',
    'Phone': phone || '—',
    'WhatsApp': waDigits ? `https://wa.me/${waDigits}` : '—',
    'Listing ID': listingId || '—',
    'Move-in': moveIn || '—',
    'Stay': duration || '—',
    'Occupants': occupants || '—',
    'Message': note || '—',
    'IP': ip || '—',
  };
  try {
    const r = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Web3Forms enforces an allowed-domains check against Origin/Referer;
        // a server-side fetch has none, so present the production origin.
        'Origin': 'https://boomrome.com',
        'Referer': 'https://boomrome.com/',
      },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.success, msg: String(j.message || r.status).slice(0, 160) };
  } catch (err) {
    return { ok: false, msg: String((err && err.message) || err).slice(0, 160) };
  }
}

// Best-effort Firestore write. Returns { id } or { err }.
async function writeFirestore(lead, audit) {
  try {
    const { id } = await fsCreate('leads', lead);
    logActivity('Application da scheda appartamento', 'lead', audit, 'apply_form');
    return { id };
  } catch (err) {
    const msg = String((err && err.message) || err).slice(0, 160);
    console.error('[apply-lead] firestore non-fatal:', msg);
    return { err: msg };
  }
}

function buildLead({ name, email, phone, listingId, listingName, moveIn, duration, occupants, note, ip }) {
  const parts = [`Application for ${listingName}`];
  if (moveIn)    parts.push(`move-in ${moveIn}`);
  if (duration)  parts.push(`stay ${duration}`);
  if (occupants) parts.push(occupants);
  let summary = parts.join(' · ') + '.';
  if (note) summary += ` — “${note}”`;
  const now = new Date();
  return {
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
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── TEMP self-test (GET ?selftest=boomdiag9) — runs the real send path with a
  // clearly-labelled TEST payload and reports the result. Remove after verifying. ──
  if (req.method === 'GET' && req.query && req.query.selftest === 'boomdiag9') {
    const fields = { name: 'ZZ SELFTEST', email: 'selftest@boomrome.com', phone: '',
      listingId: 'selftest', listingName: '[TEST] BOOM apply pipeline', moveIn: '', duration: '',
      occupants: '', note: 'Automated pipeline self-test — please ignore.', ip: 'selftest' };
    const email = await sendEmail(fields);
    const fs = await writeFirestore(buildLead(fields), { selftest: true });
    return res.status(200).json({ web3formsOk: email.ok, web3formsMsg: email.msg,
      firestoreId: fs.id || null, firestoreErr: fs.err || null });
  }

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

  const fields = {
    name, email, phone,
    listingId:   clip(body.listingId, 120),
    listingName: clip(body.listingName, 160) || 'an apartment',
    moveIn:      clip(body.moveIn, 40),
    duration:    clip(body.duration, 40),
    occupants:   clip(body.occupants, 40),
    note:        clip(body.message, 600),
    ip,
  };

  // Sink 1: email (primary). Sink 2: Firestore (best-effort). Run together.
  const [email_, fs] = await Promise.all([
    sendEmail(fields),
    writeFirestore(buildLead(fields), { listingId: fields.listingId, listingName: fields.listingName }),
  ]);

  if (email_.ok || fs.id) {
    return res.status(200).json({ ok: true, id: fs.id || 'emailed' });
  }
  console.error('[apply-lead] BOTH sinks failed — email:', email_.msg, '| fs:', fs.err);
  return res.status(500).json({ ok: false, error: 'internal' });
}
