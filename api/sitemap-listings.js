// api/sitemap-listings.js
// Dynamic XML sitemap of every live listing, so search engines discover and
// crawl /listing/:id pages. Exposed at /listings-sitemap.xml (rewrite) and
// referenced from robots.txt. Skips rented / hidden / draft listings.

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';

const sv = (f, k) => (f && f[k] && f[k].stringValue) || '';

export default async function handler(req, res) {
  const urls = [];
  try {
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings?pageSize=300&key=${API_KEY}`
    );
    if (r.ok) {
      const j = await r.json();
      for (const doc of j.documents || []) {
        const id = doc.name.split('/').pop();
        const f = doc.fields || {};
        const status = (sv(f, 'status') || 'available').toLowerCase();
        if (/rented|affittato|off_market|hidden|draft|archived/.test(status)) continue;
        const updated = sv(f, 'updatedAt') || sv(f, 'createdAt') || '';
        const lastmod = /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : '';
        urls.push({ loc: 'https://www.boomrome.com/listing/' + encodeURIComponent(id), lastmod });
      }
    }
  } catch {
    /* return whatever we have (possibly empty) rather than error */
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
