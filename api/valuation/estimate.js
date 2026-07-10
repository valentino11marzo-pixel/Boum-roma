// api/valuation/estimate.js
// POST /api/valuation/estimate — public instant rent-valuation for landlords
// ("Quanto rende il tuo appartamento?"). Computes a €/month estimate from
// real market comparables (pfsProperties radar + own listings), enriches it
// with the zone's live tenant demand, and captures the landlord as a lead.
//
// Body: { zona, mq, camere, bagni, arredato, condizione, name, email,
//         phone?, company(honeypot) }
// 200:  { ok:true, estimate, range:{min,max}, pricePerSqm, compsCount,
//         zoneLabel, citywide, demand:{seekers,budgetAvg}|null }
// else: { ok:false, error:'invalid_email'|'invalid_input'|'rate_limited'|... }
//
// Hardening mirrors api/canone-lead.js: honeypot `company`, per-IP in-memory
// rate limit, clip/num sanitizers, email regex. Firebase admin creds never
// leave the server (api/homie/_lib.js). Lead-write failure NEVER fails the
// valuation response.

import { fsList, fsCreate, logActivity } from '../homie/_lib.js';
import { ZONE_BY_SLUG, matchZone, matchZoneStrict, median, quantile } from '../demand/_zones.js';
import { aggregateDemand } from '../demand/zones.js';

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
const num  = v => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return isFinite(n) ? n : null;
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const COMP_WINDOW_DAYS = 180;
const MIN_COMP_SQM = 20;
const MIN_ZONE_COMPS = 5;
const CONDIZIONI = new Set(['ottimo', 'buono', 'da_rinnovare']);
const DEAD_LISTING_STATUSES = new Set(['rented', 'affittato', 'off_market', 'draft', 'hidden', 'archived']);

function toMillis(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return isFinite(t) ? t : null;
}

