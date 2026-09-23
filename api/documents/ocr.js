// api/documents/ocr.js
// Server-side OCR + classification for an uploaded document. The admin
// calls it with a file URL (or inline base64); the server fetches
// the bytes, sends them to Claude, and returns extracted text + an inferred
// category + structured entities (dates, amounts, codice fiscale, IBAN,
// partita IVA). The Anthropic key stays server-side (never in the browser).
//
// SOLO ADMIN (22/09/2026). Il server scarica QUALSIASI `fileUrl` ricevuto
// (una SSRF a costo di chi la chiede) e spende credito Claude: aperto ai
// landlord, ogni account di proprietario che l'invito crea era una porta in
// più. Il proprietario non carica documenti dal portal (va su
// /proprietario, in sola lettura). tests/owner/security.mjs.
//
// Method:   POST
// URL:      /api/documents/ocr
// Headers:  Authorization: Bearer <firebase-id-token>
// Body:     { fileUrl } | { base64, mediaType }
// Response: { ok, category, text, entities }

import { requireRole, setCors } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import { modelJson } from '../_modeljson.js';
import { ai } from '../_ai.js';

// Il modello sta nel registro: js/ai-registry.js, scopo 'docs.ocr'.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const CATEGORIES = [
  'contract', 'rli_registration', 'cedolare', 'receipt', 'istat',
  'f24', 'imu', 'ape', 'visura', 'id_document', 'invoice', 'cin', 'other',
];

async function fetchAsBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch_file_failed_' + r.status);
  const ct = r.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('file_too_large');
  return { base64: buf.toString('base64'), mediaType: ct.split(';')[0] };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });
  }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }

  let base64, mediaType;
  try {
    if (body.fileUrl) {
      ({ base64, mediaType } = await fetchAsBase64(String(body.fileUrl)));
    } else if (body.base64 && body.mediaType) {
      base64 = String(body.base64); mediaType = String(body.mediaType);
    } else {
      return res.status(400).json({ ok: false, error: 'fileUrl_or_base64_required' });
    }
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }

  const isPdf = /pdf/.test(mediaType);
  const sourceBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const prompt = [
    'You are processing an Italian rental/tax document. Return ONLY a JSON object, no prose:',
    '{',
    '  "category": one of ' + JSON.stringify(CATEGORIES) + ',',
    '  "text": "<full extracted plain text>",',
    '  "entities": {',
    '    "dates": ["YYYY-MM-DD", ...],',
    '    "amounts": [<numbers in EUR>, ...],',
    '    "codiceFiscale": ["..."],',
    '    "iban": ["..."],',
    '    "partitaIva": ["..."],',
    '    "fiscalYear": <number or null>',
    '  }',
    '}',
    'Infer category from content (e.g. an RLI receipt -> "rli_registration", a rent receipt -> "receipt").',
  ].join('\n');

  try {
    let resp;
    try {
      resp = await ai({ purpose: 'docs.ocr', maxTokens: 2000, timeoutMs: 30000, json: true,
        messages: [{ role: 'user', content: [sourceBlock, { type: 'text', text: prompt }] }] });
    } catch (e) {
      console.error('[documents/ocr] ' + (e.code || e.message));
      return res.status(502).json({ ok: false, error: 'ocr_provider_error' });
    }
    const raw = resp.text;
    let parsed;
    try {
      parsed = modelJson(raw);
      if (!parsed) throw new Error('unreadable');
    } catch (_) {
      return res.status(200).json({ ok: true, category: 'other', text: raw, entities: {} });
    }
    const category = CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    return res.status(200).json({
      ok: true,
      category,
      text: typeof parsed.text === 'string' ? parsed.text.slice(0, 20000) : '',
      entities: parsed.entities || {},
    });
  } catch (e) {
    console.error('[documents/ocr]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
