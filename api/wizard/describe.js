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

import { secretEqual, readJson } from '../homie/_lib.js';

const MODEL = 'claude-haiku-4-5-20251001';

const FEATURE_LABELS = {
  ac: 'air conditioning', elevator: 'elevator', balcony: 'balcony',
  terrace: 'terrace', washing_machine: 'washing machine', dishwasher: 'dishwasher',
  parking: 'parking space', storage: 'storage room', pets_allowed: 'pets allowed',
  wifi: 'WiFi included', double_glazing: 'double glazing', doorman: 'doorman',
};

function checkSecret(req, res) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  if (!expected) { res.status(500).json({ ok: false, error: 'server_misconfigured: WIZARD_SECRET unset' }); return false; }
  if (!secretEqual(String(supplied || ''), expected)) { res.status(401).json({ ok: false, error: 'invalid_secret' }); return false; }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wizard-Secret, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!checkSecret(req, res)) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });

  let L;
  try { L = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!L || typeof L !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

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

  const SYSTEM = `You write listing descriptions for BOOM, a premium rental agency in Rome serving international tenants and remote workers. Voice: warm, concrete, trustworthy, understated. Rules: use ONLY the facts provided — never invent rooms, views, distances or amenities; avoid clichés ("nestled", "stunning", "heart of"); 3-4 sentences; one short line on what makes the neighbourhood appealing for a tenant. Return STRICT JSON only: {"en":"<English>","it":"<natural Italian, not a literal translation>"}.`;

  const messages = [{ role: 'user', content: `Write the description for this apartment:\n\n${facts}` }];

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, messages }),
    });
    if (!upstream.ok) {
      const t = await upstream.text();
      console.error('[wizard/describe] anthropic', upstream.status, t.slice(0, 200));
      return res.status(502).json({ ok: false, error: 'ai_failed' });
    }
    const data = await upstream.json();
    const text = (data.content || []).map(b => b.text || '').join('').trim();
    let parsed;
    try {
      const a = text.indexOf('{'), b = text.lastIndexOf('}');
      parsed = JSON.parse(a >= 0 && b > a ? text.slice(a, b + 1) : text);
    } catch { parsed = { en: text, it: '' }; }
    return res.status(200).json({ ok: true, en: (parsed.en || '').trim(), it: (parsed.it || '').trim() });
  } catch (e) {
    console.error('[wizard/describe]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
