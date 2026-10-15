// Lettura assistita di un annuncio esterno; nessuna scrittura o pubblicazione.
import { requireRole } from '../_auth.js';
import { readJson } from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';
import { parseListing } from '../pfs/_fetch.js';

async function getHtml(startUrl) {
  let url = startUrl;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BOOM/1.0)', 'Accept-Language': 'it,en;q=0.8' },
      signal: AbortSignal.timeout(8000),
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const next = RULES.normalizeUrl(new URL(r.headers.get('location') || '', url).toString());
      if (!next) return null;
      url = next.url;
      continue;
    }
    if (!r.ok || !/text\/html/i.test(r.headers.get('content-type') || '')) return null;
    const reader = r.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), url };
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireRole(req, res, ['admin']);
  if (!actor) return;
  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const source = RULES.normalizeUrl(body?.url);
  if (!source) return res.status(400).json({ ok: false, error: 'unsupported_listing_url' });
  try {
    const page = await getHtml(source.url);
    if (!page) return res.status(200).json({ ok: true, status: 'unavailable', source });
    const p = parseListing(page.html, page.url);
    const data = {
      title: RULES.cleanText(p.title, 130),
      price: RULES.positiveNumber(p.price, 1000000),
      sqm: RULES.positiveNumber(p.sqm, 100000),
      rooms: RULES.positiveNumber(p.bedrooms, 100),
    };
    const status = Object.values(data).some(Boolean) ? 'partial' : 'unavailable';
    return res.status(200).json({ ok: true, status, source, data });
  } catch {
    return res.status(200).json({ ok: true, status: 'unavailable', source });
  }
}
