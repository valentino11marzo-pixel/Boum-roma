// Motore di lettura condiviso tra la funzione Vercel e la prova locale.
import RULES from '../../js/smartlink-engine.js';
import { parseListing } from '../pfs/_fetch.js';

function sameRedirectListing(startUrl, nextUrl) {
  const start=new URL(startUrl), next=new URL(nextUrl);
  if(start.origin===next.origin && start.pathname===next.pathname) return true;
  const provider=RULES.SOURCES.find(({host})=>[host,'www.'+host].includes(start.hostname) &&
    [host,'www.'+host].includes(next.hostname));
  if(!provider) return false;
  if(start.pathname===next.pathname) return true;
  const route={
    'immobiliare.it':/^\/annunci\/(\d+)\/?$/,
    'idealista.it':/^\/immobile\/(\d+)\/?$/,
    'casa.it':/^\/immobili\/(\d+)\/?$/,
  }[provider.host];
  const id=route && start.pathname.match(route)?.[1];
  return !!id && id===next.pathname.match(route)?.[1];
}

async function getHtml(startUrl) {
  let url = startUrl;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BOOM/1.0)', 'Accept-Language': 'it,en;q=0.8' },
      signal: AbortSignal.timeout(8000),
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const location=r.headers.get('location');
      if(!location) return null;
      const next = RULES.normalizeUrl(new URL(location, url).toString());
      if (!next || !sameRedirectListing(startUrl,next.url)) return null;
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

export function parseSmartLinkPage(html,url) {
  const source=RULES.normalizeUrl(url);
  if(!source) return null;
  const p=parseListing(html,url);
  const data={title:RULES.cleanText(p.title,130),price:RULES.positiveNumber(p.price,1000000),
    sqm:RULES.positiveNumber(p.sqm,100000),rooms:RULES.positiveNumber(p.bedrooms,100)};
  let images=RULES.photoCandidates(html,source.source,p.images);
  if(source.source==='Subito') {
    // Solo la galleria dell'annuncio, mai foto dei suggerimenti o del venditore.
    const gallery=[...html.matchAll(/<figure\b[^>]*class=["'][^"']*carousel-cell[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi)].map(m=>m[0]).join('');
    images=RULES.photoCandidates(gallery,source.source);
    const price=html.match(/<p\b[^>]*class=["'][^"']*index-module_price__[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]?.replace(/<[^>]*>/g,'').match(/([\d.,]+)\s*(?:€|&euro;)/)?.[1];
    if(price) data.price=RULES.positiveNumber(price.replace(/\./g,'').replace(',','.'),1000000);
    const features=html.match(/<section\b[^>]*>[\s\S]{0,400}?Dati principali[\s\S]*?<\/section>/i)?.[0]?.replace(/<[^>]*>/g,' ') || '';
    data.sqm=RULES.positiveNumber(features.match(/(\d+)\s*m(?:q|²|2)/i)?.[1],100000);
    data.rooms=RULES.positiveNumber(features.match(/(\d+)\s*Locali/i)?.[1],100);
  }
  return {data,images};
}

export async function extractListing(rawUrl) {
  const source = RULES.normalizeUrl(rawUrl);
  if (!source) return { ok: false, error: 'unsupported_listing_url' };
  try {
    const page = await getHtml(source.url);
    if (!page) return { ok: true, status: 'unavailable', source };
    const {data,images}=parseSmartLinkPage(page.html,page.url);
    return { ok: true, status: Object.values(data).some(Boolean) || images.length ? 'partial' : 'unavailable', source, data, images };
  } catch {
    return { ok: true, status: 'unavailable', source };
  }
}
