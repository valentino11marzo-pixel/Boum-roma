// api/city-lead.js
// Public lead-capture for the BOOM city pages (/amsterdam, /madrid,
// /barcelona, /paris, /berlin — the closed list is CITY_MARKETS in
// _market.js; BOOM_CITIES_BRIEF.md). A city in
// `mode: 'waitlist'` (Barcelona: no intermediation in Catalonia without AICAT
// registration) files the SAME tenant lead, but says so: intent
// `city_waitlist`, summary head "BARCELONA — waitlist", so the operator never
// reads a file opened as a search to start.
//
// The design decision that carries the file is the same as executive-lead:
// this person is a TENANT — someone searching a home for themselves — so the
// lead rides the existing machine (Lead Brain → notify-pending → the
// operator) in the shared `leads` schema. What is different is the MARKET:
// the Rome machine must not answer. `market` + `sourceRef` are what
// api/_market.js reads (isCityMarket) to make the Commerciale stand down and
// to hand the Telegram card the right pre-written reply. The lead is written
// first; the guard is read downstream — one source of truth for "which
// market is this", never a fork of the pipeline.
//
// The city comes from a CLOSED list. A page can only post the slug the build
// gave it, and an unknown value is a 400, not a lead filed under a city that
// does not exist.
//
// Hardening identical to the other public forms (executive-lead, reunion-lead,
// apply-lead): honeypot `company`, required name + (email or phone), length
// caps, best-effort per-IP rate limit.
//
// Method: POST   Body: { city, name, email, phone, moveIn, budget(band),
//                        service, situation, areas, message, company(honeypot) }
// Response 200: { ok: true, id } | 4xx/5xx: { ok: false, error }

import { fsCreate, logActivity } from './homie/_lib.js';
import { CITY_MARKETS } from './_market.js';

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

// The services a city page sells, by the id the build prints on the plates
// and in the <select>. Free text never enters: an unknown value falls to
// null (and the summary says "service to decide"), never to an invented label.
export const SERVICES = {
  'full-search':      'Full Search',
  'application-pack': 'Application Pack',
  'attended-viewing': 'Attended Viewing',
  'unsure':           'not sure yet',
};

// "€1,500 – €2,000" → 2000, "€3,500+" → 3500, "Under €1,500" → 1500. The band
// stays verbatim on the lead; the number exists so the Brain and the inbox
// can sort by budget like every other lead. Never invented: no digits → null.
export function bandCeiling(band) {
  const nums = String(band || '').match(/\d[\d.,]*/g);
  if (!nums) return null;
  const vals = nums.map(s => parseInt(s.replace(/[.,]/g, ''), 10)).filter(n => isFinite(n) && n > 0);
  return vals.length ? Math.max(...vals) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Honeypot: real users never fill this. Answer 200 so the bot learns nothing.
  if (body.company) return res.status(200).json({ ok: true, id: 'skip' });

  const cityKey = String(body.city || '').toLowerCase().trim();
  const city = CITY_MARKETS[cityKey];
  if (!city) return res.status(400).json({ ok: false, error: 'unknown_city' });
  const waitlist = city.mode === 'waitlist';

  const name  = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);

  const hasEmail = email && email.includes('@') && email.includes('.');
  const hasPhone = phone && /\d{6,}/.test(phone.replace(/\D/g, ''));
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
  if (!hasEmail && !hasPhone) return res.status(400).json({ ok: false, error: 'contact_required' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const serviceKey = String(body.service || '').toLowerCase();
  const service = SERVICES[serviceKey] ? serviceKey : null;
  const budgetBand = clip(body.budget, 40);
  const budget = bandCeiling(budgetBand);
  const moveIn = clip(body.moveIn, 40);
  const situation = clip(body.situation, 160);
  const areas = clip(body.areas, 160);
  const message = clip(body.message, 1000);

  // Human-readable summary for the portal Leads inbox + the Telegram card.
  // The operator reads THIS line: the city first (it decides the market and
  // the voice), then the service, then the numbers that shape the answer.
  const parts = [];
  parts.push(service && service !== 'unsure' ? SERVICES[service] : 'service to decide');
  if (budgetBand) parts.push(`${budgetBand}/month`);
  if (moveIn) parts.push(`move-in ${moveIn}`);
  if (situation) parts.push(situation);
  if (areas) parts.push(areas);
  const summary = [
    `${city.label.toUpperCase()} — ${waitlist ? 'waitlist (desk opening with a registered partner)' : 'tenant-side search'} · ${parts.join(' · ')}.`,
    message,
  ].filter(Boolean).join(' ');

  const now = new Date();
  const lead = {
    source: 'web',                 // valid source read by portal + cockpit
    service: `BOOM ${city.label}`,
    market: cityKey,               // what api/_market.js isCityMarket() reads
    leadType: 'tenant',            // a person seeking a home — NOT B2B
    name, email: email || null, phone: phone || null,
    message: summary,
    notes: summary,
    // The page is English-only and this audience is foreign: 'en' is the
    // honest default. replyLang() re-decides from their actual words.
    language: 'en',
    zone: areas,
    budget,
    budgetBand,
    budgetKind: 'monthly',
    moveIn,
    intent: waitlist ? 'city_waitlist' : 'city_search',
    status: 'new',
    grade: null,
    propertyAddress: null,
    // audit
    ingestedBy: 'city-lead',
    sourceRef: `city-${cityKey}`,
    city: {
      key: cityKey,
      label: city.label,
      mode: waitlist ? 'waitlist' : 'search',
      service,
      serviceLabel: service ? SERVICES[service] : null,
      situation,
      areas,
      at: now.toISOString(),
    },
    raw: { city: cityKey, service: serviceKey || null, budget: budgetBand, moveIn, situation, areas, message, ip },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    const { id } = await fsCreate('leads', lead);
    logActivity(`Lead ${city.label} (tenant-side search)`, 'lead', { leadId: id, city: cityKey, service, budgetBand }, 'city-lead');

    // Fire-and-forget: the lead is already saved, so a failed notify only
    // means the operator hears about it on the next pulse instead of now.
    fsCreate('agentNotifications', {
      type: 'lead.new',
      summary: `${city.flag} ${city.label.toUpperCase()}${waitlist ? ' · waitlist' : ''} · ${name}` +
        (service && service !== 'unsure' ? ` · ${SERVICES[service]}` : '') +
        (budgetBand ? ` · ${budgetBand}` : '') +
        (moveIn ? ` · ${moveIn}` : ''),
      priority: 'high',
      ref: { collection: 'leads', id },
      payload: { name, email, phone, city: cityKey, service, budgetBand, moveIn, source: 'city-lead' },
      dedupKey: `lead-${id}`,
      status: 'pending',
      actor: 'city-lead',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }).catch(e => console.warn('[city-lead] notify failed:', e.message));

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[city-lead]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
