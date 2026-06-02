// api/canone-lead.js
// Public lead-capture endpoint for the /canone tool (Canone Concordato
// calculator). When a landlord asks for the certified calculation, we write
// a new doc to the `leads` collection — the SAME shape portal.html and
// cockpit-preview.html already read — so the lead flows straight into the
// existing Homie / portal pipeline (status='new', source='web').
//
// Unlike /api/homie/inbound this endpoint is PUBLIC (called from the browser),
// so it has NO shared secret. Abuse protection is layered instead:
//   - honeypot field (`company` must be empty)
//   - required name + (email or phone), length caps
//   - best-effort per-IP rate limit (warm-instance memory)
// The Firebase admin credentials never leave the server (reused via _lib).
//
// Method: POST   Body: { name, email, phone, company(honeypot), calc{...} }
// Response 200: { ok: true, id }  | 4xx/5xx: { ok: false, error }

import { fsCreate, logActivity } from './homie/_lib.js';

// ── Best-effort in-memory rate limit (per warm instance) ──
const HITS = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
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

  // ── Calc snapshot from the tool (all optional / sanitised) ──
  const c = body.calc && typeof body.calc === 'object' ? body.calc : {};
  const calc = {
    zona: clip(c.zona, 80), zoneCode: clip(c.zoneCode, 12), fascia: clip(c.fascia, 2),
    mq: num(c.mq), supConv: num(c.supConv), arredo: clip(c.arredo, 12),
    contratto: clip(c.contratto, 12), classeEn: clip(c.classeEn, 12), eurMq: num(c.eurMq),
    mensile: num(c.mensile), annuo: num(c.annuo), cedolare10: num(c.cedolare10),
    risparmioAnnuo: num(c.risparmioAnnuo), rangeMin: num(c.rangeMin), rangeMax: num(c.rangeMax),
  };

  // Human-readable summary for the portal Leads inbox.
  const parts = [];
  if (calc.zona) parts.push(`Zona: ${calc.zona}`);
  if (calc.mq) parts.push(`${calc.mq} mq (fascia ${calc.fascia || '?'})`);
  if (calc.mensile) parts.push(`canone stimato ~€${calc.mensile}/mese`);
  if (calc.risparmioAnnuo) parts.push(`risparmio fiscale ~€${calc.risparmioAnnuo}/anno`);
  const summary = parts.length
    ? `Richiesta calcolo certificato canone concordato — ${parts.join(' · ')}.`
    : 'Richiesta calcolo certificato canone concordato.';

  const now = new Date();
  const lead = {
    source: 'web',                 // valid source read by portal + cockpit
    service: 'Canone Check',       // legacy label field used by portal
    leadType: 'landlord',          // proprietario, non inquilino
    name, email: email || null, phone: phone || null,
    message: summary,
    notes: summary,
    language: 'it',
    zone: calc.zona || null,
    budget: calc.mensile || null,  // gives the lead a € figure in the inbox
    intent: 'canone_check',
    status: 'new',
    grade: null,
    propertyAddress: calc.zona || null,
    // audit
    ingestedBy: 'canone-check',
    sourceRef: 'canone-check',
    raw: { calc, ip },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity('Lead da Canone Check', 'lead', { leadId: id, zona: calc.zona, mensile: calc.mensile }, 'canone-check');
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[canone-lead]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
