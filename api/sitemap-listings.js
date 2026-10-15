// api/sitemap-listings.js
// Dynamic XML sitemap of every live listing, so search engines discover and
// crawl /listing/:id pages. Exposed at /listings-sitemap.xml (rewrite) and
// referenced from robots.txt. Only public, bookable homes belong here.

import DISPO from '../js/dispo-engine.js';
import { projectPublicListing } from './_public-listing.js';

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';

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
    default: return x;
  }
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

async function readAll(token) {
  const urls = [];
  let pageToken = '';
  do {
    const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}&key=${API_KEY}`;
    const r = await fetch(listUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) { const e = new Error('read_failed'); e.status = r.status; throw e; }
    const j = await r.json();
    for (const doc of j.documents || []) {
      if (!doc?.name) continue;
      const id = doc.name.split('/').pop();
      const raw = {};
      for (const [key, value] of Object.entries(doc.fields || {})) raw[key] = fv(value);
      const listing = projectPublicListing(id, raw);
      if (!listing || DISPO.marketLane(listing).lane === 'closed') continue;
      const updated = listing.updatedAt || listing.createdAt || '';
      const lastmod = /^\d{4}-\d{2}-\d{2}/.test(String(updated)) ? String(updated).slice(0, 10) : '';
      urls.push({ loc: 'https://www.boomrome.com/listing/' + encodeURIComponent(id), lastmod });
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return urls;
}

export default async function handler(req, res) {
  let urls = [];
  try {
    urls = await readAll(null);
  } catch (e) {
    if (e?.status === 403) {
      try { const token = await adminToken(); if (token) urls = await readAll(token); }
      catch { /* an empty sitemap is safer than a partial or private one */ }
    }
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
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120');
  res.end(body);
}
