// api/listing.js
// Server-renders /listing/:id by injecting per-listing SEO into the static
// apartment-detail.html template: <title>, description, canonical, Open Graph
// + Twitter cards, and Apartment/Offer/Breadcrumb JSON-LD.
//
// Why: the page's client-side updateSEO() only runs after JS executes, so
// social scrapers (WhatsApp/Facebook/X) and first-pass crawlers saw the
// generic default head. Now they get real listing data on the raw HTML.
// The client still re-applies the same tags on hydration (idempotent — it
// removes [data-seo-dynamic] before re-adding), so there is no duplication.
//
// Fully defensive: on any failure it serves the unmodified template (which
// still renders client-side), so a listing page can never break.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';

let TEMPLATE;
function readTemplate() {
  if (TEMPLATE !== undefined) return TEMPLATE;
  const candidates = [
    path.join(process.cwd(), 'apartment-detail.html'),
    path.join(__dirname, '..', 'apartment-detail.html'),
  ];
  for (const p of candidates) {
    try { TEMPLATE = fs.readFileSync(p, 'utf8'); return TEMPLATE; } catch { /* try next */ }
  }
  TEMPLATE = null;
  return TEMPLATE;
}

// Convert a Firestore REST value object into a plain JS value.
function fv(v) {
  if (v == null) return undefined;
  const k = Object.keys(v)[0];
  const x = v[k];
  switch (k) {
    case 'integerValue':
    case 'doubleValue': return Number(x);
    case 'booleanValue': return x;
    case 'nullValue': return null;
    case 'arrayValue': return ((x && x.values) || []).map(fv);
    case 'mapValue': {
      const o = {}; const f = (x && x.fields) || {};
      for (const kk in f) o[kk] = fv(f[kk]);
      return o;
    }
    default: return x; // stringValue, timestampValue, referenceValue, …
  }
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Numeric fields arrive dirty from Firestore ("1 bed", "30mq", 2) — extract
// the number or drop the field, so "1 bed bedroom" and NaN never ship.
const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return n > 0 ? n : null; };

