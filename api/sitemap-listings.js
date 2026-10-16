// api/sitemap-listings.js
// Dynamic XML sitemap of every live listing, so search engines discover and
// crawl /listing/:id pages. Exposed at /listings-sitemap.xml (rewrite) and
// referenced from robots.txt.
//
// 15/10/2026 — chi entra si decide per CORSIA (js/dispo-engine.js), come la
// vetrina, l'inventario per le AI e il Segugio: una casa affittata che ha la
// data di rilascio dal contratto (availableFrom) si PRENOTA, quindi la sua
// pagina va trovata; una riservata o una affittata senza data no. Le schede
// nascoste/bozza/archiviate/fuori mercato restano fuori (sono noindex in
// api/listing.js: stessa lista). E lastmod legge anche timestampValue — il
// portal e il wizard scrivono timestamp, e la data spariva per le loro
// modifiche.

import DISPO from '../js/dispo-engine.js';

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';

// Stessa lista di api/listing.js (lì: noindex).
const HIDDEN = /hidden|draft|archived|off_market/i;

// Convert a Firestore REST value object into a plain JS value (same decoder
// as api/listing.js).
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

// The date a listing last changed: updatedAt (string or Firestore timestamp),
// then the document's own updateTime, then createdAt — cut to YYYY-MM-DD.
function lastmodOf(doc) {
  const f = doc.fields || {};
  const raw = (f.updatedAt && (f.updatedAt.stringValue || f.updatedAt.timestampValue))
    || doc.updateTime
    || (f.createdAt && (f.createdAt.stringValue || f.createdAt.timestampValue))
    || '';
  const m = String(raw).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

// Admin sign-in fallback, so the sitemap still lists pages if public reads are denied.
async function adminToken() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASS;
  if (!email || !password) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const d = await r.json();
    return d.idToken || null;
  } catch { return null; }
}

// Una lettura fallita non è un catalogo vuoto. Prima il guasto (5xx, 403
// senza credenziali admin, un'eccezione a metà giro) usciva come 200 con un
// <urlset> vuoto o parziale e s-maxage=3600 + swr=86400: una sola
// rivalidazione andata male sostituiva all'edge la sitemap buona con quella
// vuota per un giorno intero. Ora 503 + Retry-After e niente cache (come
// llms-listings): il crawler riprova, e l'edge tiene la copia buona.
function unavailable(res) {
  res.statusCode = 503;
  res.setHeader('Retry-After', '300');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.end('Listings sitemap temporarily unavailable.');
}

export default async function handler(req, res) {
  const urls = [];
  try {
    const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings?pageSize=300&key=${API_KEY}`;
    // tutte le pagine (nextPageToken): oltre 300 schede la prima sola
    // sarebbe una sitemap parziale servita come intera
    const docs = [];
    let token = null, pageToken = '';
    for (let page = 0; page < 20; page++) {
      const listUrl = base + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      let r = token ? await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } }) : await fetch(listUrl);
      if (r.status === 403 && !token) {
        token = await adminToken();
        if (token) r = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
      }
      if (!r.ok) return unavailable(res);
      const j = await r.json();
      for (const doc of j.documents || []) docs.push(doc);
      pageToken = j.nextPageToken || '';
      if (!pageToken) break;
    }
    if (pageToken) return unavailable(res); // più di 20 pagine: mai a metà
    for (const doc of docs) {
      const id = doc.name.split('/').pop();
      const f = doc.fields || {};
      const l = {};
      for (const k in f) l[k] = fv(f[k]);
      if (!l.name || !l.price) continue;
      if (HIDDEN.test(String(l.status || ''))) continue;
      if (DISPO.marketLane(l).lane === 'closed') continue;
      urls.push({ loc: 'https://www.boomrome.com/listing/' + encodeURIComponent(id), lastmod: lastmodOf(doc) });
    }
  } catch {
    // mai una sitemap parziale servita (e cacheata) come se fosse intera
    return unavailable(res);
  }

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          '  <url><loc>' + u.loc + '</loc>' +
          (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') +
          '<changefreq>weekly</changefreq><priority>0.8</priority></url>'
      )
      .join('\n') +
    '\n</urlset>\n';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.end(body);
}
