// Motore di lettura condiviso tra la funzione Vercel e la prova locale.
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

export async function extractListing(rawUrl) {
  const source = RULES.normalizeUrl(rawUrl);
  if (!source) return { ok: false, error: 'unsupported_listing_url' };
  try {
    const page = await getHtml(source.url);
    if (!page) return { ok: true, status: 'unavailable', source };
    const p = parseListing(page.html, page.url);
    const data = {
      title: RULES.cleanText(p.title, 130),
      price: RULES.positiveNumber(p.price, 1000000),
      sqm: RULES.positiveNumber(p.sqm, 100000),
      rooms: RULES.positiveNumber(p.bedrooms, 100),
    };
    const images = RULES.photoCandidates(page.html, source.source, p.images);
    return { ok: true, status: Object.values(data).some(Boolean) || images.length ? 'partial' : 'unavailable', source, data, images };
  } catch {
    return { ok: true, status: 'unavailable', source };
  }
}
