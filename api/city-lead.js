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
import { CITY_MARKETS, cityPhone } from './_market.js';
import { attributionFromReq } from './_attribution.js';

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

// The door's month <select> (v2, 16/10) posts "YYYY-MM"; the operator reads
// "February 2027". A fixed table, never Intl: a runtime with small-ICU prints
// "M02" and the lead would carry it (the lesson of itNum). Anything that is
// not YYYY-MM — the free text of the classic field, "not sure yet", a date
// typed by hand — stays verbatim: the label is a courtesy, never a rewrite.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
export function moveInLabel(v) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(v || '').trim());
  if (!m) return v == null ? null : v;
  const mi = parseInt(m[2], 10);
  if (mi < 1 || mi > 12) return v;
  return `${MONTHS[mi - 1]} ${m[1]}`;
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
  const phoneTyped = clip(body.phone, 40);
  // Stored as E.164 read with the DESK's country (api/_market.js cityPhone):
  // the client's WhatsApp reply arrives as '+31612345678', and a number kept
  // as typed ('+31 6 12345678', '06 …') never matched it — the reply became
  // a new Rome lead. The typed value stays in raw.phone.
  const phone = cityPhone(phoneTyped, cityKey) || phoneTyped;
  // One page load = one request id (assets/boom-city.js): a submit retried
  // after a timeout lands on the same document instead of a second lead.
  const requestId = /^[a-z0-9]{8,40}$/i.test(String(body.requestId || '')) ? String(body.requestId) : null;

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
  const moveInRaw = clip(body.moveIn, 40);
  const moveIn = moveInLabel(moveInRaw);
  const situation = clip(body.situation, 160);
  const areas = clip(body.areas, 160);
  const message = clip(body.message, 1000);
  // What the page's Check-in learned (v1.2): the three answers in words and
  // the papers in hand ("6/8 · missing: …"). Free text from the page, so
  // clipped like everything else; empty when the client never used it.
  const checkin = clip(body.checkin, 80);
  const dossier = clip(body.dossier, 200);

  // Human-readable summary for the portal Leads inbox + the Telegram card.
  // The operator reads THIS line: the city first (it decides the market and
  // the voice), then the service, then the numbers that shape the answer.
  const parts = [];
  parts.push(service && service !== 'unsure' ? SERVICES[service] : 'service to decide');
  if (budgetBand) parts.push(`${budgetBand}/month`);
  if (moveIn) parts.push(`move-in ${moveIn}`);
  if (situation) parts.push(situation);
  if (areas) parts.push(areas);
  if (checkin) parts.push(`check-in: ${checkin}`);
  if (dossier) parts.push(`papers ${dossier}`);
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
    attribution: attributionFromReq(req, body),   // first consented touch, never blocking
    city: {
      key: cityKey,
      label: city.label,
      mode: waitlist ? 'waitlist' : 'search',
      service,
      serviceLabel: service ? SERVICES[service] : null,
      situation,
      areas,
      checkin,
      dossier,
      at: now.toISOString(),
    },
    raw: { city: cityKey, service: serviceKey || null, budget: budgetBand, moveIn: moveInRaw, situation, areas, checkin, dossier, message, phone: phoneTyped, requestId, ip },
    createdAt: now,
    ingestedAt: now,
  };

  try {
    let id;
    try {
      ({ id } = await fsCreate('leads', lead, requestId ? `city_${requestId}` : undefined));
    } catch (e) {
      // the same page load already filed this lead: success, nobody re-pinged
      if (e && e.exists && requestId) return res.status(200).json({ ok: true, id: `city_${requestId}`, duplicate: true });
      throw e;
    }

    // AWAITED, under a cap: on Vercel a write left in flight when the
    // response goes out can die with the function (the 13/09 lesson). A
    // failed notify still only means the next pulse instead of now.
    const notify = fsCreate('agentNotifications', {
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
    const activity = Promise.resolve(logActivity(`Lead ${city.label} (tenant-side search)`, 'lead', { leadId: id, city: cityKey, service, budgetBand }, 'city-lead')).catch(() => {});
    await Promise.race([Promise.allSettled([notify, activity]), new Promise((r) => setTimeout(r, 5000))]);

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[city-lead]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