function injectSeo(html, d, id) {
  const name = String(d.name || 'Apartment').trim();
  const zone = String(d.zone || d.neighborhood || '').trim();
  const sqm = num(d.sqm || d.size);
  const beds = num(d.beds || d.bedrooms);
  const baths = num(d.bathrooms);
  const price = d.price ? Number(d.price) : null;
  const canonical = 'https://www.boomrome.com/listing/' + encodeURIComponent(id);

  const title = [name, zone, 'Rome'].filter(Boolean).join(' — ') + ' | BOOM';

  const bits = [];
  if (sqm) bits.push(sqm + 'm²');
  if (beds) bits.push(beds > 1 ? beds + ' bedrooms' : beds + ' bedroom');
  if (zone) bits.push('in ' + zone);
  bits.push('verified by BOOM Rome');
  if (price) bits.push('from €' + price.toLocaleString('en-US') + '/mo');
  bits.push('legal contract, 48h move-in');
  const description = bits.join(', ') + '.';

  const images = Array.isArray(d.images) ? d.images.filter(Boolean) : [];
  const ogImage = images[0] || d.coverImage || d.image || 'https://www.boomrome.com/BOOMsocialprofile.png';

  const setName = (n, val) => {
    html = html.replace(new RegExp('<meta name="' + n + '" content="[^"]*">'),
      '<meta name="' + n + '" content="' + esc(val) + '">');
  };
  const setProp = (p, val) => {
    html = html.replace(new RegExp('<meta property="' + p + '" content="[^"]*">'),
      '<meta property="' + p + '" content="' + esc(val) + '">');
  };

  html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>');
  html = html.replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + esc(canonical) + '">');
  setName('description', description);
  setProp('og:title', title);
  setProp('og:description', description);
  setProp('og:url', canonical);
  setProp('og:image', ogImage);
  setProp('og:image:secure_url', ogImage);
  setProp('og:image:alt', title);
  setName('twitter:title', title);
  setName('twitter:description', description);
  setName('twitter:image', ogImage);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name,
    description: d.description ? String(d.description).slice(0, 300) : description,
    url: canonical,
    image: images.length ? images : [ogImage],
  };
  if (beds) ld.numberOfBedrooms = beds;
  if (baths) ld.numberOfBathroomsTotal = baths;
  if (sqm) ld.floorSize = { '@type': 'QuantitativeValue', value: sqm, unitCode: 'MTK' };
  ld.address = {
    '@type': 'PostalAddress',
    streetAddress: d.address || zone || 'Rome',
    addressLocality: 'Rome', addressRegion: 'Lazio', addressCountry: 'IT',
  };
  if (price) {
    const sold = /rented|affittato|off_market/.test(String(d.status || 'available').toLowerCase());
    ld.offers = {
      '@type': 'Offer', price, priceCurrency: 'EUR', url: canonical,
      availability: sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'EUR', unitText: 'MONTH' },
      seller: { '@id': 'https://www.boomrome.com/#organization' },
    };
    const af = String(d.availableFrom || d.availableDate || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(af) && af.slice(0, 10) > new Date().toISOString().slice(0, 10)) {
      ld.offers.availabilityStarts = af.slice(0, 10);
    }
  }
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.boomrome.com/' },
      { '@type': 'ListItem', position: 2, name: 'Apartments', item: 'https://www.boomrome.com/apartments' },
      { '@type': 'ListItem', position: 3, name, item: canonical },
    ],
  };
  const safe = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  // Preload the hero photo (sized like the client gallery: imgur 'h' = 1024px) so the
  // browser fetches it in parallel with the JS/Firestore boot instead of after it (LCP).
  const heroImg = images[0] || d.coverImage || d.image || '';
  const heroSized = /i\.imgur\.com/.test(heroImg)
    ? heroImg.replace(/(\/[A-Za-z0-9]{7})(\.(?:jpe?g|png|webp))/i, '$1h$2')
    : heroImg;
  const preload = heroImg ? '<link rel="preload" as="image" fetchpriority="high" href="' + esc(heroSized) + '">\n' : '';
  // Inject the already-read listing so the client renders instantly — no Firebase SDK
  // load + Firestore round-trip on the critical path. The client falls back to a live
  // read if this is absent (e.g. on /apartment-detail without SSR).
  const dataScript = '<script>window.__LISTING=' + safe(d) + ';window.__LISTING_ID=' + JSON.stringify(id) + ';</script>\n';
  const scripts = preload + dataScript +
    '<script type="application/ld+json" data-seo-dynamic>' + safe(ld) + '</script>\n' +
    '<script type="application/ld+json" data-seo-dynamic>' + safe(breadcrumb) + '</script>\n</head>';
  html = html.replace('</head>', scripts);

  // No-JS baseline for AI crawlers (GPTBot, ClaudeBot, PerplexityBot…) and
  // anyone with scripts off: the page body is a client-rendered shell, so
  // without this a non-executing crawler reads an empty page. Hidden whenever
  // JS runs — the hydrated page replaces it for humans.
  const waitlist = String(d.status || '').toLowerCase() === 'waitlist';
  const af2 = String(d.availableFrom || d.availableDate || '');
  const avail = waitlist
    ? 'Currently occupied — can be reserved ahead via waitlist.'
    : (/^\d{4}-\d{2}-\d{2}/.test(af2) && af2.slice(0, 10) > new Date().toISOString().slice(0, 10)
        ? 'Available from ' + af2.slice(0, 10) + '.'
        : 'Available now.');
  const facts = [];
  if (price) facts.push('<li>Monthly rent (all-in): €' + price.toLocaleString('en-US') + '</li>');
  facts.push('<li>' + esc(avail) + '</li>');
  if (sqm) facts.push('<li>Size: ' + esc(sqm) + ' m²</li>');
  if (beds) facts.push('<li>' + beds + (beds > 1 ? ' bedrooms' : ' bedroom') +
    (baths ? ' · ' + baths + (baths > 1 ? ' bathrooms' : ' bathroom') : '') + '</li>');
  if (d.videoUrl) facts.push('<li>Video tour available on this page</li>');
  facts.push('<li>Legal contract registered with the Agenzia delle Entrate · English support · 48h move-in</li>');
  const noscript = '<noscript><section style="max-width:720px;margin:40px auto;padding:0 20px;font-family:Helvetica,Arial,sans-serif">' +
    '<h1>' + esc(name) + (zone ? ' — ' + esc(zone) : '') + ', Rome</h1>' +
    (d.description ? '<p>' + esc(String(d.description).replace(/\s+/g, ' ').slice(0, 700)) + '</p>' : '') +
    '<ul>' + facts.join('') + '</ul>' +
    '<p>This page is interactive with JavaScript (photos, video, 3D map, online application). ' +
    'Without it: <a href="https://wa.me/393313251961">WhatsApp BOOM (English, 24/7)</a> · ' +
    '<a href="/apartments">all verified homes</a> · ' +
    '<a href="/llms-listings.txt">live inventory in markdown</a>.</p>' +
    '</section></noscript>';
  html = html.replace('<body>', '<body>\n' + noscript);

  return html;
}

// Admin sign-in → ID token, so we can still read when public rules are denied.
async function adminToken() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASS;
  if (!email || !password) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const d = await r.json();
    return d.idToken || null;
  } catch { return null; }
}

// Read one listing: unauthenticated first (fast), admin-authenticated on 403.
async function readListing(id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings/${encodeURIComponent(id)}?key=${API_KEY}`;
  let r = await fetch(url);
  if (r.status === 403) {
    const token = await adminToken();
    if (token) r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!r.ok) return null;
  const doc = await r.json();
  const f = doc.fields || {};
  const d = {};
  for (const k in f) d[k] = fv(f[k]);
  return d;
}

export default async function handler(req, res) {
  const id = ((req.query && req.query.id) || '').toString().trim();
  const html = readTemplate();

  if (!html) {
    // Template not bundled with the function — fall back to the static page.
    res.statusCode = 307;
    res.setHeader('Location', '/apartment-detail' + (id ? '?id=' + encodeURIComponent(id) : ''));
    return res.end();
  }

  let out = html;
  try {
    if (id) {
      const d = await readListing(id);
      if (d) out = injectSeo(html, d, id);
    }
  } catch {
    out = html; // serve the plain template on any error
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.end(out);
}
