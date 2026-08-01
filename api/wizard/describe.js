// api/wizard/describe.js
// AI listing-copy endpoint for the Telegram listing wizard bot.
//
// The bot can't call Claude directly (the ANTHROPIC_API_KEY lives only on
// Vercel, never on the Mac mini). This endpoint takes the structured listing
// the wizard has collected and returns a polished EN + IT description.
// Authed with the same shared secret as /api/wizard/publish.
//
// Method: POST
// Headers: X-Wizard-Secret (or X-Homie-Secret)
// Body:   { type, zone, address, sqm, floor, beds, bathrooms, furnished,
//           price, features[], availableDate, concordato }
// Response 200: { ok:true, en:"...", it:"..." }
//
// SWEEP — GET ?mode=sweep[&limit=N], auth like the other wizard crons (Vercel
// cron Bearer CRON_SECRET, X-Homie-Secret, or an admin Firebase ID token).
// A listing page with no text is invisible to search AND uncitable by AI
// answer engines, which reward specific facts and skip generic filler. On
// 2026-07-28 the live catalog had 10 listings with an EMPTY description and 10
// carrying the bot's fallback template — including raw database keys
// ("washing_machine", "double_glazing") served to crawlers verbatim through
// /llms-listings.txt. This closes both, nightly, without anyone typing.
//
// What it will NOT do: rewrite a human's words. Length is the wrong test —
// the real catalog's human descriptions run 67-203 chars while the template
// reaches 203, so a "too short" rule would delete "perfect for Luiss students"
// and keep "Features include ac, balcony". Only EMPTY text and the template's
// own signature qualify, and whatever is overwritten is kept in
// descriptionOriginal.

import { secretEqual, readJson, getAdminToken, fsList, fsPatch } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';

const MODEL = 'claude-haiku-4-5-20251001';

export const FEATURE_LABELS = {
  ac: 'air conditioning', elevator: 'elevator', balcony: 'balcony',
  terrace: 'terrace', washing_machine: 'washing machine', dishwasher: 'dishwasher',
  parking: 'parking space', storage: 'storage room', pets_allowed: 'pets allowed',
  wifi: 'WiFi included', double_glazing: 'double glazing', doorman: 'doorman',
};

// ── pure helpers (exported for tests) ───────────────────────────────────────

// The bot's fallback template, recognised by its own shape:
//   "Beautiful bilocale in Centro, 60sqm on floor 1, fully furnished. 3 beds,
//    1 bathroom. Features include ac, balcony, washing_machine. €1,500/month."
// Any ONE of these markers is conclusive — no human writes them, and every
// templated row in the live catalog carries at least the "Nsqm on floor" one.
export function isBoilerplate(text) {
  const t = String(text || '');
  if (!t.trim()) return false;                       // empty is its own case
  if (/\d+\s*sqm on floor/i.test(t)) return true;
  if (/\bFeatures include\b/i.test(t)) return true;
  // a raw database key that escaped into public copy
  return Object.keys(FEATURE_LABELS).some(k => k.includes('_') && t.includes(k));
}

// Why this listing needs copy — or null to leave it alone.
export function copyGap(l) {
  const status = String(l.status || 'available').toLowerCase();
  if (status !== 'available' && status !== 'waitlist') return null;  // not public
  const t = String(l.description || '').trim();
  if (!t) return 'missing';
  if (isBoilerplate(t)) return 'boilerplate';
  return null;                                       // human words: never touched
}

// Worst and most valuable first: a rentable page with NO text at all is both
// the biggest hole and the one being sold today. Ties keep document order.
export function copyOrder(candidates) {
  const rank = (c) => {
    const live = String(c.js.status || 'available').toLowerCase() === 'available' ? 0 : 2;
    return live + (copyGap(c.js) === 'missing' ? 0 : 1);
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b));
}

function checkSecret(req, res) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  if (!expected) { res.status(500).json({ ok: false, error: 'server_misconfigured: WIZARD_SECRET unset' }); return false; }
  if (!secretEqual(String(supplied || ''), expected)) { res.status(401).json({ ok: false, error: 'invalid_secret' }); return false; }
  return true;
}

