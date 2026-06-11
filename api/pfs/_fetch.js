// api/pfs/_fetch.js
// Server-side fetch + parse helpers for Immobiliare/Idealista pages.
// Mirrors api/agent/radar.scan.js parsing (JSON-LD first, regex fallback)
// and adds advertiser detection (privato vs agenzia) — BOOM's PFS outreach
// only targets private listings, agencies are filtered at ingestion.
//
// IMPORTANT: both portals run anti-bot protection and may 403 datacenter
// IPs. Every caller must treat a null return as "source temporarily
// unavailable", record it in pfsRadarHealth, and move on — the email-alert
// path (scan-inbox.js) is the load-bearing source, this is enrichment.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function fetchHtml(url, { timeoutMs = 8000 } = {}) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'it,en;q=0.8' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!r.ok) return null;
    const t = await r.text();
    return t && t.length > 200 ? t : null;
  } catch { return null; }
}

// Extract canonical listing URLs from a search-results page (or any HTML).
export function extractListingUrls(html, portal) {
  const urls = new Set();
  if (!html) return [];
  if (portal !== 'idealista') {
    let m;
    const abs = /https?:\/\/www\.immobiliare\.it\/annunci\/(\d+)\/?/gi;
    while ((m = abs.exec(html)) && urls.size < 60) urls.add('https://www.immobiliare.it/annunci/' + m[1] + '/');
    const rel = /href="\/annunci\/(\d+)\/?"/gi;
    while ((m = rel.exec(html)) && urls.size < 60) urls.add('https://www.immobiliare.it/annunci/' + m[1] + '/');
  }
  if (portal !== 'immobiliare') {
    let m;
    const abs = /https?:\/\/www\.idealista\.it\/immobile\/(\d+)\/?/gi;
    while ((m = abs.exec(html)) && urls.size < 60) urls.add('https://www.idealista.it/immobile/' + m[1] + '/');
    const rel = /href="\/immobile\/(\d+)\/?"/gi;
    while ((m = rel.exec(html)) && urls.size < 60) urls.add('https://www.idealista.it/immobile/' + m[1] + '/');
  }
  return [...urls];
}

// Compact detail-page parser — JSON-LD path (Immobiliare exposes it),
// regex fallbacks for everything else.
export function parseListing(html, url) {
  const out = { sourceUrl: url, title: null, price: null, sqm: null, bedrooms: null, images: [], description: null };
  if (!html) return out;
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const b of blocks) {
    try {
      const ld = JSON.parse(b.replace(/<script[^>]*>/, '').replace(/<\/script>/, ''));
      const item = Array.isArray(ld['@graph'])
        ? ld['@graph'].find(x => /Apartment|House|RealEstateListing|Residence/.test(x['@type']))
        : ld;
      if (item) {
        out.title = out.title || item.name || null;
        if (item.offers?.price) out.price = parseInt(String(item.offers.price).replace(/\D/g, ''), 10);
        if (item.floorSize?.value) out.sqm = parseInt(item.floorSize.value, 10);
        if (item.numberOfRooms) out.bedrooms = parseInt(item.numberOfRooms, 10);
        if (item.image) out.images = Array.isArray(item.image) ? item.image.slice(0, 10) : [item.image];
        if (item.description) out.description = String(item.description).slice(0, 800);
        if (out.title && out.price) break;
      }
    } catch { /* malformed JSON-LD block — try the next one */ }
  }
  if (!out.title) { const m = html.match(/<h1[^>]*>(.*?)<\/h1>/s); if (m) out.title = m[1].replace(/<[^>]+>/g, '').trim().slice(0, 120); }
  if (!out.price) { const m = html.match(/€\s*([\d.]+)/); if (m) out.price = parseInt(m[1].replace(/\./g, ''), 10); }
  if (!out.sqm)  { const m = html.match(/(\d+)\s*m[²2]/); if (m) out.sqm = parseInt(m[1], 10); }
  if (out.bedrooms == null) {
    const m = html.match(/(\d+)\s*(?:camer[ae]|local[ei]|cam\.)/i);
    if (m) out.bedrooms = parseInt(m[1], 10);
  }
  return out;
}

// Heuristic advertiser classification from a detail page.
// Returns 'private' | 'agency' | 'unknown'. Callers drop 'agency' and keep
// 'unknown' (flagged in the command center for VilaMan to verify) — better
// to over-deliver a doubtful listing than silently lose a private one.
export function detectAdvertiser(html, portal) {
  if (!html) return 'unknown';
  const h = html.slice(0, 400000);
  // Structured hints first (both portals embed advertiser type in page data)
  const m = h.match(/"(?:sellerType|advertiserType|contactType|userType)"\s*:\s*"([^"]+)"/i);
  if (m) {
    const v = m[1].toLowerCase();
    if (/(private|privato|particular)/.test(v)) return 'private';
    if (/(agency|agenzia|professional|pro)/.test(v)) return 'agency';
  }
  if (/annuncio\s+di\s+privato|inserzionista[^<]{0,40}privato|"isPrivate"\s*:\s*true/i.test(h)) return 'private';
  if (/agenzia\s+immobiliare|"isAgency"\s*:\s*true|class="[^"]*(?:agency|agenzia)[^"]*"/i.test(h)) return 'agency';
  if (portal === 'idealista' && /professionista|commercialName/i.test(h)) return 'agency';
  return 'unknown';
}
