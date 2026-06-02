// api/agent/radar.scan.js — Tool: agent.radar.scan  (Tier 1)
//
// Scans every enabled radarSearches doc (or a single one by id), diffs the
// results page against knownListings, and emits leads with source 'radar:<name>'
// for new listings and price drops — identical schema to the portal's
// scanRadarSearch() so dashboard + leads UI work uniformly.
//
// Body: { id?: string }    omit `id` to scan all enabled searches.
//
// Notes:
//   - Server-side fetch goes direct to immobiliare.it / idealista.it without
//     a CORS proxy. They may rate-limit aggressive callers; we honour a
//     simple per-call upper bound (10 deep-fetches) and a single User-Agent
//     header so requests look like a normal browser.
//   - This is the BACKGROUND path. The portal's client-side scanner still
//     works for interactive "Scansiona ora" clicks; both paths converge on
//     the same Firestore writes.

import { fsList, fsGet, fsPatch, fsCreate, logActivity, guardPost, okJson, errJson } from './_lib.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DEEP_CAP = 10;

async function fetchHtml(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'it,en;q=0.8' } });
    if (!r.ok) return null;
    const t = await r.text();
    return t && t.length > 200 ? t : null;
  } catch { return null; }
}

function extractUrls(html, portal) {
  const urls = new Set();
  let re;
  if (portal === 'immobiliare') re = /https?:\/\/www\.immobiliare\.it\/annunci\/\d+\/?/gi;
  else if (portal === 'idealista') re = /https?:\/\/www\.idealista\.it\/immobile\/\d+\/?/gi;
  else re = /https?:\/\/[^"'\s]+\/(?:annunci|immobile)\/\d+\/?/gi;
  let m; while ((m = re.exec(html)) && urls.size < 60) urls.add(m[0].replace(/\/$/, ''));
  if (portal === 'immobiliare') {
    const rel = /href="(\/annunci\/\d+\/?)"/gi; let r2;
    while ((r2 = rel.exec(html)) && urls.size < 60) urls.add('https://www.immobiliare.it' + r2[1].replace(/\/$/, ''));
  }
  return [...urls];
}

// Compact server-side parser — enough for radar diffing (price + title).
// The full client-side parsers stay in portal.html for the Finder UI.
function parseListing(html, url) {
  const out = { url, title: null, price: null, size: null, rooms: null, photo: null };
  // JSON-LD path (Immobiliare)
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const b of blocks) {
    try {
      const ld = JSON.parse(b.replace(/<script[^>]*>/, '').replace(/<\/script>/, ''));
      const item = Array.isArray(ld['@graph']) ? ld['@graph'].find(x => /Apartment|House|RealEstateListing|Residence/.test(x['@type'])) : ld;
      if (item) {
        out.title = out.title || item.name || null;
        if (item.offers?.price) out.price = parseInt(String(item.offers.price).replace(/\D/g, ''), 10);
        if (item.floorSize?.value) out.size = parseInt(item.floorSize.value, 10);
        if (item.numberOfRooms) out.rooms = parseInt(item.numberOfRooms, 10);
        if (item.image) out.photo = Array.isArray(item.image) ? item.image[0] : item.image;
        if (out.title && out.price) break;
      }
    } catch {}
  }
  // Regex fallbacks
  if (!out.title) { const m = html.match(/<h1[^>]*>(.*?)<\/h1>/s); if (m) out.title = m[1].replace(/<[^>]+>/g, '').trim().slice(0, 120); }
  if (!out.price) { const m = html.match(/€\s*([\d.]+)/); if (m) out.price = parseInt(m[1].replace(/\./g, ''), 10); }
  if (!out.size)  { const m = html.match(/(\d+)\s*m[²2]/); if (m) out.size = parseInt(m[1], 10); }
  return out;
}

async function scanOne(search) {
  const html = await fetchHtml(search.searchUrl);
  if (!html) return { ok: false, error: 'search_page_unreachable' };
  const portal = search.portal || 'immobiliare';
  const urls = extractUrls(html, portal);
  const known = { ...(search.knownListings || {}) };
  let newCount = 0, dropCount = 0, deep = 0;
  for (const url of urls) {
    const isNew = !known[url];
    if (isNew && deep < DEEP_CAP) {
      deep++;
      const detailHtml = await fetchHtml(url);
      const listing = detailHtml ? parseListing(detailHtml, url) : { url, title: 'Nuovo annuncio', price: null };
      known[url] = { price: listing.price || null, firstSeen: Date.now() };
      if (search.maxPrice && listing.price && listing.price > search.maxPrice) continue;
      newCount++;
      await fsCreate('leads', {
        name: listing.title || 'Nuovo annuncio',
        source: 'radar:' + (search.name || 'radar'),
        propertyTitle: listing.title || 'Nuovo annuncio',
        propertyPrice: listing.price || null,
        propertyUrl: url,
        zone: search.zone || null,
        size: listing.size || null, rooms: listing.rooms || null,
        photo: listing.photo || null,
        radarSearchId: search.id, status: 'new',
        ingestedBy: 'agent-radar', createdAt: new Date(),
      });
    } else if (isNew) {
      known[url] = { price: null, firstSeen: Date.now() };
    } else if (known[url]?.price && deep < DEEP_CAP) {
      deep++;
      const detailHtml = await fetchHtml(url);
      const listing = detailHtml ? parseListing(detailHtml, url) : null;
      if (listing?.price && listing.price < known[url].price) {
        const drop = known[url].price - listing.price;
        dropCount++;
        await fsCreate('leads', {
          name: listing.title || 'Calo prezzo',
          source: 'radar:' + (search.name || 'radar'),
          propertyTitle: listing.title || 'Calo prezzo',
          propertyPrice: listing.price, priceDrop: drop,
          propertyUrl: url, zone: search.zone || null,
          photo: listing.photo || null,
          radarSearchId: search.id, status: 'new',
          ingestedBy: 'agent-radar', createdAt: new Date(),
        });
        known[url].price = listing.price;
      }
    }
  }
  await fsPatch(`radarSearches/${search.id}`, {
    knownListings: known, lastScanAt: new Date(), lastFound: urls.length,
  });
  return { ok: true, total: urls.length, newCount, dropCount };
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  try {
    let searches;
    if (body.id) {
      const one = await fsGet(`radarSearches/${body.id}`);
      if (!one) return errJson(res, 404, 'search_not_found');
      searches = [one];
    } else {
      const all = await fsList('radarSearches', { limit: 50 });
      searches = all.filter(s => s.enabled !== false);
    }
    if (!searches.length) return okJson(res, { scanned: 0, totalNew: 0, totalDrops: 0 });
    let totalNew = 0, totalDrops = 0;
    const results = [];
    for (const s of searches) {
      const r = await scanOne(s);
      results.push({ id: s.id, name: s.name, ...r });
      if (r.ok) { totalNew += r.newCount; totalDrops += r.dropCount; }
    }
    await logActivity('Radar scansionato (agent)', 'radar', { searches: results.length, totalNew, totalDrops });
    return okJson(res, { scanned: results.length, totalNew, totalDrops, results });
  } catch (e) { return errJson(res, 500, e.message); }
}