// ── Comparables — pfsProperties radar + own listings, zone-tagged ──────────
// Returns [{ slug, price, sqm, ppsm }] — only docs that match a canon zone
// and have usable price + sqm (>= MIN_COMP_SQM).
async function loadComps() {
  const [pfsRes, listRes] = await Promise.allSettled([
    fsList('pfsProperties', {
      orderBy: { field: 'lastSeenAt', direction: 'DESCENDING' },
      limit: 500,
    }),
    fsList('listings', { limit: 300 }),
  ]);
  if (pfsRes.status === 'rejected') console.warn('[valuation] pfsProperties failed:', pfsRes.reason?.message);
  if (listRes.status === 'rejected') console.warn('[valuation] listings failed:', listRes.reason?.message);

  const cutoff = Date.now() - COMP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const comps = [];

  for (const d of (pfsRes.status === 'fulfilled' ? pfsRes.value : [])) {
    const price = num(d.price);
    if (!price || price <= 0) continue;
    const seen = toMillis(d.lastSeenAt) ?? toMillis(d.scrapedAt);
    if (seen == null || seen < cutoff) continue;
    // Structured zone field first (trusts "Centro"); titles/addresses only
    // via the strict matcher — "vicino al centro commerciale" in a title
    // must not classify an EUR flat as Centro Storico.
    const slug = matchZone(d.zone)
      || matchZoneStrict([d.address, d.title].filter(Boolean).join(' '));
    if (!slug) continue; // no canon-zone match → excluded even from citywide
    const sqm = num(d.sqm);
    if (!sqm || sqm < MIN_COMP_SQM) continue;
    comps.push({ slug, price, sqm, ppsm: price / sqm });
  }

  for (const d of (listRes.status === 'fulfilled' ? listRes.value : [])) {
    const status = String(d.status || '').toLowerCase().trim();
    if (DEAD_LISTING_STATUSES.has(status)) continue;
    const price = num(d.price);
    if (!price || price <= 0) continue;
    const slug = matchZone([d.zone, d.neighborhood].filter(Boolean).join(' '))
      || matchZoneStrict([d.address, d.title, d.name].filter(Boolean).join(' '));
    if (!slug) continue;
    const sqm = num(d.sqm) ?? num(d.size);
    if (!sqm || sqm < MIN_COMP_SQM) continue;
    comps.push({ slug, price, sqm, ppsm: price / sqm });
  }

  return comps;
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

  // Honeypot: real users never fill this.
  if (body.company) return res.status(200).json({ ok: true, id: 'skip' });

  // ── Validate input ──
  const zonaRaw = clip(body.zona, 80);
  const mq      = num(body.mq);
  const camere  = num(body.camere);
  const bagni   = num(body.bagni);
  const arredato = body.arredato === true;
  const condizione = CONDIZIONI.has(body.condizione) ? body.condizione : 'buono';

  if (!zonaRaw ||
      mq == null || mq < 20 || mq > 400 ||
      camere == null || !Number.isInteger(camere) || camere < 0 || camere > 6 ||
      bagni == null || !Number.isInteger(bagni) || bagni < 1 || bagni > 4) {
    return res.status(400).json({ ok: false, error: 'invalid_input' });
  }

  const name  = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);
  if (!name) return res.status(400).json({ ok: false, error: 'invalid_input' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  // ── Resolve the zone (slug or free label; unknown zone → citywide) ──
  const slug = matchZone(zonaRaw);
  const zoneLabel = slug ? ZONE_BY_SLUG.get(slug).label : zonaRaw;

  try {
    // ── Comparable set ──
    const allComps = await loadComps();
    const zoneComps = slug ? allComps.filter(c => c.slug === slug) : [];
    const citywide = zoneComps.length < MIN_ZONE_COMPS;
    const used = citywide ? allComps : zoneComps;

    if (used.length === 0) {
      return res.status(200).json({ ok: false, error: 'no_data' });
    }

    // ── Engine ──
    const ppsmSorted = used.map(c => c.ppsm).sort((a, b) => a - b);
    const pricePerSqm = median(ppsmSorted);
    const compMedianSqm = median(used.map(c => c.sqm));

    let factor = 1;
    if (arredato) factor *= 1.06;
    if (condizione === 'ottimo') factor *= 1.05;
    else if (condizione === 'da_rinnovare') factor *= 0.90;
    // Small flats rent at a higher €/m² — apply only when the comp set
    // itself skews large (median mq > 55), otherwise the premium is
    // already baked into the comps.
    if (mq < 45 && compMedianSqm > 55) factor *= 1.08;

    const estimate = Math.round(pricePerSqm * mq * factor);
    let min = Math.round(quantile(ppsmSorted, 0.25) * mq * factor);
    let max = Math.round(quantile(ppsmSorted, 0.75) * mq * factor);
    // Clamp sane: min < estimate < max, always.
    min = Math.min(min, estimate - 1);
    max = Math.max(max, estimate + 1);
    if (min < 1) min = 1;

    // ── Zone demand (same aggregation the /api/demand/zones endpoint
    //    serves — imported directly, never fetched over HTTP) ──
    let demand = null;
    if (slug) {
      try {
        const agg = await aggregateDemand();
        const z = (agg.zones || []).find(e => e.key === slug);
        if (z) demand = { seekers: z.seekers, budgetAvg: z.budgetAvg };
      } catch (e) {
        console.warn('[valuation] demand unavailable:', e.message);
      }
    }

    const result = {
      ok: true,
      estimate,
      range: { min, max },
      pricePerSqm: Math.round(pricePerSqm * 100) / 100,
      compsCount: used.length,
      zoneLabel,
      citywide,
      demand,
    };

    // ── Lead capture (fire-and-forget — NEVER blocks/fails the response) ──
    const now = new Date();
    const summary =
      `Richiesta stima canone — Zona: ${zoneLabel} · ${mq} mq · ${camere} camere · ${bagni} bagni` +
      `${arredato ? ' · arredato' : ''} · condizione ${condizione}` +
      ` → stima ~€${estimate}/mese (range €${min}–€${max}, ${used.length} comparabili${citywide ? ', base cittadina' : ''}).`;
    const input = { zona: zonaRaw, mq, camere, bagni, arredato, condizione };
    const lead = {
      source: 'web',
      service: 'Stima Canone',
      leadType: 'landlord',
      name, email, phone: phone || null,
      message: summary,
      notes: summary,
      language: 'it',
      zone: zoneLabel,
      budget: estimate,
      intent: 'valuation',
      status: 'new',
      grade: null,
      propertyAddress: zoneLabel,
      ingestedBy: 'valuation-estimate',
      sourceRef: 'valuation-estimate',
      raw: {
        input,
        result: {
          estimate, min, max,
          pricePerSqm: result.pricePerSqm,
          compsCount: used.length,
          citywide,
        },
        ip,
      },
      createdAt: now,
      ingestedAt: now,
    };
    // The lead IS the product of this endpoint — await it before responding
    // (Vercel can freeze the instance once the response is sent, dropping
    // in-flight writes). Only the notification stays fire-and-forget, and a
    // failed write never blocks the estimate.
    try {
      const { id } = await fsCreate('leads', lead);
      logActivity('Lead da Stima Canone', 'lead', { leadId: id, zona: zoneLabel, budget: estimate }, 'valuation-estimate')
        .catch(() => {});
      fsCreate('agentNotifications', {
        type: 'lead.new',
        summary: `Lead da Stima Canone · ${name} · ${zoneLabel} · ${estimate}€`,
        priority: 'high',
        ref: { collection: 'leads', id },
        payload: { name, email, phone, zone: zoneLabel, budget: estimate, channel: 'valuation', source: 'valuation-estimate' },
        dedupKey: `lead-${id}`,
        status: 'pending',
        actor: 'valuation-estimate',
        createdAt: new Date().toISOString(),
        attempts: 0,
      }).catch(e => console.warn('[valuation] notify failed:', e.message));
    } catch (e) {
      console.error('[valuation] lead write failed:', e.message);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[valuation]', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
