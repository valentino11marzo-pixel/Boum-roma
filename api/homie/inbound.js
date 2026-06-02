// api/homie/inbound.js
// Inbound webhook called by the Mac-side Homie agent when it has filtered a
// new lead from one of the upstream channels (Immobiliare, Idealista,
// WhatsApp, intake form forwarder, etc). Writes a new doc to the `leads`
// Firestore collection in the same shape portal.html + cockpit-preview.html
// already read.
//
// ─────────────────────────────────────────────────────────────────────────
// Protocol
// ─────────────────────────────────────────────────────────────────────────
// Method:   POST
// URL:      https://boomrome.com/api/homie/inbound
// Headers:  Content-Type: application/json
//           X-Homie-Secret: <HOMIE_SECRET>          (shared with Mac bridge)
// Body:     {
//   source:        'immobiliare' | 'idealista' | 'whatsapp' | 'web' |
//                  'intake' | 'manual'                       // required
//   name:          string                                    // required
//   email?:        string
//   phone?:        string                                    // raw, will be
//                                                            // normalized
//                                                            // client-side
//   message?:      string                                    // raw lead text
//   language?:     'it' | 'en'
//
//   // Optional structured extracts (Homie can pre-fill if it has them):
//   budget?:       number                                    // €/month
//   zone?:         string                                    // Rome neighborhood
//   situation?:    'worker' | 'student' | 'visitor'
//   propertyId?:   string                                    // FK to listings
//   propertyTitle?: string
//   propertyPrice?: number
//   propertyAddress?: string
//
//   // Homie-grade fields (skipping these = use cockpit client-side heuristic)
//   grade?:        'A' | 'B' | 'C' | 'dead'
//   intent?:       string                                    // free-form
//   confidence?:   number                                    // 0..1
//   tier?:         1 | 2                                     // Haiku vs Sonnet
//
//   // Audit
//   raw?:          object                                    // original payload
//   sourceRef?:    string                                    // upstream id/url
// }
//
// Response 200:   { ok: true, id: '<docId>' }
// Response 400:   { ok: false, error: 'validation' }
// Response 401:   { ok: false, error: 'invalid_secret' }
// Response 500:   { ok: false, error: '<message>' }
// ─────────────────────────────────────────────────────────────────────────

import { fsCreate, requireSecret, readJson } from './_lib.js';

const VALID_SOURCES = new Set(['immobiliare', 'idealista', 'whatsapp', 'web', 'intake', 'manual']);
const VALID_GRADES = new Set(['A', 'B', 'C', 'dead']);
const VALID_SITUATIONS = new Set(['worker', 'student', 'visitor']);

export default async function handler(req, res) {
  // CORS for Mac bridge: only allow POST + the shared secret. No browser
  // origin should ever call this directly, so '*' is acceptable.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!requireSecret(req, res)) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // ── Validation ──────────────────────────────────────────
  const errors = [];
  const src = String(body.source || '').toLowerCase().trim();
  if (!VALID_SOURCES.has(src)) errors.push(`source must be one of ${[...VALID_SOURCES].join(', ')}`);

  const name = String(body.name || '').trim();
  if (!name) errors.push('name is required');

  const hasEmail = body.email && String(body.email).includes('@');
  const hasPhone = body.phone && /\d/.test(String(body.phone));
  if (!hasEmail && !hasPhone) errors.push('email or phone required');

  if (body.grade && !VALID_GRADES.has(body.grade)) errors.push(`grade must be one of ${[...VALID_GRADES].join(', ')}`);
  if (body.situation && !VALID_SITUATIONS.has(body.situation)) errors.push(`situation must be one of ${[...VALID_SITUATIONS].join(', ')}`);
  if (body.budget != null && (typeof body.budget !== 'number' || body.budget < 0)) errors.push('budget must be a non-negative number');
  if (body.language && !['it', 'en'].includes(body.language)) errors.push(`language must be 'it' or 'en'`);

  if (errors.length) return res.status(400).json({ ok: false, error: 'validation', details: errors });

  // ── Build the lead doc ──────────────────────────────────
  // Match the field names portal.html + cockpit-preview.html already read.
  // createdAt is set to NOW server-side here (Firestore REST has no
  // serverTimestamp sentinel without a transform; the difference of a few
  // ms vs Firestore-side stamping is irrelevant for sorting).
  const now = new Date();

  const lead = {
    source: src,
    service: src === 'immobiliare' || src === 'idealista' ? 'Homie' : null, // legacy field used by portal
    name,
    email: body.email || null,
    phone: body.phone || null,
    message: body.message || null,
    language: body.language || null,
    budget: typeof body.budget === 'number' ? body.budget : null,
    zone: body.zone || null,
    situation: body.situation || null,
    notes: body.notes || body.message || null,
    propertyId: body.propertyId || null,
    propertyTitle: body.propertyTitle || null,
    propertyPrice: typeof body.propertyPrice === 'number' ? body.propertyPrice : null,
    propertyAddress: body.propertyAddress || null,
    intakeForm: src === 'intake',
    status: 'new',
    // Homie-supplied (optional)
    grade: body.grade || null,
    intent: body.intent || null,
    confidence: typeof body.confidence === 'number' ? body.confidence : null,
    tier: body.tier === 1 || body.tier === 2 ? body.tier : null,
    // Audit
    ingestedBy: 'homie-inbound',
    sourceRef: body.sourceRef || null,
    raw: body.raw || null,
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[homie/inbound]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