// The facts block handed to the model. Exported so a test can prove the sweep
// never smuggles a raw database key into the prompt (and so from there into
// the public copy).
export function buildFacts(L) {
  const feats = Array.isArray(L.features) ? L.features.map(f => FEATURE_LABELS[f] || f) : [];
  const furnished = L.furnished === 'yes' ? 'fully furnished'
    : L.furnished === 'partial' ? 'partially furnished' : 'unfurnished';
  const facts = [
    `Type: ${L.type || 'apartment'}`,
    `Neighbourhood: ${L.zone || 'Rome'}`,
    L.address ? `Address: ${L.address}` : null,
    L.sqm ? `Size: ${L.sqm} sqm` : null,
    (L.floor != null && L.floor !== '') ? `Floor: ${L.floor}` : null,
    L.beds ? `Bedrooms: ${L.beds}` : null,
    L.bathrooms ? `Bathrooms: ${L.bathrooms}` : null,
    `Furnishing: ${furnished}`,
    L.price ? `Rent: €${L.price}/month` : null,
    L.availableDate ? `Available from: ${L.availableDate}` : null,
    (L.concordato === true) ? 'Rent-controlled (canone concordato) contract available' : null,
    feats.length ? `Features: ${feats.join(', ')}` : null,
  ].filter(Boolean).join('\n');
  return facts;
}

const SYSTEM = `You write listing descriptions for BOOM, a premium rental agency in Rome serving international tenants and remote workers. Voice: warm, concrete, trustworthy, understated. Rules: use ONLY the facts provided — never invent rooms, views, distances or amenities; avoid clichés ("nestled", "stunning", "heart of"); 3-4 sentences; one short line on what makes the neighbourhood appealing for a tenant. Return STRICT JSON only: {"en":"<English>","it":"<natural Italian, not a literal translation>"}.`;

// One AI call → { en, it }. Throws on transport/upstream failure so the caller
// decides what that means (a 502 for the bot, a skipped row for the sweep).
async function generateCopy(L, key) {
  const messages = [{ role: 'user', content: `Write the description for this apartment:\n\n${buildFacts(L)}` }];
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, messages }),
  });
  if (!upstream.ok) {
    const t = await upstream.text();
    console.error('[wizard/describe] anthropic', upstream.status, t.slice(0, 200));
    throw new Error('ai_failed');
  }
  const data = await upstream.json();
  const text = (data.content || []).map(b => b.text || '').join('').trim();
  let parsed;
  try {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    parsed = JSON.parse(a >= 0 && b > a ? text.slice(a, b + 1) : text);
  } catch { parsed = { en: text, it: '' }; }
  return { en: (parsed.en || '').trim(), it: (parsed.it || '').trim() };
}

// ── the nightly sweep: no public listing stays mute ─────────────────────────
async function sweep(key, limit) {
  const started = Date.now();
  const rows = await fsList('listings', { limit: 300 });
  const candidates = copyOrder((Array.isArray(rows) ? rows : [])
    .map(r => ({ id: r.id, js: r }))
    .filter(c => c.id && copyGap(c.js)));

  const written = [], failed = [];
  for (const c of candidates) {
    if (written.length >= limit) break;
    if (Date.now() - started > 42000) break;      // headroom inside the 60s budget
    const gap = copyGap(c.js);
    try {
      const { en, it } = await generateCopy(c.js, key);
      if (!en) { failed.push({ id: c.id, note: 'empty_copy' }); continue; }
      const patch = {
        description: en,
        descriptionSource: 'ai',
        descriptionAt: new Date().toISOString(),
      };
      if (it) patch.descriptionIt = it;
      // never lose what was there, even when it was only the template
      if (String(c.js.description || '').trim()) patch.descriptionOriginal = c.js.description;
      await fsPatch(`listings/${c.id}`, patch);
      written.push({ id: c.id, gap, chars: en.length });
    } catch (e) {
      failed.push({ id: c.id, note: String(e.message || e).slice(0, 80) });
    }
  }
  return {
    ok: true, mode: 'sweep', checked: (Array.isArray(rows) ? rows : []).length,
    candidates: candidates.length, written, failed,
    remaining: Math.max(0, candidates.length - written.length - failed.length),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wizard-Secret, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const q = req.query || {};
  const isSweep = req.method === 'GET' && q.mode === 'sweep';
  if (req.method !== 'POST' && !isSweep) return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // the sweep runs on cron/admin auth; the bot's POST keeps its shared secret
  if (isSweep) { if (!(await requireCronOrAdmin(req, res))) return; }
  else if (!checkSecret(req, res)) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });

  if (isSweep) {
    const limit = Math.max(1, Math.min(8, parseInt(q.limit, 10) || 6));
    try { return res.status(200).json(await sweep(key, limit)); }
    catch (e) {
      console.error('[wizard/describe] sweep', e);
      return res.status(500).json({ ok: false, error: 'internal', detail: String(e.message || '').slice(0, 120) });
    }
  }

  let L;
  try { L = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!L || typeof L !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  try {
    const { en, it } = await generateCopy(L, key);
    return res.status(200).json({ ok: true, en, it });
  } catch (e) {
    if (String(e.message) === 'ai_failed') return res.status(502).json({ ok: false, error: 'ai_failed' });
    console.error('[wizard/describe]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
